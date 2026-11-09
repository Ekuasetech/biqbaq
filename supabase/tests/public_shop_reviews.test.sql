-- Tests that try to break a shop's public reviews, for its own website.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000e01', 'sr-owner@example.com', now()),
  ('00000000-0000-4000-8000-000000000e02', 'sr-ada@example.com', now()),
  ('00000000-0000-4000-8000-000000000e03', 'sr-bola@example.com', now()),
  ('00000000-0000-4000-8000-000000000e04', 'sr-other@example.com', now());
update profiles set display_name = 'Ada Obi' where id = '00000000-0000-4000-8000-000000000e02';
update profiles set display_name = '' where id = '00000000-0000-4000-8000-000000000e03';
insert into user_roles (user_id, role_key) values ('00000000-0000-4000-8000-000000000e01', 'seller'), ('00000000-0000-4000-8000-000000000e04', 'seller');
insert into sellers (id, owner_user_id, slug, name, city) values
  ('00000000-0000-4000-8000-000000000e11', '00000000-0000-4000-8000-000000000e01', 'sr-shop', 'SR Shop', 'Toronto'),
  ('00000000-0000-4000-8000-000000000e14', '00000000-0000-4000-8000-000000000e04', 'sr-other', 'SR Other', 'Toronto');
insert into products (id, seller_id, created_by, slug, name, description, price_minor, currency, status, first_published_at) values
  ('00000000-0000-4000-8000-000000000e21', '00000000-0000-4000-8000-000000000e11', '00000000-0000-4000-8000-000000000e01', 'sr-rice', 'SR Rice', 'x', 100, 'CAD', 'published', now()),
  ('00000000-0000-4000-8000-000000000e22', '00000000-0000-4000-8000-000000000e11', '00000000-0000-4000-8000-000000000e01', 'sr-beans', 'SR Beans', 'x', 100, 'CAD', 'published', now()),
  ('00000000-0000-4000-8000-000000000e23', '00000000-0000-4000-8000-000000000e11', '00000000-0000-4000-8000-000000000e01', 'sr-draft', 'SR Draft', 'x', 100, 'CAD', 'draft', null),
  ('00000000-0000-4000-8000-000000000e24', '00000000-0000-4000-8000-000000000e14', '00000000-0000-4000-8000-000000000e04', 'sr-elsewhere', 'SR Elsewhere', 'x', 100, 'CAD', 'published', now());
insert into reviews (product_id, author_id, rating, body, is_verified_purchase, status) values
  ('00000000-0000-4000-8000-000000000e21', '00000000-0000-4000-8000-000000000e02', 5, 'Lovely rice', true, 'published'),
  ('00000000-0000-4000-8000-000000000e22', '00000000-0000-4000-8000-000000000e02', 4, 'Good beans', false, 'published'),
  ('00000000-0000-4000-8000-000000000e22', '00000000-0000-4000-8000-000000000e03', 1, 'Rude words', false, 'hidden'),
  ('00000000-0000-4000-8000-000000000e21', '00000000-0000-4000-8000-000000000e03', 2, '', false, 'published'),
  ('00000000-0000-4000-8000-000000000e23', '00000000-0000-4000-8000-000000000e02', 3, 'On a draft', false, 'published'),
  ('00000000-0000-4000-8000-000000000e24', '00000000-0000-4000-8000-000000000e02', 5, 'Another shop', false, 'published');
update platform_settings set value = 'true' where key = 'reviews.enabled';

set local role anon;
select results_eq($$ select product_slug, rating, body, author_name, is_verified_purchase from public_shop_reviews where seller_slug = 'sr-shop' order by rating desc $$,
  $$ values ('sr-rice', 5, 'Lovely rice', 'Ada Obi', true), ('sr-beans', 4, 'Good beans', 'Ada Obi', false), ('sr-rice', 2, '', null, false) $$,
  'a visitor sees the shop''s published reviews on live products, with names as Biqbaq shows them');
select is_empty($$ select 1 from public_shop_reviews where seller_slug = 'sr-shop' and body in ('Rude words', 'On a draft', 'Another shop') $$, 'never hidden reviews, drafts or another shop''s');
select results_eq($$ select sum(review_count)::int, sum(rating_total)::int from public_shop_review_stats where seller_slug = 'sr-shop' $$, $$ values (3, 11) $$, 'the summary counts the same reviews');
select results_eq($$ select review_count::int, rating_total::int from public_shop_review_stats where seller_slug = 'sr-shop' and product_slug = 'sr-rice' $$, $$ values (2, 7) $$, 'or one product''s');
select is_empty($$ select 1 from public_shop_review_stats where seller_slug = 'nobody' $$, 'an unknown shop has none');
select throws_ok($$ select * from reviews $$, '42501', null, 'the reviews table itself stays closed');
reset role;

-- Reviews switched off by Super Admin: none at all.
update platform_settings set value = 'false' where key = 'reviews.enabled';
set local role anon;
select is_empty($$ select 1 from public_shop_reviews $$, 'with reviews off, nothing is shown');
select is_empty($$ select 1 from public_shop_review_stats $$, 'and the summary is empty');
reset role;
update platform_settings set value = 'true' where key = 'reviews.enabled';

-- A suspended shop leaves the public site, and its reviews with it.
update sellers set status = 'suspended' where id = '00000000-0000-4000-8000-000000000e11';
set local role anon;
select is_empty($$ select 1 from public_shop_reviews where seller_slug = 'sr-shop' $$, 'a suspended shop shows no reviews');
reset role;

select * from finish();
rollback;
