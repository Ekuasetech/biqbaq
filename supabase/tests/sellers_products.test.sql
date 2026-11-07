-- Tests that try to break shops, products and the publishing allowance.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000c1', 'owner@example.com'),
  ('00000000-0000-4000-8000-0000000000c2', 'seller@example.com'),
  ('00000000-0000-4000-8000-0000000000c3', 'other@example.com'),
  ('00000000-0000-4000-8000-0000000000c4', 'coadmin@example.com'),
  ('00000000-0000-4000-8000-0000000000c5', 'buyer@example.com');
select private.bootstrap_super_admin('owner@example.com');

create temp table ctx (key text primary key, id uuid);
grant select on ctx to authenticated, anon;

-- A seller is approved, and gets a shop ---------------------------------------

select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
set local role authenticated;
select submit_role_application('seller', '{"business_name": "Ada''s Shop!", "contact_information": "416-555-0100", "city": "Toronto", "country": "CA", "description": "Groceries", "category": "food"}');
select is_empty($$ select id from sellers $$, 'applying creates no shop');
reset role;
insert into ctx select 'app', id from role_applications where applicant_id = '00000000-0000-4000-8000-0000000000c2';

select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
set local role authenticated;
select lives_ok($$ select approve_role_application((select id from ctx where key = 'app')) $$, 'Super Admin approves the seller');
reset role;

select is((select slug from sellers where owner_user_id = '00000000-0000-4000-8000-0000000000c2'), 'ada-s-shop', 'approval creates the shop, with a clean web address');
select is((select verification_status from sellers where owner_user_id = '00000000-0000-4000-8000-0000000000c2'), 'unverified', 'approval does not verify the seller');
select is((select country from sellers where owner_user_id = '00000000-0000-4000-8000-0000000000c2'), 'CA', 'the shop is in Canada');
insert into ctx select 'shop', id from sellers where owner_user_id = '00000000-0000-4000-8000-0000000000c2';

-- A second shop is impossible.
select throws_ok(
  $$ insert into sellers (owner_user_id, slug, name, city) values ('00000000-0000-4000-8000-0000000000c2', 'second', 'Second', 'Toronto') $$,
  '23505', null, 'one person cannot own two shops'
);

-- A second seller with the same name, in a separate shop.
insert into user_roles (user_id, role_key) values ('00000000-0000-4000-8000-0000000000c3', 'seller');
insert into sellers (owner_user_id, slug, name, city) values ('00000000-0000-4000-8000-0000000000c3', 'other-shop', 'Other Shop', 'Calgary');
insert into ctx select 'other_shop', id from sellers where owner_user_id = '00000000-0000-4000-8000-0000000000c3';
insert into ctx select 'food', id from categories where slug = 'food';

-- Shop privacy --------------------------------------------------------------

select pg_temp.act_as('00000000-0000-4000-8000-0000000000c5');
set local role authenticated;
select is_empty($$ select id from sellers $$, 'a buyer cannot read the sellers table');
select is_empty($$ select seller_id from seller_private $$, 'a buyer cannot read private seller details');
select is((select count(*)::int from public_sellers where slug in ('ada-s-shop', 'other-shop')), 2, 'a buyer can read public shop details');
select hasnt_column('public', 'public_sellers', 'contact_information', 'public shops expose no contact details');
select hasnt_column('public', 'public_sellers', 'owner_user_id', 'public shops do not reveal the owner');
select hasnt_column('public', 'public_products', 'created_by', 'public products do not reveal who created them');
select hasnt_column('public', 'public_products', 'seller_id', 'public products expose no internal seller id');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
set local role authenticated;
select is((select contact_information from seller_private), '416-555-0100', 'a seller can read their own private details');
select throws_ok($$ update sellers set description = 'New words' where owner_user_id = auth.uid() $$, '42501', null, 'shop details change only through update_my_shop, which audits them');
select throws_ok($$ update sellers set verification_status = 'manually_verified' $$, '42501', null, 'a seller cannot verify themselves');
select throws_ok($$ update sellers set allowance_override = 1000 $$, '42501', null, 'a seller cannot raise their own allowance');
select throws_ok($$ update sellers set status = 'active' $$, '42501', null, 'a seller cannot change their shop status');
select throws_ok($$ update sellers set publishing_suspended = false $$, '42501', null, 'a seller cannot lift a publishing suspension');
select throws_ok($$ update sellers set slug = 'taken' $$, '42501', null, 'a seller cannot change their web address');
select throws_ok($$ insert into seller_private (seller_id) values ((select id from ctx where key = 'shop')) $$, '42501', null, 'private details cannot be written directly');

