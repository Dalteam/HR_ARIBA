# HR_ARIBA — Canonical DB integration: audit and plan (Phase A + B)

Date: 2026-10-08 · Branch: `integrate/canonical-db` · Status: **audit only — no code or database changed.**

Compared:
- **A = this repo** (`Faisal-Alrashed1/HR_ARIBA`, `main` @ `1ea0d8a`) — ORM schema (Alembic 0001–0008), modular routers + Python calc services.
- **B = colleague's tree** (`HR_ARIBA-main` local copy) — canonical Supabase schema, single router `backend/app/routers/canonical.py`.

Legend: ✅ verified by reading/running code · ⚠️ assumption, needs confirmation.

---

## 1. Codebase comparison

| Area | A (this repo) | B (canonical) |
|---|---|---|
| Stack | FastAPI · SQLAlchemy 2 · Alembic · Argon2 · JWT · Next.js 16 · Expo 57 | Same (+ `bcrypt`) ✅ |
| DB contract | 25 ORM tables, created by Alembic | 34 reflected Supabase tables, no ORM tables, Alembic disabled ✅ |
| Backend layout | 17 routers + 20 services (leave engine, GOSI, EOS, contracts, punch, workflow) | 1 router `canonical.py` (1,739 lines, raw SQL); A's routers/services still in tree but **not mounted** ✅ |
| API surface | 98 routes | 96 routes, same paths as A ✅ |
| Routes only in A | `DELETE /me/requests/{id}`, `POST /leave/used-through` ✅ | — |
| Routes only in B | — | `GET /leave/holidays`, `GET /leave/requests`, `POST /auth/password-reset(/complete)` ✅ |
| Routes returning **501** in B | — | salary-preview, dependents (4 routes + dependent documents), GOSI settings & rate history (3), lookup catalog add/delete (2) ✅ |
| Auth | `users` + `credentials` (Argon2), JWT with token_version | `ariba_auth_accounts` + `ariba_sessions`, bcrypt `$2a$` + Argon2, DB-backed session id in JWT ✅ |
| Startup | runs Alembic + bootstrap admin | refuses non-PostgreSQL, requires role with `BYPASSRLS`, reflects allowlist ✅ |
| Frontends (`hr-web`, `employee-app`) | — | **identical to A** (B adds a stale duplicate `frontend/src` + `frontend/railway.json`) ✅ |
| Tests | `backend/tests` (20 files, 74 passed last full run) | `tests_canonical` (1 file, unit-level, no DB round-trips) ✅ |
| Railway | `preDeployCommand: alembic upgrade head` | `preDeployCommand: []` ✅ |

## 2. Database compatibility issues (critical first)

1. **Missing database functions → runtime 500s.** ✅ B calls 5 Postgres functions that do **not exist** in `supabase_canonical.sql` (the export contains only `CREATE TABLE` + `COPY`; the 162 "CREATE FUNCTION" matches are text inside `ariba_function_backups` rows):
   `ariba_leave_calc` (leave balances, `/me/leave`, balance detail), `ariba_punch_late`, `ariba_punch_early`, `ariba_point_in_polygon` (punch), `ariba_apply_forgot_punch` (forgot-punch approval).
2. **No keys, constraints or indexes.** ✅ The export has 0 `PRIMARY KEY` / `UNIQUE` / `FOREIGN KEY` / `CREATE INDEX`. Nothing prevents duplicates; `UPDATE … WHERE id=` hits every copy.
3. **The "duplicate mock accounts" are an import artifact, not test data.** ✅ `supabase_canonical.sql` contains the COPY block **twice** (identical) for 10 tables: `ariba_auth_accounts` (110→220), `leave_requests` (6→12), `ariba_audit_log` (388→776), `ariba_function_backups`, `public_holidays` (4→8), `ariba_preview_pages`, + 4 empty ones. The verified counts (220 / 12) match exactly 2×. Source data has 110 accounts and 6 leave requests.
4. **No RLS / policies / triggers in the export** ✅ (0). B's `BYPASSRLS` check therefore protects nothing on Railway; authorization is entirely in API code.
5. **Three employee identifiers.** ✅ `employee_directory.employee_id`, `data.id`, `data.empNo` differ for many rows (only 81/106 have `data.id = employee_id`; `data.managerId` matches `data.id`, never `employee_id`; payroll rows mostly reference `payload.id`/`empNo`). Joins on a single id silently miss records (e.g. manager/team, payslips).
6. **Payroll rows predate V119.** ✅ `employee_payrolls.payload` / `payroll_archives_v2.rows` lack `houPay/traPay/prjPay/othPay`; the V119 payslip must fall back to `hou/tra/prj/oth` (legacy behaviour: "keep the original slip"). Month 2026-09 is partly approved (11 of 37 rows) — run-level vs row-level approval needs a rule.
7. **Roles outside the app's contract.** ✅ Accounts use `chairman`, B adds `admin_manager`; frontends know `employee, manager, finance, hr, ceo, admin` only.

