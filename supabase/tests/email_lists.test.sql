-- Tests that try to break customer email lists and bulk email (Q-42 to Q-46).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000b01', 'e-seller@example.com', now()),
  ('00000000-0000-4000-8000-000000000b02', 'e-buyer@example.com', now()),
  ('00000000-0000-4000-8000-000000000b03', 'e-super@example.com', now()),
  ('00000000-0000-4000-8000-000000000b04', 'e-other@example.com', now());
select private.bootstrap_super_admin('e-super@example.com');
insert into user_roles (user_id, role_key) values ('00000000-0000-4000-8000-000000000b01', 'seller'), ('00000000-0000-4000-8000-000000000b04', 'seller');
insert into sellers (id, owner_user_id, slug, name, city) values
  ('00000000-0000-4000-8000-000000000b11', '00000000-0000-4000-8000-000000000b01', 'e-shop', 'E Shop', 'Toronto'),
  ('00000000-0000-4000-8000-000000000b14', '00000000-0000-4000-8000-000000000b04', 'e-other', 'E Other', 'Toronto');
update platform_settings set value = 'true' where key = 'email.notifications_enabled';
update platform_settings set value = '3' where key = 'bulk_email.max_new_addresses_per_day';
update platform_settings set value = '2' where key = 'bulk_email.max_recipients_per_day';
delete from email_lists where owner_type = 'platform';

-- Off until Super Admin turns it on (Q-43).
select pg_temp.act_as('00000000-0000-4000-8000-000000000b01');
set local role authenticated;
select results_eq($$ select enabled, list_id is null from my_email_list('00000000-0000-4000-8000-000000000b11') $$, $$ values (false, true) $$, 'a shop starts with bulk email off');
select throws_ok($$ select * from add_list_clients('00000000-0000-4000-8000-000000000b11', '[{"name": "A", "email": "a@x.com"}]', true) $$, '55000', 'BULK_EMAIL_DISABLED', 'and cannot add clients');
select throws_ok($$ select admin_set_shop_bulk_email('00000000-0000-4000-8000-000000000b11', true) $$, '42501', null, 'or turn it on itself');
select throws_ok($$ select * from email_lists $$, '42501', null, 'nobody reads the tables directly');
select throws_ok($$ select * from list_subscribers $$, '42501', null, 'including addresses');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000b02');
set local role authenticated;
select results_eq($$ select available from my_list_subscription('e-shop') $$, $$ values (false) $$, 'buyers see no Get updates for a shop without it');
select throws_ok($$ select set_list_subscription('e-shop', true) $$, 'P0002', 'LIST_NOT_FOUND', 'and cannot join');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000b03');
set local role authenticated;
select lives_ok($$ select admin_set_shop_bulk_email('00000000-0000-4000-8000-000000000b11', true) $$, 'Super Admin turns it on for the shop');
select is((select enabled from admin_list_shop_email_lists('E Shop') where shop_name = 'E Shop'), true, 'and sees it on');
reset role;
select is((select count(*)::int from notifications where user_id = '00000000-0000-4000-8000-000000000b01' and type = 'bulk_email_enabled'), 1, 'the seller is told');
select is((select count(*)::int from audit_logs where action = 'bulk_email.enable' and target_id = '00000000-0000-4000-8000-000000000b11'), 1, 'and it is audited');

