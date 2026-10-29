#!/usr/bin/env bash
# Apply the React-port migrations to one Railway environment's Postgres-Q6OM (the owner runs this himself).
# Usage (from the repo root):  bash docs/db-migrations/run_on_railway.sh demo        (then: production)
#        Local test:           bash docs/db-migrations/run_on_railway.sh local:<dbname>   (PGHOST/PGUSER as usual)
# 1. Full backup to ~/Desktop/HR/backups/before-react-port/db_<env>.sql.gz, checked complete before going on
# 2. Precondition: the database is the normalized schema (employee_directory.employer_id exists)
# 3. Each docs/db-migrations/0NN_*.sql in order — one transaction each; any error stops here and that step rolls back
# 4. verify_NNN.sql for each: any FAIL row stops with exit 1; then row counts before/after must be equal
set -euo pipefail

ENV="${1:?usage: run_on_railway.sh production|demo|local:<db>}"
DIR="$(cd "$(dirname "$0")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
if [[ "$ENV" == local:* ]]; then
  LOCAL_DB="${ENV#local:}"
  BACKUP_DIR="${BACKUP_DIR:-${TMPDIR:-/tmp}/ariba-backups}"
  DB() { psql -X -q -v ON_ERROR_STOP=1 -d "$LOCAL_DB" "$@"; }
  DUMP() { pg_dump -d "$LOCAL_DB" --no-owner --no-privileges; }
else
  BACKUP_DIR="$HOME/Desktop/HR/backups/before-react-port"
  DB() { railway ssh -s Postgres-Q6OM -e "$ENV" -- psql -U postgres -d railway -v ON_ERROR_STOP=1 -X -q "$@"; }
  DUMP() { railway ssh -s Postgres-Q6OM -e "$ENV" -- pg_dump -U postgres -d railway --no-owner --no-privileges; }
fi
NAME="${ENV//:/_}"
mkdir -p "$BACKUP_DIR" && chmod 700 "$BACKUP_DIR"

echo "== [$ENV] backup"
DUMP | gzip > "$BACKUP_DIR/db_${NAME}_$STAMP.sql.gz"
chmod 600 "$BACKUP_DIR/db_${NAME}_$STAMP.sql.gz"
if ! gzip -dc "$BACKUP_DIR/db_${NAME}_$STAMP.sql.gz" | tail -5 | grep -q "PostgreSQL database dump complete"; then
  echo "Backup is incomplete — stopping, nothing was changed."; exit 1
fi
echo "backup ok: $BACKUP_DIR/db_${NAME}_$STAMP.sql.gz ($(du -h "$BACKUP_DIR/db_${NAME}_$STAMP.sql.gz" | cut -f1))"

if ! echo "SELECT 1 FROM information_schema.columns WHERE table_name='employee_directory' AND column_name='employer_id'" | DB -At | grep -q 1; then
  echo "[$ENV] not the normalized schema — run docs/db-normalization/run_on_railway.sh first. Nothing was changed."; exit 1
fi

COUNTS="SELECT string_agg(t || '=' || n, ' ' ORDER BY t) FROM (
  SELECT 'employees' t, count(*) n FROM employee_directory UNION ALL SELECT 'accounts', count(*) FROM ariba_auth_accounts
  UNION ALL SELECT 'requests', count(*) FROM workflow_requests UNION ALL SELECT 'leaves', count(*) FROM leave_requests
  UNION ALL SELECT 'attendance', count(*) FROM attendance UNION ALL SELECT 'documents', count(*) FROM ariba_documents
  UNION ALL SELECT 'payroll', count(*) FROM employee_payrolls UNION ALL SELECT 'notifications', count(*) FROM workflow_notifications
  UNION ALL SELECT 'audit', count(*) FROM ariba_audit_log) x"
BEFORE="$(echo "$COUNTS" | DB -At)"
echo "rows before: $BEFORE"

for f in "$DIR"/0[0-9][0-9]_*.sql; do
  echo "== [$ENV] $(basename "$f")"
  DB < "$f"
  v="$DIR/verify_$(basename "$f" | cut -c1-3).sql"
  if [ -f "$v" ]; then
    out="$(DB -At -F ' | ' < "$v")"
    echo "$out" | sed 's/^/   /'
    if echo "$out" | grep -q '| FAIL'; then echo "[$ENV] verification failed — restore from the backup above if needed."; exit 1; fi
  fi
done

AFTER="$(echo "$COUNTS" | DB -At)"
echo "rows after:  $AFTER"
[ "$BEFORE" = "$AFTER" ] || { echo "[$ENV] row counts changed — check before deploying."; exit 1; }
echo "[$ENV] done. Deploy the backend only after this succeeded (it refuses to start without the new tables)."
