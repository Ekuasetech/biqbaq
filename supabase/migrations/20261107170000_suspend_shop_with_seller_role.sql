-- Decided by the owner (2026-11-07, Q-31): when a seller is suspended, their shop is suspended
-- too. Removing the role does the same. The trigger covers every way a role can change.

-- Remembers why, so restoring the role only brings back a shop that the role took down.
-- A shop a moderator suspended separately stays suspended.
alter table public.sellers add column suspended_by_role boolean not null default false;

create function private.sync_shop_with_seller_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop uuid;
begin
  if new.status = 'active' then
    update public.sellers set status = 'active', suspended_by_role = false
    where owner_user_id = new.user_id and suspended_by_role
    returning id into v_shop;
    if v_shop is not null then
      perform private.write_audit('seller.active', 'seller', v_shop::text, new.status_reason,
        jsonb_build_object('because', 'seller_role_restored'));
      perform private.enqueue_email(new.user_id, 'shop_restored', jsonb_strip_nulls(jsonb_build_object('reason', new.status_reason)),
        'moderation:' || gen_random_uuid());
    end if;
  else
    update public.sellers set status = 'suspended', suspended_by_role = true
    where owner_user_id = new.user_id and status = 'active'
    returning id into v_shop;
    if v_shop is not null then
      perform private.write_audit('seller.suspended', 'seller', v_shop::text, new.status_reason,
        jsonb_build_object('because', 'seller_role_' || new.status));
      perform private.enqueue_email(new.user_id, 'shop_suspended', jsonb_strip_nulls(jsonb_build_object('reason', new.status_reason)),
        'moderation:' || gen_random_uuid());
    end if;
  end if;
  return null;
end;
$$;

revoke all on function private.sync_shop_with_seller_role() from public;

create trigger sync_shop_with_seller_role after update of status on public.user_roles
  for each row when (new.role_key = 'seller' and old.status is distinct from new.status)
  execute function private.sync_shop_with_seller_role();

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
  -- A shop cannot reopen while its owner's Seller role is suspended or removed.
  if p_status = 'active' and not exists (
    select 1 from public.user_roles where user_id = v_owner and role_key = 'seller' and status = 'active'
  ) then
    raise exception 'SELLER_ROLE_NOT_ACTIVE' using errcode = '55000';
  end if;
  update public.sellers set status = p_status, suspended_by_role = false where id = p_seller_id;
  perform private.write_audit('seller.' || p_status, 'seller', p_seller_id::text, v_reason);
  perform private.enqueue_email(v_owner, case when p_status = 'suspended' then 'shop_suspended' else 'shop_restored' end,
    jsonb_build_object('reason', v_reason), 'moderation:' || gen_random_uuid());
end;
$$;

revoke execute on function public.set_seller_status(uuid, text, text) from public, anon;
