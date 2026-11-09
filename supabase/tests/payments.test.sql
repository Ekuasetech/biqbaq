-- Tests that try to break online payments (PRD §13, BD-02, BD-03, BD-12).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000b51', 'p-seller@example.com', now()),
  ('00000000-0000-4000-8000-000000000b52', 'p-buyer@example.com', now()),
  ('00000000-0000-4000-8000-000000000b53', 'p-super@example.com', now()),
  ('00000000-0000-4000-8000-000000000b54', 'p-other@example.com', now());
select private.bootstrap_super_admin('p-super@example.com');
insert into user_roles (user_id, role_key) values ('00000000-0000-4000-8000-000000000b51', 'seller'), ('00000000-0000-4000-8000-000000000b54', 'seller');
insert into sellers (id, owner_user_id, slug, name, city) values
  ('00000000-0000-4000-8000-000000000b61', '00000000-0000-4000-8000-000000000b51', 'p-shop', 'P Shop', 'Toronto'),
  ('00000000-0000-4000-8000-000000000b64', '00000000-0000-4000-8000-000000000b54', 'p-other', 'P Other', 'Ottawa');
insert into products (id, seller_id, created_by, slug, name, description, price_minor, currency, status, first_published_at, availability) values
  ('00000000-0000-4000-8000-000000000b71', '00000000-0000-4000-8000-000000000b61', '00000000-0000-4000-8000-000000000b51', 'p-rice', 'P Rice', 'x', 2500, 'CAD', 'published', now(), 'in_stock'),
  ('00000000-0000-4000-8000-000000000b72', '00000000-0000-4000-8000-000000000b61', '00000000-0000-4000-8000-000000000b51', 'p-gone', 'P Gone', 'x', 2500, 'CAD', 'published', now(), 'out_of_stock'),
  ('00000000-0000-4000-8000-000000000b73', '00000000-0000-4000-8000-000000000b61', '00000000-0000-4000-8000-000000000b51', 'p-cheap', 'P Cheap', 'x', 50, 'CAD', 'published', now(), 'in_stock');
update platform_settings set value = 'true' where key = 'email.notifications_enabled';
update platform_settings set value = 'true' where key = 'payments.enabled';
update platform_settings set value = '100' where key = 'payments.application_fee_minor';
create temp table ord (id uuid);
grant select, insert on ord to authenticated, service_role;

-- Off until Super Admin turns it on (§13.1), and until Stripe confirms (§13.3).
select is((select buy_online from public_products where slug = 'p-rice'), false, 'a shop does not take payments to begin with');
select pg_temp.act_as('00000000-0000-4000-8000-000000000b52');
set local role authenticated;
select throws_ok($$ select * from begin_order('00000000-0000-4000-8000-000000000b71', 1) $$, '55000', 'PAYMENTS_UNAVAILABLE', 'so nobody can buy');
select throws_ok($$ select * from orders $$, '42501', null, 'nobody reads orders directly');
select throws_ok($$ select admin_set_seller_payments('00000000-0000-4000-8000-000000000b61', true) $$, '42501', null, 'a buyer cannot switch payments on');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000b51');
set local role authenticated;
select throws_ok($$ select admin_set_seller_payments('00000000-0000-4000-8000-000000000b61', true) $$, '42501', null, 'nor can the seller');
select results_eq($$ select enabled_by_admin, status from my_payment_account('00000000-0000-4000-8000-000000000b61') $$, $$ values (false, 'disabled') $$, 'the seller sees it is off');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000b53');
set local role authenticated;
select lives_ok($$ select admin_set_seller_payments('00000000-0000-4000-8000-000000000b61', true) $$, 'Super Admin turns payments on for the shop');
reset role;
select is((select count(*)::int from notifications where user_id = '00000000-0000-4000-8000-000000000b51' and type = 'payments_enabled'), 1, 'the seller is told');
select is((select buy_online from public_products where slug = 'p-rice'), false, 'still not until Stripe confirms the account');

