-- Tests that try to break the moderation screens.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000e01', 'super-e@example.com'),
  ('00000000-0000-4000-8000-000000000e02', 'seller-e@example.com'),
  ('00000000-0000-4000-8000-000000000e03', 'buyer-e@example.com'),
  ('00000000-0000-4000-8000-000000000e04', 'admin-none@example.com'),
  ('00000000-0000-4000-8000-000000000e05', 'admin-products@example.com'),
  ('00000000-0000-4000-8000-000000000e06', 'admin-publishing@example.com'),
  ('00000000-0000-4000-8000-000000000e07', 'admin-shops@example.com');
select private.bootstrap_super_admin('super-e@example.com');
insert into user_roles (user_id, role_key) values
  ('00000000-0000-4000-8000-000000000e02', 'seller'),
  ('00000000-0000-4000-8000-000000000e04', 'admin'),
  ('00000000-0000-4000-8000-000000000e05', 'admin'),
  ('00000000-0000-4000-8000-000000000e06', 'admin'),
  ('00000000-0000-4000-8000-000000000e07', 'admin');
insert into user_role_permissions (user_role_id, permission_key)
  select r.id, v.p from (values
    ('00000000-0000-4000-8000-000000000e05'::uuid, 'products.moderate'),
    ('00000000-0000-4000-8000-000000000e06'::uuid, 'sellers.publishing'),
    ('00000000-0000-4000-8000-000000000e07'::uuid, 'sellers.manage')
  ) v (u, p) join user_roles r on r.user_id = v.u and r.role_key = 'admin';
insert into sellers (id, owner_user_id, slug, name, city) values
  ('00000000-0000-4000-8000-00000000e501', '00000000-0000-4000-8000-000000000e02', 'e-mod-shop', 'E Mod Shop', 'Toronto');
insert into products (id, seller_id, created_by, slug, name, description, price_minor, currency, status, first_published_at) values
  ('00000000-0000-4000-8000-00000000e601', '00000000-0000-4000-8000-00000000e501', '00000000-0000-4000-8000-000000000e02', 'e-live', 'E Live', 'x', 100, 'CAD', 'published', now()),
  ('00000000-0000-4000-8000-00000000e602', '00000000-0000-4000-8000-00000000e501', '00000000-0000-4000-8000-000000000e02', 'e-draft', 'E Secret Draft', 'x', 100, 'CAD', 'draft', null);

create temp table ids as select '00000000-0000-4000-8000-00000000e601'::uuid as product, '00000000-0000-4000-8000-00000000e501'::uuid as shop, '00000000-0000-4000-8000-00000000e602'::uuid as draft;
grant select on ids to authenticated, anon;

-- Visitors and people with no permission get nothing.
set local role anon;
select throws_ok($$ select * from my_moderation_access() $$, '42501', null, 'a visitor has no access');
select throws_ok($$ select * from admin_list_moderation_products() $$, '42501', null, 'a visitor cannot list products');
select throws_ok($$ select * from admin_list_moderation_sellers() $$, '42501', null, 'a visitor cannot list shops');
select throws_ok($$ select suspend_product((select product from ids), 'x') $$, '42501', null, 'a visitor cannot suspend');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-000000000e03');
set local role authenticated;
select results_eq($$ select * from my_moderation_access() $$, $$ values (false, false, false, false) $$, 'a buyer has no access');
select throws_ok($$ select * from admin_list_moderation_products() $$, '42501', null, 'a buyer cannot list products');
select throws_ok($$ select * from admin_list_moderation_sellers() $$, '42501', null, 'a buyer cannot list shops');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-000000000e04');
set local role authenticated;
select results_eq($$ select * from my_moderation_access() $$, $$ values (false, false, false, false) $$, 'an Admin with no permissions has no access');
select throws_ok($$ select * from admin_list_moderation_products() $$, '42501', null, 'and cannot list products');
select throws_ok($$ select set_seller_status((select shop from ids), 'suspended', 'x') $$, '42501', null, 'or suspend a shop');
reset role;

