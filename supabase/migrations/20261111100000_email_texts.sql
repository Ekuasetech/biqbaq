-- Super Admin edits the wording of Biqbaq's emails (owner's request of 2026-11-11): each
-- email's main text and button text in English and French, and the welcome email's heading,
-- tiles and photos. Only changed wording is stored; anything blank uses the built-in text.
-- Subjects and where buttons lead stay fixed. Which emails and fields exist, and which
-- {placeholders} each may use, is checked by the server against its catalogue; this table
-- checks the shape, the length and that it is Super Admin.

create table public.email_texts (
  template text not null check (template ~ '^[a-z_]{2,60}$'),
  locale text not null check (locale in ('en', 'fr')),
  field text not null check (field in ('body', 'action', 'note', 'heading', 'tile_products', 'tile_cargo')),
  value text not null check (char_length(value) between 1 and 3000),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (template, locale, field)
);
alter table public.email_texts enable row level security;
-- No policies: emails are put together on the server, which reads this with its own key,
-- and Super Admin reads and changes it only through the functions below.

create function public.admin_list_email_texts()
returns table (template text, locale text, field text, value text, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query select e.template, e.locale, e.field, e.value, e.updated_at from public.email_texts e order by 1, 2, 3;
end;
$$;
revoke execute on function public.admin_list_email_texts() from public, anon;
grant execute on function public.admin_list_email_texts() to authenticated;

-- Saves one email's wording for one language: each field given is set, or removed when
-- blank (so the built-in text is used again).
create function public.admin_save_email_texts(p_template text, p_locale text, p_fields jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_super_admin();
  v_field text;
  v_value text;
begin
  if p_template !~ '^[a-z_]{2,60}$' or p_locale not in ('en', 'fr') or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'DETAILS_INVALID' using errcode = '23514';
  end if;
  for v_field, v_value in select key, btrim(coalesce(value #>> '{}', '')) from jsonb_each(p_fields) loop
    if v_field not in ('body', 'action', 'note', 'heading', 'tile_products', 'tile_cargo') or char_length(v_value) > 3000 then
      raise exception 'DETAILS_INVALID' using errcode = '23514';
    end if;
    if v_value = '' then
      delete from public.email_texts where template = p_template and locale = p_locale and field = v_field;
    else
      insert into public.email_texts (template, locale, field, value, updated_by)
      values (p_template, p_locale, v_field, v_value, v_actor)
      on conflict (template, locale, field) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
    end if;
  end loop;
  perform private.write_audit('email_text.save', 'email_template', p_template, null, jsonb_build_object('locale', p_locale));
end;
$$;
revoke execute on function public.admin_save_email_texts(text, text, jsonb) from public, anon;
grant execute on function public.admin_save_email_texts(text, text, jsonb) to authenticated;

-- The welcome email's three photos are photo slots, uploaded like the Site images.
alter table public.site_images drop constraint site_images_slot_check;
alter table public.site_images add constraint site_images_slot_check check (slot in ('hero_1', 'hero_2', 'hero_3', 'get_started',
  'category_fashion', 'category_food', 'category_beauty', 'category_home', 'category_cargo_cars', 'about',
  'email_welcome_hero', 'email_tile_products', 'email_tile_cargo'));

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
    'category_fashion', 'category_food', 'category_beauty', 'category_home', 'category_cargo_cars', 'about',
    'email_welcome_hero', 'email_tile_products', 'email_tile_cargo') then
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
    'category_fashion', 'category_food', 'category_beauty', 'category_home', 'category_cargo_cars', 'about',
    'email_welcome_hero', 'email_tile_products', 'email_tile_cargo') then
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
