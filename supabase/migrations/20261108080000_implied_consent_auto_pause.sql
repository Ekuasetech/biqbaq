-- Owner's changes of 2026-11-08 to customer emails:
-- 1. Adding clients sends no email. A client ticked "Send updates" receives the shop's bulk
--    email at once, on the seller's word that they are existing customers: CASL's implied
--    consent (bought in the last two years, or enquired in the last six months). Q-53.
-- 2. A seller can email one client, as well as all of them. Q-54.
-- 3. To protect the one Resend account every Biqbaq email shares, a shop's bulk email pauses
--    by itself on spam complaints, or too many unsubscribes or bounces (Q-55). Resend reports
--    complaints and bounces to /api/v1/email/events.

insert into public.platform_settings (key, value, description, is_public) values
  ('bulk_email.max_complaints_30d', '1', 'Spam complaints in 30 days that pause a shop''s bulk email', false),
  ('bulk_email.max_unsubscribe_percent', '5', 'Percent of recipients unsubscribing in 30 days that pauses a shop''s bulk email', false),
  ('bulk_email.max_bounce_percent', '4', 'Percent of emails bouncing in 30 days that pauses a shop''s bulk email', false),
  ('bulk_email.max_single_per_day', '20', 'Most emails to one client at a time a shop may send in a day', false);

alter table public.list_subscribers
  -- How the person agreed, which CASL asks to be able to show.
  add column consent_basis text check (consent_basis in ('express', 'implied')),
  add column complained_at timestamptz,
  add column bounced_at timestamptz;
alter table public.list_subscribers drop constraint list_subscribers_status_check;
alter table public.list_subscribers add constraint list_subscribers_status_check
  check (status in ('client', 'pending', 'confirmed', 'unsubscribed', 'bounced'));
update public.list_subscribers set consent_basis = 'express' where status = 'confirmed';

alter table public.email_lists
  add column paused_at timestamptz,
  add column pause_reason text check (pause_reason in ('complaints', 'unsubscribes', 'bounces'));

-- One email to one client, sent through the same rules, kept like a bulk email.
alter table public.email_campaigns add column single_email text;

create index background_jobs_provider_message on public.background_jobs (provider_message_id) where provider_message_id is not null;

