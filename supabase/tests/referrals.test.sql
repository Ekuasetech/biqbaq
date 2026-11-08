-- Tests that try to break referrals (PRD §14, Q-07, BD-11, Q-41).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000a01', 'r-marketer@example.com', now(), '{"full_name": "Zainab Okafor"}'),
  ('00000000-0000-4000-8000-000000000a02', 'r-seller@example.com', now(), '{"full_name": "Seller"}'),
  ('00000000-0000-4000-8000-000000000a03', 'r-super@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000000a04', 'r-other@example.com', now(), '{}');
select private.bootstrap_super_admin('r-super@example.com');

-- Codes.
select is_empty($$ select 1 from referral_codes where owner_user_id = '00000000-0000-4000-8000-000000000a01' $$, 'a buyer has no code');
insert into user_roles (user_id, role_key) values ('00000000-0000-4000-8000-000000000a01', 'marketer');
create temp table m as select id, code from referral_codes where owner_user_id = '00000000-0000-4000-8000-000000000a01';
grant select on m to authenticated;
select is((select code from m), 'ZAINAB' || to_char(now() at time zone 'America/Toronto', 'YYYY'), 'an approved marketer gets a code from their first name');
insert into user_roles (user_id, role_key) values ('00000000-0000-4000-8000-000000000a02', 'seller');
insert into sellers (id, owner_user_id, slug, name, city) values
  ('00000000-0000-4000-8000-000000000a12', '00000000-0000-4000-8000-000000000a02', 'r-shop', 'Zed Pantry & Co', 'Toronto');
create temp table sc as select id, code from referral_codes where seller_id = '00000000-0000-4000-8000-000000000a12';
grant select on sc to authenticated;
select is((select code from sc), 'ZEDPANTRYCO', 'every shop gets a code from its name');
insert into sellers (owner_user_id, slug, name, city) values ('00000000-0000-4000-8000-000000000a04', 'r-shop-2', 'Zed Pantry Co', 'Ottawa');
select matches((select code from referral_codes where seller_id = (select id from sellers where slug = 'r-shop-2')), '^ZEDPANTRYCO[0-9]{4}$', 'a taken code gets a number added');

set local role authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-000000000a04');
select throws_ok($$ select * from referral_codes $$, '42501', null, 'nobody reads codes directly');
select throws_ok($$ select * from referral_attributions $$, '42501', null, 'or attributions');
select throws_ok($$ insert into referral_attributions (referred_user_id, referrer_user_id, owner_type, code) values (auth.uid(), '00000000-0000-4000-8000-000000000a01', 'marketer', 'X') $$, '42501', null, 'nobody writes an attribution');
reset role;

-- Signing up with a code (§14.3).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000a21', 'r-new1@example.com', jsonb_build_object('referral_code', lower((select code from m)), 'referral_opened_at', now()::text));
select results_eq(
  $$ select referrer_user_id, owner_type, completed_at is null from referral_attributions where referred_user_id = '00000000-0000-4000-8000-000000000a21' $$,
  $$ values ('00000000-0000-4000-8000-000000000a01'::uuid, 'marketer', true) $$,
  'a sign-up with a marketer''s code is recorded, waiting for the email to be confirmed'
);
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000a22', 'r-new2@example.com', jsonb_build_object('referral_code', (select code from sc))),
  ('00000000-0000-4000-8000-000000000a23', 'r-new3@example.com', '{"referral_code": "NOSUCHCODE"}'),
  ('00000000-0000-4000-8000-000000000a24', 'r-new4@example.com', jsonb_build_object('referral_code', (select code from m), 'referral_opened_at', (now() - interval '31 days')::text)),
  ('00000000-0000-4000-8000-000000000a25', 'r-new5@example.com', jsonb_build_object('referral_code', (select code from m), 'referral_opened_at', 'not a date')),
  ('00000000-0000-4000-8000-000000000a26', 'r-new6@example.com', '{"referral_code": {"code": "x"}}'),
  ('00000000-0000-4000-8000-000000000a27', 'r-new7@example.com', '{}');
select is((select owner_type from referral_attributions where referred_user_id = '00000000-0000-4000-8000-000000000a22'), 'seller', 'a shop''s code credits the shop');
select is((select count(*)::int from referral_attributions where referred_user_id in ('00000000-0000-4000-8000-000000000a23', '00000000-0000-4000-8000-000000000a24', '00000000-0000-4000-8000-000000000a25', '00000000-0000-4000-8000-000000000a26', '00000000-0000-4000-8000-000000000a27')), 0,
  'an unknown code, a link older than 30 days, nonsense, or no code credits nobody');
select is((select count(*)::int from profiles where id in ('00000000-0000-4000-8000-000000000a23', '00000000-0000-4000-8000-000000000a25', '00000000-0000-4000-8000-000000000a26')), 3, 'and never stops the sign-up');

