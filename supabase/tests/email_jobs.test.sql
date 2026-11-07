-- Tests that try to break the email jobs: who can see them, when they are created,
-- what they contain, and how failures behave.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000e1', 'owner@example.com'),
  ('00000000-0000-4000-8000-0000000000e2', 'applicant@mail.biqbaq-check.ca'),
  ('00000000-0000-4000-8000-0000000000e4', 'tester@example.com'),
  ('00000000-0000-4000-8000-0000000000e3', 'seller@example.com');
select private.bootstrap_super_admin('owner@example.com');
insert into user_roles (user_id, role_key) values ('00000000-0000-4000-8000-0000000000e3', 'seller');
insert into sellers (owner_user_id, slug, name, city)
values ('00000000-0000-4000-8000-0000000000e3', 'e-shop', 'E Shop', 'Toronto');

create temp table ctx as select id from sellers where slug = 'e-shop';
grant select on ctx to authenticated, anon, service_role;
create temp table app (id uuid);
grant select, insert, delete on app to authenticated, service_role;
create temp table req (id uuid);
grant select, insert on req to authenticated, service_role;

-- Applying tells Super Admin, and only Super Admin.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000e2');
set local role authenticated;
insert into app select submit_role_application('marketer', '{"reason":"I know many sellers"}'::jsonb);
reset role;

select results_eq(
  $$ select user_id, payload ->> 'template', payload -> 'data' ->> 'role' from background_jobs $$,
  $$ values ('00000000-0000-4000-8000-0000000000e1'::uuid, 'application_received', 'marketer') $$,
  'applying creates one email, to Super Admin'
);
select is_empty(
  $$ select 1 from background_jobs where payload::text ~ '@' $$,
  'no email address is copied into a job'
);

-- A test address that can never receive mail does not bother the real Super Admin.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000e4');
set local role authenticated;
select lives_ok($$ select submit_role_application('marketer', '{"reason":"Only a test account"}'::jsonb) $$, 'a test account applies');
reset role;
select is((select count(*)::int from background_jobs), 1, 'an application from a test address notifies nobody');

-- Nobody but the server can see or run them.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000e1');
set local role authenticated;
select throws_ok($$ select * from background_jobs $$, '42501', null, 'even Super Admin cannot read jobs directly');
select throws_ok($$ select * from claim_email_jobs() $$, '42501', null, 'a signed-in user cannot claim jobs, which reveal addresses');
select throws_ok($$ select complete_background_job(gen_random_uuid(), null) $$, '42501', null, 'a signed-in user cannot complete a job');
select throws_ok($$ select fail_background_job(gen_random_uuid(), 'x', true) $$, '42501', null, 'a signed-in user cannot fail a job');
select throws_ok($$ insert into background_jobs (type, idempotency_key) values ('email', 'x') $$, '42501', null, 'a signed-in user cannot add a job');
reset role;
set local role anon;
select throws_ok($$ select * from background_jobs $$, '42501', null, 'a visitor cannot read jobs');
select throws_ok($$ select * from claim_email_jobs() $$, '42501', null, 'a visitor cannot claim jobs');
reset role;
select is_empty(
  $$ select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname in ('enqueue_email', 'email_on_application_submitted', 'email_on_application_decided', 'email_on_verification_change')
       and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute')) $$,
  'nobody can add an email job by calling the helpers'
);

-- A refused decision creates no email, because its transaction never commits.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000e2');
set local role authenticated;
select throws_ok(
  $$ select reject_role_application((select id from app), 'no') $$, '42501', null,
  'an applicant cannot reject their own application'
);
reset role;
select is((select count(*)::int from background_jobs where user_id = '00000000-0000-4000-8000-0000000000e2'), 0, 'a refused decision sends nothing');

