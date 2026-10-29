# Smoke and verification tooling

Four standalone scripts, run with the backend virtual environment
(`backend/.venv/Scripts/python.exe` on Windows, `backend/.venv/bin/python` elsewhere) and the
PostgreSQL client tools on the `PATH`. They were used to validate the migration and are the
pass marks for a deployment (see `docs/DEPLOY_RAILWAY.md`, sections 5 and 6).

| Script | What it does | Needs |
|---|---|---|
| `railway_validate.py` | Read-only shape and integrity check of a restored database: 58 tables, 60 validated foreign keys with no orphan rows, no duplicate employees/usernames/payroll months, employee `jsonb` payloads intact. Prints `RESULT: OK/FAIL` and writes `_db_validate.txt`. `--write-expected` regenerates `expected_counts.json` from a known-good database. | one connection string |
| `api_smoke.py` | Drives the whole HTTP surface: login, employee app, requests, manager/HR/CEO approvals, payroll, documents, HR administration. Grades each call `PASS` (2xx), `RULE` (documented business rule), `STUB` (documented 501) or `FAIL` (5xx / no answer); the pass mark is `RESULT: OK` with `FAIL=0`. Writes `_api_smoke.txt`. | a running backend |
| `smoke_setup.py` | Prepares the throw-away data the API test needs: three accounts (`smoke_hr`, `smoke_emp`, `smoke_mgr`) with a known password, linked to real employees. `--no-copy` works on an existing database (a deployed environment); without it, `--dst` is recreated from `--src` so the validated database is never touched. | one connection string |
| `db_verify.py` | Compares two databases: the pre-migration source and the migrated one (row counts, every employee field and `jsonb` payload, lookups, attendance, payroll, orphans, keys). Used by `_tools/verify_artifacts.ps1` when replaying the migration locally. | two local databases |

## Typical use

Local, against disposable databases:

```
python tools/smoke/db_verify.py --src ariba_before_migration --dst ariba_src
python tools/smoke/smoke_setup.py --src ariba_src --dst ariba_api_smoke
python tools/smoke/api_smoke.py --base http://127.0.0.1:8000
```

Deployment (Railway), after the database is in place:

```
python tools/smoke/railway_validate.py --url "$DATABASE_PUBLIC_URL"
python tools/smoke/smoke_setup.py --url "$DATABASE_PUBLIC_URL" --dst railway --no-copy
python tools/smoke/api_smoke.py --base https://<backend domain> --url "$DATABASE_PUBLIC_URL"
```

`api_smoke.py` deletes what it created at the end (employee `SMOKE-*`, the three `smoke_*` accounts,
the payroll row) in the database given by `--url`. If a run aborts halfway, look for rows whose id
starts with `SMOKE-` or whose username starts with `smoke_` before running it again.

Nothing here writes personal data to disk: the reports contain ids, status codes and messages only.
