#!/usr/bin/env bash
# Builds the web app, lints it, checks no secret reached the browser code, runs the browser
# tests (Playwright, port 3100) and then removes the test data they made.
# Usage: scripts/test-e2e-local.sh [playwright arguments, e.g. -g "payments"]
set -u
export PATH="$PATH:/Applications/Docker.app/Contents/Resources/bin"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="${TMPDIR:-/tmp}/biqbaq-tests"
mkdir -p "$LOGS"
cd "$ROOT/apps/web"
# The build rewrites next-env.d.ts; it is put back afterwards.
cp next-env.d.ts "$LOGS/next-env.bak"
npx next build >"$LOGS/build.log" 2>&1; echo "build exit: $?"; grep -E '^(Error|⨯)|Type error' "$LOGS/build.log" | head
cp "$LOGS/next-env.bak" next-env.d.ts
npx eslint src e2e 2>&1 | tail -6
val(){ grep -E "^$1=" "$2" | tail -1 | cut -d= -f2-; }
X=$(val CLOUDINARY_API_SECRET .env.local); RS=$(val SUPABASE_SERVICE_ROLE_KEY .env.local)
for n in X RS; do eval v=\$$n; [ -n "$v" ] && printf '%s in browser code: %s; ' "$n" "$(grep -rlF -- "$v" .next/static 2>/dev/null | wc -l | tr -d ' ')"; done; echo
npx next start -p 3100 >/dev/null 2>&1 & P=$!; sleep 5
npx playwright test "$@" >"$LOGS/e2e.log" 2>&1; echo "e2e: $(grep -E '^\s+[0-9]+ (passed|failed|flaky)' "$LOGS/e2e.log" | tr -s ' ' | tr '\n' ';')"
grep -E '^\s+[0-9]+\) ' "$LOGS/e2e.log" | sed -E 's/.*› //' | cut -c1-110 | sort -u
kill $P
docker exec -i supabase_db_biqbaq psql -U postgres -qAt < "$ROOT/scripts/clean-test-data.sql" >/dev/null && echo cleaned
echo "logs: $LOGS"