-- Rejecting tells the applicant, with the reason.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000e1');
set local role authenticated;
select lives_ok($$ select reject_role_application((select id from app), 'Needs more detail') $$, 'Super Admin rejects');
reset role;
select results_eq(
  $$ select payload ->> 'template', payload -> 'data' ->> 'role', payload -> 'data' ->> 'reason' from background_jobs
     where user_id = '00000000-0000-4000-8000-0000000000e2' $$,
  $$ values ('application_rejected', 'marketer', 'Needs more detail') $$,
  'the applicant is told about the rejection, with its reason'
);

-- Reapplying is a new application, so it gets its own emails.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000e2');
set local role authenticated;
delete from app;
insert into app select submit_role_application('marketer', '{"reason":"Second try, with more detail"}'::jsonb);
select lives_ok($$ select withdraw_role_application((select id from app)) $$, 'the applicant withdraws');
reset role;
select is(
  (select count(*)::int from background_jobs where user_id = '00000000-0000-4000-8000-0000000000e2'), 1,
  'withdrawing sends the applicant nothing'
);

select pg_temp.act_as('00000000-0000-4000-8000-0000000000e2');
set local role authenticated;
delete from app;
insert into app select submit_role_application('marketer', '{"reason":"Third try, with more detail"}'::jsonb);
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000e1');
set local role authenticated;
select lives_ok($$ select approve_role_application((select id from app), '{}') $$, 'Super Admin approves');
reset role;
select is(
  (select count(*)::int from background_jobs where user_id = '00000000-0000-4000-8000-0000000000e2' and payload ->> 'template' = 'application_approved'), 1,
  'the applicant is told about the approval'
);

-- Verification, through every kind of change.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000e3');
set local role authenticated;
insert into req select request_manual_verification('Please check my shop');
reset role;
select is(
  (select count(*)::int from background_jobs where user_id = '00000000-0000-4000-8000-0000000000e3'), 0,
  'a seller is not emailed about their own request'
);

select pg_temp.act_as('00000000-0000-4000-8000-0000000000e1');
set local role authenticated;
select lives_ok($$ select decide_manual_verification((select id from req), false, 'The note is too short') $$, 'Super Admin rejects the request');
select lives_ok($$ select set_verification_status((select id from ctx), 'verify', 'Checked in person') $$, 'Super Admin verifies directly');
select lives_ok($$ select set_verification_status((select id from ctx), 'suspend', 'Your documents have expired') $$, 'Super Admin suspends');
select lives_ok($$ select set_verification_status((select id from ctx), 'restore', 'INTERNAL restore note') $$, 'Super Admin restores');
select lives_ok($$ select set_verification_status((select id from ctx), 'revoke', 'The shop has closed') $$, 'Super Admin revokes');
reset role;

select set_eq(
  $$ select payload ->> 'template' from background_jobs where user_id = '00000000-0000-4000-8000-0000000000e3' $$,
  array['verification_rejected', 'verification_verified', 'verification_suspended', 'verification_restored', 'verification_revoked'],
  'the seller is told about each change'
);
select is(
  (select payload -> 'data' ->> 'reason' from background_jobs where payload ->> 'template' = 'verification_rejected'),
  'The note is too short', 'a rejection includes its reason'
);
select is(
  (select payload -> 'data' ->> 'reason' from background_jobs where payload ->> 'template' = 'verification_suspended'),
  'Your documents have expired', 'a suspension includes its reason'
);
select is(
  (select payload -> 'data' ->> 'reason' from background_jobs where payload ->> 'template' = 'verification_revoked'),
  'The shop has closed', 'a removal includes its reason'
);
select is_empty(
  $$ select 1 from background_jobs where payload::text like '%INTERNAL%' or payload::text like '%Checked in person%' $$,
  'notes on verifying and restoring stay internal'
);

