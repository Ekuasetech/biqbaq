-- Customer email lists and bulk email (owner's request, 2026-11-08), with the owner's
-- decisions: confirmed opt-in only (Q-42); off for every shop until Super Admin turns it on
-- for that shop (Q-43); one bulk email a day to at most 100 people per shop, changeable in
-- Settings (Q-44); subject and plain text only (Q-45); Super Admin has Biqbaq's own list
-- under the same rules, joined through a "Biqbaq news" choice (Q-46).
--
-- Canada's anti-spam law (CASL) and Resend's rules both need: consent, the sender's name
-- and mailing address in every email, a working unsubscribe honoured promptly, and a record
-- of consent. A bad list would also put every Biqbaq email at risk, as all mail shares one
-- Resend account (complaints above 0.08% can close it).

insert into public.platform_settings (key, value, description, is_public) values
  ('bulk_email.max_recipients_per_day', '100', 'Most people one shop (or Biqbaq) may send bulk email to in a day', false),
  ('bulk_email.max_campaigns_per_day', '1', 'Most bulk emails one shop (or Biqbaq) may send in a day', false),
  ('bulk_email.max_new_addresses_per_day', '100', 'Most addresses one list may add in a day, each of which is sent a confirmation email', false);

create table public.email_lists (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('seller', 'platform')),
  seller_id uuid unique references public.sellers (id) on delete cascade,
  -- Off for shops until Super Admin turns it on (Q-43). Biqbaq's own list is always on.
  enabled boolean not null default false,
  -- Printed in every email, as CASL requires.
  mailing_address text check (mailing_address is null or char_length(mailing_address) between 10 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_lists_owner check ((owner_type = 'seller') = (seller_id is not null))
);
create unique index email_lists_one_platform on public.email_lists (owner_type) where owner_type = 'platform';
create trigger set_updated_at before update on public.email_lists
  for each row execute function private.set_updated_at();

create table public.list_subscribers (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.email_lists (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) <= 254),
  user_id uuid references public.profiles (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'unsubscribed')),
  -- The consent record (CASL): who added them and how, and when they confirmed.
  source text not null check (source in ('added', 'self')),
  added_by uuid references public.profiles (id) on delete set null,
  -- Lets the person confirm or unsubscribe from a link, without signing in.
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  unique (list_id, email)
);
create index list_subscribers_list on public.list_subscribers (list_id, status);

create table public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.email_lists (id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 150),
  body text not null check (char_length(body) between 1 and 5000),
  recipients integer not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index email_campaigns_list on public.email_campaigns (list_id, created_at desc);

-- Only the functions below touch these. Addresses are personal information.
alter table public.email_lists enable row level security;
alter table public.list_subscribers enable row level security;
alter table public.email_campaigns enable row level security;
revoke all on public.email_lists, public.list_subscribers, public.email_campaigns from public, anon, authenticated;

-- The list the caller manages: their shop's (owner only), or Biqbaq's (Super Admin).
-- Biqbaq's list is made the first time Super Admin opens it.
create function private.require_list(p_seller uuid)
returns public.email_lists
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.email_lists;
begin
  perform private.require_active_account();
  if p_seller is null then
    if not private.is_super_admin() then
      raise exception 'NOT_AUTHORIZED' using errcode = '42501';
    end if;
    insert into public.email_lists (owner_type, enabled) values ('platform', true) on conflict do nothing;
    select * into v_list from public.email_lists where owner_type = 'platform';
  else
    if not private.is_active_seller_owner(p_seller) then
      raise exception 'NOT_AUTHORIZED' using errcode = '42501';
    end if;
    select * into v_list from public.email_lists where seller_id = p_seller;
    if not found or not v_list.enabled then
      raise exception 'BULK_EMAIL_DISABLED' using errcode = '55000';
    end if;
  end if;
  return v_list;
end;
$$;
revoke all on function private.require_list(uuid) from public;

