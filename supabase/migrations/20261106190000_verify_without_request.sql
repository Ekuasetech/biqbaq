-- Decided by the owner (BD-16, 2026-11-06): Super Admin may verify a seller who has not
-- asked. It needs a reason, as there is no request to explain the decision. An open
-- request is still decided through decide_manual_verification, so it is never left open.
create or replace function public.set_verification_status(p_seller_id uuid, p_action text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_super_admin();
  v_from text;
  v_to text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_reason is null then
    raise exception 'REASON_REQUIRED' using errcode = '23514';
  end if;

  select verification_status into v_from from public.sellers where id = p_seller_id for update;
  if not found then
    raise exception 'SELLER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_action = 'verify' and v_from in ('unverified', 'rejected', 'expired') then
    v_to := 'manually_verified';
  elsif p_action = 'suspend' and v_from in ('provider_verified', 'manually_verified') then
    v_to := 'suspended';
  elsif p_action = 'revoke' and v_from in ('provider_verified', 'manually_verified', 'suspended') then
    v_to := 'rejected';
  elsif p_action = 'restore' and v_from = 'suspended' then
    -- Keeps manual and provider verification distinct, as they were before.
    select from_status into v_to from public.verification_history
    where seller_id = p_seller_id and to_status = 'suspended'
    order by created_at desc, id limit 1;
    if v_to is null then
      raise exception 'VERIFICATION_CHANGE_NOT_ALLOWED' using errcode = '55000';
    end if;
  else
    raise exception 'VERIFICATION_CHANGE_NOT_ALLOWED' using errcode = '55000';
  end if;

  perform private.change_verification(
    p_seller_id, v_from, v_to, case when v_to = 'provider_verified' then 'provider' else 'manual' end, v_actor, v_reason
  );
end;
$$;

revoke execute on function public.set_verification_status(uuid, text, text) from public, anon;
grant execute on function public.set_verification_status(uuid, text, text) to authenticated;