-- A seller cannot lift anything on themselves.
select pg_temp.act_as('00000000-0000-4000-8000-000000000e02');
set local role authenticated;
select throws_ok($$ select set_seller_publishing((select shop from ids), false, 'x') $$, '42501', null, 'a seller cannot change their own publishing');
select throws_ok($$ select set_seller_status((select shop from ids), 'active', 'x') $$, '42501', null, 'or their shop status');
select throws_ok($$ select restore_product((select product from ids), 'x') $$, '42501', null, 'or restore a product');
reset role;

-- Each permission reaches only its own actions.
select pg_temp.act_as('00000000-0000-4000-8000-000000000e05');
set local role authenticated;
select results_eq($$ select * from my_moderation_access() $$, $$ values (true, false, false, false) $$, 'a product moderator has product access only');
select throws_ok($$ select * from admin_list_moderation_sellers() $$, '42501', null, 'and cannot list shops');
select throws_ok($$ select set_seller_status((select shop from ids), 'suspended', 'x') $$, '42501', null, 'or suspend a shop');
select throws_ok($$ select set_seller_publishing((select shop from ids), true, 'x') $$, '42501', null, 'or a shop''s publishing');
select is_empty($$ select 1 from admin_list_moderation_products() where name = 'E Secret Draft' $$, 'a draft stays private');
select throws_ok($$ select suspend_product((select draft from ids), 'x') $$, '55000', 'PRODUCT_NOT_SUSPENDABLE', 'and cannot be suspended');
select is((select seller_name from admin_list_moderation_products('published', 'E Live')), 'E Mod Shop', 'a live product is listed with its shop');

select throws_ok($$ select suspend_product((select product from ids), '  ') $$, '23514', 'REASON_REQUIRED', 'a reason is needed');
select throws_ok(format($$ select suspend_product((select product from ids), %L) $$, repeat('x', 501)), '23514', 'REASON_TOO_LONG', 'and has a limit');
select lives_ok($$ select suspend_product((select product from ids), ' Reported as fake ') $$, 'a moderator suspends a product');
select throws_ok($$ select suspend_product((select product from ids), 'Again') $$, '55000', 'PRODUCT_NOT_SUSPENDABLE', 'repeating it is refused');
reset role;

select is((select status from products where id = (select product from ids)), 'suspended', 'it is suspended');
select is((select count(*)::int from public_products where id = (select product from ids)), 0, 'and gone from the public site');
select results_eq(
  $$ select user_id, payload ->> 'template', payload -> 'data' ->> 'product', payload -> 'data' ->> 'reason' from background_jobs where payload ->> 'template' = 'product_suspended' $$,
  $$ values ('00000000-0000-4000-8000-000000000e02'::uuid, 'product_suspended', 'E Live', 'Reported as fake') $$,
  'the seller is emailed, with the reason'
);
select is((select count(*)::int from audit_logs where action = 'product.suspend' and reason = 'Reported as fake'), 1, 'the audit log has one entry');

select pg_temp.act_as('00000000-0000-4000-8000-000000000e05');
set local role authenticated;
select lives_ok($$ select restore_product((select product from ids), 'Checked, it is real') $$, 'a moderator restores it');
select throws_ok($$ select restore_product((select product from ids), 'Again') $$, '55000', 'PRODUCT_NOT_SUSPENDED', 'repeating it is refused');
reset role;
select is((select status from products where id = (select product from ids)), 'unpublished', 'it comes back not public, for the seller to republish');
select is((select count(*)::int from background_jobs where payload ->> 'template' = 'product_restored'), 1, 'the seller is told it was restored');