-- Adding clients sends nobody anything (Q-53).
select pg_temp.act_as('00000000-0000-4000-8000-000000000b01');
set local role authenticated;
select throws_ok($$ select * from add_list_clients('00000000-0000-4000-8000-000000000b11', '[{"name": "A", "email": "a@x.com", "invite": true}]', false) $$, '23514', 'CONSENT_REQUIRED', 'sending updates needs the seller to say they are existing customers');
select throws_ok($$ select * from add_list_clients('00000000-0000-4000-8000-000000000b11', '[{"name": "A", "email": "not-an-email"}]', true) $$, '23514', 'EMAIL_INVALID', 'an email must look real');
select throws_ok($$ select * from add_list_clients('00000000-0000-4000-8000-000000000b11', '[{"name": " ", "email": "a@x.com"}]', true) $$, '23514', 'NAME_INVALID', 'a name is needed');
select throws_ok($$ select * from add_list_clients('00000000-0000-4000-8000-000000000b11', '[{"name": "A", "email": "a@x.com", "phone": "call me"}]', true) $$, '23514', 'PHONE_INVALID', 'a phone must look like one');
select throws_ok($$ select * from add_list_clients('00000000-0000-4000-8000-000000000b11', '[{"name": "A", "email": "a@x.com"}, {"name": "B", "email": "A@x.com"}]', true) $$, '23514', 'EMAIL_REPEATED', 'the same email twice in one go is refused');
select results_eq(
  $$ select added, updated, invited, unsubscribed from add_list_clients('00000000-0000-4000-8000-000000000b11', '[{"name": "Ada Obi", "email": " Ada@Example.com ", "phone": "+1 (416) 555-0100", "invite": true}, {"name": "Bo", "email": "bo@example.org", "invite": true}]', true) $$,
  $$ values (2, 0, 2, 0) $$,
  'clients are added, tidied, and put on the shop''s updates'
);
select results_eq($$ select name, phone, status from list_subscribers_page('00000000-0000-4000-8000-000000000b11') where email = 'ada@example.com' $$, $$ values ('Ada Obi', '+1 (416) 555-0100', 'confirmed') $$, 'at once, with their name and phone');
select results_eq($$ select added, invited from add_list_clients('00000000-0000-4000-8000-000000000b11', '[{"name": "Eve", "email": "eve@example.com"}]', true) $$, $$ values (1, 0) $$, 'a client not ticked is kept for invoices only');
select is((select status from list_subscribers_page('00000000-0000-4000-8000-000000000b11') where email = 'eve@example.com'), 'client', 'and never gets bulk email');
select results_eq($$ select pending, confirmed, clients from my_email_list('00000000-0000-4000-8000-000000000b11') $$, $$ values (0, 2, 3) $$, 'nobody waits for a confirmation');
reset role;
select is((select consent_basis from list_subscribers where email = 'ada@example.com'), 'implied', 'the consent is recorded as the seller''s word (implied, CASL)');
select is((select count(*)::int from background_jobs where payload ->> 'to' in ('ada@example.com', 'bo@example.org', 'eve@example.com')), 0, 'and no email is sent to anyone');
select pg_temp.act_as('00000000-0000-4000-8000-000000000b01');
set local role authenticated;
select results_eq($$ select added, updated, invited from add_list_clients('00000000-0000-4000-8000-000000000b11', '[{"name": "Ada O.", "email": "ada@example.com", "invite": true}]', true) $$, $$ values (0, 1, 0) $$, 'adding again only updates the details');
select lives_ok($$ select * from add_list_clients('00000000-0000-4000-8000-000000000b11', '[{"name": "Cy", "email": "cy@example.com", "invite": true}]', true) $$, 'a third client for updates fits the day''s limit');
select throws_ok($$ select * from add_list_clients('00000000-0000-4000-8000-000000000b11', '[{"name": "Di", "email": "di@example.com", "invite": true}]', true) $$, 'P0001', 'ADDRESS_LIMIT', 'a fourth does not, so a whole bought list cannot be poured in');
select lives_ok($$ select * from add_list_clients('00000000-0000-4000-8000-000000000b11', '[{"name": "Di", "email": "di@example.com"}]', true) $$, 'though they can still be kept for invoices');
reset role;

-- Another seller sees nothing of it.
select pg_temp.act_as('00000000-0000-4000-8000-000000000b04');
set local role authenticated;
select throws_ok($$ select * from list_subscribers_page('00000000-0000-4000-8000-000000000b11') $$, '42501', null, 'another seller cannot see the addresses');
select throws_ok($$ select send_email_campaign('00000000-0000-4000-8000-000000000b11', 'Hi', 'Hi') $$, '42501', null, 'or send to them');
select throws_ok($$ select stop_client_updates('00000000-0000-4000-8000-000000000b11', 'ada@example.com') $$, '42501', null, 'or change them');
reset role;

