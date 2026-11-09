-- Biqbaq's fee is paid by the buyer (owner's decision of 2026-11-08, changing BD-02): it is
-- added on top of the product's price at checkout as a "Biqbaq service fee", once per order,
-- one amount for every shop, set by Super Admin (CA$1 by default). The seller receives the
-- full product price, less Stripe's own processing fee. Biqbaq keeps the fee on refunds, so
-- a seller refunds at most the product price.
--
-- Orders keep the product price as `subtotal_minor`; `total_minor` stays what the buyer was
-- charged. Orders made before this change had the fee taken from the price, so for them the
-- subtotal is the total.

alter table public.orders add column subtotal_minor bigint;
update public.orders set subtotal_minor = total_minor;
alter table public.orders alter column subtotal_minor set not null,
  add constraint orders_subtotal_check check (subtotal_minor >= 0 and subtotal_minor <= total_minor);

-- The product page shows the fee before the buyer goes to Stripe.
update public.platform_settings
set is_public = true,
    description = 'Biqbaq''s service fee per order, in cents, added on top of the price and paid by the buyer (CA$1 by default)'
where key = 'payments.application_fee_minor';

create or replace function public.begin_order(p_product uuid, p_quantity integer)
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
  -- Stripe's smallest card payment in Canada is CA$0.50.
  if v_product.price_minor * p_quantity + v_fee < 50 then
    raise exception 'TOTAL_TOO_SMALL' using errcode = '23514';
  end if;
  perform private.hit_rate_limit('orders:' || v_user, 'payments.max_checkouts_per_hour');
  select a.provider_account_id into v_account from public.payment_accounts a where a.seller_id = v_product.seller_id;

  insert into public.orders (buyer_id, seller_id, product_id, product_name, unit_price_minor, quantity, subtotal_minor, total_minor, application_fee_minor)
  values (v_user, v_product.seller_id, v_product.id, v_product.name, v_product.price_minor, p_quantity,
    v_product.price_minor * p_quantity, v_product.price_minor * p_quantity + v_fee, v_fee)
  returning * into v_order;
  return query select v_order.id, v_order.number, v_account, v_order.product_name, v_order.unit_price_minor, v_order.quantity,
    v_order.total_minor, v_order.application_fee_minor, (select email::text from auth.users where id = v_user), v_product.slug;
end;
$$;

