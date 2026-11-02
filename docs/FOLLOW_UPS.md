# Follow-ups

Open items after the employee-app port (Expo SDK 58, the new ARIBA design) and the
notification-e-mail work. One row per item, with the person who acts next and where it stands.
The detail lives in the dedicated document — this list links to it instead of repeating it.

**How to read it**

| Column | Meaning |
|---|---|
| **Owner** | who acts next: `IT`, `team lead`, `me` (the one who ported the app), `backend`, `employee-app`, `docs`, `client`, `Railway billing` |
| **Status** | `Open` (work can start) · `Blocked` (waiting on something outside the team) · `Needs decision` · `Awaiting client` · `In progress` · `Adopted` (a rule we now follow) · `Recorded` (no action, kept for the record) |

When an item closes, change its **Status** and add the date; do not delete the row.

## 1. Blocked outside the team

| # | Item | Why it is open | Owner | Status |
|---|---|---|---|---|
| 4 | Test the app **on a real phone** (Expo Go + QR) | Blocked on this PC: it cannot run an elevated PowerShell, so the inbound rule for TCP **8000 and 8081** (`LocalSubnet` only) cannot be created and the phone gets nothing from `http://<lan>:8000`. Until IT adds it, only the browser preview on this PC works — see [LOCAL_TESTING.md](LOCAL_TESTING.md) §4.2 and §6.1 | IT | Blocked |
| 5 | GPS punch from a **phone** browser | `navigator.geolocation` needs a secure context: allowed on `http://localhost` (this PC) but blocked on `http://<lan>:8081`. A phone can only prove it over **HTTPS**, i.e. on Railway | Railway deployment | Blocked (by #7) |
| 7 | Sending the notification **e-mails** | Nothing is sent until the Railway subscription is in place (SMTP credentials, persistent volume). Locally e-mail is off by design — see [NOTIFY_EMAIL.md](NOTIFY_EMAIL.md) | Railway billing | Blocked |
| 8 | **Supabase Edge Functions** | They will not exist on Railway. Every function the legacy system runs as an edge function has to be inventoried and re-implemented in FastAPI before the cutover | backend | Open (inventory first) |
| 9 | `ariba_hr_pool()` returns **only employee 40** | It takes the HR approvers from `workflow_approvers`; in the migrated data that is one person, so the HR bell pool looks narrow. Confirm with the client whether every HR approver (or every admin) must be in the pool | client | Awaiting client |

## 2. Product gaps in the employee app

| # | Item | What is needed | Owner | Status |
|---|---|---|---|---|
| 1 | **No in-app PDF viewer** for letters | The sent PDF is attached to the e-mail and served by `GET /api/v1/me/notifications/{notification_id}/file` (Bearer, `application/pdf`), but the app has no button. Fix: `expo-sharing` (download with the token, hand the file to the OS share sheet) plus a button on the letter row — and a device to prove it | employee-app | Open |
| 2 | The **bell title of a sent letter is English** in the Arabic UI | The title comes from the send-template path, not from the app's i18n. Decide whether the title should follow the recipient's language and change it where the notification is created | backend | Open |
| 11 | Does **store Expo Go open the SDK 58 app**? | Not verified. The store build was SDK 58 when the project was SDK 57; the project is now SDK 58 too, but nobody has scanned the QR with a store build | me | Open (verify) |
| 19 | The app's **hard-coded default API URL is the old production Railway host** (`src/lib/api.ts`, `.env.example`, `tests/sw.test.mjs`) | Without a local `.env` the app talks to **production**. It must point at the new Railway backend **before any build or release** — as a separate commit, not folded into the port. Consider also making the app refuse to start without an explicit `EXPO_PUBLIC_API_URL` | employee-app | Open (before release) |
| 22 | The new UI needs backend work the API does not have yet | **Stage 1 done in code:** `POST /me/requests` accepts the `{type, payload, attachment}` envelope as well as the flat body (per-type validation, ownership, upload limits in `services/request_envelope.py`), and approvals now route through `workflow_config.final_by_type`. **Stage 2 done in code:** the direct manager's surface — `GET /me/manager-perms`, `GET /me/team` (enriched), `GET /me/team/requests`, `POST /me/team/{employee_id}/requests` (on behalf), `GET/PUT /me/delegation`, and the HR settings `GET/PUT /settings/manager-perms` + `GET/PUT /settings/team-salary` (`routers/manager.py`, `services/team_scope.py`, `tests_canonical/test_manager_surface.py`). **Stage 3 done in code:** the goal cycle — `GET /me/goals`, `GET/POST /targets`, `DELETE /targets/{id}`, `GET/PUT /evaluations/{employee_id}/{period_type}/{period_key}`, `POST /evaluations/{id}/approve` (`routers/goals.py`, `services/goals.py`, `tests_canonical/test_goals_surface.py`), with the signing stage read from `goals_config.evaluation_approver`. **Stage 4 done in code:** tasks, meetings and the team's availability — `GET /team/availability`, `GET /tasks?box=`, `POST /tasks`, `POST /tasks/{id}/update` (`routers/tasks.py`, `services/tasks.py`, `tests_canonical/test_tasks_surface.py`). Still missing: sign, document content (the viewer), push token, announcements, public brand, password recovery. The `port_*.py` reference routers stay guide-only | backend | In progress |
| 23 | **Who signs last is now data, not code** | Each type ends at the stage `ariba_app_settings['workflow_config'].final_by_type` names (`hr` or `ceo`); the migrated setting already maps `unpaid`, `salary_advance`, `iban_change`, `profile_edit`, `document` to HR and everything else falls back to the CEO, exactly as before. So HR can move a type's last signature without a deploy — but the five names are a business rule nobody has confirmed. Also: any value other than `hr`/`ceo` is ignored (code default wins), so whatever screen edits `workflow_config` must accept only those two | client | Needs decision |
| 24 | The new **team screen expects `salary_total` per member** | **Settled in code (Stage 2):** `/me/team` returns `salary_total`/`net_salary` only when the manager holds `view_team_salary` **and** HR turned the `manager_team_salary` setting on (`PUT /settings/team-salary`). The default is off, so a migration never starts exposing salaries. What the client still has to answer: whether a direct manager should see the team's salary at all | client | Awaiting client |
| 25 | **`models.py` allowlist grew by the 14 migration-001 tables** | `ariba_candidate*`, `ariba_delegations`, `ariba_doc_signing`, `ariba_evaluations`, `ariba_leave_files`, `ariba_mail_accounts`, `ariba_mail_log`, `ariba_manager_perms`, `ariba_push_tokens`, `ariba_targets`, `ariba_tasks`, `ariba_webauthn_credentials` are now reflectable so the Stage 2 screens can use them, and `EXPECTED_TABLES` in `tests_canonical/test_canonical_contract.py` matches. Side effect: `configure_models()` now refuses to start against a database **without** `001_react_port.sql` — every database we run (`ariba_src` and every copy of it) already has all 14 | backend | Recorded |
| 26 | **Manager demo data** | `tools/smoke/manager_demo_seed.py` creates a throwaway `ariba_manager_demo` (copy of `ariba_src`) with a manager, three reports (one delegated, one not, one with no row), an outsider, an HR login, their permissions, the salary setting off and three team requests — and for Stage 5 the letter chain (two letters to sign, one waiting for the manager, one waiting at HR, one refused), the `doc_sign_cfg` setting, the sick/annual leave PDFs the manager may open and an iqama scan he may not. It refuses `ariba_src` and any Railway/Supabase host, and it is re-runnable (`--no-copy`). Logins and the password are written to `_manager_demo_info.json` (git-ignored); drop the database when the screen has been reviewed | backend | Recorded |
| 27 | **`api_smoke.py` dies printing its report when stdout is redirected on Windows** | With stdout going to a file or pipe, Python takes the ANSI code page (cp1252 here) and `print(text)` raises `UnicodeEncodeError` on the Arabic details. **No verdict was ever affected**: `_report` writes `_api_smoke.txt` (`encoding="utf-8"`) *before* printing it, and `main`'s cleanup runs before `_report`, so the report file is complete and the database is tidy — only the console copy is lost and the exit code is 1. Proven on the same copy: `160/4` with `PYTHONIOENCODING=utf-8` (exit 0) and `160/4` with stdout redirected (exit 1, file says `RESULT: OK`). The script should still set its own stdout encoding | backend / tools | Open |
| 28 | **No HR screen for manager permissions** | Stage 2 ships the API (`GET/PUT /settings/manager-perms`, `GET/PUT /settings/team-salary`) but `hr-web` has no page for it: granting a permission or turning the team's salary on is a `curl` today, so HR cannot use the feature without a developer | hr-web | Open (Stage 2 follow-up) |
| 29 | **`/docs` cannot authorize a single endpoint** | `GET /openapi.json` has `components.securitySchemes: null` and every operation carries `security: null`: the API reads the raw `Authorization` header (`canonical.current_actor`) instead of declaring `HTTPBearer`, so Swagger UI shows no *Authorize* button and cannot send a token — an authenticated `Try it out` is a `401` today. This blocks the "HR turns the salary setting on from `/docs`" path that #28 was going to fall back on: the same code needs `HTTPBearer` attached to `current_actor` (one dependency, no behaviour change) | backend | Open (Stage 2 follow-up) |
| 30 | **Who approves an evaluation** | Stage 3 reads the signing stage from `ariba_app_settings['goals_config'].evaluation_approver` (`hr` when the setting is missing, `ceo` as the alternative) and the people at that stage from `workflow_approvers` + the stage's roles, never the evaluator. Two halves need HR's answer: whether **HR** or the **CEO** signs an evaluation, and whether HR should also read the manager's **drafts** (today: no — a draft belongs to its evaluator, see [BUSINESS_RULES.md](BUSINESS_RULES.md) § Goals). A third half is its own question: **HR cannot write evaluations** — HR administers the targets, but an evaluation's `items`/`comments` stay the evaluator's and the API refuses HR with `403` (P7). Confirm with HR that this is the separation they want, because the prototype let HR edit everything | HR / backend | Open (Stage 3 follow-up) |
| 31 | **Confirm with HR that they want a final step on letters, and add an HR screen for it** | Stage 5 (Option A) makes HR the last signer of a letter: `POST /letters/{request_id}/approve` moves `stage='hr'` → `current_stage='completed'` and rings the employee. The employee app does not call it and `hr-web` has no page for it, so today a signed letter waits at `stage='hr'` until someone calls the route by hand — ask HR whether they want that step at all, and build the screen if they do. Building it means `/letters` must also return `current_stage`: today it returns only the generated `status`, so `hr-web/src/app/(hr)/(portal)/templates/page.tsx` labels every `pending` row «بانتظار الموظف» even when the letter is waiting for the manager or for HR | HR / hr-web | Open (Stage 5 follow-up) |
| 32 | **`GET /documents/{id}/file` is wider than the Stage 5 viewer** | It authorizes with `_employee_scope`, so an account whose role is `manager` can download **any** document of a direct report (ID/iqama, contract, degree, photo) — the exact width the new `/documents/{id}/content` refuses (S1). It was left untouched because `hr-web/src/lib/employees.ts` (`documentBlob`, reached only through `openDocument()`) depends on it: decide whether to narrow it to the S1 doors or to keep it and accept that a manager can bypass the viewer (and its audit row). The callers are known now and **none of them would break**: the employee-portal profile opens the caller's own documents, the HR leaves page opens a leave attachment, the dependents tab and the employee form open a document they are already displaying, and `tools/smoke/api_smoke.py` opens a document it uploaded as the HR account — each is either `self`, an HR role, or (the smoke's) HR, which the narrowed version still allows. The employee app reads `/documents/{id}/content` only, never `/file` | backend | Needs decision (decide before go-live) |
| 33 | **Confirm with HR/legal that a manager may open sick-leave (and maternity) attachments** | S1(c) lets a direct manager open the file on **any** leave request of his report, and the argument is that he already approves that leave with the employee's reason in front of him (`GET /me/team/requests`). A medical report is the strongest form of that paper, so HR/legal should confirm it explicitly — the alternative is a narrower list of leave types in `_manager_may_open` (`routers/canonical.py`), one line, and the audit row (`documents/open`, `via:'content'`) already records every open | HR / legal | Open (Stage 5 follow-up) |
| 34 | **`doc_sign_cfg.hr_closes` stays off until HR confirms** | The setting ships **off** (S10): a letter closes at its last signature, which is what the business does today. Turning it on makes HR the last signer and leaves the letter waiting for `POST /letters/{request_id}/approve` — a route no screen calls yet (#31). Enable it only after HR says they want that step *and* the HR screen exists; until then a letter that reaches `stage='hr'` is already closed (`current_stage='completed'`) and HR's approve answers `409 already_closed`/`not_waiting_for_hr` | HR / hr-web | Open (Stage 5 follow-up) |
| 36 | **The app logo is the company logo until HR uploads a separate one** | `GET /public/brand` answers `appLogo` from `ariba_app_settings['app_logo'].data` and falls back to `company_logo.data`; the migrated database has **no `app_logo` row**, so the login screen paints the company logo (46,706 characters of base64) — which is what it did before this stage. If the client wants a different mark on the splash/login than on letters and payslips, HR needs a field for it in the settings screen; the route already prefers it when it exists | HR / employee-app | Open (only if the client wants two marks) |
| 37 | **Nothing sends a push yet** | Stage 6 stores tokens and ships the switch (`push_config.enabled`, **off**); a sender is class C and is the decision this stage deliberately did not take: Expo's push API over outbound HTTPS (needs the EAS project id in the build, #11/#12), batches of 100 per request, what a push may say (the bell's Arabic title/body already exist and are the natural text), and what to do with the `DeviceNotRegistered` receipts that Expo returns — those rows must be deleted, which is the same call `logout` makes (T3) | backend / team lead | Open (class C) |
| 38 | **No HR screen for registered devices** | `GET /settings/push` answers `{enabled, devices}` — a **count**, never a token (T2), so HR can see how many phones are registered but cannot list or revoke one. A device list (platform + dates, and a revoke button) is a screen decision, not built: the API's `GET /me/push-token` shape would have to be widened for HR, which is a privacy question of its own | hr-web | Open |


