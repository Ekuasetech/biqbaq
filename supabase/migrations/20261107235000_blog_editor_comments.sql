-- Owner's request (2026-11-07): Tiptap for writing blog posts, with text basics, links and photos
-- in the article; and comments from signed-in visitors, shown straight away and moderated after.

alter table public.blog_posts add column content jsonb;

-- Photos inside an article are tracked like product photos, so unused ones can be deleted.
alter table public.media_assets drop constraint media_assets_entity_type_check;
alter table public.media_assets add constraint media_assets_entity_type_check check (entity_type in ('product', 'blog_post'));

insert into public.platform_settings (key, value, description, is_public) values
  ('comments.enabled', 'true', 'Whether signed-in visitors can comment on blog posts', true),
  ('comments.max_per_hour', '10', 'Most comments one person may post in an hour', false);

drop function public.save_blog_post(uuid, text, text, text, text, text[], text, text, text);
create function public.save_blog_post(
  p_id uuid,
  p_title text,
  p_excerpt text,
  p_body text,
  p_category text,
  p_tags text[],
  p_author_name text,
  p_seo_title text,
  p_seo_description text,
  p_content jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_blog_manager();
  v_id uuid := p_id;
  v_category uuid;
  v_tag text;
  v_tag_id uuid;
  v_count integer := 0;
begin
  if nullif(btrim(coalesce(p_title, '')), '') is null then
    raise exception 'TITLE_REQUIRED' using errcode = '23514';
  end if;
  if char_length(btrim(p_title)) > 200 or char_length(coalesce(p_excerpt, '')) > 300 or char_length(coalesce(p_body, '')) > 50000
    or char_length(coalesce(p_seo_title, '')) > 70 or char_length(coalesce(p_seo_description, '')) > 160
    or char_length(btrim(coalesce(p_author_name, ''))) > 100 or cardinality(coalesce(p_tags, '{}')) > 10 then
    raise exception 'TOO_LONG' using errcode = '23514';
  end if;
  -- The editor's structured content. The website checks it before saving, and draws only the
  -- formatting it knows, so nothing in it can become page code.
  if p_content is not null and (jsonb_typeof(p_content) <> 'object' or p_content ->> 'type' <> 'doc' or octet_length(p_content::text) > 500000) then
    raise exception 'CONTENT_INVALID' using errcode = '23514';
  end if;
  if p_category is not null then
    select id into v_category from public.blog_categories where slug = p_category;
    if not found then
      raise exception 'CATEGORY_NOT_FOUND' using errcode = '23514';
    end if;
  end if;

  if v_id is null then
    insert into public.blog_posts (slug, title, excerpt, body, content, category_id, author_id, author_name, seo_title, seo_description)
    values (
      private.unique_slug(p_title, 'public.blog_posts', 'post'), btrim(p_title), btrim(coalesce(p_excerpt, '')), btrim(coalesce(p_body, '')), p_content,
      v_category, v_actor, coalesce(nullif(btrim(p_author_name), ''), 'Biqbaq'), btrim(coalesce(p_seo_title, '')), btrim(coalesce(p_seo_description, ''))
    )
    returning id into v_id;
    perform private.write_audit('blog.create', 'blog_post', v_id::text, null, jsonb_build_object('title', btrim(p_title)));
  else
    update public.blog_posts set
      title = btrim(p_title), excerpt = btrim(coalesce(p_excerpt, '')), body = btrim(coalesce(p_body, '')), content = p_content, category_id = v_category,
      author_name = coalesce(nullif(btrim(p_author_name), ''), 'Biqbaq'),
      seo_title = btrim(coalesce(p_seo_title, '')), seo_description = btrim(coalesce(p_seo_description, ''))
    where id = v_id and status <> 'archived';
    if not found then
      raise exception 'POST_NOT_EDITABLE' using errcode = '55000';
    end if;
    perform private.write_audit('blog.edit', 'blog_post', v_id::text, null, jsonb_build_object('title', btrim(p_title)));
  end if;

  delete from public.blog_post_tags where post_id = v_id;
  foreach v_tag in array coalesce(p_tags, '{}') loop
    v_tag := btrim(v_tag);
    continue when v_tag = '';
    if char_length(v_tag) > 40 then
      raise exception 'TOO_LONG' using errcode = '23514';
    end if;
    insert into public.blog_tags (slug, name)
    values (left(btrim(regexp_replace(lower(v_tag), '[^a-z0-9]+', '-', 'g'), '-'), 60), v_tag)
    on conflict (slug) do update set name = public.blog_tags.name
    returning id into v_tag_id;
    insert into public.blog_post_tags (post_id, tag_id) values (v_id, v_tag_id) on conflict do nothing;
  end loop;
  return v_id;
end;
$$;

create or replace view public.public_blog_posts as
  select
    b.id, b.slug, b.title, b.excerpt, b.body, b.cover_url, b.author_name, b.seo_title, b.seo_description,
    b.publish_at as published_at, b.updated_at,
    c.slug as category_slug, c.name_en as category_name_en, c.name_fr as category_name_fr,
    coalesce((select t.readers from public.blog_read_totals t where t.post_id = b.id), 0)::bigint as readers,
    greatest(1, ceil(cardinality(regexp_split_to_array(btrim(b.body), '\s+')) / 200.0))::integer as read_minutes,
    coalesce((
      select jsonb_agg(jsonb_build_object('slug', tg.slug, 'name', tg.name) order by tg.name)
      from public.blog_post_tags pt join public.blog_tags tg on tg.id = pt.tag_id where pt.post_id = b.id
    ), '[]'::jsonb) as tags,
    b.content
  from public.blog_posts b
  left join public.blog_categories c on c.id = b.category_id
  where b.status = 'published' and b.publish_at <= now();

create function public.authorize_blog_image(p_post uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_blog_manager();
  if not exists (select 1 from public.blog_posts where id = p_post and status <> 'archived') then
    raise exception 'POST_NOT_EDITABLE' using errcode = '55000';
  end if;
  if (select count(*) from public.media_assets where entity_type = 'blog_post' and entity_id = p_post) >= 30 then
    raise exception 'IMAGE_LIMIT_REACHED' using errcode = '55000';
  end if;
  return jsonb_build_object(
    'max_images', 30,
    'max_bytes', (select (value #>> '{}')::integer from public.platform_settings where key = 'media.max_image_bytes'),
    'max_dimension', (select (value #>> '{}')::integer from public.platform_settings where key = 'media.max_dimension'),
    'formats', (select value from public.platform_settings where key = 'media.allowed_formats')
  );
end;
$$;

create function public.record_blog_image(p_actor uuid, p_post uuid, p_public_id text, p_secure_url text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.media_assets (entity_type, entity_id, cloudinary_public_id, secure_url, display_order, is_primary, uploaded_by)
  values ('blog_post', p_post, p_public_id, p_secure_url, 0, false, p_actor)
  returning id into v_id;
  return v_id;
end;
$$;

-- The article's photos, so the server can check what is used and delete what is not.
create function public.blog_post_images(p_post uuid)
returns table (id uuid, public_id text, url text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.cloudinary_public_id, m.secure_url, m.created_at from public.media_assets m
  where m.entity_type = 'blog_post' and m.entity_id = p_post;
$$;

create function public.forget_blog_images(p_post uuid, p_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.media_assets where entity_type = 'blog_post' and entity_id = p_post and id = any (p_ids);
$$;

-- Comments, shown straight away and moderated afterwards (owner's decision, 2026-11-07).
create table public.blog_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.blog_posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  status text not null default 'published' check (status in ('published', 'hidden')),
  hidden_reason text,
  created_at timestamptz not null default now()
);

create index blog_comments_post on public.blog_comments (post_id, created_at) where status = 'published';

alter table public.blog_comments enable row level security;
revoke all on public.blog_comments from public, anon, authenticated;

create view public.public_blog_comments as
  select c.id, c.post_id, c.body, c.created_at, nullif(btrim(p.display_name), '') as author_name
  from public.blog_comments c
  join public.public_blog_posts b on b.id = c.post_id
  left join public.profiles p on p.id = c.author_id
  where c.status = 'published';

grant select on public.public_blog_comments to anon, authenticated;

create function public.add_blog_comment(p_post uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_active_account();
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  if not private.setting_is_on('comments.enabled') then
    raise exception 'COMMENTS_DISABLED' using errcode = '55000';
  end if;
  if not exists (select 1 from public.public_blog_posts where id = p_post) then
    raise exception 'POST_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_body = '' then
    raise exception 'COMMENT_REQUIRED' using errcode = '23514';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'COMMENT_TOO_LONG' using errcode = '23514';
  end if;
  perform private.hit_rate_limit('comments:' || v_user, 'comments.max_per_hour');
  insert into public.blog_comments (post_id, author_id, body) values (p_post, v_user, v_body) returning id into v_id;
  return v_id;
end;
$$;

create function public.my_blog_comment_ids(p_post uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.blog_comments where post_id = p_post and author_id = auth.uid() and status = 'published';
$$;

create function public.delete_my_blog_comment(p_comment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_active_account();
  delete from public.blog_comments where id = p_comment and author_id = auth.uid() and status = 'published';
  if not found then
    raise exception 'COMMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

-- The people who run the blog look after its comments.
create function public.admin_list_blog_comments(p_status text default null, p_search text default null, p_limit integer default 20, p_offset integer default 0)
returns table (id uuid, post_title text, post_slug text, author_name text, author_email text, body text, status text, hidden_reason text, created_at timestamptz, total bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pattern text := case when nullif(btrim(p_search), '') is null then null else
    '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end;
begin
  perform private.require_blog_manager();
  return query
    select c.id, b.title, b.slug, p.display_name, u.email::text, c.body, c.status, c.hidden_reason, c.created_at, count(*) over ()
    from public.blog_comments c
    join public.blog_posts b on b.id = c.post_id
    left join public.profiles p on p.id = c.author_id
    left join auth.users u on u.id = c.author_id
    where (p_status is null or c.status = p_status)
      and (v_pattern is null or c.body ilike v_pattern or b.title ilike v_pattern or u.email ilike v_pattern)
    order by c.created_at desc, c.id
    limit greatest(least(coalesce(p_limit, 20), 50), 1)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create function public.set_blog_comment_hidden(p_comment uuid, p_hidden boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
  v_comment public.blog_comments;
begin
  perform private.require_blog_manager();
  v_reason := private.moderation_reason(p_reason);
  select * into v_comment from public.blog_comments where id = p_comment for update;
  if not found then
    raise exception 'COMMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_hidden is null or (v_comment.status = 'hidden') = p_hidden then
    raise exception 'MODERATION_NOT_ALLOWED' using errcode = '55000';
  end if;
  update public.blog_comments set status = case when p_hidden then 'hidden' else 'published' end,
    hidden_reason = case when p_hidden then v_reason end where id = p_comment;
  perform private.write_audit(case when p_hidden then 'comment.hide' else 'comment.restore' end, 'blog_comment', p_comment::text, v_reason,
    jsonb_build_object('post', v_comment.post_id, 'author', v_comment.author_id));
end;
$$;

create or replace function private.setting_value_is_valid(p_key text, p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_min numeric;
  v_max numeric;
begin
  if p_key = 'media.allowed_formats' then
    return jsonb_array_length(p_value) > 0
      and (select count(*) = count(distinct f) and bool_and(f in ('jpg', 'png', 'webp'))
           from jsonb_array_elements_text(p_value) f);
  end if;

  if jsonb_typeof(p_value) <> 'number' then
    return true;
  end if;

  select r.lo, r.hi into v_min, v_max from (values
    ('publishing.unverified_allowance', 0, 1000),
    ('contact.max_per_ip_hour', 1, 1000),
    ('contact.max_per_email_hour', 1, 1000),
    ('contact.max_per_seller_hour', 1, 100000),
    ('media.max_image_bytes', 102400, 10485760),
    ('media.max_dimension', 500, 10000),
    ('media.max_images', 1, 20),
    ('staff.max_invitations_per_hour', 1, 100),
    ('api.max_requests_per_hour', 10, 100000),
    ('reviews.max_per_hour', 1, 100),
    ('views.max_per_hour', 10, 100000),
    ('comments.max_per_hour', 1, 100)
  ) as r (k, lo, hi) where r.k = p_key;

  -- A number with no limits listed here is refused, so a new one has to be given some.
  return v_min is not null
    and (p_value #>> '{}')::numeric between v_min and v_max
    and (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric);
end;
$$;

revoke all on function private.setting_value_is_valid(text, jsonb) from public;
revoke execute on function public.save_blog_post(uuid, text, text, text, text, text[], text, text, text, jsonb) from public, anon;
grant execute on function public.save_blog_post(uuid, text, text, text, text, text[], text, text, text, jsonb) to authenticated;
revoke execute on function public.authorize_blog_image(uuid) from public, anon;
grant execute on function public.authorize_blog_image(uuid) to authenticated;
revoke execute on function public.add_blog_comment(uuid, text) from public, anon;
grant execute on function public.add_blog_comment(uuid, text) to authenticated;
revoke execute on function public.my_blog_comment_ids(uuid) from public, anon;
grant execute on function public.my_blog_comment_ids(uuid) to authenticated;
revoke execute on function public.delete_my_blog_comment(uuid) from public, anon;
grant execute on function public.delete_my_blog_comment(uuid) to authenticated;
revoke execute on function public.admin_list_blog_comments(text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_blog_comments(text, text, integer, integer) to authenticated;
revoke execute on function public.set_blog_comment_hidden(uuid, boolean, text) from public, anon;
grant execute on function public.set_blog_comment_hidden(uuid, boolean, text) to authenticated;
revoke execute on function public.record_blog_image(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_blog_image(uuid, uuid, text, text) to service_role;
revoke execute on function public.blog_post_images(uuid) from public, anon, authenticated;
grant execute on function public.blog_post_images(uuid) to service_role;
revoke execute on function public.forget_blog_images(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.forget_blog_images(uuid, uuid[]) to service_role;
grant select on public.public_blog_posts to anon, authenticated;
