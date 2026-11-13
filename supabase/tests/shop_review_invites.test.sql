-- Tests that try to break invited shop reviews: who makes links, what a link allows, who sees what.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000c71', 'ri-owner@example.com', now()),
  ('00000000-0000-4000-8000-000000000c72', 'ri-other@example.com', now()),
  ('00000000-0000-4000-8000-000000000c73', 'ri-mod@example.com', now());
insert into user_roles (user_id, role_key) values
  ('00000000-0000-4000-8000-000000000c71', 'seller'), ('00000000-0000-4000-8000-000000000c72', 'seller'), ('00000000-0000-4000-8000-000000000c73', 'admin');
insert into user_role_permissions (user_role_id, permission_key)
  select id, 'products.moderate' from user_roles where user_id = '00000000-0000-4000-8000-000000000c73' and role_key = 'admin';
insert into sellers (id, owner_user_id, slug, name, city) values
  ('00000000-0000-4000-8000-000000000c81', '00000000-0000-4000-8000-000000000c71', 'ri-shop', 'RI Shop', 'Toronto'),
  ('00000000-0000-4000-8000-000000000c82', '00000000-0000-4000-8000-000000000c72', 'ri-other', 'RI Other', 'Toronto');
update platform_settings set value = 'true' where key = 'reviews.enabled';
update platform_settings set value = 'true' where key = 'email.notifications_enabled';
update platform_settings set value = '3' where key = 'reviews.max_invites_per_day';
create temp table links (label text, id uuid, token text);
grant select, insert on links to authenticated, anon, service_role;

-- Only the shop's owner makes and sees its links.
select pg_temp.act_as('00000000-0000-4000-8000-000000000c72');
set local role authenticated;
select throws_ok($$ select * from create_review_invite('00000000-0000-4000-8000-000000000c81', 'Bola') $$, '42501', null, 'another seller cannot make links for this shop');
select throws_ok($$ select * from list_review_invites('00000000-0000-4000-8000-000000000c81') $$, '42501', null, 'or see them');
select throws_ok($$ select * from shop_review_invites $$, '42501', null, 'the tables are closed');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000c71');
set local role authenticated;
select throws_ok($$ select * from create_review_invite('00000000-0000-4000-8000-000000000c81', '  ') $$, '23514', 'DETAILS_INVALID', 'a link needs the buyer''s name');
insert into links select 'a', id, token from create_review_invite('00000000-0000-4000-8000-000000000c81', ' Bola A. ');
insert into links select 'b', id, token from create_review_invite('00000000-0000-4000-8000-000000000c81', 'Chi E.');
insert into links select 'c', id, token from create_review_invite('00000000-0000-4000-8000-000000000c81', 'Dayo');
select throws_ok($$ select * from create_review_invite('00000000-0000-4000-8000-000000000c81', 'One more') $$, 'P0001', 'TOO_MANY_INVITES', 'a shop can make only so many a day');
select results_eq($$ select buyer_name, state from list_review_invites('00000000-0000-4000-8000-000000000c81') order by buyer_name $$,
  $$ values ('Bola A.', 'waiting'), ('Chi E.', 'waiting'), ('Dayo', 'waiting') $$, 'the owner sees the links, tidied');
select ok((select bool_and(char_length(token) >= 64) from links), 'each link is long and random');
select lives_ok($$ select cancel_review_invite((select id from links where label = 'c')) $$, 'and withdraws one');
reset role;

-- Visitors cannot reach any of it except through the server.
set local role anon;
select throws_ok($$ select * from lookup_review_invite((select token from links where label = 'a')) $$, '42501', null, 'visitors cannot look up links directly');
select throws_ok($$ select submit_invited_review((select token from links where label = 'a'), 'x', 5, 'x', 'ip') $$, '42501', null, 'or review directly');
reset role;

-- The buyer's review, through the server.
set local role service_role;
select results_eq($$ select state, shop_name, buyer_name from lookup_review_invite((select token from links where label = 'a')) $$,
  $$ values ('open', 'RI Shop', 'Bola A.') $$, 'a link greets its buyer');
