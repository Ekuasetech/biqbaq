-- Tests that try to break reviews and favourites.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000201', 'r-owner@example.com', now()),
  ('00000000-0000-4000-8000-000000000202', 'r-buyer@example.com', now()),
  ('00000000-0000-4000-8000-000000000203', 'r-staff@example.com', now()),
  ('00000000-0000-4000-8000-000000000204', 'r-mod@example.com', now()),
  ('00000000-0000-4000-8000-000000000205', 'r-other@example.com', now());
update profiles set display_name = 'Ada B.' where id = '00000000-0000-4000-8000-000000000202';
insert into user_roles (user_id, role_key) values
  ('00000000-0000-4000-8000-000000000201', 'seller'),
  ('00000000-0000-4000-8000-000000000203', 'seller_staff'),
  ('00000000-0000-4000-8000-000000000204', 'admin');
insert into user_role_permissions (user_role_id, permission_key)
  select id, 'products.moderate' from user_roles where user_id = '00000000-0000-4000-8000-000000000204' and role_key = 'admin';
insert into sellers (id, owner_user_id, slug, name, city) values
  ('00000000-0000-4000-8000-000000000c01', '00000000-0000-4000-8000-000000000201', 'r-shop', 'R Shop', 'Toronto');
insert into seller_staff_memberships (seller_id, user_id, status) values
  ('00000000-0000-4000-8000-000000000c01', '00000000-0000-4000-8000-000000000203', 'suspended');
insert into products (id, seller_id, created_by, slug, name, description, price_minor, currency, status, first_published_at) values
  ('00000000-0000-4000-8000-000000000d01', '00000000-0000-4000-8000-000000000c01', '00000000-0000-4000-8000-000000000201', 'r-live', 'R Live', 'x', 100, 'CAD', 'published', now()),
  ('00000000-0000-4000-8000-000000000d02', '00000000-0000-4000-8000-000000000c01', '00000000-0000-4000-8000-000000000201', 'r-draft', 'R Draft', 'x', 100, 'CAD', 'draft', null);
create temp table v (live uuid, draft uuid);
insert into v values ('00000000-0000-4000-8000-000000000d01', '00000000-0000-4000-8000-000000000d02');
grant select on v to authenticated, anon;

-- Tables are closed. Visitors can read the public view only.
set local role anon;
select throws_ok($$ select * from reviews $$, '42501', null, 'visitors cannot read reviews directly');
select throws_ok($$ select save_review((select live from v), 5, 'x') $$, '42501', null, 'visitors cannot review');
select throws_ok($$ select set_favourite((select live from v), true) $$, '42501', null, 'or save favourites');
select lives_ok($$ select * from public_reviews $$, 'but they can read published reviews');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000202');
set local role authenticated;
select throws_ok($$ insert into reviews (product_id, author_id, rating) values ((select live from v), auth.uid(), 5) $$, '42501', null, 'nobody writes a review directly');
select throws_ok($$ select * from favourites $$, '42501', null, 'or reads favourites directly');

