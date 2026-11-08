-- The dashboard's sidebar and Overview page (owner's redesign, 2026-11-08): everything they
-- show about the signed-in person, in one request. It reads only the caller's own data and
-- uses the same access checks as each screen, so it shows a link only where the screen
-- itself would let them in; the screens and database still decide for themselves.

create function public.my_dashboard()
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
      'shop', v_shop.id is not null and private.is_active_seller_owner(v_shop.id),
      'staff_shops', (select count(*) from public.seller_staff_memberships m join public.sellers s on s.id = m.seller_id
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

revoke execute on function public.my_dashboard() from public, anon;
grant execute on function public.my_dashboard() to authenticated;
