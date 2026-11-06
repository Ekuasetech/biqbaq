-- The list behind the Super Admin Role Applications screen (PRD §4.5).
--
-- Emails live in auth.users, which clients cannot read, so this function returns
-- them, and only to an active Super Admin. Everything is read-only. Decisions still
-- go through approve_role_application and reject_role_application.
create function public.admin_list_role_applications(
  p_status text default null,
  p_role text default null,
  p_search text default null,
  p_applicant uuid default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  applicant_id uuid,
  applicant_name text,
  applicant_email text,
  role_key text,
  status text,
  details jsonb,
  rejection_reason text,
  reviewer_name text,
  decided_at timestamptz,
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
    select
      a.id,
      a.applicant_id,
      p.display_name,
      u.email::text,
      a.role_key,
      a.status,
      a.details,
      a.rejection_reason,
      r.display_name,
      a.decided_at,
      a.created_at,
      count(*) over ()
    from public.role_applications a
    join public.profiles p on p.id = a.applicant_id
    join auth.users u on u.id = a.applicant_id
    left join public.profiles r on r.id = a.reviewed_by
    where (p_status is null or a.status = p_status)
      and (p_role is null or a.role_key = p_role)
      and (p_applicant is null or a.applicant_id = p_applicant)
      and (
        v_pattern is null
        or p.display_name ilike v_pattern
        or u.email ilike v_pattern
        or a.details ->> 'business_name' ilike v_pattern
        or a.details ->> 'seller_name' ilike v_pattern
      )
    -- The waiting queue shows the oldest first. Other views show the newest first.
    order by
      case when p_status = 'pending' then a.created_at end asc,
      a.created_at desc,
      a.id
    limit greatest(least(coalesce(p_limit, 20), 100), 1)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

grant execute on function public.admin_list_role_applications(text, text, text, uuid, integer, integer) to authenticated;
