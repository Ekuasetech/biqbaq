-- Tests that try to break invoices and receipts (Q-48 to Q-52).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000c01', 'i-seller@example.com', now()),
  ('00000000-0000-4000-8000-000000000c02', 'i-other@example.com', now()),
  ('00000000-0000-4000-8000-000000000c03', 'i-super@example.com', now());
select private.bootstrap_super_admin('i-super@example.com');
insert into user_roles (user_id, role_key) values ('00000000-0000-4000-8000-000000000c01', 'seller'), ('00000000-0000-4000-8000-000000000c02', 'seller');
insert into sellers (id, owner_user_id, slug, name, city) values
  ('00000000-0000-4000-8000-000000000c11', '00000000-0000-4000-8000-000000000c01', 'i-shop', 'I Shop', 'Toronto'),
  ('00000000-0000-4000-8000-000000000c12', '00000000-0000-4000-8000-000000000c02', 'i-other', 'I Other', 'Toronto');
update platform_settings set value = 'true' where key = 'email.notifications_enabled';
update platform_settings set value = '3' where key = 'invoices.max_per_day';
create temp table inv (id uuid, label text, total bigint);
grant select, insert on inv to authenticated, service_role;

create function pg_temp.items() returns jsonb language sql as $$
  select '[{"description": "Ankara fabric (yards)", "quantity": 2.5, "unit_price_minor": 1299}, {"description": "Delivery", "quantity": 1, "unit_price_minor": 1000}]'::jsonb;
$$;

-- Only for shops with customer emails on (Q-50).
select pg_temp.act_as('00000000-0000-4000-8000-000000000c01');
set local role authenticated;
select throws_ok($$ select * from create_invoice('00000000-0000-4000-8000-000000000c11', 'invoice', 'c@example.com', current_date, null, null, null, pg_temp.items(), '[]', null, null) $$,
  '55000', 'BULK_EMAIL_DISABLED', 'a shop without customer emails cannot send invoices');
select throws_ok($$ select * from invoices $$, '42501', null, 'nobody reads invoices directly');
reset role;
update platform_settings set value = 'true' where key = 'email.notifications_enabled';
insert into email_lists (owner_type, seller_id, enabled) values ('seller', '00000000-0000-4000-8000-000000000c11', true);
select pg_temp.act_as('00000000-0000-4000-8000-000000000c01');
set local role authenticated;
select lives_ok($$ select * from add_list_clients('00000000-0000-4000-8000-000000000c11', '[{"name": "Chidi Eze", "email": "chidi@example.com", "phone": "416-555-0199"}]', false) $$, 'the seller adds a client for invoices only');
select throws_ok($$ select * from create_invoice('00000000-0000-4000-8000-000000000c11', 'invoice', 'chidi@example.com', current_date, null, null, null, pg_temp.items(), '[]', null, null) $$,
  '55000', 'ADDRESS_REQUIRED', 'the sender''s address is needed on the document');
select lives_ok($$ select set_list_mailing_address('00000000-0000-4000-8000-000000000c11', '12 King St W, Toronto ON M5H 1A1') $$, 'the seller gives it');

-- Checking what is typed.
select throws_ok($$ select * from create_invoice('00000000-0000-4000-8000-000000000c11', 'invoice', 'stranger@example.com', current_date, null, null, null, pg_temp.items(), '[]', null, null) $$,
  'P0002', 'CLIENT_NOT_FOUND', 'it goes only to one of the shop''s clients');
select throws_ok($$ select * from create_invoice('00000000-0000-4000-8000-000000000c11', 'invoice', 'chidi@example.com', current_date, null, null, null, '[]', '[]', null, null) $$,
  '23514', 'ITEMS_INVALID', 'it needs at least one item');
select throws_ok($$ select * from create_invoice('00000000-0000-4000-8000-000000000c11', 'invoice', 'chidi@example.com', current_date, null, null, null, '[{"description": "x", "quantity": 0, "unit_price_minor": 100}]', '[]', null, null) $$,
  '23514', 'ITEMS_INVALID', 'a quantity of zero is refused');
select throws_ok($$ select * from create_invoice('00000000-0000-4000-8000-000000000c11', 'invoice', 'chidi@example.com', current_date, null, null, null, '[{"description": "x", "quantity": 1.555, "unit_price_minor": 100}]', '[]', null, null) $$,
  '23514', 'ITEMS_INVALID', 'so is a quantity with more than two decimals');
