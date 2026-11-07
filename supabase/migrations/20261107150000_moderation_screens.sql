-- What the moderation screens need. Moderators list what they may act on, repeating an
-- action is refused so the audit log stays true, and sellers are told by email.

-- The reason goes to the seller, so a moderator writes it for them to read.
create function private.moderation_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_reason is null then
    raise exception 'REASON_REQUIRED' using errcode = '23514';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'REASON_TOO_LONG' using errcode = '23514';
  end if;
  return v_reason;
end;
$$;

revoke all on function private.moderation_reason(text) from public;

-- Nobody but Super Admin may act on their own shop or products, so someone who is both an
-- Admin and a seller cannot lift a suspension on themselves.
create function private.refuse_own_moderation(p_owner uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_owner = auth.uid() and not private.is_super_admin() then
    raise exception 'CANNOT_MODERATE_OWN' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.refuse_own_moderation(uuid) from public;

create or replace function public.suspend_product(p_product_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
  v_name text;
  v_owner uuid;
begin
  if not private.has_permission('products.moderate') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  perform private.refuse_own_moderation((
    select s.owner_user_id from public.products p join public.sellers s on s.id = p.seller_id where p.id = p_product_id
  ));
  v_reason := private.moderation_reason(p_reason);
  update public.products p set status = 'suspended'
  from public.sellers s
  where p.id = p_product_id and s.id = p.seller_id and p.deleted_at is null
    and p.status in ('published', 'unpublished', 'archived')
  returning p.name, s.owner_user_id into v_name, v_owner;
  if not found then
    raise exception 'PRODUCT_NOT_SUSPENDABLE' using errcode = '55000';
  end if;
  perform private.write_audit('product.suspend', 'product', p_product_id::text, v_reason);
  perform private.enqueue_email(v_owner, 'product_suspended', jsonb_build_object('product', v_name, 'reason', v_reason),
    'moderation:' || gen_random_uuid());
end;
$$;

-- Restores as unpublished, so the seller or a moderator chooses when it goes live.
create or replace function public.restore_product(p_product_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
  v_name text;
  v_owner uuid;
begin
  if not private.has_permission('products.moderate') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  perform private.refuse_own_moderation((
    select s.owner_user_id from public.products p join public.sellers s on s.id = p.seller_id where p.id = p_product_id
  ));
  v_reason := private.moderation_reason(p_reason);
  update public.products p set status = 'unpublished'
  from public.sellers s
  where p.id = p_product_id and s.id = p.seller_id and p.status = 'suspended' and p.deleted_at is null
  returning p.name, s.owner_user_id into v_name, v_owner;
  if not found then
    raise exception 'PRODUCT_NOT_SUSPENDED' using errcode = '55000';
  end if;
  perform private.write_audit('product.restore', 'product', p_product_id::text, v_reason);
  perform private.enqueue_email(v_owner, 'product_restored', jsonb_build_object('product', v_name, 'reason', v_reason),
    'moderation:' || gen_random_uuid());
end;
$$;

create or replace function public.set_seller_publishing(p_seller_id uuid, p_suspended boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
  v_current boolean;
  v_owner uuid;
begin
  if not private.has_permission('sellers.publishing') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  v_reason := private.moderation_reason(p_reason);
  select publishing_suspended, owner_user_id into v_current, v_owner from public.sellers where id = p_seller_id for update;
  if not found then
    raise exception 'SELLER_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.refuse_own_moderation(v_owner);
  if p_suspended is null or v_current = p_suspended then
    raise exception 'MODERATION_NOT_ALLOWED' using errcode = '55000';
  end if;
  update public.sellers set publishing_suspended = p_suspended where id = p_seller_id;
  perform private.write_audit(
    case when p_suspended then 'seller.publishing_suspend' else 'seller.publishing_restore' end,
    'seller', p_seller_id::text, v_reason);
  perform private.enqueue_email(v_owner, case when p_suspended then 'publishing_suspended' else 'publishing_restored' end,
    jsonb_build_object('reason', v_reason), 'moderation:' || gen_random_uuid());
end;
$$;

create or replace function public.set_seller_status(p_seller_id uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
  v_current text;
  v_owner uuid;
begin
  if not private.has_permission('sellers.manage') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('active', 'suspended') then
    raise exception 'INVALID_STATUS' using errcode = '23514';
  end if;
  v_reason := private.moderation_reason(p_reason);
  select status, owner_user_id into v_current, v_owner from public.sellers where id = p_seller_id for update;
  if not found then
    raise exception 'SELLER_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.refuse_own_moderation(v_owner);
  if v_current = p_status then
    raise exception 'MODERATION_NOT_ALLOWED' using errcode = '55000';
  end if;
  update public.sellers set status = p_status where id = p_seller_id;
  perform private.write_audit('seller.' || p_status, 'seller', p_seller_id::text, v_reason);
  perform private.enqueue_email(v_owner, case when p_status = 'suspended' then 'shop_suspended' else 'shop_restored' end,
    jsonb_build_object('reason', v_reason), 'moderation:' || gen_random_uuid());
end;
$$;

-- Decides what the screen shows. Each action still checks its own permission.
create function public.my_moderation_access()
returns table (products boolean, shops boolean, publishing boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission('products.moderate'), private.has_permission('sellers.manage'), private.has_permission('sellers.publishing');
$$;

-- Drafts stay out: they are private to the seller, and cannot be suspended.
create function public.admin_list_moderation_products(
  p_status text default null,
  p_search text default null,
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  id uuid,
  slug text,
  name text,
  status text,
  price_minor integer,
  currency text,
  seller_name text,
  seller_slug text,
  seller_active boolean,
  total bigint
)
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
  if not private.has_permission('products.moderate') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return query
    select p.id, p.slug, p.name, p.status, p.price_minor, p.currency, s.name, s.slug, s.status = 'active', count(*) over ()
    from public.products p
    join public.sellers s on s.id = p.seller_id
    where p.deleted_at is null and p.status <> 'draft'
      and (p_status is null or p.status = p_status)
      and (v_pattern is null or p.name ilike v_pattern or s.name ilike v_pattern)
    order by p.updated_at desc, p.id
    limit greatest(least(coalesce(p_limit, 10), 50), 1)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- The owner's address is only for those who manage sellers, not those who only control publishing.
create function public.admin_list_moderation_sellers(
  p_filter text default null,
  p_search text default null,
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  id uuid,
  slug text,
  name text,
  city text,
  status text,
  publishing_suspended boolean,
  verification_status text,
  owner_email text,
  product_count bigint,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_manage boolean := private.has_permission('sellers.manage');
  v_pattern text := case when nullif(btrim(p_search), '') is null then null else
    '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end;
begin
  if not v_manage and not private.has_permission('sellers.publishing') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return query
    select s.id, s.slug, s.name, s.city, s.status, s.publishing_suspended, s.verification_status,
      case when v_manage then u.email::text end,
      (select count(*) from public.products p where p.seller_id = s.id and p.deleted_at is null),
      count(*) over ()
    from public.sellers s
    left join auth.users u on u.id = s.owner_user_id
    where (p_filter is null
        or (p_filter = 'suspended' and s.status = 'suspended')
        or (p_filter = 'publishing_suspended' and s.publishing_suspended))
      and (v_pattern is null or s.name ilike v_pattern or s.city ilike v_pattern or (v_manage and u.email ilike v_pattern))
    order by s.name, s.id
    limit greatest(least(coalesce(p_limit, 10), 50), 1)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.suspend_product(uuid, text) from public, anon;
revoke execute on function public.restore_product(uuid, text) from public, anon;
revoke execute on function public.set_seller_publishing(uuid, boolean, text) from public, anon;
revoke execute on function public.set_seller_status(uuid, text, text) from public, anon;
revoke execute on function public.my_moderation_access() from public, anon;
revoke execute on function public.admin_list_moderation_products(text, text, integer, integer) from public, anon;
revoke execute on function public.admin_list_moderation_sellers(text, text, integer, integer) from public, anon;
grant execute on function public.my_moderation_access() to authenticated;
grant execute on function public.admin_list_moderation_products(text, text, integer, integer) to authenticated;
grant execute on function public.admin_list_moderation_sellers(text, text, integer, integer) to authenticated;
