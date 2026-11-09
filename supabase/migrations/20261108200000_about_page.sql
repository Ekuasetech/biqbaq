-- The About us page (owner's request of 2026-11-08): a photo at the top, then a write-up,
-- written by Super Admin in the same editor as the blog, linked from the footer. The photo
-- is a front-page photo slot ('about'); the write-up is stored as the editor's structure,
-- already cleaned by the server, in English and (optionally) French. Hidden until published.

alter table public.site_images drop constraint site_images_slot_check;
alter table public.site_images add constraint site_images_slot_check check (slot in ('hero_1', 'hero_2', 'hero_3', 'get_started',
  'category_fashion', 'category_food', 'category_beauty', 'category_home', 'category_cargo_cars', 'about'));

create or replace function public.authorize_site_image(p_slot text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  if p_slot is null or p_slot not in ('hero_1', 'hero_2', 'hero_3', 'get_started',
    'category_fashion', 'category_food', 'category_beauty', 'category_home', 'category_cargo_cars', 'about') then
    raise exception 'SLOT_NOT_FOUND' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'max_images', 1,
    'max_bytes', (select (value #>> '{}')::integer from public.platform_settings where key = 'media.max_image_bytes'),
    'max_dimension', (select (value #>> '{}')::integer from public.platform_settings where key = 'media.max_dimension'),
    'formats', (select value from public.platform_settings where key = 'media.allowed_formats')
  );
end;
$$;

create or replace function public.record_site_image(p_actor uuid, p_slot text, p_public_id text, p_secure_url text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  if p_slot not in ('hero_1', 'hero_2', 'hero_3', 'get_started',
    'category_fashion', 'category_food', 'category_beauty', 'category_home', 'category_cargo_cars', 'about') then
    raise exception 'SLOT_NOT_FOUND' using errcode = 'P0002';
  end if;
  select image_public_id into v_old from public.site_images where slot = p_slot for update;
  insert into public.site_images (slot, image_url, image_public_id, updated_by)
  values (p_slot, p_secure_url, p_public_id, p_actor)
  on conflict (slot) do update set image_url = excluded.image_url, image_public_id = excluded.image_public_id,
    updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (p_actor, 'site_image.upload', 'site_image', p_slot, '{}'::jsonb);
  return v_old;
end;
$$;

-- One row only.
create table public.about_page (
  id boolean primary key default true check (id),
  content_en jsonb not null,
  content_fr jsonb,
  -- Plain text of each, for search engines' page description.
  text_en text not null default '' check (char_length(text_en) <= 50000),
  text_fr text not null default '' check (char_length(text_fr) <= 50000),
  published boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.about_page enable row level security;
-- No policies: visitors read the view below, and only the function changes the table.

create view public.public_about_page as
  select content_en, content_fr, text_en, text_fr, updated_at from public.about_page where published;
grant select on public.public_about_page to anon, authenticated;

-- Super Admin's copy, published or not.
create function public.admin_get_about_page()
returns table (content_en jsonb, content_fr jsonb, published boolean, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query select a.content_en, a.content_fr, a.published, a.updated_at from public.about_page a;
end;
$$;
revoke execute on function public.admin_get_about_page() from public, anon;
grant execute on function public.admin_get_about_page() to authenticated;

-- Saves the page. The server has already rebuilt each document from what Biqbaq allows.
create function public.admin_save_about_page(p_content_en jsonb, p_content_fr jsonb, p_text_en text, p_text_fr text, p_published boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_super_admin();
  v_en text := btrim(coalesce(p_text_en, ''));
begin
  if p_content_en is null or jsonb_typeof(p_content_en) <> 'object' or (p_content_fr is not null and jsonb_typeof(p_content_fr) <> 'object')
    or p_published is null or char_length(v_en) > 50000 or char_length(coalesce(p_text_fr, '')) > 50000
    or pg_column_size(p_content_en) > 400000 or coalesce(pg_column_size(p_content_fr), 0) > 400000 then
    raise exception 'DETAILS_INVALID' using errcode = '23514';
  end if;
  -- Nothing empty goes live.
  if p_published and v_en = '' then
    raise exception 'CONTENT_REQUIRED' using errcode = '23514';
  end if;
  insert into public.about_page (id, content_en, content_fr, text_en, text_fr, published, updated_by, updated_at)
  values (true, p_content_en, p_content_fr, v_en, btrim(coalesce(p_text_fr, '')), p_published, v_actor, now())
  on conflict (id) do update set content_en = excluded.content_en, content_fr = excluded.content_fr, text_en = excluded.text_en,
    text_fr = excluded.text_fr, published = excluded.published, updated_by = excluded.updated_by, updated_at = now();
  perform private.write_audit('about.save', 'about_page', 'about', null, jsonb_build_object('published', p_published));
end;
$$;
revoke execute on function public.admin_save_about_page(jsonb, jsonb, text, text, boolean) from public, anon;
grant execute on function public.admin_save_about_page(jsonb, jsonb, text, text, boolean) to authenticated;
