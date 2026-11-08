-- Tests that try to break in-app notifications and email preferences (Q-38 to Q-40).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000901', 'n-one@example.com', now()),
  ('00000000-0000-4000-8000-000000000902', 'n-two@example.com', now()),
  ('00000000-0000-4000-8000-000000000903', 'n-shop@example.com', now());
delete from notifications where user_id in ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000902', '00000000-0000-4000-8000-000000000903');
update platform_settings set value = 'true' where key = 'email.notifications_enabled';

-- Every announced event reaches the bell, with the email.
select private.enqueue_email('00000000-0000-4000-8000-000000000901', 'product_suspended', '{"product": "Tote", "reason": "Fake photos"}', 'n-test-1');
select is((select count(*)::int from notifications where user_id = '00000000-0000-4000-8000-000000000901' and type = 'product_suspended' and data ->> 'reason' = 'Fake photos'), 1, 'a suspension appears under the bell, with its reason');
select is((select count(*)::int from background_jobs where idempotency_key = 'n-test-1'), 1, 'and is emailed');
select private.enqueue_email('00000000-0000-4000-8000-000000000901', 'product_suspended', '{"product": "Tote"}', 'n-test-1');
select is((select count(*)::int from notifications where idempotency_key = 'n-test-1'), 1, 'the same event is never shown twice');

-- Messages keep their own count (Q-38).
select private.enqueue_email('00000000-0000-4000-8000-000000000901', 'message_to_buyer', '{"shop": "M"}', 'n-test-2');
select is((select count(*)::int from notifications where idempotency_key = 'n-test-2'), 0, 'a new message does not reach the bell');
select is((select count(*)::int from background_jobs where idempotency_key = 'n-test-2'), 1, 'but is still emailed');

-- The bell works even when Super Admin has emails switched off.
update platform_settings set value = 'false' where key = 'email.notifications_enabled';
select private.enqueue_email('00000000-0000-4000-8000-000000000901', 'role_assigned', '{"role": "admin"}', 'n-test-3');
select is((select count(*)::int from notifications where idempotency_key = 'n-test-3'), 1, 'events reach the bell with emails switched off');
select is((select count(*)::int from background_jobs where idempotency_key = 'n-test-3'), 0, 'with no email');
update platform_settings set value = 'true' where key = 'email.notifications_enabled';

-- Reading.
set local role anon;
select throws_ok($$ select * from notifications $$, '42501', null, 'visitors cannot read notifications');
select throws_ok($$ select unread_notification_count() $$, '42501', null, 'or count them');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000902');
set local role authenticated;
select is_empty($$ select 1 from notifications $$, 'nobody sees another person''s notifications');
select is_empty($$ select 1 from my_notifications() $$, 'even through the list');
select lives_ok($$ select mark_notifications_read((select array_agg(id) from notifications)) $$, 'marking someone else''s does nothing');
select throws_ok($$ insert into notifications (user_id, type, idempotency_key) values (auth.uid(), 'welcome', 'fake') $$, '42501', null, 'nobody writes notifications directly');
reset role;
select is((select count(*)::int from notifications where user_id = '00000000-0000-4000-8000-000000000901' and read_at is null), 2, 'the other person''s stay unread');

select pg_temp.act_as('00000000-0000-4000-8000-000000000901');
set local role authenticated;
select is(unread_notification_count(), 2, 'the owner counts two unread');
select results_eq($$ select type from my_notifications() order by created_at, type $$, $$ values ('product_suspended'), ('role_assigned') $$, 'and lists them');
select throws_ok($$ update notifications set read_at = now() $$, '42501', null, 'marking read goes through the function');
select lives_ok($$ select mark_notifications_read(array[(select id from notifications where type = 'role_assigned')]) $$, 'one is marked read');
select is(unread_notification_count(), 1, 'leaving one');
select lives_ok($$ select mark_notifications_read() $$, 'then all');
select is(unread_notification_count(), 0, 'leaving none');
reset role;

