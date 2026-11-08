-- The dashboard's top-bar search (owner's redesign, step 3, Q-56): the caller's own things.
-- A seller finds their shop's products, cargo cars, clients and invoices; everyone finds
-- their conversations; Super Admin also finds people and shops, and Biqbaq's own clients
-- and invoices. It reads only what the caller could already open on those pages.

create function public.search_my_things(p_query text)
returns table (kind text, id text, title text, detail text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_term text := btrim(coalesce(p_query, ''));
  v_like text;
  v_shop uuid;
  v_list uuid;
  v_platform uuid;
  v_super boolean := private.is_super_admin();
begin
  if v_user is null then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if char_length(v_term) < 2 then
    return;
  end if;
  -- Typed % and _ are searched for as themselves.
  v_like := '%' || replace(replace(replace(left(v_term, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  select s.id into v_shop from public.sellers s where s.owner_user_id = v_user and private.is_active_seller_owner(s.id);
  if v_shop is not null then
    select l.id into v_list from public.email_lists l where l.seller_id = v_shop and l.enabled;

    return query
    select 'product', p.id::text, p.name, p.status
    from public.products p
    where p.seller_id = v_shop and p.deleted_at is null and p.name ilike v_like
    order by p.updated_at desc limit 5;

    return query
    select 'vehicle', v.id::text, v.year || ' ' || v.make || ' ' || v.model, v.origin_city || ' → ' || v.destination_city
    from public.vehicle_listings v
    where v.seller_id = v_shop and v.deleted_at is null
      and (v.make ilike v_like or v.model ilike v_like or (v.year || ' ' || v.make || ' ' || v.model) ilike v_like or v.origin_city ilike v_like)
    order by v.departure_date desc limit 5;
  end if;

  if v_super then
    select l.id into v_platform from public.email_lists l where l.owner_type = 'platform';
  end if;

  -- Clients and invoices: the shop's, then Biqbaq's for Super Admin (each marked by "list").
  return query
  select case when s.list_id = v_platform then 'biqbaq_client' else 'client' end, s.email, coalesce(s.name, s.email),
    s.email || coalesce(' · ' || s.phone, '')
  from public.list_subscribers s
  where s.list_id in (v_list, v_platform)
    and (s.email ilike v_like or s.name ilike v_like or s.phone ilike v_like)
  order by s.created_at desc limit 5;

  return query
  select case when i.list_id = v_platform then 'biqbaq_invoice' else 'invoice' end, i.id::text,
    private.invoice_label(i.kind, i.number), i.client_name
  from public.invoices i
  where i.list_id in (v_list, v_platform)
    and (private.invoice_label(i.kind, i.number) ilike v_like or i.client_name ilike v_like or i.client_email ilike v_like)
  order by i.created_at desc limit 5;

  return query
  select 'conversation', c.id::text,
    case when c.side = 'buyer' then c.shop_name else coalesce(nullif(c.other_name, ''), c.shop_name) end,
    coalesce(c.listing_name, c.last_body)
  from public.my_conversations(false) c
  where c.shop_name ilike v_like or c.other_name ilike v_like or c.listing_name ilike v_like
  limit 5;

  if v_super then
    return query
    select 'person', u.email::text, coalesce(nullif(p.display_name, ''), u.email::text), u.email::text
    from public.profiles p join auth.users u on u.id = p.id
    where p.display_name ilike v_like or u.email ilike v_like
    order by p.created_at desc limit 5;

    return query
    select 'shop', s.slug, s.name, s.city
    from public.sellers s
    where s.name ilike v_like or s.slug ilike v_like
    order by s.created_at desc limit 5;
  end if;
end;
$$;

revoke execute on function public.search_my_things(text) from public, anon;
grant execute on function public.search_my_things(text) to authenticated;
