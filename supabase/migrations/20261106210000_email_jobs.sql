-- Background jobs (ADR-0002), used first for decision emails (PRD §4.2, §5.3, §18).
-- A job is added in the same transaction as the change it reports, so an email can
-- only exist for a change that really happened, and a change never waits on Resend.

insert into public.platform_settings (key, value, description, is_public) values
  ('email.notifications_enabled', 'true', 'Whether Biqbaq sends notification emails', false);

create table public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('email')),
  -- Who an email is for. The address is looked up when sending, so it is never copied here.
  user_id uuid references public.profiles (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'dead')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  run_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  provider_message_id text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index background_jobs_ready on public.background_jobs (run_at) where status in ('queued', 'failed', 'running');
create index background_jobs_user on public.background_jobs (user_id);

create trigger set_updated_at before update on public.background_jobs
  for each row execute function private.set_updated_at();

-- Server only: no policies, and no access for visitors or signed-in users.
alter table public.background_jobs enable row level security;
revoke all on public.background_jobs from public, anon, authenticated;
grant select, insert, update, delete on public.background_jobs to service_role;

create function private.enqueue_email(p_user uuid, p_template text, p_data jsonb, p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.setting_is_on('email.notifications_enabled') then
    return;
  end if;
  insert into public.background_jobs (type, user_id, payload, idempotency_key)
  values ('email', p_user, jsonb_build_object('template', p_template, 'data', p_data), p_key)
  on conflict (idempotency_key) do nothing;
end;
$$;

create function private.email_on_application_submitted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid;
begin
  -- An address that can never receive mail is a test, because a real person could not have
  -- confirmed it. Without this, every test run would email the real Super Admin.
  if exists (
    select 1 from auth.users where id = new.applicant_id
      and email ~* '@(example\.(com|org|net)|[^@]+\.(test|example|invalid|localhost))$'
  ) then
    return null;
  end if;

  for v_admin in
    select user_id from public.user_roles where role_key = 'super_admin' and status = 'active'
  loop
    perform private.enqueue_email(
      v_admin, 'application_received', jsonb_build_object('role', new.role_key),
      'application:' || new.id || ':received:' || v_admin
    );
  end loop;
  return null;
end;
$$;

create function private.email_on_application_decided()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enqueue_email(
    new.applicant_id,
    'application_' || new.status,
    jsonb_strip_nulls(jsonb_build_object('role', new.role_key, 'reason', new.rejection_reason)),
    'application:' || new.id || ':' || new.status
  );
  return null;
end;
$$;

create function private.email_on_verification_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_verified constant text[] := array['provider_verified', 'manually_verified'];
  v_template text;
  -- The reason is shown when a request is rejected or verification is suspended or removed,
  -- so Super Admin writes those for the seller. Other notes stay internal.
  v_data jsonb := '{}'::jsonb;
begin
  if new.to_status = any (v_verified) then
    v_template := case when new.from_status = 'suspended' then 'verification_restored' else 'verification_verified' end;
  elsif new.to_status = 'suspended' then
    v_template := 'verification_suspended';
    v_data := jsonb_strip_nulls(jsonb_build_object('reason', new.reason));
  elsif new.to_status = 'rejected' and new.from_status = 'pending' then
    v_template := 'verification_rejected';
    v_data := jsonb_strip_nulls(jsonb_build_object('reason', new.reason));
  elsif new.to_status = 'rejected' then
    v_template := 'verification_revoked';
    v_data := jsonb_strip_nulls(jsonb_build_object('reason', new.reason));
  else
    return null; -- A seller's own request needs no email to that seller.
  end if;

  select owner_user_id into v_owner from public.sellers where id = new.seller_id;
  perform private.enqueue_email(v_owner, v_template, v_data, 'verification:' || new.id);
  return null;
end;
$$;

create trigger email_on_submitted after insert on public.role_applications
  for each row when (new.status = 'pending')
  execute function private.email_on_application_submitted();

create trigger email_on_decided after update of status on public.role_applications
  for each row when (old.status = 'pending' and new.status in ('approved', 'rejected'))
  execute function private.email_on_application_decided();

create trigger email_on_change after insert on public.verification_history
  for each row execute function private.email_on_verification_change();

revoke all on function private.enqueue_email(uuid, text, jsonb, text) from public;
revoke all on function private.email_on_application_submitted() from public;
revoke all on function private.email_on_application_decided() from public;
revoke all on function private.email_on_verification_change() from public;

-- The worker's three steps. Only the server's secret key can run them, because claiming
-- a job returns the recipient's private email address.

create function public.claim_email_jobs(p_limit integer default 10)
returns table (
  job_id uuid,
  template text,
  data jsonb,
  recipient_email text,
  recipient_name text,
  recipient_locale text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.setting_is_on('email.notifications_enabled') then
    return;
  end if;

  -- A worker that stopped mid-send has used this attempt. Out of attempts means stop here.
  update public.background_jobs b
  set status = 'dead', last_error = 'WORKER_STOPPED', locked_until = null
  where b.type = 'email' and b.status = 'running' and b.locked_until < now() and b.attempts >= b.max_attempts;

  return query
  with ready as (
    select b.id from public.background_jobs b
    where b.type = 'email'
      and ((b.status in ('queued', 'failed') and b.run_at <= now()) or (b.status = 'running' and b.locked_until < now()))
    order by b.run_at
    limit greatest(least(coalesce(p_limit, 10), 50), 1)
    for update skip locked
  ), claimed as (
    update public.background_jobs b
    set status = 'running', attempts = b.attempts + 1, locked_until = now() + interval '5 minutes'
    from ready
    where b.id = ready.id
    returning b.id, b.user_id, b.payload
  )
  select c.id, c.payload ->> 'template', c.payload -> 'data', u.email::text, p.display_name, p.locale
  from claimed c
  left join auth.users u on u.id = c.user_id
  left join public.profiles p on p.id = c.user_id;
end;
$$;

create function public.complete_background_job(p_job_id uuid, p_provider_message_id text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.background_jobs
  set status = 'succeeded', provider_message_id = p_provider_message_id, last_error = null, locked_until = null
  where id = p_job_id and status = 'running';
$$;

-- Waits longer after each failure, up to an hour, and then stops at 'dead' for inspection.
create function public.fail_background_job(p_job_id uuid, p_error text, p_retry boolean default true)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.background_jobs
  set status = case when p_retry and attempts < max_attempts then 'failed' else 'dead' end,
      run_at = now() + least(interval '1 minute' * power(2, attempts), interval '1 hour'),
      last_error = left(p_error, 200),
      locked_until = null
  where id = p_job_id and status = 'running';
$$;

revoke execute on function public.claim_email_jobs(integer) from public, anon, authenticated;
revoke execute on function public.complete_background_job(uuid, text) from public, anon, authenticated;
revoke execute on function public.fail_background_job(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_email_jobs(integer) to service_role;
grant execute on function public.complete_background_job(uuid, text) to service_role;
grant execute on function public.fail_background_job(uuid, text, boolean) to service_role;