-- An older confirmation link still works (server only).
insert into list_subscribers (list_id, email, name, status, source) select id, 'old@example.com', 'Old', 'pending', 'added' from email_lists where seller_id = '00000000-0000-4000-8000-000000000b11';
set local role authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-000000000b02');
select throws_ok($$ select confirm_list_token('x') $$, '42501', null, 'only the server handles email links');
reset role;
set local role service_role;
select results_eq($$ select sender_name, status from lookup_list_token((select token from list_subscribers where email = 'old@example.com')) $$, $$ values ('E Shop', 'pending') $$, 'the link shows whose list it is');
select is(confirm_list_token((select token from list_subscribers where email = 'old@example.com')), 'confirmed', 'confirming it works');
select throws_ok($$ select confirm_list_token('nonsense') $$, 'P0002', 'TOKEN_NOT_FOUND', 'a made-up link does nothing');
select throws_ok($$ select confirm_list_token((select token from list_subscribers where email = 'eve@example.com')) $$, 'P0002', 'TOKEN_NOT_FOUND', 'and an invoices-only client cannot be signed up by link');
reset role;
select is((select consent_basis from list_subscribers where email = 'old@example.com'), 'express', 'confirming is express consent');

-- Sending to all, or to one (Q-44, Q-54).
update platform_settings set value = '10' where key = 'bulk_email.max_recipients_per_day';
select pg_temp.act_as('00000000-0000-4000-8000-000000000b01');
set local role authenticated;
select throws_ok($$ select send_email_campaign('00000000-0000-4000-8000-000000000b11', 'Sale', 'All spices 20% off') $$, '55000', 'ADDRESS_REQUIRED', 'a mailing address is needed first (CASL)');
select throws_ok($$ select set_list_mailing_address('00000000-0000-4000-8000-000000000b11', 'short') $$, '23514', 'ADDRESS_INVALID', 'a real-looking one');
select lives_ok($$ select set_list_mailing_address('00000000-0000-4000-8000-000000000b11', '12 King St W, Toronto ON M5H 1A1') $$, 'the seller gives it');
select throws_ok($$ select send_email_campaign('00000000-0000-4000-8000-000000000b11', ' ', 'x') $$, '23514', 'DETAILS_INVALID', 'a subject is needed');
select is(send_email_campaign('00000000-0000-4000-8000-000000000b11', 'Sale', 'All spices 20% off'), 4, 'all goes to every client receiving updates');
reset role;
select results_eq(
  $$ select payload -> 'data' ->> 'address', payload -> 'data' ->> 'shop', payload -> 'data' ->> 'source' from background_jobs where payload ->> 'template' = 'bulk_email' and payload ->> 'to' = 'ada@example.com' $$,
  $$ values ('12 King St W, Toronto ON M5H 1A1', 'E Shop', 'customer') $$,
  'with the shop''s name, its mailing address, and why: they are a customer'
);
select is((select count(*)::int from background_jobs where payload ->> 'template' = 'bulk_email' and payload ->> 'to' in ('eve@example.com', 'di@example.com')), 0, 'never to invoices-only clients');
select is((select (payload -> 'data' ->> 'token') = (select token from list_subscribers where email = 'ada@example.com') from background_jobs where payload ->> 'template' = 'bulk_email' and payload ->> 'to' = 'ada@example.com'), true, 'each with the person''s own unsubscribe link');
update platform_settings set value = '1' where key = 'bulk_email.max_single_per_day';
select pg_temp.act_as('00000000-0000-4000-8000-000000000b01');
set local role authenticated;
select throws_ok($$ select send_email_campaign('00000000-0000-4000-8000-000000000b11', 'Again', 'Again') $$, 'P0001', 'CAMPAIGN_LIMIT', 'one email to all a day');
select throws_ok($$ select send_email_campaign('00000000-0000-4000-8000-000000000b11', 'Your order', 'Ready', 'eve@example.com') $$, '55000', 'CLIENT_NOT_RECEIVING', 'one client must be receiving updates');
select is(send_email_campaign('00000000-0000-4000-8000-000000000b11', 'Your order', 'It is ready for pickup.', 'Ada@example.com'), 1, 'emailing one client is separate from the daily email to all');
select throws_ok($$ select send_email_campaign('00000000-0000-4000-8000-000000000b11', 'Again', 'Again', 'bo@example.org') $$, 'P0001', 'SINGLE_LIMIT', 'with its own daily limit');
reset role;
select is((select count(*)::int from background_jobs where payload ->> 'template' = 'bulk_email' and payload -> 'data' ->> 'subject' = 'Your order'), 1, 'and it goes to that one person only');
update platform_settings set value = '5' where key = 'bulk_email.max_single_per_day';
update platform_settings set value = '5' where key = 'bulk_email.max_recipients_per_day';
select pg_temp.act_as('00000000-0000-4000-8000-000000000b01');
set local role authenticated;
select throws_ok($$ select send_email_campaign('00000000-0000-4000-8000-000000000b11', 'Again', 'Again', 'bo@example.org') $$, 'P0001', 'RECIPIENT_LIMIT', 'every email counts towards the people a day');
select lives_ok($$ select stop_client_updates('00000000-0000-4000-8000-000000000b11', 'old@example.com') $$, 'the seller can stop updates for one client');
select is((select status from list_subscribers_page('00000000-0000-4000-8000-000000000b11') where email = 'old@example.com'), 'client', 'who is kept for invoices');
reset role;

