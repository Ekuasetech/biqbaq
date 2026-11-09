-- "What customers say" on the front page, written by Super Admin (owner's request of
-- 2026-11-08): each quote has the customer's words, name and city. Only published quotes
-- show, in Super Admin's order; with none published, the section is hidden.

create table public.testimonials (
  id uuid primary key default gen_random_uuid(),
  quote text not null check (char_length(quote) between 1 and 500),
  name text not null check (char_length(name) between 1 and 80),
  city text not null default '' check (char_length(city) <= 80),
  published boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index testimonials_order on public.testimonials (sort_order, created_at);
create trigger set_updated_at before update on public.testimonials
  for each row execute function private.set_updated_at();
alter table public.testimonials enable row level security;
-- No policies: visitors read the view below, and only these functions change the table.

create view public.public_testimonials as
  select id, quote, name, city, sort_order, created_at from public.testimonials where published;
grant select on public.public_testimonials to anon, authenticated;

-- Super Admin's list: every quote, published or not, in order.
create function public.admin_list_testimonials()
returns table (id uuid, quote text, name text, city text, published boolean, sort_order integer, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query select t.id, t.quote, t.name, t.city, t.published, t.sort_order, t.updated_at
  from public.testimonials t order by t.sort_order, t.created_at;
end;
$$;
revoke execute on function public.admin_list_testimonials() from public, anon;
grant execute on function public.admin_list_testimonials() to authenticated;

-- Adds a quote (no id) at the end, or changes one. Returns its id.
create function public.admin_save_testimonial(p_id uuid, p_quote text, p_name text, p_city text, p_published boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_super_admin();
  v_quote text := btrim(coalesce(p_quote, ''));
  v_name text := btrim(coalesce(p_name, ''));
  v_city text := btrim(coalesce(p_city, ''));
  v_id uuid;
begin
  if char_length(v_quote) not between 1 and 500 or char_length(v_name) not between 1 and 80 or char_length(v_city) > 80 or p_published is null then
    raise exception 'DETAILS_INVALID' using errcode = '23514';
  end if;
  if p_id is null then
    if (select count(*) from public.testimonials) >= 50 then
      raise exception 'TOO_MANY' using errcode = '55000';
    end if;
    insert into public.testimonials (quote, name, city, published, sort_order, created_by)
    values (v_quote, v_name, v_city, p_published, coalesce((select max(sort_order) + 1 from public.testimonials), 0), v_actor)
    returning id into v_id;
    perform private.write_audit('testimonial.create', 'testimonial', v_id::text, null, jsonb_build_object('published', p_published));
  else
    update public.testimonials set quote = v_quote, name = v_name, city = v_city, published = p_published
    where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'TESTIMONIAL_NOT_FOUND' using errcode = 'P0002';
    end if;
    perform private.write_audit('testimonial.edit', 'testimonial', v_id::text, null, jsonb_build_object('published', p_published));
  end if;
  return v_id;
end;
$$;
revoke execute on function public.admin_save_testimonial(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.admin_save_testimonial(uuid, text, text, text, boolean) to authenticated;

create function public.admin_delete_testimonial(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  delete from public.testimonials where id = p_id;
  if not found then
    raise exception 'TESTIMONIAL_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform private.write_audit('testimonial.delete', 'testimonial', p_id::text, null, '{}'::jsonb);
end;
$$;
revoke execute on function public.admin_delete_testimonial(uuid) from public, anon;
grant execute on function public.admin_delete_testimonial(uuid) to authenticated;

-- Moves a quote one place earlier (-1) or later (1) in the order.
create function public.admin_move_testimonial(p_id uuid, p_direction integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_index integer;
  v_other integer;
begin
  perform private.require_super_admin();
  if p_direction not in (-1, 1) then
    raise exception 'DETAILS_INVALID' using errcode = '23514';
  end if;
  select array_agg(id order by sort_order, created_at) into v_ids from public.testimonials;
  v_index := array_position(v_ids, p_id);
  if v_index is null then
    raise exception 'TESTIMONIAL_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_other := v_index + p_direction;
  if v_other < 1 or v_other > array_length(v_ids, 1) then
    return;
  end if;
  v_ids[v_index] := v_ids[v_other];
  v_ids[v_other] := p_id;
  -- Renumbered from the new order, so positions stay simple.
  update public.testimonials t set sort_order = o.n - 1
  from unnest(v_ids) with ordinality as o(id, n) where t.id = o.id;
  perform private.write_audit('testimonial.move', 'testimonial', p_id::text, null, jsonb_build_object('direction', p_direction));
end;
$$;
revoke execute on function public.admin_move_testimonial(uuid, integer) from public, anon;
grant execute on function public.admin_move_testimonial(uuid, integer) to authenticated;
