-- Google sign-in (Q-18): an account made through Google carries no referral code, as
-- Google's sign-up cannot carry Biqbaq's own details. The return from Google claims the
-- referral the browser remembered instead, under the same rules as an email sign-up
-- (Q-07, BD-11): once per person, never one's own code, only a usable code opened within
-- 30 days, and only for an account made in the last 15 minutes, so an existing account
-- cannot pick up credit later.

create function public.claim_signup_referral(p_code text, p_opened_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_row public.referral_codes;
  v_confirmed timestamptz;
  v_created timestamptz;
begin
  if v_user is null then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  select created_at, email_confirmed_at into v_created, v_confirmed from auth.users where id = v_user;
  if v_code !~ '^[A-Z0-9]{3,20}$' or p_opened_at is null or p_opened_at < now() - interval '30 days'
    or p_opened_at > now() + interval '1 minute' or v_created < now() - interval '15 minutes'
    or exists (select 1 from public.referral_attributions where referred_user_id = v_user) then
    return false;
  end if;
  select * into v_row from public.referral_codes where code = v_code;
  if not found or not private.referral_code_usable(v_row) or v_row.owner_user_id = v_user then
    return false;
  end if;
  insert into public.referral_attributions (referred_user_id, referral_code_id, referrer_user_id, owner_type, seller_id, code, registered_at, completed_at)
  values (v_user, v_row.id, v_row.owner_user_id, v_row.owner_type, v_row.seller_id, v_row.code, v_created,
    case when v_confirmed is not null then now() end)
  on conflict (referred_user_id) do nothing;
  return found;
end;
$$;

revoke execute on function public.claim_signup_referral(text, timestamptz) from public, anon;
grant execute on function public.claim_signup_referral(text, timestamptz) to authenticated;
