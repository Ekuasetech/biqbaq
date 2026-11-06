#!/bin/bash
# Makes an existing account the first Super Admin on the LOCAL copy, so the admin
# screens can be tried. Usage: ./scripts/make-local-super-admin.sh you@example.com
# The account must already exist. It does nothing to the real project.
set -euo pipefail
email="${1:?Usage: make-local-super-admin.sh you@example.com}"
export PATH="$PATH:/Applications/Docker.app/Contents/Resources/bin"
docker exec -i supabase_db_biqbaq psql -v ON_ERROR_STOP=1 -U postgres -q -v email="$email" >/dev/null <<'SQL'
select private.bootstrap_super_admin(:'email');
SQL
echo "$email is now Super Admin on the local copy."