-- Drafts ---------------------------------------------------------------------

select lives_ok(
  $$ insert into products (seller_id, name) values ((select id from ctx where key = 'shop'), 'Suya Spice') $$,
  'a seller can create a draft'
);
select results_eq($$ select status, currency from products $$, $$ values ('draft', 'CAD') $$, 'a new product is a draft, in CAD');
select is((select slug from products), 'suya-spice', 'the product gets a web address');
select throws_ok(
  $$ insert into products (seller_id, name, status) values ((select id from ctx where key = 'shop'), 'Sneaky', 'published') $$,
  '42501', null, 'a product cannot be created already published'
);
select throws_ok(
  $$ insert into products (seller_id, name, currency) values ((select id from ctx where key = 'shop'), 'Sneaky', 'NGN') $$,
  '42501', null, 'a product cannot be priced in another currency'
);
select throws_ok(
  $$ insert into products (seller_id, name) values ((select id from ctx where key = 'other_shop'), 'Sneaky') $$,
  '42501', null, 'a seller cannot add a product to someone else''s shop'
);
select throws_ok($$ update products set status = 'published' $$, '42501', null, 'status cannot be changed directly');
select throws_ok($$ update products set first_published_at = now() $$, '42501', null, 'publication dates cannot be faked');
select throws_ok($$ update products set view_count = 999999 $$, '42501', null, 'view counts cannot be faked');
select throws_ok($$ update products set seller_id = (select id from ctx where key = 'other_shop') $$, '42501', null, 'a product cannot be moved to another shop');
select throws_ok($$ delete from products $$, '42501', null, 'products cannot be hard-deleted');
select throws_ok($$ insert into media_assets (entity_type, entity_id, secure_url) values ('product', gen_random_uuid(), 'https://example.com/a.jpg') $$, '42501', null, 'images cannot be added directly');
select throws_ok($$ insert into product_publication_ledger (product_id, seller_id, seller_was_verified) select id, seller_id, true from products $$, '42501', null, 'the ledger cannot be written directly');
select is_empty($$ select product_id from product_publication_ledger $$, 'saving a draft uses none of the allowance');
select is_empty($$ select id from public_products where seller_slug = 'ada-s-shop' $$, 'a draft is not public');

-- Publishing rules -----------------------------------------------------------

select throws_ok($$ select publish_product((select id from products where name = 'Suya Spice')) $$, '23514', null, 'an incomplete product cannot be published');
update products set description = 'Smoky', price_minor = 1200, category_id = (select id from ctx where key = 'food');
select lives_ok($$ select publish_product((select id from products where name = 'Suya Spice')) $$, 'a complete product can be published');
select is((select status from products where name = 'Suya Spice'), 'published', 'it is published');
select is((select count(*)::int from product_publication_ledger), 1, 'the first publication uses one slot');
select is((select seller_verified from public_products where name = 'Suya Spice'), false, 'the public can see the seller is unverified');
select is((select seller_city from public_products where name = 'Suya Spice'), 'Toronto', 'the public can see the seller''s city');
select throws_ok($$ select publish_product((select id from products where name = 'Suya Spice')) $$, '55000', null, 'a published product cannot be published again');

