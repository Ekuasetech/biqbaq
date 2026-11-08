-- Tests that try to break messaging (PRD §9.1, BD-04, BD-05, Q-34 to Q-37).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000801', 'm-buyer@example.com', now()),
  ('00000000-0000-4000-8000-000000000802', 'm-seller@example.com', now()),
  ('00000000-0000-4000-8000-000000000803', 'm-staff-view@example.com', now()),
  ('00000000-0000-4000-8000-000000000804', 'm-staff-reply@example.com', now()),
  ('00000000-0000-4000-8000-000000000805', 'm-stranger@example.com', now()),
  ('00000000-0000-4000-8000-000000000806', 'm-super@example.com', now()),
  ('00000000-0000-4000-8000-000000000807', 'm-admin@example.com', now());
update profiles set display_name = 'Bola Buyer' where id = '00000000-0000-4000-8000-000000000801';
update profiles set display_name = 'Remi Staff' where id = '00000000-0000-4000-8000-000000000804';
select private.bootstrap_super_admin('m-super@example.com');
insert into user_roles (user_id, role_key) values
  ('00000000-0000-4000-8000-000000000802', 'seller'),
  ('00000000-0000-4000-8000-000000000803', 'seller_staff'),
  ('00000000-0000-4000-8000-000000000804', 'seller_staff'),
  ('00000000-0000-4000-8000-000000000807', 'admin');
insert into user_role_permissions (user_role_id, permission_key)
  select id, 'users.manage' from user_roles where user_id = '00000000-0000-4000-8000-000000000807' and role_key = 'admin';
insert into sellers (id, owner_user_id, slug, name, city) values
  ('00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000802', 'm-shop', 'M Shop', 'Toronto');
insert into products (id, seller_id, created_by, slug, name, description, price_minor, currency, status, first_published_at) values
  ('00000000-0000-4000-8000-000000000821', '00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000802', 'm-jollof', 'M Jollof Spice', 'Spice', 900, 'CAD', 'published', now()),
  ('00000000-0000-4000-8000-000000000822', '00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000802', 'm-draft', 'M Draft', 'Draft', 900, 'CAD', 'draft', null);
insert into seller_staff_memberships (id, seller_id, user_id, status) values
  ('00000000-0000-4000-8000-000000000831', '00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000803', 'active'),
  ('00000000-0000-4000-8000-000000000832', '00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000804', 'active');
insert into seller_staff_permissions (membership_id, permission_key) values
  ('00000000-0000-4000-8000-000000000831', 'messages.view'),
  ('00000000-0000-4000-8000-000000000832', 'messages.view'),
  ('00000000-0000-4000-8000-000000000832', 'messages.respond');
create temp table conv (id uuid);
grant select, insert, delete on conv to anon, authenticated, service_role;

