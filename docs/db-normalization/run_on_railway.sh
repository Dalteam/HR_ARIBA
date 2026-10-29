#!/usr/bin/env bash
# Migrate one Railway environment's Postgres-Q6OM to the normalized schema.
# Usage (from the repo root):  bash docs/db-normalization/run_on_railway.sh production   (then: demo)
# 1. Full backup to ~/Desktop/HR/backups/before-migration-2026-10-13/db_<env>.sql.gz (checked before going on)
# 2. railway_prep.sql -> preflight_checks.sql -> pre_migration_fixes.sql -> preflight_checks.sql -> ariba_normalization.sql
#    Each script is one transaction; any error stops the script and that step rolls back.
set -euo pipefail

ENV="${1:?usage: run_on_railway.sh production|demo}"
DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="$HOME/Desktop/HR/backups/before-migration-2026-10-13"
DB() { railway ssh -s Postgres-Q6OM -e "$ENV" -- psql -U postgres -d railway -v ON_ERROR_STOP=1 -X -q "$@"; }

mkdir -p "$BACKUP_DIR" && chmod 700 "$BACKUP_DIR"

echo "== [$ENV] backup"
railway ssh -s Postgres-Q6OM -e "$ENV" -- pg_dump -U postgres -d railway --no-owner --no-privileges | gzip > "$BACKUP_DIR/db_$ENV.sql.gz"
chmod 600 "$BACKUP_DIR/db_$ENV.sql.gz"
if ! gzip -dc "$BACKUP_DIR/db_$ENV.sql.gz" | tail -5 | grep -q "PostgreSQL database dump complete"; then
  echo "Backup is incomplete — stopping, nothing was changed."; exit 1
fi
echo "backup ok: $(du -h "$BACKUP_DIR/db_$ENV.sql.gz" | cut -f1)"

if echo "SELECT 1 FROM information_schema.columns WHERE table_name='employee_directory' AND column_name='employer_id'" | DB -At | grep -q 1; then
  echo "[$ENV] already normalized — nothing to do."; exit 0
fi

for f in railway_prep.sql preflight_checks.sql pre_migration_fixes.sql preflight_checks.sql ariba_normalization.sql; do
  echo "== [$ENV] $f"
  DB < "$DIR/$f"
done

echo "== [$ENV] result"
echo "SELECT count(*) AS employees FROM employee_directory; SELECT * FROM workflow_approvers; SELECT * FROM payroll_periods ORDER BY 1,2;" | DB
echo "[$ENV] done."