create function private.list_sender_name(p_list public.email_lists)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select name from public.sellers where id = p_list.seller_id), 'Biqbaq');
$$;
revoke all on function private.list_sender_name(public.email_lists) from public;

-- Sent today, by Toronto day.
create function private.list_sent_today(p_list uuid)
returns table (campaigns integer, recipients integer)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer, coalesce(sum(recipients), 0)::integer from public.email_campaigns
  where list_id = p_list and created_at >= ((now() at time zone 'America/Toronto')::date::timestamp at time zone 'America/Toronto');
$$;
revoke all on function private.list_sent_today(uuid) from public;

create function private.setting_integer(p_key text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (value #>> '{}')::integer from public.platform_settings where key = p_key;
$$;
revoke all on function private.setting_integer(text) from public;

-- A shop's or Biqbaq's list, with its figures and limits. A shop without bulk email sees
-- that it is off, and nothing else.
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
  added_today integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.email_lists;
begin
  begin
    v_list := private.require_list(p_seller);
  exception when sqlstate '55000' then
    return query select null::uuid, false, null::text, null::text, 0, 0, 0, 0, 0, 0, 0, 0, 0;
    return;
  end;
  return query
  select v_list.id, true, private.list_sender_name(v_list), v_list.mailing_address,
    (select count(*)::integer from public.list_subscribers s where s.list_id = v_list.id and s.status = 'pending'),
    (select count(*)::integer from public.list_subscribers s where s.list_id = v_list.id and s.status = 'confirmed'),
    (select count(*)::integer from public.list_subscribers s where s.list_id = v_list.id and s.status = 'unsubscribed'),
    t.campaigns, t.recipients,
    private.setting_integer('bulk_email.max_campaigns_per_day'),
    private.setting_integer('bulk_email.max_recipients_per_day'),
    private.setting_integer('bulk_email.max_new_addresses_per_day'),
    (select count(*)::integer from public.list_subscribers s where s.list_id = v_list.id and s.source = 'added'
      and s.created_at >= ((now() at time zone 'America/Toronto')::date::timestamp at time zone 'America/Toronto'))
  from private.list_sent_today(v_list.id) t;
end;
$$;

create function public.set_list_mailing_address(p_seller uuid, p_address text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.email_lists := private.require_list(p_seller);
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
begin
  if v_address is null or char_length(v_address) < 10 or char_length(v_address) > 300 then
    raise exception 'ADDRESS_INVALID' using errcode = '23514';
  end if;
  update public.email_lists set mailing_address = v_address where id = v_list.id;
end;
$$;

create function public.list_subscribers_page(p_seller uuid, p_status text default null, p_search text default null, p_limit integer default 50, p_offset integer default 0)
returns table (email text, status text, source text, created_at timestamptz, confirmed_at timestamptz, unsubscribed_at timestamptz, total bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.email_lists := private.require_list(p_seller);
  v_search text := nullif(lower(btrim(coalesce(p_search, ''))), '');
begin
  return query
  select s.email, s.status, s.source, s.created_at, s.confirmed_at, s.unsubscribed_at, count(*) over ()
  from public.list_subscribers s
  where s.list_id = v_list.id and (p_status is null or s.status = p_status) and (v_search is null or s.email like '%' || v_search || '%')
  order by s.created_at desc
  limit greatest(least(coalesce(p_limit, 50), 200), 1) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Adding addresses the owner says agreed to hear from them. Each new one gets a single
-- confirmation email, and only those who confirm are ever sent bulk email (Q-42).
create function public.add_list_addresses(p_seller uuid, p_emails text[], p_has_consent boolean)
returns table (added integer, already integer, invalid integer, unsubscribed integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.email_lists := private.require_list(p_seller);
  v_user uuid := auth.uid();
  v_email text;
  v_clean text[] := '{}';
  v_invalid integer := 0;
  v_already integer := 0;
  v_unsubscribed integer := 0;
  v_added integer := 0;
  v_today integer;
  v_row public.list_subscribers;
  v_existing public.list_subscribers;
  v_name text := private.list_sender_name(v_list);
begin
  if p_has_consent is not true then
    raise exception 'CONSENT_REQUIRED' using errcode = '23514';
  end if;
  foreach v_email in array coalesce(p_emails, '{}') loop
    v_email := lower(btrim(v_email));
    if v_email = '' then
      continue;
    elsif char_length(v_email) > 254 or v_email !~ '^[^@\s<>",;]+@[^@\s<>",;]+\.[a-z]{2,}$' then
      v_invalid := v_invalid + 1;
    elsif not v_email = any (v_clean) then
      v_clean := array_append(v_clean, v_email);
    end if;
  end loop;

  select count(*)::integer into v_today from public.list_subscribers s
  where s.list_id = v_list.id and s.source = 'added'
    and s.created_at >= ((now() at time zone 'America/Toronto')::date::timestamp at time zone 'America/Toronto');

  foreach v_email in array v_clean loop
    select * into v_existing from public.list_subscribers where list_id = v_list.id and email = v_email;
    if found then
      -- Someone who unsubscribed stays unsubscribed: only they can rejoin.
      if v_existing.status = 'unsubscribed' then
        v_unsubscribed := v_unsubscribed + 1;
      else
        v_already := v_already + 1;
      end if;
      continue;
    end if;
    if v_today + v_added >= private.setting_integer('bulk_email.max_new_addresses_per_day') then
      raise exception 'ADDRESS_LIMIT' using errcode = 'P0001';
    end if;
    insert into public.list_subscribers (list_id, email, user_id, source, added_by)
    values (v_list.id, v_email, (select u.id from auth.users u join public.profiles p on p.id = u.id where lower(u.email) = v_email limit 1), 'added', v_user)
    returning * into v_row;
    v_added := v_added + 1;
    if private.setting_is_on('email.notifications_enabled') then
      -- Straight to the queue, not the bell: the person has not agreed to anything yet.
      insert into public.background_jobs (type, user_id, payload, idempotency_key)
      values ('email', null,
        jsonb_build_object('template', 'list_confirm', 'to', v_email,
          'data', jsonb_build_object('shop', v_name, 'token', v_row.token,
            'locale', coalesce((select locale from public.profiles where id = v_row.user_id), 'en'))),
        'list_confirm:' || v_row.id);
    end if;
  end loop;

  if v_added > 0 then
    perform private.write_audit('email_list.add', 'email_list', v_list.id::text, null, jsonb_build_object('added', v_added));
  end if;
  return query select v_added, v_already, v_invalid, v_unsubscribed;
end;
$$;

-- Removing stops future emails. Someone who unsubscribed is kept, so they cannot be re-added.
create function public.remove_list_subscriber(p_seller uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.email_lists := private.require_list(p_seller);
begin
  delete from public.list_subscribers
  where list_id = v_list.id and email = lower(btrim(coalesce(p_email, ''))) and status <> 'unsubscribed';
end;
$$;

-- Sends to every confirmed address, within the day's limits (Q-44).
create function public.send_email_campaign(p_seller uuid, p_subject text, p_body text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.email_lists := private.require_list(p_seller);
  v_subject text := btrim(coalesce(p_subject, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_today record;
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
  -- One at a time per list, so two sends cannot both fit under the limit.
  perform 1 from public.email_lists where id = v_list.id for update;
  select * into v_today from private.list_sent_today(v_list.id);
  select count(*)::integer into v_count from public.list_subscribers where list_id = v_list.id and status = 'confirmed';
  if v_count = 0 then
    raise exception 'NO_SUBSCRIBERS' using errcode = '55000';
  end if;
  if v_today.campaigns >= private.setting_integer('bulk_email.max_campaigns_per_day') then
    raise exception 'CAMPAIGN_LIMIT' using errcode = 'P0001';
  end if;
  if v_today.recipients + v_count > private.setting_integer('bulk_email.max_recipients_per_day') then
    raise exception 'RECIPIENT_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.email_campaigns (list_id, subject, body, recipients, created_by)
  values (v_list.id, v_subject, v_body, v_count, auth.uid())
  returning id into v_campaign;
  -- Sent to the address on the list, never the account's name or settings.
  insert into public.background_jobs (type, user_id, payload, idempotency_key)
  select 'email', null,
    jsonb_build_object('template', 'bulk_email', 'to', s.email,
      'data', jsonb_build_object('shop', v_name, 'subject', v_subject, 'body', v_body,
        'address', v_list.mailing_address, 'token', s.token, 'source', s.source,
        'locale', coalesce((select locale from public.profiles where id = s.user_id), 'en'))),
    'campaign:' || v_campaign || ':' || s.id
  from public.list_subscribers s where s.list_id = v_list.id and s.status = 'confirmed';
  perform private.write_audit('email_campaign.send', 'email_list', v_list.id::text, null,
    jsonb_build_object('campaign', v_campaign, 'recipients', v_count));
  return v_count;
end;
$$;

create function public.list_email_campaigns(p_seller uuid)
returns table (id uuid, subject text, recipients integer, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.email_lists := private.require_list(p_seller);
begin
  return query
  select c.id, c.subject, c.recipients, c.created_at from public.email_campaigns c
  where c.list_id = v_list.id order by c.created_at desc limit 50;
end;
$$;

-- People joining a list themselves, while signed in: a shop's "Get updates", or
-- "Biqbaq news" in their preferences (null shop). Their own choice is their consent.
create function private.find_public_list(p_shop text)
returns public.email_lists
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_list public.email_lists;
begin
  if p_shop is null then
    select * into v_list from public.email_lists where owner_type = 'platform';
  else
    select l.* into v_list from public.email_lists l join public.sellers s on s.id = l.seller_id
    where s.slug = p_shop and s.status = 'active' and l.enabled;
  end if;
  return v_list;
end;
$$;
revoke all on function private.find_public_list(text) from public;

create function public.my_list_subscription(p_shop text default null)
returns table (available boolean, subscribed boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_list public.email_lists := private.find_public_list(p_shop);
  v_email text := (select lower(email) from auth.users where id = auth.uid());
begin
  if auth.uid() is null then
    return query select false, false;
    return;
  end if;
  return query select
    v_list.id is not null or p_shop is null,
    exists (select 1 from public.list_subscribers s where s.list_id = v_list.id and s.email = v_email and s.status = 'confirmed');
end;
$$;

create function public.set_list_subscription(p_shop text, p_subscribed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_active_account();
  v_list public.email_lists;
  v_email text;
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
    insert into public.list_subscribers (list_id, email, user_id, status, source, added_by, confirmed_at)
    values (v_list.id, v_email, v_user, 'confirmed', 'self', v_user, now())
    on conflict (list_id, email) do update
      set status = 'confirmed', source = 'self', user_id = v_user, confirmed_at = now(), unsubscribed_at = null;
  else
    update public.list_subscribers set status = 'unsubscribed', unsubscribed_at = now()
    where list_id = v_list.id and email = v_email and status <> 'unsubscribed';
  end if;
end;
$$;

-- From the links in emails, for the server only. The token stands in for signing in.
create function public.lookup_list_token(p_token text)
returns table (sender_name text, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select private.list_sender_name(l), s.status
  from public.list_subscribers s join public.email_lists l on l.id = s.list_id
  where s.token = p_token;
$$;

create function public.confirm_list_token(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  -- An unsubscribed address is never brought back by an old confirmation link.
  update public.list_subscribers set status = 'confirmed', confirmed_at = now()
  where token = p_token and status = 'pending'
  returning status into v_status;
  if v_status is null then
    select status into v_status from public.list_subscribers where token = p_token;
  end if;
  if v_status is null then
    raise exception 'TOKEN_NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_status;
end;
$$;

create function public.unsubscribe_list_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.list_subscribers set status = 'unsubscribed', unsubscribed_at = coalesce(unsubscribed_at, now())
  where token = p_token;
  if not found then
    raise exception 'TOKEN_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

-- Super Admin turns bulk email on or off for a shop (Q-43), and sees every shop's list.
create function public.admin_list_shop_email_lists(p_search text default null, p_limit integer default 20, p_offset integer default 0)
returns table (seller_id uuid, shop_name text, shop_slug text, enabled boolean, confirmed integer, pending integer, last_sent_at timestamptz, total bigint)
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
    count(*) over ()
  from public.sellers s
  left join public.email_lists l on l.seller_id = s.id
  where s.status = 'active' and (v_search is null or s.name ilike '%' || v_search || '%' or s.slug ilike '%' || v_search || '%')
  order by coalesce(l.enabled, false) desc, s.name
  limit greatest(least(coalesce(p_limit, 20), 100), 1) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create function public.admin_set_shop_bulk_email(p_seller uuid, p_enabled boolean)
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
  on conflict (seller_id) do update set enabled = excluded.enabled;
  perform private.write_audit(case when p_enabled then 'bulk_email.enable' else 'bulk_email.disable' end, 'seller', p_seller::text, null, '{}'::jsonb);
  perform private.enqueue_email(v_owner, case when p_enabled then 'bulk_email_enabled' else 'bulk_email_disabled' end,
    jsonb_build_object('shop', v_shop), 'bulk_email:' || gen_random_uuid());
end;
$$;

-- Limits for the new settings.
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
    ('bulk_email.max_new_addresses_per_day', 1, 10000)
  ) as r (k, lo, hi) where r.k = p_key;

  -- A number with no limits listed here is refused, so a new one has to be given some.
  return v_min is not null
    and (p_value #>> '{}')::numeric between v_min and v_max
    and (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric);
end;
$$;
revoke all on function private.setting_value_is_valid(text, jsonb) from public;

revoke execute on function public.my_email_list(uuid) from public, anon;
grant execute on function public.my_email_list(uuid) to authenticated;
revoke execute on function public.set_list_mailing_address(uuid, text) from public, anon;
grant execute on function public.set_list_mailing_address(uuid, text) to authenticated;
revoke execute on function public.list_subscribers_page(uuid, text, text, integer, integer) from public, anon;
grant execute on function public.list_subscribers_page(uuid, text, text, integer, integer) to authenticated;
revoke execute on function public.add_list_addresses(uuid, text[], boolean) from public, anon;
grant execute on function public.add_list_addresses(uuid, text[], boolean) to authenticated;
revoke execute on function public.remove_list_subscriber(uuid, text) from public, anon;
grant execute on function public.remove_list_subscriber(uuid, text) to authenticated;
revoke execute on function public.send_email_campaign(uuid, text, text) from public, anon;
grant execute on function public.send_email_campaign(uuid, text, text) to authenticated;
revoke execute on function public.list_email_campaigns(uuid) from public, anon;
grant execute on function public.list_email_campaigns(uuid) to authenticated;
revoke execute on function public.my_list_subscription(text) from public, anon;
grant execute on function public.my_list_subscription(text) to authenticated;
revoke execute on function public.set_list_subscription(text, boolean) from public, anon;
grant execute on function public.set_list_subscription(text, boolean) to authenticated;
revoke execute on function public.admin_list_shop_email_lists(text, integer, integer) from public, anon;
grant execute on function public.admin_list_shop_email_lists(text, integer, integer) to authenticated;
revoke execute on function public.admin_set_shop_bulk_email(uuid, boolean) from public, anon;
grant execute on function public.admin_set_shop_bulk_email(uuid, boolean) to authenticated;
-- Server only: the links in emails, where the token stands in for signing in.
revoke execute on function public.lookup_list_token(text) from public, anon, authenticated;
grant execute on function public.lookup_list_token(text) to service_role;
revoke execute on function public.confirm_list_token(text) from public, anon, authenticated;
grant execute on function public.confirm_list_token(text) to service_role;
revoke execute on function public.unsubscribe_list_token(text) from public, anon, authenticated;
grant execute on function public.unsubscribe_list_token(text) to service_role;