-- Starting a conversation.
set local role anon;
select throws_ok($$ select start_conversation('m-shop', null, null, 'Hi') $$, '42501', null, 'a visitor cannot start one');
select throws_ok($$ select * from messages $$, '42501', null, 'or read messages');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000801');
set local role authenticated;
select throws_ok($$ select start_conversation('m-shop', '00000000-0000-4000-8000-000000000822', null, 'Hi') $$, 'P0002', 'LISTING_NOT_FOUND', 'not about a product that is not public');
select throws_ok($$ select start_conversation('no-such-shop', null, null, 'Hi') $$, 'P0002', 'SHOP_NOT_FOUND', 'not to a shop that does not exist');
select throws_ok($$ select start_conversation('m-shop', '00000000-0000-4000-8000-000000000821', null, '   ') $$, '23514', 'MESSAGE_INVALID', 'an empty message is refused');
select throws_ok($$ select start_conversation('m-shop', '00000000-0000-4000-8000-000000000821', null, repeat('x', 2001)) $$, '23514', 'MESSAGE_INVALID', 'so is a very long one');
select throws_ok($$ insert into conversations (buyer_id, seller_id) values (auth.uid(), '00000000-0000-4000-8000-000000000811') $$, '42501', null, 'nobody writes the tables directly');
select throws_ok($$ insert into messages (conversation_id, sender_id, sender_side, body) values (gen_random_uuid(), auth.uid(), 'seller', 'x') $$, '42501', null, 'including messages');
select lives_ok($$ insert into conv select start_conversation('m-shop', '00000000-0000-4000-8000-000000000821', null, '  Is this in stock?  ') $$, 'a buyer writes about a product');
select is(start_conversation('m-shop', '00000000-0000-4000-8000-000000000821', null, 'And in Ottawa?'), (select id from conv), 'writing again about the same product continues the same conversation');
select isnt(start_conversation('m-shop', null, null, 'A general question'), (select id from conv), 'writing to the shop itself is a separate conversation');
select results_eq(
  $$ select side, other_name, listing_type, listing_name, last_body, last_from_me, unread, can_reply from my_conversations() where id = (select id from conv) $$,
  $$ values ('buyer', 'M Shop', 'product', 'M Jollof Spice', 'And in Ottawa?', true, 0, true) $$,
  'the buyer''s inbox labels it with the shop and product'
);
reset role;
select is((select body from messages where conversation_id = (select id from conv) order by created_at limit 1), 'Is this in stock?', 'the message is stored trimmed');

-- The shop's side.
select pg_temp.act_as('00000000-0000-4000-8000-000000000802');
set local role authenticated;
select throws_ok($$ select start_conversation('m-shop', null, null, 'Hi me') $$, '55000', 'OWN_SHOP', 'a seller cannot message their own shop');
select results_eq(
  $$ select side, other_name, unread from my_conversations() where id = (select id from conv) $$,
  $$ values ('seller', 'Bola Buyer', 2) $$,
  'the seller sees it with the buyer''s name and two unread'
);
select is(unread_conversation_count(), 2, 'the header counts conversations with something unread');
select lives_ok($$ select send_message((select id from conv), 'Yes, we ship to Ottawa.') $$, 'the seller replies');
select is((select unread from my_conversations() where id = (select id from conv)), 0, 'replying marks it read for the seller');
reset role;

-- Staff need a message permission to see, and respond to reply.
select pg_temp.act_as('00000000-0000-4000-8000-000000000803');
set local role authenticated;
select isnt_empty($$ select 1 from my_conversations() where id = (select id from conv) $$, 'staff with view permission see the conversation');
select throws_ok($$ select send_message((select id from conv), 'Hello') $$, '42501', null, 'but cannot reply without respond');
select throws_ok($$ select set_conversation_status((select id from conv), 'closed') $$, '42501', null, 'or close it');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000804');
set local role authenticated;
select lives_ok($$ select send_message((select id from conv), 'Remi here, it ships Monday.') $$, 'staff with respond can reply');
reset role;
select is((select sender_id from messages where body = 'Remi here, it ships Monday.'), '00000000-0000-4000-8000-000000000804'::uuid, 'the staff member is recorded as who wrote it');

delete from seller_staff_permissions where membership_id = '00000000-0000-4000-8000-000000000831';
select pg_temp.act_as('00000000-0000-4000-8000-000000000803');
set local role authenticated;
select is_empty($$ select 1 from my_conversations() $$, 'staff without message permissions see nothing');
select is_empty($$ select 1 from messages $$, 'even reading the table directly');
select throws_ok($$ select * from conversation_messages((select id from conv)) $$, 'P0002', 'CONVERSATION_NOT_FOUND', 'or asking for the messages');
reset role;

