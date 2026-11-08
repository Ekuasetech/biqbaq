-- Cargo cars (PRD §8). Decided by the owner (2026-11-07): approved, verified sellers post them
-- with no new role (Q-04); they do not count towards the allowance (Q-05); capacity is the weight
-- still free, in kilograms; and people reach the dealer only through Biqbaq, never a public number.

alter table public.media_assets drop constraint media_assets_entity_type_check;
alter table public.media_assets add constraint media_assets_entity_type_check check (entity_type in ('product', 'blog_post', 'vehicle'));

create table public.vehicle_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers (id) on delete restrict,
  slug text not null unique,
  make text not null check (char_length(btrim(make)) between 1 and 40),
  model text not null check (char_length(btrim(model)) between 1 and 60),
  year integer not null check (year between 1980 and 2100),
  origin_city text not null check (char_length(btrim(origin_city)) between 1 and 80),
  destination_city text not null check (char_length(btrim(destination_city)) between 1 and 80),
  departure_date date not null,
  available_kg integer not null default 0 check (available_kg between 0 and 100000),
  restrictions text[] not null default '{}' check (cardinality(restrictions) <= 10),
  cargo_status text not null default 'accepting_cargo' check (cargo_status in ('accepting_cargo', 'full')),
  status text not null default 'draft' check (status in ('draft', 'published', 'unpublished', 'archived', 'suspended')),
  first_published_at timestamptz,
  deleted_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vehicle_listings_seller on public.vehicle_listings (seller_id);
create index vehicle_listings_live on public.vehicle_listings (departure_date) where status = 'published' and deleted_at is null;

create table public.vehicle_view_totals (
  vehicle_listing_id uuid primary key references public.vehicle_listings (id) on delete cascade,
  views bigint not null default 0
);

create table public.vehicle_view_days (
  vehicle_listing_id uuid not null references public.vehicle_listings (id) on delete cascade,
  visitor_hash text not null,
  day date not null,
  primary key (vehicle_listing_id, visitor_hash, day)
);

create index vehicle_view_days_day on public.vehicle_view_days (day);

alter table public.contact_enquiries add column vehicle_listing_id uuid references public.vehicle_listings (id) on delete set null;

create trigger set_updated_at before update on public.vehicle_listings
  for each row execute function private.set_updated_at();

alter table public.vehicle_listings enable row level security;
alter table public.vehicle_view_totals enable row level security;
alter table public.vehicle_view_days enable row level security;
revoke all on public.vehicle_listings, public.vehicle_view_totals, public.vehicle_view_days from public, anon, authenticated;

-- What anyone may see: published trips that have not left yet, from verified, active sellers.
-- A seller who loses verification has their trips hidden until it returns (Q-05).
create view public.public_vehicle_listings as
  select
    v.id, v.slug, v.make, v.model, v.year, v.origin_city, v.destination_city, v.departure_date,
    v.available_kg, v.restrictions, v.cargo_status, v.first_published_at,
    coalesce((select t.views from public.vehicle_view_totals t where t.vehicle_listing_id = v.id), 0)::bigint as view_count,
    coalesce((
      select jsonb_agg(jsonb_build_object('url', m.secure_url, 'alt', coalesce(nullif(m.alt_text, ''), v.year || ' ' || v.make || ' ' || v.model)) order by m.is_primary desc, m.display_order)
      from public.media_assets m where m.entity_type = 'vehicle' and m.entity_id = v.id
    ), '[]'::jsonb) as images,
    s.slug as seller_slug, s.name as seller_name, s.city as seller_city,
    s.verification_status in ('provider_verified', 'manually_verified') as seller_verified
  from public.vehicle_listings v
  join public.sellers s on s.id = v.seller_id
  where v.status = 'published' and v.deleted_at is null and s.status = 'active'
    and s.verification_status in ('provider_verified', 'manually_verified')
    and v.departure_date >= (now() at time zone 'America/Toronto')::date;

grant select on public.public_vehicle_listings to anon, authenticated;