-- Counted once confirmed (Q-07), and only once.
update auth.users set email_confirmed_at = now() where id = '00000000-0000-4000-8000-000000000a21';
select isnt((select completed_at from referral_attributions where referred_user_id = '00000000-0000-4000-8000-000000000a21'), null, 'confirming the email completes it');
select throws_ok($$ insert into referral_attributions (referred_user_id, referrer_user_id, owner_type, code) values ('00000000-0000-4000-8000-000000000a21', '00000000-0000-4000-8000-000000000a02', 'seller', 'X') $$, '23505', null, 'a person can be credited only once');
select throws_ok($$ insert into referral_attributions (referred_user_id, referrer_user_id, owner_type, code) values ('00000000-0000-4000-8000-000000000a27', '00000000-0000-4000-8000-000000000a27', 'seller', 'X') $$, '23514', null, 'nobody refers themselves');

-- What the owners see.
select pg_temp.act_as('00000000-0000-4000-8000-000000000a01');
set local role authenticated;
select results_eq($$ select owner_type, total, today, this_week, this_month, waiting from my_referral_programmes() $$, $$ values ('marketer', 1, 1, 1, 1, 0) $$, 'the marketer sees one confirmed sign-up today');
select is((select count(*)::int from my_referral_history((select id from m))), 1, 'and its date');
select throws_ok($$ select * from my_referral_history((select id from sc)) $$, '42501', null, 'but not the shop''s history');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000a02');
set local role authenticated;
select results_eq($$ select owner_type, shop_name, total, waiting from my_referral_programmes() $$, $$ values ('seller', 'Zed Pantry & Co', 0, 1) $$, 'the seller''s report is separate, with one waiting for confirmation');
reset role;

-- A suspended marketer earns nothing and sees nothing.
update user_roles set status = 'suspended' where user_id = '00000000-0000-4000-8000-000000000a01' and role_key = 'marketer';
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-4000-8000-000000000a28', 'r-new8@example.com', jsonb_build_object('referral_code', (select code from m)));
select is((select count(*)::int from referral_attributions where referred_user_id = '00000000-0000-4000-8000-000000000a28'), 0, 'a suspended marketer''s link credits nobody');
select pg_temp.act_as('00000000-0000-4000-8000-000000000a01');
set local role authenticated;
select is_empty($$ select 1 from my_referral_programmes() $$, 'and their dashboard is closed');
reset role;
update user_roles set status = 'active' where user_id = '00000000-0000-4000-8000-000000000a01' and role_key = 'marketer';
select is((select count(*)::int from referral_codes where owner_user_id = '00000000-0000-4000-8000-000000000a01'), 1, 'restoring the role keeps the same code');

-- Super Admin.
select pg_temp.act_as('00000000-0000-4000-8000-000000000a04');
set local role authenticated;
select throws_ok($$ select * from admin_list_referral_codes() $$, '42501', null, 'only Super Admin lists every code');
select throws_ok($$ select admin_set_referral_code((select id from m), 'MINE') $$, '42501', null, 'or changes one');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000a03');
set local role authenticated;
select is((select total from admin_list_referral_codes('marketer', 'zainab')), 1, 'Super Admin sees each programme''s total');
select throws_ok($$ select admin_set_referral_code((select id from m), 'no spaces') $$, '23514', 'CODE_INVALID', 'a code must be letters and numbers');
select throws_ok($$ select admin_set_referral_code((select id from m), (select code from sc)) $$, '23505', 'CODE_TAKEN', 'and not already used');
select throws_ok($$ select admin_set_referral_code((select id from m), 'zainab-vip') $$, '23514', 'CODE_INVALID', 'dashes are not allowed either');
select lives_ok($$ select admin_set_referral_code((select id from m), 'zainabvip') $$, 'Super Admin changes the code');
reset role;
select is((select code from referral_codes where id = (select id from m)), 'ZAINABVIP', 'it is stored in capitals');
select is((select metadata ->> 'from' from audit_logs where action = 'referral.code_change' and target_id = (select id::text from m)), (select code from m), 'the change is audited, with the old code');
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-4000-8000-000000000a29', 'r-new9@example.com', jsonb_build_object('referral_code', (select code from m)));
select is((select count(*)::int from referral_attributions where referred_user_id = '00000000-0000-4000-8000-000000000a29'), 0, 'the old link stops working');
select is((select code from referral_attributions where referred_user_id = '00000000-0000-4000-8000-000000000a21'), (select code from m), 'credit already given keeps the code it was given under');
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-4000-8000-000000000a30', 'r-new10@example.com', '{"referral_code": "ZAINABVIP"}');
select is((select referrer_user_id from referral_attributions where referred_user_id = '00000000-0000-4000-8000-000000000a30'), '00000000-0000-4000-8000-000000000a01'::uuid, 'and the new one works');

select * from finish();
rollback;
