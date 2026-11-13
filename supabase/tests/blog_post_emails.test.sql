-- New blog posts emailed to Biqbaq's list (Q-68).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000e01', 'be-super@example.com'),
  ('00000000-0000-4000-8000-000000000e02', 'be-coadmin@example.com');
select private.bootstrap_super_admin('be-super@example.com');
insert into user_roles (user_id, role_key) values ('00000000-0000-4000-8000-000000000e02', 'co_admin');
insert into user_role_permissions (user_role_id, permission_key)
  select id, 'blog.manage' from user_roles where user_id = '00000000-0000-4000-8000-000000000e02' and role_key = 'co_admin';

-- A known starting point: email on, two people a day, and a list of three confirmed people,
-- one pending and one who left.
update platform_settings set value = 'true' where key = 'email.notifications_enabled';
update platform_settings set value = '2' where key = 'bulk_email.max_recipients_per_day';
insert into email_lists (owner_type, enabled) values ('platform', true) on conflict do nothing;
update email_lists set mailing_address = null where owner_type = 'platform';
delete from email_campaigns where list_id = (select id from email_lists where owner_type = 'platform');
delete from list_subscribers where list_id = (select id from email_lists where owner_type = 'platform');
insert into list_subscribers (list_id, email, status, source, consent_basis, confirmed_at)
  select l.id, v.email, v.status, 'self', 'express', v.confirmed
  from email_lists l, (values
    ('be-1@example.com', 'confirmed', now() - interval '3 days'),
    ('be-2@example.com', 'confirmed', now() - interval '2 days'),
    ('be-3@example.com', 'confirmed', now() - interval '1 day'),
    ('be-4@example.com', 'pending', null::timestamptz),
    ('be-5@example.com', 'unsubscribed', null)) as v (email, status, confirmed)
  where l.owner_type = 'platform';

insert into blog_posts (id, slug, title, excerpt, body, category_id, cover_url, status) values
  ('00000000-0000-4000-8000-000000000ea1', 'be-first', 'Shipping a car to Lagos', 'What it costs, and how long it takes.', 'Words', (select id from blog_categories limit 1), 'https://res.cloudinary.com/x/cover.jpg', 'draft'),
  ('00000000-0000-4000-8000-000000000ea2', 'be-second', 'Second post', 'Summary two', 'Words', (select id from blog_categories limit 1), 'https://res.cloudinary.com/x/cover.jpg', 'draft'),
  ('00000000-0000-4000-8000-000000000ea3', 'be-later', 'Scheduled post', 'Summary three', 'Words', (select id from blog_categories limit 1), 'https://res.cloudinary.com/x/cover.jpg', 'draft'),
  ('00000000-0000-4000-8000-000000000ea4', 'be-quiet', 'Quiet post', 'Summary four', 'Words', (select id from blog_categories limit 1), 'https://res.cloudinary.com/x/cover.jpg', 'draft');
create temp view jobs as
  select payload -> 'data' ->> 'post' as post, payload ->> 'to' as email, payload -> 'data' ->> 'subject' as subject, run_at, status
  from background_jobs where payload ->> 'template' = 'blog_post';
grant select on jobs to authenticated;

-- Only Super Admin may tick the box.
select pg_temp.act_as('00000000-0000-4000-8000-000000000e02');
set local role authenticated;
select throws_ok($$ select set_blog_post_status('00000000-0000-4000-8000-000000000ea1', 'published', null, true) $$, '42501', null, 'a Co-admin cannot email the list');
select is((get_blog_post_for_editing('00000000-0000-4000-8000-000000000ea1') ->> 'list_email'), null, 'and is not shown the choice');
select lives_ok($$ select set_blog_post_status('00000000-0000-4000-8000-000000000ea4', 'published') $$, 'but can still publish, without an email');
reset role;
select is((select count(*)::int from jobs where post = '00000000-0000-4000-8000-000000000ea4'), 0, 'no email for an unticked post');

-- Without a mailing address (CASL), nobody is emailed, and the editor says why.
select pg_temp.act_as('00000000-0000-4000-8000-000000000e01');
set local role authenticated;
select is((get_blog_post_for_editing('00000000-0000-4000-8000-000000000ea2') -> 'list_email'),
  '{"subscribers": 3, "has_address": false, "per_day": 2}'::jsonb, 'Super Admin sees who it would reach');
select lives_ok($$ select set_blog_post_status('00000000-0000-4000-8000-000000000ea2', 'published', null, true) $$, 'publishing without an address still works');
select is((get_blog_post_for_editing('00000000-0000-4000-8000-000000000ea2') ->> 'email_skipped'), 'no_address', 'and records why nobody was emailed');
reset role;
select is((select count(*)::int from jobs where post = '00000000-0000-4000-8000-000000000ea2'), 0, 'no email went');

