-- Online payments (PRD §13, Phase 7), with the owner's decisions of 2026-11-08 (BD-02,
-- BD-03, BD-12): Stripe Connect in CAD with direct charges, so each sale is the seller's;
-- sellers on Stripe's Express dashboard with Stripe responsible for losses; Biqbaq takes a
-- fixed CA$1 per order and keeps it on refunds; one product per order, with a quantity;
-- Stripe collects the delivery address and phone, and the seller arranges delivery; listed
-- prices include any tax. Super Admin switches payments on per shop (§13.1), and a shop can
-- only take payments once Stripe confirms it can (§13.3).
--
-- Provider-independent (§13.5): tables name the provider, and only the server talks to it.
-- Every money record is written by the server from the provider's own answers or notices.

insert into public.platform_settings (key, value, description, is_public) values
  ('payments.enabled', 'true', 'Whether buyers can pay online at all', false),
  ('payments.application_fee_minor', '100', 'Biqbaq''s fee per order, in cents (CA$1 by default)', false),
  ('payments.max_quantity', '20', 'Most of one product a buyer can order at once', false),
  ('payments.max_checkouts_per_hour', '20', 'Most checkouts one person can start in an hour', false);

-- A shop's account with the provider, and whether Super Admin allows it to take payments.
create table public.payment_accounts (
  seller_id uuid primary key references public.sellers (id) on delete cascade,
  provider text not null default 'stripe' check (provider in ('stripe')),
  provider_account_id text unique,
  -- §13.1: off until Super Admin turns it on for this shop.
  enabled_by_admin boolean not null default false,
  -- §13.3's statuses. 'enabled' only from the provider's own confirmation.
  status text not null default 'disabled'
    check (status in ('disabled', 'onboarding_incomplete', 'verification_pending', 'restricted', 'enabled', 'suspended')),
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  requirements_due integer not null default 0,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.payment_accounts
  for each row execute function private.set_updated_at();

create sequence public.order_number_seq;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default 'BQ-' || lpad(nextval('public.order_number_seq')::text, 6, '0'),
  buyer_id uuid not null references public.profiles (id) on delete restrict,
  seller_id uuid not null references public.sellers (id) on delete restrict,
  product_id uuid references public.products (id) on delete set null,
  -- As they were when ordered.
  product_name text not null,
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  quantity integer not null check (quantity between 1 and 1000),
  total_minor bigint not null check (total_minor >= 0),
  application_fee_minor bigint not null check (application_fee_minor >= 0),
  currency text not null default 'CAD' check (currency = 'CAD'),
  provider text not null default 'stripe',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'expired')),
  refunded_minor bigint not null default 0 check (refunded_minor >= 0),
  disputed boolean not null default false,
  fulfilled_at timestamptz,
  -- From the provider's checkout, once paid: for the seller to deliver.
  buyer_email text,
  shipping_name text,
  shipping_phone text,
  shipping_address jsonb,
  provider_session_id text unique,
  provider_payment_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_seller on public.orders (seller_id, created_at desc);
create index orders_buyer on public.orders (buyer_id, created_at desc);
create trigger set_updated_at before update on public.orders
  for each row execute function private.set_updated_at();

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  provider text not null default 'stripe',
  provider_reference text not null,
  type text not null check (type in ('charge', 'refund', 'dispute')),
  status text not null,
  amount_minor bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_reference)
);
create index payment_transactions_order on public.payment_transactions (order_id);
create trigger set_updated_at before update on public.payment_transactions
  for each row execute function private.set_updated_at();

