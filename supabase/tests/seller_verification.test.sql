-- Tests that try to break seller verification.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000b1', 'owner@example.com'),
  ('00000000-0000-4000-8000-0000000000b2', 'seller@example.com'),
  ('00000000-0000-4000-8000-0000000000b3', 'other@example.com'),
  ('00000000-0000-4000-8000-0000000000b4', 'admin@example.com');
select private.bootstrap_super_admin('owner@example.com');
insert into user_roles (user_id, role_key) values
  ('00000000-0000-4000-8000-0000000000b2', 'seller'),
  ('00000000-0000-4000-8000-0000000000b3', 'seller');
insert into sellers (owner_user_id, slug, name, city) values
  ('00000000-0000-4000-8000-0000000000b2', 'v-shop', 'V Shop', 'Toronto'),
  ('00000000-0000-4000-8000-0000000000b3', 'v-other', 'V Other', 'Calgary');

create temp table ctx as select id from sellers where slug = 'v-shop';
grant select on ctx to authenticated, anon;
create temp table req (id uuid);
grant select, insert on req to authenticated, anon;

-- An Admin holding every permission must still not be able to decide.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
select assign_role('00000000-0000-4000-8000-0000000000b4', 'admin', 'Helper', (select array_agg(key) from permissions where scope = 'platform'));

-- Recent Applications is for Super Admin only, and newest first.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b3');
set local role authenticated;
select throws_ok($$ select * from admin_recent_role_applications() $$, '42501', null, 'a seller cannot read recent applications');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b4');
set local role authenticated;
select throws_ok($$ select * from admin_recent_role_applications() $$, '42501', null, 'an Admin with every permission cannot either');
reset role;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000b7', 'first@example.com'),
  ('00000000-0000-4000-8000-0000000000b8', 'second@example.com');
insert into role_applications (applicant_id, role_key, details, created_at) values
  ('00000000-0000-4000-8000-0000000000b7', 'marketer', '{"reason": "x"}', now() - interval '2 days'),
  ('00000000-0000-4000-8000-0000000000b8', 'marketer', '{"reason": "x"}', now() - interval '1 day');
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
set local role authenticated;
select results_eq(
  $$ select applicant_email from admin_recent_role_applications(1) $$,
  $$ values ('second@example.com') $$,
  'Super Admin sees the newest first, up to the limit'
);
reset role;

-- A seller asks ------------------------------------------------------------------

select pg_temp.act_as('00000000-0000-4000-8000-0000000000b2');
set local role authenticated;
select throws_ok($$ select request_manual_verification('  ') $$, '23514', 'NOTE_REQUIRED', 'a request needs a note');
select lives_ok($$ insert into req select request_manual_verification('I can show my licence') $$, 'a seller can request verification');
select is((select verification_status from sellers where slug = 'v-shop'), 'pending', 'their status is pending');
select is((select status from verification_requests), 'pending', 'they can see their own request');
select throws_ok($$ select request_manual_verification('Again') $$, '55000', 'VERIFICATION_NOT_REQUESTABLE', 'only one request at a time');
select is((select (my_publishing_allowance() ->> 'verified')::boolean), false, 'a pending request lifts no limit');

-- A seller cannot decide or forge ------------------------------------------------

select throws_ok($$ select decide_manual_verification((select id from req), true) $$, '42501', null, 'a seller cannot approve themselves');
select throws_ok($$ select set_verification_status((select id from ctx), 'restore', 'Me') $$, '42501', null, 'a seller cannot change their status');
select throws_ok($$ update sellers set verification_status = 'manually_verified' $$, '42501', null, 'or set it directly');
select throws_ok($$ update verification_requests set status = 'approved' $$, '42501', null, 'or change their request');
select throws_ok($$ insert into verification_history (seller_id, from_status, to_status) values ((select id from ctx), 'a', 'b') $$, '42501', null, 'or forge history');
select throws_ok($$ select * from admin_list_seller_verification() $$, '42501', null, 'or read the review list');
select throws_ok($$ select * from admin_verification_history((select id from ctx)) $$, '42501', null, 'or read the history function');
select is_empty($$ select id from verification_history $$, 'or read the history table');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000b3');
set local role authenticated;
select is_empty($$ select id from verification_requests $$, 'another seller cannot see the request, which may hold private details');
select throws_ok($$ select decide_manual_verification((select id from req), true) $$, '42501', null, 'or decide it');
reset role;