-- Switching emails off.
update platform_settings set value = 'false' where key = 'email.notifications_enabled';
create temp table before_off as select count(*) n from background_jobs;
grant select on before_off to service_role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000e2');
set local role authenticated;
delete from app;
insert into app select submit_role_application('seller', '{"business_name":"Off Shop","contact_information":"x","city":"Toronto","country":"CA","description":"x","category":"food"}'::jsonb);
reset role;
select is((select count(*) from background_jobs), (select n from before_off), 'nothing is added while emails are off');
set local role service_role;
select is_empty($$ select * from claim_email_jobs() $$, 'nothing is sent while emails are off');
reset role;
update platform_settings set value = 'true' where key = 'email.notifications_enabled';

-- The worker's path, with the address only available here.
delete from background_jobs where payload ->> 'template' <> 'verification_rejected';
set local role service_role;
create temp table c1 as select * from claim_email_jobs(10);
reset role;
select results_eq(
  $$ select template, recipient_email, recipient_locale from c1 $$,
  $$ values ('verification_rejected', 'seller@example.com', 'en') $$,
  'claiming returns the recipient, looked up at that moment'
);
set local role service_role;
select is_empty($$ select * from claim_email_jobs(10) $$, 'a job being sent cannot be claimed twice');
select lives_ok(format($$ select fail_background_job(%L, 'RESEND_500', true) $$, (select job_id from c1)), 'a failure is recorded');
select is_empty($$ select * from claim_email_jobs(10) $$, 'a failed job waits before retrying');
reset role;
select results_eq(
  $$ select status, attempts, last_error, run_at > now() from background_jobs $$,
  $$ values ('failed', 1, 'RESEND_500', true) $$,
  'the failure keeps its reason and a later retry time'
);

update background_jobs set run_at = now() - interval '1 minute';
set local role service_role;
select is((select count(*)::int from claim_email_jobs(10)), 1, 'it is retried once the wait is over');
select lives_ok(format($$ select complete_background_job(%L, 'msg_1') $$, (select job_id from c1)), 'success is recorded');
select lives_ok(format($$ select fail_background_job(%L, 'late', true) $$, (select job_id from c1)), 'a late failure report is harmless');
reset role;
select results_eq(
  $$ select status, provider_message_id, last_error from background_jobs $$,
  $$ values ('succeeded', 'msg_1', null::text) $$,
  'a finished job stays finished'
);

-- Giving up.
update background_jobs set status = 'failed', attempts = 4, run_at = now() - interval '1 minute';
set local role service_role;
select is((select count(*)::int from claim_email_jobs(10)), 1, 'the last attempt is claimed');
select lives_ok(format($$ select fail_background_job(%L, 'RESEND_500', true) $$, (select job_id from c1)), 'the last attempt fails');
reset role;
select is((select status from background_jobs), 'dead', 'out of attempts means it stops');

update background_jobs set status = 'running', attempts = 1;
set local role service_role;
select lives_ok(format($$ select fail_background_job(%L, 'RESEND_422', false) $$, (select job_id from c1)), 'a permanent failure is recorded');
reset role;
select is((select status from background_jobs), 'dead', 'a permanent failure is not retried');

-- A worker that stopped mid-send.
update background_jobs set status = 'running', attempts = 2, locked_until = now() - interval '1 minute', run_at = now();
set local role service_role;
select is((select count(*)::int from claim_email_jobs(10)), 1, 'a job abandoned by a stopped worker is picked up again');
reset role;
update background_jobs set status = 'running', attempts = 5, locked_until = now() - interval '1 minute';
set local role service_role;
select is_empty($$ select * from claim_email_jobs(10) $$, 'an abandoned job with no attempts left is not sent again');
reset role;
select results_eq($$ select status, last_error from background_jobs $$, $$ values ('dead', 'WORKER_STOPPED') $$, 'and it is marked as stopped');

-- One email per event, however often it is raised.
select private.enqueue_email('00000000-0000-4000-8000-0000000000e3', 'verification_verified', '{}', 'same-key');
select private.enqueue_email('00000000-0000-4000-8000-0000000000e3', 'verification_verified', '{}', 'same-key');
select is((select count(*)::int from background_jobs where idempotency_key = 'same-key'), 1, 'the same event only creates one job');

select * from finish();
rollback;