-- Edits are allowed, cost nothing, and are logged (Q-03).
select lives_ok($$ update products set name = 'A Different Thing', price_minor = 999 where name = 'Suya Spice' $$, 'a published product can be edited');
select is((select count(*)::int from product_publication_ledger), 1, 'editing a published product costs nothing');
select is((select slug from products where name = 'A Different Thing'), 'suya-spice', 'its web address stays the same');
reset role;
select is(
  (select metadata ->> 'old_name' from audit_logs where action = 'product.edit'),
  'Suya Spice', 'the edit is logged, with the old name'
);
select is(
  (select actor_id from audit_logs where action = 'product.edit'),
  '00000000-0000-4000-8000-0000000000c2'::uuid, 'the log records who edited it'
);
select is(
  (select metadata -> 'fields' from audit_logs where action = 'product.edit'),
  '["name", "price"]'::jsonb, 'the log records what changed'
);
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
set local role authenticated;

-- The allowance --------------------------------------------------------------

select is(my_publishing_allowance(), '{"used": 1, "verified": false, "allowance": 2}'::jsonb, 'a seller can see how much of the allowance is used');

insert into products (seller_id, name, description, category_id) values
  ((select id from ctx where key = 'shop'), 'Second', 'x', (select id from ctx where key = 'food')),
  ((select id from ctx where key = 'shop'), 'Third', 'x', (select id from ctx where key = 'food')),
  ((select id from ctx where key = 'shop'), 'Fourth', 'x', (select id from ctx where key = 'food'));

select lives_ok($$ select publish_product((select id from products where name = 'Second')) $$, 'an unverified seller can publish a second product');
select throws_ok($$ select publish_product((select id from products where name = 'Third')) $$, '55000', 'PUBLISH_ALLOWANCE_EXHAUSTED', 'a third is blocked');

-- Unpublishing and republishing costs nothing, and gives nothing back.
select lives_ok($$ select unpublish_product((select id from products where name = 'Second')) $$, 'a product can be unpublished');
select is_empty($$ select id from public_products where name = 'Second' $$, 'an unpublished product is not public');
select throws_ok($$ select publish_product((select id from products where name = 'Third')) $$, '55000', 'PUBLISH_ALLOWANCE_EXHAUSTED', 'unpublishing does not free a slot');
select lives_ok($$ select publish_product((select id from products where name = 'Second')) $$, 'republishing an earlier product costs nothing');
select is((select count(*)::int from product_publication_ledger), 2, 'republishing uses no new slot');

-- Deleting gives nothing back, and re-creating does not get around it.
select lives_ok($$ select delete_product((select id from products where name = 'Second')) $$, 'a seller can delete a product');
select is_empty($$ select id from products where name = 'Second' $$, 'a deleted product disappears for the seller');
select is_empty($$ select id from public_products where name = 'Second' $$, 'and for the public');
select throws_ok($$ select publish_product((select id from products where name = 'Third')) $$, '55000', 'PUBLISH_ALLOWANCE_EXHAUSTED', 'deleting does not free a slot');
insert into products (seller_id, name, description, category_id) values ((select id from ctx where key = 'shop'), 'Second', 'x', (select id from ctx where key = 'food'));
select throws_ok($$ select publish_product((select id from products where name = 'Second')) $$, '55000', 'PUBLISH_ALLOWANCE_EXHAUSTED', 're-creating a deleted product does not get around the limit');
reset role;
select is((select slug from products where name = 'Second' and deleted_at is null), 'second-2', 'a repeated name gets its own web address');
select is((select count(*)::int from product_publication_ledger where seller_id = (select id from ctx where key = 'shop')), 2, 'the ledger keeps the deleted product''s entry');
select throws_ok($$ delete from product_publication_ledger where seller_id = (select id from ctx where key = 'shop') $$, '55000', null, 'ledger entries cannot be removed, even directly');
select throws_ok($$ delete from products where name = 'A Different Thing' $$, '23503', null, 'a published product cannot be hard-deleted, even directly');

-- Someone else's products ------------------------------------------------------

