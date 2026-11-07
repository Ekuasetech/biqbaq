-- Product images (PRD §17, BD-14). Files live in Cloudinary, and this stores metadata.
--
-- record_product_image can only be run by the server, using the secret key, after it
-- has checked the real file with Cloudinary. A browser that could run it could attach
-- any web address as a photo, or skip the size limits.

insert into public.platform_settings (key, value, description, is_public) values
  ('media.allowed_formats', '["jpg", "png", "webp"]', 'Image formats that may be uploaded', false),
  ('media.max_dimension', '4000', 'Largest image width or height, in pixels', false),
  ('media.max_images', '5', 'Most images one product may have', false);

create unique index media_assets_public_id on public.media_assets (cloudinary_public_id);

grant select on public.media_assets to authenticated;

-- Through the products rules, so it covers exactly the products this person can see.
create policy "people read images of products they can see" on public.media_assets
  for select to authenticated
  using (entity_type = 'product' and entity_id in (select id from public.products));

-- Images count as content, so a suspended or deleted product's images cannot change.
create function private.require_product_images_editable(p_product_id uuid)
returns public.products
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_product public.products;
begin
  select * into v_product from public.products where id = p_product_id and deleted_at is null;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not (private.is_active_seller_owner(v_product.seller_id) or private.has_permission('products.edit_on_behalf')) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if v_product.status not in ('draft', 'published', 'unpublished') then
    raise exception 'PRODUCT_NOT_EDITABLE' using errcode = '55000';
  end if;
  return v_product;
end;
$$;

