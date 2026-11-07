-- Sellers edit their shop's details through one function, so every change is checked the
-- same way and audited. It replaces direct updates, which could skip the audit log and
-- could not reach the private contact details. The slug never changes, so shared links keep working.

drop policy "owner edits own shop" on public.sellers;
revoke update (name, city, category, description) on public.sellers from authenticated;

create function public.update_my_shop(
  p_name text,
  p_city text,
  p_category text,
  p_description text,
  p_contact_information text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_shop public.sellers%rowtype;
  v_old_contact text;
  v_name text := btrim(coalesce(p_name, ''));
  v_city text := btrim(coalesce(p_city, ''));
  v_description text := btrim(coalesce(p_description, ''));
  v_contact text := btrim(coalesce(p_contact_information, ''));
  v_changed text[] := '{}';
begin
  select * into v_shop from public.sellers where owner_user_id = v_user for update;
  -- A suspended shop or role can read its details, but not change them.
  if not found or not private.is_active_seller_owner(v_shop.id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if v_name = '' or v_city = '' or v_description = '' or v_contact = '' then
    raise exception 'DETAILS_REQUIRED' using errcode = '23514';
  end if;
  if char_length(v_name) > 150 or char_length(v_city) > 100 or char_length(v_description) > 1000 or char_length(v_contact) > 200 then
    raise exception 'DETAILS_TOO_LONG' using errcode = '23514';
  end if;
  if not exists (select 1 from public.categories where slug = p_category) then
    raise exception 'CATEGORY_NOT_FOUND' using errcode = '23514';
  end if;

  select contact_information into v_old_contact from public.seller_private where seller_id = v_shop.id;

  if v_name <> v_shop.name then v_changed := array_append(v_changed, 'name'); end if;
  if v_city <> v_shop.city then v_changed := array_append(v_changed, 'city'); end if;
  if p_category is distinct from v_shop.category then v_changed := array_append(v_changed, 'category'); end if;
  if v_description <> v_shop.description then v_changed := array_append(v_changed, 'description'); end if;
  if v_contact is distinct from v_old_contact then v_changed := array_append(v_changed, 'contact_information'); end if;

  if cardinality(v_changed) = 0 then
    return;
  end if;

  update public.sellers
  set name = v_name, city = v_city, category = p_category, description = v_description
  where id = v_shop.id;

  insert into public.seller_private (seller_id, contact_information)
  values (v_shop.id, v_contact)
  on conflict (seller_id) do update set contact_information = excluded.contact_information;

  -- Records what changed, with the old and new public name. The private details and the
  -- full description are not copied into the log.
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (v_user, 'seller.profile_update', 'seller', v_shop.id::text, jsonb_build_object(
    'changed', to_jsonb(v_changed),
    'old_name', case when 'name' = any (v_changed) then v_shop.name end,
    'new_name', case when 'name' = any (v_changed) then v_name end
  ));
end;
$$;

revoke execute on function public.update_my_shop(text, text, text, text, text) from public, anon;
grant execute on function public.update_my_shop(text, text, text, text, text) to authenticated;
