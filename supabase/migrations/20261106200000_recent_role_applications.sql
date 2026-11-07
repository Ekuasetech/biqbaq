-- The Super Admin dashboard's Recent Applications: waiting applications, newest first.
-- The list it reads refuses anyone but Super Admin.
create function public.admin_recent_role_applications(p_limit integer default 10)
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
language sql
stable
security definer
set search_path = ''
as $$
  select l.*
  from public.admin_list_role_applications('pending', null, null, null, 100, 0) l
  order by l.created_at desc, l.id
  limit least(greatest(coalesce(p_limit, 10), 1), 100);
$$;

revoke execute on function public.admin_recent_role_applications(integer) from public, anon;
grant execute on function public.admin_recent_role_applications(integer) to authenticated;