-- No Admin can be given this -------------------------------------------------------

select pg_temp.act_as('00000000-0000-4000-8000-0000000000b4');
set local role authenticated;
select throws_ok($$ select decide_manual_verification((select id from req), true) $$, '42501', null, 'an Admin with every permission cannot verify');
select throws_ok($$ select set_verification_status((select id from ctx), 'suspend', 'No') $$, '42501', null, 'or suspend verification');
select throws_ok($$ select * from admin_list_seller_verification() $$, '42501', null, 'or read the review list');
select is_empty($$ select id from verification_requests $$, 'or read requests');
reset role;

-- Super Admin decides --------------------------------------------------------------

select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
set local role authenticated;
select is((select count(*)::int from admin_list_seller_verification('pending')), 1, 'the request is in the queue');
select is((select owner_email from admin_list_seller_verification('pending')), 'seller@example.com', 'with the seller''s details');
select is((select request_note from admin_list_seller_verification('pending')), 'I can show my licence', 'and their note');
select is((select count(*)::int from admin_list_seller_verification(null, '100%_nothing')), 0, 'search treats wildcards as ordinary text');
select throws_ok($$ select decide_manual_verification((select id from req), false, ' ') $$, '23514', 'REASON_REQUIRED', 'rejecting needs a reason');
select lives_ok($$ select decide_manual_verification((select id from req), false, 'Too blurry') $$, 'Super Admin can reject');
select throws_ok($$ select decide_manual_verification((select id from req), true) $$, '55000', 'REQUEST_NOT_PENDING', 'a decided request cannot be decided again');
reset role;
select is((select verification_status from sellers where slug = 'v-shop'), 'rejected', 'the seller is rejected');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000b2');
set local role authenticated;
select is((select reason from verification_requests), 'Too blurry', 'the seller can see why');
select lives_ok($$ insert into req select request_manual_verification('A clearer copy') $$, 'they can ask again');
reset role;
select is((select count(*)::int from verification_requests where seller_id = (select id from ctx)), 2, 'the earlier request is kept');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
set local role authenticated;
select lives_ok(
  $$ select decide_manual_verification((select id from verification_requests where status = 'pending'), true) $$,
  'Super Admin can approve'
);
reset role;
select is((select verification_status from sellers where slug = 'v-shop'), 'manually_verified', 'approval is recorded as manual, not provider');
select results_eq(
  $$ select reviewed_by, decided_at is not null from verification_requests where status = 'approved' $$,
  $$ values ('00000000-0000-4000-8000-0000000000b1'::uuid, true) $$,
  'the reviewer and time are recorded'
);
select is((select count(*)::int from audit_logs where action = 'seller.verification_change' and target_id = (select id::text from ctx)), 4, 'every change is audited');
select results_eq(
  $$ select actor_id from audit_logs where action = 'seller.verification_change' and metadata ->> 'to' = 'manually_verified' $$,
  $$ values ('00000000-0000-4000-8000-0000000000b1'::uuid) $$,
  'the audit log names who verified'
);

-- Approval takes effect, and only for verification ----------------------------------

select pg_temp.act_as('00000000-0000-4000-8000-0000000000b2');
set local role authenticated;
select is((select (my_publishing_allowance() ->> 'verified')::boolean), true, 'the limit is lifted');
select is((select verified from public_sellers where slug = 'v-shop'), true, 'the public can see they are verified');
select throws_ok($$ select request_manual_verification('More') $$, '55000', 'VERIFICATION_NOT_REQUESTABLE', 'a verified seller cannot ask again');
insert into products (seller_id, name, description, category_id)
select (select id from ctx), 'P ' || n, 'x', (select id from categories limit 1) from generate_series(1, 3) n;
select lives_ok($$ select publish_product(id) from products where name in ('P 1', 'P 2', 'P 3') $$, 'a verified seller can publish past the limit');
reset role;