-- Publishing permission: shops are visible, but not the owner's private address.
select pg_temp.act_as('00000000-0000-4000-8000-000000000e06');
set local role authenticated;
select results_eq($$ select * from my_moderation_access() $$, $$ values (false, false, true, false) $$, 'a publishing moderator has publishing access only');
select results_eq(
  $$ select name, owner_email from admin_list_moderation_sellers(null, 'E Mod Shop') $$,
  $$ values ('E Mod Shop', null::text) $$,
  'they can list shops, without the owner''s email'
);
select is_empty($$ select 1 from admin_list_moderation_sellers(null, 'seller-e@') $$, 'and cannot discover it by searching');
select throws_ok($$ select set_seller_status((select shop from ids), 'suspended', 'x') $$, '42501', null, 'they cannot suspend a shop');
select throws_ok($$ select * from admin_list_moderation_products() $$, '42501', null, 'or list products');
select throws_ok($$ select set_seller_publishing((select shop from ids), false, 'x') $$, '55000', 'MODERATION_NOT_ALLOWED', 'restoring what is not suspended is refused');
select lives_ok($$ select set_seller_publishing((select shop from ids), true, 'Too many complaints') $$, 'they suspend publishing');
select throws_ok($$ select set_seller_publishing((select shop from ids), true, 'Again') $$, '55000', 'MODERATION_NOT_ALLOWED', 'repeating it is refused');
select throws_ok($$ select set_seller_publishing((select shop from ids), null, 'x') $$, '55000', 'MODERATION_NOT_ALLOWED', 'a missing choice is refused');
select is((select count(*)::int from admin_list_moderation_sellers('publishing_suspended', 'E Mod Shop')), 1, 'filtering finds it');
select lives_ok($$ select set_seller_publishing((select shop from ids), false, 'Resolved') $$, 'they restore publishing');
reset role;
select set_eq(
  $$ select payload ->> 'template' from background_jobs where payload ->> 'template' like 'publishing_%' $$,
  array['publishing_suspended', 'publishing_restored'], 'the seller is told about both'
);

-- Shop permission.
select pg_temp.act_as('00000000-0000-4000-8000-000000000e07');
set local role authenticated;
select results_eq($$ select * from my_moderation_access() $$, $$ values (false, true, false, false) $$, 'a shop manager has shop access only');
select is((select owner_email from admin_list_moderation_sellers(null, 'seller-e@')), 'seller-e@example.com', 'they can see and search the owner''s email');
select throws_ok($$ select set_seller_publishing((select shop from ids), true, 'x') $$, '42501', null, 'they cannot suspend publishing');
select throws_ok($$ select set_seller_status((select shop from ids), 'closed', 'x') $$, '23514', 'INVALID_STATUS', 'an unknown status is refused');
select throws_ok($$ select set_seller_status((select shop from ids), 'active', 'x') $$, '55000', 'MODERATION_NOT_ALLOWED', 'restoring an active shop is refused');
select throws_ok($$ select set_seller_status(gen_random_uuid(), 'suspended', 'x') $$, 'P0002', 'SELLER_NOT_FOUND', 'an unknown shop is refused');
select lives_ok($$ select set_seller_status((select shop from ids), 'suspended', 'Fraud report') $$, 'they suspend a shop');
select throws_ok($$ select set_seller_status((select shop from ids), 'suspended', 'Again') $$, '55000', 'MODERATION_NOT_ALLOWED', 'repeating it is refused');
reset role;
select is((select count(*)::int from public_sellers where slug = 'e-mod-shop'), 0, 'a suspended shop leaves the public site');
select is((select payload -> 'data' ->> 'reason' from background_jobs where payload ->> 'template' = 'shop_suspended'), 'Fraud report', 'the seller is told why');

-- Super Admin can do all of it.
select pg_temp.act_as('00000000-0000-4000-8000-000000000e01');
set local role authenticated;
select results_eq($$ select * from my_moderation_access() $$, $$ values (true, true, true, true) $$, 'Super Admin has all access');
select is((select status from admin_list_moderation_sellers('suspended', 'E Mod')), 'suspended', 'filtering finds a suspended shop');
select lives_ok($$ select set_seller_status((select shop from ids), 'active', 'Cleared') $$, 'Super Admin restores the shop');
select is_empty($$ select 1 from admin_list_moderation_products('published', '%') $$, 'a percent sign is not a wildcard');
select is((select count(*)::int from admin_list_moderation_sellers(null, null, 100000, 0)) <= 50, true, 'a huge page size is capped');
reset role;

