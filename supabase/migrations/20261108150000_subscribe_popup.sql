-- The sign-up pop-up on public pages (owner's request of 2026-11-08). Visitors leave an email
-- address to hear about deals. Super Admin edits the message and button (English and French),
-- switches it on or off, and sets the address that is told about each new sign-up through
-- FormSubmit (studentxapp@gmail.com by default). Each sign-up also joins Biqbaq's own email
-- list as pending, and is sent the usual confirmation email: only those who confirm are ever
-- sent bulk email (Q-42), and the record keeps when and how they agreed (CASL).

insert into public.platform_settings (key, value, description, is_public) values
  ('subscribe_popup.enabled', 'true', 'Whether the sign-up pop-up shows on public pages', true),
  ('subscribe_popup.message_en', '"Subscribe to get good deals with Biqbaq"', 'The sign-up pop-up''s message, in English', true),
  ('subscribe_popup.message_fr', '"Abonnez-vous pour profiter de bonnes affaires avec Biqbaq"', 'The sign-up pop-up''s message, in French', true),
  ('subscribe_popup.button_en', '"Subscribe"', 'The sign-up pop-up''s button, in English', true),
  ('subscribe_popup.button_fr', '"S''abonner"', 'The sign-up pop-up''s button, in French', true),
  -- Private: the address is never shown on the public site.
  ('subscribe_popup.notify_email', '"studentxapp@gmail.com"', 'Who FormSubmit tells about each new sign-up', false),
  ('subscribe_popup.max_per_ip_hour', '5', 'Most sign-ups from one connection in an hour', false),
  ('subscribe_popup.max_per_hour', '200', 'Most sign-ups from everyone in an hour, to protect the inbox told about them', false);

-- Super Admin changes the pop-up. Each changed value goes through the audited settings
-- change, with the reason given.
create function public.admin_set_subscribe_popup(p_enabled boolean, p_message_en text, p_message_fr text, p_button_en text,
  p_button_fr text, p_notify_email text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message_en text := btrim(coalesce(p_message_en, ''));
  v_message_fr text := btrim(coalesce(p_message_fr, ''));
  v_button_en text := btrim(coalesce(p_button_en, ''));
  v_button_fr text := btrim(coalesce(p_button_fr, ''));
  v_email text := lower(btrim(coalesce(p_notify_email, '')));
begin
  perform private.require_super_admin();
  if p_enabled is null
    or char_length(v_message_en) not between 1 and 200 or char_length(v_message_fr) not between 1 and 200
    or char_length(v_button_en) not between 1 and 30 or char_length(v_button_fr) not between 1 and 30 then
    raise exception 'DETAILS_INVALID' using errcode = '23514';
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@\s<>",;]+@[^@\s<>",;]+\.[a-z]{2,}$' then
    raise exception 'EMAIL_INVALID' using errcode = '23514';
  end if;
  perform public.update_platform_setting('subscribe_popup.enabled', to_jsonb(p_enabled), p_reason);
  perform public.update_platform_setting('subscribe_popup.message_en', to_jsonb(v_message_en), p_reason);
  perform public.update_platform_setting('subscribe_popup.message_fr', to_jsonb(v_message_fr), p_reason);
  perform public.update_platform_setting('subscribe_popup.button_en', to_jsonb(v_button_en), p_reason);
  perform public.update_platform_setting('subscribe_popup.button_fr', to_jsonb(v_button_fr), p_reason);
  perform public.update_platform_setting('subscribe_popup.notify_email', to_jsonb(v_email), p_reason);
end;
$$;
revoke execute on function public.admin_set_subscribe_popup(boolean, text, text, text, text, text, text) from public, anon;
grant execute on function public.admin_set_subscribe_popup(boolean, text, text, text, text, text, text) to authenticated;

-- Server only: a visitor signs up from the pop-up. The answer never says whether the address
-- was already on the list, so the form cannot be used to find out who is. `notify_email` is
-- set only for a new sign-up, so the inbox is told once per address.
create function public.subscribe_from_popup(p_email text, p_ip_hash text, p_locale text)
returns table (is_new boolean, notify_email text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_list public.email_lists;
  v_row public.list_subscribers;
  v_user uuid;
begin
  if not private.setting_is_on('subscribe_popup.enabled') then
    raise exception 'POPUP_OFF' using errcode = '55000';
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@\s<>",;]+@[^@\s<>",;]+\.[a-z]{2,}$' then
    raise exception 'EMAIL_INVALID' using errcode = '23514';
  end if;
  perform private.hit_rate_limit('subscribe_popup:ip:' || coalesce(p_ip_hash, 'unknown'), 'subscribe_popup.max_per_ip_hour');
  perform private.hit_rate_limit('subscribe_popup:all', 'subscribe_popup.max_per_hour');

  insert into public.email_lists (owner_type, enabled) values ('platform', true) on conflict do nothing;
  select * into v_list from public.email_lists where owner_type = 'platform';
  select u.id into v_user from auth.users u join public.profiles p on p.id = u.id where lower(u.email) = v_email limit 1;

  -- A client Super Admin added (no consent yet) is now asking to join, so is sent the
  -- confirmation. Anyone pending, confirmed, unsubscribed or bounced is left as they are.
  insert into public.list_subscribers (list_id, email, user_id, status, source)
  values (v_list.id, v_email, v_user, 'pending', 'self')
  on conflict (list_id, email) do update set status = 'pending', source = 'self'
    where public.list_subscribers.status = 'client'
  returning * into v_row;
  if v_row.id is null then
    return query select false, null::text;
    return;
  end if;

  if private.setting_is_on('email.notifications_enabled') then
    -- Straight to the queue, not the bell: they have not confirmed yet.
    insert into public.background_jobs (type, user_id, payload, idempotency_key)
    values ('email', null,
      jsonb_build_object('template', 'list_confirm', 'to', v_email,
        'data', jsonb_build_object('shop', private.list_sender_name(v_list), 'token', v_row.token,
          'locale', case when p_locale = 'fr' then 'fr' else 'en' end)),
      'list_confirm:' || v_row.id);
  end if;
  return query select true, (select value #>> '{}' from public.platform_settings where key = 'subscribe_popup.notify_email');
end;
$$;
revoke execute on function public.subscribe_from_popup(text, text, text) from public, anon, authenticated;
grant execute on function public.subscribe_from_popup(text, text, text) to service_role;
