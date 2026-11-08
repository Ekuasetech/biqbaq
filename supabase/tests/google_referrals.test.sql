-- Tests that try to break the referral claim after a Google sign-up (Q-18, BD-11).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, created_at) values
  ('00000000-0000-4000-8000-000000000f01', 'g-marketer@example.com', now(), '{"full_name": "Gina Marketer"}', now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000f02', 'g-new@example.com', now(), '{"full_name": "New Googler"}', now()),
  ('00000000-0000-4000-8000-000000000f03', 'g-old@example.com', now(), '{}', now() - interval '1 hour');
insert into user_roles (user_id, role_key) values ('00000000-0000-4000-8000-000000000f01', 'marketer');
create temp table c as select code from referral_codes where owner_user_id = '00000000-0000-4000-8000-000000000f01';
grant select on c to authenticated;

set local role anon;
select throws_ok($$ select claim_signup_referral('ABC', now()) $$, '42501', null, 'visitors cannot claim');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-000000000f02');
set local role authenticated;
select is(claim_signup_referral('nosuchcode', now()), false, 'an unknown code credits nobody');
select is(claim_signup_referral((select code from c), now() - interval '31 days'), false, 'nor a link older than 30 days');
select is(claim_signup_referral((select code from c), now() + interval '1 day'), false, 'nor one dated in the future');
select is(claim_signup_referral(lower((select code from c)), now() - interval '1 day'), true, 'a new Google account claims the link it came through');
select is(claim_signup_referral((select code from c), now()), false, 'only once');
reset role;
select results_eq($$ select referrer_user_id, completed_at is not null from referral_attributions where referred_user_id = '00000000-0000-4000-8000-000000000f02' $$,
  $$ values ('00000000-0000-4000-8000-000000000f01'::uuid, true) $$, 'credited, and counted at once as Google confirms the email');

select pg_temp.act_as('00000000-0000-4000-8000-000000000f03');
set local role authenticated;
select is(claim_signup_referral((select code from c), now()), false, 'an account older than 15 minutes cannot pick up credit later');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000f01');
set local role authenticated;
select is(claim_signup_referral((select code from c), now()), false, 'nobody credits themselves');
reset role;

select * from finish();
rollback;
