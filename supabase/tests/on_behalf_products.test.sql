-- Admins and Co-admins working on a seller's products (PRD §3.4, §6.3, roadmap item 8).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000b0a01', 'ob-seller@example.com'),
  ('00000000-0000-4000-8000-0000000b0a02', 'ob-coadmin@example.com'),
  ('00000000-0000-4000-8000-0000000b0a03', 'ob-editor@example.com'),
  ('00000000-0000-4000-8000-0000000b0a04', 'ob-none@example.com');
insert into user_roles (user_id, role_key) values
  ('00000000-0000-4000-8000-0000000b0a01', 'seller'),
  ('00000000-0000-4000-8000-0000000b0a02', 'co_admin'),
  ('00000000-0000-4000-8000-0000000b0a03', 'co_admin'),
  ('00000000-0000-4000-8000-0000000b0a04', 'co_admin');
insert into user_role_permissions (user_role_id, permission_key)
  select r.id, v.p from (values
    ('00000000-0000-4000-8000-0000000b0a02'::uuid, 'products.create_on_behalf'),
    ('00000000-0000-4000-8000-0000000b0a02'::uuid, 'products.edit_on_behalf'),
    ('00000000-0000-4000-8000-0000000b0a02'::uuid, 'products.publish_on_behalf'),
    ('00000000-0000-4000-8000-0000000b0a03'::uuid, 'products.edit_on_behalf'),
    ('00000000-0000-4000-8000-0000000b0a04'::uuid, 'products.moderate')
  ) v (u, p) join user_roles r on r.user_id = v.u and r.role_key = 'co_admin';
insert into sellers (id, owner_user_id, slug, name, city) values
  ('00000000-0000-4000-8000-0000000b0b01', '00000000-0000-4000-8000-0000000b0a01', 'ob-shop', 'OB Shop', 'Toronto');
insert into products (id, seller_id, created_by, slug, name, description, category_id, price_minor, currency, status) values
  ('00000000-0000-4000-8000-0000000b0c01', '00000000-0000-4000-8000-0000000b0b01', '00000000-0000-4000-8000-0000000b0a01', 'ob-draft', 'OB Draft', 'Real words', (select id from categories order by slug limit 1), 1500, 'CAD', 'draft'),
  ('00000000-0000-4000-8000-0000000b0c02', '00000000-0000-4000-8000-0000000b0b01', '00000000-0000-4000-8000-0000000b0a01', 'ob-draft-2', 'OB Second', 'Real words', (select id from categories order by slug limit 1), 1500, 'CAD', 'draft');
update platform_settings set value = 'true' where key = 'email.notifications_enabled';

create temp table ids as select
  '00000000-0000-4000-8000-0000000b0b01'::uuid as shop,
  '00000000-0000-4000-8000-0000000b0c01'::uuid as draft,
  '00000000-0000-4000-8000-0000000b0c02'::uuid as second;
grant select on ids to authenticated;

select is((select value #>> '{}' from platform_settings where key = 'publishing.on_behalf_enabled'), 'true', 'the on-behalf switch starts on');

-- A Co-admin with all three on-behalf permissions.
select pg_temp.act_as('00000000-0000-4000-8000-0000000b0a02');
set local role authenticated;
select results_eq($$ select * from shop_access((select shop from ids)) $$,
  $$ values (false, array['products.create', 'products.edit', 'products.publish'], true) $$, 'the Co-admin acts on behalf with matching shop permissions');
select is((select count(*)::int from sellers where id = (select shop from ids)), 1, 'the Co-admin can read the shop');
select is((my_dashboard() -> 'access' ->> 'on_behalf')::boolean, true, 'the sidebar offers the Shops page');
select is((shop_publishing_allowance((select shop from ids)) ->> 'used')::int, 0, 'the Co-admin sees the shop''s allowance');
select lives_ok($$ select publish_product((select draft from ids)) $$, 'the Co-admin publishes for the seller');
reset role;

select is((select status from products where id = '00000000-0000-4000-8000-0000000b0c01'), 'published', 'the product is live');
select is((select published_by from product_publication_ledger where product_id = '00000000-0000-4000-8000-0000000b0c01'),
  '00000000-0000-4000-8000-0000000b0a02'::uuid, 'it uses one of the seller''s places, recorded as published by the Co-admin');
select results_eq(
  $$ select actor_id, on_behalf_of_seller_id from audit_logs where action = 'product.publish' and target_id = '00000000-0000-4000-8000-0000000b0c01' $$,
  $$ values ('00000000-0000-4000-8000-0000000b0a02'::uuid, '00000000-0000-4000-8000-0000000b0b01'::uuid) $$,
  'the audit keeps the actor and the seller apart');
select is((select count(*)::int from notifications where user_id = '00000000-0000-4000-8000-0000000b0a01' and type = 'product_published_for_you' and data ->> 'product' = 'OB Draft'), 1,
  'the seller gets a notification');
select is((select count(*)::int from background_jobs where user_id = '00000000-0000-4000-8000-0000000b0a01' and payload ->> 'template' = 'product_published_for_you'), 1,
  'and an email');
select is((select count(*)::int from background_jobs where payload::text like '%ob-coadmin%' or payload::text like '%0000000b0a02%'), 0,
  'the email does not name the Co-admin');

-- Super Admin switches on-behalf publishing off: the Co-admin is refused, the seller is not.
update platform_settings set value = 'false' where key = 'publishing.on_behalf_enabled';
select pg_temp.act_as('00000000-0000-4000-8000-0000000b0a02');
set local role authenticated;
select throws_ok($$ select publish_product((select second from ids)) $$, '55000', 'ON_BEHALF_DISABLED', 'the switch stops on-behalf publishing');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000b0a01');
set local role authenticated;
select lives_ok($$ select publish_product((select second from ids)) $$, 'the seller still publishes their own product');
reset role;
select is((select count(*)::int from notifications where user_id = '00000000-0000-4000-8000-0000000b0a01' and type = 'product_published_for_you'), 1,
  'the seller is not notified about their own publishing');
update platform_settings set value = 'true' where key = 'publishing.on_behalf_enabled';

-- Edit only: the shop opens, but publishing is refused.
select pg_temp.act_as('00000000-0000-4000-8000-0000000b0a03');
set local role authenticated;
select results_eq($$ select * from shop_access((select shop from ids)) $$,
  $$ values (false, array['products.edit'], true) $$, 'an editor gets only editing');
select lives_ok($$ select unpublish_product((select second from ids)) $$, 'an editor may unpublish, as editing allows');
select throws_ok($$ select publish_product((select second from ids)) $$, '42501', null, 'an editor cannot publish');
reset role;

-- No on-behalf permission: nothing.
select pg_temp.act_as('00000000-0000-4000-8000-0000000b0a04');
set local role authenticated;
select is((select count(*)::int from shop_access((select shop from ids))), 0, 'other Co-admins get no shop access');
select is((my_dashboard() -> 'access' ->> 'on_behalf')::boolean, false, 'and no Shops page');
select throws_ok($$ select shop_publishing_allowance((select shop from ids)) $$, '42501', null, 'nor the allowance');
reset role;

-- The owner is answered as before.
select pg_temp.act_as('00000000-0000-4000-8000-0000000b0a01');
set local role authenticated;
select is((select on_behalf from shop_access((select shop from ids))), false, 'the owner is not acting on behalf');
select is((select is_owner from shop_access((select shop from ids))), true, 'the owner is the owner');
reset role;

select * from finish();
rollback;
