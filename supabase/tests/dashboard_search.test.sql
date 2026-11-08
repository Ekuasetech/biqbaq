-- Tests that try to break the dashboard search (Q-56): each person finds only their own things.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000e51', 's-seller@example.com', now()),
  ('00000000-0000-4000-8000-000000000e52', 's-other@example.com', now()),
  ('00000000-0000-4000-8000-000000000e53', 's-super@example.com', now());
update profiles set display_name = 'Zuzu Searchable' where id = '00000000-0000-4000-8000-000000000e52';
select private.bootstrap_super_admin('s-super@example.com');
insert into user_roles (user_id, role_key) values ('00000000-0000-4000-8000-000000000e51', 'seller'), ('00000000-0000-4000-8000-000000000e52', 'seller');
insert into sellers (id, owner_user_id, slug, name, city) values
  ('00000000-0000-4000-8000-000000000e61', '00000000-0000-4000-8000-000000000e51', 'zuzu-mine', 'Zuzu Mine', 'Toronto'),
  ('00000000-0000-4000-8000-000000000e62', '00000000-0000-4000-8000-000000000e52', 'zuzu-theirs', 'Zuzu Theirs', 'Ottawa');
insert into products (seller_id, created_by, slug, name, description, price_minor, currency, status) values
  ('00000000-0000-4000-8000-000000000e61', '00000000-0000-4000-8000-000000000e51', 'zuzu-pepper', 'Zuzu Pepper', 'x', 100, 'CAD', 'draft'),
  ('00000000-0000-4000-8000-000000000e62', '00000000-0000-4000-8000-000000000e52', 'zuzu-yam', 'Zuzu Yam', 'x', 100, 'CAD', 'draft'),
  ('00000000-0000-4000-8000-000000000e61', '00000000-0000-4000-8000-000000000e51', 'hundred-pct', 'Hundred 100% Pure', 'x', 100, 'CAD', 'draft');
insert into email_lists (id, owner_type, seller_id, enabled) values
  ('00000000-0000-4000-8000-000000000e71', 'seller', '00000000-0000-4000-8000-000000000e61', true),
  ('00000000-0000-4000-8000-000000000e72', 'seller', '00000000-0000-4000-8000-000000000e62', true);
insert into list_subscribers (list_id, email, name, status, source) values
  ('00000000-0000-4000-8000-000000000e71', 'zuzu-client@example.com', 'Zuzu Client', 'client', 'added'),
  ('00000000-0000-4000-8000-000000000e72', 'zuzu-secret@example.com', 'Zuzu Secret', 'client', 'added');

set local role anon;
select throws_ok($$ select * from search_my_things('zuzu') $$, '42501', null, 'visitors cannot search');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-000000000e51');
set local role authenticated;
select is_empty($$ select 1 from search_my_things('z') $$, 'one letter finds nothing');
select results_eq($$ select kind, title from search_my_things('zuzu') order by kind, title $$,
  $$ values ('client', 'Zuzu Client'), ('product', 'Zuzu Pepper') $$,
  'a seller finds their own product and client, and nothing of another shop');
select is_empty($$ select 1 from search_my_things('zuzu') where kind in ('person', 'shop') $$, 'and no people or shops');
select results_eq($$ select title from search_my_things('100%') $$, $$ values ('Hundred 100% Pure') $$, 'a typed % is searched for as itself');
select is_empty($$ select 1 from search_my_things('%%') $$, 'so "%%" does not match everything');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-000000000e53');
set local role authenticated;
select ok(exists (select 1 from search_my_things('zuzu') where kind = 'person' and title = 'Zuzu Searchable'), 'Super Admin finds people');
select ok(exists (select 1 from search_my_things('zuzu') where kind = 'shop' and id = 'zuzu-theirs'), 'and shops');
select is_empty($$ select 1 from search_my_things('zuzu') where kind in ('product', 'client') $$, 'but not the shops'' own products or clients');
reset role;

select * from finish();
rollback;
