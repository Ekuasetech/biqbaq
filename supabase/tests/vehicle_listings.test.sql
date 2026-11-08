-- Tests that try to break cargo cars (Q-04, Q-05, Q-33).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000701', 'v-verified@example.com', now()),
  ('00000000-0000-4000-8000-000000000702', 'v-unverified@example.com', now()),
  ('00000000-0000-4000-8000-000000000703', 'v-buyer@example.com', now()),
  ('00000000-0000-4000-8000-000000000704', 'v-mod@example.com', now()),
  ('00000000-0000-4000-8000-000000000705', 'v-other@example.com', now());
insert into user_roles (user_id, role_key) values
  ('00000000-0000-4000-8000-000000000701', 'seller'),
  ('00000000-0000-4000-8000-000000000702', 'seller'),
  ('00000000-0000-4000-8000-000000000705', 'seller'),
  ('00000000-0000-4000-8000-000000000704', 'admin');
insert into user_role_permissions (user_role_id, permission_key)
  select id, 'vehicle_listings.moderate' from user_roles where user_id = '00000000-0000-4000-8000-000000000704' and role_key = 'admin';
insert into sellers (id, owner_user_id, slug, name, city, verification_status) values
  ('00000000-0000-4000-8000-000000000711', '00000000-0000-4000-8000-000000000701', 'v-verified', 'V Verified', 'Toronto', 'manually_verified'),
  ('00000000-0000-4000-8000-000000000712', '00000000-0000-4000-8000-000000000702', 'v-unverified', 'V Unverified', 'Toronto', 'unverified'),
  ('00000000-0000-4000-8000-000000000715', '00000000-0000-4000-8000-000000000705', 'v-other', 'V Other', 'Ottawa', 'manually_verified');
create temp table car (id uuid);
grant select, insert, delete on car to anon, authenticated, service_role;
create temp table today (d date);
insert into today select (now() at time zone 'America/Toronto')::date;
grant select on today to anon, authenticated, service_role;

-- Only verified sellers list cargo cars (Q-05).
select pg_temp.act_as('00000000-0000-4000-8000-000000000703');
set local role authenticated;
select throws_ok($$ select save_vehicle_listing(null, 'Toyota', 'Sienna', 2021, 'Toronto', 'Lagos', (select d from today) + 30, 300, '{}', 'accepting_cargo') $$, '42501', 'NOT_AUTHORIZED', 'a buyer cannot list a car');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000702');
set local role authenticated;
select throws_ok($$ select save_vehicle_listing(null, 'Toyota', 'Sienna', 2021, 'Toronto', 'Lagos', (select d from today) + 30, 300, '{}', 'accepting_cargo') $$, '42501', 'VERIFICATION_REQUIRED', 'an unverified seller cannot either');
select throws_ok($$ insert into vehicle_listings (seller_id, slug, make, model, year, origin_city, destination_city, departure_date, created_by) values ('00000000-0000-4000-8000-000000000712', 'x', 'a', 'b', 2020, 'c', 'd', now()::date + 9, auth.uid()) $$, '42501', null, 'or write the table directly');
reset role;

