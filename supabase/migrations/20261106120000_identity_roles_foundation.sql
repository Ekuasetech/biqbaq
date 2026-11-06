-- Foundation for accounts, roles and permissions (docs/database-design.md).
--
-- This migration creates the tables and locks them down completely. Clients get
-- no access at all until the security rules arrive in the next migration, so a
-- missing rule can only ever deny access, never leak data.

-- ---------------------------------------------------------------------------
-- Default deny
-- ---------------------------------------------------------------------------

-- Supabase grants new public tables to API roles by default. Remove that, so
-- every future table must grant access explicitly.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

-- Internal functions live here. This schema is not exposed through the API.
create schema private;
revoke all on schema private from public;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create function private.reject_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '55000';
end;
$$;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------

-- There is deliberately no role column here: see user_roles.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 100),
  locale text not null default 'en' check (locale in ('en', 'fr')),
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  status text not null default 'active' check (status in ('active', 'suspended', 'deactivated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Roles and permissions
-- ---------------------------------------------------------------------------

create table public.roles (
  key text primary key,
  name text not null,
  is_assignable_by_application boolean not null default false
);

create table public.permissions (
  key text primary key,
  description text not null,
  -- 'platform' permissions apply across Biqbaq. 'seller' permissions apply only
  -- within one seller's staff membership.
  scope text not null check (scope in ('platform', 'seller')),
  is_delegable boolean not null default false
);

-- Defaults for a role. Admin and Co-admin deliberately have none (PRD §3.3).
create table public.role_permissions (
  role_key text not null references public.roles (key) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_key, permission_key)
);

-- ---------------------------------------------------------------------------
-- Role applications
-- ---------------------------------------------------------------------------

create table public.role_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.profiles (id) on delete cascade,
  role_key text not null references public.roles (key),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  details jsonb not null default '{}'::jsonb,
  reviewed_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rejection_needs_reason check (status <> 'rejected' or rejection_reason is not null),
  constraint decision_needs_date check (status not in ('approved', 'rejected') or decided_at is not null)
);

-- One open application per person and role. Reapplying after a decision is allowed.
create unique index role_applications_one_pending
  on public.role_applications (applicant_id, role_key)
  where status = 'pending';
create index role_applications_status on public.role_applications (status, created_at);

create trigger set_updated_at before update on public.role_applications
  for each row execute function private.set_updated_at();

-- Super Admin and Co-admin can never be applied for, whatever a client sends.
create function private.check_role_is_applicable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.roles
    where key = new.role_key and is_assignable_by_application
  ) then
    raise exception 'role % cannot be applied for', new.role_key using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_role_is_applicable before insert or update of role_key on public.role_applications
  for each row execute function private.check_role_is_applicable();

-- ---------------------------------------------------------------------------
-- Role assignments
-- ---------------------------------------------------------------------------

-- Only a row here with status 'active' gives a role. An application never does.
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_key text not null references public.roles (key),
  status text not null default 'active' check (status in ('active', 'suspended', 'revoked')),
  granted_by uuid references public.profiles (id) on delete set null,
  application_id uuid references public.role_applications (id) on delete set null,
  status_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, role_key)
);

create index user_roles_active on public.user_roles (user_id, role_key) where status = 'active';

create trigger set_updated_at before update on public.user_roles
  for each row execute function private.set_updated_at();

-- Explicit grants hang off an assignment, so suspending the role disables them.
create table public.user_role_permissions (
  user_role_id uuid not null references public.user_roles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_role_id, permission_key)
);

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------

-- Actor and target are plain values, not foreign keys, so that the record of what
-- happened survives even if the account or target is later removed.
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  target_type text,
  target_id text,
  on_behalf_of_seller_id uuid,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_created on public.audit_logs (created_at desc);
create index audit_logs_target on public.audit_logs (target_type, target_id);

create trigger append_only before update or delete on public.audit_logs
  for each row execute function private.reject_change();
create trigger append_only_truncate before truncate on public.audit_logs
  for each statement execute function private.reject_change();

-- ---------------------------------------------------------------------------
-- Platform settings
-- ---------------------------------------------------------------------------

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text not null,
  -- Whether anyone may read this setting, such as the upload size limit.
  is_public boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.platform_settings
  for each row execute function private.set_updated_at();

