-- Tests for the dashboard's summary (owner's redesign, 2026-11-08).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000d01', 'd-buyer@example.com', now()),
  ('00000000-0000-4000-8000-000000000d02', 'd-seller@example.com', now()),
  ('00000000-0000-4000-8000-000000000d03', 'd-super@example.com', now());
select private.bootstrap_super_admin('d-super@example.com');
insert into user_roles (user_id, role_key) values ('00000000-0000-4000-8000-000000000d02', 'seller');
insert into sellers (id, owner_user_id, slug, name, city) values
  ('00000000-0000-4000-8000-000000000d12', '00000000-0000-4000-8000-000000000d02', 'd-shop', 'D Shop', 'Toronto');
insert into products (seller_id, created_by, slug, name, description, price_minor, currency, status, first_published_at, view_count) values
  ('00000000-0000-4000-8000-000000000d12', '00000000-0000-4000-8000-000000000d02', 'd-one', 'D One', 'x', 100, 'CAD', 'published', now(), 7),
  ('00000000-0000-4000-8000-000000000d12', '00000000-0000-4000-8000-000000000d02', 'd-two', 'D Two', 'x', 100, 'CAD', 'draft', null, 3);

set local role anon;
select throws_ok($$ select my_dashboard() $$, '42501', null, 'visitors have no dashboard');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-000000000d01');
set local role authenticated;
select is(my_dashboard() -> 'access' ->> 'super_admin', 'false', 'a buyer is not Super Admin');
select is(my_dashboard() -> 'access' ->> 'moderation', 'false', 'and has no moderation');
select is(my_dashboard() -> 'access' ->> 'shop', 'false', 'or shop');
select ok(not (my_dashboard() ? 'shop') and not (my_dashboard() ? 'admin'), 'and sees no shop or admin figures');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-000000000d02');
set local role authenticated;
select is(my_dashboard() -> 'shop' ->> 'name', 'D Shop', 'a seller sees their own shop');
select is((my_dashboard() -> 'shop' ->> 'products_live')::int, 1, 'with live products only');
select is((my_dashboard() -> 'shop' ->> 'product_views')::int, 10, 'and its views');
select ok(not (my_dashboard() ? 'admin'), 'but no admin figures');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-000000000d03');
set local role authenticated;
select is(my_dashboard() -> 'access' ->> 'super_admin', 'true', 'Super Admin is recognised');
select ok((my_dashboard() -> 'admin' ->> 'accounts')::int >= 3, 'and sees the platform figures');
select ok(not (my_dashboard() ? 'shop'), 'but no shop, as they own none');
reset role;

select * from finish();
rollback;