-- The seller's own listings, any state.
create function private.require_vehicle_owner(p_listing uuid)
returns public.vehicle_listings
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_listing public.vehicle_listings;
begin
  perform private.require_active_account();
  select * into v_listing from public.vehicle_listings where id = p_listing and deleted_at is null;
  if not found or not private.is_active_seller_owner(v_listing.seller_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return v_listing;
end;
$$;

create function private.require_verified_shop()
returns public.sellers
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_shop public.sellers;
begin
  perform private.require_active_account();
  select * into v_shop from public.sellers where owner_user_id = auth.uid();
  if not found or not private.is_active_seller_owner(v_shop.id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if v_shop.verification_status not in ('provider_verified', 'manually_verified') then
    raise exception 'VERIFICATION_REQUIRED' using errcode = '42501';
  end if;
  return v_shop;
end;
$$;

revoke all on function private.require_vehicle_owner(uuid) from public;
revoke all on function private.require_verified_shop() from public;

create function public.my_vehicle_listings()
returns table (id uuid, slug text, make text, model text, year integer, origin_city text, destination_city text, departure_date date,
  available_kg integer, restrictions text[], cargo_status text, status text, views bigint, photos jsonb, is_public boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.slug, v.make, v.model, v.year, v.origin_city, v.destination_city, v.departure_date, v.available_kg, v.restrictions,
    v.cargo_status, v.status,
    coalesce((select t.views from public.vehicle_view_totals t where t.vehicle_listing_id = v.id), 0)::bigint,
    coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'secure_url', m.secure_url, 'is_primary', m.is_primary, 'display_order', m.display_order, 'entity_id', m.entity_id) order by m.is_primary desc, m.display_order)
      from public.media_assets m where m.entity_type = 'vehicle' and m.entity_id = v.id), '[]'::jsonb),
    exists (select 1 from public.public_vehicle_listings pv where pv.id = v.id)
  from public.vehicle_listings v
  join public.sellers s on s.id = v.seller_id
  where s.owner_user_id = auth.uid() and v.deleted_at is null
  order by v.departure_date, v.id;
$$;

create function public.save_vehicle_listing(
  p_id uuid,
  p_make text,
  p_model text,
  p_year integer,
  p_origin text,
  p_destination text,
  p_departure date,
  p_available_kg integer,
  p_restrictions text[],
  p_cargo_status text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop public.sellers := private.require_verified_shop();
  v_id uuid := p_id;
  v_listing public.vehicle_listings;
  v_restrictions text[] := (select coalesce(array_agg(btrim(r)), '{}') from unnest(coalesce(p_restrictions, '{}')) r where btrim(r) <> '');
begin
  if p_departure is null or p_departure < (now() at time zone 'America/Toronto')::date then
    raise exception 'DEPARTURE_IN_PAST' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(v_restrictions) r where char_length(r) > 120) then
    raise exception 'DETAILS_INVALID' using errcode = '23514';
  end if;
  begin
    if v_id is null then
      insert into public.vehicle_listings (seller_id, slug, make, model, year, origin_city, destination_city, departure_date, available_kg, restrictions, cargo_status, created_by)
      values (v_shop.id, private.unique_slug(p_year || ' ' || coalesce(p_make, '') || ' ' || coalesce(p_model, ''), 'public.vehicle_listings', 'car'),
        btrim(p_make), btrim(p_model), p_year, btrim(p_origin), btrim(p_destination), p_departure, coalesce(p_available_kg, 0), v_restrictions,
        coalesce(p_cargo_status, 'accepting_cargo'), auth.uid())
      returning id into v_id;
      perform private.write_audit('vehicle.create', 'vehicle_listing', v_id::text, null, jsonb_build_object('name', p_year || ' ' || p_make || ' ' || p_model));
    else
      v_listing := private.require_vehicle_owner(v_id);
      if v_listing.status not in ('draft', 'published', 'unpublished') then
        raise exception 'LISTING_NOT_EDITABLE' using errcode = '55000';
      end if;
      update public.vehicle_listings set make = btrim(p_make), model = btrim(p_model), year = p_year, origin_city = btrim(p_origin),
        destination_city = btrim(p_destination), departure_date = p_departure, available_kg = coalesce(p_available_kg, 0),
        restrictions = v_restrictions, cargo_status = coalesce(p_cargo_status, 'accepting_cargo')
      where id = v_id;
      perform private.write_audit('vehicle.edit', 'vehicle_listing', v_id::text, null, jsonb_build_object('status', v_listing.status));
    end if;
  exception
    when check_violation then raise exception 'DETAILS_INVALID' using errcode = '23514';
    when not_null_violation then raise exception 'DETAILS_INVALID' using errcode = '23514';
  end;
  return v_id;
end;
$$;