select pg_temp.act_as('00000000-0000-4000-8000-0000000000c3');
set local role authenticated;
select is_empty($$ select id from products $$, 'a seller cannot see another seller''s drafts or products directly');
reset role;
insert into ctx select 'third', id from products where name = 'Third';
insert into ctx select 'live', id from products where name = 'A Different Thing';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c3');
set local role authenticated;
select throws_ok($$ select publish_product((select id from ctx where key = 'third')) $$, '42501', null, 'a seller cannot publish another seller''s product');
select throws_ok($$ select delete_product((select id from ctx where key = 'live')) $$, '42501', null, 'a seller cannot delete another seller''s product');
select throws_ok($$ select unpublish_product((select id from ctx where key = 'live')) $$, '42501', null, 'a seller cannot unpublish another seller''s product');
update products set name = 'Hijacked' where id = (select id from ctx where key = 'live');
reset role;
select is((select count(*)::int from products where name = 'Hijacked'), 0, 'a seller cannot edit another seller''s product');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000c5');
set local role authenticated;
select throws_ok($$ select publish_product((select id from ctx where key = 'third')) $$, '42501', null, 'a buyer cannot publish');
select throws_ok($$ insert into products (seller_id, name) values ((select id from ctx where key = 'shop'), 'Nope') $$, '42501', null, 'a buyer cannot create products');
select throws_ok($$ select suspend_product((select id from ctx where key = 'live'), 'No') $$, '42501', null, 'a buyer cannot suspend products');
reset role;

-- Controls --------------------------------------------------------------------

-- A Super Admin override gives this seller more room.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
set local role authenticated;
select throws_ok($$ select set_seller_allowance((select id from ctx where key = 'shop'), 100, 'Me') $$, '42501', null, 'a seller cannot override their own allowance');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
set local role authenticated;
select lives_ok($$ select set_seller_allowance((select id from ctx where key = 'shop'), 3, 'Trusted seller') $$, 'Super Admin can set an override');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
set local role authenticated;
select lives_ok($$ select publish_product((select id from ctx where key = 'third')) $$, 'the override allows one more');
select is((select price_minor from public_products where name = 'Third'), 0, 'a product can be published at $0 (Q-23)');
select throws_ok($$ select publish_product((select id from products where name = 'Fourth')) $$, '55000', 'PUBLISH_ALLOWANCE_EXHAUSTED', 'but no further');
reset role;

-- Lowering the allowance leaves live products alone.
update platform_settings set value = '1' where key = 'publishing.unverified_allowance';
update sellers set allowance_override = null where id = (select id from ctx where key = 'shop');
select is((select count(*)::int from public_products where seller_slug = 'ada-s-shop'), 2, 'lowering the allowance keeps products live');

-- Verification lifts the limit, and manual counts the same as provider.
update sellers set verification_status = 'manually_verified' where id = (select id from ctx where key = 'shop');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
set local role authenticated;
select lives_ok($$ select publish_product((select id from products where name = 'Fourth')) $$, 'a verified seller is not limited');
select is((select seller_verified from public_products where name = 'Fourth'), true, 'the public can see they are verified');
reset role;

-- Losing verification keeps the listing, brings back the label, and the limit.
update sellers set verification_status = 'suspended' where id = (select id from ctx where key = 'shop');
select is((select seller_verified from public_products where name = 'Fourth'), false, 'a suspended verification shows as unverified');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
set local role authenticated;
insert into products (seller_id, name, description, category_id) values ((select id from ctx where key = 'shop'), 'Fifth', 'x', (select id from ctx where key = 'food'));
select throws_ok($$ select publish_product((select id from products where name = 'Fifth')) $$, '55000', 'PUBLISH_ALLOWANCE_EXHAUSTED', 'losing verification brings the limit back');
reset role;
update sellers set verification_status = 'manually_verified' where id = (select id from ctx where key = 'shop');

