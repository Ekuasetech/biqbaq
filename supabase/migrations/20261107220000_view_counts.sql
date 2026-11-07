-- View counts (PRD-adjacent owner request, decided 2026-11-07, Q-16): one view per visitor per
-- product per day, not counting bots or the shop's own seller and staff.

insert into public.platform_settings (key, value, description, is_public) values
  ('views.max_per_hour', '300', 'Most product views one internet address can add in an hour', false);

-- Kept apart from products, so a view never looks like an edit to the product.
create table public.product_view_totals (
  product_id uuid primary key references public.products (id) on delete cascade,
  views bigint not null default 0
);

-- Only who has viewed today, by a scrambled key that cannot be turned back into an address or
-- account. Rows older than two days are removed, so it cannot become a browsing history.
create table public.product_view_days (
  product_id uuid not null references public.products (id) on delete cascade,
  visitor_hash text not null,
  day date not null,
  primary key (product_id, visitor_hash, day)
);

create index product_view_days_day on public.product_view_days (day);

alter table public.product_view_totals enable row level security;
alter table public.product_view_days enable row level security;
revoke all on public.product_view_totals, public.product_view_days from public, anon, authenticated;

create or replace view public.public_products as
  select
    p.id, p.slug, p.name, p.description, p.price_minor, p.currency, p.availability,
    p.condition, p.attributes, coalesce((select t.views from public.product_view_totals t where t.product_id = p.id), 0)::bigint as view_count, p.first_published_at,
    coalesce((
      select jsonb_agg(jsonb_build_object('url', m.secure_url, 'alt', coalesce(nullif(m.alt_text, ''), p.name)) order by m.display_order)
      from public.media_assets m
      where m.entity_type = 'product' and m.entity_id = p.id
    ), '[]'::jsonb) as images,
    c.slug as category_slug, c.name_en as category_name_en, c.name_fr as category_name_fr,
    s.slug as seller_slug, s.name as seller_name, s.city as seller_city, s.country as seller_country,
    s.description as seller_description,
    s.verification_status in ('provider_verified', 'manually_verified') as seller_verified
  from public.products p
  join public.sellers s on s.id = p.seller_id
  left join public.categories c on c.id = p.category_id
  where p.status = 'published' and p.deleted_at is null and s.status = 'active';

create function public.record_product_view(p_product uuid, p_visitor_hash text, p_ip_hash text, p_viewer uuid default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'America/Toronto')::date;
  v_seller uuid;
begin
  select p.seller_id into v_seller from public.products p
  join public.public_products pp on pp.id = p.id
  where p.id = p_product;
  if not found then
    return false;
  end if;

  -- The seller and their staff, in any state, looking at their own shop.
  if p_viewer is not null and exists (
    select 1 from public.sellers s
    where s.id = v_seller and (
      s.owner_user_id = p_viewer
      or exists (select 1 from public.seller_staff_memberships m where m.seller_id = s.id and m.user_id = p_viewer and m.status <> 'removed')
    )
  ) then
    return false;
  end if;

  -- Stops one address inflating counts. Anything over the limit is simply not counted.
  begin
    perform private.hit_rate_limit('views:' || p_ip_hash, 'views.max_per_hour');
  exception when others then
    return false;
  end;

  insert into public.product_view_days (product_id, visitor_hash, day)
  values (p_product, p_visitor_hash, v_day)
  on conflict do nothing;
  if not found then
    return false;
  end if;

  insert into public.product_view_totals (product_id, views) values (p_product, 1)
  on conflict (product_id) do update set views = public.product_view_totals.views + 1;

  delete from public.product_view_days where day < v_day - 1;
  return true;
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
    ('views.max_per_hour', 10, 100000)
  ) as r (k, lo, hi) where r.k = p_key;

  -- A number with no limits listed here is refused, so a new one has to be given some.
  return v_min is not null
    and (p_value #>> '{}')::numeric between v_min and v_max
    and (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric);
end;
$$;

revoke all on function private.setting_value_is_valid(text, jsonb) from public;
revoke execute on function public.record_product_view(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.record_product_view(uuid, text, text, uuid) to service_role;
grant select on public.public_products to anon, authenticated;
