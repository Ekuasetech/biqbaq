-- Tests that try to break advertisements.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000601', 'a-super@example.com'),
  ('00000000-0000-4000-8000-000000000602', 'a-coadmin@example.com'),
  ('00000000-0000-4000-8000-000000000603', 'a-admin@example.com'),
  ('00000000-0000-4000-8000-000000000604', 'a-buyer@example.com');
select private.bootstrap_super_admin('a-super@example.com');
insert into user_roles (user_id, role_key) values
  ('00000000-0000-4000-8000-000000000602', 'co_admin'),
  ('00000000-0000-4000-8000-000000000603', 'admin');
insert into user_role_permissions (user_role_id, permission_key)
  select id, 'ads.manage' from user_roles where user_id in ('00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000603') and role_key in ('co_admin', 'admin');
create temp table a (id uuid);
grant select, insert, delete on a to authenticated, service_role;
delete from advertisements;

-- Who may manage ads.
set local role anon;
select throws_ok($$ select * from advertisements $$, '42501', null, 'visitors cannot read ads directly');
select lives_ok($$ select * from public_advertisements $$, 'but can read live ads');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000604');
set local role authenticated;
select ok(not my_ads_access(), 'a buyer has no access');
select throws_ok($$ select save_ad(null, 'T', '', 'A', '/products', array['homepage'], 1, now(), now() + interval '1 day') $$, '42501', null, 'and cannot create an ad');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000603');
set local role authenticated;
select ok(not my_ads_access(), 'an Admin has no access, even with the permission, as the owner decided');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000602');
set local role authenticated;
select ok(my_ads_access(), 'a Co-admin with the permission has access');

-- Creating one, safely.
select throws_ok($$ select save_ad(null, ' ', '', 'A', '/products', array['homepage'], 1, now(), now() + interval '1 day') $$, '23514', 'DETAILS_REQUIRED', 'a title is needed');
select throws_ok($$ select save_ad(null, 'T', '', 'A', '/products', array['homepage'], 1, now(), now() - interval '1 day') $$, '23514', 'DATES_INVALID', 'it must end after it starts');
select throws_ok($$ select save_ad(null, 'T', '', 'A', 'javascript:alert(1)', array['homepage'], 1, now(), now() + interval '1 day') $$, '23514', 'DETAILS_INVALID', 'a script link is refused');
select throws_ok($$ select save_ad(null, 'T', '', 'A', 'http://insecure.ca', array['homepage'], 1, now(), now() + interval '1 day') $$, '23514', 'DETAILS_INVALID', 'an insecure link is refused');
select throws_ok($$ select save_ad(null, 'T', '', 'A', '//evil.com', array['homepage'], 1, now(), now() + interval '1 day') $$, '23514', 'DETAILS_INVALID', 'a link to another site disguised as a path is refused');
select throws_ok($$ select save_ad(null, 'T', '', 'A', '/products', array['sidebar'], 1, now(), now() + interval '1 day') $$, '23514', 'DETAILS_INVALID', 'a place the site does not have is refused');
select throws_ok($$ select save_ad(null, 'T', '', 'A', '/products', '{}', 1, now(), now() + interval '1 day') $$, '23514', 'DETAILS_INVALID', 'it needs somewhere to show');
select throws_ok($$ select save_ad(null, 'T', '', 'A', '/products', array['homepage'], 1001, now(), now() + interval '1 day') $$, '23514', 'DETAILS_INVALID', 'priority has a limit');
select lives_ok($$ insert into a select save_ad(null, 'Send your goods', 'Details', 'Maple Freight', 'https://maple-freight.example', array['homepage', 'global'], 50, now() - interval '1 hour', now() + interval '1 day') $$, 'a Co-admin creates an ad');
reset role;
select results_eq($$ select slug, active, created_by from advertisements where id = (select id from a) $$, $$ values ('send-your-goods', false, '00000000-0000-4000-8000-000000000602'::uuid) $$, 'it starts switched off');
select is_empty($$ select 1 from public_advertisements $$, 'so nobody sees it');