-- A verified seller's car, checked like the database checks it.
select pg_temp.act_as('00000000-0000-4000-8000-000000000701');
set local role authenticated;
select throws_ok($$ select save_vehicle_listing(null, 'Toyota', 'Sienna', 2021, 'Toronto', 'Lagos', (select d from today) - 1, 300, '{}', 'accepting_cargo') $$, '23514', 'DEPARTURE_IN_PAST', 'a trip that has already left is refused');
select throws_ok($$ select save_vehicle_listing(null, 'Toyota', 'Sienna', 2021, 'Toronto', 'Lagos', (select d from today) + 30, -1, '{}', 'accepting_cargo') $$, '23514', 'DETAILS_INVALID', 'negative weight is refused');
select throws_ok($$ select save_vehicle_listing(null, 'Toyota', 'Sienna', 2021, 'Toronto', 'Lagos', (select d from today) + 30, 100001, '{}', 'accepting_cargo') $$, '23514', 'DETAILS_INVALID', 'so is more than 100,000 kg');
select throws_ok($$ select save_vehicle_listing(null, ' ', 'Sienna', 2021, 'Toronto', 'Lagos', (select d from today) + 30, 300, '{}', 'accepting_cargo') $$, '23514', 'DETAILS_INVALID', 'a make is needed');
select throws_ok($$ select save_vehicle_listing(null, 'Toyota', 'Sienna', 2021, 'Toronto', 'Lagos', (select d from today) + 30, 300, '{}', 'sold') $$, '23514', 'DETAILS_INVALID', 'an unknown cargo status is refused');
select throws_ok($$ select save_vehicle_listing(null, 'Toyota', 'Sienna', 2021, 'Toronto', 'Lagos', (select d from today) + 30, 300, array_fill('x'::text, array[11]), 'accepting_cargo') $$, '23514', 'DETAILS_INVALID', 'more than 10 restrictions are refused');
select throws_ok($$ select save_vehicle_listing(null, 'Toyota', 'Sienna', 2021, 'Toronto', 'Lagos', (select d from today) + 30, 300, array[repeat('x', 121)], 'accepting_cargo') $$, '23514', 'DETAILS_INVALID', 'a very long restriction is refused');
select lives_ok($$ insert into car select save_vehicle_listing(null, ' Kia ', 'Sedona', 2015, 'Toronto', 'Lagos', (select d from today) + 30, 300, array[' No food ', '', 'No liquids'], 'accepting_cargo') $$, 'a verified seller lists a car');
select results_eq(
  $$ select slug, make, status, available_kg, restrictions from my_vehicle_listings() $$,
  $$ values ('2015-kia-sedona', 'Kia', 'draft', 300, array['No food', 'No liquids']) $$,
  'it starts as a draft, tidied, and the seller sees it'
);
reset role;
select is_empty($$ select 1 from public_vehicle_listings where id = (select id from car) $$, 'a draft is not public');
select is((select count(*)::int from audit_logs where action = 'vehicle.create' and target_id = (select id::text from car)), 1, 'creating it is audited');

-- Publishing needs a photo.
select pg_temp.act_as('00000000-0000-4000-8000-000000000701');
set local role authenticated;
select throws_ok($$ select publish_vehicle_listing((select id from car)) $$, '23514', 'LISTING_INCOMPLETE', 'it cannot go live without a photo');
select throws_ok($$ select record_vehicle_image(auth.uid(), (select id from car), 'x', 'https://x') $$, '42501', null, 'only the server attaches a photo');
select throws_ok($$ insert into media_assets (entity_type, entity_id, secure_url) values ('vehicle', (select id from car), 'https://evil.example/x.jpg') $$, '42501', null, 'a seller cannot add one directly');
select is_empty($$ select 1 from media_assets where entity_type = 'vehicle' $$, 'car photos are read through the seller''s list and the public view, not the table');
select lives_ok($$ select authorize_vehicle_image((select id from car)) $$, 'the seller may upload to their own car');
reset role;
set local role service_role;
select isnt(record_vehicle_image('00000000-0000-4000-8000-000000000701', (select id from car), 'biqbaq/vehicles/a', 'https://res.cloudinary.com/a.jpg'), null, 'the server records a photo');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000701');
set local role authenticated;
select lives_ok($$ select publish_vehicle_listing((select id from car)) $$, 'now it goes live');
reset role;
set local role anon;
select results_eq($$ select slug, available_kg, seller_verified from public_vehicle_listings where id = (select id from car) $$, $$ values ('2015-kia-sedona', 300, true) $$, 'visitors see it');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000701');
set local role authenticated;
select throws_ok($$ select remove_vehicle_image((select (photos -> 0 ->> 'id')::uuid from my_vehicle_listings())) $$, '55000', 'LAST_PHOTO', 'a live car keeps at least one photo');
reset role;

-- It never counts towards the publication allowance (Q-04).
select is((select count(*)::int from product_publication_ledger where seller_id = '00000000-0000-4000-8000-000000000711'), 0, 'no allowance is used');

