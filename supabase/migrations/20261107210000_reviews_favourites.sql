-- Reviews and favourites (PRD §7.3, §7.4). Decided by the owner (2026-11-07, Q-09): any
-- signed-in buyer may review, once per product, but never the seller or their staff.

insert into public.platform_settings (key, value, description, is_public) values
  ('reviews.enabled', 'true', 'Whether people can see and write product reviews', true),
  ('favourites.enabled', 'true', 'Whether people can save favourite products', true),
  ('reviews.max_per_hour', '10', 'Most reviews one person may write in an hour', false);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 2000),
  -- Set by the server once purchases exist. Nobody can set it themselves.
  is_verified_purchase boolean not null default false,
  status text not null default 'published' check (status in ('published', 'hidden')),
  hidden_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, author_id)
);

create index reviews_product on public.reviews (product_id, created_at desc) where status = 'published';

create table public.favourites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create trigger set_updated_at before update on public.reviews
  for each row execute function private.set_updated_at();

-- Reached only through the functions and the view below.
alter table public.reviews enable row level security;
alter table public.favourites enable row level security;
revoke all on public.reviews, public.favourites from public, anon, authenticated;

-- What anyone may see: published reviews of public products, with a display name only.
create view public.public_reviews as
  select r.id, r.product_id, r.rating, r.body, r.is_verified_purchase, r.created_at,
    nullif(btrim(p.display_name), '') as author_name
  from public.reviews r
  join public.public_products pp on pp.id = r.product_id
  left join public.profiles p on p.id = r.author_id
  where r.status = 'published';

grant select on public.public_reviews to anon, authenticated;

-- The seller and anyone on their staff, in any state, have an interest in the product.
create function private.has_interest_in_product(p_product uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.products pr
    join public.sellers s on s.id = pr.seller_id
    where pr.id = p_product and (
      s.owner_user_id = auth.uid()
      or exists (select 1 from public.seller_staff_memberships m where m.seller_id = s.id and m.user_id = auth.uid() and m.status <> 'removed')
    )
  );
$$;

revoke all on function private.has_interest_in_product(uuid) from public;

create function public.my_review_state(p_product uuid)
returns table (can_review boolean, reason text, rating integer, body text, status text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_review public.reviews;
begin
  select * into v_review from public.reviews where product_id = p_product and author_id = auth.uid();
  return query select
    v_reason is null,
    v_reason,
    v_review.rating,
    v_review.body,
    v_review.status
  from (select case
    when auth.uid() is null then 'signed_out'
    when not private.setting_is_on('reviews.enabled') then 'disabled'
    when not exists (select 1 from public.public_products where id = p_product) then 'not_public'
    when private.has_interest_in_product(p_product) then 'own_shop'
    when exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.status <> 'active') then 'account'
  end as v_reason) x;
end;
$$;

