-- Tests for the accounts, roles and permissions foundation.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(43);

-- Structure -----------------------------------------------------------------

select has_table('public', t, t || ' exists')
from unnest(array[
  'profiles', 'roles', 'permissions', 'role_permissions', 'role_applications',
  'user_roles', 'user_role_permissions', 'audit_logs', 'platform_settings',
  'platform_settings_history'
]) as t;

select hasnt_column('public', 'profiles', 'role', 'roles are never a column on the profile');

select is_empty(
  $$ select c.relname from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity $$,
  'every table in public has row level security on'
);

-- Reference data ------------------------------------------------------------

select is(
  (select count(*)::int from roles where key in ('super_admin', 'co_admin', 'buyer') and is_assignable_by_application),
  0, 'Super Admin, Co-admin and Buyer cannot be applied for'
);
select is(
  (select count(*)::int from role_permissions where role_key in ('admin', 'co_admin')),
  0, 'Admin and Co-admin start with no permissions'
);
select is(
  (select value from platform_settings where key = 'publishing.unverified_allowance'),
  '2'::jsonb, 'the unverified publishing allowance defaults to 2'
);
select is(
  (select value from platform_settings where key = 'blog.seller_publishing_enabled'),
  'false'::jsonb, 'seller blogging is off by default'
);
select is(
  (select value from platform_settings where key = 'media.max_image_bytes'),
  '1048576'::jsonb, 'the image limit defaults to 1 MB'
);

-- New accounts --------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000001', 'ada@example.com', '{"full_name": "  Ada Sample  ", "locale": "fr"}'),
  ('00000000-0000-4000-8000-000000000002', 'bad@example.com', jsonb_build_object('name', repeat('x', 500), 'locale', 'de')),
  ('00000000-0000-4000-8000-000000000003', 'none@example.com', null),
  ('00000000-0000-4000-8000-000000000004', 'admin@example.com', '{}'),
  ('00000000-0000-4000-8000-000000000005', 'odd@example.com', '{"full_name": {"nested": true}, "locale": 12345}');

select is(
  (select display_name from profiles where id = '00000000-0000-4000-8000-000000000001'),
  'Ada Sample', 'a new account gets a profile with a trimmed name'
);
select is(
  (select locale from profiles where id = '00000000-0000-4000-8000-000000000001'),
  'fr', 'a valid language is kept'
);
select is(
  (select locale from profiles where id = '00000000-0000-4000-8000-000000000002'),
  'en', 'an unsupported language falls back to English'
);
select is(
  (select char_length(display_name) from profiles where id = '00000000-0000-4000-8000-000000000002'),
  100, 'an overlong name cannot block signup, and is cut short'
);
select is(
  (select display_name from profiles where id = '00000000-0000-4000-8000-000000000003'),
  null, 'an account with no details at all can still sign up'
);
select is(
  (select display_name from profiles where id = '00000000-0000-4000-8000-000000000005'),
  null, 'a name that is not plain text is ignored'
);
select is(
  (select locale from profiles where id = '00000000-0000-4000-8000-000000000005'),
  'en', 'a language that is not plain text falls back to English'
);
select results_eq(
  $$ select role_key, status from user_roles where user_id = '00000000-0000-4000-8000-000000000001' $$,
  $$ values ('buyer', 'active') $$,
  'a new account gets only the Buyer role'
);

-- Role applications ---------------------------------------------------------

insert into role_applications (applicant_id, role_key)
values ('00000000-0000-4000-8000-000000000001', 'seller');

select is(
  (select count(*)::int from user_roles
   where user_id = '00000000-0000-4000-8000-000000000001' and role_key = 'seller'),
  0, 'a pending application grants no role'
);
select throws_ok(
  $$ insert into role_applications (applicant_id, role_key)
     values ('00000000-0000-4000-8000-000000000001', 'seller') $$,
  '23505', null, 'only one pending application per person and role'
);
select throws_ok(
  $$ insert into role_applications (applicant_id, role_key)
     values ('00000000-0000-4000-8000-000000000001', 'super_admin') $$,
  '23514', null, 'nobody can apply to be Super Admin'
);
select throws_ok(
  $$ update role_applications set status = 'rejected', decided_at = now()
     where applicant_id = '00000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'a rejection needs a reason'
);
select throws_ok(
  $$ update role_applications set status = 'approved'
     where applicant_id = '00000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'a decision needs a date'
);

update role_applications
set status = 'rejected', decided_at = now(), rejection_reason = 'Test'
where applicant_id = '00000000-0000-4000-8000-000000000001';

select lives_ok(
  $$ insert into role_applications (applicant_id, role_key)
     values ('00000000-0000-4000-8000-000000000001', 'seller') $$,
  'someone can apply again after a rejection'
);

-- Role assignments ----------------------------------------------------------

select throws_ok(
  $$ insert into user_roles (user_id, role_key)
     values ('00000000-0000-4000-8000-000000000001', 'buyer') $$,
  '23505', null, 'a person holds each role only once'
);

-- Permissions hang off the assignment, so revoking cannot remove the account.
update user_roles set status = 'revoked'
where user_id = '00000000-0000-4000-8000-000000000002';
select is(
  (select count(*)::int from profiles where id = '00000000-0000-4000-8000-000000000002'),
  1, 'revoking a role does not delete the account'
);

-- Audit log and settings history --------------------------------------------

insert into audit_logs (action) values ('test.action');
insert into platform_settings_history (key, new_value) values ('test', 'true');

select throws_ok($$ update audit_logs set action = 'changed' $$, '55000', null, 'audit entries cannot be changed');
select throws_ok($$ delete from audit_logs $$, '55000', null, 'audit entries cannot be deleted');
select throws_ok($$ truncate audit_logs $$, '55000', null, 'the audit log cannot be emptied');
select throws_ok($$ delete from platform_settings_history $$, '55000', null, 'settings history cannot be deleted');

-- Client access: everything is denied until the security rules are added ---

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-000000000001", "role": "authenticated"}', true);

select throws_ok($$ select * from profiles $$, '42501', null, 'a signed-in user cannot read profiles yet');
select throws_ok(
  $$ insert into user_roles (user_id, role_key) values ('00000000-0000-4000-8000-000000000001', 'super_admin') $$,
  '42501', null, 'a signed-in user cannot give themselves a role'
);
select throws_ok(
  $$ update platform_settings set value = '100' where key = 'publishing.unverified_allowance' $$,
  '42501', null, 'a signed-in user cannot change platform settings'
);

reset role;
set local role anon;

select throws_ok($$ select * from user_roles $$, '42501', null, 'a visitor cannot read role assignments');
select throws_ok($$ select * from audit_logs $$, '42501', null, 'a visitor cannot read the audit log');
select throws_ok($$ select private.set_updated_at() $$, '42501', null, 'a visitor cannot reach internal functions');

reset role;

select * from finish();
rollback;