## 3. API contract mismatches B ↔ frontends (would break screens)

Verified by reading B's handlers against `frontend/employee-app/src/lib/api.ts` and `hr-web/src/lib/*` ✅:

| Route | Frontend expects | B returns |
|---|---|---|
| `GET /me/requests`, `/me/approvals` | `{type, stage, from_date, to_date, days, on_date, time_from, …, employee_name}` | raw `workflow_requests` rows (`request_type`, `payload` JSONB) |
| `GET /me/approvals` | only requests at the caller's stage | HR/CEO get **all** pending regardless of stage |
| `GET /me/leave` | `{current, carry, year_end, annual, upcoming_holidays}` | raw `ariba_leave_calc` JSON (function missing anyway) |
| `GET /me/team` | `{id, emp_no, name_ar, job_title}` | `username` instead of `emp_no`; filters `manager_id` column only (see issue 5) |
| `GET /me/notifications` | `{id, kind, title, body, at, target}` | raw `workflow_notifications` rows |
| `GET /settings/gosi-rates`, `/employees/salary-preview` | rates/preview | **501** → payroll page and employee form break |
| `DELETE /me/requests/{id}`, `POST /leave/used-through` | exist | missing |

⚠️ The remaining ~80 HR routes need a response-shape contract test against a restored DB (no local PostgreSQL on this machine; not run yet).

## 4. Deployment blocker — `RuntimeError: The canonical Supabase schema requires PostgreSQL`

Facts ✅: `config.py` defaults `database_url="sqlite:///./dev.db"` and `env="development"`; `validate_production` rejects SQLite **only when `ENV=production`**. The error therefore proves, at runtime, that **`DATABASE_URL` was not present in the backend service's environment and `ENV` was not `production`** (otherwise startup would have failed earlier with the production check). No `.env` is committed in either tree.
Most likely ⚠️: the variable exists on the Postgres service (or as a shared variable) but is not referenced on the backend service, or the deploy predates adding it. Fix: on the backend service set `DATABASE_URL=${{Postgres.DATABASE_URL}}` (exact service name) and `ENV=production`, then redeploy; keep the PostgreSQL check.

## 5. Security findings