create function public.save_review(p_product uuid, p_rating integer, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_active_account();
  v_body text := btrim(coalesce(p_body, ''));
  v_existing public.reviews;
begin
  if not private.setting_is_on('reviews.enabled') then
    raise exception 'REVIEWS_DISABLED' using errcode = '55000';
  end if;
  if not exists (select 1 from public.public_products where id = p_product) then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if private.has_interest_in_product(p_product) then
    raise exception 'CANNOT_REVIEW_OWN' using errcode = '42501';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'RATING_INVALID' using errcode = '23514';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'REVIEW_TOO_LONG' using errcode = '23514';
  end if;

  select * into v_existing from public.reviews where product_id = p_product and author_id = v_user for update;
  if not found then
    perform private.hit_rate_limit('reviews:' || v_user, 'reviews.max_per_hour');
    insert into public.reviews (product_id, author_id, rating, body) values (p_product, v_user, p_rating, v_body);
  elsif v_existing.status = 'hidden' then
    -- Editing cannot be used to bring back a review a moderator hid.
    raise exception 'REVIEW_HIDDEN' using errcode = '55000';
  else
    update public.reviews set rating = p_rating, body = v_body where id = v_existing.id;
  end if;
end;
$$;

create function public.delete_my_review(p_product uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_active_account();
  delete from public.reviews where product_id = p_product and author_id = auth.uid() and status = 'published';
  if not found then
    raise exception 'REVIEW_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

create function public.set_favourite(p_product uuid, p_saved boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_active_account();
begin
  if p_saved then
    if not private.setting_is_on('favourites.enabled') then
      raise exception 'FAVOURITES_DISABLED' using errcode = '55000';
    end if;
    if not exists (select 1 from public.public_products where id = p_product) then
      raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002';
    end if;
    insert into public.favourites (user_id, product_id) values (v_user, p_product) on conflict do nothing;
  else
    -- Removing always works, even for a product that has since gone.
    delete from public.favourites where user_id = v_user and product_id = p_product;
  end if;
end;
$$;

create function public.is_favourite(p_product uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.favourites where user_id = auth.uid() and product_id = p_product);
$$;

-- A product that is no longer public stays saved, but shows as unavailable with no details.
create function public.my_favourites()
returns table (product_id uuid, slug text, name text, price_minor integer, currency text, image_url text, available boolean, saved_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select f.product_id, pp.slug, pp.name, pp.price_minor, pp.currency, pp.images -> 0 ->> 'url', pp.id is not null, f.created_at
  from public.favourites f
  left join public.public_products pp on pp.id = f.product_id
  where f.user_id = auth.uid()
  order by f.created_at desc;
$$;

create function public.admin_list_reviews(p_status text default null, p_search text default null, p_limit integer default 10, p_offset integer default 0)
returns table (id uuid, product_name text, product_slug text, seller_name text, author_name text, author_email text, rating integer, body text, status text, hidden_reason text, created_at timestamptz, total bigint)
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
  if not private.has_permission('products.moderate') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return query
    select r.id, pr.name, pr.slug, s.name, p.display_name, u.email::text, r.rating, r.body, r.status, r.hidden_reason, r.created_at, count(*) over ()
    from public.reviews r
    join public.products pr on pr.id = r.product_id
    join public.sellers s on s.id = pr.seller_id
    left join public.profiles p on p.id = r.author_id
    left join auth.users u on u.id = r.author_id
    where (p_status is null or r.status = p_status)
      and (v_pattern is null or pr.name ilike v_pattern or r.body ilike v_pattern or u.email ilike v_pattern or p.display_name ilike v_pattern)
    order by r.created_at desc, r.id
    limit greatest(least(coalesce(p_limit, 10), 50), 1)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create function public.set_review_hidden(p_review uuid, p_hidden boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
  v_review public.reviews;
begin
  if not private.has_permission('products.moderate') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  v_reason := private.moderation_reason(p_reason);
  select * into v_review from public.reviews where id = p_review for update;
  if not found then
    raise exception 'REVIEW_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_hidden is null or (v_review.status = 'hidden') = p_hidden then
    raise exception 'MODERATION_NOT_ALLOWED' using errcode = '55000';
  end if;
  update public.reviews
  set status = case when p_hidden then 'hidden' else 'published' end, hidden_reason = case when p_hidden then v_reason end
  where id = p_review;
  perform private.write_audit(case when p_hidden then 'review.hide' else 'review.restore' end, 'review', p_review::text, v_reason,
    jsonb_build_object('product', v_review.product_id, 'author', v_review.author_id));
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
    ('reviews.max_per_hour', 1, 100)
  ) as r (k, lo, hi) where r.k = p_key;

  -- A number with no limits listed here is refused, so a new one has to be given some.
  return v_min is not null
    and (p_value #>> '{}')::numeric between v_min and v_max
    and (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric);
end;
$$;

revoke all on function private.setting_value_is_valid(text, jsonb) from public;
revoke execute on function public.my_review_state(uuid) from public, anon;
grant execute on function public.my_review_state(uuid) to authenticated;
revoke execute on function public.save_review(uuid, integer, text) from public, anon;
grant execute on function public.save_review(uuid, integer, text) to authenticated;
revoke execute on function public.delete_my_review(uuid) from public, anon;
grant execute on function public.delete_my_review(uuid) to authenticated;
revoke execute on function public.set_favourite(uuid, boolean) from public, anon;
grant execute on function public.set_favourite(uuid, boolean) to authenticated;
revoke execute on function public.is_favourite(uuid) from public, anon;
grant execute on function public.is_favourite(uuid) to authenticated;
revoke execute on function public.my_favourites() from public, anon;
grant execute on function public.my_favourites() to authenticated;
revoke execute on function public.admin_list_reviews(text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_reviews(text, text, integer, integer) to authenticated;
revoke execute on function public.set_review_hidden(uuid, boolean, text) from public, anon;
grant execute on function public.set_review_hidden(uuid, boolean, text) to authenticated;