-- What the buyer sees of the shop's replies.
select pg_temp.act_as('00000000-0000-4000-8000-000000000801');
set local role authenticated;
select results_eq(
  $$ select sender_side, sender_name, from_me from conversation_messages((select id from conv)) order by created_at $$,
  $$ values ('buyer', 'Bola Buyer', true), ('buyer', 'Bola Buyer', true), ('seller', 'M Shop', false), ('seller', 'M Shop', false) $$,
  'the buyer sees the shop''s name on its replies, not the staff member''s'
);
select is((select unread from my_conversations() where id = (select id from conv)), 2, 'and two unread replies');
select lives_ok($$ select mark_conversation_read((select id from conv)) $$, 'reading them');
select is((select unread from my_conversations() where id = (select id from conv)), 0, 'clears the count');
select is((select count(*)::int from messages where conversation_id = (select id from conv)), 4, 'the buyer can read their messages directly, as Realtime does');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000802');
set local role authenticated;
select results_eq(
  $$ select sender_name from conversation_messages((select id from conv)) where sender_side = 'seller' order by created_at $$,
  $$ values (''), ('Remi Staff') $$,
  'the shop sees which of its people wrote each reply'
);
reset role;

-- Strangers.
select pg_temp.act_as('00000000-0000-4000-8000-000000000805');
set local role authenticated;
select is_empty($$ select 1 from conversations $$, 'a stranger sees no conversations');
select is_empty($$ select 1 from messages $$, 'or messages');
select throws_ok($$ select send_message((select id from conv), 'Spam') $$, 'P0002', 'CONVERSATION_NOT_FOUND', 'cannot write into one');
select throws_ok($$ select mark_conversation_read((select id from conv)) $$, 'P0002', 'CONVERSATION_NOT_FOUND', 'or mark it read');
select throws_ok($$ select set_conversation_archived((select id from conv), true) $$, 'P0002', 'CONVERSATION_NOT_FOUND', 'or archive it');
reset role;

-- Emails: at most one an hour per conversation, without the message (Q-34).
select is((select count(*)::int from background_jobs where user_id = '00000000-0000-4000-8000-000000000802' and payload ->> 'template' = 'message_to_seller'), 2, 'the seller is emailed once for each new conversation, not each message');
select is((select count(*)::int from background_jobs where user_id = '00000000-0000-4000-8000-000000000801' and payload ->> 'template' = 'message_to_buyer'), 1, 'the buyer once, for two replies');
select is((select count(*)::int from background_jobs where payload::text like '%stock%' or payload::text like '%Ottawa%' or payload::text like '%Monday%'), 0, 'no email carries the message itself');
select is((select payload -> 'data' ->> 'shop' from background_jobs where payload ->> 'template' = 'message_to_buyer' and user_id = '00000000-0000-4000-8000-000000000801'), 'M Shop', 'the email names the shop');

-- Closing and reopening (Q-35).
select pg_temp.act_as('00000000-0000-4000-8000-000000000802');
set local role authenticated;
select lives_ok($$ select set_conversation_status((select id from conv), 'closed') $$, 'the seller closes it');
select throws_ok($$ select send_message((select id from conv), 'One more thing') $$, '55000', 'CONVERSATION_CLOSED', 'then nobody can write');
select throws_ok($$ select set_conversation_status((select id from conv), 'blocked') $$, '23514', 'DETAILS_INVALID', 'an unknown status is refused');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000801');
set local role authenticated;
select throws_ok($$ select send_message((select id from conv), 'Hello?') $$, '55000', 'CONVERSATION_CLOSED', 'including the buyer');
select lives_ok($$ select set_conversation_status((select id from conv), 'open') $$, 'until either side reopens it');
select lives_ok($$ select send_message((select id from conv), 'Thanks') $$, 'and they can write again');

