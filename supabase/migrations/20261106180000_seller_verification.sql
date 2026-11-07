-- Manual seller verification (PRD §5.3 to §5.5, docs/workflows.md).
--
-- Every status change goes through private.change_verification, which writes the
-- history and the audit log. Only Super Admin can decide, and that is a role check
-- rather than a permission, so no Admin can ever be given it. Verification changes
-- only verification: suspensions are still checked separately by publish_product.

create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers (id) on delete restrict,
  method text not null default 'manual' check (method in ('manual', 'provider')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text not null check (char_length(btrim(note)) between 1 and 1000),
  reason text,
  reviewed_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index verification_requests_one_pending on public.verification_requests (seller_id) where status = 'pending';
create index verification_requests_seller on public.verification_requests (seller_id, created_at desc);

create table public.verification_history (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers (id) on delete restrict,
  from_status text not null,
  to_status text not null,
  method text check (method in ('manual', 'provider')),
  actor_id uuid,
  reason text,
  -- The exact moment rather than the transaction's start, so the order is always known.
  created_at timestamptz not null default clock_timestamp()
);

create index verification_history_seller on public.verification_history (seller_id, created_at desc);

create trigger append_only before update or delete on public.verification_history
  for each row execute function private.reject_change();
create trigger append_only_truncate before truncate on public.verification_history
  for each statement execute function private.reject_change();

alter table public.verification_requests enable row level security;
alter table public.verification_history enable row level security;

grant select on public.verification_requests, public.verification_history to authenticated;

create policy "owner reads own requests" on public.verification_requests
  for select to authenticated
  using (seller_id in (select id from public.sellers where owner_user_id = (select auth.uid())));
create policy "super admin reads requests" on public.verification_requests
  for select to authenticated using ((select private.is_super_admin()));
create policy "super admin reads history" on public.verification_history
  for select to authenticated using ((select private.is_super_admin()));

create function private.change_verification(p_seller_id uuid, p_from text, p_to text, p_method text, p_actor uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.sellers set verification_status = p_to where id = p_seller_id;
  insert into public.verification_history (seller_id, from_status, to_status, method, actor_id, reason)
  values (p_seller_id, p_from, p_to, p_method, p_actor, p_reason);
  insert into public.audit_logs (actor_id, action, target_type, target_id, reason, metadata)
  values (p_actor, 'seller.verification_change', 'seller', p_seller_id::text, p_reason,
    jsonb_build_object('from', p_from, 'to', p_to, 'method', p_method));
end;
$$;

revoke all on function private.change_verification(uuid, text, text, text, uuid, text) from public;

-- Available because no provider is configured, so normal verification is unavailable (§5.3).
create function public.request_manual_verification(p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_active_account();
  v_seller public.sellers;
  v_id uuid;
begin
  select * into v_seller from public.sellers where owner_user_id = v_actor for update;
  if not found or not private.is_active_seller_owner(v_seller.id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if v_seller.verification_status not in ('unverified', 'rejected', 'expired') then
    raise exception 'VERIFICATION_NOT_REQUESTABLE' using errcode = '55000';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) not between 1 and 1000 then
    raise exception 'NOTE_REQUIRED' using errcode = '23514';
  end if;

  insert into public.verification_requests (seller_id, note)
  values (v_seller.id, btrim(p_note))
  returning id into v_id;

  perform private.change_verification(v_seller.id, v_seller.verification_status, 'pending', 'manual', v_actor, null);
  return v_id;
end;
$$;

create function public.decide_manual_verification(p_request_id uuid, p_approve boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_super_admin();
  v_request public.verification_requests;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_from text;
begin
  select * into v_request from public.verification_requests where id = p_request_id for update;
  if not found or v_request.status <> 'pending' then
    raise exception 'REQUEST_NOT_PENDING' using errcode = '55000';
  end if;
  if not p_approve and v_reason is null then
    raise exception 'REASON_REQUIRED' using errcode = '23514';
  end if;

  select verification_status into v_from from public.sellers where id = v_request.seller_id for update;

  update public.verification_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      reason = v_reason, reviewed_by = v_actor, decided_at = now()
  where id = p_request_id;

  perform private.change_verification(
    v_request.seller_id, v_from, case when p_approve then 'manually_verified' else 'rejected' end, 'manual', v_actor, v_reason
  );
end;
$$;

-- suspend: verified -> suspended. restore: suspended -> the status it had before.
-- revoke: verified or suspended -> rejected. Anything else is refused.
create function public.set_verification_status(p_seller_id uuid, p_action text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_super_admin();
  v_from text;
  v_to text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_reason is null then
    raise exception 'REASON_REQUIRED' using errcode = '23514';
  end if;

  select verification_status into v_from from public.sellers where id = p_seller_id for update;
  if not found then
    raise exception 'SELLER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_action = 'suspend' and v_from in ('provider_verified', 'manually_verified') then
    v_to := 'suspended';
  elsif p_action = 'revoke' and v_from in ('provider_verified', 'manually_verified', 'suspended') then
    v_to := 'rejected';
  elsif p_action = 'restore' and v_from = 'suspended' then
    -- Keeps manual and provider verification distinct, as they were before.
    select from_status into v_to from public.verification_history
    where seller_id = p_seller_id and to_status = 'suspended'
    order by created_at desc, id limit 1;
    if v_to is null then
      raise exception 'VERIFICATION_CHANGE_NOT_ALLOWED' using errcode = '55000';
    end if;
  else
    raise exception 'VERIFICATION_CHANGE_NOT_ALLOWED' using errcode = '55000';
  end if;

  perform private.change_verification(
    p_seller_id, v_from, v_to, case when v_to = 'provider_verified' then 'provider' else 'manual' end, v_actor, v_reason
  );
end;
$$;

-- Reads for the Super Admin screen. They join to private tables, so they check first.
create function public.admin_list_seller_verification(
  p_status text default null,
  p_search text default null,
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  seller_id uuid,
  seller_slug text,
  seller_name text,
  seller_city text,
  seller_status text,
  publishing_suspended boolean,
  verification_status text,
  owner_name text,
  owner_email text,
  contact_information text,
  description text,
  product_count bigint,
  request_id uuid,
  request_note text,
  request_created_at timestamptz,
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
  select
    s.id, s.slug, s.name, s.city, s.status, s.publishing_suspended, s.verification_status,
    pr.display_name, u.email::text, sp.contact_information, s.description,
    (select count(*) from public.products p where p.seller_id = s.id and p.deleted_at is null),
    r.id, r.note, r.created_at,
    count(*) over ()
  from public.sellers s
  join auth.users u on u.id = s.owner_user_id
  left join public.profiles pr on pr.id = s.owner_user_id
  left join public.seller_private sp on sp.seller_id = s.id
  left join public.verification_requests r on r.seller_id = s.id and r.status = 'pending'
  where (p_status is null or s.verification_status = p_status)
    and (v_pattern is null or s.name ilike v_pattern or u.email::text ilike v_pattern or s.city ilike v_pattern)
  order by coalesce(r.created_at, s.created_at), s.id
  limit least(greatest(coalesce(p_limit, 10), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create function public.admin_verification_history(p_seller_id uuid)
returns table (
  id uuid,
  from_status text,
  to_status text,
  method text,
  actor_name text,
  reason text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
  select h.id, h.from_status, h.to_status, h.method, p.display_name, h.reason, h.created_at
  from public.verification_history h
  left join public.profiles p on p.id = h.actor_id
  where h.seller_id = p_seller_id
  order by h.created_at desc, h.id;
end;
$$;

revoke execute on function public.request_manual_verification(text) from public, anon;
revoke execute on function public.decide_manual_verification(uuid, boolean, text) from public, anon;
revoke execute on function public.set_verification_status(uuid, text, text) from public, anon;
revoke execute on function public.admin_list_seller_verification(text, text, integer, integer) from public, anon;
revoke execute on function public.admin_verification_history(uuid) from public, anon;

grant execute on function public.request_manual_verification(text) to authenticated;
grant execute on function public.decide_manual_verification(uuid, boolean, text) to authenticated;
grant execute on function public.set_verification_status(uuid, text, text) to authenticated;
grant execute on function public.admin_list_seller_verification(text, text, integer, integer) to authenticated;
grant execute on function public.admin_verification_history(uuid) to authenticated;
