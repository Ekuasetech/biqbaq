-- Marketer and seller referrals (PRD §14), with the owner's decisions of 2026-11-08:
-- a referral counts once the referred person confirms their email (Q-07); the latest
-- referral link opened within 30 days gets the credit (BD-11); codes are made from the
-- marketer's or shop's name and Super Admin can change them (Q-41).

create table public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{3,20}$'),
  owner_type text not null check (owner_type in ('marketer', 'seller')),
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  seller_id uuid references public.sellers (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referral_codes_seller check ((owner_type = 'seller') = (seller_id is not null))
);
create unique index referral_codes_one_per_marketer on public.referral_codes (owner_user_id) where owner_type = 'marketer';
create unique index referral_codes_one_per_shop on public.referral_codes (seller_id) where owner_type = 'seller';
create trigger set_updated_at before update on public.referral_codes
  for each row execute function private.set_updated_at();

-- One row per referred person, ever (§14.3: attribute each signup only once).
create table public.referral_attributions (
  id uuid primary key default gen_random_uuid(),
  referred_user_id uuid not null unique references public.profiles (id) on delete cascade,
  referral_code_id uuid references public.referral_codes (id) on delete set null,
  referrer_user_id uuid not null references public.profiles (id) on delete cascade,
  owner_type text not null check (owner_type in ('marketer', 'seller')),
  seller_id uuid references public.sellers (id) on delete set null,
  -- The code as it was used, kept if Super Admin later changes it.
  code text not null,
  registered_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint referral_attributions_not_self check (referrer_user_id <> referred_user_id)
);
create index referral_attributions_code on public.referral_attributions (referral_code_id, completed_at desc);

-- Only the functions below read or write these (§14.3: protected against modification).
alter table public.referral_codes enable row level security;
alter table public.referral_attributions enable row level security;
revoke all on public.referral_codes, public.referral_attributions from public, anon, authenticated;

-- A code from a name, like ADA2026 for a marketer or ADIRESTUDIO for a shop, with a number
-- added if it is taken.
create function private.make_referral_code(p_name text, p_add_year boolean)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_base text := left(upper(regexp_replace(coalesce(p_name, ''), '[^A-Za-z0-9]', '', 'g')), 14);
  v_code text;
begin
  if char_length(v_base) < 3 then
    v_base := left('BIQ' || v_base, 14);
  end if;
  v_code := case when p_add_year then v_base || to_char(now() at time zone 'America/Toronto', 'YYYY') else v_base end;
  while exists (select 1 from public.referral_codes where code = v_code) loop
    v_code := v_base || (1000 + floor(random() * 9000))::integer;
  end loop;
  return v_code;
end;
$$;
revoke all on function private.make_referral_code(text, boolean) from public;