create table public.platform_settings_history (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  old_value jsonb,
  new_value jsonb not null,
  actor_id uuid,
  reason text,
  created_at timestamptz not null default now()
);

create index platform_settings_history_key on public.platform_settings_history (key, created_at desc);

create trigger append_only before update or delete on public.platform_settings_history
  for each row execute function private.reject_change();
create trigger append_only_truncate before truncate on public.platform_settings_history
  for each statement execute function private.reject_change();

-- ---------------------------------------------------------------------------
-- New accounts
-- ---------------------------------------------------------------------------

-- Creates the profile and Buyer role for each new account. Signup details are
-- untrusted input, and an error here would block all signups, so nothing a client
-- sends may be able to make this fail.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Only plain text counts as a name: other JSON would be stored as literal text.
  requested_name text := nullif(btrim(coalesce(
    case when jsonb_typeof(new.raw_user_meta_data -> 'full_name') = 'string'
      then new.raw_user_meta_data ->> 'full_name' end,
    case when jsonb_typeof(new.raw_user_meta_data -> 'name') = 'string'
      then new.raw_user_meta_data ->> 'name' end,
    ''
  )), '');
  requested_locale text := new.raw_user_meta_data ->> 'locale';
begin
  insert into public.profiles (id, display_name, locale)
  values (
    new.id,
    left(requested_name, 100),
    case when requested_locale in ('en', 'fr') then requested_locale else 'en' end
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role_key)
  values (new.id, 'buyer')
  on conflict (user_id, role_key) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

insert into public.roles (key, name, is_assignable_by_application) values
  ('buyer', 'Buyer', false),
  ('seller', 'Seller', true),
  ('seller_staff', 'Seller Staff', true),
  ('marketer', 'Marketer', true),
  ('admin', 'Admin', true),
  ('co_admin', 'Co-admin', false),
  ('super_admin', 'Super Admin', false);

insert into public.permissions (key, description, scope, is_delegable) values
  ('products.create_on_behalf', 'Create products on behalf of a seller', 'platform', true),
  ('products.edit_on_behalf', 'Edit products on behalf of a seller', 'platform', true),
  ('products.publish_on_behalf', 'Publish products on behalf of a seller', 'platform', true),
  ('products.moderate', 'Moderate product listings', 'platform', true),
  ('sellers.manage', 'Manage and review seller accounts', 'platform', true),
  ('sellers.publishing', 'Suspend or restore seller publishing', 'platform', true),
  ('users.manage', 'Manage user accounts', 'platform', true),
  ('vehicle_listings.moderate', 'Moderate vehicle listings', 'platform', true),
  ('reports.view', 'View platform reports', 'platform', true),
  ('products.create', 'Create products', 'seller', false),
  ('products.edit', 'Edit products', 'seller', false),
  ('products.delete', 'Delete products', 'seller', false),
  ('products.publish', 'Publish products', 'seller', false),
  ('messages.view', 'View customer conversations', 'seller', false),
  ('messages.respond', 'Respond to customers', 'seller', false),
  ('orders.manage', 'Manage orders', 'seller', false),
  ('analytics.view', 'View analytics', 'seller', false),
  ('staff.manage', 'Manage other staff', 'seller', false);

-- Only values the PRD confirms. Unset items, such as image formats, wait for BD-14.
insert into public.platform_settings (key, value, description, is_public) values
  ('publishing.global_enabled', 'true', 'Seller publishing on or off', false),
  ('publishing.verified_enabled', 'true', 'Publishing for verified sellers', false),
  ('publishing.unverified_enabled', 'true', 'Publishing for unverified sellers', false),
  ('publishing.unverified_allowance', '2', 'Products an unverified seller may publish in total', false),
  ('blog.seller_publishing_enabled', 'false', 'Whether sellers may submit blog posts', false),
  ('media.max_image_bytes', '1048576', 'Maximum image upload size in bytes', true);

-- ---------------------------------------------------------------------------
-- Lock everything down
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.role_applications enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_role_permissions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.platform_settings enable row level security;
alter table public.platform_settings_history enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all routines in schema private from public, anon, authenticated;