-- A buyer reviews once, and can change it.
select results_eq($$ select can_review, reason from my_review_state((select live from v)) $$, $$ values (true, null::text) $$, 'a buyer may review');
select throws_ok($$ select save_review((select live from v), 0, 'x') $$, '23514', 'RATING_INVALID', 'a rating below 1 is refused');
select throws_ok($$ select save_review((select live from v), 6, 'x') $$, '23514', 'RATING_INVALID', 'a rating above 5 is refused');
select throws_ok($$ select save_review((select live from v), null, 'x') $$, '23514', 'RATING_INVALID', 'a rating is needed');
select throws_ok(format($$ select save_review((select live from v), 5, %L) $$, repeat('x', 2001)), '23514', 'REVIEW_TOO_LONG', 'an overlong review is refused');
select throws_ok($$ select save_review((select draft from v), 5, 'x') $$, 'P0002', 'PRODUCT_NOT_FOUND', 'a draft cannot be reviewed');
select lives_ok($$ select save_review((select live from v), 4, '  Good  ') $$, 'the buyer reviews');
select lives_ok($$ select save_review((select live from v), 5, 'Even better') $$, 'and changes their mind');
reset role;
select is((select count(*)::int from reviews where author_id = '00000000-0000-4000-8000-000000000202'), 1, 'it stays one review per product');
select results_eq($$ select rating, body, author_name, is_verified_purchase from public_reviews $$, $$ values (5, 'Even better', 'Ada B.', false) $$, 'the public sees it with a display name only');
select hasnt_column('public', 'public_reviews', 'author_id', 'the public view does not reveal who wrote it');
update reviews set is_verified_purchase = false;
select pg_temp.act_as('00000000-0000-4000-8000-000000000202');
set local role authenticated;
select throws_ok($$ update reviews set is_verified_purchase = true $$, '42501', null, 'nobody can mark their own review as a verified purchase');
reset role;

-- The seller and their staff, in any state, cannot review the shop.
select pg_temp.act_as('00000000-0000-4000-8000-000000000201');
set local role authenticated;
select results_eq($$ select can_review, reason from my_review_state((select live from v)) $$, $$ values (false, 'own_shop') $$, 'the seller is told they cannot');
select throws_ok($$ select save_review((select live from v), 5, 'Best shop!') $$, '42501', 'CANNOT_REVIEW_OWN', 'and cannot review their own product');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000203');
set local role authenticated;
select throws_ok($$ select save_review((select live from v), 5, 'Best shop!') $$, '42501', 'CANNOT_REVIEW_OWN', 'nor can their staff, even while suspended');
reset role;

-- Moderation.
select pg_temp.act_as('00000000-0000-4000-8000-000000000205');
set local role authenticated;
select throws_ok($$ select * from admin_list_reviews() $$, '42501', null, 'a buyer cannot list reviews for moderation');
select throws_ok($$ select set_review_hidden((select id from reviews limit 1), true, 'x') $$, '42501', null, 'or hide one');
reset role;
create temp table rv as select id from reviews;
grant select on rv to authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-000000000204');
set local role authenticated;
select is((select author_email from admin_list_reviews('published', 'Even')), 'r-buyer@example.com', 'a moderator finds it');
select throws_ok($$ select set_review_hidden((select id from rv), true, ' ') $$, '23514', 'REASON_REQUIRED', 'hiding needs a reason');
select lives_ok($$ select set_review_hidden((select id from rv), true, 'Spam') $$, 'a moderator hides it');
select throws_ok($$ select set_review_hidden((select id from rv), true, 'Again') $$, '55000', 'MODERATION_NOT_ALLOWED', 'hiding twice is refused');
reset role;
select is_empty($$ select 1 from public_reviews $$, 'a hidden review leaves the page');
select is((select count(*)::int from audit_logs where action = 'review.hide' and reason = 'Spam'), 1, 'and it is audited');
select pg_temp.act_as('00000000-0000-4000-8000-000000000202');
set local role authenticated;
select throws_ok($$ select save_review((select live from v), 5, 'Back again') $$, '55000', 'REVIEW_HIDDEN', 'the author cannot bring it back by editing');
select throws_ok($$ select delete_my_review((select live from v)) $$, 'P0002', 'REVIEW_NOT_FOUND', 'or delete it to start over');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000204');
set local role authenticated;
select lives_ok($$ select set_review_hidden((select id from rv), false, 'Reviewed again') $$, 'a moderator shows it again');
reset role;

-- Reviews of a product that is no longer public disappear with it.
update products set status = 'unpublished' where id = (select live from v);
select is_empty($$ select 1 from public_reviews $$, 'an unpublished product shows no reviews');
update products set status = 'published' where id = (select live from v);

