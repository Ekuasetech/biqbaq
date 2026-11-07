-- Tests that try to break the settings and audit log screens.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000d01', 'owner-d@example.com'),
  ('00000000-0000-4000-8000-000000000d02', 'admin-d@example.com'),
  ('00000000-0000-4000-8000-000000000d03', 'buyer-d@example.com');
update profiles set display_name = 'Owner D' where id = '00000000-0000-4000-8000-000000000d01';
select private.bootstrap_super_admin('owner-d@example.com');
insert into user_roles (user_id, role_key) values ('00000000-0000-4000-8000-000000000d02', 'admin');

-- Only Super Admin, whoever else asks.
set local role anon;
select throws_ok($$ select update_platform_setting('media.max_images', '6', 'x') $$, '42501', null, 'a visitor cannot change a setting');
select throws_ok($$ select * from admin_audit_log() $$, '42501', null, 'a visitor cannot read the audit log');
select throws_ok($$ select * from admin_setting_history() $$, '42501', null, 'a visitor cannot read setting history');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000d03');
set local role authenticated;
select throws_ok($$ select update_platform_setting('media.max_images', '6', 'x') $$, '42501', null, 'a buyer cannot change a setting');
select throws_ok($$ select * from admin_audit_log() $$, '42501', null, 'a buyer cannot read the audit log');
select throws_ok($$ select * from admin_setting_history() $$, '42501', null, 'a buyer cannot read setting history');
select is_empty($$ select 1 from audit_logs $$, 'a buyer sees no audit rows directly');
select is_empty($$ select 1 from platform_settings $$, 'a buyer sees no settings directly');
select throws_ok($$ update platform_settings set value = '100' where key = 'media.max_images' $$, '42501', null, 'nobody changes settings without the function');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000d02');
set local role authenticated;
select throws_ok($$ select update_platform_setting('media.max_images', '6', 'x') $$, '42501', null, 'an Admin cannot change a setting');
select throws_ok($$ select * from admin_audit_log() $$, '42501', null, 'an Admin cannot read the audit log');
reset role;

-- A normal change is saved, with history and audit together.
select pg_temp.act_as('00000000-0000-4000-8000-000000000d01');
set local role authenticated;
select lives_ok($$ select update_platform_setting('media.max_images', '6', '  More photos  ') $$, 'Super Admin changes a setting');
reset role;
select is((select value from platform_settings where key = 'media.max_images'), '6'::jsonb, 'the value is saved');
select is((select updated_by from platform_settings where key = 'media.max_images'), '00000000-0000-4000-8000-000000000d01'::uuid, 'with who changed it');

select pg_temp.act_as('00000000-0000-4000-8000-000000000d01');
set local role authenticated;
select results_eq(
  $$ select key, old_value, new_value, actor_name, actor_email, reason from admin_setting_history() where key = 'media.max_images' $$,
  $$ values ('media.max_images', '5'::jsonb, '6'::jsonb, 'Owner D', 'owner-d@example.com', 'More photos') $$,
  'history records every detail §16.4 asks for'
);
select results_eq(
  $$ select action, target_type, target_id, actor_email, reason, metadata from admin_audit_log('setting.update') where target_id = 'media.max_images' $$,
  $$ values ('setting.update', 'platform_setting', 'media.max_images', 'owner-d@example.com', 'More photos', '{"old": 5, "new": 6}'::jsonb) $$,
  'and the audit log shows the same change'
);

-- Nothing changed, nothing recorded.
select lives_ok($$ select update_platform_setting('media.max_images', '6', 'Same value') $$, 'saving the same value works');
select is((select count(*)::int from admin_setting_history() where key = 'media.max_images'), 1, 'and records nothing');