-- Archiving is personal, and a new message brings it back.
select lives_ok($$ select set_conversation_archived((select id from conv), true) $$, 'the buyer archives it');
select is_empty($$ select 1 from my_conversations() where id = (select id from conv) $$, 'it leaves their inbox');
select isnt_empty($$ select 1 from my_conversations(true) where id = (select id from conv) $$, 'and is in their archive');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000802');
set local role authenticated;
select isnt_empty($$ select 1 from my_conversations() where id = (select id from conv) $$, 'the seller still has it in their inbox');
select lives_ok($$ select send_message((select id from conv), 'You are welcome') $$, 'the seller writes');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000801');
set local role authenticated;
select isnt_empty($$ select 1 from my_conversations() where id = (select id from conv) $$, 'which brings it back to the buyer''s inbox');
reset role;

-- A suspended shop cannot be written to, and its owner loses access.
update sellers set status = 'suspended' where id = '00000000-0000-4000-8000-000000000811';
select pg_temp.act_as('00000000-0000-4000-8000-000000000801');
set local role authenticated;
select throws_ok($$ select send_message((select id from conv), 'Still there?') $$, '55000', 'SHOP_UNAVAILABLE', 'a buyer cannot write to a suspended shop');
select throws_ok($$ select start_conversation('m-shop', null, null, 'Hi') $$, 'P0002', 'SHOP_NOT_FOUND', 'or start a new conversation');
select isnt_empty($$ select 1 from my_conversations() where id = (select id from conv) $$, 'but keeps the history');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000802');
set local role authenticated;
select is_empty($$ select 1 from my_conversations() $$, 'the suspended shop''s owner no longer sees its conversations');
reset role;
update sellers set status = 'active' where id = '00000000-0000-4000-8000-000000000811';

-- Rate limits.
update platform_settings set value = '1' where key = 'messages.max_new_conversations_per_hour';
insert into products (id, seller_id, created_by, slug, name, description, price_minor, currency, status, first_published_at) values
  ('00000000-0000-4000-8000-000000000823', '00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000802', 'm-other', 'M Other', 'Other', 900, 'CAD', 'published', now());
select pg_temp.act_as('00000000-0000-4000-8000-000000000805');
set local role authenticated;
select lives_ok($$ select start_conversation('m-shop', null, null, 'First') $$, 'a new conversation within the limit');
select throws_ok($$ select start_conversation('m-shop', '00000000-0000-4000-8000-000000000823', null, 'Second') $$, 'P0001', 'RATE_LIMITED', 'too many new conversations in an hour are refused');
reset role;
update platform_settings set value = '60' where key = 'messages.max_new_conversations_per_hour';
select ok(not private.setting_value_is_valid('messages.max_per_hour', '2'), 'the message limit cannot be set uselessly low');

-- Super Admin reads only with a reason, and it is audited (Q-36).
select pg_temp.act_as('00000000-0000-4000-8000-000000000807');
set local role authenticated;
select throws_ok($$ select * from admin_find_conversations() $$, '42501', null, 'an Admin cannot find conversations');
select throws_ok($$ select * from admin_read_conversation((select id from conv), 'Report') $$, '42501', null, 'or read one');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000806');
set local role authenticated;
select is((select count(*)::int from admin_find_conversations('m-buyer@')), 2, 'Super Admin finds a buyer''s conversations');
select is_empty($$ select 1 from information_schema.routines r join information_schema.parameters p on p.specific_name = r.specific_name where r.routine_name = 'admin_find_conversations' and p.parameter_name = 'body' $$, 'the search shows no message text');
select throws_ok($$ select * from admin_read_conversation((select id from conv), ' ') $$, '23514', null, 'reading needs a reason');
select is((select count(*)::int from admin_read_conversation((select id from conv), 'Fraud report from buyer')), 6, 'with one, Super Admin reads the whole conversation');
reset role;
select results_eq(
  $$ select actor_id, reason from audit_logs where action = 'conversation.admin_read' and target_id = (select id::text from conv) $$,
  $$ values ('00000000-0000-4000-8000-000000000806'::uuid, 'Fraud report from buyer') $$,
  'the reading is in the audit log, with who and why'
);

select * from finish();
rollback;