-- Manual verification does not bypass suspension (PRD §5.5).
update sellers set publishing_suspended = true where id = (select id from ctx where key = 'shop');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
set local role authenticated;
select throws_ok($$ select publish_product((select id from products where name = 'Fifth')) $$, '55000', 'SELLER_PUBLISHING_SUSPENDED', 'a verified seller with publishing suspended is still blocked');
reset role;
select is((select count(*)::int from public_products where seller_slug = 'ada-s-shop') > 0, true, 'suspending publishing does not delete or hide existing products');
update sellers set publishing_suspended = false where id = (select id from ctx where key = 'shop');

-- Platform switches.
update platform_settings set value = 'false' where key = 'publishing.global_enabled';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
set local role authenticated;
select throws_ok($$ select publish_product((select id from products where name = 'Fifth')) $$, '55000', 'PUBLISHING_DISABLED', 'the global switch stops all publishing');
reset role;
update platform_settings set value = 'true' where key = 'publishing.global_enabled';
update platform_settings set value = 'false' where key = 'publishing.verified_enabled';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
set local role authenticated;
select throws_ok($$ select publish_product((select id from products where name = 'Fifth')) $$, '55000', 'PUBLISHING_DISABLED', 'the verified switch stops verified sellers');
reset role;
update platform_settings set value = 'true' where key = 'publishing.verified_enabled';

-- A suspended role or shop stops everything, for a seller who is still logged in.
update user_roles set status = 'suspended' where user_id = '00000000-0000-4000-8000-0000000000c2' and role_key = 'seller';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
set local role authenticated;
select throws_ok($$ select publish_product((select id from products where name = 'Fifth')) $$, '42501', null, 'a suspended Seller role cannot publish');
select throws_ok($$ insert into products (seller_id, name) values ((select id from ctx where key = 'shop'), 'Nope') $$, '42501', null, 'or create products');
update products set name = 'Blocked' where name = 'Fifth';
reset role;
select is((select count(*)::int from products where name = 'Blocked'), 0, 'or edit products');
update user_roles set status = 'active' where user_id = '00000000-0000-4000-8000-0000000000c2' and role_key = 'seller';

update sellers set status = 'suspended' where id = (select id from ctx where key = 'shop');
select is_empty($$ select id from public_products where seller_slug = 'ada-s-shop' $$, 'a suspended shop''s products leave the public site');
select is_empty($$ select id from public_sellers where slug = 'ada-s-shop' $$, 'and so does the shop');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
set local role authenticated;
select throws_ok($$ select publish_product((select id from products where name = 'Fifth')) $$, '42501', null, 'a suspended shop cannot publish');
reset role;
update sellers set status = 'active' where id = (select id from ctx where key = 'shop');

-- Moderation ------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
select assign_role('00000000-0000-4000-8000-0000000000c4', 'co_admin', 'Helper', array['products.moderate']);
set local role authenticated;
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c4');
set local role authenticated;
select throws_ok($$ select suspend_product((select id from ctx where key = 'live'), ' ') $$, '23514', null, 'suspending a product needs a reason');
select lives_ok($$ select suspend_product((select id from ctx where key = 'live'), 'Reported') $$, 'a moderator can suspend a product');
select throws_ok($$ select publish_product((select id from products where name = 'Fifth')) $$, '42501', null, 'moderating does not allow publishing for sellers');
reset role;
select is_empty($$ select id from public_products where id = (select id from ctx where key = 'live') $$, 'a suspended product leaves the public site');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c2');
set local role authenticated;
select throws_ok($$ select publish_product((select id from ctx where key = 'live')) $$, '55000', 'PRODUCT_NOT_PUBLISHABLE', 'a seller cannot republish a suspended product');
select throws_ok($$ select delete_product((select id from ctx where key = 'live')) $$, '55000', 'PRODUCT_SUSPENDED', 'or delete it to escape the suspension');
update products set name = 'Sneaked' where id = (select id from ctx where key = 'live');
reset role;
select is((select count(*)::int from products where name = 'Sneaked'), 0, 'or edit it');

-- Acting on a seller's behalf ---------------------------------------------------

