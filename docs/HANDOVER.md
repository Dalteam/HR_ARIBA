# Ariba HR — handover notes

For a developer joining or taking over the project. Written 5 Nov 2026, when the code was first pushed to
`github.com/Dalteam/HR_ARIBA`. When this file and the code disagree, the code wins; `git log` is the detailed
history (every commit message says what changed, why, and how it was checked).

## 1. What the system is

An HR and attendance system for Ariba (Saudi Arabia), Arabic first with English, right-to-left everywhere:
employees, attendance and GPS punching, leave and requests with approval workflows, payroll and payslips, end
of service, letters and e-signing, goals and evaluations, tasks and meetings, announcements, candidates,
assets, alerts, audit log and recycle bin.

| Part | Folder | Stack | Who uses it |
|---|---|---|---|
| API | `backend/` | Python, FastAPI, SQLAlchemy with raw SQL, PostgreSQL 17 | both apps |
| HR portal | `frontend/hr-web/` | Next.js 16, React 19 | HR, admin, finance, managers, CEO, chairman |
| Employee app | `frontend/employee-app/` | Expo SDK 58 (React Native), exported as a web page | every employee, from the phone's home screen |

Not deployed, kept on purpose: `frontend/legacy/` (the client's old Supabase HTML portal, the reference the
formulas were ported from; `tools/legacy-parity/` runs it to prove ours give the same numbers), `docs/`,
`tools/`.

**History in one paragraph.** The client ran a Supabase app. Its data was exported, the schema normalized
(`docs/db-normalization/`) and the API rebuilt on it. The screens were then rebuilt in the client's newer design
(the HR reference `hr-v1` and the `ARIBA_Employee_React` app; neither is in this repo). The work went in
numbered stages (1–22), each gated by tests and accepted by the owner.

## 2. Branches

- `main` — what is deployed. Railway builds from it.
- `stage-8-on-hold` — password recovery by e-mail (Stage 8), parked until e-mail can be sent (§7).
- The work branches `backend-new-ui` (server) and `design-port` (screens) were joined into `main` on
  5 Nov 2026 and are history now. New work: a branch from `main`, one commit per change, merged back.

## 3. Run it locally

The Arabic quick start in `README.md` has the commands for macOS/Linux and Windows. What it does not say:

- **The database is not in git** (it contains personal data). Ask the owner for the validated dump through a
  secure channel, restore it into a local PostgreSQL 17 database named `ariba_src`, and **never write to
  `ariba_src`** — it is the clean source the Railway files are made from. Work on copies:

  ```powershell
  backend\.venv\Scripts\python.exe tools\smoke\smoke_setup.py --src ariba_src --dst ariba_local
  # then apply every docs/db-migrations/NNN_*.sql that ariba_src does not have yet (005-007 today, FOLLOW_UPS #52)
  ```
  `smoke_setup.py` copies the database and gives five accounts a known password (see `docs/LOCAL_TESTING.md`):
  `EMP010` admin, `EMP040` HR, `EMP086` CEO and manager of employee 2, `EMP002` employee with a manager,
  `EMP102` plain employee.
