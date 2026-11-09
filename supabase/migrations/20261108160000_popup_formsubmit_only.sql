-- The sign-up pop-up uses FormSubmit only (owner's decision of 2026-11-08, changing Q-57):
-- a sign-up is no longer added to Biqbaq's own email list and is sent no confirmation
-- email. The server only checks the pop-up is on, the address looks right and the limits
-- allow it, then FormSubmit tells the owner's address. Biqbaq keeps no copy of it.

drop function public.subscribe_from_popup(text, text, text);
create function public.subscribe_from_popup(p_email text, p_ip_hash text, p_locale text)
returns table (notify_email text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not private.setting_is_on('subscribe_popup.enabled') then
    raise exception 'POPUP_OFF' using errcode = '55000';
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@\s<>",;]+@[^@\s<>",;]+\.[a-z]{2,}$' then
    raise exception 'EMAIL_INVALID' using errcode = '23514';
  end if;
  perform private.hit_rate_limit('subscribe_popup:ip:' || coalesce(p_ip_hash, 'unknown'), 'subscribe_popup.max_per_ip_hour');
  perform private.hit_rate_limit('subscribe_popup:all', 'subscribe_popup.max_per_hour');
  return query select (select value #>> '{}' from public.platform_settings where key = 'subscribe_popup.notify_email');
end;
$$;
revoke execute on function public.subscribe_from_popup(text, text, text) from public, anon, authenticated;
grant execute on function public.subscribe_from_popup(text, text, text) to service_role;
