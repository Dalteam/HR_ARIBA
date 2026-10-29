# Deploy on Railway

One Railway project with three services: **Postgres**, **backend** (FastAPI) and **frontend** (Next.js),
all from the GitHub repo `Faisal-Alrashed1/HR_ARIBA`. No Supabase, no Docker.

## 1. Create the project
1. railway.com → sign in with GitHub → **New Project** → **Deploy from GitHub repo** → `HR_ARIBA`.
2. In the project: **+ Create → Database → PostgreSQL**.

## 2. Backend service
Service **Settings**:
- **Root Directory**: `backend` (Railway then reads `backend/railway.json`: migrations run before each deploy,
  health check `/health`).
- **Networking → Generate Domain** (note the URL, e.g. `https://backend-xxx.up.railway.app`).
- **Volumes → Add Volume**, mount path **`/data`** (uploaded photos and documents).

Service **Variables**:

| Variable | Value |
|---|---|
| `ENV` | `production` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `JWT_SECRET` | a random string, 48+ chars (`python3 -c "import secrets; print(secrets.token_urlsafe(48))"`) |
| `RUN_MIGRATIONS_ON_STARTUP` | `false` |
| `STORAGE_DIR` | `/data` |
| `CORS_ORIGINS` | the frontend URL from step 3 (no trailing slash) |
| `BOOTSTRAP_ADMIN_USERNAME` | `emp084` (first deploy only) |
| `BOOTSTRAP_ADMIN_PASSWORD` | a temporary password, 8+ chars with letters and digits (first deploy only) |

## 3. Frontend service
Add the same repo again (**+ Create → GitHub Repo → HR_ARIBA**), then **Settings**:
- **Root Directory**: `frontend/hr-web`
- **Networking → Generate Domain**

**Variables**: `NEXT_PUBLIC_API_URL` = `https://<backend domain>/api/v1`
(it is baked in at build time: redeploy the frontend after changing it).

Then put the frontend URL into the backend's `CORS_ORIGINS` and redeploy the backend.

## 4. First sign-in
Open the frontend URL → sign in with `emp084` and the bootstrap password → you are asked to choose a new
password. Then **delete `BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD`** from the backend variables.
(The bootstrap only runs while the users table is empty, but the password should not stay in the settings.)

## Notes
- Every push to `main` redeploys both services. The backend **never** runs Alembic against the canonical
  database: `app/main.py` only checks that the `public` schema is reachable and that the database role may
  bypass RLS. Connect it as the `postgres` role of the Railway Postgres
  (`${{Postgres.DATABASE_URL}}`) — a restricted role makes the service refuse to start.
- Backups: enable them on the Postgres service; the `/data` volume holds the uploaded files.

## 5. The database (canonical schema)
The backend does **not** create or migrate tables when it starts, so the canonical schema has to be in the
Railway Postgres once, by one of these two routes.

### A. The Postgres service is empty (new project) — restore the validated dump
The dump is deliberately not in git (it contains personal data). Copy `_exports/ariba_public.dump`
(custom format, `public` schema only, no owners, no ACLs, no extensions, 19 MB) from the machine that ran
the verification, together with `_exports/ariba_public_portable.sql` for older servers. Install
PostgreSQL **17** client tools (`pg_restore`, `psql`).

```
# 1. connection string: Railway -> Postgres -> Connect -> Public Network
export DATABASE_PUBLIC_URL='postgresql://postgres:<password>@<host>:<port>/railway'

# 2. check the server version: the dump was taken from PostgreSQL 17
psql "$DATABASE_PUBLIC_URL" -c 'SHOW server_version'

# 3a. PostgreSQL 17 target: all-or-nothing restore
pg_restore --no-owner --no-privileges --exit-on-error --single-transaction \
  -d "$DATABASE_PUBLIC_URL" _exports/ariba_public.dump

# 3b. PostgreSQL 14-16 target: the portable plain dump instead (psql 17 meta-commands and the
#     17-only transaction_timeout GUC removed; everything else is version-independent DDL)
psql "$DATABASE_PUBLIC_URL" -v ON_ERROR_STOP=1 --single-transaction \
  -f _exports/ariba_public_portable.sql

# 4. sessions of the old server must not survive the move
psql "$DATABASE_PUBLIC_URL" -c 'DELETE FROM public.ariba_sessions'
```
Expected afterwards: 58 tables, 60 foreign keys, 106 indexes, 106 employees — prove it with section 6.
`ops.*` backup tables are **not** in the dump: they are migration leftovers holding copies of personal
data.

### B. The Postgres service already holds the old data — migrate it in place
```
bash docs/db-normalization/run_on_railway.sh demo        # 1) normalized schema (backup, checks, migration)
bash docs/db-migrations/run_on_railway.sh demo           # 2) the React-port tables/columns + verification
```
Order matters. Both scripts take a verified backup first and do nothing when the database is already
migrated. Replay the whole path on a copy before touching Railway:
`powershell -ExecutionPolicy Bypass -File _tools\verify_artifacts.ps1` — it copies the pre-migration
database, runs both scripts on the copy, compares it with the original (row counts, employee fields,
lookups, orphans, keys), writes the deployment dumps and runs the API smoke test on the migrated copy.

## 6. Prove the deployment
1. `GET https://<backend domain>/health` answers `{"status":"ok"}`.
2. **Database** — read-only, safe on live data:
```
python tools/smoke/railway_validate.py --url "$DATABASE_PUBLIC_URL"
```
Pass mark `RESULT: OK`: 58 tables, 60 validated foreign keys with no orphan rows, no duplicate
employees/usernames/payroll months, 106 employees with their jsonb payload intact. The report is written
to `_db_validate.txt`. `tools/smoke/expected_counts.json` is the shape of the database the smoke test
already passed on; regenerate it with `--write-expected --url <db>` after an intentional data change.
3. **API** — the full write journey. It creates one throw-away employee (`SMOKE-*`), three accounts
   (`smoke_hr`, `smoke_emp`, `smoke_mgr`) and one payroll row, then deletes them again. It runs against
   live data, so run it in a quiet hour and check for `smoke_*` / `SMOKE-*` leftovers if it fails.
```
python tools/smoke/smoke_setup.py --url "$DATABASE_PUBLIC_URL" --dst railway --no-copy
python tools/smoke/api_smoke.py --base https://<backend domain> --url "$DATABASE_PUBLIC_URL"
```
Pass mark `RESULT: OK` with `FAIL=0`; the report is written to `_api_smoke.txt`. Under `ENV=production`
`/openapi.json` is disabled, so the generic GET sweep is skipped there and the report says so.


