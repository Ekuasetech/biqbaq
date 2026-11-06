-- Security rules for accounts, roles and permissions (docs/security-architecture.md).
--
-- Clients may read what the policies below allow, and may edit a few safe profile
-- columns. Every other change goes through the functions in this file. Each one
-- checks the caller, makes the change and writes the audit entry in one transaction.
--
-- Error codes: 42501 not allowed, P0002 not found, 23514 invalid input,
-- 55000 not allowed in the current state.

-- ---------------------------------------------------------------------------
-- Authorization helpers
-- ---------------------------------------------------------------------------

grant usage on schema private to anon, authenticated;

-- These read current data rather than the login token, so suspending someone
-- takes effect on their next request (ADR-0003).
create function private.has_active_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles r
    join public.profiles p on p.id = r.user_id
    where r.user_id = auth.uid()
      and r.role_key = p_role
      and r.status = 'active'
      and p.status = 'active'
  );
$$;

create function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_active_role('super_admin');
$$;

create function private.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_super_admin() or exists (
    select 1
    from public.user_roles r
    join public.profiles p on p.id = r.user_id
    where r.user_id = auth.uid()
      and r.status = 'active'
      and p.status = 'active'
      and (
        exists (
          select 1 from public.role_permissions rp
          where rp.role_key = r.role_key and rp.permission_key = p_permission
        )
        or exists (
          select 1 from public.user_role_permissions urp
          where urp.user_role_id = r.id and urp.permission_key = p_permission
        )
      )
  );
$$;

revoke all on function private.has_active_role(text) from public;
revoke all on function private.is_super_admin() from public;
revoke all on function private.has_permission(text) from public;
grant execute on function private.has_active_role(text) to anon, authenticated;
grant execute on function private.is_super_admin() to anon, authenticated;
grant execute on function private.has_permission(text) to anon, authenticated;

create function private.require_active_account()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not exists (
    select 1 from public.profiles where id = v_user and status = 'active'
  ) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return v_user;
end;
$$;

create function private.require_super_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_super_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

create function private.write_audit(
  p_action text,
  p_target_type text,
  p_target_id text,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (actor_id, action, target_type, target_id, reason, metadata)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_reason, p_metadata);
$$;

revoke all on function private.require_active_account() from public;
revoke all on function private.require_super_admin() from public;
revoke all on function private.write_audit(text, text, text, text, jsonb) from public;

-- ---------------------------------------------------------------------------
-- Protecting Super Admin
-- ---------------------------------------------------------------------------

-- A safety net beneath the functions below, covering any direct database change.
create function private.protect_super_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grants boolean := tg_op <> 'DELETE' and new.role_key = 'super_admin' and new.status = 'active'
    and (tg_op = 'INSERT' or old.status <> 'active' or old.role_key <> 'super_admin');
  v_removes boolean := tg_op <> 'INSERT' and old.role_key = 'super_admin' and old.status = 'active'
    and (tg_op = 'DELETE' or new.status <> 'active' or new.role_key <> 'super_admin');
begin
  if v_grants and not private.is_super_admin() and exists (
    select 1 from public.user_roles where role_key = 'super_admin' and status = 'active'
  ) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if v_removes then
    -- Locking the remaining rows stops two simultaneous removals both succeeding.
    perform 1 from public.user_roles
      where role_key = 'super_admin' and status = 'active' for update;
    if not exists (
      select 1 from public.user_roles
      where role_key = 'super_admin' and status = 'active' and id <> old.id
    ) then
      raise exception 'LAST_SUPER_ADMIN' using errcode = '55000';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.protect_super_admin() from public;

create trigger protect_super_admin before insert or update or delete on public.user_roles
  for each row execute function private.protect_super_admin();

-- Suspending the last Super Admin's account would have the same effect.
create function private.protect_last_super_admin_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'active' and new.status <> 'active'
    and exists (
      select 1 from public.user_roles
      where user_id = old.id and role_key = 'super_admin' and status = 'active'
    )
    and not exists (
      select 1 from public.user_roles r
      join public.profiles p on p.id = r.user_id
      where r.role_key = 'super_admin' and r.status = 'active'
        and p.status = 'active' and r.user_id <> old.id
    )
  then
    raise exception 'LAST_SUPER_ADMIN' using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_last_super_admin_account() from public;

create trigger protect_last_super_admin_account before update of status on public.profiles
  for each row execute function private.protect_last_super_admin_account();

