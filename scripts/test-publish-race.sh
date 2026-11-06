#!/bin/bash
# Proves the publishing limit holds when two publishes overlap, which single-connection
# database tests cannot do. Local database only. It leaves test rows behind: run
# `npx supabase db reset --local` afterwards.
#
# One connection publishes the seller's last two allowed products and stays open. While
# it does, a second connection tries to publish a third. It must wait, then be refused.
set -euo pipefail
export PATH="$PATH:/Applications/Docker.app/Contents/Resources/bin"
run() { docker exec -i supabase_db_biqbaq psql -U postgres -d postgres -qAt -v ON_ERROR_STOP=1 "$@"; }

user="00000000-0000-4000-8000-$(printf '%012d' $((RANDOM * RANDOM)))"
slug="race-$RANDOM$RANDOM"
as_seller="set local role authenticated; select set_config('request.jwt.claims', '{\"sub\":\"$user\",\"role\":\"authenticated\"}', true);"

run >/dev/null <<SQL
insert into auth.users (id, email) values ('$user', '$slug@example.com');
insert into public.user_roles (user_id, role_key) values ('$user', 'seller');
insert into public.sellers (owner_user_id, slug, name, city) values ('$user', '$slug', 'Race', 'Toronto');
insert into public.products (seller_id, name, description, category_id)
select s.id, '$slug ' || n, 'x', (select id from public.categories limit 1)
from public.sellers s, generate_series(1, 3) n where s.slug = '$slug';
SQL
id() { run -c "select id from public.products where name = '$slug $1'"; }
one=$(id 1); two=$(id 2); three=$(id 3)

run >/dev/null <<SQL &
begin;
$as_seller
select public.publish_product('$one');
select public.publish_product('$two');
select pg_sleep(3);
commit;
SQL
first=$!
sleep 1

if run -c "begin; $as_seller select public.publish_product('$three'); commit;" >/dev/null 2>&1; then third=published; else third=refused; fi
wait "$first"

count=$(run -c "select count(*) from public.product_publication_ledger l join public.sellers s on s.id = l.seller_id where s.slug = '$slug'")
echo "third publish: $third; products counted against the limit: $count"
[ "$third" = refused ] && [ "$count" = 2 ] && echo "PASS" || { echo "FAIL: the limit was exceeded"; exit 1; }