-- Each provider notice is handled once, however often it is sent (§13.4 idempotency).
create table public.payment_webhook_events (
  provider text not null,
  event_id text not null,
  type text not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

alter table public.payment_accounts enable row level security;
alter table public.orders enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.payment_webhook_events enable row level security;
revoke all on public.payment_accounts, public.orders, public.payment_transactions, public.payment_webhook_events from public, anon, authenticated;
revoke all on sequence public.order_number_seq from public, anon, authenticated;

-- Whether a shop can take a payment right now: allowed by Super Admin, confirmed by the
-- provider, payments on for the platform, and the shop active.
create function private.shop_takes_payments(p_seller uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.setting_is_on('payments.enabled') and exists (
    select 1 from public.payment_accounts a join public.sellers s on s.id = a.seller_id
    where a.seller_id = p_seller and a.enabled_by_admin and a.status = 'enabled' and a.charges_enabled and s.status = 'active'
  );
$$;
revoke all on function private.shop_takes_payments(uuid) from public;

-- Products show "Buy now" when their shop takes payments. Added at the end of the view,
-- as a view's columns keep their order.
create or replace view public.public_products as
  select
    p.id, p.slug, p.name, p.description, p.price_minor, p.currency, p.availability,
    p.condition, p.attributes,
    coalesce((select t.views from public.product_view_totals t where t.product_id = p.id), 0::bigint) as view_count,
    p.first_published_at,
    coalesce((
      select jsonb_agg(jsonb_build_object('url', m.secure_url, 'alt', coalesce(nullif(m.alt_text, ''), p.name)) order by m.display_order)
      from public.media_assets m
      where m.entity_type = 'product' and m.entity_id = p.id
    ), '[]'::jsonb) as images,
    c.slug as category_slug, c.name_en as category_name_en, c.name_fr as category_name_fr,
    s.slug as seller_slug, s.name as seller_name, s.city as seller_city, s.country as seller_country,
    s.description as seller_description,
    s.verification_status in ('provider_verified', 'manually_verified') as seller_verified,
    private.shop_takes_payments(s.id) and p.availability <> 'out_of_stock' as buy_online
  from public.products p
  join public.sellers s on s.id = p.seller_id
  left join public.categories c on c.id = p.category_id
  where p.status = 'published' and p.deleted_at is null and s.status = 'active';
grant execute on function private.shop_takes_payments(uuid) to anon, authenticated;

-- Who may see a shop's orders: the owner, and staff given "Manage orders".
create function private.require_order_access(p_seller uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_account();
  if not (private.is_active_seller_owner(p_seller) or private.has_seller_permission(p_seller, 'orders.manage')) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.require_order_access(uuid) from public;

-- Super Admin (§13.2).
create function public.admin_set_seller_payments(p_seller uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_shop text;
begin
  if not private.is_super_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  select owner_user_id, name into v_owner, v_shop from public.sellers where id = p_seller;
  if not found or p_enabled is null then
    raise exception 'SELLER_NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.payment_accounts (seller_id, enabled_by_admin) values (p_seller, p_enabled)
  on conflict (seller_id) do update set enabled_by_admin = excluded.enabled_by_admin,
    -- Turning it off is a suspension; turning it on leaves the provider's status to decide.
    status = case when not excluded.enabled_by_admin and public.payment_accounts.status = 'enabled' then 'suspended'
                  when excluded.enabled_by_admin and public.payment_accounts.status = 'suspended' then
                    case when public.payment_accounts.charges_enabled then 'enabled' else 'onboarding_incomplete' end
                  else public.payment_accounts.status end;
  perform private.write_audit(case when p_enabled then 'payments.enable' else 'payments.disable' end, 'seller', p_seller::text, null, '{}'::jsonb);
  perform private.enqueue_email(v_owner, case when p_enabled then 'payments_enabled' else 'payments_disabled' end,
    jsonb_build_object('shop', v_shop), 'payments:' || gen_random_uuid());
end;
$$;

create function public.admin_list_payment_accounts(p_search text default null, p_limit integer default 20, p_offset integer default 0)
returns table (seller_id uuid, shop_name text, shop_slug text, enabled_by_admin boolean, status text, charges_enabled boolean,
  payouts_enabled boolean, has_account boolean, paid_orders integer, paid_minor bigint, checked_at timestamptz, total bigint)
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
  select s.id, s.name, s.slug, coalesce(a.enabled_by_admin, false), coalesce(a.status, 'disabled'),
    coalesce(a.charges_enabled, false), coalesce(a.payouts_enabled, false), a.provider_account_id is not null,
    (select count(*)::integer from public.orders o where o.seller_id = s.id and o.status = 'paid'),
    (select coalesce(sum(o.total_minor), 0)::bigint from public.orders o where o.seller_id = s.id and o.status = 'paid'),
    a.checked_at, count(*) over ()
  from public.sellers s left join public.payment_accounts a on a.seller_id = s.id
  where s.status = 'active' and (v_search is null or s.name ilike '%' || v_search || '%' or s.slug ilike '%' || v_search || '%')
  order by coalesce(a.enabled_by_admin, false) desc, s.name
  limit greatest(least(coalesce(p_limit, 20), 100), 1) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create function public.admin_list_orders(p_search text default null, p_limit integer default 20, p_offset integer default 0)
returns table (id uuid, number text, shop_name text, buyer_email text, product_name text, total_minor bigint, application_fee_minor bigint,
  status text, refunded_minor bigint, disputed boolean, provider_payment_id text, created_at timestamptz, total bigint)
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
  select o.id, o.number, s.name, coalesce(o.buyer_email, u.email::text), o.product_name, o.total_minor, o.application_fee_minor,
    o.status, o.refunded_minor, o.disputed, o.provider_payment_id, o.created_at, count(*) over ()
  from public.orders o join public.sellers s on s.id = o.seller_id left join auth.users u on u.id = o.buyer_id
  where v_search is null or o.number ilike '%' || v_search || '%' or s.name ilike '%' || v_search || '%'
    or o.product_name ilike '%' || v_search || '%' or o.buyer_email ilike '%' || v_search || '%' or o.provider_payment_id = v_search
  order by o.created_at desc
  limit greatest(least(coalesce(p_limit, 20), 100), 1) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- The seller's own payment setup.
create function public.my_payment_account(p_seller uuid)
returns table (enabled_by_admin boolean, status text, charges_enabled boolean, payouts_enabled boolean, requirements_due integer,
  has_account boolean, checked_at timestamptz, application_fee_minor integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_account();
  if not private.is_active_seller_owner(p_seller) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return query
  select coalesce(a.enabled_by_admin, false), coalesce(a.status, 'disabled'), coalesce(a.charges_enabled, false),
    coalesce(a.payouts_enabled, false), coalesce(a.requirements_due, 0), a.provider_account_id is not null, a.checked_at,
    private.setting_integer('payments.application_fee_minor')
  from (select 1) one left join public.payment_accounts a on a.seller_id = p_seller;
end;
$$;

-- For the server, before talking to the provider about a seller's account: is the caller
-- the owner, is it allowed, and which account (if any) it has.
create function public.payment_account_for_setup(p_seller uuid)
returns table (allowed boolean, provider_account_id text, shop_name text, owner_email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_account();
  if not private.is_active_seller_owner(p_seller) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return query
  select coalesce(a.enabled_by_admin, false), a.provider_account_id, s.name, u.email::text
  from public.sellers s
  left join public.payment_accounts a on a.seller_id = s.id
  left join auth.users u on u.id = s.owner_user_id
  where s.id = p_seller;
end;
$$;

-- Server only: what the provider said about a seller's account.
create function public.record_payment_account(p_seller uuid, p_provider_account_id text, p_charges_enabled boolean,
  p_payouts_enabled boolean, p_requirements_due integer, p_restricted boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_row public.payment_accounts;
begin
  insert into public.payment_accounts (seller_id) values (p_seller) on conflict (seller_id) do nothing;
  select * into v_row from public.payment_accounts where seller_id = p_seller for update;
  if v_row.provider_account_id is not null and v_row.provider_account_id <> p_provider_account_id then
    raise exception 'ACCOUNT_MISMATCH' using errcode = '55000';
  end if;
  v_status := case
    when not v_row.enabled_by_admin then case when v_row.status = 'disabled' then 'disabled' else 'suspended' end
    when p_restricted then 'restricted'
    when coalesce(p_charges_enabled, false) and coalesce(p_payouts_enabled, false) then 'enabled'
    when coalesce(p_requirements_due, 0) > 0 then 'onboarding_incomplete'
    else 'verification_pending'
  end;
  update public.payment_accounts set provider_account_id = p_provider_account_id, charges_enabled = coalesce(p_charges_enabled, false),
    payouts_enabled = coalesce(p_payouts_enabled, false), requirements_due = greatest(coalesce(p_requirements_due, 0), 0),
    status = v_status, checked_at = now()
  where seller_id = p_seller;
  if v_status is distinct from v_row.status then
    perform private.write_audit('payments.status', 'seller', p_seller::text, null, jsonb_build_object('from', v_row.status, 'to', v_status));
  end if;
  return v_status;
end;
$$;

-- Server only: the seller of a provider account, from a provider notice.
create function public.seller_for_payment_account(p_provider_account_id text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select seller_id from public.payment_accounts where provider_account_id = p_provider_account_id;
$$;

-- A buyer starts paying for a product (BD-03): checked here, before anything goes to the
-- provider. Returns what the server needs to open the provider's checkout.
create function public.begin_order(p_product uuid, p_quantity integer)
returns table (order_id uuid, order_number text, provider_account_id text, product_name text, unit_price_minor bigint,
  quantity integer, total_minor bigint, application_fee_minor bigint, buyer_email text, product_slug text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_active_account();
  v_product public.products;
  v_account text;
  v_fee bigint := private.setting_integer('payments.application_fee_minor');
  v_order public.orders;
begin
  if p_quantity is null or p_quantity < 1 or p_quantity > private.setting_integer('payments.max_quantity') then
    raise exception 'QUANTITY_INVALID' using errcode = '23514';
  end if;
  select p.* into v_product from public.products p join public.public_products pp on pp.id = p.id where p.id = p_product;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_product.availability = 'out_of_stock' then
    raise exception 'OUT_OF_STOCK' using errcode = '55000';
  end if;
  if not private.shop_takes_payments(v_product.seller_id) then
    raise exception 'PAYMENTS_UNAVAILABLE' using errcode = '55000';
  end if;
  if exists (select 1 from public.sellers where id = v_product.seller_id and owner_user_id = v_user)
    or exists (select 1 from public.seller_staff_memberships where seller_id = v_product.seller_id and user_id = v_user and status <> 'removed') then
    raise exception 'OWN_SHOP' using errcode = '55000';
  end if;
  -- The fee is taken from the payment, so the payment must be bigger than it.
  if v_product.price_minor * p_quantity <= v_fee then
    raise exception 'TOTAL_TOO_SMALL' using errcode = '23514';
  end if;
  perform private.hit_rate_limit('orders:' || v_user, 'payments.max_checkouts_per_hour');
  select a.provider_account_id into v_account from public.payment_accounts a where a.seller_id = v_product.seller_id;

  insert into public.orders (buyer_id, seller_id, product_id, product_name, unit_price_minor, quantity, total_minor, application_fee_minor)
  values (v_user, v_product.seller_id, v_product.id, v_product.name, v_product.price_minor, p_quantity,
    v_product.price_minor * p_quantity, v_fee)
  returning * into v_order;
  return query select v_order.id, v_order.number, v_account, v_order.product_name, v_order.unit_price_minor, v_order.quantity,
    v_order.total_minor, v_order.application_fee_minor, (select email::text from auth.users where id = v_user), v_product.slug;
end;
$$;

-- Server only: the provider's checkout made for an order.
create function public.attach_checkout(p_order uuid, p_session_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.orders set provider_session_id = p_session_id where id = p_order and provider_session_id is null and status = 'pending';
$$;

-- Server only: a provider notice is handled once. True the first time.
create function public.claim_payment_event(p_provider text, p_event_id text, p_type text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.payment_webhook_events (provider, event_id, type) values (p_provider, p_event_id, p_type)
  on conflict do nothing;
  return found;
end;
$$;

-- Server only: the provider's checkout finished (paid, failed or expired). Paid is only ever
-- set from the provider's notice, never from the page the buyer returns to (§13.4).
create function public.record_checkout(p_session_id text, p_provider_account_id text, p_outcome text, p_payment_id text,
  p_amount_minor bigint, p_email text, p_name text, p_phone text, p_address jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_owner uuid;
begin
  if p_outcome not in ('paid', 'failed', 'expired') then
    raise exception 'DETAILS_INVALID' using errcode = '23514';
  end if;
  select o.* into v_order from public.orders o join public.payment_accounts a on a.seller_id = o.seller_id
  where o.provider_session_id = p_session_id and a.provider_account_id = p_provider_account_id for update of o;
  if not found then
    return 'unknown';
  end if;
  if v_order.status <> 'pending' then
    return v_order.status;
  end if;
  if p_outcome = 'paid' then
    -- The provider must have taken exactly what Biqbaq asked for.
    if p_amount_minor is distinct from v_order.total_minor then
      raise exception 'AMOUNT_MISMATCH' using errcode = '55000';
    end if;
    update public.orders set status = 'paid', paid_at = now(), provider_payment_id = p_payment_id,
      buyer_email = left(p_email, 254), shipping_name = left(p_name, 200), shipping_phone = left(p_phone, 40), shipping_address = p_address
    where id = v_order.id;
    insert into public.payment_transactions (order_id, provider_reference, type, status, amount_minor)
    values (v_order.id, coalesce(p_payment_id, p_session_id), 'charge', 'succeeded', p_amount_minor)
    on conflict (provider, provider_reference) do nothing;
    select owner_user_id into v_owner from public.sellers where id = v_order.seller_id;
    perform private.enqueue_email(v_order.buyer_id, 'order_paid', jsonb_build_object('product', v_order.product_name), 'order_paid:' || v_order.id);
    perform private.enqueue_email(v_owner, 'order_received', jsonb_build_object('product', v_order.product_name), 'order_received:' || v_order.id);
  else
    update public.orders set status = p_outcome where id = v_order.id;
  end if;
  return p_outcome;
end;
$$;

-- Server only: refunds and disputes the provider reports, matched by payment.
create function public.record_refund(p_provider_account_id text, p_payment_id text, p_refund_id text, p_amount_minor bigint, p_status text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_total bigint;
begin
  select o.* into v_order from public.orders o join public.payment_accounts a on a.seller_id = o.seller_id
  where o.provider_payment_id = p_payment_id and a.provider_account_id = p_provider_account_id for update of o;
  if not found then
    return 'unknown';
  end if;
  insert into public.payment_transactions (order_id, provider_reference, type, status, amount_minor)
  values (v_order.id, p_refund_id, 'refund', p_status, p_amount_minor)
  on conflict (provider, provider_reference) do update set status = excluded.status, amount_minor = excluded.amount_minor;
  select coalesce(sum(amount_minor), 0) into v_total from public.payment_transactions
  where order_id = v_order.id and type = 'refund' and status in ('succeeded', 'pending');
  update public.orders set refunded_minor = least(v_total, total_minor) where id = v_order.id;
  if p_status = 'succeeded' then
    perform private.enqueue_email(v_order.buyer_id, 'order_refunded', jsonb_build_object('product', v_order.product_name), 'order_refunded:' || p_refund_id);
  end if;
  return 'recorded';
end;
$$;

create function public.record_dispute(p_provider_account_id text, p_payment_id text, p_dispute_id text, p_amount_minor bigint, p_status text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_owner uuid;
  v_new boolean;
begin
  select o.* into v_order from public.orders o join public.payment_accounts a on a.seller_id = o.seller_id
  where o.provider_payment_id = p_payment_id and a.provider_account_id = p_provider_account_id for update of o;
  if not found then
    return 'unknown';
  end if;
  v_new := not exists (select 1 from public.payment_transactions where provider = 'stripe' and provider_reference = p_dispute_id);
  insert into public.payment_transactions (order_id, provider_reference, type, status, amount_minor)
  values (v_order.id, p_dispute_id, 'dispute', p_status, p_amount_minor)
  on conflict (provider, provider_reference) do update set status = excluded.status;
  update public.orders set disputed = p_status not in ('won', 'warning_closed') where id = v_order.id;
  if v_new then
    select owner_user_id into v_owner from public.sellers where id = v_order.seller_id;
    perform private.enqueue_email(v_owner, 'order_disputed', jsonb_build_object('product', v_order.product_name), 'order_disputed:' || p_dispute_id);
  end if;
  return 'recorded';
end;
$$;

-- A shop's orders, for its owner and staff with "Manage orders".
create function public.list_shop_orders(p_seller uuid, p_status text default null, p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, number text, product_name text, quantity integer, total_minor bigint, application_fee_minor bigint, status text,
  refunded_minor bigint, disputed boolean, fulfilled_at timestamptz, buyer_email text, shipping_name text, shipping_phone text,
  shipping_address jsonb, paid_at timestamptz, created_at timestamptz, total bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_order_access(p_seller);
  return query
  select o.id, o.number, o.product_name, o.quantity, o.total_minor, o.application_fee_minor, o.status, o.refunded_minor, o.disputed,
    o.fulfilled_at, o.buyer_email, o.shipping_name, o.shipping_phone, o.shipping_address, o.paid_at, o.created_at, count(*) over ()
  from public.orders o
  -- Unpaid checkouts are not orders yet, for the seller.
  where o.seller_id = p_seller and o.status = 'paid'
    and (p_status is null or (p_status = 'to_deliver' and o.fulfilled_at is null and o.refunded_minor < o.total_minor)
      or (p_status = 'delivered' and o.fulfilled_at is not null) or (p_status = 'refunded' and o.refunded_minor > 0))
  order by o.paid_at desc
  limit greatest(least(coalesce(p_limit, 50), 200), 1) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create function public.set_order_fulfilled(p_order uuid, p_fulfilled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_order_access(v_order.seller_id);
  if v_order.status <> 'paid' then
    raise exception 'ORDER_NOT_PAID' using errcode = '55000';
  end if;
  update public.orders set fulfilled_at = case when p_fulfilled then coalesce(fulfilled_at, now()) end where id = p_order;
  perform private.write_audit(case when p_fulfilled then 'order.fulfil' else 'order.unfulfil' end, 'order', p_order::text, null,
    jsonb_build_object('number', v_order.number));
  if p_fulfilled and v_order.fulfilled_at is null then
    perform private.enqueue_email(v_order.buyer_id, 'order_fulfilled', jsonb_build_object('product', v_order.product_name), 'order_fulfilled:' || p_order);
  end if;
end;
$$;

-- For the server, before asking the provider for a refund: may the caller refund this order,
-- and is the amount within what is left? Biqbaq's fee is never refunded (BD-02).
create function public.prepare_refund(p_order uuid, p_amount_minor bigint)
returns table (provider_account_id text, provider_payment_id text, order_number text, refundable_minor bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_order_access(v_order.seller_id);
  if v_order.status <> 'paid' or v_order.provider_payment_id is null then
    raise exception 'ORDER_NOT_PAID' using errcode = '55000';
  end if;
  if p_amount_minor is null or p_amount_minor < 1 or p_amount_minor > v_order.total_minor - v_order.refunded_minor then
    raise exception 'AMOUNT_INVALID' using errcode = '23514';
  end if;
  perform private.write_audit('order.refund', 'order', p_order::text, null,
    jsonb_build_object('number', v_order.number, 'amount_minor', p_amount_minor));
  return query select a.provider_account_id, v_order.provider_payment_id, v_order.number, v_order.total_minor - v_order.refunded_minor
  from public.payment_accounts a where a.seller_id = v_order.seller_id;
end;
$$;

-- A buyer's own orders.
create function public.my_orders(p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, number text, shop_name text, shop_slug text, product_name text, product_slug text, quantity integer,
  total_minor bigint, status text, refunded_minor bigint, fulfilled_at timestamptz, paid_at timestamptz, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.number, s.name, s.slug, o.product_name, p.slug, o.quantity, o.total_minor, o.status, o.refunded_minor,
    o.fulfilled_at, o.paid_at, o.created_at
  from public.orders o join public.sellers s on s.id = o.seller_id left join public.products p on p.id = o.product_id
  -- Checkouts left unfinished are not shown as orders.
  where o.buyer_id = auth.uid() and o.status in ('paid', 'pending') and (o.status = 'paid' or o.created_at > now() - interval '1 hour')
  order by o.created_at desc
  limit greatest(least(coalesce(p_limit, 50), 200), 1) offset greatest(coalesce(p_offset, 0), 0);
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
    ('staff.max_invitations_per_hour', 1, 100),
    ('api.max_requests_per_hour', 10, 100000),
    ('reviews.max_per_hour', 1, 100),
    ('views.max_per_hour', 10, 100000),
    ('comments.max_per_hour', 1, 100),
    ('ads.max_per_section', 1, 6),
    ('messages.max_per_hour', 5, 1000),
    ('messages.max_new_conversations_per_hour', 1, 100),
    ('bulk_email.max_recipients_per_day', 1, 100000),
    ('bulk_email.max_campaigns_per_day', 1, 20),
    ('bulk_email.max_new_addresses_per_day', 1, 10000),
    ('invoices.max_per_day', 1, 1000),
    ('bulk_email.max_complaints_30d', 1, 100),
    ('bulk_email.max_unsubscribe_percent', 1, 50),
    ('bulk_email.max_bounce_percent', 1, 20),
    ('bulk_email.max_single_per_day', 1, 1000),
    ('payments.application_fee_minor', 0, 10000),
    ('payments.max_quantity', 1, 1000),
    ('payments.max_checkouts_per_hour', 1, 1000)
  ) as r (k, lo, hi) where r.k = p_key;

  -- A number with no limits listed here is refused, so a new one has to be given some.
  return v_min is not null
    and (p_value #>> '{}')::numeric between v_min and v_max
    and (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric);
end;
$$;
revoke all on function private.setting_value_is_valid(text, jsonb) from public;

-- Signed-in people.
revoke execute on function public.admin_set_seller_payments(uuid, boolean) from public, anon;
grant execute on function public.admin_set_seller_payments(uuid, boolean) to authenticated;
revoke execute on function public.admin_list_payment_accounts(text, integer, integer) from public, anon;
grant execute on function public.admin_list_payment_accounts(text, integer, integer) to authenticated;
revoke execute on function public.admin_list_orders(text, integer, integer) from public, anon;
grant execute on function public.admin_list_orders(text, integer, integer) to authenticated;
revoke execute on function public.my_payment_account(uuid) from public, anon;
grant execute on function public.my_payment_account(uuid) to authenticated;
revoke execute on function public.payment_account_for_setup(uuid) from public, anon;
grant execute on function public.payment_account_for_setup(uuid) to authenticated;
revoke execute on function public.begin_order(uuid, integer) from public, anon;
grant execute on function public.begin_order(uuid, integer) to authenticated;
revoke execute on function public.list_shop_orders(uuid, text, integer, integer) from public, anon;
grant execute on function public.list_shop_orders(uuid, text, integer, integer) to authenticated;
revoke execute on function public.set_order_fulfilled(uuid, boolean) from public, anon;
grant execute on function public.set_order_fulfilled(uuid, boolean) to authenticated;
revoke execute on function public.prepare_refund(uuid, bigint) from public, anon;
grant execute on function public.prepare_refund(uuid, bigint) to authenticated;
revoke execute on function public.my_orders(integer, integer) from public, anon;
grant execute on function public.my_orders(integer, integer) to authenticated;
-- The server only: these record what the provider said.
revoke execute on function public.record_payment_account(uuid, text, boolean, boolean, integer, boolean) from public, anon, authenticated;
grant execute on function public.record_payment_account(uuid, text, boolean, boolean, integer, boolean) to service_role;
revoke execute on function public.seller_for_payment_account(text) from public, anon, authenticated;
grant execute on function public.seller_for_payment_account(text) to service_role;
revoke execute on function public.attach_checkout(uuid, text) from public, anon, authenticated;
grant execute on function public.attach_checkout(uuid, text) to service_role;
revoke execute on function public.claim_payment_event(text, text, text) from public, anon, authenticated;
grant execute on function public.claim_payment_event(text, text, text) to service_role;
revoke execute on function public.record_checkout(text, text, text, text, bigint, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_checkout(text, text, text, text, bigint, text, text, text, jsonb) to service_role;
revoke execute on function public.record_refund(text, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.record_refund(text, text, text, bigint, text) to service_role;
revoke execute on function public.record_dispute(text, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.record_dispute(text, text, text, bigint, text) to service_role;
