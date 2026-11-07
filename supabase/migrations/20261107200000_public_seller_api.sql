-- The public seller product API (PRD §10). It reads the public views, so it can only ever
-- return what any visitor could already see. This adds only its rate limit.

insert into public.platform_settings (key, value, description, is_public) values
  ('api.max_requests_per_hour', '600', 'Most public seller API requests one internet address may make in an hour', false);

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
    ('api.max_requests_per_hour', 10, 100000)
  ) as r (k, lo, hi) where r.k = p_key;

  -- A number with no limits listed here is refused, so a new one has to be given some.
  return v_min is not null
    and (p_value #>> '{}')::numeric between v_min and v_max
    and (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric);
end;
$$;

-- Counts one request. Only the server calls it, with a scrambled address.
create function public.count_public_api_request(p_ip_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.hit_rate_limit('api:' || p_ip_hash, 'api.max_requests_per_hour');
end;
$$;

revoke all on function private.setting_value_is_valid(text, jsonb) from public;
revoke execute on function public.count_public_api_request(text) from public, anon, authenticated;
grant execute on function public.count_public_api_request(text) to service_role;
