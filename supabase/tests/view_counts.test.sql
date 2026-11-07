-- Tests that try to break view counting.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000301', 'v-owner@example.com'),
  ('00000000-0000-4000-8000-000000000302', 'v-staff@example.com'),
  ('00000000-0000-4000-8000-000000000303', 'v-buyer@example.com');
insert into user_roles (user_id, role_key) values ('00000000-0000-4000-8000-000000000301', 'seller');
insert into sellers (id, owner_user_id, slug, name, city) values
  ('00000000-0000-4000-8000-000000000e01', '00000000-0000-4000-8000-000000000301', 'v-shop', 'V Shop', 'Toronto');
insert into seller_staff_memberships (seller_id, user_id, status) values
  ('00000000-0000-4000-8000-000000000e01', '00000000-0000-4000-8000-000000000302', 'pending');
insert into products (id, seller_id, created_by, slug, name, description, price_minor, currency, status, first_published_at) values
  ('00000000-0000-4000-8000-000000000f01', '00000000-0000-4000-8000-000000000e01', '00000000-0000-4000-8000-000000000301', 'v-live', 'V Live', 'x', 100, 'CAD', 'published', now()),
  ('00000000-0000-4000-8000-000000000f02', '00000000-0000-4000-8000-000000000e01', '00000000-0000-4000-8000-000000000301', 'v-draft', 'V Draft', 'x', 100, 'CAD', 'draft', null);
create temp table v as select '00000000-0000-4000-8000-000000000f01'::uuid as live, '00000000-0000-4000-8000-000000000f02'::uuid as draft;
grant select on v to authenticated, anon, service_role;
create function pg_temp.views() returns bigint language sql as $$ select view_count from public_products where id = '00000000-0000-4000-8000-000000000f01' $$;

-- Nobody but the server can count, or read who viewed.
set local role anon;
select throws_ok($$ select record_product_view((select live from v), 'a', 'ip') $$, '42501', null, 'a visitor cannot add views directly');
select throws_ok($$ select * from product_view_days $$, '42501', null, 'or read who viewed');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000301');
set local role authenticated;
select throws_ok($$ select record_product_view((select live from v), 'a', 'ip') $$, '42501', null, 'a seller cannot inflate their own count');
select throws_ok($$ update product_view_totals set views = 1000000 $$, '42501', null, 'or set it');
select throws_ok($$ update products set view_count = 1000000 where id = (select live from v) $$, '42501', null, 'or set the old column');
reset role;

select is(pg_temp.views(), 0::bigint, 'a new product has no views');
create temp table audit_before as select count(*) n from audit_logs;
set local role service_role;
select ok(record_product_view((select live from v), 'visitor-1', 'ip-1'), 'a first view counts');
select ok(not record_product_view((select live from v), 'visitor-1', 'ip-1'), 'the same visitor again that day does not');
select ok(record_product_view((select live from v), 'visitor-2', 'ip-1'), 'another visitor counts');
select ok(not record_product_view((select draft from v), 'visitor-3', 'ip-1'), 'a draft is never counted');
select ok(not record_product_view(gen_random_uuid(), 'visitor-3', 'ip-1'), 'an unknown product is ignored');
select ok(not record_product_view((select live from v), 'visitor-4', 'ip-1', '00000000-0000-4000-8000-000000000301'), 'the seller is not counted');
select ok(not record_product_view((select live from v), 'visitor-5', 'ip-1', '00000000-0000-4000-8000-000000000302'), 'nor their staff, even while waiting for approval');
select ok(record_product_view((select live from v), 'visitor-6', 'ip-1', '00000000-0000-4000-8000-000000000303'), 'a signed-in buyer counts');
reset role;
select is(pg_temp.views(), 3::bigint, 'the public count shows exactly those');
select is((select updated_at from products where id = (select live from v)) <= now(), true, 'counting is not an edit');
select is((select count(*) from audit_logs), (select n from audit_before), 'and adds nothing to the audit log');

-- Yesterday's visitor counts again today, and older records are removed.
update product_view_days set day = day - 1;
insert into product_view_days (product_id, visitor_hash, day) values ((select live from v), 'ancient', current_date - 30);
set local role service_role;
select ok(record_product_view((select live from v), 'visitor-1', 'ip-1'), 'a visitor from yesterday counts again today');
reset role;
select is((select count(*)::int from product_view_days where visitor_hash = 'ancient'), 0, 'old records are removed, so this is no browsing history');
select is(pg_temp.views(), 4::bigint, 'the count goes on');

-- One address cannot inflate a count.
update platform_settings set value = '10' where key = 'views.max_per_hour';
delete from rate_limit_counters;
set local role service_role;
select is((select count(*)::int from generate_series(1, 15) n where record_product_view((select live from v), 'flood-' || n, 'one-address')), 10, 'one address adds no more than the limit');
reset role;
select is(pg_temp.views(), 14::bigint, 'and the rest are simply not counted');

-- Unpublishing hides the count with the product, and publishing again keeps it.
update products set status = 'unpublished' where id = (select live from v);
set local role service_role;
select ok(not record_product_view((select live from v), 'visitor-9', 'ip-9'), 'a hidden product is not counted');
reset role;
update products set status = 'published' where id = (select live from v);
select is(pg_temp.views(), 14::bigint, 'and its count is kept');

select * from finish();
rollback;
