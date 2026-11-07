-- A welcome email once someone's address is confirmed, as the owner asked (2026-11-06).
-- Waiting for confirmation means nobody can use the sign-up form to send it to a stranger,
-- and a mistyped address gets nothing that would bounce.

create function private.email_on_account_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- An address that can never receive mail is a test account (see the application trigger).
  if new.email is null or new.email ~* '@(example\.(com|org|net)|[^@]+\.(test|example|invalid|localhost))$' then
    return null;
  end if;
  -- The key is per person, so re-confirming or changing address cannot send it twice.
  perform private.enqueue_email(new.id, 'welcome', '{}'::jsonb, 'welcome:' || new.id);
  return null;
end;
$$;

revoke all on function private.email_on_account_confirmed() from public;

-- Accounts arriving already confirmed, such as Google sign-in. This name sorts after
-- on_auth_user_created, because the job needs the profile that trigger creates.
create trigger on_auth_user_welcome_new after insert on auth.users
  for each row when (new.email_confirmed_at is not null)
  execute function private.email_on_account_confirmed();

create trigger on_auth_user_welcome_confirmed after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function private.email_on_account_confirmed();