- **The employee app needs `EXPO_PUBLIC_API_URL`** (no default on purpose, FOLLOW_UPS #19). Set it before
  `expo start` and restart with `--clear` after changing it.
- **The backend's `CORS_ORIGINS`** must list every browser origin (portal and app).
- On Windows: PostgreSQL's tools are not on PATH (`C:\Program Files\PostgreSQL\17\bin\psql.exe`), and PowerShell
  needs `npm.cmd` / `npx.cmd`.

## 4. Checks before every commit

| What | Command (from the folder named) | Today |
|---|---|---|
| API tests, no database | `backend`: `.\.venv\Scripts\python.exe -m pytest -q` | 619 passed, 67 skipped |
| API tests, on a throwaway copy | same, with `CANONICAL_TEST_DATABASE_URL=postgresql+psycopg://postgres@localhost:5432/<copy>` | 671 passed, 15 skipped |
| Whole-API journey | run the API on the copy, then `tools\smoke\api_smoke.py --base http://127.0.0.1:<port>` | PASS=382 RULE=5 STUB=1, 0 FAIL |
| HR portal | `frontend/hr-web`: `npx.cmd tsc --noEmit`, `npx.cmd eslint src`, `npx.cmd next build` | clean |
| Employee app | `frontend/employee-app`: `npx.cmd tsc --noEmit`, `node tests/sw.test.mjs`, `npm.cmd run build:web` | clean |

`api_smoke.py` writes and leaves residue: only on a fresh throwaway copy (`ariba_verify_*`), never on
`ariba_local` or anything real; compare totals between runs on fresh copies. With `PYTHONIOENCODING=utf-8` when
redirecting its output on Windows (#27).

## 5. Rules the code relies on

- **Additive API changes only.** Existing routes keep their URL and response shape; the apps and the tests
  depend on them.
- **Schema changes are migrations**: `docs/db-migrations/NNN_name.sql` plus `verify_NNN.sql`, one transaction,
  safe to run twice; the next number is `008`. Never edit an applied migration or the normalization scripts.
  The API checks at startup that every table in its allowlist (`backend/app/models.py`) exists, so a new table
  needs its migration applied first, and `tools/smoke/expected_counts.json` regenerated on purpose.
- **Privacy**: who may see what is written down in `docs/BUSINESS_RULES.md` with numbered negative tests. A
  refusal that would reveal that a row exists answers **404, not 403**. Managers see direct reports only.
- **HTML that is signed or sent is sanitized on write** (`backend/app/services/html_safety.py`) and served with a
  strict CSP; user text printed into a page is escaped.
- **Permissions** come from the roles matrix (`ariba_role_perms`, «الإعدادات» → «الصلاحيات والأشخاص»), read through
  `canonical._perm`; never hard-code a role list for a new HR screen.
- **E-mail stays off** (`NOTIFY_EMAIL_ENABLED=false`, empty `SMTP_*`) until a sender is approved.
- **Wording**: formal Arabic (no Egyptian dialect), icons rather than emoji, the employee app keeps its own
  design; its English comes from `src/i18n/en.ts`, which is **keyed by the exact Arabic text** — change a
  sentence, change its key.
- **Never commit** data files (`*.dump`, `*.sql` exports, CSVs), `.env` files or anything copied from the
  reference repos. Stage files by explicit path. The repo mixes CRLF and LF: keep each file's own.
- Never point a local `.env` at Railway; Supabase is read-only.

## 6. Deploying

`docs/DEPLOY_RAILWAY.md` is the guide: four services (Postgres, backend, hr-web, employee-app), each one's
root directory and variables, the database load, and how to prove a deployment. Every variable each part reads
is listed, with an explanation, in its `.env.example`:

- `backend/.env.example` — on Railway at least `ENV=production`, `DATABASE_URL=${{Postgres.DATABASE_URL}}`, a new
  48-character `JWT_SECRET`, `RUN_MIGRATIONS_ON_STARTUP=false`, `STORAGE_DIR=/data` (a volume), `CORS_ORIGINS`
  with both web addresses, `PUBLIC_APP_URL`, `NOTIFY_EMAIL_ENABLED=false`.
- `frontend/hr-web/.env.example` — `NEXT_PUBLIC_API_URL` (**with** `/api/v1`), `NEXT_PUBLIC_EMPLOYEE_APP_URL`.
- `frontend/employee-app/.env.example` — `EXPO_PUBLIC_API_URL` (**without** `/api/v1`); the build stops without it.

The `NEXT_PUBLIC_*` and `EXPO_PUBLIC_*` values are baked in at build time: redeploy after changing them.

## 7. Before go-live (open on 5 Nov 2026)

1. **Railway project** — the owner creates it; then the three domains go into the variables above.
2. **Live data** — a fresh Supabase export on go-live day (owner's decision), through normalization and every
   migration 001–007 with its verify, rehearsed on a local copy first (#49, #52). The step-by-step runbook is
   written once the export exists.
3. **Security** — reset the Supabase password that was shared earlier (#13); decide on rate limits for the
   unauthenticated routes (login, `/public/*`, the public apply form) (#40).
4. **Owner's browser tests** — the combined test of Stages 16–22 and the 5 Nov changes (formal wording, the
   employee app's five-group navigation, the «سجل التعديلات» buttons, automatic candidate registration) is still
   to be run; the click-through lists are `docs/ACCEPTANCE_CHECKS.md` and `docs/BROWSER_PASS.md`.
5. **Python version on Railway** — the tests run on Python 3.14 locally and `README.md` says 3.12+; pin one
   (`backend/.python-version`) once the Railway build image is chosen, and run the checks on it.

## 8. Waiting for someone else

Business decisions (the code has a safe default for each; details in `docs/FOLLOW_UPS.md`):
who gives the last approval per request type (#23, now data in «الإعدادات»), who approves evaluations (#30),
whether HR wants a final step on letters (#31, #34), whether managers may open sick-leave attachments (#33),
whether the older `GET /documents/{id}/file` should be narrowed (#32), personal-occasion notes (#44), the HR
notification pool (#9), team salary in the manager's team screen (#24).

Blocked on outside things: sending e-mail (#7) and with it password recovery (Stage 8), the expiry-alert e-mails
(#51) and the e-mail half of the exports; push notifications have no sender (#37); real-phone tests need IT (#4).

## 9. Where to read more

| File | What |
|---|---|
| `docs/FOLLOW_UPS.md` | every open item, with owner and status |
| `docs/BUSINESS_RULES.md` | who may see and do what, and the tests that pin it |
| `docs/DEPLOY_RAILWAY.md` | deploying and proving a deployment |
| `docs/LOCAL_TESTING.md` | local databases, test logins, the employee app on a phone |
| `docs/ACCEPTANCE_CHECKS.md`, `docs/BROWSER_PASS.md` | the owner's click-through tests |
| `docs/DESIGN_PORT.md` | how the new design was ported, screen by screen |
| `docs/db-normalization/`, `docs/db-migrations/` | the schema path and every migration |
| `docs/DATABASE.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md` | background; older than this file, so check against the code |
