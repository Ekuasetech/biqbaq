-- Client details and invoices or receipts (owner's request, 2026-11-08), with the owner's
-- decisions: a client has a name and email, and optionally a phone (Q-48); clients are kept
-- whether or not they join the shop's bulk email, which they are only asked to when the
-- seller ticks "Send updates" (Q-49); invoices and receipts are for the same shops as
-- customer emails, and Super Admin (Q-50); sellers add their own tax lines, and Biqbaq only
-- does the arithmetic (Q-51); either document can go to any client, as a record of a sale
-- is not marketing under CASL (Q-52). Money is in CAD (ADR-0005).

-- Clients.
alter table public.list_subscribers
  add column name text check (name is null or char_length(name) between 1 and 100),
  add column phone text check (phone is null or (char_length(phone) between 7 and 25 and phone ~ '^\+?[0-9 ()./-]+$')),
  -- When they were sent the confirmation email, which is what the daily limit counts.
  add column invited_at timestamptz;
alter table public.list_subscribers drop constraint list_subscribers_status_check;
-- 'client': kept for invoices and receipts, never sent bulk email.
alter table public.list_subscribers add constraint list_subscribers_status_check
  check (status in ('client', 'pending', 'confirmed', 'unsubscribed'));
update public.list_subscribers set invited_at = created_at where source = 'added';
update public.list_subscribers s set name = left(p.display_name, 100)
from public.profiles p where p.id = s.user_id and s.name is null and nullif(btrim(p.display_name), '') is not null;

drop function public.add_list_addresses(uuid, text[], boolean);

create function private.clean_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  if v_phone is null then
    return null;
  end if;
  if char_length(v_phone) not between 7 and 25 or v_phone !~ '^\+?[0-9 ()./-]+$'
    or char_length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 7 then
    raise exception 'PHONE_INVALID' using errcode = '23514';
  end if;
  return v_phone;
end;
$$;
revoke all on function private.clean_phone(text) from public;

-- Clients from the seller's table: each row's name, email, optional phone, and whether to
-- ask them to join the shop's emails (Q-49). Rows that already exist are updated.
create function public.add_list_clients(p_seller uuid, p_clients jsonb, p_has_consent boolean)
returns table (added integer, updated integer, invited integer, unsubscribed integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.email_lists := private.require_list(p_seller);
  v_user uuid := auth.uid();
  v_item jsonb;
  v_email text;
  v_name text;
  v_phone text;
  v_invite boolean;
  v_added integer := 0;
  v_updated integer := 0;
  v_invited integer := 0;
  v_unsubscribed integer := 0;
  v_today integer;
  v_seen text[] := '{}';
  v_row public.list_subscribers;
  v_sender text := private.list_sender_name(v_list);
begin
  if jsonb_typeof(p_clients) <> 'array' or jsonb_array_length(p_clients) not between 1 and 50 then
    raise exception 'DETAILS_INVALID' using errcode = '23514';
  end if;
  if exists (select 1 from jsonb_array_elements(p_clients) c where (c ->> 'invite')::boolean is true) and p_has_consent is not true then
    raise exception 'CONSENT_REQUIRED' using errcode = '23514';
  end if;
  select count(*)::integer into v_today from public.list_subscribers s
  where s.list_id = v_list.id
    and s.invited_at >= ((now() at time zone 'America/Toronto')::date::timestamp at time zone 'America/Toronto');

  for v_item in select * from jsonb_array_elements(p_clients) loop
    v_email := lower(btrim(coalesce(v_item ->> 'email', '')));
    v_name := btrim(coalesce(v_item ->> 'name', ''));
    v_invite := coalesce((v_item ->> 'invite')::boolean, false);
    if char_length(v_email) > 254 or v_email !~ '^[^@\s<>",;]+@[^@\s<>",;]+\.[a-z]{2,}$' then
      raise exception 'EMAIL_INVALID' using errcode = '23514', detail = v_email;
    end if;
    if char_length(v_name) not between 1 and 100 then
      raise exception 'NAME_INVALID' using errcode = '23514';
    end if;
    v_phone := private.clean_phone(v_item ->> 'phone');
    if v_email = any (v_seen) then
      raise exception 'EMAIL_REPEATED' using errcode = '23514';
    end if;
    v_seen := array_append(v_seen, v_email);

    select * into v_row from public.list_subscribers where list_id = v_list.id and email = v_email for update;
    if found then
      update public.list_subscribers set name = v_name, phone = v_phone where id = v_row.id;
      v_updated := v_updated + 1;
    else
      insert into public.list_subscribers (list_id, email, user_id, name, phone, status, source, added_by)
      values (v_list.id, v_email,
        (select u.id from auth.users u join public.profiles p on p.id = u.id where lower(u.email) = v_email limit 1),
        v_name, v_phone, 'client', 'added', v_user)
      returning * into v_row;
      v_added := v_added + 1;
    end if;

    if v_invite then
      -- Someone who unsubscribed stays unsubscribed: only they can rejoin.
      if v_row.status = 'unsubscribed' then
        v_unsubscribed := v_unsubscribed + 1;
      elsif v_row.status = 'client' then
        if v_today + v_invited >= private.setting_integer('bulk_email.max_new_addresses_per_day') then
          raise exception 'ADDRESS_LIMIT' using errcode = 'P0001';
        end if;
        update public.list_subscribers set status = 'pending', invited_at = now() where id = v_row.id;
        v_invited := v_invited + 1;
        if private.setting_is_on('email.notifications_enabled') then
          insert into public.background_jobs (type, user_id, payload, idempotency_key)
          values ('email', null,
            jsonb_build_object('template', 'list_confirm', 'to', v_email,
              'data', jsonb_build_object('shop', v_sender, 'token', v_row.token,
                'locale', coalesce((select locale from public.profiles where id = v_row.user_id), 'en'))),
            'list_confirm:' || v_row.id);
        end if;
      end if;
    end if;
  end loop;

  perform private.write_audit('email_list.add', 'email_list', v_list.id::text, null,
    jsonb_build_object('added', v_added, 'updated', v_updated, 'invited', v_invited));
  return query select v_added, v_updated, v_invited, v_unsubscribed;
end;
$$;

create function public.update_list_client(p_seller uuid, p_email text, p_name text, p_phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.email_lists := private.require_list(p_seller);
  v_name text := btrim(coalesce(p_name, ''));
begin
  if char_length(v_name) not between 1 and 100 then
    raise exception 'NAME_INVALID' using errcode = '23514';
  end if;
  update public.list_subscribers set name = v_name, phone = private.clean_phone(p_phone)
  where list_id = v_list.id and email = lower(btrim(coalesce(p_email, '')));
  if not found then
    raise exception 'CLIENT_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

drop function public.list_subscribers_page(uuid, text, text, integer, integer);
create function public.list_subscribers_page(p_seller uuid, p_status text default null, p_search text default null, p_limit integer default 50, p_offset integer default 0)
returns table (email text, name text, phone text, status text, source text, created_at timestamptz, confirmed_at timestamptz, unsubscribed_at timestamptz, total bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.email_lists := private.require_list(p_seller);
  v_search text := nullif(lower(btrim(coalesce(p_search, ''))), '');
begin
  return query
  select s.email, s.name, s.phone, s.status, s.source, s.created_at, s.confirmed_at, s.unsubscribed_at, count(*) over ()
  from public.list_subscribers s
  where s.list_id = v_list.id and (p_status is null or s.status = p_status)
    and (v_search is null or s.email like '%' || v_search || '%' or lower(coalesce(s.name, '')) like '%' || v_search || '%')
  order by s.created_at desc
  limit greatest(least(coalesce(p_limit, 50), 200), 1) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- "Added today" now counts confirmation emails sent, which is what the limit is for.
create or replace function public.my_email_list(p_seller uuid default null)
returns table (
  list_id uuid,
  enabled boolean,
  sender_name text,
  mailing_address text,
  pending integer,
  confirmed integer,
  unsubscribed integer,
  campaigns_today integer,
  recipients_today integer,
  max_campaigns integer,
  max_recipients integer,
  max_new_addresses integer,
  added_today integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.email_lists;
begin
  begin
    v_list := private.require_list(p_seller);
  exception when sqlstate '55000' then
    return query select null::uuid, false, null::text, null::text, 0, 0, 0, 0, 0, 0, 0, 0, 0;
    return;
  end;
  return query
  select v_list.id, true, private.list_sender_name(v_list), v_list.mailing_address,
    (select count(*)::integer from public.list_subscribers s where s.list_id = v_list.id and s.status = 'pending'),
    (select count(*)::integer from public.list_subscribers s where s.list_id = v_list.id and s.status = 'confirmed'),
    (select count(*)::integer from public.list_subscribers s where s.list_id = v_list.id and s.status = 'unsubscribed'),
    t.campaigns, t.recipients,
    private.setting_integer('bulk_email.max_campaigns_per_day'),
    private.setting_integer('bulk_email.max_recipients_per_day'),
    private.setting_integer('bulk_email.max_new_addresses_per_day'),
    (select count(*)::integer from public.list_subscribers s where s.list_id = v_list.id
      and s.invited_at >= ((now() at time zone 'America/Toronto')::date::timestamp at time zone 'America/Toronto'))
  from private.list_sent_today(v_list.id) t;
end;
$$;

-- Removing a client who unsubscribed would let them be re-added, so they are kept.
create or replace function public.remove_list_subscriber(p_seller uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.email_lists := private.require_list(p_seller);
begin
  delete from public.list_subscribers
  where list_id = v_list.id and email = lower(btrim(coalesce(p_email, ''))) and status <> 'unsubscribed';
end;
$$;

-- People joining themselves bring their name with them.
create or replace function public.set_list_subscription(p_shop text, p_subscribed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_active_account();
  v_list public.email_lists;
  v_email text;
  v_name text := (select left(nullif(btrim(display_name), ''), 100) from public.profiles where id = v_user);
begin
  if p_shop is null then
    insert into public.email_lists (owner_type, enabled) values ('platform', true) on conflict do nothing;
  end if;
  v_list := private.find_public_list(p_shop);
  if v_list.id is null then
    raise exception 'LIST_NOT_FOUND' using errcode = 'P0002';
  end if;
  select lower(email) into v_email from auth.users where id = v_user and email_confirmed_at is not null;
  if v_email is null then
    raise exception 'EMAIL_UNCONFIRMED' using errcode = '55000';
  end if;
  if p_subscribed then
    insert into public.list_subscribers (list_id, email, user_id, name, status, source, added_by, confirmed_at)
    values (v_list.id, v_email, v_user, v_name, 'confirmed', 'self', v_user, now())
    on conflict (list_id, email) do update
      set status = 'confirmed', source = 'self', user_id = v_user, confirmed_at = now(), unsubscribed_at = null,
          name = coalesce(public.list_subscribers.name, excluded.name);
  else
    update public.list_subscribers set status = 'unsubscribed', unsubscribed_at = now()
    where list_id = v_list.id and email = v_email and status <> 'unsubscribed';
  end if;
end;
$$;

-- A client who never asked to join has no subscription to confirm.
create or replace function public.confirm_list_token(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  update public.list_subscribers set status = 'confirmed', confirmed_at = now()
  where token = p_token and status = 'pending'
  returning status into v_status;
  if v_status is null then
    select status into v_status from public.list_subscribers where token = p_token and status <> 'client';
  end if;
  if v_status is null then
    raise exception 'TOKEN_NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_status;
end;
$$;

-- Invoices and receipts.
insert into public.platform_settings (key, value, description, is_public) values
  ('invoices.max_per_day', '50', 'Most invoices and receipts one shop (or Biqbaq) may send in a day', false);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.email_lists (id) on delete cascade,
  kind text not null check (kind in ('invoice', 'receipt')),
  number integer not null,
  client_email text not null,
  client_name text not null,
  client_phone text,
  issue_date date not null,
  due_date date,
  paid_date date,
  payment_method text,
  -- [{description, quantity, unit_price_minor, amount_minor}], checked by create_invoice.
  items jsonb not null,
  -- [{label, rate_milli, amount_minor}], rates in thousandths of a percent, so Quebec's 9.975% fits.
  taxes jsonb not null default '[]'::jsonb,
  tax_number text,
  notes text,
  subtotal_minor bigint not null,
  tax_minor bigint not null,
  total_minor bigint not null,
  currency text not null default 'CAD' check (currency = 'CAD'),
  -- As they were when it was issued, so a later change does not alter a sent document.
  sender_name text not null,
  sender_address text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  send_count integer not null default 1,
  last_sent_at timestamptz not null default now(),
  unique (list_id, kind, number)
);
create index invoices_list on public.invoices (list_id, created_at desc);
alter table public.invoices enable row level security;
revoke all on public.invoices from public, anon, authenticated;

create function private.invoice_label(p_kind text, p_number integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_kind = 'invoice' then 'INV-' else 'RCT-' end || lpad(p_number::text, 4, '0');
$$;
revoke all on function private.invoice_label(text, integer) from public;

create function private.invoice_json(p_invoice public.invoices)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(p_invoice) - 'list_id' - 'created_by'
    || jsonb_build_object('label', private.invoice_label(p_invoice.kind, p_invoice.number));
$$;
revoke all on function private.invoice_json(public.invoices) from public;

create function private.queue_invoice_email(p_invoice public.invoices)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.background_jobs (type, user_id, payload, idempotency_key)
  values ('email', null,
    jsonb_build_object('template', 'invoice', 'to', p_invoice.client_email,
      'data', jsonb_build_object('invoice_id', p_invoice.id,
        'locale', coalesce((select p.locale from public.list_subscribers s join public.profiles p on p.id = s.user_id
          where s.list_id = p_invoice.list_id and s.email = p_invoice.client_email), 'en'))),
    'invoice:' || p_invoice.id || ':' || p_invoice.send_count);
end;
$$;
revoke all on function private.queue_invoice_email(public.invoices) from public;

create function private.check_invoice_limit(p_list uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) + coalesce(sum(send_count - 1), 0) from public.invoices
      where list_id = p_list and last_sent_at >= ((now() at time zone 'America/Toronto')::date::timestamp at time zone 'America/Toronto'))
     >= private.setting_integer('invoices.max_per_day') then
    raise exception 'INVOICE_LIMIT' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function private.check_invoice_limit(uuid) from public;

-- Checks everything, works out the totals, numbers it, stores it and emails it as a PDF.
create function public.create_invoice(
  p_seller uuid,
  p_kind text,
  p_client_email text,
  p_issue_date date,
  p_due_date date,
  p_paid_date date,
  p_payment_method text,
  p_items jsonb,
  p_taxes jsonb,
  p_tax_number text,
  p_notes text
)
returns table (id uuid, label text, total_minor bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.email_lists := private.require_list(p_seller);
  v_client public.list_subscribers;
  v_item jsonb;
  v_items jsonb := '[]'::jsonb;
  v_taxes jsonb := '[]'::jsonb;
  v_quantity numeric;
  v_price bigint;
  v_description text;
  v_label text;
  v_rate integer;
  v_subtotal bigint := 0;
  v_tax bigint := 0;
  v_amount bigint;
  v_number integer;
  v_invoice public.invoices;
  v_method text := nullif(btrim(coalesce(p_payment_method, '')), '');
  v_tax_number text := nullif(btrim(coalesce(p_tax_number, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if v_list.mailing_address is null then
    raise exception 'ADDRESS_REQUIRED' using errcode = '55000';
  end if;
  if not private.setting_is_on('email.notifications_enabled') then
    raise exception 'EMAIL_OFF' using errcode = '55000';
  end if;
  select * into v_client from public.list_subscribers s where s.list_id = v_list.id and s.email = lower(btrim(coalesce(p_client_email, '')));
  if not found then
    raise exception 'CLIENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_kind is null or p_kind not in ('invoice', 'receipt') or p_issue_date is null
    or (p_kind = 'invoice' and p_due_date is not null and p_due_date < p_issue_date)
    or (p_kind = 'receipt' and p_paid_date is null)
    or char_length(coalesce(v_method, '')) > 40 or char_length(coalesce(v_tax_number, '')) > 30
    or char_length(coalesce(v_notes, '')) > 1000 then
    raise exception 'DETAILS_INVALID' using errcode = '23514';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'ITEMS_INVALID' using errcode = '23514';
  end if;
  begin
    for v_item in select * from jsonb_array_elements(p_items) loop
      v_description := btrim(coalesce(v_item ->> 'description', ''));
      v_quantity := (v_item ->> 'quantity')::numeric;
      v_price := (v_item ->> 'unit_price_minor')::bigint;
      if char_length(v_description) not between 1 and 200 or v_quantity is null or v_quantity <= 0 or v_quantity > 100000
        or v_quantity <> round(v_quantity, 2) or v_price is null or v_price < 0 or v_price > 100000000 then
        raise exception 'ITEMS_INVALID' using errcode = '23514';
      end if;
      v_amount := round(v_quantity * v_price);
      v_subtotal := v_subtotal + v_amount;
      v_items := v_items || jsonb_build_array(jsonb_build_object('description', v_description, 'quantity', v_quantity, 'unit_price_minor', v_price, 'amount_minor', v_amount));
    end loop;

    if coalesce(jsonb_typeof(p_taxes), 'array') <> 'array' then
      raise exception 'TAXES_INVALID' using errcode = '23514';
    end if;
    if jsonb_array_length(coalesce(p_taxes, '[]'::jsonb)) > 3 then
      raise exception 'TAXES_INVALID' using errcode = '23514';
    end if;
    for v_item in select * from jsonb_array_elements(coalesce(p_taxes, '[]'::jsonb)) loop
      v_label := btrim(coalesce(v_item ->> 'label', ''));
      v_rate := (v_item ->> 'rate_milli')::integer;
      if char_length(v_label) not between 1 and 40 or v_rate is null or v_rate < 0 or v_rate > 30000 then
        raise exception 'TAXES_INVALID' using errcode = '23514';
      end if;
      v_amount := round(v_subtotal * v_rate / 100000.0);
      v_tax := v_tax + v_amount;
      v_taxes := v_taxes || jsonb_build_array(jsonb_build_object('label', v_label, 'rate_milli', v_rate, 'amount_minor', v_amount));
    end loop;
  exception when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then
    raise exception 'ITEMS_INVALID' using errcode = '23514';
  end;

  -- One at a time per list, so numbers never repeat or skip.
  perform 1 from public.email_lists l where l.id = v_list.id for update;
  perform private.check_invoice_limit(v_list.id);
  select coalesce(max(i.number), 0) + 1 into v_number from public.invoices i where i.list_id = v_list.id and i.kind = p_kind;

  insert into public.invoices (list_id, kind, number, client_email, client_name, client_phone, issue_date, due_date, paid_date,
    payment_method, items, taxes, tax_number, notes, subtotal_minor, tax_minor, total_minor, sender_name, sender_address, created_by)
  values (v_list.id, p_kind, v_number, v_client.email, coalesce(v_client.name, v_client.email), v_client.phone, p_issue_date,
    case when p_kind = 'invoice' then p_due_date end, case when p_kind = 'receipt' then p_paid_date end,
    case when p_kind = 'receipt' then v_method end, v_items, v_taxes, v_tax_number, v_notes,
    v_subtotal, v_tax, v_subtotal + v_tax, private.list_sender_name(v_list), v_list.mailing_address, auth.uid())
  returning * into v_invoice;

  perform private.queue_invoice_email(v_invoice);
  perform private.write_audit(case when p_kind = 'invoice' then 'invoice.send' else 'receipt.send' end, 'invoice', v_invoice.id::text, null,
    jsonb_build_object('label', private.invoice_label(p_kind, v_number), 'total_minor', v_invoice.total_minor));
  return query select v_invoice.id, private.invoice_label(p_kind, v_number), v_invoice.total_minor;
end;
$$;

-- Sends the same document again, unchanged, at most three times in all.
create function public.resend_invoice(p_seller uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.email_lists := private.require_list(p_seller);
  v_invoice public.invoices;
begin
  perform 1 from public.email_lists l where l.id = v_list.id for update;
  select * into v_invoice from public.invoices i where i.id = p_id and i.list_id = v_list.id for update;
  if not found then
    raise exception 'INVOICE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_invoice.send_count >= 3 then
    raise exception 'RESEND_LIMIT' using errcode = 'P0001';
  end if;
  perform private.check_invoice_limit(v_list.id);
  update public.invoices set send_count = send_count + 1, last_sent_at = now() where invoices.id = p_id returning * into v_invoice;
  perform private.queue_invoice_email(v_invoice);
  perform private.write_audit('invoice.resend', 'invoice', p_id::text, null, jsonb_build_object('label', private.invoice_label(v_invoice.kind, v_invoice.number)));
end;
$$;

create function public.list_invoices(p_seller uuid)
returns table (id uuid, kind text, label text, client_name text, client_email text, total_minor bigint, issue_date date, created_at timestamptz, send_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.email_lists := private.require_list(p_seller);
begin
  return query
  select i.id, i.kind, private.invoice_label(i.kind, i.number), i.client_name, i.client_email, i.total_minor, i.issue_date, i.created_at, i.send_count
  from public.invoices i where i.list_id = v_list.id order by i.created_at desc limit 100;
end;
$$;

-- For the owner to download the PDF again.
create function public.get_invoice(p_seller uuid, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.email_lists := private.require_list(p_seller);
  v_invoice public.invoices;
begin
  select * into v_invoice from public.invoices i where i.id = p_id and i.list_id = v_list.id;
  if not found then
    raise exception 'INVOICE_NOT_FOUND' using errcode = 'P0002';
  end if;
  return private.invoice_json(v_invoice);
end;
$$;

-- For the email worker, which attaches the PDF.
create function public.get_invoice_for_sending(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.invoice_json(i) from public.invoices i where i.id = p_id;
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
    ('invoices.max_per_day', 1, 1000)
  ) as r (k, lo, hi) where r.k = p_key;

  -- A number with no limits listed here is refused, so a new one has to be given some.
  return v_min is not null
    and (p_value #>> '{}')::numeric between v_min and v_max
    and (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric);
end;
$$;
revoke all on function private.setting_value_is_valid(text, jsonb) from public;

revoke execute on function public.add_list_clients(uuid, jsonb, boolean) from public, anon;
grant execute on function public.add_list_clients(uuid, jsonb, boolean) to authenticated;
revoke execute on function public.update_list_client(uuid, text, text, text) from public, anon;
grant execute on function public.update_list_client(uuid, text, text, text) to authenticated;
revoke execute on function public.list_subscribers_page(uuid, text, text, integer, integer) from public, anon;
grant execute on function public.list_subscribers_page(uuid, text, text, integer, integer) to authenticated;
revoke execute on function public.create_invoice(uuid, text, text, date, date, date, text, jsonb, jsonb, text, text) from public, anon;
grant execute on function public.create_invoice(uuid, text, text, date, date, date, text, jsonb, jsonb, text, text) to authenticated;
revoke execute on function public.resend_invoice(uuid, uuid) from public, anon;
grant execute on function public.resend_invoice(uuid, uuid) to authenticated;
revoke execute on function public.list_invoices(uuid) from public, anon;
grant execute on function public.list_invoices(uuid) to authenticated;
revoke execute on function public.get_invoice(uuid, uuid) from public, anon;
grant execute on function public.get_invoice(uuid, uuid) to authenticated;
revoke execute on function public.get_invoice_for_sending(uuid) from public, anon, authenticated;
grant execute on function public.get_invoice_for_sending(uuid) to service_role;
