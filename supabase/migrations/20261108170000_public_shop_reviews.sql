-- A shop's reviews for its own website (owner's request of 2026-11-08), alongside the public
-- product API (PRD §10). It shows only what product pages already show: published reviews on
-- live products of a public shop, with the reviewer's name as Biqbaq shows it (owner's
-- choice). While Super Admin has reviews switched off (PRD §7.3), there are none.

create view public.public_shop_reviews as
  select r.id, r.rating, r.body, r.is_verified_purchase, r.created_at, r.author_name,
    pp.slug as product_slug, pp.name as product_name, pp.seller_slug
  from public.public_reviews r
  join public.public_products pp on pp.id = r.product_id
  -- Read from the table, as visitors cannot run Biqbaq's private functions.
  where exists (select 1 from public.platform_settings s where s.key = 'reviews.enabled' and s.value = 'true'::jsonb);

grant select on public.public_shop_reviews to anon, authenticated;

-- Each product's review count and rating total, for the shop's summary. A view rather than a
-- function, as visitors run no functions (the database's own rule).
create view public.public_shop_review_stats as
  select r.seller_slug, r.product_slug, count(*) as review_count, sum(r.rating) as rating_total
  from public.public_shop_reviews r
  group by r.seller_slug, r.product_slug;

grant select on public.public_shop_review_stats to anon, authenticated;