-- Manual verification does not bypass suspensions (PRD §5.5).
update sellers set publishing_suspended = true where id = (select id from ctx);
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b2');
set local role authenticated;
insert into products (seller_id, name, description, category_id) values ((select id from ctx), 'P 4', 'x', (select id from categories limit 1));
select throws_ok($$ select publish_product(id) from products where name = 'P 4' $$, '55000', 'SELLER_PUBLISHING_SUSPENDED', 'verification does not lift a publishing suspension');
reset role;
update sellers set publishing_suspended = false where id = (select id from ctx);

-- Suspending, restoring, revoking -----------------------------------------------------

select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
set local role authenticated;
select throws_ok($$ select set_verification_status((select id from ctx), 'suspend', '') $$, '23514', 'REASON_REQUIRED', 'suspending needs a reason');
select throws_ok($$ select set_verification_status((select id from ctx), 'restore', 'Why') $$, '55000', 'VERIFICATION_CHANGE_NOT_ALLOWED', 'only a suspended seller can be restored');
select throws_ok($$ select set_verification_status((select id from ctx), 'verify', 'Why') $$, '55000', 'VERIFICATION_CHANGE_NOT_ALLOWED', 'an already verified seller cannot be verified again');
select throws_ok($$ select set_verification_status((select id from ctx), 'unknown', 'Why') $$, '55000', 'VERIFICATION_CHANGE_NOT_ALLOWED', 'an unknown action is refused');
select lives_ok($$ select set_verification_status((select id from ctx), 'suspend', 'Report received') $$, 'Super Admin can suspend verification');
reset role;
select is((select verified from public_sellers where slug = 'v-shop'), false, 'the label returns');
select is((select count(*)::int from public_products where seller_slug = 'v-shop'), 3, 'and existing listings stay up');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000b2');
set local role authenticated;
select throws_ok($$ select publish_product(id) from products where name = 'P 4' $$, '55000', 'PUBLISH_ALLOWANCE_EXHAUSTED', 'and the limit applies again');
select throws_ok($$ select request_manual_verification('Let me back') $$, '55000', 'VERIFICATION_NOT_REQUESTABLE', 'a suspended seller cannot ask their way out');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
set local role authenticated;
select lives_ok($$ select set_verification_status((select id from ctx), 'restore', 'Report dismissed') $$, 'Super Admin can restore');
reset role;
select is((select verification_status from sellers where slug = 'v-shop'), 'manually_verified', 'it returns to what it was');

-- Provider verification stays distinct through a suspension.
update sellers set verification_status = 'provider_verified' where slug = 'v-other';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
set local role authenticated;
select lives_ok($$ select set_verification_status((select id from sellers where slug = 'v-other'), 'suspend', 'Check') $$, 'a provider-verified seller can be suspended');
select lives_ok($$ select set_verification_status((select id from sellers where slug = 'v-other'), 'restore', 'Fine') $$, 'and restored');
reset role;
select is((select verification_status from sellers where slug = 'v-other'), 'provider_verified', 'without becoming manually verified');

select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
set local role authenticated;
select lives_ok($$ select set_verification_status((select id from ctx), 'revoke', 'Confirmed fraud') $$, 'Super Admin can revoke');
select is((select count(*)::int from admin_verification_history((select id from ctx))), 7, 'previous decisions can be viewed');
select is((select reason from admin_verification_history((select id from ctx)) limit 1), 'Confirmed fraud', 'newest first, with the reason');
reset role;
select is((select verification_status from sellers where slug = 'v-shop'), 'rejected', 'revoking sets rejected');

select throws_ok($$ delete from verification_history $$, '55000', null, 'history cannot be deleted, even directly');
select throws_ok($$ update verification_history set reason = 'x' $$, '55000', null, 'or rewritten');

-- Super Admin verifies a seller who never asked (BD-16) ------------------------------

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000b6', 'quiet@example.com');
insert into user_roles (user_id, role_key) values ('00000000-0000-4000-8000-0000000000b6', 'seller');
insert into sellers (owner_user_id, slug, name, city) values ('00000000-0000-4000-8000-0000000000b6', 'v-quiet', 'V Quiet', 'Ottawa');
create temp table quiet as select id from sellers where slug = 'v-quiet';
grant select on quiet to authenticated, anon;

