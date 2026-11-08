-- Tests that try to break blog comments, the editor's content and article photos.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.act_as(p_user uuid)
returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000501', 'c-super@example.com'),
  ('00000000-0000-4000-8000-000000000502', 'c-reader@example.com'),
  ('00000000-0000-4000-8000-000000000503', 'c-other@example.com');
update profiles set display_name = 'Ada R.' where id = '00000000-0000-4000-8000-000000000502';
select private.bootstrap_super_admin('c-super@example.com');
insert into blog_posts (id, slug, title, excerpt, body, category_id, cover_url, status, publish_at) values
  ('00000000-0000-4000-8000-000000000b01', 'c-live', 'Live post', 'S', 'Words', (select id from blog_categories limit 1), 'https://res.cloudinary.com/x.jpg', 'published', now() - interval '1 hour'),
  ('00000000-0000-4000-8000-000000000b02', 'c-draft', 'Draft post', 'S', 'Words', null, null, 'draft', null);
create temp table v as select '00000000-0000-4000-8000-000000000b01'::uuid as live, '00000000-0000-4000-8000-000000000b02'::uuid as draft;
grant select on v to authenticated, anon, service_role;
create temp table c (id uuid);
grant select, insert, delete on c to authenticated;

-- Only signed-in people comment.
set local role anon;
select throws_ok($$ select add_blog_comment((select live from v), 'Hi') $$, '42501', null, 'a visitor cannot comment');
select throws_ok($$ select * from blog_comments $$, '42501', null, 'or read comments directly');
select lives_ok($$ select * from public_blog_comments $$, 'but can read published ones');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000502');
set local role authenticated;
select throws_ok($$ insert into blog_comments (post_id, author_id, body) values ((select live from v), auth.uid(), 'x') $$, '42501', null, 'nobody writes a comment directly');
select throws_ok($$ select add_blog_comment((select live from v), '   ') $$, '23514', 'COMMENT_REQUIRED', 'an empty comment is refused');
select throws_ok(format($$ select add_blog_comment((select live from v), %L) $$, repeat('x', 2001)), '23514', 'COMMENT_TOO_LONG', 'an overlong comment is refused');
select throws_ok($$ select add_blog_comment((select draft from v), 'Hi') $$, 'P0002', 'POST_NOT_FOUND', 'a draft cannot be commented on');
select lives_ok($$ insert into c select add_blog_comment((select live from v), '  Great read <script>x</script> ') $$, 'a reader comments');
select is((select count(*)::int from my_blog_comment_ids((select live from v))), 1, 'they can tell it is theirs');
reset role;
select results_eq($$ select body, author_name from public_blog_comments where post_id = (select live from v) $$, $$ values ('Great read <script>x</script>', 'Ada R.') $$, 'it shows straight away, as plain text with a display name');
select hasnt_column('public', 'public_blog_comments', 'author_id', 'the public view does not reveal the account');

-- Only the author can delete their own.
select pg_temp.act_as('00000000-0000-4000-8000-000000000503');
set local role authenticated;
select is_empty($$ select * from my_blog_comment_ids((select live from v)) $$, 'nobody else sees it as theirs');
select throws_ok($$ select delete_my_blog_comment((select id from c)) $$, 'P0002', 'COMMENT_NOT_FOUND', 'or can delete it');
select throws_ok($$ select * from admin_list_blog_comments() $$, '42501', null, 'or moderate comments');
reset role;

-- Moderation by the people who run the blog.
select pg_temp.act_as('00000000-0000-4000-8000-000000000501');
set local role authenticated;
select is((select author_email from admin_list_blog_comments('published', 'Great')), 'c-reader@example.com', 'Super Admin finds it');
select throws_ok($$ select set_blog_comment_hidden((select id from c), true, ' ') $$, '23514', 'REASON_REQUIRED', 'hiding needs a reason');
select lives_ok($$ select set_blog_comment_hidden((select id from c), true, 'Spam') $$, 'Super Admin hides it');
reset role;
select is_empty($$ select 1 from public_blog_comments $$, 'a hidden comment leaves the page');
select is((select count(*)::int from audit_logs where action = 'comment.hide'), 1, 'it is audited');
select pg_temp.act_as('00000000-0000-4000-8000-000000000502');
set local role authenticated;
select throws_ok($$ select delete_my_blog_comment((select id from c)) $$, 'P0002', 'COMMENT_NOT_FOUND', 'the author cannot delete a hidden one to hide the record');
reset role;