-- Old ones go after 90 days (Q-40).
update notifications set created_at = now() - interval '91 days' where idempotency_key = 'n-test-1';
select pg_temp.act_as('00000000-0000-4000-8000-000000000901');
set local role authenticated;
select is((select count(*)::int from my_notifications()), 1, 'a notification older than 90 days is no longer shown');
reset role;
select private.enqueue_email('00000000-0000-4000-8000-000000000901', 'role_restored', '{"role": "admin"}', 'n-test-4');
select is((select count(*)::int from notifications where idempotency_key = 'n-test-1'), 0, 'and is deleted when the next one arrives');

-- Email preferences (Q-39).
select pg_temp.act_as('00000000-0000-4000-8000-000000000901');
set local role authenticated;
select results_eq($$ select category, email_enabled from my_notification_preferences() order by category $$, $$ values ('messages', true), ('staff', true) $$, 'everything is on to begin with');
select throws_ok($$ select set_notification_preference('account', false) $$, '23514', 'DETAILS_INVALID', 'account emails cannot be turned off');
select throws_ok($$ insert into notification_preferences values (auth.uid(), 'messages', false) $$, '42501', null, 'preferences change only through the function');
select lives_ok($$ select set_notification_preference('messages', false) $$, 'message emails are turned off');
select lives_ok($$ select set_notification_preference('staff', false) $$, 'and staff emails');
select results_eq($$ select category, email_enabled from my_notification_preferences() order by category $$, $$ values ('messages', false), ('staff', false) $$, 'both are saved');
reset role;
select private.enqueue_email('00000000-0000-4000-8000-000000000901', 'message_to_seller', '{"shop": "M"}', 'n-test-5');
select private.enqueue_email('00000000-0000-4000-8000-000000000901', 'staff_approved', '{"shop": "M"}', 'n-test-6');
select private.enqueue_email('00000000-0000-4000-8000-000000000901', 'shop_suspended', '{"reason": "x"}', 'n-test-7');
select is((select count(*)::int from background_jobs where idempotency_key in ('n-test-5', 'n-test-6')), 0, 'then no message or staff emails are queued');
select is((select count(*)::int from notifications where idempotency_key = 'n-test-6'), 1, 'but staff events still reach the bell');
select is((select count(*)::int from background_jobs where idempotency_key = 'n-test-7'), 1, 'and decisions about the shop always email');
insert into background_jobs (type, user_id, payload, idempotency_key)
values ('email', '00000000-0000-4000-8000-000000000901', '{"template": "staff_invitation", "data": {}}', 'n-test-8');
select is((select count(*)::int from background_jobs where idempotency_key = 'n-test-8'), 0, 'an email queued any other way is held to the choice too');
select pg_temp.act_as('00000000-0000-4000-8000-000000000902');
set local role authenticated;
select results_eq($$ select category, email_enabled from my_notification_preferences() order by category $$, $$ values ('messages', true), ('staff', true) $$, 'one person''s choice does not affect another');
reset role;

-- A staff invitation to someone with an account reaches their bell.
insert into user_roles (user_id, role_key) values ('00000000-0000-4000-8000-000000000903', 'seller');
insert into sellers (id, owner_user_id, slug, name, city) values
  ('00000000-0000-4000-8000-000000000913', '00000000-0000-4000-8000-000000000903', 'n-shop', 'N Shop', 'Toronto');
insert into seller_invitations (seller_id, invitee_email, invited_by) values
  ('00000000-0000-4000-8000-000000000913', 'n-two@example.com', '00000000-0000-4000-8000-000000000903'),
  ('00000000-0000-4000-8000-000000000913', 'nobody-yet@example.com', '00000000-0000-4000-8000-000000000903');
select is((select data ->> 'shop' from notifications where user_id = '00000000-0000-4000-8000-000000000902' and type = 'staff_invitation'), 'N Shop', 'an invitee with an account sees the invitation under the bell');
select is((select count(*)::int from notifications where type = 'staff_invitation' and data ->> 'shop' = 'N Shop'), 1, 'one without an account just gets the email');

select * from finish();
rollback;