-- The server records what Stripe says; nobody else can.
select pg_temp.act_as('00000000-0000-4000-8000-000000000b51');
set local role authenticated;
select throws_ok($$ select record_payment_account('00000000-0000-4000-8000-000000000b61', 'acct_1', true, true, 0, false) $$, '42501', null, 'a seller cannot claim Stripe approved them');
reset role;
set local role service_role;
select is(record_payment_account('00000000-0000-4000-8000-000000000b61', 'acct_1', false, false, 3, false), 'onboarding_incomplete', 'unfinished onboarding is recorded');
select is(record_payment_account('00000000-0000-4000-8000-000000000b61', 'acct_1', true, false, 0, false), 'verification_pending', 'charges without payouts is not enough');
select is(record_payment_account('00000000-0000-4000-8000-000000000b61', 'acct_1', true, true, 0, false), 'enabled', 'Stripe''s confirmation enables it');
select throws_ok($$ select record_payment_account('00000000-0000-4000-8000-000000000b61', 'acct_other', true, true, 0, false) $$, '55000', 'ACCOUNT_MISMATCH', 'a shop''s Stripe account cannot be swapped');
reset role;
select is((select buy_online from public_products where slug = 'p-rice'), true, 'now its products show Buy now');
select is((select buy_online from public_products where slug = 'p-gone'), false, 'except those out of stock');

-- Starting an order.
select pg_temp.act_as('00000000-0000-4000-8000-000000000b51');
set local role authenticated;
select throws_ok($$ select * from begin_order('00000000-0000-4000-8000-000000000b71', 1) $$, '55000', 'OWN_SHOP', 'a seller cannot buy from themselves');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000b52');
set local role authenticated;
select throws_ok($$ select * from begin_order('00000000-0000-4000-8000-000000000b71', 0) $$, '23514', 'QUANTITY_INVALID', 'a quantity of zero is refused');
select throws_ok($$ select * from begin_order('00000000-0000-4000-8000-000000000b71', 21) $$, '23514', 'QUANTITY_INVALID', 'so is more than the most allowed');
select throws_ok($$ select * from begin_order('00000000-0000-4000-8000-000000000b72', 1) $$, '55000', 'OUT_OF_STOCK', 'out of stock cannot be bought');
select throws_ok($$ select * from begin_order('00000000-0000-4000-8000-000000000b73', 2) $$, '23514', 'TOTAL_TOO_SMALL', 'a total not above Biqbaq''s fee cannot be paid');
select results_eq($$ insert into ord select order_id from begin_order('00000000-0000-4000-8000-000000000b71', 3) returning (select 1) $$, $$ values (1) $$, 'a buyer starts an order');
reset role;
select results_eq($$ select status, unit_price_minor, quantity, total_minor, application_fee_minor from orders where id = (select id from ord) $$,
  $$ values ('pending', 2500::bigint, 3, 7500::bigint, 100::bigint) $$, 'priced here, with Biqbaq''s CA$1, not from the page');
select pg_temp.act_as('00000000-0000-4000-8000-000000000b51');
set local role authenticated;
select is_empty($$ select 1 from list_shop_orders('00000000-0000-4000-8000-000000000b61') $$, 'an unpaid checkout is not an order for the seller');
reset role;

-- Paid only from Stripe's notice.
set local role service_role;
select lives_ok($$ select attach_checkout((select id from ord), 'cs_test_1') $$, 'the server attaches Stripe''s checkout');
select is(claim_payment_event('stripe', 'evt_1', 'checkout.session.completed'), true, 'a notice is handled the first time');
select is(claim_payment_event('stripe', 'evt_1', 'checkout.session.completed'), false, 'and never again');
select is(record_checkout('cs_test_1', 'acct_wrong', 'paid', 'pi_1', 7500, 'b@example.com', 'B', '416', '{}'), 'unknown', 'a notice from another Stripe account is ignored');
select throws_ok($$ select record_checkout('cs_test_1', 'acct_1', 'paid', 'pi_1', 100, 'b@example.com', 'B', '416', '{}') $$, '55000', 'AMOUNT_MISMATCH', 'a payment for the wrong amount is refused');
select is(record_checkout('cs_test_1', 'acct_1', 'paid', 'pi_1', 7500, 'p-buyer@example.com', 'Bola Buyer', '416-555-0100', '{"city": "Toronto"}'), 'paid', 'the paid notice marks it paid');
select is(record_checkout('cs_test_1', 'acct_1', 'expired', null, null, null, null, null, null), 'paid', 'a later notice cannot undo it');
reset role;
select is((select count(*)::int from notifications where user_id = '00000000-0000-4000-8000-000000000b52' and type = 'order_paid'), 1, 'the buyer is told');
select is((select count(*)::int from notifications where user_id = '00000000-0000-4000-8000-000000000b51' and type = 'order_received'), 1, 'and the seller');