-- Unsubscribing is honoured at once, and cannot be undone by the seller.
set local role service_role;
select lives_ok($$ select unsubscribe_list_token((select token from list_subscribers where email = 'ada@example.com')) $$, 'ada unsubscribes from the link');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000b01');
set local role authenticated;
select results_eq($$ select unsubscribed from add_list_clients('00000000-0000-4000-8000-000000000b11', '[{"name": "Ada", "email": "ada@example.com", "invite": true}]', true) $$, $$ values (1) $$, 'the seller cannot add her back');
select lives_ok($$ select remove_list_subscriber('00000000-0000-4000-8000-000000000b11', 'ada@example.com') $$, 'removing her');
select is((select count(*)::int from list_subscribers_page('00000000-0000-4000-8000-000000000b11', 'unsubscribed')), 1, 'keeps the record that she unsubscribed');
reset role;

-- Protecting the shared Resend account (Q-55).
update background_jobs set provider_message_id = 'msg-bo' where payload ->> 'template' = 'bulk_email' and payload ->> 'to' = 'bo@example.org';
update background_jobs set provider_message_id = 'msg-cy' where payload ->> 'template' = 'bulk_email' and payload ->> 'to' = 'cy@example.com';
set local role authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-000000000b01');
select throws_ok($$ select record_email_event('msg-bo', 'complained') $$, '42501', null, 'only the server records Resend''s reports');
reset role;
set local role service_role;
select is(record_email_event('unknown', 'complained'), 'ignored', 'an unknown email is ignored');
select is(record_email_event('msg-bo', 'opened'), 'ignored', 'and so are other kinds of report');
select is(record_email_event('msg-bo', 'complained'), 'recorded', 'a spam complaint is recorded');
reset role;
select results_eq($$ select status, complained_at is not null from list_subscribers where email = 'bo@example.org' $$, $$ values ('unsubscribed', true) $$, 'that person gets no more bulk email');
select results_eq($$ select enabled, pause_reason from email_lists where seller_id = '00000000-0000-4000-8000-000000000b11' $$, $$ values (false, 'complaints') $$, 'and the shop''s bulk email pauses itself');
select is((select count(*)::int from notifications where type = 'bulk_email_paused' and user_id = '00000000-0000-4000-8000-000000000b01'), 1, 'the seller is told');
select is((select count(*)::int from notifications where type = 'bulk_email_paused_admin' and user_id = '00000000-0000-4000-8000-000000000b03'), 1, 'and so is Super Admin');
select is((select reason from audit_logs where action = 'bulk_email.auto_pause' and target_id = '00000000-0000-4000-8000-000000000b11'), 'complaints', 'and it is audited');
select pg_temp.act_as('00000000-0000-4000-8000-000000000b01');
set local role authenticated;
select results_eq($$ select enabled, pause_reason from my_email_list('00000000-0000-4000-8000-000000000b11') $$, $$ values (false, 'complaints') $$, 'the seller sees why');
select throws_ok($$ select send_email_campaign('00000000-0000-4000-8000-000000000b11', 'x', 'x', 'cy@example.com') $$, '55000', 'BULK_EMAIL_DISABLED', 'and cannot send');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000b03');
set local role authenticated;
select is((select pause_reason from admin_list_shop_email_lists('E Shop') where shop_name = 'E Shop'), 'complaints', 'Super Admin sees the pause');
select lives_ok($$ select admin_set_shop_bulk_email('00000000-0000-4000-8000-000000000b11', true) $$, 'and can turn it back on');
reset role;
select results_eq($$ select enabled, pause_reason from email_lists where seller_id = '00000000-0000-4000-8000-000000000b11' $$, $$ values (true, null::text) $$, 'which clears the pause');