-- Publishing needs a verified seller, an open shop and at least one photo. It never counts
-- towards the product allowance (Q-05).
create function public.publish_vehicle_listing(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop public.sellers := private.require_verified_shop();
  v_listing public.vehicle_listings := private.require_vehicle_owner(p_id);
begin
  if v_listing.status not in ('draft', 'unpublished') then
    raise exception 'LISTING_NOT_PUBLISHABLE' using errcode = '55000';
  end if;
  if v_shop.publishing_suspended or not private.setting_is_on('publishing.global_enabled') then
    raise exception 'SELLER_PUBLISHING_SUSPENDED' using errcode = '55000';
  end if;
  if not exists (select 1 from public.media_assets where entity_type = 'vehicle' and entity_id = p_id) then
    raise exception 'LISTING_INCOMPLETE' using errcode = '23514';
  end if;
  if v_listing.departure_date < (now() at time zone 'America/Toronto')::date then
    raise exception 'DEPARTURE_IN_PAST' using errcode = '23514';
  end if;
  update public.vehicle_listings set status = 'published', first_published_at = coalesce(first_published_at, now()) where id = p_id;
  perform private.write_audit('vehicle.publish', 'vehicle_listing', p_id::text, null, '{}'::jsonb);
end;
$$;

create function public.unpublish_vehicle_listing(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.vehicle_listings := private.require_vehicle_owner(p_id);
begin
  if v_listing.status <> 'published' then
    raise exception 'LISTING_NOT_PUBLISHED' using errcode = '55000';
  end if;
  update public.vehicle_listings set status = 'unpublished' where id = p_id;
  perform private.write_audit('vehicle.unpublish', 'vehicle_listing', p_id::text, null, '{}'::jsonb);
end;
$$;

-- A soft delete, like products. A suspended listing cannot be deleted to get round moderation.
create function public.delete_vehicle_listing(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.vehicle_listings := private.require_vehicle_owner(p_id);
begin
  if v_listing.status = 'suspended' then
    raise exception 'LISTING_SUSPENDED' using errcode = '55000';
  end if;
  update public.vehicle_listings set deleted_at = now(), status = 'archived' where id = p_id;
  perform private.write_audit('vehicle.delete', 'vehicle_listing', p_id::text, null, '{}'::jsonb);
end;
$$;

create function public.authorize_vehicle_image(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_listing public.vehicle_listings := private.require_vehicle_owner(p_id);
  v_max integer;
begin
  if v_listing.status not in ('draft', 'published', 'unpublished') then
    raise exception 'LISTING_NOT_EDITABLE' using errcode = '55000';
  end if;
  select (value #>> '{}')::integer into v_max from public.platform_settings where key = 'media.max_images';
  if (select count(*) from public.media_assets where entity_type = 'vehicle' and entity_id = p_id) >= v_max then
    raise exception 'IMAGE_LIMIT_REACHED' using errcode = '55000';
  end if;
  return jsonb_build_object(
    'max_images', v_max,
    'max_bytes', (select (value #>> '{}')::integer from public.platform_settings where key = 'media.max_image_bytes'),
    'max_dimension', (select (value #>> '{}')::integer from public.platform_settings where key = 'media.max_dimension'),
    'formats', (select value from public.platform_settings where key = 'media.allowed_formats')
  );
end;
$$;

create function public.record_vehicle_image(p_actor uuid, p_id uuid, p_public_id text, p_secure_url text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_asset uuid;
begin
  perform 1 from public.vehicle_listings where id = p_id for update;
  select count(*) into v_count from public.media_assets where entity_type = 'vehicle' and entity_id = p_id;
  insert into public.media_assets (entity_type, entity_id, cloudinary_public_id, secure_url, display_order, is_primary, uploaded_by)
  values ('vehicle', p_id, p_public_id, p_secure_url, v_count, v_count = 0, p_actor)
  returning id into v_asset;
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (p_actor, 'vehicle.image_add', 'vehicle_listing', p_id::text, '{}'::jsonb);
  return v_asset;
end;
$$;

create function public.remove_vehicle_image(p_asset_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.media_assets;
  v_listing public.vehicle_listings;
begin
  select * into v_asset from public.media_assets where id = p_asset_id and entity_type = 'vehicle';
  if not found then
    raise exception 'IMAGE_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_listing := private.require_vehicle_owner(v_asset.entity_id);
  if v_listing.status not in ('draft', 'published', 'unpublished') then
    raise exception 'LISTING_NOT_EDITABLE' using errcode = '55000';
  end if;
  if v_listing.status = 'published' and (select count(*) from public.media_assets where entity_type = 'vehicle' and entity_id = v_listing.id) = 1 then
    raise exception 'LAST_PHOTO' using errcode = '55000';
  end if;
  delete from public.media_assets where id = p_asset_id;
  if v_asset.is_primary then
    update public.media_assets set is_primary = true where id = (
      select id from public.media_assets where entity_type = 'vehicle' and entity_id = v_asset.entity_id order by display_order limit 1
    );
  end if;
  perform private.write_audit('vehicle.image_remove', 'vehicle_listing', v_listing.id::text, null, '{}'::jsonb);
  return v_asset.cloudinary_public_id;
end;
$$;

create function public.make_vehicle_image_primary(p_asset_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.media_assets;
begin
  select * into v_asset from public.media_assets where id = p_asset_id and entity_type = 'vehicle';
  if not found then
    raise exception 'IMAGE_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_vehicle_owner(v_asset.entity_id);
  update public.media_assets set is_primary = (id = p_asset_id) where entity_type = 'vehicle' and entity_id = v_asset.entity_id;
end;
$$;

create function public.record_vehicle_view(p_listing uuid, p_visitor_hash text, p_ip_hash text, p_viewer uuid default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'America/Toronto')::date;
  v_seller uuid;
begin
  select v.seller_id into v_seller from public.vehicle_listings v join public.public_vehicle_listings pv on pv.id = v.id where v.id = p_listing;
  if not found then
    return false;
  end if;
  if p_viewer is not null and exists (
    select 1 from public.sellers s where s.id = v_seller and (s.owner_user_id = p_viewer
      or exists (select 1 from public.seller_staff_memberships m where m.seller_id = s.id and m.user_id = p_viewer and m.status <> 'removed'))
  ) then
    return false;
  end if;
  begin
    perform private.hit_rate_limit('views:' || p_ip_hash, 'views.max_per_hour');
  exception when others then
    return false;
  end;
  insert into public.vehicle_view_days (vehicle_listing_id, visitor_hash, day) values (p_listing, p_visitor_hash, v_day) on conflict do nothing;
  if not found then
    return false;
  end if;
  insert into public.vehicle_view_totals (vehicle_listing_id, views) values (p_listing, 1)
  on conflict (vehicle_listing_id) do update set views = public.vehicle_view_totals.views + 1;
  delete from public.vehicle_view_days where day < v_day - 1;
  return true;
end;
$$;

create function public.prepare_vehicle_enquiry(p_listing_id uuid, p_visitor_email_hash text, p_ip_hash text)
returns table (
  enquiry_id uuid,
  seller_email text,
  seller_locale text,
  product_name text,
  product_slug text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seller uuid;
  v_owner uuid;
  v_email text;
  v_name text;
  v_slug text;
begin
  -- The public view decides what counts as public, so a draft, unpublished, deleted or
  -- suspended listing answers exactly like one that never existed.
  select v.seller_id, s.owner_user_id, v.year || ' ' || v.make || ' ' || v.model, v.slug into v_seller, v_owner, v_name, v_slug
  from public.public_vehicle_listings pv
  join public.vehicle_listings v on v.id = pv.id
  join public.sellers s on s.id = v.seller_id
  where pv.id = p_listing_id;
  if not found then
    raise exception 'LISTING_NOT_FOUND' using errcode = 'P0002';
  end if;

  select u.email::text into v_email from auth.users u
  where u.id = v_owner and u.email_confirmed_at is not null;
  if v_email is null then
    raise exception 'SELLER_CANNOT_RECEIVE' using errcode = '55000';
  end if;

  perform private.hit_rate_limit('contact:ip:' || p_ip_hash, 'contact.max_per_ip_hour');
  perform private.hit_rate_limit('contact:email:' || p_visitor_email_hash, 'contact.max_per_email_hour');
  perform private.hit_rate_limit('contact:seller:' || v_seller, 'contact.max_per_seller_hour');
  delete from public.rate_limit_counters where window_start < now() - interval '2 days';

  return query
  with created as (
    insert into public.contact_enquiries (vehicle_listing_id, seller_id, visitor_email_hash, ip_hash)
    values (p_listing_id, v_seller, p_visitor_email_hash, p_ip_hash)
    returning id
  )
  select c.id, v_email, coalesce((select pr.locale from public.profiles pr where pr.id = v_owner), 'en'), v_name, v_slug
  from created c;
end;
$$;

-- Moderation, with the permission the PRD names for this (§3.4).
create function public.admin_list_moderation_vehicles(p_status text default null, p_search text default null, p_limit integer default 10, p_offset integer default 0)
returns table (id uuid, slug text, name text, status text, origin_city text, destination_city text, departure_date date, seller_name text, is_public boolean, total bigint)
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
  if not private.has_permission('vehicle_listings.moderate') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return query
    select v.id, v.slug, v.year || ' ' || v.make || ' ' || v.model, v.status, v.origin_city, v.destination_city, v.departure_date, s.name,
      exists (select 1 from public.public_vehicle_listings pv where pv.id = v.id), count(*) over ()
    from public.vehicle_listings v join public.sellers s on s.id = v.seller_id
    where v.deleted_at is null and v.status <> 'draft'
      and (p_status is null or v.status = p_status)
      and (v_pattern is null or (v.make || ' ' || v.model) ilike v_pattern or s.name ilike v_pattern)
    order by v.updated_at desc, v.id
    limit greatest(least(coalesce(p_limit, 10), 50), 1)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create function public.set_vehicle_listing_suspended(p_id uuid, p_suspended boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
  v_listing public.vehicle_listings;
  v_owner uuid;
begin
  if not private.has_permission('vehicle_listings.moderate') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  v_reason := private.moderation_reason(p_reason);
  select * into v_listing from public.vehicle_listings where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'LISTING_NOT_FOUND' using errcode = 'P0002';
  end if;
  select owner_user_id into v_owner from public.sellers where id = v_listing.seller_id;
  perform private.refuse_own_moderation(v_owner);
  if p_suspended is null or (p_suspended and v_listing.status not in ('published', 'unpublished')) or (not p_suspended and v_listing.status <> 'suspended') then
    raise exception 'MODERATION_NOT_ALLOWED' using errcode = '55000';
  end if;
  -- Restored as not public, so the seller chooses when it goes live again.
  update public.vehicle_listings set status = case when p_suspended then 'suspended' else 'unpublished' end where id = p_id;
  perform private.write_audit(case when p_suspended then 'vehicle.suspend' else 'vehicle.restore' end, 'vehicle_listing', p_id::text, v_reason, '{}'::jsonb);
  perform private.enqueue_email(v_owner, case when p_suspended then 'product_suspended' else 'product_restored' end,
    jsonb_build_object('product', v_listing.year || ' ' || v_listing.make || ' ' || v_listing.model, 'reason', v_reason), 'moderation:' || gen_random_uuid());
end;
$$;

drop function public.my_moderation_access();
create function public.my_moderation_access()
returns table (products boolean, shops boolean, publishing boolean, vehicles boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission('products.moderate'), private.has_permission('sellers.manage'), private.has_permission('sellers.publishing'),
    private.has_permission('vehicle_listings.moderate');
$$;

revoke execute on function public.my_vehicle_listings() from public, anon;
grant execute on function public.my_vehicle_listings() to authenticated;
revoke execute on function public.save_vehicle_listing(uuid, text, text, integer, text, text, date, integer, text[], text) from public, anon;
grant execute on function public.save_vehicle_listing(uuid, text, text, integer, text, text, date, integer, text[], text) to authenticated;
revoke execute on function public.publish_vehicle_listing(uuid) from public, anon;
grant execute on function public.publish_vehicle_listing(uuid) to authenticated;
revoke execute on function public.unpublish_vehicle_listing(uuid) from public, anon;
grant execute on function public.unpublish_vehicle_listing(uuid) to authenticated;
revoke execute on function public.delete_vehicle_listing(uuid) from public, anon;
grant execute on function public.delete_vehicle_listing(uuid) to authenticated;
revoke execute on function public.authorize_vehicle_image(uuid) from public, anon;
grant execute on function public.authorize_vehicle_image(uuid) to authenticated;
revoke execute on function public.remove_vehicle_image(uuid) from public, anon;
grant execute on function public.remove_vehicle_image(uuid) to authenticated;
revoke execute on function public.make_vehicle_image_primary(uuid) from public, anon;
grant execute on function public.make_vehicle_image_primary(uuid) to authenticated;
revoke execute on function public.admin_list_moderation_vehicles(text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_moderation_vehicles(text, text, integer, integer) to authenticated;
revoke execute on function public.set_vehicle_listing_suspended(uuid, boolean, text) from public, anon;
grant execute on function public.set_vehicle_listing_suspended(uuid, boolean, text) to authenticated;
revoke execute on function public.my_moderation_access() from public, anon;
grant execute on function public.my_moderation_access() to authenticated;
revoke execute on function public.record_vehicle_image(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_vehicle_image(uuid, uuid, text, text) to service_role;
revoke execute on function public.record_vehicle_view(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.record_vehicle_view(uuid, text, text, uuid) to service_role;
revoke execute on function public.prepare_vehicle_enquiry(uuid, text, text) from public, anon, authenticated;
grant execute on function public.prepare_vehicle_enquiry(uuid, text, text) to service_role;
