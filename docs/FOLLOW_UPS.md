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
| 26 | **Manager demo data** | `tools/smoke/manager_demo_seed.py` creates a throwaway `ariba_manager_demo` (copy of `ariba_src`) with a manager, three reports (one delegated, one not, one with no row), an outsider, an HR login, their permissions, the salary setting off and three team requests. It refuses `ariba_src` and any Railway/Supabase host, and it is re-runnable (`--no-copy`). Logins and the password are written to `_manager_demo_info.json` (git-ignored); drop the database when the screen has been reviewed | backend | Recorded |
| 27 | **`api_smoke.py` dies printing its report when stdout is redirected on Windows** | With stdout going to a file or pipe, Python takes the ANSI code page (cp1252 here) and `print(text)` raises `UnicodeEncodeError` on the Arabic details. **No verdict was ever affected**: `_report` writes `_api_smoke.txt` (`encoding="utf-8"`) *before* printing it, and `main`'s cleanup runs before `_report`, so the report file is complete and the database is tidy — only the console copy is lost and the exit code is 1. Proven on the same copy: `160/4` with `PYTHONIOENCODING=utf-8` (exit 0) and `160/4` with stdout redirected (exit 1, file says `RESULT: OK`). The script should still set its own stdout encoding | backend / tools | Open |
| 28 | **No HR screen for manager permissions** | Stage 2 ships the API (`GET/PUT /settings/manager-perms`, `GET/PUT /settings/team-salary`) but `hr-web` has no page for it: granting a permission or turning the team's salary on is a `curl` today, so HR cannot use the feature without a developer | hr-web | Open (Stage 2 follow-up) |
| 29 | **`/docs` cannot authorize a single endpoint** | `GET /openapi.json` has `components.securitySchemes: null` and every operation carries `security: null`: the API reads the raw `Authorization` header (`canonical.current_actor`) instead of declaring `HTTPBearer`, so Swagger UI shows no *Authorize* button and cannot send a token — an authenticated `Try it out` is a `401` today. This blocks the "HR turns the salary setting on from `/docs`" path that #28 was going to fall back on: the same code needs `HTTPBearer` attached to `current_actor` (one dependency, no behaviour change) | backend | Open (Stage 2 follow-up) |
| 30 | **Who approves an evaluation** | Stage 3 reads the signing stage from `ariba_app_settings['goals_config'].evaluation_approver` (`hr` when the setting is missing, `ceo` as the alternative) and the people at that stage from `workflow_approvers` + the stage's roles, never the evaluator. Two halves need HR's answer: whether **HR** or the **CEO** signs an evaluation, and whether HR should also read the manager's **drafts** (today: no — a draft belongs to its evaluator, see [BUSINESS_RULES.md](BUSINESS_RULES.md) § Goals). A third half is its own question: **HR cannot write evaluations** — HR administers the targets, but an evaluation's `items`/`comments` stay the evaluator's and the API refuses HR with `403` (P7). Confirm with HR that this is the separation they want, because the prototype let HR edit everything | HR / backend | Open (Stage 3 follow-up) |

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

## 4. Decisions and housekeeping

| # | Item | Why it is open | Owner | Status |
|---|---|---|---|---|
| 12 | **Distribution of the employee app** | Store build (EAS + dev build + review) versus a web app installed to the home screen (`public/` PWA shell and `railway.json` are ready). This decides push notifications, geolocation permissions and the update path — a team decision, not a technical one | team lead | Needs decision |
| 13 | The **Supabase password shared earlier must be reset** | It was shared in plain text during the port; rotate it and keep the new one in the password manager only | me | Open |
| 14 | **Future client pushes need a repeatable sync process** | The reference repo is copied in by hand today (`Downloads\_ref_HR_ARIBA1`, `Downloads\_backups\employee-app_before-ui-port`). Define how a new client drop is compared, ported, verified (parity + `tsc` + `expo export` + `sw.test.mjs`) and recorded — before the next drop, not during it | team lead | Open |

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

