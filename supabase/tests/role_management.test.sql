-- Tests that try to break the role management screen.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000f01', 'super-f@example.com'),
  ('00000000-0000-4000-8000-000000000f02', 'target-f@example.com'),
  ('00000000-0000-4000-8000-000000000f03', 'buyer-f@example.com'),
  ('00000000-0000-4000-8000-000000000f04', 'second-f@example.com');
update profiles set display_name = 'Target Person' where id = '00000000-0000-4000-8000-000000000f02';
select private.bootstrap_super_admin('super-f@example.com');
create temp table r (id uuid);
grant select, insert, delete on r to authenticated;
create temp table sa as select id from user_roles where user_id = '00000000-0000-4000-8000-000000000f01' and role_key = 'super_admin';
grant select on sa to authenticated, anon;
delete from background_jobs;

-- Only Super Admin.
set local role anon;
select throws_ok($$ select * from admin_list_people() $$, '42501', null, 'a visitor cannot list people');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000f03');
set local role authenticated;
select throws_ok($$ select * from admin_list_people() $$, '42501', null, 'a buyer cannot list people');
select throws_ok($$ select assign_role(auth.uid(), 'admin', 'Me') $$, '42501', null, 'a buyer cannot give themselves a role');
select throws_ok($$ select set_role_status((select id from sa), 'suspended', 'Coup') $$, '42501', null, 'or touch Super Admin');
reset role;

-- Finding people.
select pg_temp.act_as('00000000-0000-4000-8000-000000000f01');
set local role authenticated;
select is((select display_name from admin_list_people('target-f@')), 'Target Person', 'searching by email works');
select is((select email from admin_list_people('TARGET PERSON')), 'target-f@example.com', 'searching by name works, in any case');
select is_empty($$ select 1 from admin_list_people('%@%') $$, 'a percent sign is not a wildcard');
select is((select count(*)::int from admin_list_people('-f@example.com', 'super_admin')), 1, 'filtering by role works');
select is(
  (select roles -> 0 ->> 'role_key' from admin_list_people('target-f@')), 'buyer', 'roles come with the person'
);
select is((select count(*)::int from admin_list_people(null, null, 100000)) <= 50, true, 'a huge page size is capped');

-- Giving a role.
select throws_ok($$ select assign_role('00000000-0000-4000-8000-000000000f02', 'seller', 'x') $$, '23514', 'ROLE_NOT_ASSIGNABLE', 'Seller comes only through an application');
select throws_ok($$ select assign_role('00000000-0000-4000-8000-000000000f02', 'buyer', 'x') $$, '23514', 'ROLE_NOT_ASSIGNABLE', 'Buyer is automatic');
select throws_ok($$ select assign_role('00000000-0000-4000-8000-000000000f02', null, 'x') $$, '23514', 'ROLE_NOT_ASSIGNABLE', 'a role is needed');
select throws_ok($$ select assign_role('00000000-0000-4000-8000-000000000f02', 'admin', ' ') $$, '23514', 'REASON_REQUIRED', 'a reason is needed');
select throws_ok(format($$ select assign_role('00000000-0000-4000-8000-000000000f02', 'admin', %L) $$, repeat('x', 501)), '23514', 'REASON_TOO_LONG', 'and has a limit');
select throws_ok($$ select assign_role(gen_random_uuid(), 'admin', 'x') $$, 'P0002', 'USER_NOT_FOUND', 'an unknown person is refused');
select throws_ok($$ select assign_role('00000000-0000-4000-8000-000000000f02', 'marketer', 'x', array['users.manage']) $$, '23514', null, 'a Marketer cannot be given admin permissions');
select throws_ok($$ select assign_role('00000000-0000-4000-8000-000000000f02', 'admin', 'x', array['products.create']) $$, '23514', null, 'seller permissions cannot go on an Admin');

insert into r select assign_role('00000000-0000-4000-8000-000000000f02', 'admin', 'INTERNAL trusted helper', array['products.moderate']);
select throws_ok($$ select assign_role('00000000-0000-4000-8000-000000000f02', 'admin', 'Again') $$, '55000', 'ROLE_ALREADY_HELD', 'a role already held cannot be given again, which would wipe its permissions');
reset role;
select results_eq(
  $$ select payload ->> 'template', payload -> 'data' ->> 'role' from background_jobs where user_id = '00000000-0000-4000-8000-000000000f02' $$,
  $$ values ('role_assigned', 'admin') $$, 'the person is told about the new role'
);
select is_empty($$ select 1 from background_jobs where payload::text like '%INTERNAL%' $$, 'without the internal note');