select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
set local role authenticated;
select lives_ok($$ select restore_product((select id from ctx where key = 'live'), 'Reviewed') $$, 'a suspended product can be restored');
select is((select status from products where id = (select id from ctx where key = 'live')), 'unpublished', 'it comes back unpublished');
select lives_ok($$ select publish_product((select id from ctx where key = 'live')) $$, 'Super Admin can publish for a seller');
reset role;
select results_eq(
  $$ select actor_id, on_behalf_of_seller_id from audit_logs where action = 'product.publish' and target_id = (select id::text from ctx where key = 'live') and actor_id = '00000000-0000-4000-8000-0000000000c1' $$,
  $$ values ('00000000-0000-4000-8000-0000000000c1'::uuid, (select id from ctx where key = 'shop')) $$,
  'an on-behalf action records both the actor and the seller'
);
select is(
  (select seller_id from products where id = (select id from ctx where key = 'live')),
  (select id from ctx where key = 'shop'), 'the product still belongs to the seller'
);

select is(
  (select on_behalf_of_seller_id from audit_logs where action = 'product.publish' and target_id = (select id::text from ctx where key = 'live') and actor_id = '00000000-0000-4000-8000-0000000000c2'),
  null, 'a seller''s own publish is not recorded as on-behalf'
);

select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
set local role authenticated;
select lives_ok($$ insert into products (seller_id, name) values ((select id from ctx where key = 'shop'), 'Made For Them') $$, 'Super Admin can create a product for a seller');
select lives_ok($$ update products set price_minor = 4200 where name = 'Fourth' $$, 'Super Admin can edit a product for a seller');
reset role;
select results_eq(
  $$ select actor_id, on_behalf_of_seller_id from audit_logs where action = 'product.create' $$,
  $$ values ('00000000-0000-4000-8000-0000000000c1'::uuid, (select id from ctx where key = 'shop')) $$,
  'creating for a seller is audited with both actor and seller'
);
select results_eq(
  $$ select actor_id, on_behalf_of_seller_id from audit_logs where action = 'product.edit' and actor_id = '00000000-0000-4000-8000-0000000000c1' $$,
  $$ values ('00000000-0000-4000-8000-0000000000c1'::uuid, (select id from ctx where key = 'shop')) $$,
  'editing for a seller is audited with both actor and seller'
);
select is((select created_by from products where name = 'Made For Them'), '00000000-0000-4000-8000-0000000000c1'::uuid, 'the product records who really created it');

-- Visitors ---------------------------------------------------------------------

select set_config('request.jwt.claims', '', true);
set local role anon;
select ok((select count(*) from public_products) > 0, 'visitors can read published products');
select ok((select count(*) from categories) = 4, 'visitors can read categories');
select throws_ok($$ select * from products $$, '42501', null, 'visitors cannot read the products table');
select throws_ok($$ select * from media_assets $$, '42501', null, 'visitors cannot read the images table directly');
select throws_ok($$ select my_publishing_allowance() $$, '42501', null, 'visitors have no allowance to read');
select throws_ok($$ select private.has_permission('sellers.manage') $$, '42501', null, 'visitors cannot reach the private helpers');
select throws_ok($$ select * from sellers $$, '42501', null, 'visitors cannot read the sellers table');
select throws_ok($$ select * from seller_private $$, '42501', null, 'visitors cannot read private seller details');
select throws_ok($$ select publish_product((select id from ctx where key = 'third')) $$, '42501', null, 'visitors cannot publish');
reset role;

-- This catches any function, now or later, that is left open to everyone.
select is_empty(
  $$ select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') $$,
  'signed-out visitors can run no function in the public schema'
);
select is_empty(
  $$ select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname not in ('record_product_image', 'claim_email_jobs', 'complete_background_job', 'fail_background_job', 'prepare_contact_enquiry', 'finish_contact_enquiry', 'count_public_api_request', 'record_product_view') and not has_function_privilege('authenticated', p.oid, 'execute') $$,
  'signed-in users keep the functions that do their own checks'
);

select * from finish();
rollback;