-- The seller's orders.
select pg_temp.act_as('00000000-0000-4000-8000-000000000b51');
set local role authenticated;
select results_eq($$ select quantity, shipping_name, shipping_phone from list_shop_orders('00000000-0000-4000-8000-000000000b61') $$,
  $$ values (3, 'Bola Buyer', '416-555-0100') $$, 'the seller sees the order and where to deliver it');
select lives_ok($$ select set_order_fulfilled((select id from ord), true) $$, 'and marks it delivered');
select throws_ok($$ select * from prepare_refund((select id from ord), 7501) $$, '23514', 'AMOUNT_INVALID', 'a refund cannot exceed the total');
select results_eq($$ select provider_account_id, provider_payment_id, refundable_minor from prepare_refund((select id from ord), 2500) $$,
  $$ values ('acct_1', 'pi_1', 7500::bigint) $$, 'a partial refund is allowed');
reset role;
select is((select count(*)::int from notifications where user_id = '00000000-0000-4000-8000-000000000b52' and type = 'order_fulfilled'), 1, 'the buyer is told it was delivered');
select pg_temp.act_as('00000000-0000-4000-8000-000000000b54');
set local role authenticated;
select throws_ok($$ select * from list_shop_orders('00000000-0000-4000-8000-000000000b61') $$, '42501', null, 'another seller cannot see the orders');
select throws_ok($$ select * from prepare_refund((select id from ord), 100) $$, '42501', null, 'or refund them');
select throws_ok($$ select set_order_fulfilled((select id from ord), false) $$, '42501', null, 'or change them');
reset role;

-- Refunds and disputes from Stripe's notices.
set local role service_role;
select is(record_refund('acct_1', 'pi_1', 're_1', 2500, 'succeeded'), 'recorded', 'a refund is recorded');
select is(record_refund('acct_1', 'pi_1', 're_1', 2500, 'succeeded'), 'recorded', 'twice changes nothing');
reset role;
select is((select refunded_minor from orders where id = (select id from ord)), 2500::bigint, 'counted once');
select pg_temp.act_as('00000000-0000-4000-8000-000000000b51');
set local role authenticated;
select throws_ok($$ select * from prepare_refund((select id from ord), 5001) $$, '23514', 'AMOUNT_INVALID', 'only what is left can be refunded');
reset role;
set local role service_role;
select is(record_dispute('acct_1', 'pi_1', 'dp_1', 7500, 'needs_response'), 'recorded', 'a chargeback is recorded');
reset role;
select is((select disputed from orders where id = (select id from ord)), true, 'and shown on the order');
select is((select count(*)::int from notifications where user_id = '00000000-0000-4000-8000-000000000b51' and type = 'order_disputed'), 1, 'the seller is told');

-- The buyer's own orders, and Super Admin's view.
select pg_temp.act_as('00000000-0000-4000-8000-000000000b52');
set local role authenticated;
select results_eq($$ select shop_name, status, refunded_minor from my_orders() $$, $$ values ('P Shop', 'paid', 2500::bigint) $$, 'the buyer sees their order');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000b54');
set local role authenticated;
select is_empty($$ select 1 from my_orders() $$, 'nobody else does');
select throws_ok($$ select * from admin_list_orders() $$, '42501', null, 'only Super Admin sees all orders');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000b53');
set local role authenticated;
select results_eq($$ select status, paid_orders from admin_list_payment_accounts('P Shop') where shop_name = 'P Shop' $$, $$ values ('enabled', 1) $$, 'Super Admin sees the shop''s status and orders');
select results_eq($$ select provider_payment_id, application_fee_minor from admin_list_orders('p-buyer@') $$, $$ values ('pi_1', 100::bigint) $$, 'and each payment''s reference');
-- Turning it off suspends taking payments at once.
select lives_ok($$ select admin_set_seller_payments('00000000-0000-4000-8000-000000000b61', false) $$, 'Super Admin turns payments off');
reset role;
select is((select status from payment_accounts where seller_id = '00000000-0000-4000-8000-000000000b61'), 'suspended', 'the shop is suspended from payments');
select is((select buy_online from public_products where slug = 'p-rice'), false, 'and Buy now disappears');
set local role service_role;
select is(record_payment_account('00000000-0000-4000-8000-000000000b61', 'acct_1', true, true, 0, false), 'suspended', 'Stripe''s approval cannot override Super Admin');
reset role;

select * from finish();
rollback;