-- The role and its permissions really work.
select pg_temp.act_as('00000000-0000-4000-8000-000000000f02');
set local role authenticated;
select results_eq($$ select products from my_moderation_access() $$, $$ values (true) $$, 'the permission works');
reset role;

-- Changing permissions.
select pg_temp.act_as('00000000-0000-4000-8000-000000000f01');
set local role authenticated;
select lives_ok($$ select grant_permission((select id from r), 'reports.view') $$, 'Super Admin adds a permission');
select lives_ok($$ select grant_permission((select id from r), 'reports.view') $$, 'adding it twice is harmless');
select lives_ok($$ select revoke_permission((select id from r), 'products.moderate') $$, 'Super Admin removes a permission');
select lives_ok($$ select revoke_permission((select id from r), 'products.moderate') $$, 'removing it twice is harmless');
reset role;
select is((select count(*)::int from audit_logs where action = 'permission.grant' and metadata ->> 'permission' = 'reports.view'), 1, 'only the real grant is audited');
select is((select count(*)::int from audit_logs where action = 'permission.revoke' and metadata ->> 'permission' = 'products.moderate'), 1, 'only the real removal is audited');
select pg_temp.act_as('00000000-0000-4000-8000-000000000f02');
set local role authenticated;
select results_eq($$ select products from my_moderation_access() $$, $$ values (false) $$, 'the removed permission stops working straight away');
select throws_ok($$ select grant_permission((select id from r), 'sellers.manage') $$, '42501', null, 'an Admin cannot raise their own permissions');
reset role;

-- Suspending and restoring.
select pg_temp.act_as('00000000-0000-4000-8000-000000000f01');
set local role authenticated;
select throws_ok($$ select set_role_status((select id from r), 'suspended', '  ') $$, '23514', 'REASON_REQUIRED', 'suspending needs a reason');
select throws_ok($$ select set_role_status((select id from r), 'active', 'x') $$, '55000', 'INVALID_STATUS_CHANGE', 'restoring an active role is refused');
select throws_ok($$ select set_role_status((select id from r), null, 'x') $$, '23514', 'INVALID_STATUS', 'a missing status is refused');
select lives_ok($$ select grant_permission((select id from r), 'products.moderate') $$, 'the permission is back, ready for the next check');
select lives_ok($$ select set_role_status((select id from r), 'suspended', 'Under review') $$, 'Super Admin suspends the role');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000f02');
set local role authenticated;
select results_eq($$ select products from my_moderation_access() $$, $$ values (false) $$, 'a suspended role loses its permissions');
select is((select count(*)::int from user_roles where role_key = 'buyer' and status = 'active' and user_id = auth.uid()), 1, 'and other roles are untouched');
reset role;
select is((select payload -> 'data' ->> 'reason' from background_jobs where payload ->> 'template' = 'role_suspended'), 'Under review', 'the person is told why');

select pg_temp.act_as('00000000-0000-4000-8000-000000000f01');
set local role authenticated;
select lives_ok($$ select set_role_status((select id from r), 'active', 'Cleared') $$, 'Super Admin restores the role');
reset role;
select is((select count(*)::int from background_jobs where payload ->> 'template' = 'role_restored'), 1, 'the person is told');
select pg_temp.act_as('00000000-0000-4000-8000-000000000f02');
set local role authenticated;
select results_eq($$ select products from my_moderation_access() $$, $$ values (true) $$, 'restoring brings the permissions back');
reset role;