-- Comments leave with their post.
update blog_posts set status = 'draft' where id = (select live from v);
select pg_temp.act_as('00000000-0000-4000-8000-000000000501');
set local role authenticated;
select lives_ok($$ select set_blog_comment_hidden((select id from c), false, 'Was fine') $$, 'Super Admin shows it again');
reset role;
select is_empty($$ select 1 from public_blog_comments $$, 'while the post is a draft, its comments are not public');
update blog_posts set status = 'published' where id = (select live from v);
select is((select count(*)::int from public_blog_comments), 1, 'and they come back with it');

-- Too many comments too fast, and switching them off.
update platform_settings set value = '2' where key = 'comments.max_per_hour';
delete from rate_limit_counters;
select pg_temp.act_as('00000000-0000-4000-8000-000000000503');
set local role authenticated;
select lives_ok($$ select add_blog_comment((select live from v), 'One') $$, 'a first comment');
select lives_ok($$ select add_blog_comment((select live from v), 'Two') $$, 'a second');
select throws_ok($$ select add_blog_comment((select live from v), 'Three') $$, 'P0001', 'RATE_LIMITED', 'a third in the hour is refused');
reset role;
update platform_settings set value = 'false' where key = 'comments.enabled';
delete from rate_limit_counters;
select pg_temp.act_as('00000000-0000-4000-8000-000000000502');
set local role authenticated;
select throws_ok($$ select add_blog_comment((select live from v), 'Off?') $$, '55000', 'COMMENTS_DISABLED', 'nobody can comment while comments are off');
reset role;
update platform_settings set value = 'true' where key = 'comments.enabled';

-- The editor's content.
select pg_temp.act_as('00000000-0000-4000-8000-000000000501');
set local role authenticated;
select throws_ok($$ select save_blog_post((select live from v), 'T', 'S', 'W', null, '{}', '', '', '', '"<script>"'::jsonb) $$, '23514', 'CONTENT_INVALID', 'content that is not a document is refused');
select throws_ok($$ select save_blog_post((select live from v), 'T', 'S', 'W', null, '{}', '', '', '', '{"type": "paragraph"}'::jsonb) $$, '23514', 'CONTENT_INVALID', 'or a document of the wrong kind');
select lives_ok($$ select save_blog_post((select live from v), 'T', 'S', 'W', null, '{}', '', '', '', '{"type": "doc", "content": []}'::jsonb) $$, 'a document is saved');
reset role;
select is((select content ->> 'type' from public_blog_posts where id = (select live from v)), 'doc', 'and is public with the post');

-- Article photos.
select pg_temp.act_as('00000000-0000-4000-8000-000000000502');
set local role authenticated;
select throws_ok($$ select authorize_blog_image((select live from v)) $$, '42501', null, 'a reader cannot upload article photos');
select throws_ok($$ select record_blog_image(auth.uid(), (select live from v), 'x', 'https://x') $$, '42501', null, 'or record one');
select throws_ok($$ select * from blog_post_images((select live from v)) $$, '42501', null, 'or list them');
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-000000000501');
set local role authenticated;
select is((authorize_blog_image((select live from v)) ->> 'max_images')::int, 30, 'Super Admin may upload, up to 30 a post');
reset role;
set local role service_role;
select lives_ok($$ select record_blog_image('00000000-0000-4000-8000-000000000501', (select live from v), 'biqbaq/blog/a', 'https://res.cloudinary.com/a.jpg') $$, 'the server records one');
select is((select count(*)::int from blog_post_images((select live from v))), 1, 'and can list it');
select lives_ok($$ select forget_blog_images((select live from v), array(select id from blog_post_images((select live from v)))) $$, 'and forget it once deleted');
select is((select count(*)::int from blog_post_images((select live from v))), 0, 'so it is gone');
reset role;
insert into media_assets (entity_type, entity_id, cloudinary_public_id, secure_url, display_order, is_primary)
  select 'blog_post', '00000000-0000-4000-8000-000000000b01', 'biqbaq/blog/n' || n, 'https://res.cloudinary.com/n' || n, 0, false from generate_series(1, 30) n;
select pg_temp.act_as('00000000-0000-4000-8000-000000000501');
set local role authenticated;
select throws_ok($$ select authorize_blog_image((select live from v)) $$, '55000', 'IMAGE_LIMIT_REACHED', 'a 31st photo is refused');
reset role;
select is_empty($$ select 1 from media_assets where entity_type = 'blog_post' and entity_id in (select id from products) $$, 'article photos never mix with product photos');

select * from finish();
rollback;
