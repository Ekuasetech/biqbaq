-- Pages for the lists that loaded everything at once, or stopped at a hidden limit (owner's
-- request of 2026-11-08): a buyer's favourites, a seller's cargo cars, and the invoices and
-- sent emails of a shop or of Biqbaq. Each now takes a page (limit and offset, at most 100
-- at a time) and returns how many there are in all, as `total`, as the admin lists do.
-- Who may see what is unchanged.

drop function public.my_favourites();
create function public.my_favourites(p_limit integer default 20, p_offset integer default 0)
returns table (product_id uuid, slug text, name text, price_minor integer, currency text, image_url text, available boolean,
  saved_at timestamptz, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select f.product_id, pp.slug, pp.name, pp.price_minor, pp.currency, pp.images -> 0 ->> 'url', pp.id is not null, f.created_at,
    count(*) over ()
  from public.favourites f
  left join public.public_products pp on pp.id = f.product_id
  where f.user_id = auth.uid()
  order by f.created_at desc, f.product_id
  limit greatest(least(coalesce(p_limit, 20), 100), 1) offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke execute on function public.my_favourites(integer, integer) from public, anon;
grant execute on function public.my_favourites(integer, integer) to authenticated;

drop function public.my_vehicle_listings();
create function public.my_vehicle_listings(p_limit integer default 20, p_offset integer default 0)
returns table (id uuid, slug text, make text, model text, year integer, origin_city text, destination_city text, departure_date date,
  available_kg integer, restrictions text[], cargo_status text, status text, views bigint, photos jsonb, is_public boolean, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.slug, v.make, v.model, v.year, v.origin_city, v.destination_city, v.departure_date, v.available_kg, v.restrictions,
    v.cargo_status, v.status,
    coalesce((select t.views from public.vehicle_view_totals t where t.vehicle_listing_id = v.id), 0)::bigint,
    coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'secure_url', m.secure_url, 'is_primary', m.is_primary, 'display_order', m.display_order, 'entity_id', m.entity_id) order by m.is_primary desc, m.display_order)
      from public.media_assets m where m.entity_type = 'vehicle' and m.entity_id = v.id), '[]'::jsonb),
    exists (select 1 from public.public_vehicle_listings pv where pv.id = v.id),
    count(*) over ()
  from public.vehicle_listings v
  join public.sellers s on s.id = v.seller_id
  where s.owner_user_id = auth.uid() and v.deleted_at is null
  order by v.departure_date, v.id
  limit greatest(least(coalesce(p_limit, 20), 100), 1) offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke execute on function public.my_vehicle_listings(integer, integer) from public, anon;
grant execute on function public.my_vehicle_listings(integer, integer) to authenticated;

drop function public.list_invoices(uuid);
create function public.list_invoices(p_seller uuid, p_limit integer default 20, p_offset integer default 0)
returns table (id uuid, kind text, label text, client_name text, client_email text, total_minor bigint, issue_date date,
  created_at timestamptz, send_count integer, total bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.email_lists := private.require_list(p_seller);
begin
  return query
  select i.id, i.kind, private.invoice_label(i.kind, i.number), i.client_name, i.client_email, i.total_minor, i.issue_date, i.created_at,
    i.send_count, count(*) over ()
  from public.invoices i where i.list_id = v_list.id
  order by i.created_at desc, i.id
  limit greatest(least(coalesce(p_limit, 20), 100), 1) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke execute on function public.list_invoices(uuid, integer, integer) from public, anon;
grant execute on function public.list_invoices(uuid, integer, integer) to authenticated;

drop function public.list_email_campaigns(uuid);
create function public.list_email_campaigns(p_seller uuid, p_limit integer default 20, p_offset integer default 0)
returns table (id uuid, subject text, recipients integer, created_at timestamptz, single_email text, total bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list public.email_lists := private.require_list(p_seller);
begin
  return query
  select c.id, c.subject, c.recipients, c.created_at, c.single_email, count(*) over () from public.email_campaigns c
  where c.list_id = v_list.id
  order by c.created_at desc, c.id
  limit greatest(least(coalesce(p_limit, 20), 100), 1) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke execute on function public.list_email_campaigns(uuid, integer, integer) from public, anon;
grant execute on function public.list_email_campaigns(uuid, integer, integer) to authenticated;
