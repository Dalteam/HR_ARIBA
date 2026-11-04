# Go-live runbook (Railway)

Written 2 Nov 2026, before anything was deployed. **Nothing in this file has been run yet.** Every step that
leaves this computer (a push, an upload, a database load) needs the owner's explicit OK at that moment.
`docs/DEPLOY_RAILWAY.md` holds the background; where the two disagree, this file wins (see §9 for one
example).

## 0. Before go-live day

- [ ] Stage 8 committed, and a full retest done on a fresh throwaway copy (pytest with and without a
      database, `railway_validate`, every `verify_00N.sql`, `api_smoke`), with the numbers recorded in
      `docs/FOLLOW_UPS.md`.
- [ ] The decisions marked **needed before go-live** in `docs/FOLLOW_UPS.md` § Deferred decisions are
      answered, or the owner accepts their safe defaults in writing. **#43 (an HR screen for announcements)
      is raised again here, on purpose.**
- [ ] The owner and the client agree on the **GitHub repository and branch** Railway deploys from, and the
      owner has approved the push.
- [ ] The Railway plan is chosen and paid for (§12).
- [ ] The git-history scan is reviewed (FOLLOW_UPS #47): real names in five legacy files, and the old
      Supabase publishable key, would be published with the history.

## 1. The Railway project

One project, four services, all in one environment called `production`:

| Service | Source | Root directory | Health check |
|---|---|---|---|
| Postgres | Railway database | — | — |
| backend | the agreed GitHub repo and branch | `backend` | `/health` (`backend/railway.json`) |
| hr-web | the same repo and branch | `frontend/hr-web` | `/login` (`frontend/hr-web/railway.json`) |
| employee-web | the same repo and branch | `frontend/employee-app` | `/manifest.webmanifest` (`frontend/employee-app/railway.json`) |

Each service: **Settings → Networking → Generate Domain** (Railway gives an `https://…up.railway.app` address
with a certificate; HTTPS is automatic, §6). Note the three web addresses: they are needed in §4.

## 2. Real data: a fresh copy of the clean `ariba_src`, taken on the day

**Never `ariba_local`, `ariba_manager_demo` or any test copy**: those carry test accounts and demo people.
The dump is taken **on go-live day**, not before, so it holds the latest data, and it never goes into git.

1. Check `ariba_src` is clean (read-only, on this PC):
   ```
   psql -h localhost -U postgres -d ariba_src -Atc "SELECT count(*) FROM ariba_auth_accounts WHERE username LIKE 'smoke_%' OR username LIKE 'demo_%'"
   psql -h localhost -U postgres -d ariba_src -Atc "SELECT count(*) FROM employee_directory WHERE employee_id LIKE 'DEMO-%' OR employee_id LIKE 'SMOKE-%'"
   psql -h localhost -U postgres -d ariba_src -f docs/db-migrations/verify_003.sql
   python tools/smoke/railway_validate.py --url "host=localhost user=postgres dbname=ariba_src"
   ```
   Both counts must be **0**, every verify row `ok`, and the validator `RESULT: OK` (62 tables, 65 foreign
   keys, 115 indexes).
2. Dump it, `public` schema only, without owners or grants, to a folder **outside the repo**:
   ```
   pg_dump -h localhost -U postgres -d ariba_src -n public --no-owner --no-privileges -Fc -f <outside-repo>\ariba_public_<date>.dump
   pg_restore -l <dump> | findstr /V "SCHEMA - public" > <dump>.list
   ```
   The second line leaves out the `CREATE SCHEMA public` entry, because Railway's empty database already
   has that schema (this is what made the 2 Nov fresh-restore check pass).
3. In Railway: **Postgres → Settings → Networking → enable the public TCP proxy** (only now). Copy the
   connection string from **Connect → Public network** into your own terminal as a variable; it is never
   written into a file or a chat.
4. Load and check, all from this PC:
   ```
   psql "$DATABASE_PUBLIC_URL" -c "SHOW server_version"
   pg_restore --no-owner --no-privileges --exit-on-error --single-transaction -L <dump>.list -d "$DATABASE_PUBLIC_URL" <dump>
   psql "$DATABASE_PUBLIC_URL" -c "DELETE FROM public.ariba_sessions"
   psql "$DATABASE_PUBLIC_URL" -Atc "SELECT count(*) FROM ariba_auth_accounts WHERE username LIKE 'smoke_%' OR username LIKE 'demo_%'"
   python tools/smoke/railway_validate.py --url "$DATABASE_PUBLIC_URL"
   ```
   Expected: the restore exits 0, the account count is 0, and the validator says `RESULT: OK`. If the
   server is not PostgreSQL 17, stop and read DEPLOY_RAILWAY.md §6 (the portable dump).
5. **Switch the public TCP proxy off again** in Railway, and delete the variable from your terminal.
6. Delete the dump file from this PC once the live database is verified and backed up (§10).

## 3. Migrations always come before the backend

The backend never changes the schema itself (`RUN_MIGRATIONS_ON_STARTUP=false`, and
`backend/railway.json` has an **empty** `preDeployCommand`, whatever DEPLOY_RAILWAY.md §2 says). It
**refuses to start** when a table it expects is missing (`models.py`). So:
- on go-live day the dump already contains migrations 001 to 003 (they are in `ariba_src`);
- for a later commit that adds `docs/db-migrations/00N_*.sql`: switch the public proxy on, run
  `psql "$DATABASE_PUBLIC_URL" -v ON_ERROR_STOP=1 -f 00N_*.sql`, then `verify_00N.sql` (every row `ok`),
  switch the proxy off, and **only then** let the backend deploy (§7). `run_on_railway.sh` does the same
  with a backup first; it needs `bash` (Git Bash on this PC).

## 4. Variables

Entered in **Railway → service → Variables**. Secrets are typed there by the owner, never into a file, a
chat or this repo.

**backend**

| Variable | Value |
|---|---|
| `ENV` | `production` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Railway's internal address) |
| `JWT_SECRET` | **the owner enters it in the Railway website**: 48+ random characters, made on this PC with `python -c "import secrets; print(secrets.token_urlsafe(48))"` and pasted straight in |
| `RUN_MIGRATIONS_ON_STARTUP` | `false` |
| `STORAGE_DIR` | `/data` (§5) |
| `CORS_ORIGINS` | `https://<hr-web domain>,https://<employee-web domain>` (no trailing slashes) |
| `NOTIFY_EMAIL_ENABLED` | `false` (e-mail stays off until a sender is approved, #7) |
| `PASSWORD_RECOVERY_DELIVERY` | `off` (Stage 8; nothing is sent) |
| `SMTP_*` | empty |

No `BOOTSTRAP_ADMIN_*`: the restored data already has the accounts, and the bootstrap only runs on an
empty users table.

**hr-web**: `NEXT_PUBLIC_API_URL` = `https://<backend domain>/api/v1`. **employee-web**:
`EXPO_PUBLIC_API_URL` = `https://<backend domain>` (no `/api/v1`), **never** the old
`hrariba-production.up.railway.app` (#19). Both are baked in when the service **builds**: change one, then
redeploy that service.

## 5. Uploaded files: the `/data` volume

**backend → Volumes → Add volume**, mount path `/data`. Photos, documents and letter files live there, not
in the database. Without the volume they vanish on every redeploy.

## 6. HTTPS

Railway's `*.up.railway.app` domains are HTTPS with a certificate Railway manages. With `ENV=production`
the backend adds `Strict-Transport-Security`. GPS punch-in on a phone only works over HTTPS (#5), so test
it on the live domain. A company domain (for example `hr.ariba.com.sa`) can be added later under
**Networking → Custom domain**, with a DNS record at the company's DNS host; then update `CORS_ORIGINS`
and both `*_API_URL` variables and redeploy.

## 7. How a later commit is deployed

Railway redeploys a service when the agreed branch on GitHub changes. Recommended order for every later
change:
1. on this PC: the stage's gate on a fresh throwaway copy, the owner's OK, one commit;
2. if it adds a migration: apply it to the live database first (§3);
3. the owner approves the push; push to the agreed branch;
4. Railway rebuilds the services whose folder changed; watch **Deployments** until each is `Active`;
5. the read-only checks of §9.

To roll back a bad deploy: **service → Deployments → an earlier one → Redeploy**. A migration is not rolled
back that way; it needs the backup of §10.

## 8. Rate limits (#40)

Today only login is limited (25 failures per username, 40 per IP address in 15 minutes). Stage 8 adds
limits to password recovery. `/public/brand` and token refresh have none. Behind Railway's proxy the IP
address comes from `X-Forwarded-For`, which a client can influence. Decide #40 before go-live.

## 9. Checking the live system: read-only only

- `GET https://<backend domain>/health` answers `{"status":"ok"}`.
- `railway_validate.py --url "$DATABASE_PUBLIC_URL"` and the `verify_00N.sql` files (proxy on, then off).
- A real HR login in hr-web and an employee login in the web app: open the screens, change nothing.

**Never run `api_smoke.py` or `smoke_setup.py` against the live database**: they create test accounts,
employees and payroll rows. (DEPLOY_RAILWAY.md §7 says otherwise; this file supersedes it.)

## 10. Backups

- Before the first load and before every migration: a `pg_dump -Fc` of the live database to a folder
  **outside the repo** on this PC (or the company's storage), kept until the next one is verified.
- Railway's own Postgres backups: switch them on if the chosen plan offers them (**not verified**, §12).
- The `/data` volume is not in the database dump. Back it up separately (**how, on the chosen plan, is not
  verified**).

## 11. Employees: the web app on the home screen

The employee app is published as a web app (`employee-web`) with its own install manifest and service
worker (`frontend/employee-app/public/`).

**iPhone (Safari only):** open the employee-web address → the **Share** button → **Add to Home Screen** →
**Add**. It then opens full-screen like an app.

**Android (Chrome):** open the address. Chrome may offer **Install app** by itself (the login screen shows
an install hint when the browser allows it); otherwise **⋮ menu → Install app** (or **Add to Home
screen**).

**What the web app cannot do:**
- **No Face ID or fingerprint sign-in**: the button is hidden on the web.
- **No push notifications**, on iPhone or Android: the app uses Expo's push service, which only works in
  an installed native build. The bell inside the app still works when it is open.
- The letter viewer is the web version (a sandboxed frame), not the phone app's viewer (#35).
- Files are picked with the browser's file picker.

A native store build is the separate decision #12.

## 12. Railway plan and limits

**Verified 2 Nov 2026** (Railway's pricing documentation): the Hobby plan is 5 USD a month including 5 USD
of usage; Pro is 20 USD a month including 20 USD of usage; usage beyond that is billed (compute by the
second, network egress 0.05 USD per GB). The Railway CLI on this PC (5.71.0) uploads git-ignored files only
when told to (`--no-gitignore`).

**Not verified** (check in the Railway dashboard before choosing a plan): memory and CPU per service on each
plan, the maximum volume size, whether Postgres backups are included, build memory (an Expo web build can
need more than a small plan allows; the fallback is to build on this PC and deploy the `dist` folder), and
the current price of each item.

## 13. After go-live

- Remove any temporary variables; keep the public TCP proxy **off**.
- Reset the Supabase password shared during the port (#13), then retire the Supabase project; its
  publishable key is in the git history of the legacy files (#47).
- Raise #43 (HR screen for announcements) again.
- Record what was done, with dates and the validator results, in `docs/FOLLOW_UPS.md`.
