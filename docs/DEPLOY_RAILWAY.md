# Deploy on Railway

One Railway project with **four services**: **Postgres**, **backend** (FastAPI), **hr-web** (the Next.js HR
portal) and **employee-app** (the Expo app exported as a web page that employees add to their phone's home
screen). All three code services come from the GitHub repo **`Dalteam/HR_ARIBA`**, branch `main`. No Supabase, no
Docker. Each service deploys only its own folder (its **Root Directory**), so `frontend/legacy`, `tools/` and
`docs/` never reach Railway.

Order of a first deploy: Postgres → load the database (section 6) → backend → hr-web → employee-app → put the two
web addresses into the backend's `CORS_ORIGINS` → prove it (section 7). Railway builds the backend with Python
3.12; run the backend tests on 3.12 too before a release.

## 1. Create the project
1. railway.com → **New Project** → **Deploy from GitHub repo** → `Dalteam/HR_ARIBA` (grant Railway access to the
   repo first).
2. In the project: **+ Create → Database → PostgreSQL**. Enable its backups.

## 2. Backend service
Service **Settings**:
- **Root Directory**: `/backend`.
- **Deploy settings** (type them in; Railway retired pointing a service at a `railway.json`, and does not read the
  one in `backend/`, which stays as the record of these values): **Start Command**
  `uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips=*`, **Healthcheck Path**
  `/health`, timeout `60`, restart **On Failure**. Without a start command a build can fail with «No start command
  detected».
- **Networking → Generate Domain** (note it, e.g. `https://backend-xxx.up.railway.app`).
- **Volumes → Add Volume**, mount path **`/data`** (uploaded photos and documents).

Service **Variables** (the full list with explanations is `backend/.env.example`):

| Variable | Value |
|---|---|
| `ENV` | `production` (the server then refuses a short `JWT_SECRET` or a non-Postgres database) |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `JWT_SECRET` | a random string, 48+ chars (`python -c "import secrets; print(secrets.token_urlsafe(48))"`) — never reuse a local one |
| `RUN_MIGRATIONS_ON_STARTUP` | `false` (the schema is loaded once, section 6) |
| `STORAGE_DIR` | `/data` |
| `CORS_ORIGINS` | `https://<hr-web domain>,https://<employee-app domain>` (both, comma-separated, no trailing slash) |
| `PUBLIC_APP_URL` | `https://<hr-web domain>` |
| `NOTIFY_EMAIL_ENABLED` | `false` — e-mail stays off until a sender is approved (FOLLOW_UPS #7); leave every `SMTP_*` empty |
| `WORKFLOW_ESCALATION_CHECK_SECONDS` | `3600` (default; the daily escalation and expiry-alert pass) |
| `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` | **not needed** with the migrated data (it only acts on an empty users table) |

Notification e-mail, for later (the bell works without it). Two switches, on purpose: nothing is mailed until
`NOTIFY_EMAIL_ENABLED=true` **and** SMTP is configured, so a stray `SMTP_HOST` cannot start mailing employees.

| Variable | Value |
|---|---|
| `NOTIFY_EMAIL_ENABLED` | `false` (default) · `true` to actually send |
| `SMTP_HOST` | the SMTP server, e.g. `smtp.office365.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USERNAME` / `SMTP_PASSWORD` | the mailbox credentials (environment only — never stored in the database) |
| `SMTP_FROM_EMAIL` / `SMTP_FROM_NAME` | the sender, e.g. `hr@ariba.com.sa` / `Ariba HR` |
| `SMTP_ENCRYPTION` | `starttls` (587) · `ssl` (465) · `none` (private relay) |
| `NOTIFY_EMAIL_INTERVAL_SECONDS` | seconds between passes, default `60`; `0` turns the loop off |
| `NOTIFY_EMAIL_SINCE` | optional ISO cut-off; empty = the stamp migration 002 wrote, so restored notifications are never mailed |
| `NOTIFY_EMAIL_REDIRECT_TO` | optional sink address(es): every message goes there instead of to the employee |
| `NOTIFY_EMAIL_ALLOW_REAL_RECIPIENTS` | `false` (default); outside production, mail to a real employee address is refused unless this is `true` or `NOTIFY_EMAIL_REDIRECT_TO` is set |

The mailbox half of **Settings → Mail** (`ariba_mail_accounts`: host, port, username, sender) is read as a fallback
for the `SMTP_*` routing variables; the password is only ever read from the environment. Password recovery by
e-mail (Stage 8) is parked on the branch `stage-8-on-hold` until e-mail is switched on.

## 3. hr-web service (the HR portal and the public job-application page)
Add the same repo again (**+ Create → GitHub Repo → Dalteam/HR_ARIBA**), then **Settings**:
- **Root Directory**: `/frontend/hr-web`.
- **Build Command** `npm run build`, **Start Command** `npm run start`, **Healthcheck Path** `/login`, restart **On
  Failure** (the values of `frontend/hr-web/railway.json`).
- **Networking → Generate Domain**.

**Variables** (see `frontend/hr-web/.env.example`). Both are baked in at **build** time: redeploy after a change.

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<backend domain>/api/v1` (**with** `/api/v1`) |
| `NEXT_PUBLIC_EMPLOYEE_APP_URL` | `https://<employee-app domain>` (an employee who signs in here is sent to the app) |
| `NEXT_PUBLIC_BUILD_STAMP` | optional label at the bottom of the side menu |

The public job-application form is a page of this service (`/apply`): the links HR copies from «المرشحون» use
this domain, so nothing else needs deploying for it.

## 4. employee-app service (the home-screen web page)
Employees use the app in the phone's browser and add it to the home screen («إضافة إلى الشاشة الرئيسية» on
iPhone Safari, «تثبيت التطبيق» on Android Chrome); it then opens full screen with its own icon, like an installed
app. Nothing goes through an app store (owner, 5 Nov 2026).

