-- Products on behalf of a seller (PRD §3.4, §6.3; roadmap item 8). The permissions, the
-- security rules for the products themselves and the audit records were built with the
-- catalogue; this adds what a screen needs, the Super Admin switch PRD §6.3 asks for, and a
-- notice to the seller when something is published for them (owner's choices, 2026-11-18).
--
-- An Admin or Co-admin opens a shop through the screen only with products.edit_on_behalf:
-- without it they could not see its products at all. Creating and publishing need their own
-- permissions as before. The seller's products stay theirs; the person acting is the actor.

insert into public.platform_settings (key, value, description, is_public) values
  ('publishing.on_behalf_enabled', 'true', 'Publishing by Admins and Co-admins on behalf of sellers', false);

-- Whether this person may work on sellers' products as an Admin or Co-admin.
create function private.can_act_for_sellers()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission('products.edit_on_behalf');
$$;
revoke all on function private.can_act_for_sellers() from public;
grant execute on function private.can_act_for_sellers() to authenticated;

create policy "on-behalf admins read shops" on public.sellers
  for select to authenticated using ((select private.can_act_for_sellers()));

-- The shop screen asks what this person may do in a shop. Owners and staff are answered as
-- before; an Admin or Co-admin acting for the seller gets the matching shop permissions and
-- on_behalf, so the screen can say so. A person who is both staff and admin works as staff.
drop function public.shop_access(uuid);
create function public.shop_access(p_seller uuid)
returns table (is_owner boolean, permissions text[], on_behalf boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_active_seller_owner(p_seller),
    case when private.is_active_seller_owner(p_seller)
      then (select array_agg(key order by key) from public.permissions where scope = 'seller')
      else coalesce((
        select array_agg(g.permission_key order by g.permission_key)
        from public.seller_staff_memberships m
        join public.seller_staff_permissions g on g.membership_id = m.id
        where m.seller_id = p_seller and m.user_id = auth.uid() and m.status = 'active'
      ), '{}')
    end,
    false
  where private.is_seller_member(p_seller)
  union all
  select
    false,
    array_remove(array[
      case when private.has_permission('products.create_on_behalf') then 'products.create' end,
      'products.edit',
      case when private.has_permission('products.publish_on_behalf') then 'products.publish' end
    ], null),
    true
  where not private.is_seller_member(p_seller)
    and private.can_act_for_sellers()
    and exists (select 1 from public.sellers where id = p_seller);
$$;
revoke execute on function public.shop_access(uuid) from public, anon;
grant execute on function public.shop_access(uuid) to authenticated;

create or replace function public.shop_publishing_allowance(p_seller uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_seller public.sellers;
begin
  if not (private.is_seller_member(p_seller) or private.can_act_for_sellers()) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  select * into v_seller from public.sellers where id = p_seller;
  if not found then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
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

-- As before, plus: an Admin or Co-admin publishing for a seller needs the Super Admin switch
-- on, and the seller is told (bell, push and email) naming Biqbaq, not the person. Staff
-- publishing for their own shop are unchanged. Every other rule, including the unverified
-- allowance, applies exactly as when the seller publishes.
create or replace function public.publish_product(p_product_id uuid)
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
  v_as_staff boolean := false;
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
    v_as_staff := private.has_seller_permission(v_seller.id, 'products.publish');
    if not (v_as_staff or private.has_permission('products.publish_on_behalf')) then
      raise exception 'NOT_AUTHORIZED' using errcode = '42501';
    end if;
    if not v_as_staff and not private.setting_is_on('publishing.on_behalf_enabled') then
      raise exception 'ON_BEHALF_DISABLED' using errcode = '55000';
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

  if v_on_behalf and not v_as_staff then
    perform private.enqueue_email(
      v_seller.owner_user_id,
      'product_published_for_you',
      jsonb_build_object('product', v_product.name, 'shop', v_seller.name),
      'product_published_for_you:' || p_product_id || ':' || gen_random_uuid()
    );
  end if;
end;
$$;

-- The dashboard's sidebar shows the Shops page to those who can act for sellers.
create or replace function public.my_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_roles text[];
  v_shop public.sellers;
  v_super boolean;
  v_moderation boolean;
  v_today timestamptz := ((now() at time zone 'America/Toronto')::date::timestamp at time zone 'America/Toronto');
  v_month timestamptz := (date_trunc('month', now() at time zone 'America/Toronto') at time zone 'America/Toronto');
  v_list uuid;
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  select coalesce(array_agg(role_key order by role_key), '{}') into v_roles
  from public.user_roles where user_id = v_user and status = 'active';
  v_super := 'super_admin' = any (v_roles);
  select coalesce(bool_or(a.products or a.shops or a.publishing or a.vehicles), false) into v_moderation from public.my_moderation_access() a;
  select * into v_shop from public.sellers where owner_user_id = v_user and status = 'active';

  v_result := jsonb_build_object(
    'name', (select display_name from public.profiles where id = v_user),
    'roles', to_jsonb(v_roles),
    'access', jsonb_build_object(
      'super_admin', v_super,
      'moderation', v_moderation,
      'blog', public.my_blog_access(),
      'ads', public.my_ads_access(),
      'on_behalf', private.can_act_for_sellers(),
      'shop', v_shop.id is not null and private.is_active_seller_owner(v_shop.id),
      'staff_shops', (select count(*) from public.seller_staff_memberships m join public.sellers s on s.id = m.seller_id
        where m.user_id = v_user and m.status = 'active' and s.status = 'active'),
      -- The shops a Co-seller works for, by name, for the sidebar (owner's request, 2026-11-18).
      'staff_shop_list', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name), '[]'::jsonb)
        from public.seller_staff_memberships m join public.sellers s on s.id = m.seller_id
        where m.user_id = v_user and m.status = 'active' and s.status = 'active'),
      'referrals', 'marketer' = any (v_roles) or ('seller' = any (v_roles) and v_shop.id is not null)
    ),
    'counts', jsonb_build_object(
      'unread_conversations', public.unread_conversation_count(),
      'unread_notifications', public.unread_notification_count(),
      'favourites', (select count(*) from public.favourites where user_id = v_user)
    )
  );

  if v_shop.id is not null and private.is_active_seller_owner(v_shop.id) then
    select id into v_list from public.email_lists where seller_id = v_shop.id and enabled;
    v_result := v_result || jsonb_build_object('shop', jsonb_build_object(
      'id', v_shop.id,
      'name', v_shop.name,
      'slug', v_shop.slug,
      'products_live', (select count(*) from public.products where seller_id = v_shop.id and status = 'published' and deleted_at is null),
      'product_views', (select coalesce(sum(view_count), 0) from public.products where seller_id = v_shop.id and deleted_at is null),
      'cargo_live', (select count(*) from public.vehicle_listings where seller_id = v_shop.id and status = 'published' and deleted_at is null),
      'customer_emails', v_list is not null,
      'clients', (select count(*) from public.list_subscribers where list_id = v_list),
      'invoices_month', (select count(*) from public.invoices where list_id = v_list and created_at >= v_month),
      'invoiced_month_minor', (select coalesce(sum(total_minor), 0) from public.invoices where list_id = v_list and kind = 'invoice' and created_at >= v_month)
    ));
  end if;

  if v_super then
    v_result := v_result || jsonb_build_object('admin', jsonb_build_object(
      'pending_applications', (select count(*) from public.role_applications where status = 'pending'),
      'pending_verifications', (select count(*) from public.verification_requests where status = 'pending'),
      'accounts', (select count(*) from public.profiles where status = 'active'),
      'new_accounts_today', (select count(*) from public.profiles where created_at >= v_today),
      'active_shops', (select count(*) from public.sellers where status = 'active')
    ));
  end if;
  return v_result;
end;
$$;