-- Another seller cannot touch it.
select pg_temp.act_as('00000000-0000-4000-8000-000000000705');
set local role authenticated;
select throws_ok($$ select save_vehicle_listing((select id from car), 'Hacked', 'Car', 2021, 'Toronto', 'Lagos', (select d from today) + 30, 1, '{}', 'full') $$, '42501', null, 'another seller cannot edit it');
select throws_ok($$ select unpublish_vehicle_listing((select id from car)) $$, '42501', null, 'or unpublish it');
select throws_ok($$ select delete_vehicle_listing((select id from car)) $$, '42501', null, 'or delete it');
select throws_ok($$ select authorize_vehicle_image((select id from car)) $$, '42501', null, 'or upload to it');
select is_empty($$ select 1 from my_vehicle_listings() $$, 'and does not see it among their cars');
reset role;

-- Losing verification hides it, without changing it.
update sellers set verification_status = 'suspended' where id = '00000000-0000-4000-8000-000000000711';
select is_empty($$ select 1 from public_vehicle_listings where id = (select id from car) $$, 'a seller who loses verification has their car hidden');
select pg_temp.act_as('00000000-0000-4000-8000-000000000701');
set local role authenticated;
select throws_ok($$ select save_vehicle_listing((select id from car), 'Toyota', 'Sienna', 2021, 'Toronto', 'Lagos', (select d from today) + 30, 1, '{}', 'full') $$, '42501', 'VERIFICATION_REQUIRED', 'and cannot change it meanwhile');
reset role;
update sellers set verification_status = 'manually_verified' where id = '00000000-0000-4000-8000-000000000711';
select isnt_empty($$ select 1 from public_vehicle_listings where id = (select id from car) $$, 'it comes back with verification');

-- A suspended shop's cars are hidden too (Q-31).
update sellers set status = 'suspended' where id = '00000000-0000-4000-8000-000000000711';
select is_empty($$ select 1 from public_vehicle_listings where id = (select id from car) $$, 'a suspended shop''s car is hidden');
update sellers set status = 'active' where id = '00000000-0000-4000-8000-000000000711';

-- A trip that has left drops off the site by itself.
update vehicle_listings set departure_date = (select d from today) - 1 where id = (select id from car);
select is_empty($$ select 1 from public_vehicle_listings where id = (select id from car) $$, 'a car whose departure has passed is hidden');
update vehicle_listings set departure_date = (select d from today) + 30 where id = (select id from car);

-- Views: once per visitor per day, never the seller's own.
set local role service_role;
select ok(record_vehicle_view((select id from car), 'visitor-1', 'ip-1'), 'a visitor''s view counts');
select ok(not record_vehicle_view((select id from car), 'visitor-1', 'ip-1'), 'a second view that day does not');
select ok(not record_vehicle_view((select id from car), 'visitor-2', 'ip-2', '00000000-0000-4000-8000-000000000701'), 'nor does the seller''s own');
reset role;
select is((select view_count::int from public_vehicle_listings where id = (select id from car)), 1, 'the count shows one view');
set local role anon;
select throws_ok($$ select record_vehicle_view((select id from car), 'v', 'i') $$, '42501', null, 'visitors cannot count views themselves');
select throws_ok($$ select * from prepare_vehicle_enquiry((select id from car), 'e', 'i') $$, '42501', null, 'or prepare an enquiry, which reveals the dealer''s email');
reset role;

-- Contact goes through Biqbaq (Q-33): the server gets the dealer's address, nobody else.
set local role service_role;
select results_eq($$ select seller_email, product_slug from prepare_vehicle_enquiry((select id from car), 'email-1', 'ip-9') $$, $$ values ('v-verified@example.com', '2015-kia-sedona') $$, 'the server can reach the dealer');
select throws_ok($$ select * from prepare_vehicle_enquiry(gen_random_uuid(), 'email-1', 'ip-9') $$, 'P0002', 'LISTING_NOT_FOUND', 'an unknown car cannot be contacted');
reset role;
select is((select count(*)::int from contact_enquiries where vehicle_listing_id = (select id from car)), 1, 'the enquiry is recorded against the car');
set local role anon;
select is_empty($$ select 1 from information_schema.columns where table_name = 'public_vehicle_listings' and column_name ~ 'email|phone' $$, 'the public view has no email or phone');
reset role;

