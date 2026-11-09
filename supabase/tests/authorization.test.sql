-- Tests that try to break the security rules, acting as each kind of person.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

-- Sets up who is acting. Used as: reset role, then act_as, then set local role.
create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;


insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'super@example.com'),
  ('00000000-0000-4000-8000-0000000000a2', 'alice@example.com'),
  ('00000000-0000-4000-8000-0000000000a3', 'bob@example.com'),
  ('00000000-0000-4000-8000-0000000000a4', 'admin@example.com'),
  ('00000000-0000-4000-8000-0000000000a5', 'coadmin@example.com'),
  ('00000000-0000-4000-8000-0000000000a6', 'second@example.com');

-- First Super Admin ---------------------------------------------------------

select lives_ok(
  $$ select private.bootstrap_super_admin('super@example.com') $$,
  'the first Super Admin can be created from a trusted connection'
);
select throws_ok(
  $$ select private.bootstrap_super_admin('bob@example.com') $$,
  '55000', null, 'the first Super Admin can only be created once'
);

-- Own data ------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
set local role authenticated;

select results_eq(
  $$ select id from profiles $$,
  $$ values ('00000000-0000-4000-8000-0000000000a2'::uuid) $$,
  'a person sees only their own profile'
);
select lives_ok($$ update profiles set display_name = 'Alice' where id = auth.uid() $$, 'a person can edit their own name');
select throws_ok($$ update profiles set status = 'active' where id = auth.uid() $$, '42501', null, 'a person cannot change their own account status');
update profiles set display_name = 'Hacked' where id = '00000000-0000-4000-8000-0000000000a3';
select is(
  (select count(*)::int from profiles where display_name = 'Hacked'),
  0, 'a person cannot edit someone else''s profile'
);
select results_eq(
  $$ select role_key from user_roles $$,
  $$ values ('buyer') $$,
  'a person sees only their own roles'
);
select ok((select count(*) from roles) = 7, 'signed-in people can read the list of roles');

-- Direct writes are refused, so the checked functions cannot be skipped.
select throws_ok($$ insert into user_roles (user_id, role_key) values (auth.uid(), 'super_admin') $$, '42501', null, 'nobody can give themselves a role directly');
select throws_ok($$ update user_roles set status = 'revoked' $$, '42501', null, 'nobody can edit role assignments directly');
select throws_ok($$ insert into role_applications (applicant_id, role_key) values (auth.uid(), 'seller') $$, '42501', null, 'applications cannot skip validation');
select throws_ok($$ update role_applications set status = 'approved' $$, '42501', null, 'nobody can approve their own application directly');
select throws_ok($$ insert into audit_logs (action) values ('fake') $$, '42501', null, 'nobody can forge an audit entry');
select throws_ok($$ select private.bootstrap_super_admin('alice@example.com') $$, '42501', null, 'nobody can run the Super Admin setup from the API');
select throws_ok($$ select private.write_audit('fake', null, null) $$, '42501', null, 'nobody can call the audit writer from the API');

-- Applying ------------------------------------------------------------------

select throws_ok(
  $$ select submit_role_application('seller', '{"business_name": "Shop"}') $$,
  '23514', null, 'a seller application needs its required details'
);
select throws_ok(
  $$ select submit_role_application('seller', '{"business_name": "Shop", "contact_information": "x", "city": "Lagos", "country": "NG", "description": "x", "category": "food"}') $$,
  '23514', null, 'sellers must be based in Canada'
);
select throws_ok($$ select submit_role_application('super_admin', '{}') $$, '23514', null, 'nobody can apply to be Super Admin');
select throws_ok($$ select submit_role_application('co_admin', '{}') $$, '23514', null, 'nobody can apply to be Co-admin');
select throws_ok($$ select submit_role_application('buyer', '{}') $$, '23514', null, 'the Buyer role is not applied for');
select throws_ok($$ select submit_role_application('admin', '[1, 2]') $$, '23514', null, 'details must be an object');

reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
set local role authenticated;

select lives_ok(
  $$ select submit_role_application('seller', '{"business_name": "Shop", "contact_information": "x", "city": "Toronto", "country": "CA", "description": "x", "category": "food"}') $$,
  'a complete application is accepted'
);
select is((select status from role_applications where role_key = 'seller'), 'pending', 'the application is pending');
select ok(not private.has_active_role('seller'), 'a pending application grants no role');
select throws_ok(
  $$ select submit_role_application('seller', '{"business_name": "Shop", "contact_information": "x", "city": "Toronto", "country": "CA", "description": "x", "category": "food"}') $$,
  '23505', null, 'a second open application for the same role is refused'
);

