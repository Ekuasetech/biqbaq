-- Seller shops, products and publishing (docs/domain-model.md, PRD §6 and §7).
--
-- Publishing goes only through publish_product, which enforces the unverified
-- seller allowance in one transaction. Owners edit product content directly under
-- row level security, but no client can write status, slug or verification columns.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.sellers (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references public.profiles (id) on delete restrict, -- one shop per person (Q-08)
  slug text not null unique,
  name text not null check (char_length(name) between 1 and 150),
  city text not null check (char_length(city) between 1 and 100),
  country text not null default 'CA' check (country in ('CA', 'NG')),
  category text,
  description text not null default '' check (char_length(description) <= 1000),
  status text not null default 'active' check (status in ('active', 'suspended')),
  publishing_suspended boolean not null default false,
  verification_status text not null default 'unverified' check (
    verification_status in ('unverified', 'pending', 'provider_verified', 'manually_verified', 'rejected', 'suspended', 'expired')
  ),
  -- Set by Super Admin to give one seller a different publishing allowance.
  allowance_override integer check (allowance_override >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Split out so a public read of sellers can never include it.
create table public.seller_private (
  seller_id uuid primary key references public.sellers (id) on delete cascade,
  contact_information text,
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories (id) on delete restrict,
  slug text not null unique,
  name_en text not null,
  name_fr text not null
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers (id) on delete restrict,
  category_id uuid references public.categories (id) on delete restrict,
  slug text not null unique,
  name text not null check (char_length(btrim(name)) between 1 and 150),
  description text not null default '' check (char_length(description) <= 5000),
  price_minor integer not null default 0 check (price_minor >= 0),
  currency text not null default 'CAD' check (currency in ('CAD', 'NGN')),
  availability text not null default 'in_stock' check (availability in ('in_stock', 'limited', 'out_of_stock')),
  condition text check (condition in ('new', 'used')),
  attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  status text not null default 'draft' check (status in ('draft', 'published', 'unpublished', 'archived', 'suspended')),
  first_published_at timestamptz,
  view_count bigint not null default 0,
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_seller on public.products (seller_id) where deleted_at is null;
create index products_public on public.products (first_published_at desc) where status = 'published' and deleted_at is null;
create index products_category on public.products (category_id) where status = 'published' and deleted_at is null;

-- One table for all images (docs/database-design.md). Uploading comes with the
-- Cloudinary work, so no client can write here yet.
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('product')),
  entity_id uuid not null,
  cloudinary_public_id text,
  secure_url text not null check (secure_url like 'https://%'),
  alt_text text not null default '',
  display_order integer not null default 0,
  is_primary boolean not null default false,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);

create index media_assets_entity on public.media_assets (entity_type, entity_id, display_order);

-- One row the first time a product is published, kept forever. This is what makes
-- the allowance cumulative: deleting or unpublishing never gives a slot back.
create table public.product_publication_ledger (
  product_id uuid primary key references public.products (id) on delete restrict,
  seller_id uuid not null references public.sellers (id) on delete restrict,
  published_by uuid,
  seller_was_verified boolean not null,
  created_at timestamptz not null default now()
);

create index product_publication_ledger_seller on public.product_publication_ledger (seller_id);

create trigger append_only before update or delete on public.product_publication_ledger
  for each row execute function private.reject_change();
create trigger append_only_truncate before truncate on public.product_publication_ledger
  for each statement execute function private.reject_change();

create trigger set_updated_at before update on public.sellers
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.seller_private
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.products
  for each row execute function private.set_updated_at();

-- Placeholder categories (Q-15).
insert into public.categories (slug, name_en, name_fr) values
  ('fashion', 'Fashion', 'Mode'),
  ('food', 'Food & groceries', 'Alimentation et épicerie'),
  ('beauty', 'Beauty', 'Beauté'),
  ('home', 'Home', 'Maison');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Web addresses must be unique, and real names repeat, so repeats get a number.
create function private.unique_slug(p_text text, p_table regclass, p_fallback text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text := left(btrim(regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'), '-'), 80);
  v_slug text;
  v_taken boolean;
  v_number integer := 1;
begin
  if v_base = '' then
    v_base := p_fallback;
  end if;
  v_slug := v_base;
  loop
    execute format('select exists (select 1 from %s where slug = $1)', p_table) into v_taken using v_slug;
    exit when not v_taken;
    v_number := v_number + 1;
    v_slug := v_base || '-' || v_number;
  end loop;
  return v_slug;
end;
$$;

-- The caller owns this shop, and is allowed to act as a seller right now.
create function private.is_active_seller_owner(p_seller uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_active_role('seller') and exists (
    select 1 from public.sellers
    where id = p_seller and owner_user_id = auth.uid() and status = 'active'
  );
$$;

create function private.setting_is_on(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select value = 'true'::jsonb from public.platform_settings where key = p_key), false);
$$;

revoke all on function private.unique_slug(text, regclass, text) from public;
revoke all on function private.is_active_seller_owner(uuid) from public;
revoke all on function private.setting_is_on(text) from public;
grant execute on function private.is_active_seller_owner(uuid) to authenticated;

create function private.prepare_new_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.slug := private.unique_slug(new.name, 'public.products', 'product');
  new.created_by := auth.uid();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger prepare_new_product before insert on public.products
  for each row execute function private.prepare_new_product();

create function private.stamp_product_editor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

create trigger stamp_product_editor before update on public.products
  for each row execute function private.stamp_product_editor();

-- Logs every content edit to a published product (Q-03), and any edit made on a
-- seller's behalf, keeping owner and actor distinct (PRD §3.4).
create function private.log_product_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_changed text[] := array_remove(array[
    case when old.name is distinct from new.name then 'name' end,
    case when old.description is distinct from new.description then 'description' end,
    case when old.category_id is distinct from new.category_id then 'category' end,
    case when old.price_minor is distinct from new.price_minor then 'price' end,
    case when old.availability is distinct from new.availability then 'availability' end,
    case when old.condition is distinct from new.condition then 'condition' end,
    case when old.attributes is distinct from new.attributes then 'attributes' end
  ], null);
begin
  if cardinality(v_changed) = 0 then
    return new;
  end if;

  select owner_user_id into v_owner from public.sellers where id = new.seller_id;

  if old.status = 'published' or auth.uid() is distinct from v_owner then
    insert into public.audit_logs (actor_id, action, target_type, target_id, on_behalf_of_seller_id, metadata)
    values (
      auth.uid(), 'product.edit', 'product', new.id::text,
      case when auth.uid() is distinct from v_owner then new.seller_id end,
      jsonb_build_object('fields', v_changed, 'old_name', old.name, 'new_name', new.name, 'status', old.status)
    );
  end if;
  return new;
end;
$$;

-- Creating a product for a seller is an on-behalf action, so it is audited too.
create function private.log_on_behalf_product_create()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is distinct from (select owner_user_id from public.sellers where id = new.seller_id) then
    insert into public.audit_logs (actor_id, action, target_type, target_id, on_behalf_of_seller_id, metadata)
    values (auth.uid(), 'product.create', 'product', new.id::text, new.seller_id, jsonb_build_object('name', new.name));
  end if;
  return new;
end;
$$;

revoke all on function private.prepare_new_product() from public;
revoke all on function private.stamp_product_editor() from public;
revoke all on function private.log_product_edit() from public;
revoke all on function private.log_on_behalf_product_create() from public;

create trigger log_on_behalf_product_create after insert on public.products
  for each row execute function private.log_on_behalf_product_create();

create trigger log_product_edit after update on public.products
  for each row execute function private.log_product_edit();

-- ---------------------------------------------------------------------------
-- Creating the shop when a Seller is approved
-- ---------------------------------------------------------------------------

create or replace function public.approve_role_application(p_application_id uuid, p_permissions text[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_super_admin();
  v_application public.role_applications;
  v_user_role uuid;
  v_seller uuid;
begin
  select * into v_application from public.role_applications
  where id = p_application_id for update;

  if not found or v_application.status <> 'pending' then
    raise exception 'APPLICATION_NOT_PENDING' using errcode = '55000';
  end if;

  perform private.check_admin_permissions(v_application.role_key, p_permissions);

  update public.role_applications
  set status = 'approved', reviewed_by = v_actor, decided_at = now()
  where id = p_application_id;

  insert into public.user_roles (user_id, role_key, status, granted_by, application_id)
  values (v_application.applicant_id, v_application.role_key, 'active', v_actor, p_application_id)
  on conflict (user_id, role_key) do update
    set status = 'active', granted_by = v_actor, application_id = p_application_id, status_reason = null
  returning id into v_user_role;

  delete from public.user_role_permissions where user_role_id = v_user_role;
  insert into public.user_role_permissions (user_role_id, permission_key, granted_by)
  select distinct v_user_role, key, v_actor from unnest(p_permissions) as requested(key);

  -- Approval is separate from identity verification, so every new shop starts
  -- unverified (PRD §4.3). Someone re-approved keeps their existing shop.
  if v_application.role_key = 'seller' then
    insert into public.sellers (owner_user_id, slug, name, city, country, category, description)
    values (
      v_application.applicant_id,
      private.unique_slug(v_application.details ->> 'business_name', 'public.sellers', 'seller'),
      left(btrim(v_application.details ->> 'business_name'), 150),
      left(btrim(v_application.details ->> 'city'), 100),
      'CA',
      v_application.details ->> 'category',
      left(coalesce(v_application.details ->> 'description', ''), 1000)
    )
    on conflict (owner_user_id) do nothing
    returning id into v_seller;

    if v_seller is not null then
      insert into public.seller_private (seller_id, contact_information)
      values (v_seller, v_application.details ->> 'contact_information');
    end if;
  end if;

  perform private.write_audit('role_application.approve', 'role_application', p_application_id::text, null,
    jsonb_build_object('role', v_application.role_key, 'permissions', coalesce(p_permissions, '{}'), 'seller', v_seller));

  return v_user_role;
end;
$$;

-- ---------------------------------------------------------------------------
-- Publishing
-- ---------------------------------------------------------------------------

create function public.publish_product(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_active_account();
  v_product public.products;
  v_seller public.sellers;
  v_verified boolean;
  v_on_behalf boolean;
  v_allowance integer;
  v_used integer;
begin
  select * into v_product from public.products where id = p_product_id and deleted_at is null;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Holding this lock makes publishes for one seller run one at a time, so two at
  -- once cannot both take the last slot of the allowance.
  select * into v_seller from public.sellers where id = v_product.seller_id for update;

  -- Re-read now the lock is held, in case another publish just changed it.
  select * into v_product from public.products where id = p_product_id;

  v_on_behalf := v_seller.owner_user_id <> v_actor;
  if v_on_behalf then
    if not private.has_permission('products.publish_on_behalf') then
      raise exception 'NOT_AUTHORIZED' using errcode = '42501';
    end if;
  elsif not private.is_active_seller_owner(v_seller.id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if v_product.status not in ('draft', 'unpublished') then
    raise exception 'PRODUCT_NOT_PUBLISHABLE' using errcode = '55000';
  end if;
  if not private.setting_is_on('publishing.global_enabled') then
    raise exception 'PUBLISHING_DISABLED' using errcode = '55000';
  end if;
  if v_seller.status <> 'active' or v_seller.publishing_suspended then
    raise exception 'SELLER_PUBLISHING_SUSPENDED' using errcode = '55000';
  end if;
  if btrim(v_product.description) = '' or v_product.category_id is null then
    raise exception 'PRODUCT_INCOMPLETE' using errcode = '23514';
  end if;

  v_verified := v_seller.verification_status in ('provider_verified', 'manually_verified');

  if not private.setting_is_on(case when v_verified then 'publishing.verified_enabled' else 'publishing.unverified_enabled' end) then
    raise exception 'PUBLISHING_DISABLED' using errcode = '55000';
  end if;

  -- Republishing an earlier product costs nothing. A new one costs a slot.
  if not v_verified and not exists (
    select 1 from public.product_publication_ledger where product_id = p_product_id
  ) then
    select coalesce(v_seller.allowance_override, (value #>> '{}')::integer) into v_allowance
    from public.platform_settings where key = 'publishing.unverified_allowance';

    select count(*) into v_used from public.product_publication_ledger where seller_id = v_seller.id;

    if v_used >= coalesce(v_allowance, 0) then
      raise exception 'PUBLISH_ALLOWANCE_EXHAUSTED' using errcode = '55000';
    end if;
  end if;

  insert into public.product_publication_ledger (product_id, seller_id, published_by, seller_was_verified)
  values (p_product_id, v_seller.id, v_actor, v_verified)
  on conflict (product_id) do nothing;

  update public.products
  set status = 'published', first_published_at = coalesce(first_published_at, now())
  where id = p_product_id;

  insert into public.audit_logs (actor_id, action, target_type, target_id, on_behalf_of_seller_id)
  values (v_actor, 'product.publish', 'product', p_product_id::text, case when v_on_behalf then v_seller.id end);
end;
$$;

create function public.unpublish_product(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_active_account();
  v_seller uuid;
  v_owner uuid;
begin
  select p.seller_id, s.owner_user_id into v_seller, v_owner
  from public.products p join public.sellers s on s.id = p.seller_id
  where p.id = p_product_id and p.deleted_at is null;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not (private.is_active_seller_owner(v_seller) or private.has_permission('products.edit_on_behalf')) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  update public.products set status = 'unpublished' where id = p_product_id and status = 'published';
  if not found then
    raise exception 'PRODUCT_NOT_PUBLISHED' using errcode = '55000';
  end if;

  insert into public.audit_logs (actor_id, action, target_type, target_id, on_behalf_of_seller_id)
  values (v_actor, 'product.unpublish', 'product', p_product_id::text, case when v_owner <> v_actor then v_seller end);
end;
$$;

-- A soft delete: the row and its ledger entry stay, so the slot is not given back.
create function public.delete_product(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_active_account();
  v_seller uuid;
  v_owner uuid;
  v_status text;
begin
  select p.seller_id, s.owner_user_id, p.status into v_seller, v_owner, v_status
  from public.products p join public.sellers s on s.id = p.seller_id
  where p.id = p_product_id and p.deleted_at is null;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not (private.is_active_seller_owner(v_seller) or private.has_permission('products.edit_on_behalf')) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  -- Deleting must not be a way around a moderator's suspension.
  if v_status = 'suspended' then
    raise exception 'PRODUCT_SUSPENDED' using errcode = '55000';
  end if;

  update public.products set deleted_at = now(), status = 'archived' where id = p_product_id;

  insert into public.audit_logs (actor_id, action, target_type, target_id, on_behalf_of_seller_id)
  values (v_actor, 'product.delete', 'product', p_product_id::text, case when v_owner <> v_actor then v_seller end);
end;
$$;

-- What a seller's own shop screen shows. The setting itself is not public.
create function public.my_publishing_allowance()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_seller public.sellers;
begin
  select * into v_seller from public.sellers where owner_user_id = auth.uid();
  if not found then
    raise exception 'SELLER_NOT_FOUND' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'verified', v_seller.verification_status in ('provider_verified', 'manually_verified'),
    'used', (select count(*) from public.product_publication_ledger where seller_id = v_seller.id),
    'allowance', coalesce(
      v_seller.allowance_override,
      (select (value #>> '{}')::integer from public.platform_settings where key = 'publishing.unverified_allowance')
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Moderation
-- ---------------------------------------------------------------------------

create function public.suspend_product(p_product_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('products.moderate') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'REASON_REQUIRED' using errcode = '23514';
  end if;
  update public.products set status = 'suspended'
  where id = p_product_id and deleted_at is null and status in ('published', 'unpublished', 'archived');
  if not found then
    raise exception 'PRODUCT_NOT_SUSPENDABLE' using errcode = '55000';
  end if;
  perform private.write_audit('product.suspend', 'product', p_product_id::text, btrim(p_reason));
end;
$$;

-- Restores as unpublished, so the seller or a moderator chooses when it goes live.
create function public.restore_product(p_product_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('products.moderate') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'REASON_REQUIRED' using errcode = '23514';
  end if;
  update public.products set status = 'unpublished' where id = p_product_id and status = 'suspended';
  if not found then
    raise exception 'PRODUCT_NOT_SUSPENDED' using errcode = '55000';
  end if;
  perform private.write_audit('product.restore', 'product', p_product_id::text, btrim(p_reason));
end;
$$;

create function public.set_seller_publishing(p_seller_id uuid, p_suspended boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('sellers.publishing') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'REASON_REQUIRED' using errcode = '23514';
  end if;
  update public.sellers set publishing_suspended = p_suspended where id = p_seller_id;
  if not found then
    raise exception 'SELLER_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.write_audit(
    case when p_suspended then 'seller.publishing_suspend' else 'seller.publishing_restore' end,
    'seller', p_seller_id::text, btrim(p_reason));
end;
$$;

create function public.set_seller_status(p_seller_id uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('sellers.manage') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_status not in ('active', 'suspended') then
    raise exception 'INVALID_STATUS' using errcode = '23514';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'REASON_REQUIRED' using errcode = '23514';
  end if;
  update public.sellers set status = p_status where id = p_seller_id;
  if not found then
    raise exception 'SELLER_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.write_audit('seller.' || p_status, 'seller', p_seller_id::text, btrim(p_reason));
end;
$$;

-- Only Super Admin can give one seller a different allowance (PRD §6.1).
create function public.set_seller_allowance(p_seller_id uuid, p_allowance integer, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  if nullif(btrim(p_reason), '') is null then
    raise exception 'REASON_REQUIRED' using errcode = '23514';
  end if;
  update public.sellers set allowance_override = p_allowance where id = p_seller_id;
  if not found then
    raise exception 'SELLER_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.write_audit('seller.allowance_override', 'seller', p_seller_id::text, btrim(p_reason),
    jsonb_build_object('allowance', p_allowance));
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.sellers enable row level security;
alter table public.seller_private enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_publication_ledger enable row level security;
alter table public.media_assets enable row level security;

grant select on public.sellers, public.seller_private, public.products, public.product_publication_ledger to authenticated;
grant select on public.categories to anon, authenticated;

create policy "anyone reads categories" on public.categories
  for select to anon, authenticated using (true);

-- Owners and managers read the full seller row. The public uses public_sellers.
create policy "owner reads own shop" on public.sellers
  for select to authenticated using (owner_user_id = (select auth.uid()));
create policy "managers read shops" on public.sellers
  for select to authenticated using ((select private.has_permission('sellers.manage')));

-- Column rights keep status, slug, verification and allowance out of a seller's reach.
grant update (name, city, category, description) on public.sellers to authenticated;
create policy "owner edits own shop" on public.sellers
  for update to authenticated
  using (private.is_active_seller_owner(id))
  with check (private.is_active_seller_owner(id));

create policy "owner reads own private details" on public.seller_private
  for select to authenticated
  using (seller_id in (select id from public.sellers where owner_user_id = (select auth.uid())));
create policy "managers read private details" on public.seller_private
  for select to authenticated using ((select private.has_permission('sellers.manage')));

create policy "owner reads own products" on public.products
  for select to authenticated
  using (deleted_at is null and seller_id in (select id from public.sellers where owner_user_id = (select auth.uid())));
create policy "moderators read products" on public.products
  for select to authenticated using ((select private.has_permission('products.moderate')));
create policy "on-behalf editors read products" on public.products
  for select to authenticated using ((select private.has_permission('products.edit_on_behalf')));

-- Column rights keep status, slug, currency and counts out of direct reach. A new
-- product therefore always starts as a draft, priced in CAD (ADR-0005).
grant insert (seller_id, category_id, name, description, price_minor, availability, condition, attributes)
  on public.products to authenticated;
grant update (category_id, name, description, price_minor, availability, condition, attributes)
  on public.products to authenticated;

create policy "owner creates products" on public.products
  for insert to authenticated with check (private.is_active_seller_owner(seller_id));
create policy "on-behalf creators create products" on public.products
  for insert to authenticated with check ((select private.has_permission('products.create_on_behalf')));

create policy "owner edits products" on public.products
  for update to authenticated
  using (deleted_at is null and status in ('draft', 'published', 'unpublished') and private.is_active_seller_owner(seller_id))
  with check (deleted_at is null and status in ('draft', 'published', 'unpublished') and private.is_active_seller_owner(seller_id));
create policy "on-behalf editors edit products" on public.products
  for update to authenticated
  using (deleted_at is null and status in ('draft', 'published', 'unpublished') and (select private.has_permission('products.edit_on_behalf')))
  with check (deleted_at is null and status in ('draft', 'published', 'unpublished') and (select private.has_permission('products.edit_on_behalf')));

create policy "owner reads own ledger" on public.product_publication_ledger
  for select to authenticated
  using (seller_id in (select id from public.sellers where owner_user_id = (select auth.uid())));
create policy "super admin reads ledger" on public.product_publication_ledger
  for select to authenticated using ((select private.is_super_admin()));

-- ---------------------------------------------------------------------------
-- Public views
-- ---------------------------------------------------------------------------

-- These run with their owner's rights so visitors can read approved fields, with no
-- access to the tables beneath. Columns are listed explicitly, so a new private
-- column can never leak. A suspended seller's shop and products disappear from both.
create view public.public_sellers as
  select
    s.id, s.slug, s.name, s.city, s.country, s.category, s.description,
    s.verification_status in ('provider_verified', 'manually_verified') as verified,
    s.created_at
  from public.sellers s
  where s.status = 'active';

create view public.public_products as
  select
    p.id, p.slug, p.name, p.description, p.price_minor, p.currency, p.availability,
    p.condition, p.attributes, p.view_count, p.first_published_at,
    coalesce((
      select jsonb_agg(jsonb_build_object('url', m.secure_url, 'alt', m.alt_text) order by m.display_order)
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

grant select on public.public_sellers, public.public_products to anon, authenticated;

grant execute on function public.publish_product(uuid) to authenticated;
grant execute on function public.my_publishing_allowance() to authenticated;
grant execute on function public.unpublish_product(uuid) to authenticated;
grant execute on function public.delete_product(uuid) to authenticated;
grant execute on function public.suspend_product(uuid, text) to authenticated;
grant execute on function public.restore_product(uuid, text) to authenticated;
grant execute on function public.set_seller_publishing(uuid, boolean, text) to authenticated;
grant execute on function public.set_seller_status(uuid, text, text) to authenticated;
grant execute on function public.set_seller_allowance(uuid, integer, text) to authenticated;
