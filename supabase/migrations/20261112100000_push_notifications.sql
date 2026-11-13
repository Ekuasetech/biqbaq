-- Phone notifications through the installable web app (owner's request of 2026-11-12, Q-66).
-- A person turns them on for each device; Biqbaq then sends a push for the same events that
-- ring the bell, plus each new message (grouped per conversation on the phone). By default,
-- messages and orders push and the rest do not, until the person chooses (owner's choice).
-- No quiet hours: phones have their own Do Not Disturb.

-- Each device that agreed to notifications. The address and keys come from the browser's
-- push service; they let Biqbaq send to that device only, and are not shown to anyone.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 40 and 200),
  auth text not null check (char_length(auth) between 10 and 100),
  label text not null default '' check (char_length(label) <= 120),
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);
create index push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon, authenticated;
-- No policies: people manage their own devices only through the functions below.

create table public.push_preferences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in ('messages', 'orders', 'applications', 'staff', 'shop')),
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);
alter table public.push_preferences enable row level security;
revoke all on public.push_preferences from public, anon, authenticated;

alter table public.background_jobs drop constraint background_jobs_type_check;
alter table public.background_jobs add constraint background_jobs_type_check check (type in ('email', 'push'));

-- Which group an event belongs to, for the person's push choices.
create function private.push_category(p_template text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_template in ('message_to_seller', 'message_to_buyer') then 'messages'
    when p_template like 'order\_%' or p_template like 'payments\_%' then 'orders'
    when p_template like 'application\_%' or p_template like 'role\_%' or p_template like 'verification\_%' then 'applications'
    when p_template like 'staff\_%' then 'staff'
    when p_template like 'product\_%' or p_template like 'shop\_%' or p_template like 'publishing\_%' or p_template like 'bulk\_email\_%' then 'shop'
  end;
$$;
revoke all on function private.push_category(text) from public;

-- Messages and orders are on until turned off; the rest are off until turned on.
create function private.push_wanted(p_user uuid, p_template text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.enabled from public.push_preferences p where p.user_id = p_user and p.category = private.push_category(p_template)),
    private.push_category(p_template) in ('messages', 'orders')
  )
  and private.push_category(p_template) is not null
  and exists (select 1 from public.push_subscriptions s where s.user_id = p_user);
$$;
revoke all on function private.push_wanted(uuid, text) from public;

