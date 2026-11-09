-- Tests that try to break "What customers say", which only Super Admin writes.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000a71', 'ts-super@example.com', now()),
  ('00000000-0000-4000-8000-000000000a72', 'ts-admin@example.com', now());
select private.bootstrap_super_admin('ts-super@example.com');
insert into user_roles (user_id, role_key) values ('00000000-0000-4000-8000-000000000a72', 'admin');
delete from testimonials;
create temp table ids (label text, id uuid);
grant select, insert on ids to authenticated, anon;

-- Visitors read published quotes only, and change nothing.
set local role anon;
select is_empty($$ select 1 from public_testimonials $$, 'with none published, there is nothing to show');
select throws_ok($$ select * from testimonials $$, '42501', null, 'the table itself is closed');
select throws_ok($$ select admin_save_testimonial(null, 'x', 'x', '', true) $$, '42501', null, 'visitors cannot write quotes');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000a72');
set local role authenticated;
select throws_ok($$ select admin_save_testimonial(null, 'x', 'x', '', true) $$, '42501', null, 'nor can an admin');
select throws_ok($$ select * from admin_list_testimonials() $$, '42501', null, 'or list them');
reset role;

-- Super Admin writes them.
select pg_temp.act_as('00000000-0000-4000-8000-000000000a71');
set local role authenticated;
select throws_ok($$ select admin_save_testimonial(null, '  ', 'Ada', '', true) $$, '23514', 'DETAILS_INVALID', 'a quote needs words');
select throws_ok($$ select admin_save_testimonial(null, 'Good', '', '', true) $$, '23514', 'DETAILS_INVALID', 'and a name');
select throws_ok($$ select admin_save_testimonial(null, repeat('x', 501), 'Ada', '', true) $$, '23514', 'DETAILS_INVALID', 'and is not too long');
insert into ids select 'a', admin_save_testimonial(null, ' Great sellers ', ' Ada O. ', ' Toronto ', true);
insert into ids select 'b', admin_save_testimonial(null, 'Fast cargo', 'Bola A.', 'Calgary', true);
insert into ids select 'c', admin_save_testimonial(null, 'Not ready yet', 'Chi E.', '', false);
select results_eq($$ select quote, name, city, published from admin_list_testimonials() $$,
  $$ values ('Great sellers', 'Ada O.', 'Toronto', true), ('Fast cargo', 'Bola A.', 'Calgary', true), ('Not ready yet', 'Chi E.', '', false) $$,
  'tidied, and listed in the order they were added');
reset role;
set local role anon;
select results_eq($$ select name from public_testimonials order by sort_order $$, $$ values ('Ada O.'), ('Bola A.') $$, 'visitors see only the published ones');
reset role;

-- Changing, ordering and deleting.
select pg_temp.act_as('00000000-0000-4000-8000-000000000a71');
set local role authenticated;
select lives_ok($$ select admin_save_testimonial((select id from ids where label = 'c'), 'Ready now', 'Chi E.', 'Ottawa', true) $$, 'Super Admin edits and publishes one');
select lives_ok($$ select admin_move_testimonial((select id from ids where label = 'c'), -1) $$, 'and moves it up');
select results_eq($$ select name from admin_list_testimonials() $$, $$ values ('Ada O.'), ('Chi E.'), ('Bola A.') $$, 'the order changes');
select lives_ok($$ select admin_move_testimonial((select id from ids where label = 'a'), -1) $$, 'moving the first one up does nothing');
select results_eq($$ select name from admin_list_testimonials() $$, $$ values ('Ada O.'), ('Chi E.'), ('Bola A.') $$, 'still the same');
select throws_ok($$ select admin_move_testimonial((select id from ids where label = 'a'), 2) $$, '23514', 'DETAILS_INVALID', 'only one place at a time');
select lives_ok($$ select admin_delete_testimonial((select id from ids where label = 'b')) $$, 'and deletes one');
select throws_ok($$ select admin_delete_testimonial((select id from ids where label = 'b')) $$, 'P0002', 'TESTIMONIAL_NOT_FOUND', 'which is then gone');
select throws_ok($$ select admin_save_testimonial((select id from ids where label = 'b'), 'x', 'x', '', true) $$, 'P0002', 'TESTIMONIAL_NOT_FOUND', 'and cannot be edited');
reset role;
set local role anon;
select results_eq($$ select name, city from public_testimonials order by sort_order $$, $$ values ('Ada O.', 'Toronto'), ('Chi E.', 'Ottawa') $$, 'visitors see the changes');
reset role;
select is((select count(*)::int from audit_logs where target_type = 'testimonial'), 6, 'every change is in the audit log');

select * from finish();
rollback;