-- Nobody but Super Admin moderates their own shop, whatever permissions they hold.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000e08', 'admin-seller@example.com');
insert into user_roles (user_id, role_key) values
  ('00000000-0000-4000-8000-000000000e08', 'admin'),
  ('00000000-0000-4000-8000-000000000e08', 'seller');
insert into user_role_permissions (user_role_id, permission_key)
  select r.id, v.p from (values ('products.moderate'), ('sellers.manage'), ('sellers.publishing')) v (p)
  join user_roles r on r.user_id = '00000000-0000-4000-8000-000000000e08' and r.role_key = 'admin';
insert into sellers (id, owner_user_id, slug, name, city, status, publishing_suspended) values
  ('00000000-0000-4000-8000-00000000e502', '00000000-0000-4000-8000-000000000e08', 'e-own-shop', 'E Own Shop', 'Toronto', 'suspended', true);
insert into products (id, seller_id, created_by, slug, name, description, price_minor, currency, status, first_published_at) values
  ('00000000-0000-4000-8000-00000000e603', '00000000-0000-4000-8000-00000000e502', '00000000-0000-4000-8000-000000000e08', 'e-own', 'E Own', 'x', 100, 'CAD', 'suspended', now()),
  ('00000000-0000-4000-8000-00000000e604', '00000000-0000-4000-8000-00000000e502', '00000000-0000-4000-8000-000000000e08', 'e-own-2', 'E Own Two', 'x', 100, 'CAD', 'published', now());
create temp table own as select '00000000-0000-4000-8000-00000000e502'::uuid as shop, '00000000-0000-4000-8000-00000000e603'::uuid as suspended, '00000000-0000-4000-8000-00000000e604'::uuid as live;
grant select on own to authenticated;

select pg_temp.act_as('00000000-0000-4000-8000-000000000e08');
set local role authenticated;
select throws_ok($$ select set_seller_status((select shop from own), 'active', 'Lifting my own') $$, '42501', 'CANNOT_MODERATE_OWN', 'an Admin cannot restore their own shop');
select throws_ok($$ select set_seller_publishing((select shop from own), false, 'Lifting my own') $$, '42501', 'CANNOT_MODERATE_OWN', 'or their own publishing');
select throws_ok($$ select restore_product((select suspended from own), 'Lifting my own') $$, '42501', 'CANNOT_MODERATE_OWN', 'or their own product');
select throws_ok($$ select suspend_product((select live from own), 'Mine') $$, '42501', 'CANNOT_MODERATE_OWN', 'or suspend their own product');
select lives_ok($$ select suspend_product((select product from ids), 'Someone else''s product') $$, 'they can still moderate other sellers');
reset role;
select results_eq(
  $$ select status, publishing_suspended from sellers where id = (select shop from own) $$,
  $$ values ('suspended', true) $$, 'nothing changed on their own shop'
);
select is((select status from products where id = (select suspended from own)), 'suspended', 'or on their own product');
select is((select count(*)::int from audit_logs where reason = 'Lifting my own'), 0, 'and nothing was logged as done');

-- Super Admin, whom nobody outranks, is exempt.
update sellers set owner_user_id = '00000000-0000-4000-8000-000000000e01' where id = (select shop from own);
insert into user_roles (user_id, role_key) values ('00000000-0000-4000-8000-000000000e01', 'seller');
select pg_temp.act_as('00000000-0000-4000-8000-000000000e01');
set local role authenticated;
select lives_ok($$ select set_seller_status((select shop from own), 'active', 'My own shop') $$, 'Super Admin can act on their own shop');
reset role;

select * from finish();
rollback;
