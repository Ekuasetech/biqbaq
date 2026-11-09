-- The front page's own photos, changed by Super Admin (owner's request of 2026-11-08): the
-- hero's three slides, the "Get started on Biqbaq" photo, and the five Shop by category cards. A slot with no row shows the
-- photo the site ships with. Photos go through the same checked Cloudinary upload as ads.

create table public.site_images (
  slot text primary key check (slot in ('hero_1', 'hero_2', 'hero_3', 'get_started', 'category_fashion', 'category_food', 'category_beauty', 'category_home', 'category_cargo_cars')),
  image_url text not null check (image_url like 'https://res.cloudinary.com/%'),
  image_public_id text not null,
  -- What a screen reader says. Empty means the photo's usual description is kept.
  alt_en text not null default '' check (char_length(alt_en) <= 200),
  alt_fr text not null default '' check (char_length(alt_fr) <= 200),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.site_images enable row level security;
-- No policies: the table is read through the view below and changed only by these functions.

create view public.public_site_images as
  select slot, image_url, alt_en, alt_fr from public.site_images;
grant select on public.public_site_images to anon, authenticated;

-- Super Admin may upload a photo for a slot. Returns the upload limits.
create function public.authorize_site_image(p_slot text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  if p_slot is null or p_slot not in ('hero_1', 'hero_2', 'hero_3', 'get_started', 'category_fashion', 'category_food', 'category_beauty', 'category_home', 'category_cargo_cars') then
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
revoke execute on function public.authorize_site_image(text) from public, anon;
grant execute on function public.authorize_site_image(text) to authenticated;

-- Server only, once Cloudinary has confirmed the file. Returns the photo it replaced, for
-- the server to delete, or null.
create function public.record_site_image(p_actor uuid, p_slot text, p_public_id text, p_secure_url text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  if p_slot not in ('hero_1', 'hero_2', 'hero_3', 'get_started', 'category_fashion', 'category_food', 'category_beauty', 'category_home', 'category_cargo_cars') then
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
revoke execute on function public.record_site_image(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.record_site_image(uuid, text, text, text) to service_role;

-- Super Admin changes what a screen reader says about an uploaded photo.
create function public.admin_set_site_image_alt(p_slot text, p_alt_en text, p_alt_fr text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_en text := btrim(coalesce(p_alt_en, ''));
  v_fr text := btrim(coalesce(p_alt_fr, ''));
begin
  perform private.require_super_admin();
  if char_length(v_en) > 200 or char_length(v_fr) > 200 then
    raise exception 'DETAILS_INVALID' using errcode = '23514';
  end if;
  update public.site_images set alt_en = v_en, alt_fr = v_fr, updated_by = auth.uid(), updated_at = now() where slot = p_slot;
  if not found then
    raise exception 'SLOT_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.write_audit('site_image.describe', 'site_image', p_slot, null, '{}'::jsonb);
end;
$$;
revoke execute on function public.admin_set_site_image_alt(text, text, text) from public, anon;
grant execute on function public.admin_set_site_image_alt(text, text, text) to authenticated;

-- Super Admin puts a slot back to the photo the site ships with. Returns the uploaded photo,
-- for the server to delete, or null if there was none.
create function public.admin_reset_site_image(p_slot text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  perform private.require_super_admin();
  delete from public.site_images where slot = p_slot returning image_public_id into v_old;
  if v_old is not null then
    perform private.write_audit('site_image.reset', 'site_image', p_slot, null, '{}'::jsonb);
  end if;
  return v_old;
end;
$$;
revoke execute on function public.admin_reset_site_image(text) from public, anon;
grant execute on function public.admin_reset_site_image(text) to authenticated;