select throws_ok($$ select * from create_invoice('00000000-0000-4000-8000-000000000c11', 'invoice', 'chidi@example.com', current_date, null, null, null, '[{"description": "x", "quantity": 1, "unit_price_minor": -5}]', '[]', null, null) $$,
  '23514', 'ITEMS_INVALID', 'and a negative price');
select throws_ok($$ select * from create_invoice('00000000-0000-4000-8000-000000000c11', 'invoice', 'chidi@example.com', current_date, null, null, null, '[{"description": "x", "quantity": "lots", "unit_price_minor": 5}]', '[]', null, null) $$,
  '23514', 'ITEMS_INVALID', 'and nonsense');
select throws_ok($$ select * from create_invoice('00000000-0000-4000-8000-000000000c11', 'invoice', 'chidi@example.com', current_date, null, null, null, pg_temp.items(), '[{"label": "HST", "rate_milli": 35000}]', null, null) $$,
  '23514', 'TAXES_INVALID', 'a tax over 30% is refused');
select throws_ok($$ select * from create_invoice('00000000-0000-4000-8000-000000000c11', 'invoice', 'chidi@example.com', current_date, null, null, null, pg_temp.items(), '{"label": "HST"}', null, null) $$,
  '23514', 'TAXES_INVALID', 'tax lines must be a list');
select throws_ok($$ select * from create_invoice('00000000-0000-4000-8000-000000000c11', 'invoice', 'chidi@example.com', current_date, current_date - 1, null, null, pg_temp.items(), '[]', null, null) $$,
  '23514', 'DETAILS_INVALID', 'an invoice cannot be due before it is issued');
select throws_ok($$ select * from create_invoice('00000000-0000-4000-8000-000000000c11', 'receipt', 'chidi@example.com', current_date, null, null, 'Cash', pg_temp.items(), '[]', null, null) $$,
  '23514', 'DETAILS_INVALID', 'a receipt needs the date it was paid');

-- The arithmetic is done here, whatever the page says (Q-51).
select lives_ok($$ insert into inv select * from create_invoice('00000000-0000-4000-8000-000000000c11', 'invoice', 'CHIDI@example.com', current_date, current_date + 14, null, null, pg_temp.items(),
  '[{"label": "HST", "rate_milli": 13000}]', '123456789 RT0001', 'Thank you') $$, 'a valid invoice is sent');
reset role;
-- 2.5 x 12.99 = 32.475, rounded to 32.48; plus 10.00 is 42.48; 13% of it is 5.5224, so 5.52.
select results_eq($$ select (taxes -> 0 ->> 'rate_milli')::int from invoices where id = (select id from inv) $$, $$ values (13000) $$, 'rates are kept in thousandths of a percent');
select results_eq($$ select label, total from inv $$, $$ values ('INV-0001', 4800::bigint) $$, 'it is numbered, and the total is worked out here');
select results_eq($$ select subtotal_minor, tax_minor, client_name, client_phone, sender_name, sender_address from invoices where id = (select id from inv) $$,
  $$ values (4248::bigint, 552::bigint, 'Chidi Eze', '416-555-0199', 'I Shop', '12 King St W, Toronto ON M5H 1A1') $$, 'with the client''s and shop''s details as they were');
select is((select payload -> 'data' ->> 'invoice_id' from background_jobs where payload ->> 'template' = 'invoice' and payload ->> 'to' = 'chidi@example.com'), (select id::text from inv), 'and it is emailed');
select is((select count(*)::int from audit_logs where action = 'invoice.send' and target_id = (select id::text from inv)), 1, 'and audited');

select pg_temp.act_as('00000000-0000-4000-8000-000000000c01');
set local role authenticated;
select is((select label from create_invoice('00000000-0000-4000-8000-000000000c11', 'receipt', 'chidi@example.com', current_date, null, current_date, 'E-transfer', pg_temp.items(), '[]', null, null)), 'RCT-0001', 'receipts are numbered separately');
select is((select label from create_invoice('00000000-0000-4000-8000-000000000c11', 'invoice', 'chidi@example.com', current_date, null, null, null, pg_temp.items(), '[]', null, null)), 'INV-0002', 'the next invoice follows on');
select throws_ok($$ select * from create_invoice('00000000-0000-4000-8000-000000000c11', 'invoice', 'chidi@example.com', current_date, null, null, null, pg_temp.items(), '[]', null, null) $$,
  'P0001', 'INVOICE_LIMIT', 'there is a daily limit');
