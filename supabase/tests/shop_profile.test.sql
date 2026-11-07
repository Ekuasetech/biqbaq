-- Tests that try to break shop profile editing.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000a01', 'owner-a@example.com'),
  ('00000000-0000-4000-8000-000000000a02', 'owner-b@example.com'),
  ('00000000-0000-4000-8000-000000000a03', 'buyer-c@example.com');
insert into user_roles (user_id, role_key) values
  ('00000000-0000-4000-8000-000000000a01', 'seller'),
  ('00000000-0000-4000-8000-000000000a02', 'seller');
insert into sellers (id, owner_user_id, slug, name, city, category, description, verification_status) values
  ('00000000-0000-4000-8000-000000000b01', '00000000-0000-4000-8000-000000000a01', 'a-shop', 'A Shop', 'Toronto', 'food', 'Old words', 'manually_verified'),
  ('00000000-0000-4000-8000-000000000b02', '00000000-0000-4000-8000-000000000a02', 'b-shop', 'B Shop', 'Calgary', 'food', 'B words', 'unverified');
insert into seller_private (seller_id, contact_information) values
  ('00000000-0000-4000-8000-000000000b01', 'SECRET-OLD-PHONE');

create temp table cat as select slug from categories order by slug limit 1;
grant select on cat to authenticated, anon;

-- Who can change it.
set local role anon;
select throws_ok($$ select update_my_shop('X', 'X', 'food', 'X', 'X') $$, '42501', null, 'a visitor cannot edit a shop');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-000000000a03');
set local role authenticated;
select throws_ok($$ select update_my_shop('X', 'X', (select slug from cat), 'X', 'X') $$, '42501', 'NOT_AUTHORIZED', 'someone with no shop cannot edit one');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-000000000a01');
set local role authenticated;
select throws_ok($$ update sellers set name = 'Hacked' $$, '42501', null, 'a seller cannot skip the audit with a direct update');
select throws_ok($$ update sellers set description = 'Hacked' where slug = 'b-shop' $$, '42501', null, 'or change another shop');
select throws_ok($$ insert into seller_private (seller_id, contact_information) values ('00000000-0000-4000-8000-000000000b02', 'x') $$, '42501', null, 'or write private details directly');
select throws_ok($$ update seller_private set contact_information = 'x' $$, '42501', null, 'or change them directly');

-- A normal edit, which only ever reaches the caller's own shop.
select lives_ok($$ select update_my_shop('  New Name  ', ' Ottawa ', (select slug from cat), ' New words ', ' 416-555-0199 ') $$, 'a seller edits their shop');
reset role;
select results_eq(
  $$ select name, city, category, description, slug, verification_status from sellers where id = '00000000-0000-4000-8000-000000000b01' $$,
  $$ select 'New Name', 'Ottawa', (select slug from cat), 'New words', 'a-shop', 'manually_verified' $$,
  'details are saved trimmed, and the link and verification stay the same'
);
select is((select contact_information from seller_private where seller_id = '00000000-0000-4000-8000-000000000b01'), '416-555-0199', 'private details are saved');
select is((select name from sellers where id = '00000000-0000-4000-8000-000000000b02'), 'B Shop', 'no other shop changes');

-- The audit record.
select results_eq(
  $$ select actor_id, target_id, metadata ->> 'old_name', metadata ->> 'new_name' from audit_logs where action = 'seller.profile_update' $$,
  $$ values ('00000000-0000-4000-8000-000000000a01'::uuid, '00000000-0000-4000-8000-000000000b01', 'A Shop', 'New Name') $$,
  'the change is audited, with who did it and the old and new name'
);
select is(
  (select metadata -> 'changed' from audit_logs where action = 'seller.profile_update'),
  '["name", "city", "category", "description", "contact_information"]'::jsonb,
  'the audit lists what changed'
);
select is_empty(
  $$ select 1 from audit_logs where action = 'seller.profile_update' and metadata::text ~ '(416-555|SECRET-OLD|New words)' $$,
  'private details and descriptions stay out of the audit log'
);

-- Saving with no change leaves no noise.
select pg_temp.act_as('00000000-0000-4000-8000-000000000a01');
set local role authenticated;
select lives_ok($$ select update_my_shop('New Name', 'Ottawa', (select slug from cat), 'New words', '416-555-0199') $$, 'saving without changes works');
reset role;
select is((select count(*)::int from audit_logs where action = 'seller.profile_update'), 1, 'and adds no audit record');

-- Bad details are refused, and change nothing.
select pg_temp.act_as('00000000-0000-4000-8000-000000000a01');
set local role authenticated;
select throws_ok($$ select update_my_shop('   ', 'Ottawa', (select slug from cat), 'x', 'x') $$, '23514', 'DETAILS_REQUIRED', 'a blank name is refused');
select throws_ok($$ select update_my_shop('x', null, (select slug from cat), 'x', 'x') $$, '23514', 'DETAILS_REQUIRED', 'a missing city is refused');
select throws_ok($$ select update_my_shop('x', 'x', (select slug from cat), '', 'x') $$, '23514', 'DETAILS_REQUIRED', 'a blank description is refused');
select throws_ok($$ select update_my_shop('x', 'x', (select slug from cat), 'x', ' ') $$, '23514', 'DETAILS_REQUIRED', 'blank contact details are refused');
select throws_ok($$ select update_my_shop(repeat('x', 151), 'x', (select slug from cat), 'x', 'x') $$, '23514', 'DETAILS_TOO_LONG', 'an overlong name is refused');
select throws_ok($$ select update_my_shop('x', repeat('x', 101), (select slug from cat), 'x', 'x') $$, '23514', 'DETAILS_TOO_LONG', 'an overlong city is refused');
select throws_ok($$ select update_my_shop('x', 'x', (select slug from cat), repeat('x', 1001), 'x') $$, '23514', 'DETAILS_TOO_LONG', 'an overlong description is refused');
select throws_ok($$ select update_my_shop('x', 'x', (select slug from cat), 'x', repeat('x', 201)) $$, '23514', 'DETAILS_TOO_LONG', 'overlong contact details are refused');
select throws_ok($$ select update_my_shop('x', 'x', 'not-a-category', 'x', 'x') $$, '23514', 'CATEGORY_NOT_FOUND', 'an unknown category is refused');
select throws_ok($$ select update_my_shop('x', 'x', null, 'x', 'x') $$, '23514', 'CATEGORY_NOT_FOUND', 'a missing category is refused');
reset role;

-- Suspensions.
update sellers set status = 'suspended' where id = '00000000-0000-4000-8000-000000000b01';
select pg_temp.act_as('00000000-0000-4000-8000-000000000a01');
set local role authenticated;
select throws_ok($$ select update_my_shop('Back', 'x', (select slug from cat), 'x', 'x') $$, '42501', 'NOT_AUTHORIZED', 'a suspended shop cannot edit its details');
reset role;
update sellers set status = 'active' where id = '00000000-0000-4000-8000-000000000b01';
update user_roles set status = 'suspended' where user_id = '00000000-0000-4000-8000-000000000a01' and role_key = 'seller';
select pg_temp.act_as('00000000-0000-4000-8000-000000000a01');
set local role authenticated;
select throws_ok($$ select update_my_shop('Back', 'x', (select slug from cat), 'x', 'x') $$, '42501', 'NOT_AUTHORIZED', 'a suspended seller role cannot edit either');
reset role;

select * from finish();
rollback;