-- Someone else's application -------------------------------------------------

reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a3');
set local role authenticated;

select is_empty($$ select id from role_applications $$, 'a person cannot see someone else''s application');
select throws_ok(
  $$ select withdraw_role_application((select id from public.role_applications limit 1)) $$,
  'P0002', null, 'a missing or hidden application cannot be withdrawn'
);

reset role;
create temp table seller_application as
  select id from role_applications where applicant_id = '00000000-0000-4000-8000-0000000000a2';
grant select on seller_application to authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a3');
set local role authenticated;

select throws_ok($$ select withdraw_role_application((select id from seller_application)) $$, 'P0002', null, 'a person cannot withdraw someone else''s application');
select throws_ok($$ select approve_role_application((select id from seller_application)) $$, '42501', null, 'an ordinary user cannot approve');
select throws_ok($$ select reject_role_application((select id from seller_application), 'No') $$, '42501', null, 'an ordinary user cannot reject');
select throws_ok($$ select assign_role(auth.uid(), 'super_admin', 'Me') $$, '42501', null, 'an ordinary user cannot assign roles');

-- The applicant cannot approve themselves either.
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
set local role authenticated;
select throws_ok($$ select approve_role_application((select id from seller_application)) $$, '42501', null, 'an applicant cannot approve their own application');

-- Super Admin decisions ------------------------------------------------------

reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
set local role authenticated;

select ok(private.is_super_admin(), 'the Super Admin is recognised');
select ok((select count(*) from profiles) >= 6, 'Super Admin can see profiles');
select throws_ok($$ select reject_role_application((select id from seller_application), '  ') $$, '23514', null, 'a rejection needs a reason');
select throws_ok(
  $$ select approve_role_application((select id from seller_application), array['users.manage']) $$,
  '23514', null, 'a Seller cannot be approved with admin permissions'
);
select lives_ok($$ select approve_role_application((select id from seller_application)) $$, 'Super Admin can approve');
select throws_ok($$ select approve_role_application((select id from seller_application)) $$, '55000', null, 'an application can only be decided once');
select is(
  (select actor_id from audit_logs where action = 'role_application.approve'),
  '00000000-0000-4000-8000-0000000000a1'::uuid, 'the approval is audited with who did it'
);

reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a2');
set local role authenticated;
select ok(private.has_active_role('seller'), 'an approved role becomes active');
select ok(not private.has_permission('users.manage'), 'a Seller gets no admin permissions');
select throws_ok($$ select submit_role_application('seller', '{"business_name": "S", "contact_information": "x", "city": "T", "country": "CA", "description": "x", "category": "f"}') $$, '55000', null, 'someone cannot apply for a role they already hold');
select is_empty($$ select id from audit_logs $$, 'an ordinary user cannot read the audit log');

-- Admin ----------------------------------------------------------------------

reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a4');
set local role authenticated;
select submit_role_application('admin', '{"reason": "To help"}');

reset role;
create temp table admin_application as
  select id from role_applications where applicant_id = '00000000-0000-4000-8000-0000000000a4';
grant select on admin_application to authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
set local role authenticated;
select throws_ok(
  $$ select approve_role_application((select id from admin_application), array['not.real']) $$,
  '23514', null, 'permissions must exist'
);
select throws_ok(
  $$ select approve_role_application((select id from admin_application), array['products.publish']) $$,
  '23514', null, 'an Admin cannot be given seller-only permissions'
);
select lives_ok(
  $$ select approve_role_application((select id from admin_application), array['users.manage', 'reports.view']) $$,
  'Super Admin approves an Admin with chosen permissions'
);
select lives_ok(
  $$ select assign_role('00000000-0000-4000-8000-0000000000a5', 'co_admin', 'Trusted helper') $$,
  'only Super Admin gives the Co-admin role'
);

reset role;
create temp table role_rows as select user_id, role_key, id from user_roles where user_id::text not like '%-0000000000d_'; -- not the local sample shops
grant select on role_rows to authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a4');
set local role authenticated;

select ok(private.has_permission('users.manage'), 'an Admin has the permissions given');
select ok(not private.has_permission('sellers.manage'), 'an Admin has no others');
select ok(not private.is_super_admin(), 'an Admin is not Super Admin');
select ok((select count(*) from profiles) >= 6, 'users.manage allows reading profiles');
select throws_ok($$ select approve_role_application((select id from seller_application)) $$, '42501', null, 'an Admin cannot approve applications');
select throws_ok($$ select assign_role(auth.uid(), 'super_admin', 'Me') $$, '42501', null, 'an Admin cannot make themselves Super Admin');
select throws_ok(
  $$ select set_role_status((select id from role_rows where role_key = 'super_admin'), 'suspended', 'Coup') $$,
  '42501', null, 'an Admin cannot suspend Super Admin'
);
select throws_ok($$ select update_platform_setting('publishing.unverified_allowance', '100') $$, '42501', null, 'an Admin cannot change platform settings');

