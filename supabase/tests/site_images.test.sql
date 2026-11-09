-- Tests that try to break the front page's photos, which only Super Admin changes.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000f01', 'si-super@example.com', now()),
  ('00000000-0000-4000-8000-000000000f02', 'si-admin@example.com', now());
select private.bootstrap_super_admin('si-super@example.com');
insert into user_roles (user_id, role_key) values ('00000000-0000-4000-8000-000000000f02', 'admin');
insert into user_role_permissions (user_role_id, permission_key)
  select id, 'ads.manage' from user_roles where user_id = '00000000-0000-4000-8000-000000000f02' and role_key = 'admin';
delete from site_images;

-- Visitors read the view, never the table, and change nothing.
set local role anon;
select is_empty($$ select 1 from public_site_images $$, 'with nothing uploaded, the site''s own photos show');
select throws_ok($$ select * from site_images $$, '42501', null, 'the table itself is closed');
select throws_ok($$ select authorize_site_image('hero_1') $$, '42501', null, 'visitors cannot upload');
reset role;

-- Only Super Admin, not even an admin who manages ads.
select pg_temp.act_as('00000000-0000-4000-8000-000000000f02');
set local role authenticated;
select throws_ok($$ select authorize_site_image('hero_1') $$, '42501', null, 'an admin cannot upload front-page photos');
select throws_ok($$ select admin_reset_site_image('hero_1') $$, '42501', null, 'or put them back');
select throws_ok($$ select record_site_image('00000000-0000-4000-8000-000000000f02', 'hero_1', 'x', 'https://res.cloudinary.com/x') $$, '42501', null, 'or record one');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000f01');
set local role authenticated;
select ok((select (authorize_site_image('get_started') ->> 'max_images')::int = 1), 'Super Admin may upload a photo for a slot');
select lives_ok($$ select authorize_site_image('category_cargo_cars') $$, 'including each Shop by category card');
select throws_ok($$ select authorize_site_image('footer') $$, 'P0002', 'SLOT_NOT_FOUND', 'only the front page''s slots exist');
select throws_ok($$ select record_site_image('00000000-0000-4000-8000-000000000f01', 'hero_1', 'x', 'https://res.cloudinary.com/x') $$, '42501', null, 'recording is for the server alone');
reset role;

-- The server records it once Cloudinary confirms the file.
set local role service_role;
select is(record_site_image('00000000-0000-4000-8000-000000000f01', 'hero_2', 'root/site/hero_2/a', 'https://res.cloudinary.com/demo/a.jpg'), null, 'the first photo replaces nothing');
select is(record_site_image('00000000-0000-4000-8000-000000000f01', 'hero_2', 'root/site/hero_2/b', 'https://res.cloudinary.com/demo/b.jpg'), 'root/site/hero_2/a', 'a new one hands back the old, to delete');
select throws_ok($$ select record_site_image('00000000-0000-4000-8000-000000000f01', 'hero_2', 'x', 'https://elsewhere.example/x.jpg') $$, '23514', null, 'only Cloudinary addresses are kept');
reset role;
set local role anon;
select results_eq($$ select slot, image_url from public_site_images $$, $$ values ('hero_2', 'https://res.cloudinary.com/demo/b.jpg') $$, 'visitors see the new photo');
reset role;
select is((select count(*)::int from audit_logs where action = 'site_image.upload' and target_id = 'hero_2'), 2, 'each upload is in the audit log');

-- Describing it, and putting it back.
select pg_temp.act_as('00000000-0000-4000-8000-000000000f01');
set local role authenticated;
select lives_ok($$ select admin_set_site_image_alt('hero_2', '  A shop in Lagos ', 'Une boutique') $$, 'Super Admin describes the photo');
select throws_ok($$ select admin_set_site_image_alt('hero_2', repeat('x', 201), '') $$, '23514', 'DETAILS_INVALID', 'a very long description is refused');
select throws_ok($$ select admin_set_site_image_alt('hero_3', 'x', 'x') $$, 'P0002', 'SLOT_NOT_FOUND', 'a slot with no upload has nothing to describe');
reset role;
select results_eq($$ select alt_en, alt_fr from public_site_images where slot = 'hero_2' $$, $$ values ('A shop in Lagos', 'Une boutique') $$, 'tidied and saved');
select pg_temp.act_as('00000000-0000-4000-8000-000000000f01');
set local role authenticated;
select is(admin_reset_site_image('hero_2'), 'root/site/hero_2/b', 'putting it back hands back the photo, to delete');
select is(admin_reset_site_image('hero_2'), null, 'and again changes nothing');
reset role;
select is_empty($$ select 1 from public_site_images $$, 'the site''s own photo shows again');
select is((select count(*)::int from audit_logs where action in ('site_image.describe', 'site_image.reset') and target_id = 'hero_2'), 2, 'describing and resetting are audited');

select * from finish();
rollback;