-- Removing is final, until a new assignment that starts clean.
select pg_temp.act_as('00000000-0000-4000-8000-000000000f01');
set local role authenticated;
select lives_ok($$ select set_role_status((select id from r), 'revoked', 'Left the team') $$, 'Super Admin removes the role');
select throws_ok($$ select set_role_status((select id from r), 'active', 'Back') $$, '55000', 'INVALID_STATUS_CHANGE', 'a removed role cannot be restored');
select throws_ok($$ select grant_permission((select id from r), 'reports.view') $$, '55000', 'ROLE_REVOKED', 'or given permissions');
select lives_ok($$ select assign_role('00000000-0000-4000-8000-000000000f02', 'admin', 'Came back') $$, 'a new assignment is allowed');
select is(
  (select roles from admin_list_people('target-f@'))::text like '%"permissions": []%', true, 'and starts with no permissions'
);
reset role;
select is((select count(*)::int from auth.users where id = '00000000-0000-4000-8000-000000000f02'), 1, 'removing a role never deletes the account');

-- Super Admin is protected.
select pg_temp.act_as('00000000-0000-4000-8000-000000000f01');
set local role authenticated;
select throws_ok($$ select set_role_status((select id from sa), 'suspended', 'Oops') $$, '55000', 'LAST_SUPER_ADMIN', 'the last Super Admin cannot be suspended');
select throws_ok($$ select set_role_status((select id from sa), 'revoked', 'Oops') $$, '55000', 'LAST_SUPER_ADMIN', 'or removed');
select throws_ok($$ select grant_permission((select id from sa), 'reports.view') $$, '23514', null, 'Super Admin takes no separate permissions');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000f02');
set local role authenticated;
select throws_ok($$ select assign_role('00000000-0000-4000-8000-000000000f04', 'super_admin', 'x') $$, '42501', null, 'an Admin cannot create a Super Admin');
select throws_ok($$ select * from admin_list_people() $$, '42501', null, 'or list people');
reset role;

-- The audit log names the person.
select pg_temp.act_as('00000000-0000-4000-8000-000000000f01');
set local role authenticated;
select is((select target_label from admin_audit_log('role.suspended') limit 1), 'target-f@example.com', 'a role change shows whose role it was');
select is((select target_label from admin_audit_log('role.assign') limit 1), 'target-f@example.com', 'giving a role does too');
select is((select count(*)::int from admin_audit_log('role.revoked', 'target-f@')) , 1, 'and can be searched by their email');
reset role;

-- Suspending a seller suspends their shop (Q-31).
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000f05', 'seller-f@example.com'),
  ('00000000-0000-4000-8000-000000000f06', 'manager-f@example.com');
insert into user_roles (user_id, role_key) values
  ('00000000-0000-4000-8000-000000000f05', 'seller'),
  ('00000000-0000-4000-8000-000000000f06', 'admin');
insert into user_role_permissions (user_role_id, permission_key)
  select id, 'sellers.manage' from user_roles where user_id = '00000000-0000-4000-8000-000000000f06' and role_key = 'admin';
insert into sellers (id, owner_user_id, slug, name, city) values
  ('00000000-0000-4000-8000-00000000f501', '00000000-0000-4000-8000-000000000f05', 'f-shop', 'F Shop', 'Toronto');
insert into products (id, seller_id, created_by, slug, name, description, price_minor, currency, status, first_published_at) values
  ('00000000-0000-4000-8000-00000000f601', '00000000-0000-4000-8000-00000000f501', '00000000-0000-4000-8000-000000000f05', 'f-live', 'F Live', 'x', 100, 'CAD', 'published', now());
create temp table seller_role as select id from user_roles where user_id = '00000000-0000-4000-8000-000000000f05' and role_key = 'seller';
create temp table f_shop as select '00000000-0000-4000-8000-00000000f501'::uuid as id;
grant select on seller_role, f_shop to authenticated;
delete from background_jobs;

select pg_temp.act_as('00000000-0000-4000-8000-000000000f01');
set local role authenticated;
select lives_ok($$ select set_role_status((select id from seller_role), 'suspended', 'Fraud report') $$, 'Super Admin suspends a seller');
reset role;
select is((select status from sellers where slug = 'f-shop'), 'suspended', 'the shop is suspended with them');
select is((select count(*)::int from public_sellers where slug = 'f-shop'), 0, 'the shop leaves the public site');
select is((select count(*)::int from public_products where slug = 'f-live'), 0, 'and so do its products');
select is((select count(*)::int from audit_logs where action = 'seller.suspended' and target_id = (select id::text from f_shop) and metadata ->> 'because' = 'seller_role_suspended'), 1, 'the shop''s suspension is audited, with why');
select is((select payload -> 'data' ->> 'reason' from background_jobs where payload ->> 'template' = 'shop_suspended'), 'Fraud report', 'the seller is told about the shop, with the reason');