select throws_ok($$ select submit_invited_review((select token from links where label = 'a'), 'Bola', 6, 'x', 'ip') $$, '23514', 'DETAILS_INVALID', 'stars are 1 to 5');
select is(submit_invited_review((select token from links where label = 'a'), ' Bola ', 5, ' Lovely shop ', 'ip-1'), 'ri-shop', 'the buyer reviews the shop');
select throws_ok($$ select submit_invited_review((select token from links where label = 'a'), 'Again', 1, 'x', 'ip-1') $$, '55000', 'INVITE_USED', 'a link works once');
select throws_ok($$ select submit_invited_review((select token from links where label = 'c'), 'Dayo', 1, 'x', 'ip-1') $$, '55000', 'INVITE_EXPIRED', 'a withdrawn link does not work');
select throws_ok($$ select submit_invited_review('nonsense', 'x', 3, 'x', 'ip-1') $$, 'P0002', 'INVITE_NOT_FOUND', 'nor a made-up one');
select results_eq($$ select state from lookup_review_invite((select token from links where label = 'a')) $$, $$ values ('used') $$, 'the used link says so');
reset role;
insert into links select 'review', id, null from shop_reviews where invite_id = (select id from links where label = 'a');
update shop_review_invites set expires_at = now() - interval '1 minute' where id = (select id from links where label = 'b');
set local role service_role;
select throws_ok($$ select submit_invited_review((select token from links where label = 'b'), 'Chi', 4, 'x', 'ip-2') $$, '55000', 'INVITE_EXPIRED', 'an old link has expired');
reset role;

set local role anon;
select results_eq($$ select seller_slug, reviewer_name, rating, body from public_seller_reviews $$, $$ values ('ri-shop', 'Bola', 5, 'Lovely shop') $$, 'it shows on the seller''s page at once');
select results_eq($$ select kind, author_name, rating, product_slug, is_verified_purchase from public_api_reviews where seller_slug = 'ri-shop' $$,
  $$ values ('shop'::text, 'Bola'::text, 5, null::text, false) $$, 'and in the public reviews API, as a shop review');
select results_eq($$ select kind, review_count::int, rating_total::int from public_api_review_stats where seller_slug = 'ri-shop' $$,
  $$ values ('shop'::text, 1, 5) $$, 'with its counts');
reset role;
select is((select count(*)::int from notifications where user_id = '00000000-0000-4000-8000-000000000c71' and type = 'shop_review_received'), 1, 'the seller is told');

-- The seller cannot remove it; a moderator can hide it.
select pg_temp.act_as('00000000-0000-4000-8000-000000000c71');
set local role authenticated;
select throws_ok($$ select set_shop_review_hidden((select id from links where label = 'review'), true, 'I dislike it') $$, '42501', null, 'the seller cannot hide a review');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000c73');
set local role authenticated;
select throws_ok($$ select set_shop_review_hidden((select id from links where label = 'review'), true, '  ') $$, '23514', 'REASON_REQUIRED', 'hiding needs a reason');
select lives_ok($$ select set_shop_review_hidden((select id from links where label = 'review'), true, 'Abusive') $$, 'a moderator hides it');
select results_eq($$ select status from admin_list_shop_reviews('hidden', 'RI') $$, $$ values ('hidden') $$, 'and finds it among hidden reviews');
reset role;
set local role anon;
select is_empty($$ select 1 from public_seller_reviews where seller_slug = 'ri-shop' $$, 'a hidden review leaves the page');
select is_empty($$ select 1 from public_api_reviews where seller_slug = 'ri-shop' $$, 'and the API');
reset role;

-- Reviews switched off: nothing shows, and no link works or can be made.
update shop_reviews set status = 'published';
update platform_settings set value = 'false' where key = 'reviews.enabled';
set local role anon;
select is_empty($$ select 1 from public_seller_reviews $$, 'with reviews off, nothing shows');
select is_empty($$ select 1 from public_api_reviews $$, 'not even in the API');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000c71');
set local role authenticated;
select throws_ok($$ select * from create_review_invite('00000000-0000-4000-8000-000000000c81', 'Ed') $$, '55000', 'REVIEWS_OFF', 'and no link can be made');
reset role;

select * from finish();
rollback;