-- Bounces count only once enough has been sent to judge.
update platform_settings set value = '5' where key = 'bulk_email.max_complaints_30d';
set local role service_role;
select is(record_email_event('msg-cy', 'bounced'), 'recorded', 'a permanent bounce is recorded');
reset role;
select results_eq($$ select status, enabled from list_subscribers s join email_lists l on l.id = s.list_id where s.email = 'cy@example.com' $$, $$ values ('bounced', true) $$, 'the address is stopped, but one bounce in a few emails pauses nothing');
-- The two unsubscribes above would pause it first (10% of 21), so that limit is set aside here.
update platform_settings set value = '50' where key = 'bulk_email.max_unsubscribe_percent';
insert into email_campaigns (list_id, subject, body, recipients) select id, 'Earlier', 'Earlier', 16 from email_lists where seller_id = '00000000-0000-4000-8000-000000000b11';
select private.check_list_health((select id from email_lists where seller_id = '00000000-0000-4000-8000-000000000b11'));
select results_eq($$ select enabled, pause_reason from email_lists where seller_id = '00000000-0000-4000-8000-000000000b11' $$, $$ values (false, 'bounces') $$, 'more than 4% of 21 sent pauses it');
select ok(not private.setting_value_is_valid('bulk_email.max_bounce_percent', '0'), 'the bounce limit cannot be switched off');
select pg_temp.act_as('00000000-0000-4000-8000-000000000b03');
set local role authenticated;
select lives_ok($$ select admin_set_shop_bulk_email('00000000-0000-4000-8000-000000000b11', true) $$, 'Super Admin turns it back on');
reset role;
update platform_settings set value = '1' where key = 'bulk_email.max_complaints_30d';
update platform_settings set value = '5' where key = 'bulk_email.max_unsubscribe_percent';
update platform_settings set value = '20' where key = 'bulk_email.max_bounce_percent';
update platform_settings set value = '50' where key = 'bulk_email.max_complaints_30d';
select private.check_list_health((select id from email_lists where seller_id = '00000000-0000-4000-8000-000000000b11'));
select results_eq($$ select enabled, pause_reason from email_lists where seller_id = '00000000-0000-4000-8000-000000000b11' $$, $$ values (false, 'unsubscribes') $$, 'more than 5% unsubscribing pauses it too');
update email_lists set enabled = true, paused_at = null, pause_reason = null where seller_id = '00000000-0000-4000-8000-000000000b11';
update platform_settings set value = '4' where key = 'bulk_email.max_bounce_percent';
update platform_settings set value = '1' where key = 'bulk_email.max_complaints_30d';
update platform_settings set value = '50' where key = 'bulk_email.max_unsubscribe_percent';

-- Buyers joining a shop themselves.
select pg_temp.act_as('00000000-0000-4000-8000-000000000b02');
set local role authenticated;
select results_eq($$ select available, subscribed from my_list_subscription('e-shop') $$, $$ values (true, false) $$, 'a buyer is offered Get updates');
select lives_ok($$ select set_list_subscription('e-shop', true) $$, 'and joins');
select results_eq($$ select subscribed from my_list_subscription('e-shop') $$, $$ values (true) $$, 'at once, as it is their own choice');
select lives_ok($$ select set_list_subscription('e-shop', false) $$, 'and can leave');
select results_eq($$ select subscribed from my_list_subscription('e-shop') $$, $$ values (false) $$, 'which is honoured');
-- Biqbaq news (Q-46).
select lives_ok($$ select set_list_subscription(null, true) $$, 'a person chooses Biqbaq news');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000b03');
set local role authenticated;
select results_eq($$ select enabled, sender_name, confirmed from my_email_list(null) $$, $$ values (true, 'Biqbaq', 1) $$, 'Super Admin''s Biqbaq list has them');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000b01');
set local role authenticated;
select throws_ok($$ select * from my_email_list(null) $$, '42501', null, 'a seller cannot open Biqbaq''s list');
reset role;

-- Turning it off stops everything for the shop.
select pg_temp.act_as('00000000-0000-4000-8000-000000000b03');
set local role authenticated;
select lives_ok($$ select admin_set_shop_bulk_email('00000000-0000-4000-8000-000000000b11', false) $$, 'Super Admin turns it off');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000b01');
set local role authenticated;
select throws_ok($$ select send_email_campaign('00000000-0000-4000-8000-000000000b11', 'x', 'x') $$, '55000', 'BULK_EMAIL_DISABLED', 'the shop can no longer send');
reset role;

select * from finish();
rollback;
