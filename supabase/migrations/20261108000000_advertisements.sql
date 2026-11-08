-- Advertisements (PRD §12). Decided by the owner: only Super Admin and Co-admins given the
-- permission manage them (2026-11-07), and an ad always opens its own page on Biqbaq.

insert into public.permissions (key, description, scope, is_delegable) values
  ('ads.manage', 'Create, edit, schedule and remove advertisements', 'platform', false);

insert into public.platform_settings (key, value, description, is_public) values
  ('ads.max_per_section', '3', 'Most ads one section of a page shows', true);

-- Only the places the site has today. Header, product listing, sidebar and mobile spots are
-- added when there is somewhere for them to appear.
create table public.advertisements (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  advertiser_name text not null check (char_length(btrim(advertiser_name)) between 1 and 100),
  image_public_id text,
  image_url text,
  -- A Biqbaq page, or a secure address elsewhere. Nothing else can be linked.
  destination_url text not null check (
    char_length(destination_url) <= 2000
    and (destination_url ~ '^/[^/\\]' or destination_url = '/' or destination_url ~ '^https://[^\s/]+')
    and destination_url !~ '\s'
  ),
  placements text[] not null check (cardinality(placements) > 0 and placements <@ array['homepage', 'global']),
  priority integer not null default 0 check (priority between 0 and 1000),
  active boolean not null default false,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ends_after_start check (ends_at > starts_at),
  constraint active_needs_image check (not active or image_url is not null)
);

create index advertisements_live on public.advertisements (priority desc) where active;

create trigger set_updated_at before update on public.advertisements
  for each row execute function private.set_updated_at();

alter table public.advertisements enable row level security;
revoke all on public.advertisements from public, anon, authenticated;

-- What anyone may see: active ads within their dates, highest priority first.
create view public.public_advertisements as
  select a.id, a.slug, a.title, a.description, a.advertiser_name, a.image_url, a.destination_url,
    a.placements, a.priority, a.starts_at, a.ends_at
  from public.advertisements a
  where a.active and a.image_url is not null and a.starts_at <= now() and a.ends_at > now();

grant select on public.public_advertisements to anon, authenticated;

create function private.can_manage_ads()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_super_admin() or (private.has_active_role('co_admin') and private.has_permission('ads.manage'));
$$;

create function private.require_ads_manager()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_active_account();
begin
  if not private.can_manage_ads() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return v_user;
end;
$$;

revoke all on function private.can_manage_ads() from public;
revoke all on function private.require_ads_manager() from public;

create function public.my_ads_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_manage_ads();
$$;

