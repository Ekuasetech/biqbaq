-- Reviews of a shop from its buyers, by invitation (owner's request of 2026-11-13, Q-67). The
-- seller makes a one-time link for a buyer; the buyer, with or without an account, gives a
-- name, 1 to 5 stars and words; it shows at once on the seller's page, marked as invited by
-- the shop. The seller cannot delete reviews; Biqbaq's moderators can hide abusive ones.
-- Nothing shows, and nothing can be sent, while Super Admin has reviews switched off.

insert into public.platform_settings (key, value, description, is_public) values
  ('reviews.max_invites_per_day', '50', 'Most review links one shop can make in a day', false),
  ('reviews.max_invited_per_ip_hour', '10', 'Most invited reviews from one connection in an hour', false);

create table public.shop_review_invites (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers (id) on delete cascade,
  -- Long and random: the link itself is the permission to review, once.
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  buyer_name text not null check (char_length(buyer_name) between 1 and 80),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  used_at timestamptz,
  cancelled_at timestamptz
);
create index shop_review_invites_seller on public.shop_review_invites (seller_id, created_at desc);

create table public.shop_reviews (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers (id) on delete cascade,
  invite_id uuid not null unique references public.shop_review_invites (id) on delete cascade,
  reviewer_name text not null check (char_length(reviewer_name) between 1 and 80),
  rating integer not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 2000),
  status text not null default 'published' check (status in ('published', 'hidden')),
  hidden_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shop_reviews_seller on public.shop_reviews (seller_id, created_at desc);
create trigger set_updated_at before update on public.shop_reviews
  for each row execute function private.set_updated_at();

alter table public.shop_review_invites enable row level security;
alter table public.shop_reviews enable row level security;
revoke all on public.shop_review_invites, public.shop_reviews from public, anon, authenticated;
-- No policies: everything goes through the view and functions below.

-- What visitors see on a seller's page: published reviews of a public shop, while reviews are on.
create view public.public_seller_reviews as
  select r.id, s.slug as seller_slug, r.reviewer_name, r.rating, r.body, r.created_at
  from public.shop_reviews r
  join public.public_sellers s on s.id = r.seller_id
  where r.status = 'published'
    and exists (select 1 from public.platform_settings x where x.key = 'reviews.enabled' and x.value = 'true'::jsonb);
grant select on public.public_seller_reviews to anon, authenticated;

-- The seller makes a link for one buyer. Only the shop's owner, and only while reviews are on.
create function public.create_review_invite(p_seller uuid, p_buyer_name text)
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_active_account();
  v_name text := btrim(coalesce(p_buyer_name, ''));
  v_row public.shop_review_invites;
begin
  if not private.is_active_seller_owner(p_seller) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if not private.setting_is_on('reviews.enabled') then
    raise exception 'REVIEWS_OFF' using errcode = '55000';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'DETAILS_INVALID' using errcode = '23514';
  end if;
  if (select count(*) from public.shop_review_invites i where i.seller_id = p_seller and i.created_at > now() - interval '1 day')
     >= private.setting_integer('reviews.max_invites_per_day') then
    raise exception 'TOO_MANY_INVITES' using errcode = 'P0001';
  end if;
  insert into public.shop_review_invites (seller_id, buyer_name, created_by) values (p_seller, v_name, v_user) returning * into v_row;
  return query select v_row.id, v_row.token, v_row.expires_at;
end;
$$;
revoke execute on function public.create_review_invite(uuid, text) from public, anon;
grant execute on function public.create_review_invite(uuid, text) to authenticated;

-- The shop's links and how each stands, newest first, a page at a time.
create function public.list_review_invites(p_seller uuid, p_limit integer default 20, p_offset integer default 0)
returns table (id uuid, token text, buyer_name text, created_at timestamptz, expires_at timestamptz, state text,
  rating integer, total bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_seller_owner(p_seller) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return query
  select i.id, i.token, i.buyer_name, i.created_at, i.expires_at,
    case when i.used_at is not null then 'reviewed' when i.cancelled_at is not null then 'cancelled'
         when i.expires_at < now() then 'expired' else 'waiting' end,
    r.rating, count(*) over ()
  from public.shop_review_invites i
  left join public.shop_reviews r on r.invite_id = i.id
  where i.seller_id = p_seller
  order by i.created_at desc, i.id
  limit greatest(least(coalesce(p_limit, 20), 100), 1) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke execute on function public.list_review_invites(uuid, integer, integer) from public, anon;
grant execute on function public.list_review_invites(uuid, integer, integer) to authenticated;

-- The seller withdraws a link not yet used.
create function public.cancel_review_invite(p_invite uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.shop_review_invites;
begin
  select * into v_invite from public.shop_review_invites where id = p_invite;
  if not found or not private.is_active_seller_owner(v_invite.seller_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  update public.shop_review_invites set cancelled_at = now() where id = p_invite and used_at is null and cancelled_at is null;
end;
$$;
revoke execute on function public.cancel_review_invite(uuid) from public, anon;
grant execute on function public.cancel_review_invite(uuid) to authenticated;

-- Server only: what a link is for, so its page can greet the buyer. Says nothing more.
create function public.lookup_review_invite(p_token text)
returns table (state text, shop_name text, shop_slug text, buyer_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case when not private.setting_is_on('reviews.enabled') or s.status <> 'active' then 'unavailable'
         when i.used_at is not null then 'used' when i.cancelled_at is not null or i.expires_at < now() then 'expired'
         else 'open' end,
    s.name, s.slug, i.buyer_name
  from public.shop_review_invites i join public.sellers s on s.id = i.seller_id
  where i.token = p_token;
$$;
revoke execute on function public.lookup_review_invite(text) from public, anon, authenticated;
grant execute on function public.lookup_review_invite(text) to service_role;

-- Server only: the buyer's review. The link works once; the seller is told.
create function public.submit_invited_review(p_token text, p_name text, p_rating integer, p_body text, p_ip_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.shop_review_invites;
  v_shop public.sellers;
  v_name text := btrim(coalesce(p_name, ''));
  v_body text := btrim(coalesce(p_body, ''));
begin
  perform private.hit_rate_limit('invited_review:ip:' || coalesce(p_ip_hash, 'unknown'), 'reviews.max_invited_per_ip_hour');
  select * into v_invite from public.shop_review_invites where token = p_token for update;
  if not found then
    raise exception 'INVITE_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v_shop from public.sellers where id = v_invite.seller_id;
  if not private.setting_is_on('reviews.enabled') or v_shop.status <> 'active' then
    raise exception 'REVIEWS_OFF' using errcode = '55000';
  end if;
  if v_invite.used_at is not null then
    raise exception 'INVITE_USED' using errcode = '55000';
  end if;
  if v_invite.cancelled_at is not null or v_invite.expires_at < now() then
    raise exception 'INVITE_EXPIRED' using errcode = '55000';
  end if;
  if char_length(v_name) not between 1 and 80 or p_rating is null or p_rating not between 1 and 5 or char_length(v_body) > 2000 then
    raise exception 'DETAILS_INVALID' using errcode = '23514';
  end if;
  insert into public.shop_reviews (seller_id, invite_id, reviewer_name, rating, body)
  values (v_invite.seller_id, v_invite.id, v_name, p_rating, v_body);
  update public.shop_review_invites set used_at = now() where id = v_invite.id;
  perform private.enqueue_email(v_shop.owner_user_id, 'shop_review_received', jsonb_build_object('shop', v_shop.name), 'shop_review:' || v_invite.id);
  return v_shop.slug;
end;
$$;
revoke execute on function public.submit_invited_review(text, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.submit_invited_review(text, text, integer, text, text) to service_role;

-- Moderators (products.moderate) see shop reviews, hidden or not, and hide or restore them.
create function public.admin_list_shop_reviews(p_status text default null, p_search text default null, p_limit integer default 20, p_offset integer default 0)
returns table (id uuid, shop_name text, shop_slug text, reviewer_name text, rating integer, body text, status text,
  hidden_reason text, created_at timestamptz, total bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not private.has_permission('products.moderate') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return query
  select r.id, s.name, s.slug, r.reviewer_name, r.rating, r.body, r.status, r.hidden_reason, r.created_at, count(*) over ()
  from public.shop_reviews r join public.sellers s on s.id = r.seller_id
  where (p_status is null or r.status = p_status)
    and (v_search is null or s.name ilike '%' || v_search || '%' or r.reviewer_name ilike '%' || v_search || '%' or r.body ilike '%' || v_search || '%')
  order by r.created_at desc, r.id
  limit greatest(least(coalesce(p_limit, 20), 100), 1) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke execute on function public.admin_list_shop_reviews(text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_shop_reviews(text, text, integer, integer) to authenticated;

create function public.set_shop_review_hidden(p_review uuid, p_hidden boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not private.has_permission('products.moderate') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_hidden and v_reason is null then
    raise exception 'REASON_REQUIRED' using errcode = '23514';
  end if;
  update public.shop_reviews set status = case when p_hidden then 'hidden' else 'published' end,
    hidden_reason = case when p_hidden then left(v_reason, 500) end
  where id = p_review;
  if not found then
    raise exception 'REVIEW_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.write_audit(case when p_hidden then 'shop_review.hide' else 'shop_review.restore' end, 'shop_review', p_review::text, v_reason, '{}'::jsonb);
end;
$$;
revoke execute on function public.set_shop_review_hidden(uuid, boolean, text) from public, anon;
grant execute on function public.set_shop_review_hidden(uuid, boolean, text) to authenticated;

-- The seller's new-review notice is a shop notice: bell, email, and a push if chosen.
create or replace function private.push_category(p_template text)
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
