-- The blog (PRD §11). Decided by the owner (2026-11-07, BD-15): only Super Admin and Co-admins
-- given the permission write and edit posts, so there is no seller blogging or review step.

insert into public.permissions (key, description, scope, is_delegable) values
  ('blog.manage', 'Write, edit, publish and archive blog posts', 'platform', false);

create table public.blog_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,60}$'),
  name_en text not null check (char_length(btrim(name_en)) between 1 and 60),
  name_fr text not null check (char_length(btrim(name_fr)) between 1 and 60),
  created_at timestamptz not null default now()
);

insert into public.blog_categories (slug, name_en, name_fr) values
  ('business', 'Business', 'Affaires'),
  ('cargo', 'Cargo', 'Cargo'),
  ('food', 'Food', 'Alimentation'),
  ('fashion', 'Fashion', 'Mode');

create table public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  excerpt text not null default '' check (char_length(excerpt) <= 300),
  body text not null default '' check (char_length(body) <= 50000),
  category_id uuid references public.blog_categories (id) on delete restrict,
  cover_public_id text,
  cover_url text,
  author_id uuid references public.profiles (id) on delete set null,
  -- Shown as the writer. Kept here, so a post keeps its byline if the account changes.
  author_name text not null default 'Biqbaq' check (char_length(btrim(author_name)) between 1 and 100),
  seo_title text not null default '' check (char_length(seo_title) <= 70),
  seo_description text not null default '' check (char_length(seo_description) <= 160),
  -- Published with a future date means scheduled. It shows once that time arrives.
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  publish_at timestamptz,
  first_published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint published_needs_date check (status <> 'published' or publish_at is not null)
);

create table public.blog_tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null check (char_length(btrim(name)) between 1 and 40)
);

create table public.blog_post_tags (
  post_id uuid not null references public.blog_posts (id) on delete cascade,
  tag_id uuid not null references public.blog_tags (id) on delete cascade,
  primary key (post_id, tag_id)
);

create table public.blog_read_totals (
  post_id uuid primary key references public.blog_posts (id) on delete cascade,
  readers bigint not null default 0
);

create table public.blog_read_days (
  post_id uuid not null references public.blog_posts (id) on delete cascade,
  visitor_hash text not null,
  day date not null,
  primary key (post_id, visitor_hash, day)
);

create index blog_posts_live on public.blog_posts (publish_at desc) where status = 'published';
create index blog_read_days_day on public.blog_read_days (day);

create trigger set_updated_at before update on public.blog_posts
  for each row execute function private.set_updated_at();

alter table public.blog_categories enable row level security;
alter table public.blog_posts enable row level security;
alter table public.blog_tags enable row level security;
alter table public.blog_post_tags enable row level security;
alter table public.blog_read_totals enable row level security;
alter table public.blog_read_days enable row level security;
revoke all on public.blog_categories, public.blog_posts, public.blog_tags, public.blog_post_tags,
  public.blog_read_totals, public.blog_read_days from public, anon, authenticated;
-- Category names are public, and so are tag names.
grant select on public.blog_categories, public.blog_tags to anon, authenticated;
create policy "anyone reads categories" on public.blog_categories for select using (true);
create policy "anyone reads tags" on public.blog_tags for select using (true);

-- What anyone may read: published posts whose time has come.
create view public.public_blog_posts as
  select
    b.id, b.slug, b.title, b.excerpt, b.body, b.cover_url, b.author_name, b.seo_title, b.seo_description,
    b.publish_at as published_at, b.updated_at,
    c.slug as category_slug, c.name_en as category_name_en, c.name_fr as category_name_fr,
    coalesce((select t.readers from public.blog_read_totals t where t.post_id = b.id), 0)::bigint as readers,
    greatest(1, ceil(cardinality(regexp_split_to_array(btrim(b.body), '\s+')) / 200.0))::integer as read_minutes,
    coalesce((
      select jsonb_agg(jsonb_build_object('slug', tg.slug, 'name', tg.name) order by tg.name)
      from public.blog_post_tags pt join public.blog_tags tg on tg.id = pt.tag_id where pt.post_id = b.id
    ), '[]'::jsonb) as tags
  from public.blog_posts b
  left join public.blog_categories c on c.id = b.category_id
  where b.status = 'published' and b.publish_at <= now();

grant select on public.public_blog_posts to anon, authenticated;

-- Only Super Admin, or a Co-admin given the permission, as the owner decided.
create function private.can_manage_blog()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_super_admin() or (private.has_active_role('co_admin') and private.has_permission('blog.manage'));
$$;

create function private.require_blog_manager()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_active_account();
begin
  if not private.can_manage_blog() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return v_user;
end;
$$;

revoke all on function private.can_manage_blog() from public;
revoke all on function private.require_blog_manager() from public;

create function public.my_blog_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_manage_blog();
$$;