-- Creates the first Super Admin (Q-02). API roles cannot run this: it is run once,
-- from a trusted database connection, and refuses to run if one already exists.
create function private.bootstrap_super_admin(p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if exists (select 1 from public.user_roles where role_key = 'super_admin') then
    raise exception 'SUPER_ADMIN_EXISTS' using errcode = '55000';
  end if;

  select id into v_user from auth.users where lower(email) = lower(p_email);
  if v_user is null then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.user_roles (user_id, role_key, status_reason)
  values (v_user, 'super_admin', 'First Super Admin');

  insert into public.audit_logs (actor_id, action, target_type, target_id, reason)
  values (null, 'role.bootstrap', 'user', v_user::text, 'First Super Admin');

  return v_user;
end;
$$;

revoke all on function private.bootstrap_super_admin(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row level security: what each person can read
-- ---------------------------------------------------------------------------

grant select on public.profiles to authenticated;
grant update (display_name, locale, theme) on public.profiles to authenticated;

create policy "read own profile" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));
create policy "people managers read profiles" on public.profiles
  for select to authenticated
  using ((select private.has_permission('users.manage')));
create policy "edit own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and status = 'active')
  with check (id = (select auth.uid()));

grant select on public.roles, public.permissions, public.role_permissions to authenticated;

create policy "signed-in users read roles" on public.roles
  for select to authenticated using (true);
create policy "signed-in users read permissions" on public.permissions
  for select to authenticated using (true);
create policy "signed-in users read role defaults" on public.role_permissions
  for select to authenticated using (true);

grant select on public.user_roles, public.user_role_permissions, public.role_applications to authenticated;

create policy "read own roles" on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy "super admin reads roles" on public.user_roles
  for select to authenticated
  using ((select private.is_super_admin()));

create policy "read own granted permissions" on public.user_role_permissions
  for select to authenticated
  using (user_role_id in (select id from public.user_roles where user_id = (select auth.uid())));
create policy "super admin reads granted permissions" on public.user_role_permissions
  for select to authenticated
  using ((select private.is_super_admin()));

create policy "read own applications" on public.role_applications
  for select to authenticated
  using (applicant_id = (select auth.uid()));
create policy "super admin reads applications" on public.role_applications
  for select to authenticated
  using ((select private.is_super_admin()));

grant select on public.audit_logs, public.platform_settings, public.platform_settings_history to authenticated;

create policy "super admin reads audit log" on public.audit_logs
  for select to authenticated
  using ((select private.is_super_admin()));
create policy "super admin reads settings" on public.platform_settings
  for select to authenticated
  using ((select private.is_super_admin()));
create policy "super admin reads settings history" on public.platform_settings_history
  for select to authenticated
  using ((select private.is_super_admin()));

-- Runs with its owner's rights so visitors can read these columns of public
-- settings, while having no access to the table itself.
create view public.public_platform_settings as
  select key, value from public.platform_settings where is_public;

grant select on public.public_platform_settings to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Role applications
-- ---------------------------------------------------------------------------

