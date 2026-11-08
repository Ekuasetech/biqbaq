-- In-app notifications and email preferences (PRD §9.1, §18.2), with the owner's decisions
-- of 2026-11-08: everything that emails also appears under the bell, except new messages,
-- which keep their own count (Q-38); people can turn off only message and staff emails
-- (Q-39); notifications are kept for 90 days (Q-40).

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- The email template's name, so the bell and the email always describe the same event.
  type text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  idempotency_key text not null unique
);
create index notifications_user on public.notifications (user_id, created_at desc);

create table public.notification_preferences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in ('messages', 'staff')),
  email_enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

-- People read their own notifications directly, which is also what Realtime checks.
-- Every change goes through the functions below.
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
revoke all on public.notifications, public.notification_preferences from public, anon, authenticated;
grant select on public.notifications to authenticated;
create policy "people read their own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());

alter publication supabase_realtime add table public.notifications;

-- Which emails a person may turn off (Q-39). Anything else always goes out.
create function private.email_category(p_template text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_template in ('message_to_seller', 'message_to_buyer') then 'messages'
    when p_template like 'staff\_%' then 'staff'
  end;
$$;

create function private.add_notification(p_user uuid, p_type text, p_data jsonb, p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Messages have their own unread count (Q-38).
  if p_user is null or private.email_category(p_type) = 'messages' then
    return;
  end if;
  insert into public.notifications (user_id, type, data, idempotency_key)
  values (p_user, p_type, coalesce(p_data, '{}'::jsonb), p_key)
  on conflict (idempotency_key) do nothing;
  -- Kept for 90 days, read or not (Q-40). The audit log is the lasting record.
  delete from public.notifications where user_id = p_user and created_at < now() - interval '90 days';
end;
$$;
revoke all on function private.add_notification(uuid, text, jsonb, text) from public;

-- The one place events are announced: the bell first, whatever the email settings, then the email.
create or replace function private.enqueue_email(p_user uuid, p_template text, p_data jsonb, p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.add_notification(p_user, p_template, p_data, p_key);
  if not private.setting_is_on('email.notifications_enabled') then
    return;
  end if;
  insert into public.background_jobs (type, user_id, payload, idempotency_key)
  values ('email', p_user, jsonb_build_object('template', p_template, 'data', p_data), p_key)
  on conflict (idempotency_key) do nothing;
end;
$$;

-- Checked as each email is queued, however it was queued, so no path can skip a person's choice.
create function private.respect_email_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'email' and new.user_id is not null and exists (
    select 1 from public.notification_preferences p
    where p.user_id = new.user_id and p.category = private.email_category(new.payload ->> 'template') and not p.email_enabled
  ) then
    return null;
  end if;
  return new;
end;
$$;
revoke all on function private.respect_email_preferences() from public;
create trigger respect_email_preferences before insert on public.background_jobs
  for each row execute function private.respect_email_preferences();

-- Staff invitations queue their email directly, as the invitee may not have an account.
-- One who does also sees it under the bell.
create function private.notify_staff_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  select id into v_user from auth.users where lower(email) = new.invitee_email;
  if v_user is not null and exists (select 1 from public.profiles where id = v_user) then
    perform private.add_notification(v_user, 'staff_invitation',
      jsonb_build_object('shop', (select name from public.sellers where id = new.seller_id)), 'staff_invite:' || new.id);
  end if;
  return null;
end;
$$;
revoke all on function private.notify_staff_invitation() from public;
create trigger notify_staff_invitation after insert on public.seller_invitations
  for each row execute function private.notify_staff_invitation();

create function public.my_notifications(p_before timestamptz default null, p_limit integer default 20)
returns table (id uuid, type text, data jsonb, read_at timestamptz, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.type, n.data, n.read_at, n.created_at
  from public.notifications n
  where n.user_id = auth.uid() and n.created_at > now() - interval '90 days'
    and (p_before is null or n.created_at < p_before)
  order by n.created_at desc
  limit greatest(least(coalesce(p_limit, 20), 50), 1);
$$;

create function public.unread_notification_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.notifications
  where user_id = auth.uid() and read_at is null and created_at > now() - interval '90 days';
$$;

-- Marks the given notifications read, or all of them when none are given.
create function public.mark_notifications_read(p_ids uuid[] default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_active_account();
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
end;
$$;

create function public.my_notification_preferences()
returns table (category text, email_enabled boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.category, coalesce(p.email_enabled, true)
  from (values ('messages'), ('staff')) as c (category)
  left join public.notification_preferences p on p.user_id = auth.uid() and p.category = c.category
  where auth.uid() is not null;
$$;

create function public.set_notification_preference(p_category text, p_email_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_active_account();
begin
  if p_category is null or p_category not in ('messages', 'staff') or p_email_enabled is null then
    raise exception 'DETAILS_INVALID' using errcode = '23514';
  end if;
  insert into public.notification_preferences (user_id, category, email_enabled)
  values (v_user, p_category, p_email_enabled)
  on conflict (user_id, category) do update set email_enabled = excluded.email_enabled, updated_at = now();
end;
$$;

revoke execute on function public.my_notifications(timestamptz, integer) from public, anon;
grant execute on function public.my_notifications(timestamptz, integer) to authenticated;
revoke execute on function public.unread_notification_count() from public, anon;
grant execute on function public.unread_notification_count() to authenticated;
revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
revoke execute on function public.my_notification_preferences() from public, anon;
grant execute on function public.my_notification_preferences() to authenticated;
revoke execute on function public.set_notification_preference(text, boolean) from public, anon;
grant execute on function public.set_notification_preference(text, boolean) to authenticated;