create function public.admin_list_ads(p_status text default null, p_search text default null, p_limit integer default 20, p_offset integer default 0)
returns table (id uuid, slug text, title text, advertiser_name text, image_url text, placements text[], priority integer,
  active boolean, starts_at timestamptz, ends_at timestamptz, updated_at timestamptz, total bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pattern text := case when nullif(btrim(p_search), '') is null then null else
    '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end;
begin
  perform private.require_ads_manager();
  return query
    select a.id, a.slug, a.title, a.advertiser_name, a.image_url, a.placements, a.priority, a.active, a.starts_at, a.ends_at, a.updated_at, count(*) over ()
    from public.advertisements a
    where (p_status is null
        or (p_status = 'live' and a.active and a.starts_at <= now() and a.ends_at > now())
        or (p_status = 'scheduled' and a.active and a.starts_at > now())
        or (p_status = 'ended' and a.ends_at <= now())
        or (p_status = 'off' and not a.active and a.ends_at > now()))
      and (v_pattern is null or a.title ilike v_pattern or a.advertiser_name ilike v_pattern)
    order by a.updated_at desc, a.id
    limit greatest(least(coalesce(p_limit, 20), 50), 1)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create function public.get_ad_for_editing(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ad public.advertisements;
begin
  perform private.require_ads_manager();
  select * into v_ad from public.advertisements where id = p_id;
  if not found then
    raise exception 'AD_NOT_FOUND' using errcode = 'P0002';
  end if;
  return to_jsonb(v_ad) - 'image_public_id';
end;
$$;

-- Creates an ad when p_id is null, switched off until it has a photo and is turned on.
-- The address is made once from the first title and never changes.
create function public.save_ad(
  p_id uuid,
  p_title text,
  p_description text,
  p_advertiser text,
  p_destination text,
  p_placements text[],
  p_priority integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_ads_manager();
  v_id uuid := p_id;
begin
  if nullif(btrim(coalesce(p_title, '')), '') is null or nullif(btrim(coalesce(p_advertiser, '')), '') is null then
    raise exception 'DETAILS_REQUIRED' using errcode = '23514';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'DATES_INVALID' using errcode = '23514';
  end if;
  begin
    if v_id is null then
      insert into public.advertisements (slug, title, description, advertiser_name, destination_url, placements, priority, starts_at, ends_at, created_by)
      values (private.unique_slug(p_title, 'public.advertisements', 'ad'), btrim(p_title), btrim(coalesce(p_description, '')), btrim(p_advertiser),
        btrim(coalesce(p_destination, '')), p_placements, coalesce(p_priority, 0), p_starts_at, p_ends_at, v_actor)
      returning id into v_id;
      perform private.write_audit('ad.create', 'advertisement', v_id::text, null, jsonb_build_object('title', btrim(p_title)));
    else
      update public.advertisements set title = btrim(p_title), description = btrim(coalesce(p_description, '')), advertiser_name = btrim(p_advertiser),
        destination_url = btrim(coalesce(p_destination, '')), placements = p_placements, priority = coalesce(p_priority, 0),
        starts_at = p_starts_at, ends_at = p_ends_at
      where id = v_id;
      if not found then
        raise exception 'AD_NOT_FOUND' using errcode = 'P0002';
      end if;
      perform private.write_audit('ad.edit', 'advertisement', v_id::text, null, jsonb_build_object('title', btrim(p_title)));
    end if;
  exception
    when check_violation then raise exception 'DETAILS_INVALID' using errcode = '23514';
    when not_null_violation then raise exception 'DETAILS_INVALID' using errcode = '23514';
  end;
  return v_id;
end;
$$;

create function public.set_ad_active(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ad public.advertisements;
begin
  perform private.require_ads_manager();
  select * into v_ad from public.advertisements where id = p_id for update;
  if not found then
    raise exception 'AD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_active is null or v_ad.active = p_active then
    raise exception 'INVALID_STATUS_CHANGE' using errcode = '55000';
  end if;
  if p_active and v_ad.image_url is null then
    raise exception 'AD_INCOMPLETE' using errcode = '23514';
  end if;
  update public.advertisements set active = p_active where id = p_id;
  perform private.write_audit(case when p_active then 'ad.activate' else 'ad.deactivate' end, 'advertisement', p_id::text, null, jsonb_build_object('title', v_ad.title));
end;
$$;

-- Removes the ad for good. Returns its photo, for the server to delete the file.
create function public.delete_ad(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ad public.advertisements;
begin
  perform private.require_ads_manager();
  delete from public.advertisements where id = p_id returning * into v_ad;
  if not found then
    raise exception 'AD_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.write_audit('ad.delete', 'advertisement', p_id::text, null, jsonb_build_object('title', v_ad.title, 'advertiser', v_ad.advertiser_name));
  return v_ad.image_public_id;
end;
$$;

create function public.authorize_ad_image(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_ads_manager();
  if not exists (select 1 from public.advertisements where id = p_id) then
    raise exception 'AD_NOT_FOUND' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'max_images', 1,
    'max_bytes', (select (value #>> '{}')::integer from public.platform_settings where key = 'media.max_image_bytes'),
    'max_dimension', (select (value #>> '{}')::integer from public.platform_settings where key = 'media.max_dimension'),
    'formats', (select value from public.platform_settings where key = 'media.allowed_formats')
  );
end;
$$;

-- Returns the photo it replaced, so the server can delete that file.
create function public.record_ad_image(p_actor uuid, p_id uuid, p_public_id text, p_secure_url text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  select image_public_id into v_old from public.advertisements where id = p_id for update;
  if not found then
    raise exception 'AD_NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.advertisements set image_public_id = p_public_id, image_url = p_secure_url where id = p_id;
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (p_actor, 'ad.image', 'advertisement', p_id::text, '{}'::jsonb);
  return v_old;
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
    ('ads.max_per_section', 1, 6)
  ) as r (k, lo, hi) where r.k = p_key;

  -- A number with no limits listed here is refused, so a new one has to be given some.
  return v_min is not null
    and (p_value #>> '{}')::numeric between v_min and v_max
    and (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric);
end;
$$;

revoke all on function private.setting_value_is_valid(text, jsonb) from public;
revoke execute on function public.my_ads_access() from public, anon;
grant execute on function public.my_ads_access() to authenticated;
revoke execute on function public.admin_list_ads(text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_ads(text, text, integer, integer) to authenticated;
revoke execute on function public.get_ad_for_editing(uuid) from public, anon;
grant execute on function public.get_ad_for_editing(uuid) to authenticated;
revoke execute on function public.save_ad(uuid, text, text, text, text, text[], integer, timestamptz, timestamptz) from public, anon;
grant execute on function public.save_ad(uuid, text, text, text, text, text[], integer, timestamptz, timestamptz) to authenticated;
revoke execute on function public.set_ad_active(uuid, boolean) from public, anon;
grant execute on function public.set_ad_active(uuid, boolean) to authenticated;
revoke execute on function public.delete_ad(uuid) from public, anon;
grant execute on function public.delete_ad(uuid) to authenticated;
revoke execute on function public.authorize_ad_image(uuid) from public, anon;
grant execute on function public.authorize_ad_image(uuid) to authenticated;
revoke execute on function public.record_ad_image(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_ad_image(uuid, uuid, text, text) to service_role;