-- The fields required for each role (BD-17, PRD §4.3). They live in details as
-- JSON, so they can change without changing the table.
create function private.validate_application_details(p_role text, p_details jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_required text[] := case p_role
    when 'seller' then array['business_name', 'contact_information', 'city', 'country', 'description', 'category']
    when 'seller_staff' then array['seller_name']
    when 'admin' then array['reason']
    when 'marketer' then array['reason']
    else array[]::text[]
  end;
  v_field text;
begin
  if p_details is null or jsonb_typeof(p_details) <> 'object' or pg_column_size(p_details) > 10000 then
    raise exception 'APPLICATION_DETAILS_INVALID' using errcode = '23514';
  end if;

  foreach v_field in array v_required loop
    if jsonb_typeof(p_details -> v_field) is distinct from 'string'
      or btrim(p_details ->> v_field) = ''
    then
      raise exception 'APPLICATION_DETAILS_INVALID' using errcode = '23514', detail = v_field;
    end if;
  end loop;

  -- Sellers must be based in Canada for now (ADR-0005).
  if p_role = 'seller' and p_details ->> 'country' <> 'CA' then
    raise exception 'SELLER_MUST_BE_IN_CANADA' using errcode = '23514', detail = 'country';
  end if;
end;
$$;

revoke all on function private.validate_application_details(text, jsonb) from public;

create function public.submit_role_application(p_role_key text, p_details jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_active_account();
  v_id uuid;
begin
  if not exists (
    select 1 from public.roles where key = p_role_key and is_assignable_by_application
  ) then
    raise exception 'ROLE_NOT_APPLICABLE' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.user_roles
    where user_id = v_user and role_key = p_role_key and status in ('active', 'suspended')
  ) then
    raise exception 'ROLE_ALREADY_HELD' using errcode = '55000';
  end if;

  perform private.validate_application_details(p_role_key, p_details);

  -- The unique index turns a second open application into an error (23505).
  insert into public.role_applications (applicant_id, role_key, details)
  values (v_user, p_role_key, p_details)
  returning id into v_id;

  perform private.write_audit('role_application.submit', 'role_application', v_id::text, null,
    jsonb_build_object('role', p_role_key));

  return v_id;
end;
$$;

create function public.withdraw_role_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_active_account();
begin
  update public.role_applications
  set status = 'withdrawn', decided_at = now()
  where id = p_application_id and applicant_id = v_user and status = 'pending';

  if not found then
    -- The same answer whether it is someone else's, decided or missing.
    raise exception 'APPLICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform private.write_audit('role_application.withdraw', 'role_application', p_application_id::text);
end;
$$;

create function public.reject_role_application(p_application_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_super_admin();
begin
  if nullif(btrim(p_reason), '') is null then
    raise exception 'REASON_REQUIRED' using errcode = '23514';
  end if;

  update public.role_applications
  set status = 'rejected', reviewed_by = v_actor, decided_at = now(), rejection_reason = btrim(p_reason)
  where id = p_application_id and status = 'pending';

  if not found then
    raise exception 'APPLICATION_NOT_PENDING' using errcode = '55000';
  end if;

  perform private.write_audit('role_application.reject', 'role_application', p_application_id::text, btrim(p_reason));
end;
$$;

-- Platform permissions are only for Admin, and only ones that exist and apply here.
create function private.check_admin_permissions(p_role text, p_permissions text[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(cardinality(p_permissions), 0) = 0 then
    return;
  end if;
  if p_role not in ('admin', 'co_admin') then
    raise exception 'PERMISSIONS_NOT_ALLOWED_FOR_ROLE' using errcode = '23514';
  end if;
  if exists (
    select 1 from unnest(p_permissions) as requested(key)
    where not exists (
      select 1 from public.permissions p where p.key = requested.key and p.scope = 'platform'
    )
  ) then
    raise exception 'UNKNOWN_PERMISSION' using errcode = '23514';
  end if;
end;
$$;

revoke all on function private.check_admin_permissions(text, text[]) from public;

-- Approving activates the role. Seller Staff still gets no access to any seller
-- without a seller's own membership (PRD §3.6). Creating the seller record for a
-- Seller, and the referral code for a Marketer, arrive with those tables.
create function public.approve_role_application(p_application_id uuid, p_permissions text[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_super_admin();
  v_application public.role_applications;
  v_user_role uuid;
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

  -- Starts clean, so an earlier approval's permissions never carry over.
  delete from public.user_role_permissions where user_role_id = v_user_role;
  insert into public.user_role_permissions (user_role_id, permission_key, granted_by)
  select distinct v_user_role, key, v_actor from unnest(p_permissions) as requested(key);

  perform private.write_audit('role_application.approve', 'role_application', p_application_id::text, null,
    jsonb_build_object('role', v_application.role_key, 'permissions', coalesce(p_permissions, '{}')));

  return v_user_role;
end;
$$;

-- ---------------------------------------------------------------------------
-- Managing assignments
-- ---------------------------------------------------------------------------

-- Roles Super Admin may give directly: Co-admin and further Super Admins have no
-- application route (Q-01, Q-02), Admin may be nominated, and Marketer may be
-- created manually. Seller needs its seller record, so it uses an application.
create function public.assign_role(p_user_id uuid, p_role_key text, p_reason text, p_permissions text[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_super_admin();
  v_user_role uuid;
begin
  if p_role_key not in ('super_admin', 'admin', 'co_admin', 'marketer') then
    raise exception 'ROLE_NOT_ASSIGNABLE' using errcode = '23514';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'REASON_REQUIRED' using errcode = '23514';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform private.check_admin_permissions(p_role_key, p_permissions);

  insert into public.user_roles (user_id, role_key, status, granted_by, status_reason)
  values (p_user_id, p_role_key, 'active', v_actor, btrim(p_reason))
  on conflict (user_id, role_key) do update
    set status = 'active', granted_by = v_actor, status_reason = btrim(p_reason)
  returning id into v_user_role;

  delete from public.user_role_permissions where user_role_id = v_user_role;
  insert into public.user_role_permissions (user_role_id, permission_key, granted_by)
  select distinct v_user_role, key, v_actor from unnest(p_permissions) as requested(key);

  perform private.write_audit('role.assign', 'user', p_user_id::text, btrim(p_reason),
    jsonb_build_object('role', p_role_key, 'permissions', coalesce(p_permissions, '{}')));

  return v_user_role;
end;
$$;

-- active <-> suspended, and active or suspended -> revoked. Revoked is final: a
-- person comes back through a new application or assignment. History is kept.
create function public.set_role_status(p_user_role_id uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_super_admin();
  v_current public.user_roles;
begin
  if p_status not in ('active', 'suspended', 'revoked') then
    raise exception 'INVALID_STATUS' using errcode = '23514';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'REASON_REQUIRED' using errcode = '23514';
  end if;

  select * into v_current from public.user_roles where id = p_user_role_id for update;
  if not found then
    raise exception 'ROLE_ASSIGNMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_current.status = 'revoked' or v_current.status = p_status then
    raise exception 'INVALID_STATUS_CHANGE' using errcode = '55000';
  end if;

  update public.user_roles
  set status = p_status, status_reason = btrim(p_reason)
  where id = p_user_role_id;

  perform private.write_audit('role.' || p_status, 'user_role', p_user_role_id::text, btrim(p_reason),
    jsonb_build_object('role', v_current.role_key, 'user', v_current.user_id, 'actor', v_actor));
end;
$$;

-- Who may change a person's permissions. Super Admin may for Admins and Co-admins.
-- An Admin may only for Co-admins, and only with delegable permissions they hold
-- themselves, so nobody can pass on more power than they have (BD-09).
create function private.require_can_delegate(p_user_role_id uuid, p_permission text)
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

revoke all on function private.require_can_delegate(uuid, text) from public;

create function public.grant_permission(p_user_role_id uuid, p_permission text)
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

  perform private.write_audit('permission.grant', 'user_role', p_user_role_id::text, null,
    jsonb_build_object('permission', p_permission, 'user', v_target.user_id));
end;
$$;

create function public.revoke_permission(p_user_role_id uuid, p_permission text)
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

  perform private.write_audit('permission.revoke', 'user_role', p_user_role_id::text, null,
    jsonb_build_object('permission', p_permission, 'user', v_target.user_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Platform settings
-- ---------------------------------------------------------------------------

create function public.update_platform_setting(p_key text, p_value jsonb, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_super_admin();
  v_old jsonb;
begin
  select value into v_old from public.platform_settings where key = p_key for update;
  if not found then
    raise exception 'SETTING_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_value is null or jsonb_typeof(p_value) <> jsonb_typeof(v_old) then
    raise exception 'SETTING_WRONG_TYPE' using errcode = '23514';
  end if;
  if jsonb_typeof(p_value) = 'number' and (
    (p_value #>> '{}')::numeric < 0
    or (p_value #>> '{}')::numeric <> trunc((p_value #>> '{}')::numeric)
  ) then
    raise exception 'SETTING_OUT_OF_RANGE' using errcode = '23514';
  end if;

  update public.platform_settings
  set value = p_value, updated_by = v_actor
  where key = p_key;

  insert into public.platform_settings_history (key, old_value, new_value, actor_id, reason)
  values (p_key, v_old, p_value, v_actor, p_reason);

  perform private.write_audit('setting.update', 'platform_setting', p_key, p_reason,
    jsonb_build_object('old', v_old, 'new', p_value));
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may call the functions above
-- ---------------------------------------------------------------------------

grant execute on function public.submit_role_application(text, jsonb) to authenticated;
grant execute on function public.withdraw_role_application(uuid) to authenticated;
grant execute on function public.reject_role_application(uuid, text) to authenticated;
grant execute on function public.approve_role_application(uuid, text[]) to authenticated;
grant execute on function public.assign_role(uuid, text, text, text[]) to authenticated;
grant execute on function public.set_role_status(uuid, text, text) to authenticated;
grant execute on function public.grant_permission(uuid, text) to authenticated;
grant execute on function public.revoke_permission(uuid, text) to authenticated;
grant execute on function public.update_platform_setting(text, jsonb, text) to authenticated;