-- Turning it on needs a photo.
select pg_temp.act_as('00000000-0000-4000-8000-000000000602');
set local role authenticated;
select throws_ok($$ select set_ad_active((select id from a), true) $$, '23514', 'AD_INCOMPLETE', 'it cannot go on without a photo');
select throws_ok($$ select record_ad_image(auth.uid(), (select id from a), 'x', 'https://x') $$, '42501', null, 'only the server attaches a photo');
reset role;
set local role service_role;
select is(record_ad_image('00000000-0000-4000-8000-000000000602', (select id from a), 'biqbaq/ads/x', 'https://res.cloudinary.com/x.jpg'), null::text, 'the server attaches one');
select is(record_ad_image('00000000-0000-4000-8000-000000000602', (select id from a), 'biqbaq/ads/y', 'https://res.cloudinary.com/y.jpg'), 'biqbaq/ads/x', 'replacing it hands back the old file to delete');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000602');
set local role authenticated;
select lives_ok($$ select set_ad_active((select id from a), true) $$, 'it is turned on');
select throws_ok($$ select set_ad_active((select id from a), true) $$, '55000', 'INVALID_STATUS_CHANGE', 'not twice');
select is((select count(*)::int from admin_list_ads('live')), 1, 'it shows as live');
reset role;
select results_eq($$ select slug, placements from public_advertisements $$, $$ values ('send-your-goods', array['homepage', 'global']) $$, 'everyone sees it');
select hasnt_column('public', 'public_advertisements', 'image_public_id', 'the public view does not reveal the file name');
select hasnt_column('public', 'public_advertisements', 'created_by', 'or who made it');

-- Dates and switching off.
update advertisements set starts_at = now() + interval '1 day', ends_at = now() + interval '2 days' where id = (select id from a);
select is_empty($$ select 1 from public_advertisements $$, 'a future ad is not shown yet');
update advertisements set starts_at = now() - interval '2 days', ends_at = now() - interval '1 day' where id = (select id from a);
select is_empty($$ select 1 from public_advertisements $$, 'a finished ad is not shown');
update advertisements set starts_at = now() - interval '1 hour', ends_at = now() + interval '1 day' where id = (select id from a);
select pg_temp.act_as('00000000-0000-4000-8000-000000000602');
set local role authenticated;
select lives_ok($$ select set_ad_active((select id from a), false) $$, 'it is turned off');
reset role;
select is_empty($$ select 1 from public_advertisements $$, 'and disappears');

-- Editing keeps the address, and deleting returns the photo to remove.
select pg_temp.act_as('00000000-0000-4000-8000-000000000601');
set local role authenticated;
select lives_ok($$ select save_ad((select id from a), 'A new title', '', 'Maple Freight', '/cargo-cars', array['global'], 5, now(), now() + interval '1 day') $$, 'Super Admin edits it');
reset role;
select results_eq($$ select slug, title, destination_url from advertisements where id = (select id from a) $$, $$ values ('send-your-goods', 'A new title', '/cargo-cars') $$, 'the address stays the same');
select pg_temp.act_as('00000000-0000-4000-8000-000000000604');
set local role authenticated;
select throws_ok($$ select delete_ad((select id from a)) $$, '42501', null, 'a buyer cannot delete it');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000601');
set local role authenticated;
select is(delete_ad((select id from a)), 'biqbaq/ads/y', 'deleting hands back its photo to remove');
select throws_ok($$ select delete_ad((select id from a)) $$, 'P0002', 'AD_NOT_FOUND', 'and it is gone');
reset role;
select is((select count(*)::int from audit_logs where action like 'ad.%' and target_id = (select id::text from a)), 7, 'every change is audited, including the deletion');

select * from finish();
rollback;