-- Only Super Admin.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b6');
set local role authenticated;
select throws_ok($$ select set_verification_status((select id from quiet), 'verify', 'Me') $$, '42501', null, 'a seller cannot verify themselves this way');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b4');
set local role authenticated;
select throws_ok($$ select set_verification_status((select id from quiet), 'verify', 'Helping') $$, '42501', null, 'an Admin with every permission cannot either');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
set local role authenticated;
select throws_ok($$ select set_verification_status((select id from quiet), 'verify', ' ') $$, '23514', 'REASON_REQUIRED', 'verifying without a request needs a reason');
select lives_ok($$ select set_verification_status((select id from quiet), 'verify', 'Met in person') $$, 'Super Admin can verify a seller who never asked');
reset role;
select is((select verification_status from sellers where slug = 'v-quiet'), 'manually_verified', 'it is recorded as manual');
select is((select count(*)::int from verification_requests where seller_id = (select id from quiet)), 0, 'with no request invented');
select results_eq(
  $$ select actor_id, reason, metadata ->> 'to' from audit_logs where action = 'seller.verification_change' and target_id = (select id::text from quiet) $$,
  $$ values ('00000000-0000-4000-8000-0000000000b1'::uuid, 'Met in person', 'manually_verified') $$,
  'and an audit record of who, why and what'
);
select results_eq(
  $$ select from_status, to_status, method, reason from verification_history where seller_id = (select id from quiet) $$,
  $$ values ('unverified', 'manually_verified', 'manual', 'Met in person') $$,
  'and a history entry'
);

-- It still does not bypass suspensions.
update sellers set publishing_suspended = true where slug = 'v-quiet';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b6');
set local role authenticated;
insert into products (seller_id, name, description, category_id) values ((select id from quiet), 'Q', 'x', (select id from categories limit 1));
select throws_ok($$ select publish_product(id) from products where name = 'Q' $$, '55000', 'SELLER_PUBLISHING_SUSPENDED', 'verifying this way does not lift a publishing suspension');
reset role;

-- An open request must be decided, so it can never be left open.
update sellers set verification_status = 'unverified', publishing_suspended = false where slug = 'v-quiet';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b6');
set local role authenticated;
select lives_ok($$ select request_manual_verification('Please') $$, 'the seller can still ask');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
set local role authenticated;
select throws_ok($$ select set_verification_status((select id from quiet), 'verify', 'Skip it') $$, '55000', 'VERIFICATION_CHANGE_NOT_ALLOWED', 'an open request is decided, not bypassed');
reset role;

-- A rejected seller can be verified directly, and a suspended one must be restored.
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');
set local role authenticated;
select lives_ok($$ select set_verification_status((select id from ctx), 'verify', 'New evidence') $$, 'a rejected seller can be verified directly');
select lives_ok($$ select set_verification_status((select id from ctx), 'suspend', 'Report') $$, 'and later suspended');
select throws_ok($$ select set_verification_status((select id from ctx), 'verify', 'Skip') $$, '55000', 'VERIFICATION_CHANGE_NOT_ALLOWED', 'a suspended seller is restored, not verified afresh');
select lives_ok($$ select set_verification_status((select id from ctx), 'revoke', 'Confirmed') $$, 'and can be revoked');
reset role;

-- A suspended shop cannot ask.
update sellers set status = 'suspended' where slug = 'v-shop';
select pg_temp.act_as('00000000-0000-4000-8000-0000000000b2');
set local role authenticated;
select throws_ok($$ select request_manual_verification('Please') $$, '42501', null, 'a suspended shop cannot request verification');
reset role;

-- Visitors ---------------------------------------------------------------------

select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok($$ select * from verification_requests $$, '42501', null, 'visitors cannot read requests');
select throws_ok($$ select request_manual_verification('Hi') $$, '42501', null, 'or make them');
select throws_ok($$ select decide_manual_verification((select id from req), true) $$, '42501', null, 'or decide them');
select throws_ok($$ select * from admin_recent_role_applications() $$, '42501', null, 'or read recent applications');
reset role;

select * from finish();
rollback;
