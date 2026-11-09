-- Tests that try to break the sign-up pop-up: its settings, who changes them, and sign-ups.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000d01', 'sp-super@example.com', now()),
  ('00000000-0000-4000-8000-000000000d02', 'sp-buyer@example.com', now());
select private.bootstrap_super_admin('sp-super@example.com');
update platform_settings set value = 'true' where key = 'email.notifications_enabled';
update platform_settings set value = '3' where key = 'subscribe_popup.max_per_ip_hour';
delete from list_subscribers where list_id in (select id from email_lists where owner_type = 'platform');

-- What the public site sees, and what it does not.
set local role anon;
select results_eq($$ select value from public_platform_settings where key = 'subscribe_popup.message_en' $$,
  $$ values ('"Subscribe to get good deals with Biqbaq"'::jsonb) $$, 'visitors see the default message');
select is_empty($$ select 1 from public_platform_settings where key = 'subscribe_popup.notify_email' $$, 'but never the address told about sign-ups');
select throws_ok($$ select * from subscribe_from_popup('a@example.com', 'ip', 'en') $$, '42501', null, 'and cannot sign up except through the server');
reset role;

-- Only Super Admin changes it, and only to sensible values.
select pg_temp.act_as('00000000-0000-4000-8000-000000000d02');
set local role authenticated;
select throws_ok($$ select admin_set_subscribe_popup(true, 'Hi', 'Salut', 'Go', 'Allez', 'me@example.com', 'mine') $$, '42501', null, 'a buyer cannot change the pop-up');
select throws_ok($$ select * from subscribe_from_popup('a@example.com', 'ip', 'en') $$, '42501', null, 'or sign up except through the server');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000d01');
set local role authenticated;
select throws_ok($$ select admin_set_subscribe_popup(true, '  ', 'Salut', 'Go', 'Allez', 'owner@example.com', 'x') $$, '23514', 'DETAILS_INVALID', 'a blank message is refused');
select throws_ok($$ select admin_set_subscribe_popup(true, repeat('x', 201), 'Salut', 'Go', 'Allez', 'owner@example.com', 'x') $$, '23514', 'DETAILS_INVALID', 'so is a very long one');
select throws_ok($$ select admin_set_subscribe_popup(true, 'Hi', 'Salut', repeat('x', 31), 'Allez', 'owner@example.com', 'x') $$, '23514', 'DETAILS_INVALID', 'and a very long button');
select throws_ok($$ select admin_set_subscribe_popup(true, 'Hi', 'Salut', 'Go', 'Allez', 'not-an-email', 'x') $$, '23514', 'EMAIL_INVALID', 'the address must be an email address');
select throws_ok($$ select admin_set_subscribe_popup(true, 'Hi', 'Salut', 'Go', 'Allez', 'owner@example.com', '  ') $$, '23514', 'REASON_REQUIRED', 'a reason is needed');
select lives_ok($$ select admin_set_subscribe_popup(true, ' Big deals inside ', 'Bonnes affaires', 'Join', 'Rejoindre', ' Owner@Example.com ', 'new wording') $$, 'Super Admin changes it');
reset role;
select results_eq($$ select key, value #>> '{}' from platform_settings where key like 'subscribe_popup.%' and key not like '%max%' order by key $$,
  $$ values ('subscribe_popup.button_en', 'Join'), ('subscribe_popup.button_fr', 'Rejoindre'), ('subscribe_popup.enabled', 'true'),
    ('subscribe_popup.message_en', 'Big deals inside'), ('subscribe_popup.message_fr', 'Bonnes affaires'), ('subscribe_popup.notify_email', 'owner@example.com') $$,
  'tidied and saved');
select is((select count(*)::int from audit_logs where action = 'setting.update' and target_id like 'subscribe_popup.%'), 5, 'each change is in the audit log');

-- Signing up.
set local role service_role;
select results_eq($$ select is_new, notify_email from subscribe_from_popup(' New@Example.com ', 'ip-1', 'fr') $$, $$ values (true, 'owner@example.com') $$, 'a visitor signs up, and the inbox is to be told');
select results_eq($$ select is_new, notify_email from subscribe_from_popup('new@example.com', 'ip-1', 'en') $$, $$ values (false, null::text) $$, 'signing up again tells nobody again');
select throws_ok($$ select * from subscribe_from_popup('nope', 'ip-2', 'en') $$, '23514', 'EMAIL_INVALID', 'a bad address is refused');
reset role;
select results_eq($$ select status, source, consent_basis from list_subscribers where email = 'new@example.com' $$, $$ values ('pending', 'self', null::text) $$, 'they join Biqbaq''s list as pending, not confirmed');
select results_eq($$ select payload ->> 'template', payload -> 'data' ->> 'locale', payload -> 'data' ->> 'shop' from background_jobs where payload ->> 'to' = 'new@example.com' $$,
  $$ values ('list_confirm', 'fr', 'Biqbaq') $$, 'and are sent one confirmation email, in their language');

-- Someone who left stays left; a client added without consent is asked to confirm.
insert into list_subscribers (list_id, email, status, source, unsubscribed_at) select id, 'gone@example.com', 'unsubscribed', 'self', now() from email_lists where owner_type = 'platform';
insert into list_subscribers (list_id, email, status, source) select id, 'client@example.com', 'client', 'added' from email_lists where owner_type = 'platform';
set local role service_role;
select results_eq($$ select is_new from subscribe_from_popup('gone@example.com', 'ip-3', 'en') $$, $$ values (false) $$, 'an unsubscribed address is not signed up again');
select results_eq($$ select is_new from subscribe_from_popup('client@example.com', 'ip-3', 'en') $$, $$ values (true) $$, 'a client asking to join is');
reset role;
select is((select status from list_subscribers where email = 'gone@example.com'), 'unsubscribed', 'still unsubscribed');
select is((select status from list_subscribers where email = 'client@example.com'), 'pending', 'and the client is pending until they confirm');

-- Limits.
set local role service_role;
select lives_ok($$ select * from subscribe_from_popup('third@example.com', 'ip-3', 'en') $$, 'three from one connection in an hour is fine');
select throws_ok($$ select * from subscribe_from_popup('fourth@example.com', 'ip-3', 'en') $$, 'P0001', 'RATE_LIMITED', 'one connection cannot sign up many addresses');
reset role;
update platform_settings set value = 'false' where key = 'subscribe_popup.enabled';
set local role service_role;
select throws_ok($$ select * from subscribe_from_popup('later@example.com', 'ip-4', 'en') $$, '55000', 'POPUP_OFF', 'nothing is taken while the pop-up is off');
reset role;

select * from finish();
rollback;