## 3. Verification and documentation

| # | Item | Why it matters | Owner | Status |
|---|---|---|---|---|
| 3 | The **firewall instructions only cover Private networks** | [LOCAL_TESTING.md](LOCAL_TESTING.md) §4.2 creates the rule with `-Profile Private`; if Windows classifies the Wi-Fi as **Public** the rule never matches and the phone still gets nothing. Document both profiles and keep the existing security warning | docs | Open |
| 6 | The **e-mail gaps 1–14** | Kept in one place only: the "Known gaps / fix later" section of [NOTIFY_EMAIL.md](NOTIFY_EMAIL.md). Not repeated here | backend | Open |
| 10 | [LOCAL_TESTING.md](LOCAL_TESTING.md) is **out of date for the new app** | It still describes **Expo SDK 57** and the previous screens; the app is SDK 58 with the new navigation and screens | docs | Open |
| 15 | `verify_002.sql`'s **cut-off check fails on any database used after the migration** | It compares `notify_email_since` with `max(created_at)` of all notifications, which only holds for a **fresh** run. On `ariba_local` it reported `26 ok / 1 FAIL` (3 notifications raised after the cut-off) while a pristine copy reported `27 / 27`. Either make the check compare against the notifications that existed **at** the cut-off, or document that it must run once, immediately after `002` | backend / db | Open |
| 16 | The **baseline numbers changed** | `api_smoke` is now **PASS=157** (not 156), `RULE=3`, `STUB=1`, `FAIL=0`; `pytest` 56 passed / 16 skipped; `railway_validate` 13/13; `verify_002` 27/27. Any document quoting 156 is stale. The exact runs are at the bottom of this file | docs | Recorded |
| 17 | **`api_smoke` is not self-cleaning** | It deletes the employee, the account and the payroll row, but leaves `ariba_audit_log` +49 rows, `ariba_app_settings` `ins_settings` (11 → 12), `ariba_deleted_items` +4, `attendance` +1, the `payroll_periods` row `2099-01` and — since Stage 4 — two `ariba_tasks` rows (a task the requester finished, a meeting HR cancelled) with their four audit rows. So `railway_validate` is red on **any** database the smoke test has touched. Either extend the cleanup or always verify on a throwaway copy (see #18) | backend / tools | Open |
| 20 | **Line-ending policy** | The port converted **CRLF to LF**: 15,462 insertions / 10,728 deletions, of which **17,704 changed lines are whitespace/EOL only**, and 9 files have no content change at all. Decision for the team lead: add a `.gitattributes` (`* text=auto eol=lf`) or not. Until then review those commits with `git show -w` / `git diff -w` | team lead | Needs decision |
| 21 | **`.claude/settings.json`** from the reference repo (it enables the `expo@claude-plugins-official` plugin for Claude Code) | Deliberately left out of the port commit. It was already tracked (since `31cb909`) with the same content, and the only local difference was CRLF, so it was restored to `HEAD` instead of committed. Nothing to exclude; keep it or ignore it as the team prefers | team lead | Needs decision (no action taken) |
| 35 | **Native WebView with scripting disabled not verified on a real phone** | `html-view.tsx` now passes `javaScriptEnabled={false}` and `domStorageEnabled={false}`, and the web build's iframe has carried no script permission since the port — but neither has been **seen on a device**. This PC renders letters through `html-view.web.tsx` (the iframe), so the browser walkthrough proves the iframe half only; the native half is the SDK 58 WebView of the Expo build, which needs #4 (a phone that can reach the API) first. Say so plainly until then: S12's third line is *tested*, the viewer's own setting is *configured*, not yet *observed* | employee-app | Open (with #4) |
| 39 | **The "disable an account" rule is unit-tested only** | `PATCH /auth/users/{id} {is_active:false}` deletes that account's push tokens (T3, `test_disabling_an_account_forgets_its_tokens`), but `api_smoke.py` cannot prove it end to end: the account it creates gets a temporary password, so it cannot sign in to register a token first, and HR cannot register one *for* somebody else (by design, T2). Closing it means a second token-bearing account in `smoke_setup.py` — three lines, whenever the smoke next changes | backend / tools | Open |

## 4. Decisions and housekeeping

| # | Item | Why it is open | Owner | Status |
|---|---|---|---|---|
| 12 | **Distribution of the employee app** | Store build (EAS + dev build + review) versus a web app installed to the home screen (`public/` PWA shell and `railway.json` are ready). This decides push notifications, geolocation permissions and the update path — a team decision, not a technical one | team lead | Needs decision |
| 13 | The **Supabase password shared earlier must be reset** | It was shared in plain text during the port; rotate it and keep the new one in the password manager only | me | Open |
| 14 | **Future client pushes need a repeatable sync process** | The reference repo is copied in by hand today (`Downloads\_ref_HR_ARIBA1`, `Downloads\_backups\employee-app_before-ui-port`). Define how a new client drop is compared, ported, verified (parity + `tsc` + `expo export` + `sw.test.mjs`) and recorded — before the next drop, not during it | team lead | Open |
| 40 | **Unauthenticated routes (`/public/brand`, login, password recovery) have no rate limit; decide before go-live** | What exists today (checked 2 Nov 2026): `POST /auth/login` in `canonical.py` counts **failed** attempts in `ariba_login_attempts` and answers `429` at 25 per username or 40 per IP in 15 minutes; nothing else is limited. `GET /public/brand` (up to four images of 512 KiB each, five database reads per call, no token) has no limit, and `POST /auth/refresh` has none. Password recovery does not exist yet (Stage 8) and must not ship without one. The `config.py` limiter (`login_max_per_username` 5, `login_max_per_ip` 20, 300 s) is only used by `routers/auth.py`, which `main.py` does not mount, so those settings do nothing today. Behind Railway's proxy the IP comes from `X-Forwarded-For` (`--forwarded-allow-ips=*`), so a per-IP count is only as good as that header. Decide: limits per route, where they are counted (database vs memory, one instance), and whether Railway's edge does any of it | backend / team lead | Needs decision |

## 5. Adopted rules

| # | Rule | Since |
|---|---|---|
| 18 | **Verify on a throwaway copy, never on `ariba_local`.** Every stage's checks run against a fresh copy of `ariba_src` (`smoke_setup.py --src ariba_src --dst ariba_verify_tmp`), and the copy is dropped afterwards (`DROP DATABASE ... WITH (FORCE)`). Manual testing in `ariba_local` can then never turn the checks red; `ariba_src` stays read-only truth. See #15 and #17 for why | 2026-11-01 |

## Baseline, measured 1 Nov 2026

`ariba_local`, freshly re-created by `smoke_setup.py --src ariba_src --dst ariba_local`
(106 employees, 13 notifications, 388 audit rows, 6 requests):

| Check | Command | Result |
|---|---|---|
| Unit tests | `backend\.venv\Scripts\python.exe -m pytest -q` (cwd `backend`) | **56 passed, 16 skipped** in 4.12s, exit 0 |
| Database validation | `...railway_validate.py --url postgresql://postgres@localhost:5432/ariba_local` | **checks=13 failed=0**, `RESULT: OK` (volatile: `ariba_sessions 3→0`) |
| Migration 002 | `psql -U postgres -h localhost -d ariba_local -v ON_ERROR_STOP=1 -f docs\db-migrations\verify_002.sql` | **27 rows ok / 0 FAIL** |
| HTTP surface | `...api_smoke.py --base http://127.0.0.1:8000` | **PASS=157 RULE=3 STUB=1 FAIL=0**, `RESULT: OK` |

Order matters: `railway_validate` and `verify_002` must run **before** `api_smoke`, which mutates the
database (see #17).

## Stage 1 re-run, same procedure, fresh copy (1 Nov 2026)

The request-envelope stage changed `POST /me/requests` and the approval routing only, so the database
checks have nothing new to prove — they were re-run anyway, each on its own fresh copy
(`smoke_setup.py --src ariba_src --dst ariba_verify_stage1`, dropped afterwards), and are unchanged:

| Check | Command | Result |
|---|---|---|
| Unit tests | `python -m pytest -q` (cwd `backend`) | **88 passed, 16 skipped** — the baseline's 56 + the 32 new tests in `tests_canonical/test_new_ui_requests.py` |
| Unit tests against a database | `CANONICAL_TEST_DATABASE_URL=postgresql+psycopg://…/ariba_verify_stage1 pytest tests_canonical -q` | **89 passed, 15 skipped** — the reflection test now runs and matches the 58-table allowlist (the URL needs `+psycopg`: a bare `postgresql://` makes SQLAlchemy look for `psycopg2`, which is not installed) |
| Database validation | `...railway_validate.py --url ...ariba_verify_stage1` | **checks=13 failed=0**, `RESULT: OK` |
| Migration 002 | `psql ... -f docs\db-migrations\verify_002.sql` | **27 rows, 0 FAIL** |
| HTTP surface | `...api_smoke.py --base http://127.0.0.1:8001` (same copy) | **PASS=157 RULE=3 STUB=1 FAIL=0**, `RESULT: OK` |

The envelope itself was also exercised end to end against that copy (uvicorn on :8001, one throwaway
script, 25 checks, all PASS): unpaid leave and `iban_change` submitted as `{type, payload, attachment}`
land at the manager, go to HR on the manager's approval, and complete on HR's signature without ever
touching the CEO; the certificate is filed as `iban_certificate`; the legacy flat overtime body still
starts at the manager; `salaryTotal` inside `changes` is refused; a body naming another employee is
403; an executable file is 415; a file over 12 MB is 413.

### Nothing old moved: HEAD vs the working copy, side by side

The same throwaway copy was used to answer the review's question directly: a detached `git worktree` of
`afd2b38` (the code before this stage) ran as a second uvicorn on **:8002** against its own copy of
`ariba_src` (`ariba_old`), the working copy ran on **:8001** against `ariba_new`, and both read the same
`workflow_config` row.

| Check | Result |
|---|---|
| Final stage of every request type, old code vs new code | 24 types: **19 identical**. The 5 that differ — `unpaid`, `salary_advance`, `iban_change`, `profile_edit`, `document` — are the ones the old endpoint **refused outright** (`422 نوع طلب غير مدعوم`); they now end at HR because the migrated `final_by_type` says so. Every type that existed before (10 leave types, `mission`, the 5 hourly permissions, `advance`, `overtime`) still ends at the CEO, and `forgot_punch` is still HR-only |
| The old flat body, old server vs new server (13 bodies: the 8 existing families + the 5 new types) | Status **and** response body identical for all 8 existing bodies (annual/sick/mission, permission/early_leave, advance, overtime, forgot_punch); the 5 new ones are 422 on the old server and 201 now. The `workflow_requests` payloads both servers wrote are identical too — `hours`, `dur`, `amount` and `days` included |
| Callers of `POST /me/requests` in the repo | `src/lib/port.ts:12` (envelope — `composer.tsx`, `overtime.tsx` with a file, `iban-change.tsx`, `profile-edit.tsx`, `upload-document.tsx`), `src/lib/api.ts:264` (flat — `composer.tsx`, `overtime.tsx` without a file, `shared.tsx` forgot-punch) and `tools/smoke/api_smoke.py`. hr-web has no caller. All of them are pinned by `tests_canonical/test_new_ui_requests.py`, which now also stores the flat body of each existing type in its own parametrised case |

Gap this closed: nothing in the repo pinned the flat body of the **existing** types (only overtime and
unpaid were covered), so a change to the shared parsing could have moved them silently. The eight cases
above are tests now, not a one-off script.

## Stage 2 checks, fresh copies (1 Nov 2026)

The direct manager's surface (`routers/manager.py` + `services/team_scope.py`) adds routes and enriches
`/me/team`; it changes no existing handler. Everything below ran on copies of `ariba_src` and the copies
were dropped afterwards.

| Check | Command | Result |
|---|---|---|
| Unit tests | `python -m pytest -q` (cwd `backend`) | **123 passed, 16 skipped** — the Stage 1 88 + 35 in `tests_canonical/test_manager_surface.py` |
| Unit tests against a database | `CANONICAL_TEST_DATABASE_URL=postgresql+psycopg://…/ariba_verify_stage2 pytest -q` | **124 passed, 15 skipped** |
| Old vs new, same database, read-only | Stage 1 commit (`1077a9f`) on :8004 and the working copy on :8003, both against `ariba_manager_demo` | **38 endpoints identical** (status *and* body: `/me`, `/me/employee`, `/me/requests`, `/me/leave`, `/me/approvals`, `/me/notifications`, `/me/payslips`, `/me/letters`, `/me/attendance`, `/employees`, `/dashboard`, `/requests`, `/leave/*`, `/settings/*`, `/sheets`, `/salary/basis`, `/letters`, `/registry/documents`, `/payroll-archive`, `/locations/assignments`, `/holidays`…). `/me/team` is the one intended change and it is **additive only**: the old four keys (`id`, `emp_no`, `name_ar`, `job_title`) keep their values, and `salary_total` is **absent** by default |
| HTTP surface, each server on its own fresh copy | `api_smoke.py --base …:8011` (old: the Stage 1 commit in a detached worktree) vs `…:8012` (new), each against its own fresh copy of `ariba_src` and its own `_smoke_info.json` | **old PASS=156 RULE=3 STUB=1 (160 checks) / new PASS=160 RULE=4 STUB=1 (165)**, `RESULT: OK` both; a second run on the same copies returned the same numbers. The delta is exactly the 5 new routes — 4 × `PASS` (`GET /me/manager-perms`, `/me/delegation`, `/settings/manager-perms`, `/settings/team-salary`) and 1 × `RULE` (`GET /me/team/requests` → 403 for a plain employee, by design) — and **no pre-existing check changes verdict**. The Stage 1 baseline's 157 `PASS` is one higher only because its copy had an open punch session for the day: the punch journey then calls `/me/attendance/punch` four times and skips the cleanup `DELETE /attendance/{id}`, where a pristine copy makes two punches and one delete (planting such a session reproduces 158). The total therefore moves with attendance state alone; only the old↔new delta is meaningful |
| Live walkthrough (uvicorn + a throwaway script) | 66 checks on `ariba_manager_demo` | **66 PASS**: an employee is refused on every manager route (403) and sees an empty team; the manager sees 3 reports with no salary, their leave balance and leaves, and only the delegated report flagged; out-of-team and undelegated submissions are 403 (`forbidden` / `not_delegated`); a body naming another employee is 403; a type the on-behalf screen does not offer is 422; over-balance annual leave is 422; the on-behalf request lands at HR with `submitted_by_employee_id=DEMO-MGR` and no `payload.type`; delegation without a manager is 409; HR grants/revokes `view_team_salary` and the salary appears only with the setting **and** the permission; HR approves the on-behalf request; every pre-existing employee read still answers 200 |

The stage's negative cases are unit tests too, not only that script: `tests_canonical/test_manager_surface.py`
walks the same refusals without a database (`403` on each manager endpoint for a plain employee, `403` out of
team, `403 not_delegated`, `403` for a body naming another employee, `422` for unsupported types and
over-balance leave, `409 no_manager`), and it parses `port.ts` so a rename on either side fails there.


## Stage 3 checks, fresh copies (1 Nov 2026)

The goal cycle (`routers/goals.py` + `services/goals.py`) adds ten routes and changes no existing
handler, so the database checks have nothing new to prove; they were re-run anyway, each on its own fresh
copy, and the copies were dropped afterwards (`smoke_setup.py --src ariba_src --dst ariba_verify_stage3`
for pytest, `… --dst ariba_smoke_stage3` for the smoke run, `manager_demo_seed.py --dst
ariba_stage3_live` for the write journey).

| Check | Command | Result |
|---|---|---|
| Unit tests | `python -m pytest -q` (cwd `backend`) | **196 passed, 16 skipped** — the Stage 2 123 + 73 in `tests_canonical/test_goals_surface.py` |
| Unit tests against a database | `CANONICAL_TEST_DATABASE_URL=postgresql+psycopg://…/ariba_verify_stage3 pytest -q` | **197 passed, 15 skipped** (the reflection test runs against a real copy, so one skip disappears) |
| HTTP surface, old vs new, each server on its own fresh copy | old = the Stage 2 commit in a detached worktree on :8011, new = the working copy on :8012, each with its own `_smoke_info.json` | **old PASS=160 RULE=4 STUB=1 (165 checks) / new PASS=171 RULE=4 STUB=1 (176)**, `RESULT: OK` both, exit 0. The delta is exactly the 11 new goals checks, all `PASS`; **no pre-existing check changes verdict** (the 165 old ones compared field by field with ids, uuids and timestamps masked: identical). Re-run after the bell change below: same numbers |
| Write journey on a throwaway demo | `manager_demo_seed.py --dst ariba_stage3_live`, uvicorn on :8014, one throwaway script | **11 checks, 0 failed**: the manager submits the annual draft → the **employee's bell gains nothing** and the pending row stays off `/me/goals`, while the approver's bell gets «تقييم بانتظار اعتمادك»; the evaluator cannot sign it (403); HR signs it → the employee's bell gets «اعتُمد تقييمك» and `/me/goals` now shows two approved rows; a second signature is `409` and saving an approved row is `409`. The copy was dropped afterwards |
| Pristine `ariba_manager_demo`, reads only | same script, `read` mode | **16 checks, 0 failed**: `/me/goals` is 200 and shows one approved evaluation (81 %) and four targets, never the pending one; the manager reads the annual draft with its three targets; the evaluator cannot sign their own evaluation (403); HR reads the pending quarterly with `can_approve: true`; another team's manager is 403 on the evaluation and on the targets and 404 on a target id; the employee is 403 on their own evaluation route; HR is 403 on `PUT`; the run wrote nothing (still one approved). The database was re-seeded afterwards, so it is pristine |

**Not verified by hand: Stage 3 manual API steps (approve/lock) not checked by me; browser test done for
goals tab, team tab and the direct-URL refusal.** Those three screens were the whole manual pass — the
approve and lock steps are covered by the automated checks above (unit tests T6/T15–T19 and the write
journey), not by a browser run. Nothing in this file or in BUSINESS_RULES claims Stage 3 is fully
verified.

## Stage 4 checks, fresh copies (1 Nov 2026)

Tasks, meetings and the team's availability (`routers/tasks.py` + `services/tasks.py`) add four routes
and change no existing handler. Every copy below was made from `ariba_src` and dropped afterwards
(`smoke_setup.py --src ariba_src --dst ariba_smoke_stage4` for the smoke run,
`… --dst ariba_verify_stage4` for pytest, `manager_demo_seed.py --dst ariba_stage4_live` for the
write journey).

| Check | Command | Result |
|---|---|---|
| Unit tests | `python -m pytest -q` (cwd `backend`) | **236 passed, 16 skipped** — the Stage 3 196 + 40 in `tests_canonical/test_tasks_surface.py` |
| Unit tests against a database | `CANONICAL_TEST_DATABASE_URL=postgresql+psycopg://…/ariba_verify_stage4 pytest -q` | **237 passed, 15 skipped** |
| HTTP surface | `api_smoke.py --base …:8016` (its own fresh copy and `_smoke_info.json`) | **PASS=187 RULE=4 STUB=1 (192 checks)**, `RESULT: OK`, exit 0. The Stage 3 run was **171/4/1 (176)**; the delta is exactly the 16 new task checks, all `PASS`, and **no pre-existing check changes verdict** (they are the same calls in the same order) |
| Live walkthrough | `manager_demo_seed.py --dst ariba_stage4_live`, uvicorn on :8015, one throwaway script | **36 checks, 0 failed**: the manager's availability lists his three reports with only the approved leaves (DEMO-EMP1 annual 5 days, DEMO-EMP2 one row whose `type` is `private` — his sick leave, with no type name and no reason anywhere in the answer — and DEMO-EMP3 with none) and today in Riyadh; a plain employee gets `allowed: false` and no rows; HR sees every active employee; the second manager sees only his own report; the employee's inbox has the seeded task and invitation (with the sender's name, the deadline, the time and the place) and the manager's sent box the five seeded rows; the employee finishes the task (200) and a second answer is `409`; he declines the invitation with a reason (kept on the row) and the manager's bell says both; another employee and another team's manager get `404` on that row; sending outside the audience and from a plain employee is `403`; a meeting without a time, an unknown kind and a bad box are `422`; a fresh task rings the recipient's bell, lands in his inbox, the sender cannot mark it done (`422`), the recipient can (200), and a finished row cannot be cancelled (`409`) |
| Browser walkthrough | — | **pending**. Stage 4 was not walked in a browser on its own: its screen shares the seeded database with the signing screen, so **the Stage 4 browser test will be done together with Stage 5** (recorded here so it is not forgotten) |
| Frontend type-check | `npx tsc --noEmit` (cwd `frontend/employee-app`) | **exit 0** after the one-word label the redaction needs (`LT.private` → «إجازة» in `app/tasks.tsx`) |

The stage's negative cases are unit tests too, not only that script: `tests_canonical/test_tasks_surface.py`
walks the same refusals without a database (T1–T10 above), the availability query's own filters
(`approved`, the −60 day window, the caller's ids), the leave-type allow-list (a sick leave is `private`
with dates only — the reason column is never selected, so a note cannot leak even by accident), the
one-row-per-recipient batch, the four bell wording cases, and it parses `port.ts` so a rename on either
side fails there.

The stage also touches the screen once, for privacy rather than function: `app/tasks.tsx` gained
`LT.private`, the label «إجازة» that `GET /team/availability` now needs because the response carries
`type: "private"` instead of `sick`/`maternity`/… (BUSINESS_RULES P7, refusal T10). The seeded demo has a
running sick leave for `DEMO-EMP2` so the browser pass can see the row read «إجازة» with dates and days
and no reason. The frontend's `port.ts` needs no change: `type` is still a string.

Two things the app does **not** call, and therefore were not built: editing or deleting a task, and a
reminder job. `port.ts` has exactly the four calls listed in [BUSINESS_RULES.md](BUSINESS_RULES.md)
§ Tasks; nothing invents a fifth.

## Stage 5 checks, fresh copies (2 Nov 2026)

The stage closes the letter chain (S6/S10: HR as the last signer, and who needs a manager's signature) and
adds the content-safety layer S12 promised (`services/html_safety.py`) plus the one viewer both apps read a
document through (`GET /documents/{id}/content`, audited, S1 doors). No existing route changed its shape;
`port.ts` only widened two return types. Every copy below was made from `ariba_src` and dropped afterwards
(`smoke_setup.py --src ariba_src --dst ariba_smoke_stage5b` for the smoke run,
`… --dst ariba_verify_stage5b` for pytest). The numbers are from the last pass, after the fixes the review
of this section produced (the guards below, the phone viewer, the letter route's policy).

| Check | Command | Result |
|---|---|---|
| Unit tests | `python -m pytest -q` (cwd `backend`) | **279 passed, 16 skipped** — the Stage 4 236 plus 43 new (`test_html_safety.py` 11, `test_signing_surface.py` 32, both new files) |
| Unit tests against a database | `CANONICAL_TEST_DATABASE_URL=postgresql+psycopg://…/ariba_verify_stage5b pytest -q` | **280 passed, 15 skipped** |
| HTTP surface | `api_smoke.py --base …:8018` (its own fresh copy and `_smoke_info.json`) | **PASS=238 RULE=5 STUB=1 (244 checks)**, `RESULT: OK`, exit 0. The Stage 4 run on the same script was **187/4/1 (192)** |
| The same checks as last stage | the `api_smoke.py` **at `HEAD`**, run against the same fresh copy and the same server | **191/5/1 (197)**: every check older than this stage still passes, in the same order, and its 5 `RULE`s are the same allow-listed probes (`/documents/{zero}/file` and `/employees/2/photo` are `404`, `/me/team/requests` is `403` for a plain employee, plus the zero-uuid probes for the new `GET`s). What was measured is the two totals: **244** checks in the working copy against **197** at `HEAD`, i.e. 47 more rows. How those 47 split (the stage's own section, the dependency rows added so no `if <id>:` block can skip itself, cleanup, attendance punches) was **not itemised**; an earlier breakdown here did not add up to 47 and was removed on 2 Nov 2026 |
| Seed | `manager_demo_seed.py --dst ariba_manager_demo`, then one throwaway query | **5 letters in the five states** — `employee` (plain), `employee` (with a manager needed), `manager`, `hr`, `rejected` — **3 attachments** (annual ticket, sick report, iqama) and **3 signed copies**; the Arabic file names survive the round trip (`ascii(left(file_name,1))` = 1582/1588, i.e. خ/ش) |
| Frontend type-check | `npx tsc --noEmit` (cwd `frontend/employee-app`) | **exit 0** after `port.ts` widened the employee sign's `next` to include `done` and `managerSign` to `{ok, next}`, and `html-view.tsx` gained `javaScriptEnabled={false}` |
| Browser walkthrough | — | **pending**, together with Stage 4 (see its row): the seeded demo carries the five letter states and both stages' screens, so one browser pass covers both |

The smoke's new section walks the chain the way the app does, not only its refusals: `/settings/doc-sign`
is read by HR, refused to an employee (`403` on read and on write) and refuses a `manager_types` that is not
a list (`422`) before reading back what it saved; a letter is sent and then signed with a **hostile**
`signed_base64` (`<script>`, `onerror`, `javascript:` link, an image on a remote host) and the copy HR opens
next is checked to be clean while keeping the text and the `<!--ARIBA_EN-->` marker the English page needs
(S12/D28, D30); the same document read by another employee is `404` (D11) and `POST /letters/{id}/approve`
on a letter that closed itself is `409` (D25) and is `403` for an employee (D20); the employee's own
`POST /me/sign` afterwards is `404` (D14); then `hr_closes` is switched on and the employee's signature
answers `next: "hr"`, HR's approve closes the letter and a second approve is `409` (D22); then a
manager-needed type answers `next: "manager"` and HR's approve is `409` because the letter is not at HR
(D21). Each letter is deleted at the end of its block, and the delete leaves no signing row behind.

Five things the gate itself caught, all fixed before the numbers above were taken:

* **The smoke copy had no `template:salary_cert`.** `POST /letters` refuses a type that is not in
  `workflow_request_types`, so the first two letters came back `422` and — because each block is guarded by
  `if letter_id:` — the whole signing section *skipped itself* while the run still ended `RESULT: OK`.
  `smoke_setup.py` now creates the two letter types the demo seed also creates
  (`template:onboarding`, `template:salary_cert`) and prints them, and each of the three blocks carries a
  `grade(...)` check that fails loudly when the letter could not be created. A smoke that skips is worse
  than a smoke that is red.
* **That was not one block, it was the file's pattern.** Every `if <id>:` in `api_smoke.py` — targets,
  tasks, meetings, requests, forgot punch, two attendance rows, the new employee, his account, the plain
  letter, the three signing letters, the holiday and the document upload — had the same hole: the create
  call above it can answer `RULE` (a 4xx with an error code) instead of `PASS`, and then the whole block
  disappears while the summary stays green. Each one now goes through `need(...)`, which records a row of
  its own and **fails** when the id is empty (`grade(...)` is the same check without a value), and the two
  old `notes.append("… the answer path was skipped")` lines are gone — a note is not a result. The 17 new
  rows all `PASS` on a fresh copy, so nothing was hiding behind them today; a future `422` there is now red.
* **The phone viewer never disabled JavaScript.** `BUSINESS_RULES` S12 and `html_safety`'s own docstring
  both said `html-view.tsx` "disables JavaScript outright" — the code passed no such prop, so it was the
  system web view's default (scripts **on**), which left the sanitizer as the only line for anything the
  phone renders from an older row. `html-view.tsx` now sets `javaScriptEnabled={false}` (and
  `domStorageEnabled={false}`), which is what the web build's iframe already did with
  `sandbox="allow-popups allow-popups-to-escape-sandbox"`.
* **The letter route's own policy was being overwritten.** `GET /letters/{id}/html` now answers with
  `html_safety.DISPLAY_CSP` (no script, no remote fetch, inline CSS and `data:` images kept) plus
  `nosniff` — and the first live probe showed the blanket `default-src 'none'; frame-ancestors 'none'`
  `core/security.py` puts on every answer *replacing* it, so the header the route set never reached the
  browser. `security.py` now keeps a policy a route already set and only applies the blanket one when
  there is none, and a unit test pins both halves (the route's header survives the middleware; every other
  answer still gets the blanket policy).
* **The sanitizer had to be confirmed wired, not only tested.** `POST /letters` cleans the HTML before it
  is stored (`canonical.py`, S12/D30), and both sign routes (`/me/letters/{id}/sign` and
  `/me/sign/{id}`) go through `_signed_html()`, which refuses a missing or non-base64 body (`422`) and a
  document over `html_safety.MAX_DOCUMENT_BYTES` (`413`, checked before decoding) and then sanitizes what
  it stores. The unit tests prove the allow-list; the smoke proves the stored row.

The stage's own section of the report — from the first `GET /settings/doc-sign` to the last
`PUT /settings/doc-sign` — is **35 checks, all `PASS`**; the script at `HEAD` has no such section. The same
four attacks the smoke sends as `signed_base64` (`<script>`, `onerror`, a `javascript:` href, an image on
`evil.example`) are pinned without a database by `test_html_safety.py` — `test_code_is_dropped_with_its_content_not_escaped_into_the_page`, `test_every_handler_attribute_is_dropped`,
`test_a_link_keeps_its_text_and_loses_a_scheme_that_can_run`, `test_an_image_must_be_a_raster_data_uri` — and
the stored row by `test_the_stored_copy_is_the_cleaned_one_not_the_submitted_one` and
`test_a_manager_signature_is_cleaned_before_it_is_stored`; what a browser is allowed to do with an old row
is `test_the_letter_html_route_sends_the_display_policy` and
`test_the_security_middleware_keeps_the_route_policy_and_sends_its_own`.

The seed needed no code change: it already writes the five states, and this stage's only seed edits are the
two lookup rows above and the `doc_sign_cfg` default the business runs on (`hr_closes` off, `onboarding`
needing the manager) — which is what makes the demo show the "waiting for the manager" and "waiting at HR"
letters side by side.


## Stage 6 checks, fresh copies (2 Nov 2026)

The stage adds the two things the app needs around sign-in: the company's identity for a phone that has
no session yet (`GET /public/brand` — the only route in this API without a token) and somewhere to
leave the device's Expo token (`POST`/`GET`/`DELETE /me/push-token`), plus the switch a sender will
read (`GET`/`PUT /settings/push`, **off**). Two shared files moved: `core/security.py` keeps a
`Cache-Control` a route sets, exactly as it already kept a route's CSP, and three handlers in
`canonical.py` (logout, disable an account, temporary password) take the account's tokens with the
session. **Nothing is sent:** there is no sender, no queue and no outbound call anywhere, which is what
"class C" means here.

| Check | Command | Result |
|---|---|---|
| Unit tests | `python -m pytest -q` (cwd `backend`) | **314 passed, 16 skipped** — the Stage 5 279 + 35 in `tests_canonical/test_public_brand_push.py` (new file) |
| Unit tests against a database | `CANONICAL_TEST_DATABASE_URL=postgresql+psycopg://…/ariba_verify_stage6 pytest -q` | **315 passed, 15 skipped** |
| HTTP surface | `api_smoke.py --base …:8019` (its own fresh copy `ariba_stage6_demo` and `_smoke_info.json`) | **PASS=286 RULE=5 STUB=1 (292 checks)**, `RESULT: OK`, exit 0. The Stage 5 run was **238/5/1 (244)**; the 48 new rows are this stage's own section and every one passes |
| The same checks as last stage | the `api_smoke.py` **at `HEAD`**, on its own fresh copy (`ariba_stage6_head`), against the same server | **241/5/1 (247)**: its 244 checks all pass with the same verdicts, and the OpenAPI sweep adds the three GETs it did not know about last time (`/public/brand`, `/me/push-token`, `/settings/push`) — all `PASS`. 241 − 3 = 238, so no older row changed |
| Live brand probe | one throwaway script against the same server | `200`, **138,232 bytes**, `ETag: "e2d3…6290"`, `Cache-Control: public, max-age=300, must-revalidate`, the blanket `default-src 'none'` CSP still on the answer and `nosniff` beside it; the same request with `If-None-Match` answers **`304`** with a 0-byte body |
| Frontend type-check | `npx tsc --noEmit` (cwd `frontend/employee-app`) | **exit 0** — the app already called all three surfaces (`brandInfo()`, `push.register()`, `push.unregister()`), so no frontend file changed |
| Browser walkthrough | — | **pending**, together with Stages 4+5 (one seeded demo covers all three), and #35/#11 still need a phone |

The 48 smoke rows walk it the way the phone does, and the refusals are the point: the brand answer is
read **with no bearer token** and checked for the exact four-key envelope, for the two names, for a
`data:` logo, for an `ETag` and a `max-age=300`, and — ten separate checks — for the *absence* of
`hr_signer`, `letterhead`, `medical_form`, `doc_sign_cfg`, `ins_settings`, `workflow_config`,
`push_config`, `sigs`, `stamp` and `updated` in the body an unauthenticated caller receives; the same
URL answers `304` with its own `ETag` and `200` with a stale one. Then two tokens are registered (the
device list shows two and **no token text**), a bad token and a `windows` platform are `422`, one token
is deleted and one is left, an employee who sends HR's token gets `404` **and HR still sees its own
device**, the switch is `403` for the employee on read and on write, `422` for a body that is not a
boolean, `on` and `off again` for HR, and after `POST /auth/logout` a fresh sign-in lists **zero**
devices — the server, not the app, forgot them.

The stage's rules are unit tests too, without a database: B1's field list, B2 (the five keys and only
those five; `company_logo`'s `name`/`updated` never leave; a colour that is not hex, an image that is not
a raster `data:` URI — SVG included — and a `reset` that is not literally `true` are *absent*), B3 (the
512 KiB cap per image is a `null`, not a truncated URI; the ETag moves when a colour moves), T1
(upsert; twelve bad tokens and six bad platforms refused with nothing written), T2 (the read never
carries a token and takes no account parameter; another account's token is `404` and removes nothing;
`{}` removes all of mine), T3 (logout, disable and temporary password each delete the tokens — and an
account that stays active keeps them), and T4 (the switch defaults off, only HR reads or writes it, a
non-boolean is `422`, a registration with the switch off writes **one row** and touches neither
`workflow_notifications` nor the mail tables — and `services/push.py` contains no sender to switch on).

**Recorded, not a gap:** the seed needed no change. Stage 6 writes no demo data at all — a token is a
real device's, and the smoke's four fake ones (`ExponentPushToken[smoke…]`) are deleted by its own
cleanup, which also removes the `push_config` row it wrote, so a fresh copy stays fresh (see #17).

