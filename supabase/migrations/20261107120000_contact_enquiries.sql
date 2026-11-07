-- Anonymous Contact Seller (PRD §9.2). Enquiries go to the seller's login email (Q-06), which
-- only the server ever sees. This is a delivery log: the message itself is not stored.

insert into public.platform_settings (key, value, description, is_public) values
  ('contact.max_per_ip_hour', '5', 'Most enquiries one internet address may send in an hour', false),
  ('contact.max_per_email_hour', '5', 'Most enquiries one visitor email may send in an hour', false),
  ('contact.max_per_seller_hour', '50', 'Most enquiries one seller may receive in an hour', false);

create table public.contact_enquiries (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products (id) on delete set null,
  seller_id uuid references public.sellers (id) on delete set null,
  visitor_email_hash text not null,
  ip_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contact_enquiries_seller on public.contact_enquiries (seller_id, created_at desc);
create index contact_enquiries_product on public.contact_enquiries (product_id);

create trigger set_updated_at before update on public.contact_enquiries
  for each row execute function private.set_updated_at();

create table public.rate_limit_counters (
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (bucket, window_start)
);

create index rate_limit_counters_window on public.rate_limit_counters (window_start);

-- Server only: no policies, and no access for visitors or signed-in users.
alter table public.contact_enquiries enable row level security;
alter table public.rate_limit_counters enable row level security;
revoke all on public.contact_enquiries, public.rate_limit_counters from public, anon, authenticated;
grant select on public.contact_enquiries to service_role;

-- Counts one attempt, and refuses once the hour's limit is passed. The refusal undoes this
-- count, which changes nothing: the counter is already at the limit.
create function private.hit_rate_limit(p_bucket text, p_setting text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_count integer;
begin
  select (value #>> '{}')::integer into v_limit from public.platform_settings where key = p_setting;
  insert into public.rate_limit_counters (bucket, window_start, count)
  values (p_bucket, date_trunc('hour', now()), 1)
  on conflict (bucket, window_start) do update set count = public.rate_limit_counters.count + 1
  returning count into v_count;
  -- With no setting, nothing is sent: an unlimited public form would be worse.
  if v_count > coalesce(v_limit, 0) then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function private.hit_rate_limit(text, text) from public;

-- Only the server's secret key can run these, because this returns the seller's private address.
create function public.prepare_contact_enquiry(p_product_id uuid, p_visitor_email_hash text, p_ip_hash text)
returns table (
  enquiry_id uuid,
  seller_email text,
  seller_locale text,
  product_name text,
  product_slug text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seller uuid;
  v_owner uuid;
  v_email text;
  v_name text;
  v_slug text;
begin
  -- The public view decides what counts as public, so a draft, unpublished, deleted or
  -- suspended listing answers exactly like one that never existed.
  select p.seller_id, s.owner_user_id, pp.name, pp.slug into v_seller, v_owner, v_name, v_slug
  from public.public_products pp
  join public.products p on p.id = pp.id
  join public.sellers s on s.id = p.seller_id
  where pp.id = p_product_id;
  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select u.email::text into v_email from auth.users u
  where u.id = v_owner and u.email_confirmed_at is not null;
  if v_email is null then
    raise exception 'SELLER_CANNOT_RECEIVE' using errcode = '55000';
  end if;

  perform private.hit_rate_limit('contact:ip:' || p_ip_hash, 'contact.max_per_ip_hour');
  perform private.hit_rate_limit('contact:email:' || p_visitor_email_hash, 'contact.max_per_email_hour');
  perform private.hit_rate_limit('contact:seller:' || v_seller, 'contact.max_per_seller_hour');
  delete from public.rate_limit_counters where window_start < now() - interval '2 days';

  return query
  with created as (
    insert into public.contact_enquiries (product_id, seller_id, visitor_email_hash, ip_hash)
    values (p_product_id, v_seller, p_visitor_email_hash, p_ip_hash)
    returning id
  )
  select c.id, v_email, coalesce((select pr.locale from public.profiles pr where pr.id = v_owner), 'en'), v_name, v_slug
  from created c;
end;
$$;

create function public.finish_contact_enquiry(p_enquiry_id uuid, p_sent boolean, p_provider_message_id text, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.contact_enquiries
  set status = case when p_sent then 'sent' else 'failed' end,
      provider_message_id = p_provider_message_id,
      last_error = left(p_error, 200)
  where id = p_enquiry_id and status = 'pending';
$$;

revoke execute on function public.prepare_contact_enquiry(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.finish_contact_enquiry(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.prepare_contact_enquiry(uuid, text, text) to service_role;
grant execute on function public.finish_contact_enquiry(uuid, boolean, text, text) to service_role;