-- With an address: confirmed people only, the title as subject, spread at two a day.
update email_lists set mailing_address = '12 King St W, Toronto ON M5H 1A1' where owner_type = 'platform';
select pg_temp.act_as('00000000-0000-4000-8000-000000000e01');
set local role authenticated;
select lives_ok($$ select set_blog_post_status('00000000-0000-4000-8000-000000000ea1', 'published', null, true) $$, 'Super Admin publishes and emails');
reset role;
select results_eq($$ select email, subject from jobs where post = '00000000-0000-4000-8000-000000000ea1' order by email $$,
  $$ values ('be-1@example.com', 'Shipping a car to Lagos'), ('be-2@example.com', 'Shipping a car to Lagos'), ('be-3@example.com', 'Shipping a car to Lagos') $$,
  'every confirmed person, and nobody else, with the title as the subject');
select is((select count(*)::int from jobs where post = '00000000-0000-4000-8000-000000000ea1' and run_at <= now()), 2, 'two go today');
select is((select (run_at at time zone 'America/Toronto')::text from jobs where post = '00000000-0000-4000-8000-000000000ea1' and run_at > now()),
  ((now() at time zone 'America/Toronto')::date + 1)::text || ' 09:00:00', 'the third goes tomorrow at 9:00 Toronto time');
select results_eq($$ select email_recipients, email_skipped from blog_posts where id = '00000000-0000-4000-8000-000000000ea1' $$, $$ values (3, null::text) $$, 'the post records who it reached');
select is((select recipients from private.list_sent_today((select id from email_lists where owner_type = 'platform'))), 2, 'today''s allowance counts only today''s share');
select is((select campaigns from private.list_sent_today((select id from email_lists where owner_type = 'platform'))), 0, 'and does not use up the day''s one bulk email');
select is((select count(*)::int from audit_logs where action = 'blog.email' and target_id = '00000000-0000-4000-8000-000000000ea1'), 1, 'the sending is audited');

-- Sent once only.
select pg_temp.act_as('00000000-0000-4000-8000-000000000e01');
set local role authenticated;
select lives_ok($$ select set_blog_post_status('00000000-0000-4000-8000-000000000ea1', 'draft') $$, 'unpublished');
reset role;
select is((select status from jobs where post = '00000000-0000-4000-8000-000000000ea1' and run_at > now()), 'dead', 'tomorrow''s share is not sent for a withdrawn post');
update background_jobs set status = 'succeeded' where payload ->> 'template' = 'blog_post' and run_at <= now();
select pg_temp.act_as('00000000-0000-4000-8000-000000000e01');
set local role authenticated;
select lives_ok($$ select set_blog_post_status('00000000-0000-4000-8000-000000000ea1', 'published', null, true) $$, 'published again');
reset role;
select is((select count(*)::int from jobs where post = '00000000-0000-4000-8000-000000000ea1'), 3, 'but not emailed again');

-- A scheduled post is emailed when it goes live, through the email worker.
select pg_temp.act_as('00000000-0000-4000-8000-000000000e01');
set local role authenticated;
select lives_ok($$ select set_blog_post_status('00000000-0000-4000-8000-000000000ea3', 'published', now() + interval '1 hour', true) $$, 'scheduled with the box ticked');
reset role;
select is((select count(*)::int from jobs where post = '00000000-0000-4000-8000-000000000ea3'), 0, 'nothing is sent before it goes live');
update blog_posts set publish_at = now() - interval '1 second' where id = '00000000-0000-4000-8000-000000000ea3';
update background_jobs set status = 'succeeded' where status in ('queued', 'failed');
set local role service_role;
select lives_ok($$ select * from claim_email_jobs(1) $$, 'the worker runs');
reset role;
select is((select count(*)::int from jobs where post = '00000000-0000-4000-8000-000000000ea3'), 3, 'and the live post is emailed to everyone');
select is((select count(*)::int from jobs where post = '00000000-0000-4000-8000-000000000ea3' and run_at <= now()), 0, 'today''s allowance is used up, so it starts tomorrow');

-- Someone who leaves is not sent what was waiting for them.
update list_subscribers set status = 'unsubscribed', unsubscribed_at = now() where email = 'be-1@example.com';
select is((select count(*)::int from jobs where post = '00000000-0000-4000-8000-000000000ea3' and email = 'be-1@example.com' and status = 'queued'), 0, 'leaving the list stops waiting emails');
select is((select count(*)::int from jobs where post = '00000000-0000-4000-8000-000000000ea3' and status = 'queued'), 2, 'the others still wait');

-- A spam complaint about a blog email takes the address off the list.
update background_jobs set provider_message_id = 'msg-be-2'
  where payload ->> 'template' = 'blog_post' and payload ->> 'to' = 'be-2@example.com' and payload -> 'data' ->> 'post' = '00000000-0000-4000-8000-000000000ea1';
set local role service_role;
select is(record_email_event('msg-be-2', 'complained'), 'recorded', 'a complaint about a blog email is recorded');
reset role;
select is((select status from list_subscribers where email = 'be-2@example.com'), 'unsubscribed', 'and that person leaves the list');

-- Visitors cannot reach any of it.
set local role anon;
select throws_ok($$ select set_blog_post_status('00000000-0000-4000-8000-000000000ea4', 'published', null, true) $$, '42501', null, 'a visitor cannot publish or email');
reset role;

select * from finish();
rollback;
