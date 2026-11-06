-- Tests for the Super Admin Role Applications list.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000b1', 'owner@example.com', '{"full_name": "The Owner"}'),
  ('00000000-0000-4000-8000-0000000000b2', 'ada@example.com', '{"full_name": "Ada Shop"}'),
  ('00000000-0000-4000-8000-0000000000b3', 'bola_50%@example.com', '{"full_name": "Bola"}');
select private.bootstrap_super_admin('owner@example.com');

insert into role_applications (id, applicant_id, role_key, status, details, created_at, reviewed_by, decided_at, rejection_reason) values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000b2', 'seller', 'rejected', '{"business_name": "Old Shop"}', now() - interval '3 days', '00000000-0000-4000-8000-0000000000b1', now() - interval '2 days', 'Incomplete'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000b2', 'seller', 'pending', '{"business_name": "New Shop"}', now() - interval '1 day', null, null, null),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000b3', 'marketer', 'pending', '{"reason": "Help"}', now() - interval '2 days', null, null, null);

-- Who may read it ------------------------------------------------------------

select pg_temp.act_as('00000000-0000-4000-8000-0000000000b2');
set local role authenticated;
select throws_ok($$ select * from admin_list_role_applications() $$, '42501', null, 'an ordinary user cannot list applications or see emails');
reset role;

select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok($$ select * from admin_list_role_applications() $$, '42501', null, 'a visitor cannot call the list');
reset role;


select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
set local role authenticated;

-- Filters --------------------------------------------------------------------

select is((select count(*)::int from admin_list_role_applications()), 3, 'Super Admin sees every application');
select results_eq(
  $$ select id from admin_list_role_applications('pending') $$,
  $$ values ('10000000-0000-4000-8000-000000000003'::uuid), ('10000000-0000-4000-8000-000000000002'::uuid) $$,
  'the waiting queue shows the oldest first'
);
select is((select role_key from admin_list_role_applications(null, 'marketer')), 'marketer', 'filters by role');
select is((select count(*)::int from admin_list_role_applications(null, null, null, '00000000-0000-4000-8000-0000000000b2')), 2, 'shows one person''s history');

select is((select applicant_email from admin_list_role_applications(null, 'marketer')), 'bola_50%@example.com', 'returns the applicant''s email');
select is((select applicant_name from admin_list_role_applications(null, 'marketer')), 'Bola', 'returns the applicant''s name');
select is(
  (select reviewer_name from admin_list_role_applications('rejected')),
  'The Owner', 'returns who reviewed it'
);

-- Search ---------------------------------------------------------------------

select is((select count(*)::int from admin_list_role_applications(null, null, 'ADA SHOP')), 2, 'searches by name, ignoring case');
select is((select count(*)::int from admin_list_role_applications(null, null, 'ada@example')), 2, 'searches by email');
select is((select count(*)::int from admin_list_role_applications(null, null, 'new shop')), 1, 'searches by business name');
select is((select count(*)::int from admin_list_role_applications(null, null, 'nothing-matches')), 0, 'no match returns nothing');
select is((select count(*)::int from admin_list_role_applications(null, null, '%')), 1, 'a percent sign is an ordinary character, not a wildcard');
select is((select count(*)::int from admin_list_role_applications(null, null, '_')), 1, 'an underscore is an ordinary character, not a wildcard');
select is((select count(*)::int from admin_list_role_applications(null, null, '   ')), 3, 'a blank search shows everything');

-- Paging ---------------------------------------------------------------------

select is((select count(*)::int from admin_list_role_applications(null, null, null, null, 2, 0)), 2, 'limits the page size');
select is((select count(*)::int from admin_list_role_applications(null, null, null, null, 2, 2)), 1, 'moves to the next page');
select is((select max(total)::int from admin_list_role_applications(null, null, null, null, 2, 0)), 3, 'reports the total across pages');
select is((select count(*)::int from admin_list_role_applications(null, null, null, null, -5, -5)), 1, 'odd paging values are made safe');

-- It only reads --------------------------------------------------------------

select is((select count(*)::int from role_applications where status = 'pending'), 2, 'listing changes nothing');
reset role;

-- A suspended Super Admin loses access at once ------------------------------

select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
select assign_role('00000000-0000-4000-8000-0000000000b3', 'super_admin', 'Second owner');
update user_roles set status = 'suspended'
where user_id = '00000000-0000-4000-8000-0000000000b1' and role_key = 'super_admin';
set local role authenticated;
select throws_ok($$ select * from admin_list_role_applications() $$, '42501', null, 'a suspended Super Admin cannot list applications');
reset role;

select * from finish();
rollback;