-- Delegation -----------------------------------------------------------------

select lives_ok(
  $$ select grant_permission((select id from role_rows where role_key = 'co_admin'), 'reports.view') $$,
  'an Admin can pass a permission they hold to a Co-admin'
);
select throws_ok(
  $$ select grant_permission((select id from role_rows where role_key = 'co_admin'), 'sellers.manage') $$,
  '42501', null, 'an Admin cannot pass on a permission they do not hold'
);
select throws_ok(
  $$ select grant_permission((select id from role_rows where role_key = 'admin'), 'sellers.manage') $$,
  '42501', null, 'an Admin cannot give themselves more power'
);
select throws_ok(
  $$ select grant_permission((select id from role_rows where role_key = 'super_admin'), 'reports.view') $$,
  '23514', null, 'permissions cannot be attached to Super Admin'
);
select throws_ok(
  $$ select grant_permission((select id from role_rows where role_key = 'seller'), 'reports.view') $$,
  '23514', null, 'admin permissions cannot be attached to a Seller'
);

reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a5');
set local role authenticated;
select ok(private.has_permission('reports.view'), 'a Co-admin has what was delegated');
select ok(not private.has_permission('users.manage'), 'a Co-admin has nothing else');
select throws_ok(
  $$ select grant_permission((select id from role_rows where role_key = 'co_admin'), 'reports.view') $$,
  '42501', null, 'a Co-admin cannot delegate'
);

-- Suspension -----------------------------------------------------------------

reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
set local role authenticated;
select throws_ok($$ select set_role_status((select id from role_rows where role_key = 'admin'), 'suspended', ' ') $$, '23514', null, 'suspending needs a reason');
select lives_ok($$ select set_role_status((select id from role_rows where role_key = 'admin'), 'suspended', 'Review') $$, 'Super Admin can suspend a role');

reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a4');
set local role authenticated;
select ok(not private.has_permission('users.manage'), 'suspending a role removes its permissions at once');
select ok(not private.has_active_role('admin'), 'a suspended role no longer counts as held');
select ok(private.has_active_role('buyer'), 'other roles are kept');
select results_eq($$ select id from profiles $$, $$ values ('00000000-0000-4000-8000-0000000000a4'::uuid) $$, 'and they can no longer read other profiles');

reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
set local role authenticated;
select lives_ok($$ select set_role_status((select id from role_rows where role_key = 'admin'), 'active', 'Cleared') $$, 'a suspended role can be restored');

reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a4');
set local role authenticated;
select ok(private.has_permission('users.manage'), 'restoring brings the permissions back');

reset role;
update profiles set status = 'suspended' where id = '00000000-0000-4000-8000-0000000000a4';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a4');
set local role authenticated;
select ok(not private.has_permission('users.manage'), 'a suspended account loses all access, even with a valid login');
select throws_ok($$ select submit_role_application('marketer', '{"reason": "x"}') $$, '42501', null, 'a suspended account cannot apply for roles');
reset role;
update profiles set status = 'active' where id = '00000000-0000-4000-8000-0000000000a4';

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
set local role authenticated;
select lives_ok($$ select set_role_status((select id from role_rows where role_key = 'admin'), 'revoked', 'Left') $$, 'a role can be revoked');
select throws_ok($$ select set_role_status((select id from role_rows where role_key = 'admin'), 'active', 'Back') $$, '55000', null, 'revoking is final');

reset role;
select is((select count(*)::int from profiles where id = '00000000-0000-4000-8000-0000000000a4'), 1, 'revoking a role does not delete the account');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a4');
set local role authenticated;
select ok(not private.has_permission('users.manage'), 'old permissions do not survive revocation');
reset role;

