-- The public reviews API also returns shop reviews from invited buyers (owner's request,
-- 2026-11-13, Q-67). Both kinds come from their public views, so the same rules apply: only
-- published reviews of live shops (and live products), and nothing while reviews are off.
create view public.public_api_reviews as
  select r.id, 'product'::text as kind, r.seller_slug, r.rating, r.body, r.is_verified_purchase, r.created_at,
    r.author_name, r.product_slug, r.product_name
  from public.public_shop_reviews r
  union all
  select r.id, 'shop'::text, r.seller_slug, r.rating, r.body, false, r.created_at,
    r.reviewer_name, null::text, null::text
  from public.public_seller_reviews r;
grant select on public.public_api_reviews to anon, authenticated;

create view public.public_api_review_stats as
  select r.seller_slug, r.kind, r.product_slug, count(*) as review_count, sum(r.rating) as rating_total
  from public.public_api_reviews r
  group by r.seller_slug, r.kind, r.product_slug;
grant select on public.public_api_review_stats to anon, authenticated;