-- A reason is needed, and bad values are refused.
select throws_ok($$ select update_platform_setting('media.max_images', '7', '   ') $$, '23514', 'REASON_REQUIRED', 'a blank reason is refused');
select throws_ok($$ select update_platform_setting('media.max_images', '7') $$, '23514', 'REASON_REQUIRED', 'a missing reason is refused');
select throws_ok(format($$ select update_platform_setting('media.max_images', '7', %L) $$, repeat('x', 501)), '23514', 'REASON_TOO_LONG', 'an overlong reason is refused');
select throws_ok($$ select update_platform_setting('no.such.setting', '1', 'x') $$, 'P0002', 'SETTING_NOT_FOUND', 'an unknown setting is refused');
select throws_ok($$ select update_platform_setting('media.max_images', '"6"', 'x') $$, '23514', 'SETTING_WRONG_TYPE', 'the wrong type is refused');
select throws_ok($$ select update_platform_setting('publishing.global_enabled', '1', 'x') $$, '23514', 'SETTING_WRONG_TYPE', 'a number cannot replace an on/off setting');
select throws_ok($$ select update_platform_setting('media.max_images', '2.5', 'x') $$, '23514', 'SETTING_OUT_OF_RANGE', 'a fraction is refused');
select throws_ok($$ select update_platform_setting('media.max_images', '0', 'x') $$, '23514', 'SETTING_OUT_OF_RANGE', 'no photos at all is refused');
select throws_ok($$ select update_platform_setting('media.max_images', '21', 'x') $$, '23514', 'SETTING_OUT_OF_RANGE', 'too many photos is refused');
select throws_ok($$ select update_platform_setting('media.max_image_bytes', '0', 'x') $$, '23514', 'SETTING_OUT_OF_RANGE', 'a 0 byte photo limit is refused');
select throws_ok($$ select update_platform_setting('media.max_dimension', '499', 'x') $$, '23514', 'SETTING_OUT_OF_RANGE', 'a tiny photo limit is refused');
select throws_ok($$ select update_platform_setting('publishing.unverified_allowance', '-1', 'x') $$, '23514', 'SETTING_OUT_OF_RANGE', 'a negative allowance is refused');
select throws_ok($$ select update_platform_setting('publishing.unverified_allowance', '99999999999999', 'x') $$, '23514', 'SETTING_OUT_OF_RANGE', 'a huge allowance cannot overflow');
select throws_ok($$ select update_platform_setting('contact.max_per_ip_hour', '0', 'x') $$, '23514', 'SETTING_OUT_OF_RANGE', 'a limit of 0 is refused');
select throws_ok($$ select update_platform_setting('media.allowed_formats', '[]', 'x') $$, '23514', 'SETTING_OUT_OF_RANGE', 'no formats at all is refused');
select throws_ok($$ select update_platform_setting('media.allowed_formats', '["jpg", "svg"]', 'x') $$, '23514', 'SETTING_OUT_OF_RANGE', 'a format Biqbaq does not accept is refused');
select throws_ok($$ select update_platform_setting('media.allowed_formats', '["jpg", "jpg"]', 'x') $$, '23514', 'SETTING_OUT_OF_RANGE', 'a repeated format is refused');
select lives_ok($$ select update_platform_setting('media.allowed_formats', '["jpg", "webp"]', 'No PNG') $$, 'a shorter list of formats works');
select lives_ok($$ select update_platform_setting('publishing.unverified_allowance', '0', 'Paused') $$, 'an allowance of 0 works');
select lives_ok($$ select update_platform_setting('publishing.global_enabled', 'false', 'Maintenance') $$, 'on/off settings work');
reset role;
select is((select count(*)::int from platform_settings where value = '7'::jsonb), 0, 'none of the refused changes were saved');

-- The history cannot be rewritten, even by Super Admin.
select pg_temp.act_as('00000000-0000-4000-8000-000000000d01');
set local role authenticated;
select throws_ok($$ delete from audit_logs $$, '42501', null, 'the audit log cannot be deleted');
select throws_ok($$ update platform_settings_history set reason = 'x' $$, '42501', null, 'setting history cannot be rewritten');

-- Filtering, searching and paging.
select is((select count(*)::int from admin_audit_log('setting.update')), 4, 'filtering by action finds each change');
select is_empty($$ select 1 from admin_audit_log('product.publish') $$, 'and nothing from another action');
select is((select count(*)::int from admin_audit_log(null, 'Maintenance')), 1, 'searching reasons works');
select is((select count(*)::int from admin_audit_log('setting.update', 'OWNER-D@')), 4, 'searching who did it works, in any case');
select is((select count(*)::int from admin_audit_log('setting.update', 'media.allowed')), 1, 'searching the target works');
select is_empty($$ select 1 from admin_audit_log('setting.update', '%') $$, 'a percent sign is not a wildcard');
select is((select count(*)::int from admin_audit_log('setting.update', null, 2, 0)), 2, 'pages hold the requested number');
select is((select max(total)::int from admin_audit_log('setting.update', null, 2, 0)), 4, 'and report the full total');
select is(
  (select count(distinct x.id)::int from (
    select id from admin_audit_log('setting.update', null, 2, 0) union all select id from admin_audit_log('setting.update', null, 2, 2)
  ) x), 4, 'pages do not repeat or skip anything'
);
select is((select count(*)::int from admin_audit_log('setting.update', null, 100000, 0)), 4, 'a huge page size is capped');
select is((select count(*)::int from admin_audit_log('setting.update', null, 2, -5)), 2, 'a negative offset is harmless');
reset role;

select * from finish();
rollback;