-- Keeps owner and actor distinct. Published products are always logged (Q-03).
create function private.log_product_image(p_action text, p_actor uuid, p_product public.products, p_public_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select owner_user_id into v_owner from public.sellers where id = p_product.seller_id;
  if p_product.status = 'published' or p_actor is distinct from v_owner then
    insert into public.audit_logs (actor_id, action, target_type, target_id, on_behalf_of_seller_id, metadata)
    values (
      p_actor, p_action, 'product', p_product.id::text,
      case when p_actor is distinct from v_owner then p_product.seller_id end,
      jsonb_build_object('public_id', p_public_id)
    );
  end if;
end;
$$;

revoke all on function private.require_product_images_editable(uuid) from public;
revoke all on function private.log_product_image(text, uuid, public.products, text) from public;

-- Run as the signed-in person, before an upload and again before saving.
create function public.authorize_product_image(p_product_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_max integer;
begin
  perform private.require_active_account();
  perform private.require_product_images_editable(p_product_id);

  select (value #>> '{}')::integer into v_max from public.platform_settings where key = 'media.max_images';
  if (select count(*) from public.media_assets where entity_type = 'product' and entity_id = p_product_id) >= v_max then
    raise exception 'IMAGE_LIMIT_REACHED' using errcode = '55000';
  end if;

  return jsonb_build_object(
    'max_images', v_max,
    'max_bytes', (select value from public.platform_settings where key = 'media.max_image_bytes'),
    'max_dimension', (select value from public.platform_settings where key = 'media.max_dimension'),
    'formats', (select value from public.platform_settings where key = 'media.allowed_formats')
  );
end;
$$;

-- Lets the shop screen show the current limit, whatever Super Admin has set it to.
create function public.product_image_limit()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (value #>> '{}')::integer from public.platform_settings where key = 'media.max_images';
$$;

-- Server only. p_actor comes from the session the server has already checked.
create function public.record_product_image(p_actor uuid, p_product_id uuid, p_public_id text, p_secure_url text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_count integer;
  v_order integer;
  v_id uuid;
begin
  -- The lock stops two uploads at once going past the limit.
  select * into v_product from public.products where id = p_product_id and deleted_at is null for update;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_product.status not in ('draft', 'published', 'unpublished') then
    raise exception 'PRODUCT_NOT_EDITABLE' using errcode = '55000';
  end if;
  if p_secure_url not like 'https://res.cloudinary.com/%' then
    raise exception 'IMAGE_REJECTED' using errcode = '23514';
  end if;

  select count(*), coalesce(max(display_order) + 1, 0) into v_count, v_order
  from public.media_assets where entity_type = 'product' and entity_id = p_product_id;

  if v_count >= (select (value #>> '{}')::integer from public.platform_settings where key = 'media.max_images') then
    raise exception 'IMAGE_LIMIT_REACHED' using errcode = '55000';
  end if;

  insert into public.media_assets (entity_type, entity_id, cloudinary_public_id, secure_url, display_order, is_primary, uploaded_by)
  values ('product', p_product_id, p_public_id, p_secure_url, v_order, v_count = 0, p_actor)
  returning id into v_id;

  perform private.log_product_image('product.image_add', p_actor, v_product, p_public_id);
  return v_id;
end;
$$;

-- Returns the Cloudinary id, so the server can remove the file too.
create function public.remove_product_image(p_asset_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_active_account();
  v_asset public.media_assets;
  v_product public.products;
begin
  select * into v_asset from public.media_assets where id = p_asset_id and entity_type = 'product';
  if not found then
    raise exception 'IMAGE_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_product := private.require_product_images_editable(v_asset.entity_id);

  delete from public.media_assets where id = p_asset_id;

  if v_asset.is_primary then
    update public.media_assets set is_primary = true
    where id = (
      select id from public.media_assets
      where entity_type = 'product' and entity_id = v_asset.entity_id
      order by display_order limit 1
    );
  end if;

  perform private.log_product_image('product.image_remove', v_actor, v_product, v_asset.cloudinary_public_id);
  return v_asset.cloudinary_public_id;
end;
$$;

-- The main photo is the one shown first everywhere.
create function public.make_product_image_primary(p_asset_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_active_account();
  v_asset public.media_assets;
  v_product public.products;
begin
  select * into v_asset from public.media_assets where id = p_asset_id and entity_type = 'product';
  if not found then
    raise exception 'IMAGE_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_product := private.require_product_images_editable(v_asset.entity_id);

  update public.media_assets
  set is_primary = (id = p_asset_id),
      display_order = case
        when id = p_asset_id then (
          select min(m.display_order) - 1 from public.media_assets m
          where m.entity_type = 'product' and m.entity_id = v_asset.entity_id
        )
        else display_order
      end
  where entity_type = 'product' and entity_id = v_asset.entity_id;

  perform private.log_product_image('product.image_primary', v_actor, v_product, v_asset.cloudinary_public_id);
end;
$$;

revoke execute on function public.product_image_limit() from public, anon;
revoke execute on function public.authorize_product_image(uuid) from public, anon;
revoke execute on function public.remove_product_image(uuid) from public, anon;
revoke execute on function public.make_product_image_primary(uuid) from public, anon;
revoke execute on function public.record_product_image(uuid, uuid, text, text) from public, anon, authenticated;

grant execute on function public.product_image_limit() to authenticated;
grant execute on function public.authorize_product_image(uuid) to authenticated;
grant execute on function public.remove_product_image(uuid) to authenticated;
grant execute on function public.make_product_image_primary(uuid) to authenticated;
grant execute on function public.record_product_image(uuid, uuid, text, text) to service_role;

-- Images with no description of their own are described by the product's name, which
-- stays correct when a seller renames the product.
create or replace view public.public_products as
  select
    p.id, p.slug, p.name, p.description, p.price_minor, p.currency, p.availability,
    p.condition, p.attributes, p.view_count, p.first_published_at,
    coalesce((
      select jsonb_agg(jsonb_build_object('url', m.secure_url, 'alt', coalesce(nullif(m.alt_text, ''), p.name)) order by m.display_order)
      from public.media_assets m
      where m.entity_type = 'product' and m.entity_id = p.id
    ), '[]'::jsonb) as images,
    c.slug as category_slug, c.name_en as category_name_en, c.name_fr as category_name_fr,
    s.slug as seller_slug, s.name as seller_name, s.city as seller_city, s.country as seller_country,
    s.description as seller_description,
    s.verification_status in ('provider_verified', 'manually_verified') as seller_verified
  from public.products p
  join public.sellers s on s.id = p.seller_id
  left join public.categories c on c.id = p.category_id
  where p.status = 'published' and p.deleted_at is null and s.status = 'active';
