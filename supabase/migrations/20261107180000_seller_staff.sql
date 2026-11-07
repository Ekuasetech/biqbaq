-- Seller staff (PRD §3.6). Each seller decides what each of their staff can do (BD-08). Access
-- needs both gates: the Seller Staff role approved by Super Admin, and an active membership of
-- this seller. Either one being taken away ends access on its own.

insert into public.platform_settings (key, value, description, is_public) values
  ('staff.max_invitations_per_hour', '10', 'Most staff invitations one shop may send in an hour', false);

-- No secret link: an invitation is claimed by signing in with its confirmed email address,
-- so forwarding the email gives nobody access.
create table public.seller_invitations (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers (id) on delete cascade,
  invitee_email text not null check (invitee_email = lower(invitee_email) and char_length(invitee_email) <= 254),
  permissions text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index seller_invitations_one_pending on public.seller_invitations (seller_id, invitee_email) where status = 'pending';
create index seller_invitations_invitee on public.seller_invitations (invitee_email) where status = 'pending';

create table public.seller_staff_memberships (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'suspended', 'removed')),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_id, user_id)
);

create index seller_staff_memberships_user on public.seller_staff_memberships (user_id) where status = 'active';

create table public.seller_staff_permissions (
  membership_id uuid not null references public.seller_staff_memberships (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (membership_id, permission_key)
);

create trigger set_updated_at before update on public.seller_invitations
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.seller_staff_memberships
  for each row execute function private.set_updated_at();

-- Reached only through the functions below, which check who is asking.
alter table public.seller_invitations enable row level security;
alter table public.seller_staff_memberships enable row level security;
alter table public.seller_staff_permissions enable row level security;
revoke all on public.seller_invitations, public.seller_staff_memberships, public.seller_staff_permissions from public, anon, authenticated;

-- The two gates, in one place.
create function private.is_seller_member(p_seller uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_seller_owner(p_seller) or (
    private.has_active_role('seller_staff') and exists (
      select 1 from public.seller_staff_memberships m
      join public.sellers s on s.id = m.seller_id
      where m.seller_id = p_seller and m.user_id = auth.uid() and m.status = 'active' and s.status = 'active'
    )
  );
$$;

create function private.has_seller_permission(p_seller uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_seller_owner(p_seller) or (
    private.has_active_role('seller_staff') and exists (
      select 1 from public.seller_staff_memberships m
      join public.sellers s on s.id = m.seller_id
      join public.seller_staff_permissions g on g.membership_id = m.id
      where m.seller_id = p_seller and m.user_id = auth.uid() and m.status = 'active' and s.status = 'active'
        and g.permission_key = p_permission
    )
  );
$$;

revoke all on function private.is_seller_member(uuid) from public;
revoke all on function private.has_seller_permission(uuid, text) from public;
grant execute on function private.is_seller_member(uuid) to authenticated;
grant execute on function private.has_seller_permission(uuid, text) to authenticated;

-- What staff can reach. They read the shop's products and manage only what they were given.
-- Private contact details, verification and shop details stay with the owner.
create policy "staff read their shop" on public.sellers
  for select to authenticated using (private.is_seller_member(id));
create policy "staff read their shop's products" on public.products
  for select to authenticated using (deleted_at is null and private.is_seller_member(seller_id));
create policy "staff create products" on public.products
  for insert to authenticated with check (private.has_seller_permission(seller_id, 'products.create'));
create policy "staff edit products" on public.products
  for update to authenticated
  using (deleted_at is null and status in ('draft', 'published', 'unpublished') and private.has_seller_permission(seller_id, 'products.edit'))
  with check (deleted_at is null and status in ('draft', 'published', 'unpublished') and private.has_seller_permission(seller_id, 'products.edit'));

-- Staff act for the seller, so these keep recording owner and actor separately.
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
    if not (private.has_permission('products.publish_on_behalf') or private.has_seller_permission(v_seller.id, 'products.publish')) then
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

create or replace function public.unpublish_product(p_product_id uuid)
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
  if not (private.is_active_seller_owner(v_seller) or private.has_permission('products.edit_on_behalf')
    or private.has_seller_permission(v_seller, 'products.publish')) then
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

create or replace function public.delete_product(p_product_id uuid)
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
  if not (private.is_active_seller_owner(v_seller) or private.has_permission('products.edit_on_behalf')
    or private.has_seller_permission(v_seller, 'products.delete')) then
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

create or replace function private.require_product_images_editable(p_product_id uuid)
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
  if not (private.is_active_seller_owner(v_product.seller_id) or private.has_permission('products.edit_on_behalf')
    or private.has_seller_permission(v_product.seller_id, 'products.edit')) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if v_product.status not in ('draft', 'published', 'unpublished') then
    raise exception 'PRODUCT_NOT_EDITABLE' using errcode = '55000';
  end if;
  return v_product;
end;
$$;

-- An invitation can go to someone with no account yet, so only then does a job carry the
-- address itself. The invitation already holds it, and only the server can read either.
create or replace function public.claim_email_jobs(p_limit integer default 10)
returns table (
  job_id uuid,
  template text,
  data jsonb,
  recipient_email text,
  recipient_name text,
  recipient_locale text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.setting_is_on('email.notifications_enabled') then
    return;
  end if;

  -- A worker that stopped mid-send has used this attempt. Out of attempts means stop here.
  update public.background_jobs b
  set status = 'dead', last_error = 'WORKER_STOPPED', locked_until = null
  where b.type = 'email' and b.status = 'running' and b.locked_until < now() and b.attempts >= b.max_attempts;

  return query
  with ready as (
    select b.id from public.background_jobs b
    where b.type = 'email'
      and ((b.status in ('queued', 'failed') and b.run_at <= now()) or (b.status = 'running' and b.locked_until < now()))
    order by b.run_at
    limit greatest(least(coalesce(p_limit, 10), 50), 1)
    for update skip locked
  ), claimed as (
    update public.background_jobs b
    set status = 'running', attempts = b.attempts + 1, locked_until = now() + interval '5 minutes'
    from ready
    where b.id = ready.id
    returning b.id, b.user_id, b.payload
  )
  select c.id, c.payload ->> 'template', c.payload -> 'data', coalesce(u.email::text, c.payload ->> 'to'), p.display_name, p.locale
  from claimed c
  left join auth.users u on u.id = c.user_id
  left join public.profiles p on p.id = c.user_id;
end;
$$;

create or replace function private.setting_value_is_valid(p_key text, p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_min numeric;
  v_max numeric;
begin
  if p_key = 'media.allowed_formats' then
    return jsonb_array_length(p_value) > 0
      and (select count(*) = count(distinct f) and bool_and(f in ('jpg', 'png', 'webp'))
           from jsonb_array_elements_text(p_value) f);
  end if;

  if jsonb_typeof(p_value) <> 'number' then
    return true;
  end if;

  select r.lo, r.hi into v_min, v_max from (values
    ('publishing.unverified_allowance', 0, 1000),
    ('contact.max_per_ip_hour', 1, 1000),
    ('contact.max_per_email_hour', 1, 1000),
    ('contact.max_per_seller_hour', 1, 100000),
    ('media.max_image_bytes', 102400, 10485760),
    ('media.max_dimension', 500, 10000),
    ('media.max_images', 1, 20),
    ('staff.max_invitations_per_hour', 1, 100)
  ) as r (k, lo, hi) where r.k = p_key;

  -- A number with no limits listed here is refused, so a new one has to be given some.
  return v_min is not null
    and (p_value #>> '{}')::numeric between v_min and v_max
    and (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric);
end;
$$;

create function private.require_staff_manager(p_seller uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_active_account();
begin
  if not private.has_seller_permission(p_seller, 'staff.manage') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return v_user;
end;
$$;

-- Nobody can pass on more than they hold, and only seller permissions apply here.
create function private.check_staff_permissions(p_seller uuid, p_permissions text[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  foreach v_key in array coalesce(p_permissions, '{}') loop
    if not exists (select 1 from public.permissions where key = v_key and scope = 'seller') then
      raise exception 'UNKNOWN_PERMISSION' using errcode = '23514';
    end if;
    if not private.has_seller_permission(p_seller, v_key) then
      raise exception 'NOT_AUTHORIZED' using errcode = '42501';
    end if;
  end loop;
end;
$$;

revoke all on function private.require_staff_manager(uuid) from public;
revoke all on function private.check_staff_permissions(uuid, text[]) from public;

create function public.shop_access(p_seller uuid)
returns table (is_owner boolean, permissions text[])
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
    end
  where private.is_seller_member(p_seller);
$$;

create function public.shop_publishing_allowance(p_seller uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_seller public.sellers;
begin
  if not private.is_seller_member(p_seller) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  select * into v_seller from public.sellers where id = p_seller;
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

create function public.invite_staff(p_seller uuid, p_email text, p_permissions text[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff_manager(p_seller);
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user uuid;
  v_shop text;
  v_owner uuid;
  v_invitation uuid;
begin
  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'EMAIL_INVALID' using errcode = '23514';
  end if;
  perform private.check_staff_permissions(p_seller, p_permissions);

  select name, owner_user_id into v_shop, v_owner from public.sellers where id = p_seller;
  select id into v_user from auth.users where lower(email) = v_email;
  if v_user = v_owner then
    raise exception 'CANNOT_INVITE_OWNER' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.seller_staff_memberships
    where seller_id = p_seller and user_id = v_user and status <> 'removed'
  ) then
    raise exception 'ALREADY_STAFF' using errcode = '55000';
  end if;

  update public.seller_invitations set status = 'expired'
  where seller_id = p_seller and invitee_email = v_email and status = 'pending' and expires_at < now();
  if exists (select 1 from public.seller_invitations where seller_id = p_seller and invitee_email = v_email and status = 'pending') then
    raise exception 'INVITATION_PENDING' using errcode = '55000';
  end if;

  -- Invitations email strangers, so a shop cannot send them without limit.
  perform private.hit_rate_limit('staff_invite:' || p_seller, 'staff.max_invitations_per_hour');

  insert into public.seller_invitations (seller_id, invitee_email, permissions, invited_by)
  values (p_seller, v_email, (select coalesce(array_agg(distinct k), '{}') from unnest(p_permissions) k), v_actor)
  returning id into v_invitation;

  perform private.write_audit('staff.invite', 'seller', p_seller::text, null,
    jsonb_build_object('email', v_email, 'permissions', coalesce(p_permissions, '{}')));

  if private.setting_is_on('email.notifications_enabled') then
    insert into public.background_jobs (type, user_id, payload, idempotency_key)
    values ('email', v_user,
      jsonb_build_object('template', 'staff_invitation', 'data', jsonb_build_object('shop', v_shop))
        || case when v_user is null then jsonb_build_object('to', v_email) else '{}'::jsonb end,
      'staff_invite:' || v_invitation);
  end if;
  return v_invitation;
end;
$$;

create function public.cancel_staff_invitation(p_invitation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seller uuid;
  v_email text;
begin
  select seller_id, invitee_email into v_seller, v_email from public.seller_invitations where id = p_invitation for update;
  if not found then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_staff_manager(v_seller);
  update public.seller_invitations set status = 'cancelled' where id = p_invitation and status = 'pending';
  if not found then
    raise exception 'INVITATION_NOT_PENDING' using errcode = '55000';
  end if;
  perform private.write_audit('staff.invite_cancel', 'seller', v_seller::text, null, jsonb_build_object('email', v_email));
end;
$$;

create function public.shop_staff(p_seller uuid)
returns table (
  membership_id uuid,
  display_name text,
  email text,
  status text,
  role_active boolean,
  permissions text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_staff_manager(p_seller);
  return query
    select m.id, p.display_name, u.email::text, m.status,
      exists (select 1 from public.user_roles r where r.user_id = m.user_id and r.role_key = 'seller_staff' and r.status = 'active'),
      coalesce((select array_agg(g.permission_key order by g.permission_key) from public.seller_staff_permissions g where g.membership_id = m.id), '{}')
    from public.seller_staff_memberships m
    join public.profiles p on p.id = m.user_id
    join auth.users u on u.id = m.user_id
    where m.seller_id = p_seller and m.status <> 'removed'
    order by u.email;
end;
$$;

create function public.shop_invitations(p_seller uuid)
returns table (id uuid, email text, permissions text[], expires_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_staff_manager(p_seller);
  return query
    select i.id, i.invitee_email, i.permissions, i.expires_at
    from public.seller_invitations i
    where i.seller_id = p_seller and i.status = 'pending' and i.expires_at >= now()
    order by i.created_at desc;
end;
$$;

-- Only someone who has proved they own the address can see or accept what was sent to it.
create function private.my_confirmed_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(email) from auth.users where id = auth.uid() and email_confirmed_at is not null;
$$;

revoke all on function private.my_confirmed_email() from public;

create function public.my_staff_invitations()
returns table (id uuid, shop_name text, permissions text[], expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, s.name, i.permissions, i.expires_at
  from public.seller_invitations i
  join public.sellers s on s.id = i.seller_id
  where i.invitee_email = private.my_confirmed_email() and i.status = 'pending' and i.expires_at >= now()
  order by i.created_at desc;
$$;

create function public.accept_staff_invitation(p_invitation uuid)
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

  insert into public.seller_staff_memberships (seller_id, user_id, status, invited_by)
  values (v_invitation.seller_id, v_user, 'active', v_invitation.invited_by)
  on conflict (seller_id, user_id) do update set status = 'active', invited_by = excluded.invited_by
  returning id into v_membership;

  -- Someone who was removed and comes back gets only what this invitation offers.
  delete from public.seller_staff_permissions where membership_id = v_membership;
  insert into public.seller_staff_permissions (membership_id, permission_key, granted_by)
  select v_membership, k, v_invitation.invited_by from unnest(v_invitation.permissions) k;

  update public.seller_invitations set status = 'accepted' where id = p_invitation;
  perform private.write_audit('staff.invite_accept', 'seller', v_invitation.seller_id::text, null,
    jsonb_build_object('user', v_user, 'permissions', v_invitation.permissions));
end;
$$;

create function public.decline_staff_invitation(p_invitation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.seller_invitations;
begin
  perform private.require_active_account();
  select * into v_invitation from public.seller_invitations where id = p_invitation for update;
  if not found or v_invitation.invitee_email is distinct from private.my_confirmed_email() then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_invitation.status <> 'pending' then
    raise exception 'INVITATION_NOT_PENDING' using errcode = '55000';
  end if;
  update public.seller_invitations set status = 'declined' where id = p_invitation;
  perform private.write_audit('staff.invite_decline', 'seller', v_invitation.seller_id::text, null,
    jsonb_build_object('email', v_invitation.invitee_email));
end;
$$;

create function public.my_staff_shops()
returns table (
  membership_id uuid,
  seller_id uuid,
  shop_name text,
  status text,
  shop_active boolean,
  role_active boolean,
  permissions text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, s.id, s.name, m.status, s.status = 'active',
    private.has_active_role('seller_staff'),
    coalesce((select array_agg(g.permission_key order by g.permission_key) from public.seller_staff_permissions g where g.membership_id = m.id), '{}')
  from public.seller_staff_memberships m
  join public.sellers s on s.id = m.seller_id
  where m.user_id = auth.uid() and m.status <> 'removed'
  order by s.name;
$$;

create function public.set_staff_permissions(p_membership uuid, p_permissions text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.seller_staff_memberships;
  v_actor uuid;
  v_key text;
  v_old text[];
  v_new text[] := (select coalesce(array_agg(distinct k), '{}') from unnest(coalesce(p_permissions, '{}')) k);
begin
  select * into v_member from public.seller_staff_memberships where id = p_membership for update;
  if not found or v_member.status = 'removed' then
    raise exception 'MEMBERSHIP_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_actor := private.require_staff_manager(v_member.seller_id);
  if v_member.user_id = v_actor then
    raise exception 'CANNOT_CHANGE_OWN_ACCESS' using errcode = '42501';
  end if;

  select coalesce(array_agg(permission_key order by permission_key), '{}') into v_old
  from public.seller_staff_permissions where membership_id = p_membership;

  -- Adding or taking away, a manager can only touch permissions they hold themselves.
  foreach v_key in array (select coalesce(array_agg(k), '{}') from (
    select unnest(v_new) as k except select unnest(v_old) union all (select unnest(v_old) except select unnest(v_new))
  ) changed) loop
    perform private.check_staff_permissions(v_member.seller_id, array[v_key]);
  end loop;

  if v_old = (select coalesce(array_agg(k order by k), '{}') from unnest(v_new) k) then
    return;
  end if;

  delete from public.seller_staff_permissions where membership_id = p_membership;
  insert into public.seller_staff_permissions (membership_id, permission_key, granted_by)
  select p_membership, k, v_actor from unnest(v_new) k;

  perform private.write_audit('staff.permissions', 'seller', v_member.seller_id::text, null,
    jsonb_build_object('user', v_member.user_id, 'old', v_old, 'new', v_new));
end;
$$;

create function public.set_staff_status(p_membership uuid, p_status text)
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
  if v_member.status = p_status then
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

create function public.leave_staff_shop(p_membership uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seller uuid;
begin
  update public.seller_staff_memberships set status = 'removed'
  where id = p_membership and user_id = auth.uid() and status <> 'removed'
  returning seller_id into v_seller;
  if not found then
    raise exception 'MEMBERSHIP_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.write_audit('staff.leave', 'seller', v_seller::text, null, jsonb_build_object('user', auth.uid()));
end;
$$;

revoke execute on function public.shop_access(uuid) from public, anon;
grant execute on function public.shop_access(uuid) to authenticated;
revoke execute on function public.shop_publishing_allowance(uuid) from public, anon;
grant execute on function public.shop_publishing_allowance(uuid) to authenticated;
revoke execute on function public.invite_staff(uuid, text, text[]) from public, anon;
grant execute on function public.invite_staff(uuid, text, text[]) to authenticated;
revoke execute on function public.cancel_staff_invitation(uuid) from public, anon;
grant execute on function public.cancel_staff_invitation(uuid) to authenticated;
revoke execute on function public.shop_staff(uuid) from public, anon;
grant execute on function public.shop_staff(uuid) to authenticated;
revoke execute on function public.shop_invitations(uuid) from public, anon;
grant execute on function public.shop_invitations(uuid) to authenticated;
revoke execute on function public.my_staff_invitations() from public, anon;
grant execute on function public.my_staff_invitations() to authenticated;
revoke execute on function public.accept_staff_invitation(uuid) from public, anon;
grant execute on function public.accept_staff_invitation(uuid) to authenticated;
revoke execute on function public.decline_staff_invitation(uuid) from public, anon;
grant execute on function public.decline_staff_invitation(uuid) to authenticated;
revoke execute on function public.my_staff_shops() from public, anon;
grant execute on function public.my_staff_shops() to authenticated;
revoke execute on function public.set_staff_permissions(uuid, text[]) from public, anon;
grant execute on function public.set_staff_permissions(uuid, text[]) to authenticated;
revoke execute on function public.set_staff_status(uuid, text) from public, anon;
grant execute on function public.set_staff_status(uuid, text) to authenticated;
revoke execute on function public.leave_staff_shop(uuid) from public, anon;
grant execute on function public.leave_staff_shop(uuid) to authenticated;
revoke execute on function public.claim_email_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_email_jobs(integer) to service_role;
revoke all on function private.setting_value_is_valid(text, jsonb) from public;
revoke all on function private.require_product_images_editable(uuid) from public;
