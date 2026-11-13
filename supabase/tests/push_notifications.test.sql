-- Tests that try to break phone notifications: whose devices are whose, what pushes, and when.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000b91', 'pn-buyer@example.com', now()),
  ('00000000-0000-4000-8000-000000000b92', 'pn-seller@example.com', now()),
  ('00000000-0000-4000-8000-000000000b93', 'pn-other@example.com', now());
insert into user_roles (user_id, role_key) values ('00000000-0000-4000-8000-000000000b92', 'seller');
insert into sellers (id, owner_user_id, slug, name, city) values
  ('00000000-0000-4000-8000-000000000b99', '00000000-0000-4000-8000-000000000b92', 'pn-shop', 'PN Shop', 'Toronto');
insert into conversations (id, buyer_id, seller_id) values
  ('00000000-0000-4000-8000-000000000b98', '00000000-0000-4000-8000-000000000b91', '00000000-0000-4000-8000-000000000b99');
create temp table device as select 'https://push.example.com/send/' || repeat('a', 40) as endpoint, repeat('k', 87) as p256dh, repeat('s', 22) as auth;
grant select on device to authenticated, anon, service_role;
delete from background_jobs where type = 'push';

-- Nobody reaches devices directly, and visitors add none.
set local role anon;
select throws_ok($$ select save_push_subscription((select endpoint from device), (select p256dh from device), (select auth from device)) $$, '42501', null, 'visitors cannot add a device');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000b91');
set local role authenticated;
select throws_ok($$ select * from push_subscriptions $$, '42501', null, 'the devices table is closed, even to their owners');
select results_eq($$ select category, enabled from my_push_preferences() $$,
  $$ values ('messages', true), ('orders', true), ('applications', false), ('staff', false), ('shop', false) $$,
  'messages and orders are on by default, the rest off');
select throws_ok($$ select save_push_subscription('http://insecure.example.com/x', (select p256dh from device), (select auth from device)) $$, '23514', 'DETAILS_INVALID', 'only secure push addresses');
reset role;

-- With no device, nothing is queued.
insert into messages (conversation_id, sender_id, sender_side, body) values ('00000000-0000-4000-8000-000000000b98', '00000000-0000-4000-8000-000000000b92', 'seller', 'Hello before');
select is_empty($$ select 1 from background_jobs where type = 'push' $$, 'without a device, no push is queued');

select pg_temp.act_as('00000000-0000-4000-8000-000000000b91');
set local role authenticated;
select lives_ok($$ select save_push_subscription((select endpoint from device), (select p256dh from device), (select auth from device), 'iPhone') $$, 'a buyer turns on notifications on a device');
select results_eq($$ select label from my_push_devices() $$, $$ values ('iPhone') $$, 'and sees it among their devices');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000b93');
set local role authenticated;
select is_empty($$ select 1 from my_push_devices() $$, 'nobody else sees it');
select lives_ok($$ select remove_push_subscription((select endpoint from device)) $$, 'removing someone else''s device');
reset role;
select is((select count(*)::int from push_subscriptions where user_id = '00000000-0000-4000-8000-000000000b91'), 1, 'does nothing');

-- A new message pushes, grouped by its conversation.
insert into messages (conversation_id, sender_id, sender_side, body) values ('00000000-0000-4000-8000-000000000b98', '00000000-0000-4000-8000-000000000b92', 'seller', 'Your order is ready');
select results_eq($$ select user_id, payload ->> 'template', payload -> 'data' ->> 'shop', payload ->> 'tag' from background_jobs where type = 'push' $$,
  $$ values ('00000000-0000-4000-8000-000000000b91'::uuid, 'message_to_buyer', 'PN Shop', 'conversation:00000000-0000-4000-8000-000000000b98') $$,
  'a new message pushes to the other side, tagged with its conversation');
select is((select count(*)::int from background_jobs where type = 'push' and payload ->> 'body' is not null), 0, 'and never carries the message itself');
-- Events push by the person's choices: orders yes, applications not until turned on.
select private.enqueue_email('00000000-0000-4000-8000-000000000b91', 'order_paid', '{"product": "Suya"}', 'test:order');
select private.enqueue_email('00000000-0000-4000-8000-000000000b91', 'application_approved', '{"role": "seller"}', 'test:app');
select results_eq($$ select payload ->> 'template' from background_jobs where type = 'push' and payload ->> 'template' not like 'message%' $$, $$ values ('order_paid') $$, 'orders push, applications do not by default');
select pg_temp.act_as('00000000-0000-4000-8000-000000000b91');
set local role authenticated;
select lives_ok($$ select set_push_preference('applications', true) $$, 'the buyer turns applications on');
select lives_ok($$ select set_push_preference('messages', false) $$, 'and messages off');
select throws_ok($$ select set_push_preference('everything', true) $$, '23514', 'DETAILS_INVALID', 'only known kinds');
reset role;
select private.enqueue_email('00000000-0000-4000-8000-000000000b91', 'application_approved', '{"role": "seller"}', 'test:app2');
insert into messages (conversation_id, sender_id, sender_side, body) values ('00000000-0000-4000-8000-000000000b98', '00000000-0000-4000-8000-000000000b92', 'seller', 'Still there?');
select results_eq($$ select count(*)::int from background_jobs where type = 'push' and payload ->> 'template' = 'application_approved' $$, $$ values (1) $$, 'their choices are followed');
select results_eq($$ select count(*)::int from background_jobs where type = 'push' and payload ->> 'template' = 'message_to_buyer' $$, $$ values (1) $$, 'including turning messages off');
-- The bell and emails are unchanged by any of this.
select is((select count(*)::int from notifications where user_id = '00000000-0000-4000-8000-000000000b91' and type = 'order_paid'), 1, 'the bell still rings');

-- Only the server sends, and devices that are gone are forgotten.
select pg_temp.act_as('00000000-0000-4000-8000-000000000b91');
set local role authenticated;
select throws_ok($$ select * from claim_push_jobs() $$, '42501', null, 'people cannot take pushes to send');
reset role;
set local role service_role;
select results_eq($$ select template, jsonb_array_length(devices), locale from claim_push_jobs() order by template $$,
  $$ values ('application_approved', 1, 'en'), ('message_to_buyer', 1, 'en'), ('order_paid', 1, 'en') $$, 'the server takes each push with the person''s devices');
select lives_ok($$ select forget_push_subscription((select endpoint from device)) $$, 'and forgets a device that is gone');
reset role;
select is((select count(*)::int from push_subscriptions where user_id = '00000000-0000-4000-8000-000000000b91'), 0, 'it is removed');

select * from finish();
rollback;