-- Moderation.
select pg_temp.act_as('00000000-0000-4000-8000-000000000703');
set local role authenticated;
select throws_ok($$ select set_vehicle_listing_suspended((select id from car), true, 'Unsafe cargo') $$, '42501', null, 'a buyer cannot suspend a car');
select throws_ok($$ select * from admin_list_moderation_vehicles() $$, '42501', null, 'or list them for moderation');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000704');
set local role authenticated;
select results_eq($$ select vehicles from my_moderation_access() $$, $$ values (true) $$, 'a moderator with the permission sees the cars section');
select throws_ok($$ select set_vehicle_listing_suspended((select id from car), true, ' ') $$, '23514', null, 'a reason is needed');
select lives_ok($$ select set_vehicle_listing_suspended((select id from car), true, 'Unsafe cargo') $$, 'a moderator suspends it');
reset role;
select is_empty($$ select 1 from public_vehicle_listings where id = (select id from car) $$, 'a suspended car is hidden');
select is((select count(*)::int from background_jobs where user_id = '00000000-0000-4000-8000-000000000701' and payload ->> 'template' = 'product_suspended' and payload -> 'data' ->> 'reason' = 'Unsafe cargo'), 1, 'the seller is emailed with the reason');
select is((select count(*)::int from audit_logs where action = 'vehicle.suspend' and target_id = (select id::text from car)), 1, 'and it is audited');
select pg_temp.act_as('00000000-0000-4000-8000-000000000701');
set local role authenticated;
select throws_ok($$ select publish_vehicle_listing((select id from car)) $$, '55000', 'LISTING_NOT_PUBLISHABLE', 'the seller cannot republish a suspended car');
select throws_ok($$ select delete_vehicle_listing((select id from car)) $$, '55000', 'LISTING_SUSPENDED', 'or delete it to hide the record');
select throws_ok($$ select save_vehicle_listing((select id from car), 'Toyota', 'Sienna', 2021, 'Toronto', 'Lagos', (select d from today) + 30, 1, '{}', 'full') $$, '55000', 'LISTING_NOT_EDITABLE', 'or edit it');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000704');
set local role authenticated;
select lives_ok($$ select set_vehicle_listing_suspended((select id from car), false, 'Checked') $$, 'the moderator lifts it');
reset role;
select is((select status from vehicle_listings where id = (select id from car)), 'unpublished', 'it comes back as not public, for the seller to republish');

-- An Admin cannot moderate their own shop (Q-29).
insert into sellers (id, owner_user_id, slug, name, city, verification_status) values
  ('00000000-0000-4000-8000-000000000714', '00000000-0000-4000-8000-000000000704', 'v-mod-shop', 'V Mod Shop', 'Toronto', 'manually_verified');
insert into vehicle_listings (id, seller_id, slug, make, model, year, origin_city, destination_city, departure_date, status, created_by) values
  ('00000000-0000-4000-8000-000000000720', '00000000-0000-4000-8000-000000000714', 'v-mod-car', 'Honda', 'Pilot', 2019, 'Toronto', 'Abuja', (select d from today) + 9, 'published', '00000000-0000-4000-8000-000000000704');
select pg_temp.act_as('00000000-0000-4000-8000-000000000704');
set local role authenticated;
select throws_ok($$ select set_vehicle_listing_suspended('00000000-0000-4000-8000-000000000720', true, 'x') $$, '42501', null, 'an Admin cannot moderate their own car');
reset role;

-- Deleting keeps the record but takes it off the seller's list.
select pg_temp.act_as('00000000-0000-4000-8000-000000000701');
set local role authenticated;
select lives_ok($$ select delete_vehicle_listing((select id from car)) $$, 'the seller deletes it');
select is_empty($$ select 1 from my_vehicle_listings() $$, 'it leaves their list');
select throws_ok($$ select publish_vehicle_listing((select id from car)) $$, null, null, 'and cannot be brought back');
reset role;
select isnt((select deleted_at from vehicle_listings where id = (select id from car)), null, 'the record is kept, marked deleted');

select * from finish();
rollback;