create function private.ensure_marketer_code(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first text := split_part(btrim(coalesce((select display_name from public.profiles where id = p_user), '')), ' ', 1);
begin
  if not exists (select 1 from public.referral_codes where owner_user_id = p_user and owner_type = 'marketer') then
    insert into public.referral_codes (code, owner_type, owner_user_id)
    values (private.make_referral_code(v_first, true), 'marketer', p_user);
  end if;
end;
$$;

create function private.ensure_shop_code(p_seller uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.referral_codes where seller_id = p_seller) then
    insert into public.referral_codes (code, owner_type, owner_user_id, seller_id)
    select private.make_referral_code(s.name, false), 'seller', s.owner_user_id, s.id
    from public.sellers s where s.id = p_seller;
  end if;
end;
$$;
revoke all on function private.ensure_marketer_code(uuid) from public;
revoke all on function private.ensure_shop_code(uuid) from public;

-- A marketer gets a code when the role becomes active (§3.8), and every shop has one (§14.5).
create function private.code_on_marketer_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role_key = 'marketer' and new.status = 'active' then
    perform private.ensure_marketer_code(new.user_id);
  end if;
  return null;
end;
$$;
create trigger referral_code_on_role after insert or update of status on public.user_roles
  for each row execute function private.code_on_marketer_role();

create function private.code_on_new_shop()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ensure_shop_code(new.id);
  return null;
end;
$$;
create trigger referral_code_on_shop after insert on public.sellers
  for each row execute function private.code_on_new_shop();
revoke all on function private.code_on_marketer_role() from public;
revoke all on function private.code_on_new_shop() from public;

select private.ensure_marketer_code(user_id) from public.user_roles where role_key = 'marketer' and status = 'active';
select private.ensure_shop_code(id) from public.sellers;

-- A code earns credit only while its marketer role is active or its shop is active.
create function private.referral_code_usable(p_code public.referral_codes)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_code.owner_type
    when 'marketer' then exists (
      select 1 from public.user_roles r join public.profiles p on p.id = r.user_id
      where r.user_id = p_code.owner_user_id and r.role_key = 'marketer' and r.status = 'active' and p.status = 'active')
    else exists (select 1 from public.sellers s where s.id = p_code.seller_id and s.status = 'active')
  end;
$$;
revoke all on function private.referral_code_usable(public.referral_codes) from public;

-- At sign-up: the code the browser remembered, if it is real, usable, and was opened within
-- 30 days (BD-11). The browser's own 30-day memory is the main limit; this checks it too.
create function private.attribute_referral()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(btrim(coalesce(
    case when jsonb_typeof(new.raw_user_meta_data -> 'referral_code') = 'string' then new.raw_user_meta_data ->> 'referral_code' end, '')));
  v_opened text := case when jsonb_typeof(new.raw_user_meta_data -> 'referral_opened_at') = 'string'
    then new.raw_user_meta_data ->> 'referral_opened_at' end;
  v_row public.referral_codes;
begin
  if v_code !~ '^[A-Z0-9]{3,20}$' then
    return null;
  end if;
  if v_opened is not null then
    begin
      if v_opened::timestamptz < now() - interval '30 days' then
        return null;
      end if;
    exception when others then
      return null;
    end;
  end if;
  select * into v_row from public.referral_codes where code = v_code;
  if not found or not private.referral_code_usable(v_row) or v_row.owner_user_id = new.id then
    return null;
  end if;
  insert into public.referral_attributions (referred_user_id, referral_code_id, referrer_user_id, owner_type, seller_id, code, completed_at)
  values (new.id, v_row.id, v_row.owner_user_id, v_row.owner_type, v_row.seller_id, v_row.code,
    case when new.email_confirmed_at is not null then now() end)
  on conflict (referred_user_id) do nothing;
  return null;
-- A referral problem must never stop someone signing up: they just earn nobody credit.
exception when others then
  return null;
end;
$$;

create function private.complete_referral()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.referral_attributions set completed_at = now()
  where referred_user_id = new.id and completed_at is null;
  return null;
end;
$$;
revoke all on function private.attribute_referral() from public;
revoke all on function private.complete_referral() from public;

-- This name sorts after on_auth_user_created, which makes the profile it needs.
create trigger on_auth_user_referral after insert on auth.users
  for each row execute function private.attribute_referral();
create trigger on_auth_user_referral_confirmed after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function private.complete_referral();

-- The caller's own programmes: their marketer code, and each shop they own. Counts are of
-- confirmed sign-ups (Q-07), by Toronto day, Monday-starting week and calendar month.
create function public.my_referral_programmes()
returns table (
  code_id uuid,
  code text,
  owner_type text,
  shop_name text,
  total integer,
  today integer,
  this_week integer,
  this_month integer,
  waiting integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with now_local as (select (now() at time zone 'America/Toronto') as t)
  select c.id, c.code, c.owner_type, s.name,
    (select count(*)::integer from public.referral_attributions a where a.referral_code_id = c.id and a.completed_at is not null),
    (select count(*)::integer from public.referral_attributions a, now_local n
      where a.referral_code_id = c.id and (a.completed_at at time zone 'America/Toronto')::date = n.t::date),
    (select count(*)::integer from public.referral_attributions a, now_local n
      where a.referral_code_id = c.id and (a.completed_at at time zone 'America/Toronto') >= date_trunc('week', n.t)),
    (select count(*)::integer from public.referral_attributions a, now_local n
      where a.referral_code_id = c.id and (a.completed_at at time zone 'America/Toronto') >= date_trunc('month', n.t)),
    (select count(*)::integer from public.referral_attributions a where a.referral_code_id = c.id and a.completed_at is null)
  from public.referral_codes c
  left join public.sellers s on s.id = c.seller_id
  where c.owner_user_id = auth.uid() and private.referral_code_usable(c)
  order by c.owner_type, s.name;
$$;

-- When each referred person signed up and confirmed, never who they are.
create function public.my_referral_history(p_code_id uuid, p_before timestamptz default null, p_limit integer default 20)
returns table (registered_at timestamptz, completed_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.referral_codes c where c.id = p_code_id and c.owner_user_id = auth.uid() and private.referral_code_usable(c)) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return query
  select a.registered_at, a.completed_at from public.referral_attributions a
  where a.referral_code_id = p_code_id and (p_before is null or a.registered_at < p_before)
  order by a.registered_at desc
  limit greatest(least(coalesce(p_limit, 20), 50), 1);
end;
$$;

-- Super Admin's view of every programme (§3.2: view referral analytics).
create function public.admin_list_referral_codes(p_type text default null, p_search text default null, p_limit integer default 20, p_offset integer default 0)
returns table (
  code_id uuid,
  code text,
  owner_type text,
  owner_name text,
  owner_email text,
  shop_name text,
  usable boolean,
  total integer,
  this_month integer,
  waiting integer,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not private.is_super_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return query
  select c.id, c.code, c.owner_type, coalesce(p.display_name, ''), u.email::text, s.name,
    private.referral_code_usable(c),
    (select count(*)::integer from public.referral_attributions a where a.referral_code_id = c.id and a.completed_at is not null),
    (select count(*)::integer from public.referral_attributions a
      where a.referral_code_id = c.id and (a.completed_at at time zone 'America/Toronto') >= date_trunc('month', now() at time zone 'America/Toronto')),
    (select count(*)::integer from public.referral_attributions a where a.referral_code_id = c.id and a.completed_at is null),
    count(*) over ()
  from public.referral_codes c
  join public.profiles p on p.id = c.owner_user_id
  left join auth.users u on u.id = c.owner_user_id
  left join public.sellers s on s.id = c.seller_id
  where (p_type is null or c.owner_type = p_type)
    and (v_search is null or c.code ilike '%' || v_search || '%' or p.display_name ilike '%' || v_search || '%'
      or u.email ilike '%' || v_search || '%' or s.name ilike '%' || v_search || '%')
  order by c.owner_type, (select count(*) from public.referral_attributions a where a.referral_code_id = c.id and a.completed_at is not null) desc, c.code
  limit greatest(least(coalesce(p_limit, 20), 100), 1) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Changing a code stops the old link working; credit already given stays (Q-41).
create function public.admin_set_referral_code(p_code_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_old text;
begin
  if not private.is_super_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if v_code !~ '^[A-Z0-9]{3,20}$' then
    raise exception 'CODE_INVALID' using errcode = '23514';
  end if;
  select code into v_old from public.referral_codes where id = p_code_id for update;
  if not found then
    raise exception 'CODE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_old = v_code then
    return;
  end if;
  if exists (select 1 from public.referral_codes where code = v_code) then
    raise exception 'CODE_TAKEN' using errcode = '23505';
  end if;
  update public.referral_codes set code = v_code where id = p_code_id;
  perform private.write_audit('referral.code_change', 'referral_code', p_code_id::text, null,
    jsonb_build_object('from', v_old, 'to', v_code));
end;
$$;

revoke execute on function public.my_referral_programmes() from public, anon;
grant execute on function public.my_referral_programmes() to authenticated;
revoke execute on function public.my_referral_history(uuid, timestamptz, integer) from public, anon;
grant execute on function public.my_referral_history(uuid, timestamptz, integer) to authenticated;
revoke execute on function public.admin_list_referral_codes(text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_referral_codes(text, text, integer, integer) to authenticated;
revoke execute on function public.admin_set_referral_code(uuid, text) from public, anon;
grant execute on function public.admin_set_referral_code(uuid, text) to authenticated;
