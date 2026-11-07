-- What the Super Admin settings and audit log screens need (PRD §16, §23.3).

-- Each setting has its own limits, so a slip cannot quietly break the feature it controls,
-- such as a photo limit of 0 bytes or a list with no allowed formats.
create function private.setting_value_is_valid(p_key text, p_value jsonb)
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
    ('media.max_images', 1, 20)
  ) as r (k, lo, hi) where r.k = p_key;

  -- A number with no limits listed here is refused, so a new one has to be given some.
  return v_min is not null
    and (p_value #>> '{}')::numeric between v_min and v_max
    and (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric);
end;
$$;

revoke all on function private.setting_value_is_valid(text, jsonb) from public;

create or replace function public.update_platform_setting(p_key text, p_value jsonb, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_super_admin();
  v_old jsonb;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_reason is null then
    raise exception 'REASON_REQUIRED' using errcode = '23514';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'REASON_TOO_LONG' using errcode = '23514';
  end if;

  select value into v_old from public.platform_settings where key = p_key for update;
  if not found then
    raise exception 'SETTING_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_value is null or jsonb_typeof(p_value) <> jsonb_typeof(v_old) then
    raise exception 'SETTING_WRONG_TYPE' using errcode = '23514';
  end if;
  if not private.setting_value_is_valid(p_key, p_value) then
    raise exception 'SETTING_OUT_OF_RANGE' using errcode = '23514';
  end if;

  -- Nothing changed, so there is nothing to record.
  if p_value = v_old then
    return;
  end if;

  update public.platform_settings
  set value = p_value, updated_by = v_actor
  where key = p_key;

  insert into public.platform_settings_history (key, old_value, new_value, actor_id, reason)
  values (p_key, v_old, p_value, v_actor, v_reason);

  perform private.write_audit('setting.update', 'platform_setting', p_key, v_reason,
    jsonb_build_object('old', v_old, 'new', p_value));
end;
$$;

create function public.admin_setting_history(p_limit integer default 20)
returns table (
  id uuid,
  key text,
  old_value jsonb,
  new_value jsonb,
  actor_name text,
  actor_email text,
  reason text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_super_admin();
  return query
    select h.id, h.key, h.old_value, h.new_value, p.display_name, u.email::text, h.reason, h.created_at
    from public.platform_settings_history h
    left join public.profiles p on p.id = h.actor_id
    left join auth.users u on u.id = h.actor_id
    order by h.created_at desc, h.id
    limit greatest(least(coalesce(p_limit, 20), 100), 1);
end;
$$;

create function public.admin_audit_log(
  p_action text default null,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  actor_name text,
  actor_email text,
  action text,
  target_type text,
  target_id text,
  target_label text,
  on_behalf_of_seller text,
  reason text,
  metadata jsonb,
  created_at timestamptz,
  total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- Treats % and _ in a search as ordinary characters, not wildcards.
  v_pattern text := case when nullif(btrim(p_search), '') is null then null else
    '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end;
begin
  perform private.require_super_admin();

  return query
    with rows as (
      select
        a.id, p.display_name as actor_name, u.email::text as actor_email, a.action, a.target_type, a.target_id,
        case a.target_type
          when 'seller' then (select s.name from public.sellers s where s.id::text = a.target_id)
          when 'product' then (select pr.name from public.products pr where pr.id::text = a.target_id)
          when 'role_application' then (
            select ua.email::text from public.role_applications ra
            join auth.users ua on ua.id = ra.applicant_id where ra.id::text = a.target_id
          )
          else null
        end as target_label,
        b.name as on_behalf_of_seller, a.reason, a.metadata, a.created_at
      from public.audit_logs a
      left join public.profiles p on p.id = a.actor_id
      left join auth.users u on u.id = a.actor_id
      left join public.sellers b on b.id = a.on_behalf_of_seller_id
      where p_action is null or a.action = p_action
    ), matching as (
      select * from rows r
      where v_pattern is null
        or r.actor_name ilike v_pattern or r.actor_email ilike v_pattern or r.action ilike v_pattern
        or r.target_id ilike v_pattern or r.target_label ilike v_pattern or r.reason ilike v_pattern
    )
    select m.id, m.actor_name, m.actor_email, m.action, m.target_type, m.target_id, m.target_label,
      m.on_behalf_of_seller, m.reason, m.metadata, m.created_at, count(*) over ()
    from matching m
    order by m.created_at desc, m.id
    limit greatest(least(coalesce(p_limit, 25), 100), 1)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.update_platform_setting(text, jsonb, text) from public, anon;
revoke execute on function public.admin_setting_history(integer) from public, anon;
revoke execute on function public.admin_audit_log(text, text, integer, integer) from public, anon;
grant execute on function public.update_platform_setting(text, jsonb, text) to authenticated;
grant execute on function public.admin_setting_history(integer) to authenticated;
grant execute on function public.admin_audit_log(text, text, integer, integer) to authenticated;
