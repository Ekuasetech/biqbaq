-- What the role management screen needs (PRD §3.2, §4.6). The rules protecting Super Admin
-- are unchanged. People are told when their roles change, and the audit log names them.

create function public.admin_list_people(
  p_search text default null,
  p_role text default null,
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  id uuid,
  display_name text,
  email text,
  account_status text,
  roles jsonb,
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
  perform private.require_super_admin();
  return query
    select p.id, p.display_name, u.email::text, p.status,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', r.id, 'role_key', r.role_key, 'status', r.status, 'status_reason', r.status_reason,
          'permissions', coalesce((
            select jsonb_agg(g.permission_key order by g.permission_key)
            from public.user_role_permissions g where g.user_role_id = r.id
          ), '[]'::jsonb)
        ) order by r.created_at, r.id)
        from public.user_roles r where r.user_id = p.id
      ), '[]'::jsonb),
      count(*) over ()
    from public.profiles p
    join auth.users u on u.id = p.id
    where (v_pattern is null or u.email ilike v_pattern or p.display_name ilike v_pattern)
      and (p_role is null or exists (
        select 1 from public.user_roles f where f.user_id = p.id and f.role_key = p_role and f.status <> 'revoked'
      ))
    order by u.email, p.id
    limit greatest(least(coalesce(p_limit, 10), 50), 1)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.assign_role(p_user_id uuid, p_role_key text, p_reason text, p_permissions text[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_super_admin();
  v_user_role uuid;
  v_reason text;
begin
  if p_role_key is null or p_role_key not in ('super_admin', 'admin', 'co_admin', 'marketer') then
    raise exception 'ROLE_NOT_ASSIGNABLE' using errcode = '23514';
  end if;
  v_reason := private.moderation_reason(p_reason);
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.user_roles where user_id = p_user_id and role_key = p_role_key and status <> 'revoked') then
    raise exception 'ROLE_ALREADY_HELD' using errcode = '55000';
  end if;

  perform private.check_admin_permissions(p_role_key, p_permissions);

  insert into public.user_roles (user_id, role_key, status, granted_by, status_reason)
  values (p_user_id, p_role_key, 'active', v_actor, v_reason)
  on conflict (user_id, role_key) do update
    set status = 'active', granted_by = v_actor, status_reason = v_reason
  returning id into v_user_role;

  delete from public.user_role_permissions where user_role_id = v_user_role;
  insert into public.user_role_permissions (user_role_id, permission_key, granted_by)
  select distinct v_user_role, key, v_actor from unnest(p_permissions) as requested(key);

  perform private.write_audit('role.assign', 'user', p_user_id::text, v_reason,
    jsonb_build_object('role', p_role_key, 'permissions', coalesce(p_permissions, '{}')));
  -- The reason for giving a role is a note for the record, so it stays out of the email.
  perform private.enqueue_email(p_user_id, 'role_assigned', jsonb_build_object('role', p_role_key), 'role:' || gen_random_uuid());

  return v_user_role;
end;
$$;

create or replace function public.set_role_status(p_user_role_id uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_super_admin();
  v_current public.user_roles;
  v_reason text;
begin
  if p_status is null or p_status not in ('active', 'suspended', 'revoked') then
    raise exception 'INVALID_STATUS' using errcode = '23514';
  end if;
  v_reason := private.moderation_reason(p_reason);

  select * into v_current from public.user_roles where id = p_user_role_id for update;
  if not found then
    raise exception 'ROLE_ASSIGNMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_current.status = 'revoked' or v_current.status = p_status then
    raise exception 'INVALID_STATUS_CHANGE' using errcode = '55000';
  end if;

  update public.user_roles
  set status = p_status, status_reason = v_reason
  where id = p_user_role_id;

  perform private.write_audit('role.' || p_status, 'user_role', p_user_role_id::text, v_reason,
    jsonb_build_object('role', v_current.role_key, 'user', v_current.user_id, 'actor', v_actor));
  perform private.enqueue_email(
    v_current.user_id,
    case p_status when 'active' then 'role_restored' when 'suspended' then 'role_suspended' else 'role_revoked' end,
    jsonb_build_object('role', v_current.role_key, 'reason', v_reason),
    'role:' || gen_random_uuid()
  );
end;
$$;

-- A removed role cannot be given permissions. It comes back through assign_role, which starts clean.
create or replace function private.require_can_delegate(p_user_role_id uuid, p_permission text)
returns public.user_roles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_target public.user_roles;
  v_permission public.permissions;
begin
  perform private.require_active_account();

  select * into v_target from public.user_roles where id = p_user_role_id;
  if not found then
    raise exception 'ROLE_ASSIGNMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_target.status = 'revoked' then
    raise exception 'ROLE_REVOKED' using errcode = '55000';
  end if;
  if v_target.role_key not in ('admin', 'co_admin') then
    raise exception 'PERMISSIONS_NOT_ALLOWED_FOR_ROLE' using errcode = '23514';
  end if;

  select * into v_permission from public.permissions where key = p_permission and scope = 'platform';
  if not found then
    raise exception 'UNKNOWN_PERMISSION' using errcode = '23514';
  end if;

  if private.is_super_admin() then
    return v_target;
  end if;

  if not private.has_active_role('admin')
    or v_target.role_key <> 'co_admin'
    or not v_permission.is_delegable
    or not private.has_permission(p_permission)
  then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  return v_target;
end;
$$;

create or replace function public.grant_permission(p_user_role_id uuid, p_permission text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.user_roles := private.require_can_delegate(p_user_role_id, p_permission);
begin
  insert into public.user_role_permissions (user_role_id, permission_key, granted_by)
  values (p_user_role_id, p_permission, auth.uid())
  on conflict do nothing;

  -- Only a real change is recorded.
  if found then
    perform private.write_audit('permission.grant', 'user_role', p_user_role_id::text, null,
      jsonb_build_object('permission', p_permission, 'user', v_target.user_id));
  end if;
end;
$$;

create or replace function public.revoke_permission(p_user_role_id uuid, p_permission text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.user_roles := private.require_can_delegate(p_user_role_id, p_permission);
begin
  delete from public.user_role_permissions
  where user_role_id = p_user_role_id and permission_key = p_permission;

  if found then
    perform private.write_audit('permission.revoke', 'user_role', p_user_role_id::text, null,
      jsonb_build_object('permission', p_permission, 'user', v_target.user_id));
  end if;
end;
$$;

create or replace function public.admin_audit_log(
  p_action text default null,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  actor_name text,
  actor_email text,
  action text,
  target_type text,
  target_id text,
  target_label text,
  on_behalf_of_seller text,
  reason text,
  metadata jsonb,
  created_at timestamptz,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- Treats % and _ in a search as ordinary characters, not wildcards.
  v_pattern text := case when nullif(btrim(p_search), '') is null then null else
    '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end;
begin
  perform private.require_super_admin();

  return query
    with rows as (
      select
        a.id, p.display_name as actor_name, u.email::text as actor_email, a.action, a.target_type, a.target_id,
        case a.target_type
          when 'seller' then (select s.name from public.sellers s where s.id::text = a.target_id)
          when 'product' then (select pr.name from public.products pr where pr.id::text = a.target_id)
          when 'role_application' then (
            select ua.email::text from public.role_applications ra
            join auth.users ua on ua.id = ra.applicant_id where ra.id::text = a.target_id
          )
          when 'user' then (select ut.email::text from auth.users ut where ut.id::text = a.target_id)
          when 'user_role' then (
            select ur_email.email::text from public.user_roles ur
            join auth.users ur_email on ur_email.id = ur.user_id where ur.id::text = a.target_id
          )
          else null
        end as target_label,
        b.name as on_behalf_of_seller, a.reason, a.metadata, a.created_at
      from public.audit_logs a
      left join public.profiles p on p.id = a.actor_id
      left join auth.users u on u.id = a.actor_id
      left join public.sellers b on b.id = a.on_behalf_of_seller_id
      where p_action is null or a.action = p_action
    ), matching as (
      select * from rows r
      where v_pattern is null
        or r.actor_name ilike v_pattern or r.actor_email ilike v_pattern or r.action ilike v_pattern
        or r.target_id ilike v_pattern or r.target_label ilike v_pattern or r.reason ilike v_pattern
    )
    select m.id, m.actor_name, m.actor_email, m.action, m.target_type, m.target_id, m.target_label,
      m.on_behalf_of_seller, m.reason, m.metadata, m.created_at, count(*) over ()
    from matching m
    order by m.created_at desc, m.id
    limit greatest(least(coalesce(p_limit, 25), 100), 1)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function private.require_can_delegate(uuid, text) from public;
revoke execute on function public.admin_list_people(text, text, integer, integer) from public, anon;
revoke execute on function public.assign_role(uuid, text, text, text[]) from public, anon;
revoke execute on function public.set_role_status(uuid, text, text) from public, anon;
revoke execute on function public.grant_permission(uuid, text) from public, anon;
revoke execute on function public.revoke_permission(uuid, text) from public, anon;
revoke execute on function public.admin_audit_log(text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_people(text, text, integer, integer) to authenticated;
grant execute on function public.assign_role(uuid, text, text, text[]) to authenticated;
grant execute on function public.set_role_status(uuid, text, text) to authenticated;
grant execute on function public.grant_permission(uuid, text) to authenticated;
grant execute on function public.revoke_permission(uuid, text) to authenticated;
grant execute on function public.admin_audit_log(text, text, integer, integer) to authenticated;
