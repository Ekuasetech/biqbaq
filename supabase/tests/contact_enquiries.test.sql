-- Tests that try to break anonymous contact: reaching a private address, contacting what
-- is not public, and getting around the limits.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000c1', 'confirmed-seller@example.com', now());
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000c2', 'unconfirmed-seller@example.com');
insert into user_roles (user_id, role_key) values
  ('00000000-0000-4000-8000-0000000000c1', 'seller'),
  ('00000000-0000-4000-8000-0000000000c2', 'seller');
update profiles set locale = 'fr' where id = '00000000-0000-4000-8000-0000000000c1';
insert into sellers (id, owner_user_id, slug, name, city) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000c1', 'c-shop', 'C Shop', 'Toronto'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000c2', 'c-other', 'C Other', 'Calgary');
insert into products (id, seller_id, created_by, slug, name, description, price_minor, currency, status, first_published_at) values
  ('00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000c1', 'c-live', 'Live item', 'x', 100, 'CAD', 'published', now()),
  ('00000000-0000-4000-8000-00000000c0a2', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000c1', 'c-draft', 'Draft item', 'x', 100, 'CAD', 'draft', null),
  ('00000000-0000-4000-8000-00000000c0a3', '00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000c2', 'c-unconfirmed', 'Unconfirmed item', 'x', 100, 'CAD', 'published', now());

-- Nobody but the server.
set local role anon;
select throws_ok($$ select * from prepare_contact_enquiry('00000000-0000-4000-8000-00000000c0a1', 'e', 'i') $$, '42501', null, 'a visitor cannot get a seller''s address');
select throws_ok($$ select finish_contact_enquiry(gen_random_uuid(), true, null, null) $$, '42501', null, 'a visitor cannot change the log');
select throws_ok($$ select * from contact_enquiries $$, '42501', null, 'a visitor cannot read the log');
select throws_ok($$ select * from rate_limit_counters $$, '42501', null, 'a visitor cannot read the counters');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000c1');
set local role authenticated;
select throws_ok($$ select * from prepare_contact_enquiry('00000000-0000-4000-8000-00000000c0a1', 'e', 'i') $$, '42501', null, 'a signed-in user cannot get a seller''s address');
select throws_ok($$ select * from contact_enquiries $$, '42501', null, 'even the seller cannot read the log directly');
select throws_ok($$ insert into rate_limit_counters (bucket, window_start) values ('x', now()) $$, '42501', null, 'a signed-in user cannot change the counters');
select throws_ok($$ select private.hit_rate_limit('x', 'y') $$, '42501', null, 'a signed-in user cannot call the limiter');
reset role;

-- Public views and the log hold no address.
select is_empty(
  $$ select column_name from information_schema.columns
     where table_schema = 'public' and table_name in ('public_products', 'public_sellers', 'contact_enquiries')
       and column_name ~ '(^|_)email$' $$,
  'no public view or log has an email column'
);

-- The normal path.
set local role service_role;
create temp table e1 on commit drop as select * from prepare_contact_enquiry('00000000-0000-4000-8000-00000000c0a1', 'visitor-1', 'ip-1');
reset role;
select results_eq(
  $$ select seller_email, seller_locale, product_name, product_slug from e1 $$,
  $$ values ('confirmed-seller@example.com', 'fr', 'Live item', 'live-item') $$,
  'the server gets the seller''s login email, language and the product'
);
select results_eq(
  $$ select seller_id, status, visitor_email_hash, ip_hash from contact_enquiries where id = (select enquiry_id from e1) $$,
  $$ values ('00000000-0000-4000-8000-0000000000f1'::uuid, 'pending', 'visitor-1', 'ip-1') $$,
  'the attempt is logged with hashes'
);
set local role service_role;
select lives_ok(format($$ select finish_contact_enquiry(%L, true, 'msg_1', null) $$, (select enquiry_id from e1)), 'the result is recorded');
select lives_ok(format($$ select finish_contact_enquiry(%L, false, null, 'late') $$, (select enquiry_id from e1)), 'a second report is harmless');
reset role;
select results_eq(
  $$ select status, provider_message_id, last_error from contact_enquiries where id = (select enquiry_id from e1) $$,
  $$ values ('sent', 'msg_1', null::text) $$,
  'a finished enquiry stays finished'
);

-- Only what is public, and only a confirmed address.
set local role service_role;
select throws_ok($$ select * from prepare_contact_enquiry('00000000-0000-4000-8000-00000000c0a2', 'v', 'i') $$, 'P0002', 'PRODUCT_NOT_FOUND', 'a draft cannot be contacted');
select throws_ok($$ select * from prepare_contact_enquiry(gen_random_uuid(), 'v', 'i') $$, 'P0002', 'PRODUCT_NOT_FOUND', 'an unknown product cannot be contacted');
select throws_ok($$ select * from prepare_contact_enquiry('00000000-0000-4000-8000-00000000c0a3', 'v', 'i') $$, '55000', 'SELLER_CANNOT_RECEIVE', 'a seller whose address is not confirmed gets nothing');
reset role;
update products set status = 'unpublished' where id = '00000000-0000-4000-8000-00000000c0a1';
set local role service_role;
select throws_ok($$ select * from prepare_contact_enquiry('00000000-0000-4000-8000-00000000c0a1', 'v', 'i') $$, 'P0002', 'PRODUCT_NOT_FOUND', 'an unpublished product cannot be contacted');
reset role;
update products set status = 'published' where id = '00000000-0000-4000-8000-00000000c0a1';
update sellers set status = 'suspended' where id = '00000000-0000-4000-8000-0000000000f1';
set local role service_role;
select throws_ok($$ select * from prepare_contact_enquiry('00000000-0000-4000-8000-00000000c0a1', 'v', 'i') $$, 'P0002', 'PRODUCT_NOT_FOUND', 'a suspended seller cannot be contacted');
reset role;
update sellers set status = 'active' where id = '00000000-0000-4000-8000-0000000000f1';

-- The limits. Each is reached on its own, with the others kept out of the way.
delete from rate_limit_counters;
update platform_settings set value = '2' where key = 'contact.max_per_ip_hour';
set local role service_role;
select lives_ok($$ select * from prepare_contact_enquiry('00000000-0000-4000-8000-00000000c0a1', 'a1', 'same-ip') $$, 'first from an address');
select lives_ok($$ select * from prepare_contact_enquiry('00000000-0000-4000-8000-00000000c0a1', 'a2', 'same-ip') $$, 'second from an address');
select throws_ok($$ select * from prepare_contact_enquiry('00000000-0000-4000-8000-00000000c0a1', 'a3', 'same-ip') $$, 'P0001', 'RATE_LIMITED', 'one internet address cannot go past its limit');
select throws_ok($$ select * from prepare_contact_enquiry('00000000-0000-4000-8000-00000000c0a1', 'a4', 'same-ip') $$, 'P0001', 'RATE_LIMITED', 'and stays refused');
reset role;
select is((select count(*)::int from contact_enquiries where ip_hash = 'same-ip'), 2, 'a refused attempt is not logged as an enquiry');

delete from rate_limit_counters;
update platform_settings set value = '100' where key = 'contact.max_per_ip_hour';
update platform_settings set value = '1' where key = 'contact.max_per_email_hour';
set local role service_role;
select lives_ok($$ select * from prepare_contact_enquiry('00000000-0000-4000-8000-00000000c0a1', 'same-email', 'b1') $$, 'first from an email');
select throws_ok($$ select * from prepare_contact_enquiry('00000000-0000-4000-8000-00000000c0a1', 'same-email', 'b2') $$, 'P0001', 'RATE_LIMITED', 'changing internet address does not get around the email limit');
reset role;

delete from rate_limit_counters;
update platform_settings set value = '100' where key = 'contact.max_per_email_hour';
update platform_settings set value = '1' where key = 'contact.max_per_seller_hour';
set local role service_role;
select lives_ok($$ select * from prepare_contact_enquiry('00000000-0000-4000-8000-00000000c0a1', 'c1', 'c1') $$, 'first to a seller');
select throws_ok($$ select * from prepare_contact_enquiry('00000000-0000-4000-8000-00000000c0a1', 'c2', 'c2') $$, 'P0001', 'RATE_LIMITED', 'a seller cannot be flooded by changing address and email');
reset role;

-- A missing setting fails closed.
delete from rate_limit_counters;
delete from platform_settings where key = 'contact.max_per_ip_hour';
set local role service_role;
select throws_ok($$ select * from prepare_contact_enquiry('00000000-0000-4000-8000-00000000c0a1', 'd1', 'd1') $$, 'P0001', 'RATE_LIMITED', 'with no limit set, nothing is sent');
reset role;

-- Old counters do not pile up.
insert into platform_settings (key, value, description) values ('contact.max_per_ip_hour', '100', 'restored');
insert into rate_limit_counters (bucket, window_start, count) values ('old', now() - interval '3 days', 1);
update platform_settings set value = '100' where key = 'contact.max_per_seller_hour';
set local role service_role;
select lives_ok($$ select * from prepare_contact_enquiry('00000000-0000-4000-8000-00000000c0a1', 'f1', 'f1') $$, 'another enquiry');
reset role;
select is((select count(*)::int from rate_limit_counters where bucket = 'old'), 0, 'old counters are removed');

select * from finish();
rollback;
