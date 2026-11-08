-- Read indicators (owner's request, 2026-11-08): a sender sees whether the other side has
-- read their messages. For a shop, any of its people with message access reading counts.
-- Super Admin reading a conversation (Q-36) never counts, as it writes no read mark.

alter table public.conversations
  add column buyer_read_at timestamptz,
  add column seller_read_at timestamptz;

update public.conversations c set
  buyer_read_at = (select r.last_read_at from public.conversation_reads r where r.conversation_id = c.id and r.user_id = c.buyer_id),
  seller_read_at = (select max(r.last_read_at) from public.conversation_reads r where r.conversation_id = c.id and r.user_id <> c.buyer_id);

-- Moves a side's mark only when there is something newer to read, so reading the same
-- messages again changes nothing and sends no Realtime update.
create function private.record_side_read(p_conversation uuid, p_side text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversations
  set buyer_read_at = case when p_side = 'buyer' then clock_timestamp() else buyer_read_at end,
      seller_read_at = case when p_side = 'seller' then clock_timestamp() else seller_read_at end
  where id = p_conversation
    and coalesce(case when p_side = 'buyer' then buyer_read_at else seller_read_at end, '-infinity'::timestamptz) < last_message_at;
$$;
revoke all on function private.record_side_read(uuid, text) from public;

create or replace function public.mark_conversation_read(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_side text := private.require_conversation_side(p_conversation);
begin
  insert into public.conversation_reads (conversation_id, user_id, last_read_at)
  values (p_conversation, auth.uid(), clock_timestamp())
  on conflict (conversation_id, user_id) do update set last_read_at = clock_timestamp();
  perform private.record_side_read(p_conversation, v_side);
end;
$$;

-- Sending counts as having read everything before it.
create or replace function private.post_message(p_conversation public.conversations, p_side text, p_body text)
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
  perform private.record_side_read(p_conversation.id, p_side);

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

-- Adds whether each message from the caller's side has been read by the other side.
drop function public.conversation_messages(uuid, timestamptz, integer);
create function public.conversation_messages(p_conversation uuid, p_before timestamptz default null, p_limit integer default 50)
returns table (id uuid, sender_side text, sender_name text, from_me boolean, body text, created_at timestamptz, read boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations;
  v_side text;
  v_other_read timestamptz;
begin
  select * into v_conversation from public.conversations c where c.id = p_conversation;
  v_side := case when found then private.conversation_side(v_conversation.buyer_id, v_conversation.seller_id) end;
  if v_side is null then
    raise exception 'CONVERSATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_other_read := case when v_side = 'buyer' then v_conversation.seller_read_at else v_conversation.buyer_read_at end;
  return query
  select m.id, m.sender_side,
    case
      when m.sender_side = 'seller' and v_side = 'buyer' then s.name
      else coalesce(nullif(sp.display_name, ''), '')
    end,
    m.sender_id = auth.uid(), m.body, m.created_at,
    case when m.sender_side = v_side then coalesce(m.created_at <= v_other_read, false) end
  from public.messages m
  join public.sellers s on s.id = v_conversation.seller_id
  left join public.profiles sp on sp.id = m.sender_id
  where m.conversation_id = p_conversation and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit greatest(least(coalesce(p_limit, 50), 100), 1);
end;
$$;

-- Adds whether the latest message, if from the caller's side, has been read.
drop function public.my_conversations(boolean);
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
  can_reply boolean,
  last_read boolean
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
    c.side = 'buyer' or private.has_seller_permission(c.seller_id, 'messages.respond'),
    case when last.sender_side = c.side then
      coalesce(last.created_at <= case when c.side = 'buyer' then c.seller_read_at else c.buyer_read_at end, false)
    end
  from mine c
  join public.sellers s on s.id = c.seller_id
  join public.profiles bp on bp.id = c.buyer_id
  left join public.products p on p.id = c.product_id
  left join public.vehicle_listings v on v.id = c.vehicle_listing_id
  left join public.conversation_reads r on r.conversation_id = c.id and r.user_id = auth.uid()
  left join lateral (
    select m.body, m.sender_id, m.sender_side, m.created_at from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1
  ) last on true
  where c.side is not null and (r.archived_at is not null) = coalesce(p_archived, false)
  order by c.last_message_at desc
  limit 200;
$$;

revoke execute on function public.conversation_messages(uuid, timestamptz, integer) from public, anon;
grant execute on function public.conversation_messages(uuid, timestamptz, integer) to authenticated;
revoke execute on function public.my_conversations(boolean) from public, anon;
grant execute on function public.my_conversations(boolean) to authenticated;