-- The seller's orders now show their sale (the subtotal) next to what the buyer paid.
drop function public.list_shop_orders(uuid, text, integer, integer);
create function public.list_shop_orders(p_seller uuid, p_status text default null, p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, number text, product_name text, quantity integer, subtotal_minor bigint, total_minor bigint, application_fee_minor bigint,
  status text, refunded_minor bigint, disputed boolean, fulfilled_at timestamptz, buyer_email text, shipping_name text, shipping_phone text,
  shipping_address jsonb, paid_at timestamptz, created_at timestamptz, total bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_order_access(p_seller);
  return query
  select o.id, o.number, o.product_name, o.quantity, o.subtotal_minor, o.total_minor, o.application_fee_minor, o.status, o.refunded_minor,
    o.disputed, o.fulfilled_at, o.buyer_email, o.shipping_name, o.shipping_phone, o.shipping_address, o.paid_at, o.created_at, count(*) over ()
  from public.orders o
  -- Unpaid checkouts are not orders yet, for the seller.
  where o.seller_id = p_seller and o.status = 'paid'
    and (p_status is null or (p_status = 'to_deliver' and o.fulfilled_at is null and o.refunded_minor < o.subtotal_minor)
      or (p_status = 'delivered' and o.fulfilled_at is not null) or (p_status = 'refunded' and o.refunded_minor > 0))
  order by o.paid_at desc
  limit greatest(least(coalesce(p_limit, 50), 200), 1) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke execute on function public.list_shop_orders(uuid, text, integer, integer) from public, anon;
grant execute on function public.list_shop_orders(uuid, text, integer, integer) to authenticated;

-- A seller refunds at most the product price: the service fee stays with Biqbaq (BD-02).
create or replace function public.prepare_refund(p_order uuid, p_amount_minor bigint)
returns table (provider_account_id text, provider_payment_id text, order_number text, refundable_minor bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_left bigint;
begin
  select * into v_order from public.orders where id = p_order for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.require_order_access(v_order.seller_id);
  if v_order.status <> 'paid' or v_order.provider_payment_id is null then
    raise exception 'ORDER_NOT_PAID' using errcode = '55000';
  end if;
  v_left := greatest(v_order.subtotal_minor - v_order.refunded_minor, 0);
  if p_amount_minor is null or p_amount_minor < 1 or p_amount_minor > v_left then
    raise exception 'AMOUNT_INVALID' using errcode = '23514';
  end if;
  perform private.write_audit('order.refund', 'order', p_order::text, null,
    jsonb_build_object('number', v_order.number, 'amount_minor', p_amount_minor));
  return query select a.provider_account_id, v_order.provider_payment_id, v_order.number, v_left
  from public.payment_accounts a where a.seller_id = v_order.seller_id;
end;
$$;

-- The buyer's orders show the service fee they paid, and how many there are in all (for pages).
drop function public.my_orders(integer, integer);
create function public.my_orders(p_limit integer default 20, p_offset integer default 0)
returns table (id uuid, number text, shop_name text, shop_slug text, product_name text, product_slug text, quantity integer,
  subtotal_minor bigint, total_minor bigint, status text, refunded_minor bigint, fulfilled_at timestamptz, paid_at timestamptz,
  created_at timestamptz, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.number, s.name, s.slug, o.product_name, p.slug, o.quantity, o.subtotal_minor, o.total_minor, o.status, o.refunded_minor,
    o.fulfilled_at, o.paid_at, o.created_at, count(*) over ()
  from public.orders o join public.sellers s on s.id = o.seller_id left join public.products p on p.id = o.product_id
  -- Checkouts left unfinished are not shown as orders.
  where o.buyer_id = auth.uid() and o.status in ('paid', 'pending') and (o.status = 'paid' or o.created_at > now() - interval '1 hour')
  order by o.created_at desc
  limit greatest(least(coalesce(p_limit, 20), 100), 1) offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke execute on function public.my_orders(integer, integer) from public, anon;
grant execute on function public.my_orders(integer, integer) to authenticated;

-- Super Admin's orders show the product price too, so a full refund reads as refunded.
drop function public.admin_list_orders(text, integer, integer);
create function public.admin_list_orders(p_search text default null, p_limit integer default 20, p_offset integer default 0)
returns table (id uuid, number text, shop_name text, buyer_email text, product_name text, subtotal_minor bigint, total_minor bigint,
  application_fee_minor bigint, status text, refunded_minor bigint, disputed boolean, provider_payment_id text, created_at timestamptz, total bigint)
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
  select o.id, o.number, s.name, coalesce(o.buyer_email, u.email::text), o.product_name, o.subtotal_minor, o.total_minor, o.application_fee_minor,
    o.status, o.refunded_minor, o.disputed, o.provider_payment_id, o.created_at, count(*) over ()
  from public.orders o join public.sellers s on s.id = o.seller_id left join auth.users u on u.id = o.buyer_id
  where v_search is null or o.number ilike '%' || v_search || '%' or s.name ilike '%' || v_search || '%'
    or o.product_name ilike '%' || v_search || '%' or o.buyer_email ilike '%' || v_search || '%' or o.provider_payment_id = v_search
  order by o.created_at desc
  limit greatest(least(coalesce(p_limit, 20), 100), 1) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke execute on function public.admin_list_orders(text, integer, integer) from public, anon;
grant execute on function public.admin_list_orders(text, integer, integer) to authenticated;
