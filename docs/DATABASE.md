# Database

Postgres on Railway in production, SQLite for quick local work and tests. **Alembic owns the schema.**

## Conventions
- UUID primary keys; `created_at` / `updated_at` (timezone-aware) on every table.
- `deleted_at` soft delete on `employees`, `dependents`, `locations`, `documents`.
- Money `Numeric(12,2)`, rates `Numeric(6,3)`, day counts `Numeric(7,2)`. Never floats.
- Enums are stored by value and created as native Postgres `ENUM` types (`postgresql.ENUM`) by the baseline migration.
- One column per fact. The only JSON column is `audit_logs.details` (context for an audit entry).
- Files: `documents.storage_path` is a path under `STORAGE_DIR` (a Railway Volume in production). No base64 in the database.

## Tables (25)
| Group | Tables |
|---|---|
| Reference | `workplaces`, `departments`, `nationalities`, `holidays`, `gosi_rules`, `workflow_rules`, `company_settings`, `attendance_settings` |
| People | `employees`, `users` (login: role, active, must-change), `credentials` (Argon2 hash, token version), `dependents`, `excluded_candidates` |
| Attendance | `locations` (geofence), `attendance_records` (one per employee per day) |
| Requests | `requests`, `request_steps` (history) |
| Leave | `leave_year_ledgers` (one per employee per year), `leave_adjustments` (HR overrides with reason) |
| Payroll | `payroll_runs` (month, status, approved by/at), `payroll_rows` (snapshot of every figure) |
| EOS | `settlements`, `settlement_items` |
| Files/letters | `documents`, `template_letters` |
| Audit | `audit_logs` |

Indexes cover employee number, workplace, department, category, manager, termination date, every expiry date
used by alerts, request status/stage, and attendance date.

## Migrations
- Files: `backend/alembic/versions/NNNN_slug.py`, numbered, **never edited after merge**; add a new one instead.
- `0001_baseline_schema`: all tables. On Postgres it also creates the enum types and enables RLS on every table
  (no policies: no role but the owner can read).
- `0002_seed_reference_data`: workplaces, departments, nationalities, holidays, GOSI rules, settings, workflow rules.

Make a new migration:
```bash
cd backend
.venv/bin/alembic revision --autogenerate -m "add something"   # then review the file by hand
.venv/bin/alembic upgrade head
```
Migrations must not import `app.models` (freeze values such as enum lists inside the file).
New enum values on Postgres need `ALTER TYPE ... ADD VALUE` in a migration.

## Guards (in `tests/test_migrations.py`)
- upgrade → downgrade → upgrade on SQLite.
- **Model drift**: autogenerate against a migrated database must find no differences from `models.py`.
- Postgres variant (needs `TEST_DATABASE_URL` pointing at any Postgres test database): same, plus RLS on every table.

## Connecting to Postgres
On Railway set `DATABASE_URL=${{Postgres.DATABASE_URL}}`. Locally: `postgresql://localhost/ariba_hr_dev`
(`postgresql://...` is converted to the psycopg 3 driver automatically). Use separate projects for dev and test.