-- Protecting the last Super Admin -------------------------------------------

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
set local role authenticated;
select throws_ok(
  $$ select set_role_status((select id from role_rows where role_key = 'super_admin'), 'suspended', 'Oops') $$,
  '55000', null, 'the last Super Admin cannot be suspended'
);
reset role;
select throws_ok(
  $$ delete from user_roles where role_key = 'super_admin' $$,
  '55000', null, 'the last Super Admin cannot be removed, even from a direct database connection'
);
select throws_ok(
  $$ update profiles set status = 'suspended' where id = '00000000-0000-4000-8000-0000000000a1' $$,
  '55000', null, 'the last Super Admin''s account cannot be suspended'
);

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a3');
select throws_ok(
  $$ insert into user_roles (user_id, role_key) values ('00000000-0000-4000-8000-0000000000a3', 'super_admin') $$,
  '42501', null, 'no direct database change can create a Super Admin for someone else'
);

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
set local role authenticated;
select lives_ok(
  $$ select assign_role('00000000-0000-4000-8000-0000000000a6', 'super_admin', 'Second owner') $$,
  'a Super Admin can add another'
);
select throws_ok($$ select assign_role(auth.uid(), 'seller', 'x') $$, '23514', null, 'Seller cannot be assigned without its application');
select lives_ok(
  $$ select set_role_status((select id from role_rows where role_key = 'super_admin'), 'suspended', 'Handover') $$,
  'with another in place, a Super Admin can step down'
);
reset role;

-- The first Super Admin stepped down above, so their powers must be gone at once.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
set local role authenticated;
select ok(not private.is_super_admin(), 'a suspended Super Admin is no longer Super Admin');
select throws_ok($$ select assign_role(auth.uid(), 'admin', 'Sneaking back') $$, '42501', null, 'a suspended Super Admin cannot assign roles');
select throws_ok($$ select update_platform_setting('media.max_image_bytes', '1') $$, '42501', null, 'a suspended Super Admin cannot change settings');
select is_empty($$ select id from audit_logs $$, 'a suspended Super Admin cannot read the audit log');
reset role;

-- Platform settings ---------------------------------------------------------

select pg_temp.act_as('00000000-0000-4000-8000-0000000000a6');
set local role authenticated;
select lives_ok($$ select update_platform_setting('publishing.unverified_allowance', '3', 'Testing') $$, 'Super Admin can change a setting');
select results_eq(
  $$ select old_value, new_value, actor_id, reason from platform_settings_history where key = 'publishing.unverified_allowance' $$,
  $$ values ('2'::jsonb, '3'::jsonb, '00000000-0000-4000-8000-0000000000a6'::uuid, 'Testing') $$,
  'the change is recorded with who, what and why'
);
select throws_ok($$ select update_platform_setting('publishing.unverified_allowance', '"lots"', 'Testing') $$, '23514', null, 'a setting cannot change type');
select throws_ok($$ select update_platform_setting('publishing.unverified_allowance', '-1', 'Testing') $$, '23514', null, 'a limit cannot be negative');
select throws_ok($$ select update_platform_setting('publishing.unverified_allowance', '1.5', 'Testing') $$, '23514', null, 'a limit must be a whole number');
select throws_ok($$ select update_platform_setting('does.not.exist', 'true', 'Testing') $$, 'P0002', null, 'unknown settings are refused');

reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000a3');
set local role authenticated;
select is_empty($$ select key from platform_settings $$, 'ordinary users cannot read private settings');
select results_eq($$ select key from public_platform_settings order by key $$, $$ values ('ads.max_per_section'), ('comments.enabled'), ('favourites.enabled'), ('media.max_image_bytes'), ('payments.application_fee_minor'), ('reviews.enabled') $$, 'they can read public settings, and only those marked public');
select throws_ok($$ select update_platform_setting('media.max_image_bytes', '1') $$, '42501', null, 'ordinary users cannot change settings');
select is_empty($$ select id from platform_settings_history $$, 'ordinary users cannot read settings history');
reset role;

-- Visitors ------------------------------------------------------------------

select set_config('request.jwt.claims', '', true);
set local role anon;
select results_eq($$ select key from public_platform_settings order by key $$, $$ values ('ads.max_per_section'), ('comments.enabled'), ('favourites.enabled'), ('media.max_image_bytes'), ('payments.application_fee_minor'), ('reviews.enabled') $$, 'visitors can read public settings, and only those marked public');
select throws_ok($$ select * from platform_settings $$, '42501', null, 'visitors cannot read the settings table');
select throws_ok($$ select * from profiles $$, '42501', null, 'visitors cannot read profiles');
select throws_ok($$ select * from roles $$, '42501', null, 'visitors cannot read roles');
select throws_ok($$ select submit_role_application('seller', '{}') $$, '42501', null, 'visitors must sign in to apply');
select throws_ok($$ select approve_role_application(gen_random_uuid()) $$, '42501', null, 'visitors cannot call approval');
select throws_ok($$ select private.has_permission('users.manage') $$, '42501', null, 'visitors cannot reach the permission helpers');
reset role;
select ok(not private.has_permission('users.manage'), 'with no signed-in user, the helper answers no');

select * from finish();
rollback;
