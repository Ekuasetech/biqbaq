-- Buyer-seller messaging (PRD §9.1), with the owner's decisions of 2026-11-08:
-- text only (BD-04); one inbox, each conversation labelled with its listing (BD-05);
-- buyers start conversations from a product, a cargo car or a shop page (Q-37);
-- open or closed, with archiving personal (Q-35); at most one email per conversation
-- per hour to someone away, without the text (Q-34); Super Admin can read a conversation
-- only with a reason, and each reading is audited (Q-36).

insert into public.platform_settings (key, value, description, is_public) values
  ('messages.max_per_hour', '60', 'Most messages one person may send in an hour', false),
  ('messages.max_new_conversations_per_hour', '10', 'Most new conversations one person may start in an hour', false);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  seller_id uuid not null references public.sellers (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  vehicle_listing_id uuid references public.vehicle_listings (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_by uuid references public.profiles (id) on delete set null,
  closed_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint conversations_one_listing check (product_id is null or vehicle_listing_id is null)
);

-- One conversation per buyer, shop and listing (or the shop itself), so a second
-- "Message the seller" continues the first.
create unique index conversations_one_per_subject on public.conversations
  (buyer_id, seller_id, coalesce(product_id, vehicle_listing_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index conversations_seller on public.conversations (seller_id, last_message_at desc);
create index conversations_buyer on public.conversations (buyer_id, last_message_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  -- Who typed it, which for the shop's side may be a staff member (§3.4: owner and actor stay distinct).
  sender_id uuid references public.profiles (id) on delete set null,
  sender_side text not null check (sender_side in ('buyer', 'seller')),
  body text not null check (char_length(body) between 1 and 2000),
  -- The real time, so messages sent within one transaction still have an order.
  created_at timestamptz not null default clock_timestamp()
);
create index messages_conversation on public.messages (conversation_id, created_at);

-- Each person's own reading, archiving and email pacing.
create table public.conversation_reads (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz,
  archived_at timestamptz,
  last_emailed_at timestamptz,
  primary key (conversation_id, user_id)
);

-- Which side of a conversation the caller is on, or null if they may not see it.
-- Staff see a shop's conversations with either message permission.
create function private.conversation_side(p_buyer uuid, p_seller uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is not null and p_buyer = auth.uid()
      and exists (select 1 from public.profiles where id = auth.uid() and status = 'active') then 'buyer'
    when private.has_seller_permission(p_seller, 'messages.view')
      or private.has_seller_permission(p_seller, 'messages.respond') then 'seller'
  end;
$$;

create function private.can_read_conversation(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation and private.conversation_side(c.buyer_id, c.seller_id) is not null
  );
$$;

revoke all on function private.conversation_side(uuid, uuid) from public;
revoke all on function private.can_read_conversation(uuid) from public;
grant execute on function private.can_read_conversation(uuid) to authenticated;

-- Reading directly is allowed only for the people in a conversation, which is also what
-- Realtime checks before delivering a new message. Every change goes through the functions.
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.conversation_reads enable row level security;
revoke all on public.conversations, public.messages, public.conversation_reads from public, anon, authenticated;
grant select on public.conversations, public.messages to authenticated;

create policy "participants read their conversations" on public.conversations
  for select to authenticated using (private.can_read_conversation(id));
create policy "participants read their messages" on public.messages
  for select to authenticated using (private.can_read_conversation(conversation_id));

alter publication supabase_realtime add table public.messages, public.conversations;

-- Adds a message, keeps everyone's lists in order, and emails the other side if due.
create function private.post_message(p_conversation public.conversations, p_side text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
  v_recipient uuid;
  v_shop text;
begin
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then
    raise exception 'MESSAGE_INVALID' using errcode = '23514';
  end if;
  perform private.hit_rate_limit('messages:' || v_user, 'messages.max_per_hour');

  insert into public.messages (conversation_id, sender_id, sender_side, body)
  values (p_conversation.id, v_user, p_side, v_body)
  returning id into v_id;
  update public.conversations set last_message_at = clock_timestamp() where id = p_conversation.id;

  insert into public.conversation_reads (conversation_id, user_id, last_read_at)
  values (p_conversation.id, v_user, clock_timestamp())
  on conflict (conversation_id, user_id) do update set last_read_at = clock_timestamp(), archived_at = null;
  -- A new message brings an archived conversation back for everyone else too.
  update public.conversation_reads set archived_at = null
  where conversation_id = p_conversation.id and user_id <> v_user and archived_at is not null;

  select owner_user_id, name into v_recipient, v_shop from public.sellers where id = p_conversation.seller_id;
  if p_side = 'seller' then
    v_recipient := p_conversation.buyer_id;
  end if;

  insert into public.conversation_reads (conversation_id, user_id)
  values (p_conversation.id, v_recipient)
  on conflict do nothing;
  -- At most one email an hour per conversation, and never the message itself (Q-34).
  update public.conversation_reads set last_emailed_at = now()
  where conversation_id = p_conversation.id and user_id = v_recipient
    and (last_emailed_at is null or last_emailed_at < now() - interval '1 hour');
  if found then
    perform private.enqueue_email(
      v_recipient,
      case when p_side = 'seller' then 'message_to_buyer' else 'message_to_seller' end,
      jsonb_build_object('shop', v_shop),
      'message:' || v_id || ':' || v_recipient
    );
  end if;
  return v_id;
end;
$$;

revoke all on function private.post_message(public.conversations, text, text) from public;

-- A signed-in person writes to a shop, about a listing or about the shop itself.
create function public.start_conversation(p_shop text, p_product uuid, p_vehicle uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_active_account();
  v_owner uuid;
  v_seller uuid;
  v_conversation public.conversations;
begin
  if p_product is not null and p_vehicle is not null then
    raise exception 'DETAILS_INVALID' using errcode = '23514';
  end if;
  select s.id, s.owner_user_id into v_seller, v_owner from public.public_sellers ps join public.sellers s on s.id = ps.id where ps.slug = p_shop;
  if not found then
    raise exception 'SHOP_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_product is not null and not exists (
    select 1 from public.public_products pp join public.products p on p.id = pp.id where pp.id = p_product and p.seller_id = v_seller
  ) then
    raise exception 'LISTING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_vehicle is not null and not exists (
    select 1 from public.public_vehicle_listings pv join public.vehicle_listings v on v.id = pv.id where pv.id = p_vehicle and v.seller_id = v_seller
  ) then
    raise exception 'LISTING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_owner = v_user or exists (
    select 1 from public.seller_staff_memberships where seller_id = v_seller and user_id = v_user and status <> 'removed'
  ) then
    raise exception 'OWN_SHOP' using errcode = '55000';
  end if;

  select * into v_conversation from public.conversations
  where buyer_id = v_user and seller_id = v_seller
    and coalesce(product_id, vehicle_listing_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(p_product, p_vehicle, '00000000-0000-0000-0000-000000000000'::uuid)
  for update;
  if not found then
    perform private.hit_rate_limit('conversations:' || v_user, 'messages.max_new_conversations_per_hour');
    insert into public.conversations (buyer_id, seller_id, product_id, vehicle_listing_id)
    values (v_user, v_seller, p_product, p_vehicle)
    returning * into v_conversation;
  elsif v_conversation.status = 'closed' then
    -- Writing again reopens it, as either side may (Q-35).
    update public.conversations set status = 'open', closed_by = null, closed_at = null
    where id = v_conversation.id returning * into v_conversation;
  end if;

  perform private.post_message(v_conversation, 'buyer', p_body);
  return v_conversation.id;
end;
$$;

create function public.send_message(p_conversation uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations;
  v_side text;
begin
  perform private.require_active_account();
  select * into v_conversation from public.conversations where id = p_conversation for update;
  v_side := case when found then private.conversation_side(v_conversation.buyer_id, v_conversation.seller_id) end;
  -- Someone outside the conversation learns nothing about it, not even that it exists.
  if v_side is null then
    raise exception 'CONVERSATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_side = 'seller' and not private.has_seller_permission(v_conversation.seller_id, 'messages.respond') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if v_conversation.status = 'closed' then
    raise exception 'CONVERSATION_CLOSED' using errcode = '55000';
  end if;
  if v_side = 'buyer' and not exists (select 1 from public.sellers where id = v_conversation.seller_id and status = 'active') then
    raise exception 'SHOP_UNAVAILABLE' using errcode = '55000';
  end if;
  return private.post_message(v_conversation, v_side, p_body);
end;
$$;

-- The caller's one inbox: conversations as a buyer and for every shop they work for.
create function public.my_conversations(p_archived boolean default false)
returns table (
  id uuid,
  side text,
  status text,
  other_name text,
  shop_name text,
  shop_slug text,
  listing_type text,
  listing_name text,
  listing_slug text,
  last_message_at timestamptz,
  last_body text,
  last_from_me boolean,
  unread integer,
  can_reply boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select c.*, private.conversation_side(c.buyer_id, c.seller_id) as side
    from public.conversations c
    where c.buyer_id = auth.uid()
      or c.seller_id in (
        select s.id from public.sellers s where s.owner_user_id = auth.uid()
        union select m.seller_id from public.seller_staff_memberships m where m.user_id = auth.uid() and m.status = 'active'
      )
  )
  select
    c.id, c.side, c.status,
    case when c.side = 'buyer' then s.name else coalesce(nullif(bp.display_name, ''), '') end,
    s.name, s.slug,
    case when c.product_id is not null then 'product' when c.vehicle_listing_id is not null then 'vehicle' end,
    coalesce(p.name, v.year || ' ' || v.make || ' ' || v.model),
    coalesce(p.slug, v.slug),
    c.last_message_at,
    last.body,
    last.sender_id = auth.uid(),
    (select count(*)::integer from public.messages m
      where m.conversation_id = c.id and m.sender_side <> c.side and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)),
    c.side = 'buyer' or private.has_seller_permission(c.seller_id, 'messages.respond')
  from mine c
  join public.sellers s on s.id = c.seller_id
  join public.profiles bp on bp.id = c.buyer_id
  left join public.products p on p.id = c.product_id
  left join public.vehicle_listings v on v.id = c.vehicle_listing_id
  left join public.conversation_reads r on r.conversation_id = c.id and r.user_id = auth.uid()
  left join lateral (
    select m.body, m.sender_id from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1
  ) last on true
  where c.side is not null and (r.archived_at is not null) = coalesce(p_archived, false)
  order by c.last_message_at desc
  limit 200;
$$;

-- A conversation's messages, newest first, a page at a time. A buyer sees the shop's
-- name on the shop's replies; the shop's own people see which of them wrote each one.
create function public.conversation_messages(p_conversation uuid, p_before timestamptz default null, p_limit integer default 50)
returns table (id uuid, sender_side text, sender_name text, from_me boolean, body text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations;
  v_side text;
begin
  select * into v_conversation from public.conversations c where c.id = p_conversation;
  v_side := case when found then private.conversation_side(v_conversation.buyer_id, v_conversation.seller_id) end;
  if v_side is null then
    raise exception 'CONVERSATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  return query
  select m.id, m.sender_side,
    case
      when m.sender_side = 'seller' and v_side = 'buyer' then s.name
      else coalesce(nullif(sp.display_name, ''), '')
    end,
    m.sender_id = auth.uid(), m.body, m.created_at
  from public.messages m
  join public.sellers s on s.id = v_conversation.seller_id
  left join public.profiles sp on sp.id = m.sender_id
  where m.conversation_id = p_conversation and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit greatest(least(coalesce(p_limit, 50), 100), 1);
end;
$$;

create function private.require_conversation_side(p_conversation uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_side text;
begin
  perform private.require_active_account();
  select private.conversation_side(c.buyer_id, c.seller_id) into v_side from public.conversations c where c.id = p_conversation;
  if v_side is null then
    raise exception 'CONVERSATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_side;
end;
$$;
revoke all on function private.require_conversation_side(uuid) from public;

create function public.mark_conversation_read(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_conversation_side(p_conversation);
  insert into public.conversation_reads (conversation_id, user_id, last_read_at)
  values (p_conversation, auth.uid(), clock_timestamp())
  on conflict (conversation_id, user_id) do update set last_read_at = clock_timestamp();
end;
$$;

-- Archiving only tidies the caller's own list (Q-35).
create function public.set_conversation_archived(p_conversation uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_conversation_side(p_conversation);
  insert into public.conversation_reads (conversation_id, user_id, archived_at)
  values (p_conversation, auth.uid(), case when p_archived then now() end)
  on conflict (conversation_id, user_id) do update set archived_at = case when p_archived then now() end;
end;
$$;

-- Closing stops new messages for both sides until either reopens it (Q-35).
create function public.set_conversation_status(p_conversation uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_side text := private.require_conversation_side(p_conversation);
  v_conversation public.conversations;
begin
  if p_status is null or p_status not in ('open', 'closed') then
    raise exception 'DETAILS_INVALID' using errcode = '23514';
  end if;
  select * into v_conversation from public.conversations where id = p_conversation for update;
  if v_side = 'seller' and not private.has_seller_permission(v_conversation.seller_id, 'messages.respond') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  update public.conversations
  set status = p_status,
      closed_by = case when p_status = 'closed' then auth.uid() end,
      closed_at = case when p_status = 'closed' then now() end
  where id = p_conversation and status <> p_status;
end;
$$;

-- For the header: how many conversations have something the caller has not read.
create function public.unread_conversation_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.my_conversations(false) where unread > 0;
$$;

-- Super Admin only. Finding conversations shows who wrote to which shop, never what was
-- said. Reading one needs a reason, and every reading is in the audit log (Q-36).
create function public.admin_find_conversations(p_search text default null, p_limit integer default 20, p_offset integer default 0)
returns table (
  id uuid,
  buyer_name text,
  buyer_email text,
  shop_name text,
  listing_name text,
  status text,
  message_count integer,
  last_message_at timestamptz,
  total bigint
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
  select c.id, coalesce(bp.display_name, ''), u.email::text, s.name,
    coalesce(p.name, v.year || ' ' || v.make || ' ' || v.model),
    c.status,
    (select count(*)::integer from public.messages m where m.conversation_id = c.id),
    c.last_message_at,
    count(*) over ()
  from public.conversations c
  join public.sellers s on s.id = c.seller_id
  join public.profiles bp on bp.id = c.buyer_id
  left join auth.users u on u.id = c.buyer_id
  left join public.products p on p.id = c.product_id
  left join public.vehicle_listings v on v.id = c.vehicle_listing_id
  where v_search is null
    or u.email ilike '%' || v_search || '%' or bp.display_name ilike '%' || v_search || '%' or s.name ilike '%' || v_search || '%'
  order by c.last_message_at desc
  limit greatest(least(coalesce(p_limit, 20), 100), 1) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create function public.admin_read_conversation(p_conversation uuid, p_reason text)
returns table (id uuid, sender_side text, sender_name text, body text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
begin
  if not private.is_super_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  v_reason := private.moderation_reason(p_reason);
  if not exists (select 1 from public.conversations c where c.id = p_conversation) then
    raise exception 'CONVERSATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.write_audit('conversation.admin_read', 'conversation', p_conversation::text, v_reason, '{}'::jsonb);
  return query
  select m.id, m.sender_side,
    case when m.sender_side = 'seller' then s.name || coalesce(' (' || nullif(sp.display_name, '') || ')', '') else coalesce(sp.display_name, '') end,
    m.body, m.created_at
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  join public.sellers s on s.id = c.seller_id
  left join public.profiles sp on sp.id = m.sender_id
  where m.conversation_id = p_conversation
  order by m.created_at;
end;
$$;

-- Limits for the two new settings, so Super Admin can change them safely.
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
    ('messages.max_new_conversations_per_hour', 1, 100)
  ) as r (k, lo, hi) where r.k = p_key;

  -- A number with no limits listed here is refused, so a new one has to be given some.
  return v_min is not null
    and (p_value #>> '{}')::numeric between v_min and v_max
    and (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric);
end;
$$;
revoke all on function private.setting_value_is_valid(text, jsonb) from public;

revoke execute on function public.start_conversation(text, uuid, uuid, text) from public, anon;
grant execute on function public.start_conversation(text, uuid, uuid, text) to authenticated;
revoke execute on function public.send_message(uuid, text) from public, anon;
grant execute on function public.send_message(uuid, text) to authenticated;
revoke execute on function public.my_conversations(boolean) from public, anon;
grant execute on function public.my_conversations(boolean) to authenticated;
revoke execute on function public.conversation_messages(uuid, timestamptz, integer) from public, anon;
grant execute on function public.conversation_messages(uuid, timestamptz, integer) to authenticated;
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
revoke execute on function public.set_conversation_archived(uuid, boolean) from public, anon;
grant execute on function public.set_conversation_archived(uuid, boolean) to authenticated;
revoke execute on function public.set_conversation_status(uuid, text) from public, anon;
grant execute on function public.set_conversation_status(uuid, text) to authenticated;
revoke execute on function public.unread_conversation_count() from public, anon;
grant execute on function public.unread_conversation_count() to authenticated;
revoke execute on function public.admin_find_conversations(text, integer, integer) from public, anon;
grant execute on function public.admin_find_conversations(text, integer, integer) to authenticated;
revoke execute on function public.admin_read_conversation(uuid, text) from public, anon;
grant execute on function public.admin_read_conversation(uuid, text) to authenticated;