-- Queues one push, if the person has a device and wants this kind.
create function private.queue_push(p_user uuid, p_template text, p_data jsonb, p_key text, p_tag text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null or not private.push_wanted(p_user, p_template) then
    return;
  end if;
  insert into public.background_jobs (type, user_id, payload, idempotency_key)
  values ('push', p_user, jsonb_build_object('template', p_template, 'data', coalesce(p_data, '{}'::jsonb), 'tag', p_tag), 'push:' || p_key)
  on conflict (idempotency_key) do nothing;
end;
$$;
revoke all on function private.queue_push(uuid, text, jsonb, text, text) from public;

-- The one place events are announced: the bell, the push, then the email. Messages push from
-- their own trigger below, once per message rather than once an hour like their email.
create or replace function private.enqueue_email(p_user uuid, p_template text, p_data jsonb, p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.add_notification(p_user, p_template, p_data, p_key);
  if private.push_category(p_template) is distinct from 'messages' then
    perform private.queue_push(p_user, p_template, p_data, p_key);
  end if;
  if not private.setting_is_on('email.notifications_enabled') then
    return;
  end if;
  insert into public.background_jobs (type, user_id, payload, idempotency_key)
  values ('email', p_user, jsonb_build_object('template', p_template, 'data', p_data), p_key)
  on conflict (idempotency_key) do nothing;
end;
$$;

-- Every new message pushes to the other side, tagged with its conversation so the phone shows
-- one notification per conversation, replaced by the newest.
create function private.push_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations;
  v_recipient uuid;
  v_shop text;
begin
  select * into v_conversation from public.conversations where id = new.conversation_id;
  select owner_user_id, name into v_recipient, v_shop from public.sellers where id = v_conversation.seller_id;
  if new.sender_side = 'seller' then
    v_recipient := v_conversation.buyer_id;
  end if;
  perform private.queue_push(
    v_recipient,
    case when new.sender_side = 'seller' then 'message_to_buyer' else 'message_to_seller' end,
    jsonb_build_object('shop', v_shop, 'conversation', new.conversation_id),
    'message:' || new.id,
    'conversation:' || new.conversation_id
  );
  return null;
end;
$$;
revoke all on function private.push_new_message() from public;
create trigger push_new_message after insert on public.messages
  for each row execute function private.push_new_message();

-- A person adds this device. The same device moving to another account is moved with it.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_label text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_active_account();
begin
  if coalesce(p_endpoint, '') !~ '^https://' or char_length(p_endpoint) > 1000
    or char_length(coalesce(p_p256dh, '')) not between 40 and 200 or char_length(coalesce(p_auth, '')) not between 10 and 100 then
    raise exception 'DETAILS_INVALID' using errcode = '23514';
  end if;
  if (select count(*) from public.push_subscriptions where user_id = v_user and endpoint <> p_endpoint) >= 10 then
    raise exception 'TOO_MANY_DEVICES' using errcode = '55000';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, label)
  values (v_user, p_endpoint, p_p256dh, p_auth, left(btrim(coalesce(p_label, '')), 120))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, label = excluded.label;
end;
$$;
revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- A person removes one device: only ever their own.
create function public.remove_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;
revoke execute on function public.remove_push_subscription(text) from public, anon;
grant execute on function public.remove_push_subscription(text) to authenticated;

create function public.my_push_devices()
returns table (endpoint text, label text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.endpoint, s.label, s.created_at from public.push_subscriptions s where s.user_id = auth.uid() order by s.created_at;
$$;
revoke execute on function public.my_push_devices() from public, anon;
grant execute on function public.my_push_devices() to authenticated;

create function public.my_push_preferences()
returns table (category text, enabled boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.category, coalesce(p.enabled, c.category in ('messages', 'orders'))
  from (values ('messages', 1), ('orders', 2), ('applications', 3), ('staff', 4), ('shop', 5)) as c (category, n)
  left join public.push_preferences p on p.user_id = auth.uid() and p.category = c.category
  where auth.uid() is not null
  order by c.n;
$$;
revoke execute on function public.my_push_preferences() from public, anon;
grant execute on function public.my_push_preferences() to authenticated;

create function public.set_push_preference(p_category text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_active_account();
begin
  if p_category is null or p_category not in ('messages', 'orders', 'applications', 'staff', 'shop') or p_enabled is null then
    raise exception 'DETAILS_INVALID' using errcode = '23514';
  end if;
  insert into public.push_preferences (user_id, category, enabled) values (v_user, p_category, p_enabled)
  on conflict (user_id, category) do update set enabled = excluded.enabled, updated_at = now();
end;
$$;
revoke execute on function public.set_push_preference(text, boolean) from public, anon;
grant execute on function public.set_push_preference(text, boolean) to authenticated;

-- Server only: the next pushes to send, with the person's language and devices. The same
-- steps as for emails: a stopped worker's push is retried, until it runs out of attempts.
create function public.claim_push_jobs(p_limit integer default 20)
returns table (job_id uuid, template text, data jsonb, tag text, locale text, devices jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.background_jobs b
  set status = 'dead', last_error = 'WORKER_STOPPED', locked_until = null
  where b.type = 'push' and b.status = 'running' and b.locked_until < now() and b.attempts >= b.max_attempts;

  return query
  with ready as (
    select b.id from public.background_jobs b
    where b.type = 'push'
      and ((b.status in ('queued', 'failed') and b.run_at <= now()) or (b.status = 'running' and b.locked_until < now()))
    order by b.run_at
    limit greatest(least(coalesce(p_limit, 20), 100), 1)
    for update skip locked
  ), claimed as (
    update public.background_jobs b
    set status = 'running', attempts = b.attempts + 1, locked_until = now() + interval '2 minutes'
    from ready
    where b.id = ready.id
    returning b.id, b.user_id, b.payload
  )
  select c.id, c.payload ->> 'template', c.payload -> 'data', c.payload ->> 'tag', coalesce(p.locale, 'en'),
    coalesce((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
      from public.push_subscriptions s where s.user_id = c.user_id), '[]'::jsonb)
  from claimed c
  left join public.profiles p on p.id = c.user_id;
end;
$$;
revoke execute on function public.claim_push_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_push_jobs(integer) to service_role;

-- Server only: a device the push service says is gone (uninstalled, or permission withdrawn).
create function public.forget_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;
revoke execute on function public.forget_push_subscription(text) from public, anon, authenticated;
grant execute on function public.forget_push_subscription(text) to service_role;

-- Server only: a device that received a push.
create function public.touch_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.push_subscriptions set last_sent_at = now() where endpoint = p_endpoint;
$$;
revoke execute on function public.touch_push_subscription(text) from public, anon, authenticated;
grant execute on function public.touch_push_subscription(text) to service_role;