- `supabase_canonical.sql` (33 MB) holds production data: 110 password hashes, session and reset tokens, 106 employees (IDs, IBANs, salaries). It is **not** git-ignored in B, and B's `.gitignore` is corrupted (a PowerShell here-string was written into it literally). Must never be committed; if it was pushed anywhere, rotate passwords and purge history.
- `ariba_sessions` imported rows are live-looking tokens → delete or expire before go-live (needs approval: it's a data change).
- `backend/app/services/punch.py` in B has an `IndentationError` (dead code today, but `pytest` collection of the old suite fails).

## 6. Integration plan (Phase C, proposed — nothing done yet)

**Principle:** B's canonical data access + A's business logic. Keep the canonical schema unchanged; keep A's API contract (so both frontends work untouched); reimplement the 5 missing DB functions in Python with A's already-verified engines instead of adding SQL functions.

| # | Feature | Today in A | Today in B | Canonical source | Change |
|---|---|---|---|---|---|
| 1 | Startup / config | `main.py` Alembic + bootstrap | canonical check | — | Take B's startup; remove bootstrap/Alembic from runtime; `railway.json` no pre-deploy |
| 2 | Auth & sessions | `identity.py` | `canonical.py` auth | `ariba_auth_accounts`, `ariba_sessions`, `ariba_login_attempts` | Take B; add bcrypt→Argon2 rehash on login; map `chairman`→ceo-equivalent permissions (decision) |
| 3 | Employee identity | UUID | `employee_id` | `employee_directory` + `data` | One resolver mapping `employee_id`/`data.id`/`empNo` → canonical id; use everywhere (team, manager, payroll, attendance) |
| 4 | Employees CRUD/list | services/employees | B handlers | `employee_directory.data` | Take B; verify shapes vs `hr-web` |
| 5 | Leave balances | `services/leave.py` LeaveBook (numbers verified vs legacy) | `ariba_leave_calc` (missing) | `data.leaveYearOverrides`, `leaveHistoryByYear`, `leaveEosExcess`, approved `workflow_requests` | Adapter feeding LeaveBook from canonical JSONB |
| 6 | Requests & workflow | services/workflow | B handlers | `workflow_requests/actions/notifications`, `leave_requests` | Take B storage; restore A's stage rules + response shape; add `DELETE /me/requests` |
| 7 | Punch / attendance | services/punch + geofence | B (calls 3 missing fns) | `attendance`, `work_locations` (+`polygon`) | A's Python logic on canonical rows; add point-in-polygon in Python |
| 8 | Forgot-punch approval | `record_forgot_punch` | `ariba_apply_forgot_punch` (missing) | `attendance` | Python |
| 9 | Payroll sheets / archive / payslips | payroll_runs/rows | B | `employee_payrolls.payload`, `payroll_archives_v2`, `payroll_periods` | Month approval and payslip visibility come from `payroll_periods`; payload fallback remains |
| 10 | GOSI rates | `gosi_rules` | 501 | none | **Gap** → proposal: store rate periods in `ariba_app_settings` key `gosi_rates` (existing table, JSONB) — needs approval |
| 11 | Lookups (workplaces, departments, nationalities) | tables | derived from employees; add/delete 501 | none | **Gap** → proposal: `ariba_app_settings` key `lookups` — needs approval |
| 12 | Dependents | table | 501 | none (maybe `employee_directory.data`) ⚠️ | **Gap** → proposal: `data.dependents[]` in JSONB — needs approval |
| 13 | Forms / letters | `sent_letters` | `workflow_requests` type `template:*` | `workflow_requests` | Take B; check `/letters/{id}/html` source |
| 14 | Documents | disk storage | `ariba_documents.file_data` | `ariba_documents` | Take B |
| 15 | Settings, signer, logo | `sheets` | `ariba_app_settings` | `ariba_app_settings`, `company_settings` | Take B; map `hr_signer` shape (`nameAr/sigs[empId]/useSig`) ↔ hr-web `Signer` |
| 16 | Notifications | computed | `workflow_notifications` | same | Take B storage; map to app shape; derive read state from `read_at`; mark-read writes `read_at` |
| 17 | Tests | `backend/tests` (ORM) | `tests_canonical` | — | New contract tests: every frontend-used route, against a restored PG |

## 7. Decisions needed before Phase C

1. Database duplicates (issue 3): approve **dedupe of identical rows + restore primary keys/uniques from `supabase_full.sql`** in the Railway DB? (Schema/data change — not done without approval.)
2. Missing functions: reimplement in Python (recommended) **or** import their definitions from `supabase_full.sql`?
3. Gaps 10–12: approve storing GOSI rates, lookups and dependents in existing JSONB (`ariba_app_settings` / `employee_directory.data`)?
4. Roles `chairman` / `admin_manager`: what may each do?
5. Payroll approval is month-scoped in `payroll_periods`, not per employee or `ariba_payroll_status`.
6. Imported `ariba_sessions`: expire them at cut-over?

## 8. Verification plan (Phase D)

Restore `supabase_canonical.sql` into a **local/throwaway** PostgreSQL (never production) → run `tests_canonical` + new contract tests → start backend (`ENV=production`, PG URL) → exercise login with an existing bcrypt account, employees list/detail, punch in/out, leave request → manager → HR → CEO, payroll get/put/approve, documents upload/download, settings, `/health` → confirm no Alembic run and no table created (`\dt` before/after) → deploy branch to a Railway **preview** environment, not production.

---

## 9. Implemented (2026-10-08)

- Canonical schema + data are the database; the retired ORM schema is no longer used at runtime (no Alembic, no seeding).
- Loader `backend/tools/load_canonical.py` (empty target only; repeated COPY blocks loaded once; source file read-only).
- Fixes for the canonical export: bigint ids without identity (audit log, login attempts), no unique keys (all `ON CONFLICT` replaced by update-then-insert).
- The 5 missing DB functions replaced by Python: punch = port of the legacy `ariba_attendance` (from `ariba_function_backups`), workflow = port of `ariba_workflow_action` / `ariba_submit_request`, leave balances = the verified `LeaveBook` engine fed from `employee_directory.data`, forgot-punch apply in Python.
- GOSI settings stored in `ariba_app_settings['ins_settings']` (defaults = previous seed). Logo / HR signer mapped to `ariba_app_settings`.
- Employee record mapped both ways between legacy `data` vocabulary and the HR site contract (`app/services/employee_map.py`); salary preview restored.
- Employee-app routes return the app's contract (requests, approvals, team, leave, payslips, notifications); `DELETE /me/requests/{id}` and `POST /leave/used-through` restored.
- Verified on a local PostgreSQL restore: contract tests 10 passed / 1 skipped; every HR page loads with no failed API call; end-to-end: request → manager → HR → CEO, forgot-punch → attendance, punch inside/outside geofence, payroll save/approve/reopen, payslips, GOSI, signer, logo, employee read/patch/create.
- Still unsupported (no canonical storage): dependents, adding/deleting workplace/department lookups (501).
- Railway: new service `Postgres-Q6OM` holds the canonical data; backend `DATABASE_URL=${{Postgres-Q6OM.DATABASE_URL}}`, `RUN_MIGRATIONS_ON_STARTUP=false`. The previous `Postgres` service is untouched (rollback: point `DATABASE_URL` back to `${{Postgres.DATABASE_URL}}` and redeploy `1ea0d8a`); a pg_dump of it is kept outside the repo.