create function public.admin_list_blog_posts(p_status text default null, p_search text default null, p_limit integer default 20, p_offset integer default 0)
returns table (id uuid, slug text, title text, status text, publish_at timestamptz, updated_at timestamptz, author_name text, category_slug text, readers bigint, total bigint)
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
    select b.id, b.slug, b.title, b.status, b.publish_at, b.updated_at, b.author_name, c.slug,
      coalesce((select t.readers from public.blog_read_totals t where t.post_id = b.id), 0)::bigint, count(*) over ()
    from public.blog_posts b left join public.blog_categories c on c.id = b.category_id
    where (p_status is null
        or (p_status = 'scheduled' and b.status = 'published' and b.publish_at > now())
        or (p_status = 'published' and b.status = 'published' and b.publish_at <= now())
        or (p_status not in ('scheduled', 'published') and b.status = p_status))
      and (v_pattern is null or b.title ilike v_pattern or b.body ilike v_pattern)
    order by b.updated_at desc, b.id
    limit greatest(least(coalesce(p_limit, 20), 50), 1)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create function public.get_blog_post_for_editing(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_post public.blog_posts;
begin
  perform private.require_blog_manager();
  select * into v_post from public.blog_posts where id = p_id;
  if not found then
    raise exception 'POST_NOT_FOUND' using errcode = 'P0002';
  end if;
  return to_jsonb(v_post) - 'cover_public_id' || jsonb_build_object(
    'category_slug', (select slug from public.blog_categories where id = v_post.category_id),
    'tags', coalesce((select jsonb_agg(tg.name order by tg.name) from public.blog_post_tags pt join public.blog_tags tg on tg.id = pt.tag_id where pt.post_id = p_id), '[]'::jsonb)
  );
end;
$$;

-- Creates a post when p_id is null. The address is made once from the first title and never
-- changes, so links to a published post keep working.
create function public.save_blog_post(
  p_id uuid,
  p_title text,
  p_excerpt text,
  p_body text,
  p_category text,
  p_tags text[],
  p_author_name text,
  p_seo_title text,
  p_seo_description text
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
  if p_category is not null then
    select id into v_category from public.blog_categories where slug = p_category;
    if not found then
      raise exception 'CATEGORY_NOT_FOUND' using errcode = '23514';
    end if;
  end if;

  if v_id is null then
    insert into public.blog_posts (slug, title, excerpt, body, category_id, author_id, author_name, seo_title, seo_description)
    values (
      private.unique_slug(p_title, 'public.blog_posts', 'post'), btrim(p_title), btrim(coalesce(p_excerpt, '')), btrim(coalesce(p_body, '')),
      v_category, v_actor, coalesce(nullif(btrim(p_author_name), ''), 'Biqbaq'), btrim(coalesce(p_seo_title, '')), btrim(coalesce(p_seo_description, ''))
    )
    returning id into v_id;
    perform private.write_audit('blog.create', 'blog_post', v_id::text, null, jsonb_build_object('title', btrim(p_title)));
  else
    update public.blog_posts set
      title = btrim(p_title), excerpt = btrim(coalesce(p_excerpt, '')), body = btrim(coalesce(p_body, '')), category_id = v_category,
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

-- Publishing needs everything a reader sees. A future time schedules it instead.
create function public.set_blog_post_status(p_id uuid, p_status text, p_publish_at timestamptz default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.blog_posts;
  v_when timestamptz := coalesce(p_publish_at, now());
begin
  perform private.require_blog_manager();
  if p_status is null or p_status not in ('draft', 'published', 'archived') then
    raise exception 'INVALID_STATUS' using errcode = '23514';
  end if;
  select * into v_post from public.blog_posts where id = p_id for update;
  if not found then
    raise exception 'POST_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_status = 'published' then
    if btrim(v_post.excerpt) = '' or btrim(v_post.body) = '' or v_post.category_id is null or v_post.cover_url is null then
      raise exception 'POST_INCOMPLETE' using errcode = '23514';
    end if;
    if v_when < now() - interval '1 minute' and v_post.first_published_at is null then
      raise exception 'PUBLISH_DATE_IN_PAST' using errcode = '23514';
    end if;
    update public.blog_posts set status = 'published', publish_at = v_when,
      first_published_at = coalesce(first_published_at, v_when) where id = p_id;
  else
    if v_post.status = p_status then
      raise exception 'INVALID_STATUS_CHANGE' using errcode = '55000';
    end if;
    update public.blog_posts set status = p_status where id = p_id;
  end if;
  perform private.write_audit(
    case when p_status = 'published' and v_when > now() then 'blog.schedule' else 'blog.' || case p_status when 'published' then 'publish' when 'draft' then 'unpublish' else 'archive' end end,
    'blog_post', p_id::text, null, jsonb_build_object('title', v_post.title, 'publish_at', v_when));
end;
$$;

create function public.create_blog_category(p_slug text, p_name_en text, p_name_fr text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_blog_manager();
  insert into public.blog_categories (slug, name_en, name_fr) values (lower(btrim(p_slug)), btrim(p_name_en), btrim(p_name_fr));
  perform private.write_audit('blog.category_create', 'blog_category', lower(btrim(p_slug)), null, jsonb_build_object('name', btrim(p_name_en)));
exception
  when unique_violation then raise exception 'CATEGORY_EXISTS' using errcode = '55000';
  when check_violation then raise exception 'CATEGORY_INVALID' using errcode = '23514';
end;
$$;

-- Cover photos go through the same checks as product photos, with the file confirmed with
-- Cloudinary by the server before this is called.
create function public.authorize_blog_cover(p_post uuid)
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
  return jsonb_build_object(
    'max_images', 1,
    'max_bytes', (select (value #>> '{}')::integer from public.platform_settings where key = 'media.max_image_bytes'),
    'max_dimension', (select (value #>> '{}')::integer from public.platform_settings where key = 'media.max_dimension'),
    'formats', (select value from public.platform_settings where key = 'media.allowed_formats')
  );
end;
$$;

-- Returns the photo it replaced, so the server can delete that file.
create function public.record_blog_cover(p_actor uuid, p_post uuid, p_public_id text, p_secure_url text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  select cover_public_id into v_old from public.blog_posts where id = p_post and status <> 'archived' for update;
  if not found then
    raise exception 'POST_NOT_EDITABLE' using errcode = '55000';
  end if;
  update public.blog_posts set cover_public_id = p_public_id, cover_url = p_secure_url where id = p_post;
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (p_actor, 'blog.cover', 'blog_post', p_post::text, '{}'::jsonb);
  return v_old;
end;
$$;

create function public.record_blog_read(p_post uuid, p_visitor_hash text, p_ip_hash text, p_viewer uuid default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'America/Toronto')::date;
begin
  if not exists (select 1 from public.public_blog_posts where id = p_post) then
    return false;
  end if;
  -- The writers are not readers of their own posts.
  if p_viewer is not null and exists (select 1 from public.blog_posts where id = p_post and author_id = p_viewer) then
    return false;
  end if;
  begin
    perform private.hit_rate_limit('views:' || p_ip_hash, 'views.max_per_hour');
  exception when others then
    return false;
  end;
  insert into public.blog_read_days (post_id, visitor_hash, day) values (p_post, p_visitor_hash, v_day) on conflict do nothing;
  if not found then
    return false;
  end if;
  insert into public.blog_read_totals (post_id, readers) values (p_post, 1)
  on conflict (post_id) do update set readers = public.blog_read_totals.readers + 1;
  delete from public.blog_read_days where day < v_day - 1;
  return true;
end;
$$;

-- A live or scheduled post must keep its cover. Returns the file for the server to delete.
create function public.clear_blog_cover(p_post uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.blog_posts;
begin
  perform private.require_blog_manager();
  select * into v_post from public.blog_posts where id = p_post for update;
  if not found then
    raise exception 'POST_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_post.status = 'published' then
    raise exception 'COVER_NEEDED' using errcode = '55000';
  end if;
  update public.blog_posts set cover_public_id = null, cover_url = null where id = p_post;
  perform private.write_audit('blog.cover', 'blog_post', p_post::text, null, jsonb_build_object('removed', true));
  return v_post.cover_public_id;
end;
$$;

revoke execute on function public.my_blog_access() from public, anon;
grant execute on function public.my_blog_access() to authenticated;
revoke execute on function public.admin_list_blog_posts(text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_blog_posts(text, text, integer, integer) to authenticated;
revoke execute on function public.get_blog_post_for_editing(uuid) from public, anon;
grant execute on function public.get_blog_post_for_editing(uuid) to authenticated;
revoke execute on function public.save_blog_post(uuid, text, text, text, text, text[], text, text, text) from public, anon;
grant execute on function public.save_blog_post(uuid, text, text, text, text, text[], text, text, text) to authenticated;
revoke execute on function public.set_blog_post_status(uuid, text, timestamptz) from public, anon;
grant execute on function public.set_blog_post_status(uuid, text, timestamptz) to authenticated;
revoke execute on function public.create_blog_category(text, text, text) from public, anon;
grant execute on function public.create_blog_category(text, text, text) to authenticated;
revoke execute on function public.authorize_blog_cover(uuid) from public, anon;
grant execute on function public.authorize_blog_cover(uuid) to authenticated;
revoke execute on function public.record_blog_cover(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_blog_cover(uuid, uuid, text, text) to service_role;
revoke execute on function public.record_blog_read(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.record_blog_read(uuid, text, text, uuid) to service_role;
revoke execute on function public.clear_blog_cover(uuid) from public, anon;
grant execute on function public.clear_blog_cover(uuid) to authenticated;
