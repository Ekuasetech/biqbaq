-- Tests that try to break the blog.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000401', 'b-super@example.com'),
  ('00000000-0000-4000-8000-000000000402', 'b-coadmin@example.com'),
  ('00000000-0000-4000-8000-000000000403', 'b-coadmin-none@example.com'),
  ('00000000-0000-4000-8000-000000000404', 'b-admin@example.com'),
  ('00000000-0000-4000-8000-000000000405', 'b-buyer@example.com');
select private.bootstrap_super_admin('b-super@example.com');
insert into user_roles (user_id, role_key) values
  ('00000000-0000-4000-8000-000000000402', 'co_admin'),
  ('00000000-0000-4000-8000-000000000403', 'co_admin'),
  ('00000000-0000-4000-8000-000000000404', 'admin');
insert into user_role_permissions (user_role_id, permission_key)
  select id, 'blog.manage' from user_roles where user_id in ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000404') and role_key in ('co_admin', 'admin');
create temp table p (id uuid);
grant select, insert, delete on p to authenticated, service_role;

-- Only Super Admin, and Co-admins given the permission.
set local role anon;
select throws_ok($$ select save_blog_post(null, 'T', '', '', null, '{}', '', '', '') $$, '42501', null, 'a visitor cannot write');
select throws_ok($$ select * from blog_posts $$, '42501', null, 'or read drafts directly');
select lives_ok($$ select * from public_blog_posts $$, 'but can read published posts');
select lives_ok($$ select * from blog_categories $$, 'and categories');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000405');
set local role authenticated;
select ok(not my_blog_access(), 'a buyer has no access');
select throws_ok($$ select save_blog_post(null, 'T', '', '', null, '{}', '', '', '') $$, '42501', null, 'and cannot write');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000404');
set local role authenticated;
select ok(not my_blog_access(), 'an Admin has no access, even with the permission, as the owner decided');
select throws_ok($$ select * from admin_list_blog_posts() $$, '42501', null, 'and cannot list posts');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000403');
set local role authenticated;
select ok(not my_blog_access(), 'a Co-admin without the permission has no access');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000402');
set local role authenticated;
select ok(my_blog_access(), 'a Co-admin with the permission has access');

-- Writing a draft.
select throws_ok($$ select save_blog_post(null, '  ', '', '', null, '{}', '', '', '') $$, '23514', 'TITLE_REQUIRED', 'a title is needed');
select throws_ok($$ select save_blog_post(null, 'T', repeat('x', 301), '', null, '{}', '', '', '') $$, '23514', 'TOO_LONG', 'an overlong summary is refused');
select throws_ok($$ select save_blog_post(null, 'T', '', '', null, '{}', '', repeat('x', 71), '') $$, '23514', 'TOO_LONG', 'an overlong search engine title is refused');
select throws_ok($$ select save_blog_post(null, 'T', '', '', 'no-such', '{}', '', '', '') $$, '23514', 'CATEGORY_NOT_FOUND', 'an unknown category is refused');
select throws_ok($$ select save_blog_post(null, 'T', '', '', null, array['1','2','3','4','5','6','7','8','9','10','11'], '', '', '') $$, '23514', 'TOO_LONG', 'too many tags are refused');
select lives_ok($$ insert into p select save_blog_post(null, ' Sending cargo home ', 'Summary', 'Words here', 'marketing', array['Cargo', 'cargo ', 'Lagos'], '', '', '') $$, 'a Co-admin writes a draft');
reset role;
select results_eq($$ select slug, title, author_name, status, author_id from blog_posts where id = (select id from p) $$,
  $$ values ('sending-cargo-home', 'Sending cargo home', 'Biqbaq', 'draft', '00000000-0000-4000-8000-000000000402'::uuid) $$, 'it is saved as a draft, tidied, with a byline');
select is((select count(*)::int from blog_post_tags where post_id = (select id from p)), 2, 'repeated tags are kept once');
select is_empty($$ select 1 from public_blog_posts where title = 'Sending cargo home' $$, 'a draft is not public');