select is((select count(*)::int from list_invoices('00000000-0000-4000-8000-000000000c11')), 3, 'the seller sees what they sent');
select is((get_invoice('00000000-0000-4000-8000-000000000c11', (select id from inv)) ->> 'label'), 'INV-0001', 'and can open it again');
reset role;

update platform_settings set value = '20' where key = 'invoices.max_per_day';
select pg_temp.act_as('00000000-0000-4000-8000-000000000c01');
set local role authenticated;
select is((select total_minor from create_invoice('00000000-0000-4000-8000-000000000c11', 'invoice', 'chidi@example.com', current_date, null, null, null,
  '[{"description": "Spices", "quantity": 1, "unit_price_minor": 10000}]', '[{"label": "GST", "rate_milli": 5000}, {"label": "QST", "rate_milli": 9975}]', null, null)), 11498::bigint,
  'Quebec''s 9.975% works, each tax on the subtotal');
reset role;
update platform_settings set value = '3' where key = 'invoices.max_per_day';

-- Another seller cannot see or send them.
select pg_temp.act_as('00000000-0000-4000-8000-000000000c02');
set local role authenticated;
select throws_ok($$ select get_invoice('00000000-0000-4000-8000-000000000c11', (select id from inv)) $$, '42501', null, 'another seller cannot open the invoice');
select throws_ok($$ select resend_invoice('00000000-0000-4000-8000-000000000c11', (select id from inv)) $$, '42501', null, 'or send it again');
select throws_ok($$ select get_invoice_for_sending((select id from inv)) $$, '42501', null, 'or use the worker''s function');
reset role;

-- Resending, up to three times in all.
update platform_settings set value = '20' where key = 'invoices.max_per_day';
select pg_temp.act_as('00000000-0000-4000-8000-000000000c01');
set local role authenticated;
select lives_ok($$ select resend_invoice('00000000-0000-4000-8000-000000000c11', (select id from inv)) $$, 'sending it again');
select lives_ok($$ select resend_invoice('00000000-0000-4000-8000-000000000c11', (select id from inv)) $$, 'and a third time');
select throws_ok($$ select resend_invoice('00000000-0000-4000-8000-000000000c11', (select id from inv)) $$, 'P0001', 'RESEND_LIMIT', 'but not a fourth');
reset role;
select is((select count(*)::int from background_jobs where payload ->> 'template' = 'invoice' and payload -> 'data' ->> 'invoice_id' = (select id::text from inv)), 3, 'each sending is its own email');

-- Any client, even one who unsubscribed from bulk email (Q-52).
update list_subscribers set status = 'unsubscribed' where email = 'chidi@example.com';
select pg_temp.act_as('00000000-0000-4000-8000-000000000c01');
set local role authenticated;
select lives_ok($$ select * from create_invoice('00000000-0000-4000-8000-000000000c11', 'receipt', 'chidi@example.com', current_date, null, current_date, null, pg_temp.items(), '[]', null, null) $$,
  'a receipt still goes to a client who unsubscribed from bulk email');
reset role;

-- Super Admin, for Biqbaq's own clients.
select pg_temp.act_as('00000000-0000-4000-8000-000000000c03');
set local role authenticated;
select lives_ok($$ select set_list_mailing_address(null, '100 Queen St W, Toronto ON M5H 2N2') $$, 'Super Admin sets Biqbaq''s address');
select lives_ok($$ select * from add_list_clients(null, '[{"name": "Partner Co", "email": "partner@example.com"}]', false) $$, 'adds a client');
select is((select label from create_invoice(null, 'invoice', 'partner@example.com', current_date, null, null, null, pg_temp.items(), '[]', null, null)), 'INV-0001', 'and invoices them, numbered for Biqbaq');
reset role;
set local role service_role;
select is((get_invoice_for_sending((select id from inv)) ->> 'total_minor')::int, 4800, 'the worker reads the invoice to make the PDF');
reset role;

select * from finish();
rollback;
