-- Tests that try to break the About us page, which only Super Admin writes.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000a81', 'ab-super@example.com', now()),
  ('00000000-0000-4000-8000-000000000a82', 'ab-admin@example.com', now());
select private.bootstrap_super_admin('ab-super@example.com');
insert into user_roles (user_id, role_key) values ('00000000-0000-4000-8000-000000000a82', 'admin');
delete from about_page;
create temp table doc (d jsonb);
insert into doc values ('{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "We connect Nigerians in Canada."}]}]}');
grant select on doc to authenticated, anon;

-- Nothing shows until it is published, and visitors change nothing.
set local role anon;
select is_empty($$ select 1 from public_about_page $$, 'with nothing written, there is no page');
select throws_ok($$ select * from about_page $$, '42501', null, 'the table itself is closed');
select throws_ok($$ select admin_save_about_page((select d from doc), null, 'x', '', true) $$, '42501', null, 'visitors cannot write it');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000a82');
set local role authenticated;
select throws_ok($$ select admin_save_about_page((select d from doc), null, 'x', '', true) $$, '42501', null, 'nor can an admin');
select throws_ok($$ select * from admin_get_about_page() $$, '42501', null, 'or read the draft');
reset role;

-- Super Admin writes it.
select pg_temp.act_as('00000000-0000-4000-8000-000000000a81');
set local role authenticated;
select throws_ok($$ select admin_save_about_page((select d from doc), null, '  ', '', true) $$, '23514', 'CONTENT_REQUIRED', 'an empty page cannot go live');
select throws_ok($$ select admin_save_about_page('"not a document"'::jsonb, null, 'x', '', false) $$, '23514', 'DETAILS_INVALID', 'only a document is stored');
select lives_ok($$ select admin_save_about_page((select d from doc), null, 'We connect Nigerians in Canada.', '', false) $$, 'Super Admin saves a draft');
reset role;
set local role anon;
select is_empty($$ select 1 from public_about_page $$, 'a draft is not shown');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000a81');
set local role authenticated;
select results_eq($$ select published, content_fr from admin_get_about_page() $$, $$ values (false, null::jsonb) $$, 'Super Admin sees the draft');
select lives_ok($$ select admin_save_about_page((select d from doc), (select d from doc), 'We connect Nigerians in Canada.', 'Nous reliions.', true) $$, 'and publishes it');
select lives_ok($$ select authorize_site_image('about') $$, 'the page has its own photo slot');
reset role;
set local role anon;
select results_eq($$ select text_en, text_fr from public_about_page $$, $$ values ('We connect Nigerians in Canada.', 'Nous reliions.') $$, 'visitors see the published page');
reset role;
select is((select count(*)::int from about_page), 1, 'there is only ever one page');
select throws_ok($$ insert into about_page (id, content_en) values (false, '{}') $$, '23514', null, 'and no second one can be made');
select is((select count(*)::int from audit_logs where action = 'about.save'), 2, 'each save is in the audit log');

select * from finish();
rollback;