-- Publishing needs everything a reader sees.
select pg_temp.act_as('00000000-0000-4000-8000-000000000402');
set local role authenticated;
select throws_ok($$ select set_blog_post_status((select id from p), 'published') $$, '23514', 'POST_INCOMPLETE', 'a post with no cover cannot be published');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000402');
set local role authenticated;
select throws_ok($$ select record_blog_cover('00000000-0000-4000-8000-000000000402', (select id from p), 'x', 'https://x') $$, '42501', null, 'only the server can attach a cover, not even a blog manager');
reset role;
set local role service_role;
select is(record_blog_cover('00000000-0000-4000-8000-000000000402', (select id from p), 'biqbaq/blog/x', 'https://res.cloudinary.com/x.jpg'), null::text, 'the server attaches a cover');
select is(record_blog_cover('00000000-0000-4000-8000-000000000402', (select id from p), 'biqbaq/blog/y', 'https://res.cloudinary.com/y.jpg'), 'biqbaq/blog/x', 'replacing it hands back the old file to delete');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000402');
set local role authenticated;
select throws_ok($$ select set_blog_post_status((select id from p), 'published', now() - interval '1 day') $$, '23514', 'PUBLISH_DATE_IN_PAST', 'it cannot be backdated');
select lives_ok($$ select set_blog_post_status((select id from p), 'published', now() + interval '1 day') $$, 'it is scheduled for tomorrow');
select is((select status from admin_list_blog_posts('scheduled') where id = (select id from p)), 'published', 'it shows as scheduled');
select throws_ok($$ select clear_blog_cover((select id from p)) $$, '55000', 'COVER_NEEDED', 'a scheduled post keeps its cover');
reset role;
select is_empty($$ select 1 from public_blog_posts where id = (select id from p) $$, 'a scheduled post is not public before its time');
update blog_posts set publish_at = now() - interval '1 minute' where id = (select id from p);
select is((select category_slug from public_blog_posts where id = (select id from p)), 'marketing', 'once its time comes, it is public');
select is((select jsonb_array_length(tags) from public_blog_posts where id = (select id from p)), 2, 'with its tags');
select hasnt_column('public', 'public_blog_posts', 'author_id', 'the public view does not reveal the account');
select hasnt_column('public', 'public_blog_posts', 'cover_public_id', 'or the file''s name');

-- Editing keeps the address.
select pg_temp.act_as('00000000-0000-4000-8000-000000000401');
set local role authenticated;
select lives_ok($$ select save_blog_post((select id from p), 'A new title', 'Summary', 'Words here', 'marketing', '{}', 'Ada', '', '') $$, 'Super Admin edits it');
reset role;
select results_eq($$ select slug, title, author_name from blog_posts where id = (select id from p) $$, $$ values ('sending-cargo-home', 'A new title', 'Ada') $$, 'the address never changes, so links keep working');
select is((select count(*)::int from blog_post_tags where post_id = (select id from p)), 0, 'tags can be cleared');

-- Readers.
select pg_temp.act_as('00000000-0000-4000-8000-000000000405');
set local role authenticated;
select throws_ok($$ select record_blog_read((select id from p), 'v1', 'ip') $$, '42501', null, 'only the server counts readers');
reset role;
set local role service_role;
select ok(record_blog_read((select id from p), 'v1', 'ip1'), 'a reader counts');
select ok(not record_blog_read((select id from p), 'v1', 'ip1'), 'once a day');
select ok(not record_blog_read((select id from p), 'v2', 'ip1', '00000000-0000-4000-8000-000000000402'), 'the writer does not count');
reset role;
select is((select readers from public_blog_posts where id = (select id from p)), 1::bigint, 'the public count shows it');

-- Taking it down.
select pg_temp.act_as('00000000-0000-4000-8000-000000000402');
set local role authenticated;
select lives_ok($$ select set_blog_post_status((select id from p), 'archived') $$, 'it is archived');
select throws_ok($$ select set_blog_post_status((select id from p), 'archived') $$, '55000', 'INVALID_STATUS_CHANGE', 'archiving twice is refused');
select throws_ok($$ select save_blog_post((select id from p), 'Sneaky edit', '', '', null, '{}', '', '', '') $$, '55000', 'POST_NOT_EDITABLE', 'an archived post cannot be edited');
select throws_ok($$ select authorize_blog_cover((select id from p)) $$, '55000', 'POST_NOT_EDITABLE', 'or given a new cover');
reset role;
select is_empty($$ select 1 from public_blog_posts where id = (select id from p) $$, 'it leaves the site');
set local role service_role;
select ok(not record_blog_read((select id from p), 'v9', 'ip9'), 'and is not counted');
reset role;

-- Categories.
select pg_temp.act_as('00000000-0000-4000-8000-000000000402');
set local role authenticated;
select lives_ok($$ select create_blog_category('immigration', 'Immigration', 'Immigration') $$, 'a category is added');
select throws_ok($$ select create_blog_category('immigration', 'Again', 'Encore') $$, '55000', 'CATEGORY_EXISTS', 'not twice');
select throws_ok($$ select create_blog_category('Bad Slug!', 'Bad', 'Bad') $$, '23514', 'CATEGORY_INVALID', 'and not with an unsafe key');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000405');
set local role authenticated;
select throws_ok($$ select create_blog_category('x', 'X', 'X') $$, '42501', null, 'a buyer cannot add categories');
select throws_ok($$ select clear_blog_cover((select id from p)) $$, '42501', null, 'or remove a cover');
select throws_ok($$ insert into blog_categories (slug, name_en, name_fr) values ('x', 'X', 'X') $$, '42501', null, 'or write them directly');
reset role;

select pg_temp.act_as('00000000-0000-4000-8000-000000000402');
set local role authenticated;
select is(clear_blog_cover((select id from p)), 'biqbaq/blog/y', 'an archived post''s cover can be removed, handing back the file to delete');
reset role;
select is((select cover_url from blog_posts where id = (select id from p)), null::text, 'and it is gone');
select is((select count(*)::int from audit_logs where action like 'blog.%' and target_id = (select id::text from p)), 7, 'every change to the post is audited');

select * from finish();
rollback;