-- Deleting your own.
select pg_temp.act_as('00000000-0000-4000-8000-000000000202');
set local role authenticated;
select lives_ok($$ select delete_my_review((select live from v)) $$, 'the author deletes their review');
select is_empty($$ select 1 from public_reviews $$, 'and it is gone');
reset role;

-- Turning reviews off.
update platform_settings set value = 'false' where key = 'reviews.enabled';
select pg_temp.act_as('00000000-0000-4000-8000-000000000202');
set local role authenticated;
select throws_ok($$ select save_review((select live from v), 5, 'x') $$, '55000', 'REVIEWS_DISABLED', 'nobody can review while reviews are off');
reset role;
update platform_settings set value = 'true' where key = 'reviews.enabled';

-- Too many reviews too quickly.
insert into products (id, seller_id, created_by, slug, name, description, price_minor, currency, status, first_published_at)
  select ('00000000-0000-4000-8000-0000000e00' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-4000-8000-000000000c01', '00000000-0000-4000-8000-000000000201', 'r-many-' || n, 'Many ' || n, 'x', 100, 'CAD', 'published', now()
  from generate_series(1, 3) n;
update platform_settings set value = '2' where key = 'reviews.max_per_hour';
delete from rate_limit_counters;
select pg_temp.act_as('00000000-0000-4000-8000-000000000205');
set local role authenticated;
select lives_ok($$ select save_review('00000000-0000-4000-8000-0000000e0001', 5, '') $$, 'a first review');
select lives_ok($$ select save_review('00000000-0000-4000-8000-0000000e0002', 5, '') $$, 'a second review');
select throws_ok($$ select save_review('00000000-0000-4000-8000-0000000e0003', 5, '') $$, 'P0001', 'RATE_LIMITED', 'a third in the hour is refused');
select lives_ok($$ select save_review('00000000-0000-4000-8000-0000000e0001', 3, 'Changed my mind') $$, 'editing an existing review does not count');
reset role;

-- Favourites.
select pg_temp.act_as('00000000-0000-4000-8000-000000000202');
set local role authenticated;
select lives_ok($$ select set_favourite((select live from v), true) $$, 'a buyer saves a product');
select lives_ok($$ select set_favourite((select live from v), true) $$, 'saving twice is harmless');
select ok(is_favourite((select live from v)), 'it is saved');
select throws_ok($$ select set_favourite((select draft from v), true) $$, 'P0002', 'PRODUCT_NOT_FOUND', 'a draft cannot be saved');
select results_eq($$ select name, available from my_favourites() $$, $$ values ('R Live', true) $$, 'it is in their list');
select results_eq($$ select total from my_favourites(20, 0) $$, $$ values (1::bigint) $$, 'with how many there are in all, for pages');
select is_empty($$ select 1 from my_favourites(20, 20) $$, 'and nothing on a page past the end');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000205');
set local role authenticated;
select is_empty($$ select 1 from my_favourites() $$, 'nobody else sees it');
select ok(not is_favourite((select live from v)), 'or has it saved');
reset role;
update products set status = 'unpublished' where id = (select live from v);
select pg_temp.act_as('00000000-0000-4000-8000-000000000202');
set local role authenticated;
select results_eq($$ select name, available from my_favourites() $$, $$ values (null::text, false) $$, 'a product that has gone shows as unavailable, with no details');
select lives_ok($$ select set_favourite((select live from v), false) $$, 'and can still be removed');
select is_empty($$ select 1 from my_favourites() $$, 'and is gone');
reset role;
update platform_settings set value = 'false' where key = 'favourites.enabled';
update products set status = 'published' where id = (select live from v);
select pg_temp.act_as('00000000-0000-4000-8000-000000000202');
set local role authenticated;
select throws_ok($$ select set_favourite((select live from v), true) $$, '55000', 'FAVOURITES_DISABLED', 'nothing is saved while favourites are off');
reset role;

select * from finish();
rollback;
