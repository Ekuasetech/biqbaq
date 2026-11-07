-- Decided by the owner (2026-11-07, Q-32): staff are between a seller and their people, so the
-- seller approves them, and Super Admin no longer does. The flow is invite, accept, then approve.
-- Approving gives the platform role too, so access still needs both the role and the membership,
-- and Super Admin can still end it by suspending or removing that role.

alter table public.seller_staff_memberships drop constraint seller_staff_memberships_status_check;
alter table public.seller_staff_memberships add constraint seller_staff_memberships_status_check
  check (status in ('pending', 'active', 'suspended', 'removed'));
alter table public.seller_staff_memberships alter column status set default 'pending';

-- People who already accepted, but were left waiting with no way forward.
update public.seller_staff_memberships m set status = 'pending'
where m.status = 'active' and not exists (
  select 1 from public.user_roles r where r.user_id = m.user_id and r.role_key = 'seller_staff' and r.status = 'active'
);

-- Nobody applies to Super Admin for this any more. Applications already made can still be decided.
update public.roles set is_assignable_by_application = false where key = 'seller_staff';

create or replace function public.accept_staff_invitation(p_invitation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_active_account();
  v_invitation public.seller_invitations;
  v_membership uuid;
begin
  select * into v_invitation from public.seller_invitations where id = p_invitation for update;
  -- The same answer for an invitation that is someone else's, so none can be probed.
  if not found or v_invitation.invitee_email is distinct from private.my_confirmed_email() then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_invitation.status <> 'pending' or v_invitation.expires_at < now() then
    raise exception 'INVITATION_NOT_PENDING' using errcode = '55000';
  end if;

  -- Accepting gives no access. The seller approves first, including someone coming back.
  insert into public.seller_staff_memberships (seller_id, user_id, status, invited_by)
  values (v_invitation.seller_id, v_user, 'pending', v_invitation.invited_by)
  on conflict (seller_id, user_id) do update set status = 'pending', invited_by = excluded.invited_by
  returning id into v_membership;

  delete from public.seller_staff_permissions where membership_id = v_membership;
  insert into public.seller_staff_permissions (membership_id, permission_key, granted_by)
  select v_membership, k, v_invitation.invited_by from unnest(v_invitation.permissions) k;

  update public.seller_invitations set status = 'accepted' where id = p_invitation;
  perform private.write_audit('staff.invite_accept', 'seller', v_invitation.seller_id::text, null,
    jsonb_build_object('user', v_user, 'permissions', v_invitation.permissions));
end;
$$;

create function public.approve_staff_member(p_membership uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.seller_staff_memberships;
  v_actor uuid;
  v_role public.user_roles;
  v_shop text;
begin
  select * into v_member from public.seller_staff_memberships where id = p_membership for update;
  if not found or v_member.status = 'removed' then
    raise exception 'MEMBERSHIP_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_actor := private.require_staff_manager(v_member.seller_id);
  if v_member.user_id = v_actor then
    raise exception 'CANNOT_CHANGE_OWN_ACCESS' using errcode = '42501';
  end if;
  if v_member.status <> 'pending' then
    raise exception 'INVALID_STATUS_CHANGE' using errcode = '55000';
  end if;

  -- A seller cannot undo Super Admin taking this role away from someone.
  select * into v_role from public.user_roles
  where user_id = v_member.user_id and role_key = 'seller_staff' for update;
  if found and v_role.status <> 'active' then
    raise exception 'STAFF_ROLE_BLOCKED' using errcode = '55000';
  end if;
  if not found then
    insert into public.user_roles (user_id, role_key, status, granted_by, status_reason)
    values (v_member.user_id, 'seller_staff', 'active', v_actor, 'Approved by a seller');
    perform private.write_audit('role.assign', 'user', v_member.user_id::text, 'Approved by a seller',
      jsonb_build_object('role', 'seller_staff', 'seller', v_member.seller_id));
  end if;

  update public.seller_staff_memberships set status = 'active' where id = p_membership;

  select name into v_shop from public.sellers where id = v_member.seller_id;
  perform private.write_audit('staff.approve', 'seller', v_member.seller_id::text, null, jsonb_build_object('user', v_member.user_id));
  perform private.enqueue_email(v_member.user_id, 'staff_approved', jsonb_build_object('shop', v_shop), 'staff:' || gen_random_uuid());
end;
$$;

-- Someone waiting is approved or declined. Suspending and restoring are for people already in.
create or replace function public.set_staff_status(p_membership uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.seller_staff_memberships;
  v_actor uuid;
  v_shop text;
begin
  if p_status is null or p_status not in ('active', 'suspended', 'removed') then
    raise exception 'INVALID_STATUS' using errcode = '23514';
  end if;
  select * into v_member from public.seller_staff_memberships where id = p_membership for update;
  if not found or v_member.status = 'removed' then
    raise exception 'MEMBERSHIP_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_actor := private.require_staff_manager(v_member.seller_id);
  if v_member.user_id = v_actor then
    raise exception 'CANNOT_CHANGE_OWN_ACCESS' using errcode = '42501';
  end if;
  if v_member.status = p_status or (v_member.status = 'pending' and p_status <> 'removed') then
    raise exception 'INVALID_STATUS_CHANGE' using errcode = '55000';
  end if;

  update public.seller_staff_memberships set status = p_status where id = p_membership;
  select name into v_shop from public.sellers where id = v_member.seller_id;
  perform private.write_audit('staff.' || p_status, 'seller', v_member.seller_id::text, null, jsonb_build_object('user', v_member.user_id));
  perform private.enqueue_email(v_member.user_id,
    case p_status when 'active' then 'staff_restored' when 'suspended' then 'staff_suspended' else 'staff_removed' end,
    jsonb_build_object('shop', v_shop), 'staff:' || gen_random_uuid());
end;
$$;

revoke execute on function public.approve_staff_member(uuid) from public, anon;
grant execute on function public.approve_staff_member(uuid) to authenticated;
revoke execute on function public.accept_staff_invitation(uuid) from public, anon;
grant execute on function public.accept_staff_invitation(uuid) to authenticated;
revoke execute on function public.set_staff_status(uuid, text) from public, anon;
grant execute on function public.set_staff_status(uuid, text) to authenticated;