-- Clients from the seller's table. Nobody is emailed. "Send updates" (invite) puts them on
-- the shop's bulk email at once, if the seller says they are existing customers.
create or replace function public.add_list_clients(p_seller uuid, p_clients jsonb, p_has_consent boolean)
returns table (added integer, updated integer, invited integer, unsubscribed integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.email_lists := private.require_list(p_seller);
  v_user uuid := auth.uid();
  v_item jsonb;
  v_email text;
  v_name text;
  v_phone text;
  v_invite boolean;
  v_added integer := 0;
  v_updated integer := 0;
  v_invited integer := 0;
  v_unsubscribed integer := 0;
  v_today integer;
  v_seen text[] := '{}';
  v_row public.list_subscribers;
begin
  if jsonb_typeof(p_clients) <> 'array' or jsonb_array_length(p_clients) not between 1 and 50 then
    raise exception 'DETAILS_INVALID' using errcode = '23514';
  end if;
  if exists (select 1 from jsonb_array_elements(p_clients) c where (c ->> 'invite')::boolean is true) and p_has_consent is not true then
    raise exception 'CONSENT_REQUIRED' using errcode = '23514';
  end if;
  -- Still limited, so a whole bought list cannot be poured in at once.
  select count(*)::integer into v_today from public.list_subscribers s
  where s.list_id = v_list.id
    and s.invited_at >= ((now() at time zone 'America/Toronto')::date::timestamp at time zone 'America/Toronto');

  for v_item in select * from jsonb_array_elements(p_clients) loop
    v_email := lower(btrim(coalesce(v_item ->> 'email', '')));
    v_name := btrim(coalesce(v_item ->> 'name', ''));
    v_invite := coalesce((v_item ->> 'invite')::boolean, false);
    if char_length(v_email) > 254 or v_email !~ '^[^@\s<>",;]+@[^@\s<>",;]+\.[a-z]{2,}$' then
      raise exception 'EMAIL_INVALID' using errcode = '23514', detail = v_email;
    end if;
    if char_length(v_name) not between 1 and 100 then
      raise exception 'NAME_INVALID' using errcode = '23514';
    end if;
    v_phone := private.clean_phone(v_item ->> 'phone');
    if v_email = any (v_seen) then
      raise exception 'EMAIL_REPEATED' using errcode = '23514';
    end if;
    v_seen := array_append(v_seen, v_email);

    select * into v_row from public.list_subscribers where list_id = v_list.id and email = v_email for update;
    if found then
      update public.list_subscribers set name = v_name, phone = v_phone where id = v_row.id;
      v_updated := v_updated + 1;
    else
      insert into public.list_subscribers (list_id, email, user_id, name, phone, status, source, added_by)
      values (v_list.id, v_email,
        (select u.id from auth.users u join public.profiles p on p.id = u.id where lower(u.email) = v_email limit 1),
        v_name, v_phone, 'client', 'added', v_user)
      returning * into v_row;
      v_added := v_added + 1;
    end if;

    if v_invite then
      -- Someone who unsubscribed, or whose address bounced, is never put back by the shop.
      if v_row.status in ('unsubscribed', 'bounced') then
        v_unsubscribed := v_unsubscribed + 1;
      elsif v_row.status in ('client', 'pending') then
        if v_today + v_invited >= private.setting_integer('bulk_email.max_new_addresses_per_day') then
          raise exception 'ADDRESS_LIMIT' using errcode = 'P0001';
        end if;
        update public.list_subscribers
        set status = 'confirmed', consent_basis = 'implied', confirmed_at = now(), invited_at = now()
        where id = v_row.id;
        v_invited := v_invited + 1;
      end if;
    end if;
  end loop;

  perform private.write_audit('email_list.add', 'email_list', v_list.id::text, null,
    jsonb_build_object('added', v_added, 'updated', v_updated, 'implied_consent', v_invited));
  return query select v_added, v_updated, v_invited, v_unsubscribed;
end;
$$;

-- Turning updates off for one client, from the seller's list. Their later choice to rejoin
-- is theirs alone.
create function public.stop_client_updates(p_seller uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.email_lists := private.require_list(p_seller);
begin
  update public.list_subscribers set status = 'client', consent_basis = null
  where list_id = v_list.id and email = lower(btrim(coalesce(p_email, ''))) and status in ('confirmed', 'pending');
  if not found then
    raise exception 'CLIENT_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

-- Joining yourself, or confirming from a link, is express consent.
create or replace function public.set_list_subscription(p_shop text, p_subscribed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_active_account();
  v_list public.email_lists;
  v_email text;
  v_name text := (select left(nullif(btrim(display_name), ''), 100) from public.profiles where id = v_user);
begin
  if p_shop is null then
    insert into public.email_lists (owner_type, enabled) values ('platform', true) on conflict do nothing;
  end if;
  v_list := private.find_public_list(p_shop);
  if v_list.id is null then
    raise exception 'LIST_NOT_FOUND' using errcode = 'P0002';
  end if;
  select lower(email) into v_email from auth.users where id = v_user and email_confirmed_at is not null;
  if v_email is null then
    raise exception 'EMAIL_UNCONFIRMED' using errcode = '55000';
  end if;
  if p_subscribed then
    insert into public.list_subscribers (list_id, email, user_id, name, status, source, added_by, confirmed_at, consent_basis)
    values (v_list.id, v_email, v_user, v_name, 'confirmed', 'self', v_user, now(), 'express')
    on conflict (list_id, email) do update
      set status = 'confirmed', source = 'self', user_id = v_user, confirmed_at = now(), unsubscribed_at = null,
          consent_basis = 'express', name = coalesce(public.list_subscribers.name, excluded.name);
  else
    update public.list_subscribers set status = 'unsubscribed', unsubscribed_at = now()
    where list_id = v_list.id and email = v_email and status <> 'unsubscribed';
    perform private.check_list_health(v_list.id);
  end if;
end;
$$;

create or replace function public.confirm_list_token(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  update public.list_subscribers set status = 'confirmed', confirmed_at = now(), consent_basis = 'express'
  where token = p_token and status = 'pending'
  returning status into v_status;
  if v_status is null then
    select status into v_status from public.list_subscribers where token = p_token and status <> 'client';
  end if;
  if v_status is null then
    raise exception 'TOKEN_NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_status;
end;
$$;

-- Pauses a shop's bulk email when its last 30 days look like spam to mailbox providers
-- (Q-55). Biqbaq's own list is not paused this way; Super Admin watches it.
create function private.check_list_health(p_list uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.email_lists;
  v_since timestamptz := now() - interval '30 days';
  v_sent integer;
  v_complaints integer;
  v_unsubscribes integer;
  v_bounces integer;
  v_reason text;
  v_owner uuid;
  v_shop text;
  v_admin uuid;
begin
  select * into v_list from public.email_lists where id = p_list for update;
  if not found or v_list.owner_type <> 'seller' or not v_list.enabled then
    return;
  end if;
  select coalesce(sum(recipients), 0)::integer into v_sent from public.email_campaigns where list_id = p_list and created_at >= v_since;
  select count(*) filter (where complained_at >= v_since)::integer,
         count(*) filter (where unsubscribed_at >= v_since)::integer,
         count(*) filter (where bounced_at >= v_since)::integer
  into v_complaints, v_unsubscribes, v_bounces
  from public.list_subscribers where list_id = p_list;

  if v_complaints >= private.setting_integer('bulk_email.max_complaints_30d') and v_complaints > 0 then
    v_reason := 'complaints';
  -- Percentages need enough sent to mean something.
  elsif v_sent >= 20 and v_unsubscribes * 100 > v_sent * private.setting_integer('bulk_email.max_unsubscribe_percent') then
    v_reason := 'unsubscribes';
  elsif v_sent >= 20 and v_bounces * 100 > v_sent * private.setting_integer('bulk_email.max_bounce_percent') then
    v_reason := 'bounces';
  else
    return;
  end if;

  update public.email_lists set enabled = false, paused_at = now(), pause_reason = v_reason where id = p_list;
  select s.owner_user_id, s.name into v_owner, v_shop from public.sellers s where s.id = v_list.seller_id;
  perform private.write_audit('bulk_email.auto_pause', 'seller', v_list.seller_id::text, v_reason,
    jsonb_build_object('sent_30d', v_sent, 'complaints', v_complaints, 'unsubscribes', v_unsubscribes, 'bounces', v_bounces));
  perform private.enqueue_email(v_owner, 'bulk_email_paused', jsonb_build_object('shop', v_shop, 'reason', v_reason), 'bulk_email_paused:' || p_list || ':' || now());
  for v_admin in select user_id from public.user_roles where role_key = 'super_admin' and status = 'active' loop
    perform private.enqueue_email(v_admin, 'bulk_email_paused_admin', jsonb_build_object('shop', v_shop, 'reason', v_reason),
      'bulk_email_paused_admin:' || p_list || ':' || v_admin || ':' || now());
  end loop;
end;
$$;
revoke all on function private.check_list_health(uuid) from public;

create or replace function public.unsubscribe_list_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list uuid;
begin
  update public.list_subscribers set status = 'unsubscribed', unsubscribed_at = coalesce(unsubscribed_at, now())
  where token = p_token
  returning list_id into v_list;
  if v_list is null then
    raise exception 'TOKEN_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.check_list_health(v_list);
end;
$$;

-- Resend's reports, for the server only (Q-55). A complaint or a permanent bounce stops all
-- further bulk email to that address, then the shop's figures are checked.
create function public.record_email_event(p_message_id text, p_event text)
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
  -- Only bulk and single emails to clients are counted: 'campaign:<campaign>:<subscriber>'.
  if v_key is null or v_key !~ '^campaign:[0-9a-f-]{36}:[0-9a-f-]{36}$' then
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

-- Sends to every client receiving updates, or to just one of them (Q-54), within the day's
-- limits. Each email says how the person came to receive it.
drop function public.send_email_campaign(uuid, text, text);
create function public.send_email_campaign(p_seller uuid, p_subject text, p_body text, p_to text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.email_lists := private.require_list(p_seller);
  v_subject text := btrim(coalesce(p_subject, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_to text := nullif(lower(btrim(coalesce(p_to, ''))), '');
  v_today record;
  v_singles integer;
  v_count integer;
  v_campaign uuid;
  v_name text := private.list_sender_name(v_list);
begin
  if v_list.mailing_address is null then
    raise exception 'ADDRESS_REQUIRED' using errcode = '55000';
  end if;
  if char_length(v_subject) not between 1 and 150 or char_length(v_body) not between 1 and 5000 then
    raise exception 'DETAILS_INVALID' using errcode = '23514';
  end if;
  if not private.setting_is_on('email.notifications_enabled') then
    raise exception 'EMAIL_OFF' using errcode = '55000';
  end if;
  perform 1 from public.email_lists where id = v_list.id for update;
  select * into v_today from private.list_sent_today(v_list.id);

  if v_to is not null then
    if not exists (select 1 from public.list_subscribers where list_id = v_list.id and email = v_to and status = 'confirmed') then
      raise exception 'CLIENT_NOT_RECEIVING' using errcode = '55000';
    end if;
    select count(*)::integer into v_singles from public.email_campaigns
    where list_id = v_list.id and single_email is not null
      and created_at >= ((now() at time zone 'America/Toronto')::date::timestamp at time zone 'America/Toronto');
    if v_singles >= private.setting_integer('bulk_email.max_single_per_day') then
      raise exception 'SINGLE_LIMIT' using errcode = 'P0001';
    end if;
    v_count := 1;
  else
    select count(*)::integer into v_count from public.list_subscribers where list_id = v_list.id and status = 'confirmed';
    if v_count = 0 then
      raise exception 'NO_SUBSCRIBERS' using errcode = '55000';
    end if;
    if v_today.campaigns - coalesce((select count(*) from public.email_campaigns c where c.list_id = v_list.id and c.single_email is not null
        and c.created_at >= ((now() at time zone 'America/Toronto')::date::timestamp at time zone 'America/Toronto')), 0)
       >= private.setting_integer('bulk_email.max_campaigns_per_day') then
      raise exception 'CAMPAIGN_LIMIT' using errcode = 'P0001';
    end if;
  end if;
  -- Every email, to one or to all, counts towards the people a day.
  if v_today.recipients + v_count > private.setting_integer('bulk_email.max_recipients_per_day') then
    raise exception 'RECIPIENT_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.email_campaigns (list_id, subject, body, recipients, created_by, single_email)
  values (v_list.id, v_subject, v_body, v_count, auth.uid(), v_to)
  returning id into v_campaign;
  insert into public.background_jobs (type, user_id, payload, idempotency_key)
  select 'email', null,
    jsonb_build_object('template', 'bulk_email', 'to', s.email,
      'data', jsonb_build_object('shop', v_name, 'subject', v_subject, 'body', v_body,
        'address', v_list.mailing_address, 'token', s.token,
        'source', case when s.consent_basis = 'implied' then 'customer' when s.source = 'self' then 'self' else 'added' end,
        'locale', coalesce((select locale from public.profiles where id = s.user_id), 'en'))),
    'campaign:' || v_campaign || ':' || s.id
  from public.list_subscribers s
  where s.list_id = v_list.id and s.status = 'confirmed' and (v_to is null or s.email = v_to);
  perform private.write_audit('email_campaign.send', 'email_list', v_list.id::text, null,
    jsonb_build_object('campaign', v_campaign, 'recipients', v_count, 'single', v_to is not null));
  return v_count;
end;
$$;

drop function public.list_email_campaigns(uuid);
create function public.list_email_campaigns(p_seller uuid)
returns table (id uuid, subject text, recipients integer, created_at timestamptz, single_email text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.email_lists := private.require_list(p_seller);
begin
  return query
  select c.id, c.subject, c.recipients, c.created_at, c.single_email from public.email_campaigns c
  where c.list_id = v_list.id order by c.created_at desc limit 50;
end;
$$;

-- The shop sees why its bulk email is off, if it was paused.
drop function public.my_email_list(uuid);
create function public.my_email_list(p_seller uuid default null)
returns table (
  list_id uuid,
  enabled boolean,
  sender_name text,
  mailing_address text,
  pending integer,
  confirmed integer,
  unsubscribed integer,
  campaigns_today integer,
  recipients_today integer,
  max_campaigns integer,
  max_recipients integer,
  max_new_addresses integer,
  added_today integer,
  pause_reason text,
  clients integer,
  singles_today integer,
  max_singles integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.email_lists;
  v_day timestamptz := ((now() at time zone 'America/Toronto')::date::timestamp at time zone 'America/Toronto');
begin
  begin
    v_list := private.require_list(p_seller);
  exception when sqlstate '55000' then
    return query select null::uuid, false, null::text, null::text, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      (select l.pause_reason from public.email_lists l where l.seller_id = p_seller), 0, 0, 0;
    return;
  end;
  return query
  select v_list.id, true, private.list_sender_name(v_list), v_list.mailing_address,
    (select count(*)::integer from public.list_subscribers s where s.list_id = v_list.id and s.status = 'pending'),
    (select count(*)::integer from public.list_subscribers s where s.list_id = v_list.id and s.status = 'confirmed'),
    (select count(*)::integer from public.list_subscribers s where s.list_id = v_list.id and s.status in ('unsubscribed', 'bounced')),
    (select count(*)::integer from public.email_campaigns c where c.list_id = v_list.id and c.single_email is null and c.created_at >= v_day),
    t.recipients,
    private.setting_integer('bulk_email.max_campaigns_per_day'),
    private.setting_integer('bulk_email.max_recipients_per_day'),
    private.setting_integer('bulk_email.max_new_addresses_per_day'),
    (select count(*)::integer from public.list_subscribers s where s.list_id = v_list.id and s.invited_at >= v_day),
    null::text,
    (select count(*)::integer from public.list_subscribers s where s.list_id = v_list.id),
    (select count(*)::integer from public.email_campaigns c where c.list_id = v_list.id and c.single_email is not null and c.created_at >= v_day),
    private.setting_integer('bulk_email.max_single_per_day')
  from private.list_sent_today(v_list.id) t;
end;
$$;

-- Super Admin turning a shop back on clears the pause.
create or replace function public.admin_set_shop_bulk_email(p_seller uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_shop text;
begin
  if not private.is_super_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  select owner_user_id, name into v_owner, v_shop from public.sellers where id = p_seller;
  if not found or p_enabled is null then
    raise exception 'SELLER_NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.email_lists (owner_type, seller_id, enabled) values ('seller', p_seller, p_enabled)
  on conflict (seller_id) do update
    set enabled = excluded.enabled,
        paused_at = case when excluded.enabled then null else public.email_lists.paused_at end,
        pause_reason = case when excluded.enabled then null else public.email_lists.pause_reason end;
  perform private.write_audit(case when p_enabled then 'bulk_email.enable' else 'bulk_email.disable' end, 'seller', p_seller::text, null, '{}'::jsonb);
  perform private.enqueue_email(v_owner, case when p_enabled then 'bulk_email_enabled' else 'bulk_email_disabled' end,
    jsonb_build_object('shop', v_shop), 'bulk_email:' || gen_random_uuid());
end;
$$;

drop function public.admin_list_shop_email_lists(text, integer, integer);
create function public.admin_list_shop_email_lists(p_search text default null, p_limit integer default 20, p_offset integer default 0)
returns table (seller_id uuid, shop_name text, shop_slug text, enabled boolean, confirmed integer, pending integer, last_sent_at timestamptz, pause_reason text, total bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not private.is_super_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return query
  select s.id, s.name, s.slug, coalesce(l.enabled, false),
    (select count(*)::integer from public.list_subscribers x where x.list_id = l.id and x.status = 'confirmed'),
    (select count(*)::integer from public.list_subscribers x where x.list_id = l.id and x.status = 'pending'),
    (select max(c.created_at) from public.email_campaigns c where c.list_id = l.id),
    l.pause_reason,
    count(*) over ()
  from public.sellers s
  left join public.email_lists l on l.seller_id = s.id
  where s.status = 'active' and (v_search is null or s.name ilike '%' || v_search || '%' or s.slug ilike '%' || v_search || '%')
  order by (l.pause_reason is not null) desc, coalesce(l.enabled, false) desc, s.name
  limit greatest(least(coalesce(p_limit, 20), 100), 1) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function private.setting_value_is_valid(p_key text, p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_min numeric;
  v_max numeric;
begin
  if p_key = 'media.allowed_formats' then
    return jsonb_array_length(p_value) > 0
      and (select count(*) = count(distinct f) and bool_and(f in ('jpg', 'png', 'webp'))
           from jsonb_array_elements_text(p_value) f);
  end if;

  if jsonb_typeof(p_value) <> 'number' then
    return true;
  end if;

  select r.lo, r.hi into v_min, v_max from (values
    ('publishing.unverified_allowance', 0, 1000),
    ('contact.max_per_ip_hour', 1, 1000),
    ('contact.max_per_email_hour', 1, 1000),
    ('contact.max_per_seller_hour', 1, 100000),
    ('media.max_image_bytes', 102400, 10485760),
    ('media.max_dimension', 500, 10000),
    ('media.max_images', 1, 20),
    ('staff.max_invitations_per_hour', 1, 100),
    ('api.max_requests_per_hour', 10, 100000),
    ('reviews.max_per_hour', 1, 100),
    ('views.max_per_hour', 10, 100000),
    ('comments.max_per_hour', 1, 100),
    ('ads.max_per_section', 1, 6),
    ('messages.max_per_hour', 5, 1000),
    ('messages.max_new_conversations_per_hour', 1, 100),
    ('bulk_email.max_recipients_per_day', 1, 100000),
    ('bulk_email.max_campaigns_per_day', 1, 20),
    ('bulk_email.max_new_addresses_per_day', 1, 10000),
    ('invoices.max_per_day', 1, 1000),
    ('bulk_email.max_complaints_30d', 1, 100),
    ('bulk_email.max_unsubscribe_percent', 1, 50),
    ('bulk_email.max_bounce_percent', 1, 20),
    ('bulk_email.max_single_per_day', 1, 1000)
  ) as r (k, lo, hi) where r.k = p_key;

  -- A number with no limits listed here is refused, so a new one has to be given some.
  return v_min is not null
    and (p_value #>> '{}')::numeric between v_min and v_max
    and (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric);
end;
$$;
revoke all on function private.setting_value_is_valid(text, jsonb) from public;

revoke execute on function public.stop_client_updates(uuid, text) from public, anon;
grant execute on function public.stop_client_updates(uuid, text) to authenticated;
revoke execute on function public.send_email_campaign(uuid, text, text, text) from public, anon;
grant execute on function public.send_email_campaign(uuid, text, text, text) to authenticated;
revoke execute on function public.list_email_campaigns(uuid) from public, anon;
grant execute on function public.list_email_campaigns(uuid) to authenticated;
revoke execute on function public.my_email_list(uuid) from public, anon;
grant execute on function public.my_email_list(uuid) to authenticated;
revoke execute on function public.admin_list_shop_email_lists(text, integer, integer) from public, anon;
grant execute on function public.admin_list_shop_email_lists(text, integer, integer) to authenticated;
revoke execute on function public.record_email_event(text, text) from public, anon, authenticated;
grant execute on function public.record_email_event(text, text) to service_role;