Add the repo a third time, then **Settings**:
- **Root Directory**: `/frontend/employee-app` (no space before the slash: the build then fails with «directory
  does not exist»).
- **Build Command** `npm run build:web`, **Start Command** `npm run serve:web`, **Healthcheck Path** `/` (Railway
  refuses a path with a dot, so not `/manifest.webmanifest`), restart **On Failure**.
- **Networking → Generate Domain**.

**Variables** (see `frontend/employee-app/.env.example`):

| Variable | Value |
|---|---|
| `EXPO_PUBLIC_API_URL` | `https://<backend domain>` (**without** `/api/v1`; the app appends it) — **required**: the build stops without it (FOLLOW_UPS #19) |

What the build already carries: `public/manifest.webmanifest` (name «أريبا», standalone, green theme, icons),
the iPhone home-screen tags and icon, a service worker that keeps the app shell available offline and **never
caches the API**, and `public/serve.json` (every path answers with the app, long caching for `/_expo/*`,
`no-cache` for `index.html` / `sw.js` / the manifest, and security headers).

As a web page it cannot do two things the native build could: Face ID / fingerprint sign-in, and push
notifications (there is no sender anyway); the in-app bell works. Attendance punching by location needs HTTPS,
which Railway gives. After a redeploy, an open app picks up the new version the next time it is reopened.

## 5. First sign-in
The migrated accounts keep their passwords: the 110 migrated bcrypt hashes are verified and rehashed to Argon2 on
the first successful login, so nobody has to reset a password. Sign in to `https://<hr-web domain>/login` with an
admin account and check «الإعدادات» → «روابط الإشعارات»: set the HR portal and employee-app links to the two
Railway domains.

## Notes
- Every push to `main` redeploys all three code services. The backend **never** migrates the canonical database:
  `app/main.py` only checks that the `public` schema is reachable, that the role may bypass RLS and that every
  table in its allowlist exists. Connect it as the `postgres` role (`${{Postgres.DATABASE_URL}}`) — a restricted
  role makes the service refuse to start.
- Backups: enable them on the Postgres service; the `/data` volume holds the uploaded files.

## 6. The database (canonical schema)
The backend does **not** create or migrate tables when it starts, so the canonical schema has to be in the
Railway Postgres once, by one of these two routes.

> **Go-live (owner, 5 Nov 2026): the live data is a fresh export taken from Supabase on go-live day**, not the
> 7 Oct snapshot in `ariba_src` (FOLLOW_UPS #49). That export goes through the normalization path, then **every**
> migration in `docs/db-migrations/` in order (001 to 007 today; `run_on_railway.sh` runs them all with their
> `verify_NNN.sql`), and only then is it restored into Railway. Rehearse the whole path on a local copy first;
> the step-by-step runbook is written once the export exists. After 003-007 the database has more tables than
> the counts quoted below (they describe the 001-002 state): regenerate `tools/smoke/expected_counts.json` from
> the verified copy (`railway_validate.py --write-expected`) before validating Railway (FOLLOW_UPS #52).

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

# 3a. PostgreSQL 17 or newer target (Railway gave 18.6 on 5 Nov 2026): all-or-nothing restore. Railway's
#     database already has the `public` schema, so skip that entry of the dump, or the restore stops at
#     «schema "public" already exists» and keeps nothing.
pg_restore -l _exports/ariba_public.dump | grep -v ' SCHEMA - public ' > restore.list
pg_restore -L restore.list --no-owner --no-privileges --exit-on-error --single-transaction \
  -d "$DATABASE_PUBLIC_URL" _exports/ariba_public.dump

# 3b. PostgreSQL 14-16 target: the portable plain dump instead (psql 17 meta-commands and the
#     17-only transaction_timeout GUC removed; everything else is version-independent DDL)
psql "$DATABASE_PUBLIC_URL" -v ON_ERROR_STOP=1 --single-transaction \
  -f _exports/ariba_public_portable.sql

# 4. sessions of the old server must not survive the move
psql "$DATABASE_PUBLIC_URL" -c 'DELETE FROM public.ariba_sessions'

# 5. optional but recommended: pgcrypto. Legacy sign-in (ariba_login) is deliberately disabled by
#    the React-port migration, but the other legacy RPCs (admin password reset, recovery codes)
#    hash with crypt()/gen_salt() and the dump carries no extension. It adds no tables or indexes.
psql "$DATABASE_PUBLIC_URL" -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto'
```
Expected afterwards: 59 tables, 61 foreign keys, 108 indexes, 106 employees — prove it with section 6.
`ops.*` backup tables are **not** in the dump: they are migration leftovers holding copies of personal
data.

### B. The Postgres service already holds the old data — migrate it in place
```
bash docs/db-normalization/run_on_railway.sh demo        # 1) normalized schema (backup, checks, migration)
bash docs/db-migrations/run_on_railway.sh demo           # 2) the React-port tables/columns + verification
```
Order matters. Both scripts take a verified backup first and do nothing when the database is already
migrated. `002_notif_email_pool.sql`, run by the same script, adds `ariba_notif_files`, the `app_links`
setting, `ariba_hr_pool()` and the PDF-capable template RPC; the backend reflects that table at startup,
so it has to exist before the new backend starts. Replay the whole path on a copy before touching Railway:
`powershell -ExecutionPolicy Bypass -File _tools\verify_artifacts.ps1` — it copies the pre-migration
database, runs both scripts on the copy, compares it with the original (row counts, employee fields,
lookups, orphans, keys), writes the deployment dumps and runs the API smoke test on the migrated copy.

## 7. Prove the deployment
1. `GET https://<backend domain>/health` answers `{"status":"ok"}`.
2. **Database** — read-only, safe on live data:
```
python tools/smoke/railway_validate.py --url "$DATABASE_PUBLIC_URL"
```
Pass mark `RESULT: OK`: 59 tables, 61 validated foreign keys with no orphan rows, no duplicate
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


