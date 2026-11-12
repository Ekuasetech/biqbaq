#!/usr/bin/env bash
# Runs every database test (supabase/tests) on a throwaway copy of the local database, so your
# own local data is never touched. Usage: scripts/test-db-copy.sh [log file]
set -u
export PATH="$PATH:/Applications/Docker.app/Contents/Resources/bin"
cd "$(dirname "$0")/.."
LOG="${1:-${TMPDIR:-/tmp}/biqbaq-db-tests.log}"
d(){ docker exec -i supabase_db_biqbaq "$@"; }
d psql -U supabase_admin -d postgres -qAt -v ON_ERROR_STOP=1 -c "drop database if exists biqbaq_test" >/dev/null || exit 1
d psql -U supabase_admin -d postgres -qAt -c "create database biqbaq_test" >/dev/null
d bash -c "pg_dump -U supabase_admin -d postgres | psql -U supabase_admin -d biqbaq_test -q" >/dev/null 2>&1
# The tests expect a near-empty copy: activity, roles and Biqbaq staff accounts are cleared in it.
d psql -U supabase_admin -d biqbaq_test -qAt -c "set session_replication_role = replica; delete from public.audit_logs; delete from public.conversations; delete from public.notifications; delete from public.referral_attributions; delete from public.payment_transactions; delete from public.orders; delete from public.payment_webhook_events; delete from public.payment_accounts; delete from public.invoices; delete from public.email_campaigns; delete from public.list_subscribers; delete from public.email_lists; delete from public.notification_preferences; delete from public.background_jobs; delete from public.verification_history; delete from public.verification_requests; delete from public.reviews; delete from public.favourites; delete from public.product_view_days; delete from public.product_view_totals; delete from public.seller_staff_permissions; delete from public.seller_staff_memberships; delete from public.seller_invitations; delete from public.blog_read_days; delete from public.blog_comments; delete from public.blog_read_totals where post_id not in (select id from public.blog_posts where id::text like '20000000-%'); delete from public.user_roles where role_key<>'buyer'; delete from public.role_applications; delete from public.user_roles where user_id in (select id from auth.users where email like '%@biqbaq.com'); delete from public.profiles where id in (select id from auth.users where email like '%@biqbaq.com'); delete from auth.users where email like '%@biqbaq.com';" >/dev/null
npx --yes supabase@latest test db --db-url "postgresql://postgres:postgres@127.0.0.1:54322/biqbaq_test" </dev/null > "$LOG" 2>&1
echo "db tests: $(grep -E '^Files=' "$LOG" | cut -d, -f1-2) $(grep Result: "$LOG")"
grep -E 'Failed test|Failed:|Parse|ERROR|^# +(got|expected|caught|wanted)' "$LOG" | cut -c1-150 | head -14
