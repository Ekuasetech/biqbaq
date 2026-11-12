-- Tests that try to break the editable email wording, which only Super Admin changes.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000a91', 'et-super@example.com', now()),
  ('00000000-0000-4000-8000-000000000a92', 'et-admin@example.com', now());
select private.bootstrap_super_admin('et-super@example.com');
insert into user_roles (user_id, role_key) values ('00000000-0000-4000-8000-000000000a92', 'admin');
delete from email_texts;

-- Nobody but Super Admin, not even visitors or an admin, reads or writes it.
set local role anon;
select throws_ok($$ select * from email_texts $$, '42501', null, 'visitors cannot read the wording');
select throws_ok($$ select admin_save_email_texts('welcome', 'en', '{"body": "x"}') $$, '42501', null, 'or change it');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000a92');
set local role authenticated;
select throws_ok($$ select * from email_texts $$, '42501', null, 'an admin cannot read the table');
select throws_ok($$ select * from admin_list_email_texts() $$, '42501', null, 'or list the wording');
select throws_ok($$ select admin_save_email_texts('welcome', 'en', '{"body": "x"}') $$, '42501', null, 'or change it');
reset role;

-- Super Admin saves, changes and clears wording.
select pg_temp.act_as('00000000-0000-4000-8000-000000000a91');
set local role authenticated;
select lives_ok($$ select admin_save_email_texts('welcome', 'en', '{"body": "  Hello and welcome  ", "action": "Start"}') $$, 'Super Admin saves wording');
select results_eq($$ select field, value from admin_list_email_texts() order by field $$, $$ values ('action', 'Start'), ('body', 'Hello and welcome') $$, 'tidied and saved');
select lives_ok($$ select admin_save_email_texts('welcome', 'en', '{"action": ""}') $$, 'clearing a field');
select results_eq($$ select field from admin_list_email_texts() $$, $$ values ('body') $$, 'removes it, so the built-in text is used again');
select throws_ok($$ select admin_save_email_texts('welcome', 'de', '{"body": "x"}') $$, '23514', 'DETAILS_INVALID', 'only English and French');
select throws_ok($$ select admin_save_email_texts('welcome', 'en', '{"subject": "x"}') $$, '23514', 'DETAILS_INVALID', 'subjects cannot be changed');
select throws_ok($$ select admin_save_email_texts('Welcome!', 'en', '{"body": "x"}') $$, '23514', 'DETAILS_INVALID', 'only a known kind of name');
select throws_ok($$ select admin_save_email_texts('welcome', 'en', jsonb_build_object('body', repeat('x', 3001))) $$, '23514', 'DETAILS_INVALID', 'and not too long');
select lives_ok($$ select authorize_site_image('email_welcome_hero') $$, 'the welcome email''s photos are photo slots');
reset role;
select is((select count(*)::int from audit_logs where action = 'email_text.save' and target_id = 'welcome'), 2, 'each save is in the audit log');

select * from finish();
rollback;
