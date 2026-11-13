-- New blog posts are emailed to Biqbaq's own list (owner's request, 2026-11-13, Q-68). The
-- email's subject is the post's title. Super Admin chooses with a tick box when publishing,
-- ticked by default; a scheduled post is emailed when it goes live. Only confirmed
-- subscribers get it (Q-42, CASL). When the list is larger than the daily allowance
-- (bulk_email.max_recipients_per_day, which also keeps Biqbaq within Resend's daily limit),
-- the rest are sent on the following days at 9:00 Toronto time, so everyone gets it.
-- A post is emailed once: unpublishing and publishing it again does not send it again.

alter table public.blog_posts
  -- Super Admin's choice, kept until the post goes live.
  add column email_list boolean not null default false,
  add column emailed_at timestamptz,
  add column email_recipients integer,
  -- Why nobody was emailed, when that happened.
  add column email_skipped text check (email_skipped in ('no_address', 'no_subscribers', 'email_off'));

-- Each day's share of a post's email is kept like a bulk email, dated the day it goes, so the
-- daily allowance counts it on that day.
alter table public.email_campaigns add column blog_post_id uuid references public.blog_posts (id) on delete set null;

-- What one list has sent, or will send, today. Blog emails count towards the people a day,
-- but not towards the one bulk email a day, so a new post never stops Super Admin's own news.
create or replace function private.list_sent_today(p_list uuid)
returns table (campaigns integer, recipients integer)
language sql
stable
security definer
set search_path = ''
as $$
  select (count(*) filter (where blog_post_id is null))::integer, coalesce(sum(recipients), 0)::integer from public.email_campaigns
  where list_id = p_list
    and created_at >= ((now() at time zone 'America/Toronto')::date::timestamp at time zone 'America/Toronto')
    and created_at < (((now() at time zone 'America/Toronto')::date + 1)::timestamp at time zone 'America/Toronto');
$$;

-- Queues the email for every post that is live, ticked and not yet emailed. Called on
-- publishing, and by the email worker each time it runs, which catches scheduled posts.
create function private.queue_due_blog_emails()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.blog_posts;
  v_list public.email_lists;
  v_limit integer := greatest(coalesce(private.setting_integer('bulk_email.max_recipients_per_day'), 100), 1);
  v_used integer;
  v_count integer;
  v_today date := (now() at time zone 'America/Toronto')::date;
  v_day record;
begin
  for v_post in
    select * from public.blog_posts p
    where p.email_list and p.emailed_at is null and p.status = 'published' and p.publish_at <= now()
    order by p.publish_at
    for update skip locked
  loop
    insert into public.email_lists (owner_type, enabled) values ('platform', true) on conflict do nothing;
    select * into v_list from public.email_lists where owner_type = 'platform' for update;

    if not private.setting_is_on('email.notifications_enabled') then
      update public.blog_posts set emailed_at = now(), email_recipients = 0, email_skipped = 'email_off' where id = v_post.id;
      continue;
    end if;
    -- Every bulk email must give the sender's mailing address (CASL).
    if v_list.mailing_address is null then
      update public.blog_posts set emailed_at = now(), email_recipients = 0, email_skipped = 'no_address' where id = v_post.id;
      continue;
    end if;
    select count(*)::integer into v_count from public.list_subscribers where list_id = v_list.id and status = 'confirmed';
    if v_count = 0 then
      update public.blog_posts set emailed_at = now(), email_recipients = 0, email_skipped = 'no_subscribers' where id = v_post.id;
      continue;
    end if;

    select recipients into v_used from private.list_sent_today(v_list.id);
    -- Day 0 is today, with what is left of today's allowance; then a full allowance a day.
    for v_day in
      with numbered as (
        select s.*, (v_used + row_number() over (order by s.confirmed_at nulls last, s.id) - 1) / v_limit as day
        from public.list_subscribers s
        where s.list_id = v_list.id and s.status = 'confirmed'
      )
      select n.day, count(*)::integer as people,
        case when n.day = 0 then now()
          else ((v_today + n.day::integer)::timestamp + interval '9 hours') at time zone 'America/Toronto' end as send_at
      from numbered n group by n.day order by n.day
    loop
      insert into public.email_campaigns (list_id, subject, body, recipients, created_by, blog_post_id, created_at)
      values (v_list.id, left(v_post.title, 150), coalesce(nullif(left(btrim(v_post.excerpt), 5000), ''), v_post.title), v_day.people, v_post.author_id, v_post.id, v_day.send_at);
    end loop;

    insert into public.background_jobs (type, user_id, payload, idempotency_key, run_at)
    select 'email', null,
      jsonb_build_object('template', 'blog_post', 'to', n.email,
        'data', jsonb_build_object('shop', 'Biqbaq', 'post', v_post.id, 'subject', v_post.title, 'body', v_post.excerpt,
          'slug', v_post.slug, 'cover', v_post.cover_url, 'address', v_list.mailing_address, 'token', n.token,
          'source', case when n.consent_basis = 'implied' then 'customer' when n.source = 'self' then 'self' else 'added' end,
          'locale', coalesce((select locale from public.profiles where id = n.user_id), 'en'))),
      'blog_post:' || v_post.id || ':' || n.id,
      case when n.day = 0 then now()
        else ((v_today + n.day::integer)::timestamp + interval '9 hours') at time zone 'America/Toronto' end
    from (
      select s.*, (v_used + row_number() over (order by s.confirmed_at nulls last, s.id) - 1) / v_limit as day
      from public.list_subscribers s
      where s.list_id = v_list.id and s.status = 'confirmed'
    ) n
    on conflict (idempotency_key) do nothing;

    update public.blog_posts set emailed_at = now(), email_recipients = v_count, email_skipped = null where id = v_post.id;
    perform private.write_audit('blog.email', 'blog_post', v_post.id::text, null,
      jsonb_build_object('title', v_post.title, 'recipients', v_count, 'days', ((v_used + v_count - 1) / v_limit) + 1));
  end loop;
end;
$$;
revoke all on function private.queue_due_blog_emails() from public;

-- Someone who leaves the list, bounces or complains is not sent what was waiting for them,
-- such as tomorrow's share of a blog email.
create function private.drop_waiting_list_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.background_jobs
  set status = 'dead', last_error = 'NOT_SUBSCRIBED', locked_until = null
  where type = 'email' and status in ('queued', 'failed') and payload ->> 'to' = old.email
    and payload -> 'data' ->> 'token' = old.token;
  return null;
end;
$$;
revoke all on function private.drop_waiting_list_emails() from public;
create trigger drop_waiting_list_emails after update of status on public.list_subscribers
  for each row when (old.status = 'confirmed' and new.status <> 'confirmed')
  execute function private.drop_waiting_list_emails();

-- Publishing gains the tick box. Only Super Admin, who owns Biqbaq's list, may tick it.
drop function public.set_blog_post_status(uuid, text, timestamptz);
create function public.set_blog_post_status(p_id uuid, p_status text, p_publish_at timestamptz default null, p_email_list boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.blog_posts;
  v_when timestamptz := coalesce(p_publish_at, now());
begin
  perform private.require_blog_manager();
  if p_status is null or p_status not in ('draft', 'published', 'archived') then
    raise exception 'INVALID_STATUS' using errcode = '23514';
  end if;
  if coalesce(p_email_list, false) and not private.is_super_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  select * into v_post from public.blog_posts where id = p_id for update;
  if not found then
    raise exception 'POST_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_status = 'published' then
    if btrim(v_post.excerpt) = '' or btrim(v_post.body) = '' or v_post.category_id is null or v_post.cover_url is null then
      raise exception 'POST_INCOMPLETE' using errcode = '23514';
    end if;
    if v_when < now() - interval '1 minute' and v_post.first_published_at is null then
      raise exception 'PUBLISH_DATE_IN_PAST' using errcode = '23514';
    end if;
    update public.blog_posts set status = 'published', publish_at = v_when,
      first_published_at = coalesce(first_published_at, v_when),
      -- Once emailed, the choice no longer matters.
      email_list = case when emailed_at is null then coalesce(p_email_list, false) else email_list end
    where id = p_id;
  else
    if v_post.status = p_status then
      raise exception 'INVALID_STATUS_CHANGE' using errcode = '55000';
    end if;
    update public.blog_posts set status = p_status where id = p_id;
    -- A post taken down is not sent on later days: its link would lead nowhere.
    update public.background_jobs
    set status = 'dead', last_error = 'POST_WITHDRAWN', locked_until = null
    where type = 'email' and status in ('queued', 'failed') and payload ->> 'template' = 'blog_post'
      and payload -> 'data' ->> 'post' = p_id::text;
  end if;
  perform private.write_audit(
    case when p_status = 'published' and v_when > now() then 'blog.schedule' else 'blog.' || case p_status when 'published' then 'publish' when 'draft' then 'unpublish' else 'archive' end end,
    'blog_post', p_id::text, null, jsonb_build_object('title', v_post.title, 'publish_at', v_when, 'email_list', coalesce(p_email_list, false)));
  if p_status = 'published' then
    perform private.queue_due_blog_emails();
  end if;
end;
$$;
revoke execute on function public.set_blog_post_status(uuid, text, timestamptz, boolean) from public, anon;
grant execute on function public.set_blog_post_status(uuid, text, timestamptz, boolean) to authenticated;

-- The editor also learns whether this person may email the list, and how many it would reach.
create or replace function public.get_blog_post_for_editing(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_post public.blog_posts;
  v_list public.email_lists;
begin
  perform private.require_blog_manager();
  select * into v_post from public.blog_posts where id = p_id;
  if not found then
    raise exception 'POST_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v_list from public.email_lists where owner_type = 'platform';
  return to_jsonb(v_post) - 'cover_public_id' || jsonb_build_object(
    'category_slug', (select slug from public.blog_categories where id = v_post.category_id),
    'tags', coalesce((select jsonb_agg(tg.name order by tg.name) from public.blog_post_tags pt join public.blog_tags tg on tg.id = pt.tag_id where pt.post_id = p_id), '[]'::jsonb),
    'list_email', case when private.is_super_admin() then jsonb_build_object(
      'subscribers', (select count(*) from public.list_subscribers s where s.list_id = v_list.id and s.status = 'confirmed'),
      'has_address', v_list.mailing_address is not null,
      'per_day', private.setting_integer('bulk_email.max_recipients_per_day')) end
  );
end;
$$;

-- The email worker also queues scheduled posts' emails once they go live.
create or replace function public.claim_email_jobs(p_limit integer default 10)
returns table (
  job_id uuid,
  template text,
  data jsonb,
  recipient_email text,
  recipient_name text,
  recipient_locale text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.setting_is_on('email.notifications_enabled') then
    return;
  end if;
  perform private.queue_due_blog_emails();

  -- A worker that stopped mid-send has used this attempt. Out of attempts means stop here.
  update public.background_jobs b
  set status = 'dead', last_error = 'WORKER_STOPPED', locked_until = null
  where b.type = 'email' and b.status = 'running' and b.locked_until < now() and b.attempts >= b.max_attempts;

  return query
  with ready as (
    select b.id from public.background_jobs b
    where b.type = 'email'
      and ((b.status in ('queued', 'failed') and b.run_at <= now()) or (b.status = 'running' and b.locked_until < now()))
    order by b.run_at
    limit greatest(least(coalesce(p_limit, 10), 50), 1)
    for update skip locked
  ), claimed as (
    update public.background_jobs b
    set status = 'running', attempts = b.attempts + 1, locked_until = now() + interval '5 minutes'
    from ready
    where b.id = ready.id
    returning b.id, b.user_id, b.payload
  )
  select c.id, c.payload ->> 'template', c.payload -> 'data', coalesce(u.email::text, c.payload ->> 'to'), p.display_name, p.locale
  from claimed c
  left join auth.users u on u.id = c.user_id
  left join public.profiles p on p.id = c.user_id;
end;
$$;

-- Bounces and spam complaints on blog emails count against the address, as for bulk email.
create or replace function public.record_email_event(p_message_id text, p_event text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_subscriber uuid;
  v_list uuid;
begin
  if p_event not in ('complained', 'bounced') then
    return 'ignored';
  end if;
  select idempotency_key into v_key from public.background_jobs where provider_message_id = p_message_id limit 1;
  -- Only emails to a list are counted: bulk and single emails, 'campaign:<campaign>:<subscriber>',
  -- and new blog posts, 'blog_post:<post>:<subscriber>' (Q-68).
  if v_key is null or v_key !~ '^(campaign|blog_post):[0-9a-f-]{36}:[0-9a-f-]{36}$' then
    return 'ignored';
  end if;
  v_subscriber := split_part(v_key, ':', 3)::uuid;
  if p_event = 'complained' then
    update public.list_subscribers
    set complained_at = coalesce(complained_at, now()), status = 'unsubscribed', unsubscribed_at = coalesce(unsubscribed_at, now())
    where id = v_subscriber returning list_id into v_list;
  else
    update public.list_subscribers set bounced_at = coalesce(bounced_at, now()), status = 'bounced'
    where id = v_subscriber and status <> 'unsubscribed' returning list_id into v_list;
    if v_list is null then
      update public.list_subscribers set bounced_at = coalesce(bounced_at, now()) where id = v_subscriber returning list_id into v_list;
    end if;
  end if;
  if v_list is null then
    return 'ignored';
  end if;
  perform private.check_list_health(v_list);
  return 'recorded';
end;
$$;