-- A moderator cannot reopen it behind the role's back.
select pg_temp.act_as('00000000-0000-4000-8000-000000000f06');
set local role authenticated;
select throws_ok($$ select set_seller_status((select id from f_shop), 'active', 'Reopening') $$, '55000', 'SELLER_ROLE_NOT_ACTIVE', 'the shop cannot reopen while the role is suspended');
reset role;

-- Restoring the role brings it back.
select pg_temp.act_as('00000000-0000-4000-8000-000000000f01');
set local role authenticated;
select lives_ok($$ select set_role_status((select id from seller_role), 'active', 'Cleared') $$, 'Super Admin restores the seller');
reset role;
select results_eq($$ select status, suspended_by_role from sellers where slug = 'f-shop' $$, $$ values ('active', false) $$, 'the shop comes back');
select is((select count(*)::int from public_products where slug = 'f-live'), 1, 'with its products');
select is((select count(*)::int from background_jobs where payload ->> 'template' = 'shop_restored'), 1, 'and the seller is told');

-- A shop a moderator suspended separately stays suspended through it all.
select pg_temp.act_as('00000000-0000-4000-8000-000000000f06');
set local role authenticated;
select lives_ok($$ select set_seller_status((select id from f_shop), 'suspended', 'Separate problem') $$, 'a moderator suspends the shop');
reset role;
delete from background_jobs;
select pg_temp.act_as('00000000-0000-4000-8000-000000000f01');
set local role authenticated;
select lives_ok($$ select set_role_status((select id from seller_role), 'suspended', 'Also suspended') $$, 'the seller is then suspended too');
select lives_ok($$ select set_role_status((select id from seller_role), 'active', 'Role cleared') $$, 'and their role restored');
reset role;
select results_eq($$ select status, suspended_by_role from sellers where slug = 'f-shop' $$, $$ values ('suspended', false) $$, 'the moderator''s suspension still stands');
select is((select count(*)::int from background_jobs where payload ->> 'template' like 'shop_%'), 0, 'and no misleading shop email goes out');
select pg_temp.act_as('00000000-0000-4000-8000-000000000f06');
set local role authenticated;
select lives_ok($$ select set_seller_status((select id from f_shop), 'active', 'Resolved') $$, 'the moderator can lift it now the role is active');
reset role;

-- Removing the role suspends the shop too, and a new approval brings it back.
select pg_temp.act_as('00000000-0000-4000-8000-000000000f01');
set local role authenticated;
select lives_ok($$ select set_role_status((select id from seller_role), 'revoked', 'Left Biqbaq') $$, 'Super Admin removes the Seller role');
reset role;
select results_eq($$ select status, suspended_by_role from sellers where slug = 'f-shop' $$, $$ values ('suspended', true) $$, 'the shop is suspended');
select is((select count(*)::int from auth.users where id = '00000000-0000-4000-8000-000000000f05'), 1, 'and the account stays');
select is((select count(*)::int from products where slug = 'f-live' and status = 'published'), 1, 'and the product is kept, ready for if they return');
select pg_temp.act_as('00000000-0000-4000-8000-000000000f06');
set local role authenticated;
select throws_ok($$ select set_seller_status((select id from f_shop), 'active', 'Reopening') $$, '55000', 'SELLER_ROLE_NOT_ACTIVE', 'it cannot reopen while the role is removed');
reset role;

-- Other roles do not touch the shop.
update user_roles set status = 'active' where id = (select id from seller_role);
select is((select status from sellers where slug = 'f-shop'), 'active', 'a role coming back by any route restores the shop');
insert into user_roles (user_id, role_key) values ('00000000-0000-4000-8000-000000000f05', 'marketer');
select pg_temp.act_as('00000000-0000-4000-8000-000000000f01');
set local role authenticated;
select lives_ok(
  $$ select set_role_status((select id from user_roles where user_id = '00000000-0000-4000-8000-000000000f05' and role_key = 'marketer'), 'suspended', 'Marketer only') $$,
  'suspending another of their roles'
);
reset role;
select is((select status from sellers where slug = 'f-shop'), 'active', 'leaves the shop alone');

select * from finish();
rollback;
