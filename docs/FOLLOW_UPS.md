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
| 22 | The new UI needs backend work the API does not have yet | About 16 endpoints (goals, targets, evaluations, delegation, manager permissions, team requests, tasks, meetings, availability, sign, document content, push token, announcements, public brand, password recovery) plus the `{type, payload, attachment}` request shape, while `/me/requests` accepts the flat `MyRequestIn`. The `port_*.py` reference routers are guide-only | backend | In progress (research) |

## 3. Verification and documentation

| # | Item | Why it matters | Owner | Status |
|---|---|---|---|---|
| 3 | The **firewall instructions only cover Private networks** | [LOCAL_TESTING.md](LOCAL_TESTING.md) §4.2 creates the rule with `-Profile Private`; if Windows classifies the Wi-Fi as **Public** the rule never matches and the phone still gets nothing. Document both profiles and keep the existing security warning | docs | Open |
| 6 | The **e-mail gaps 1–14** | Kept in one place only: the "Known gaps / fix later" section of [NOTIFY_EMAIL.md](NOTIFY_EMAIL.md). Not repeated here | backend | Open |
| 10 | [LOCAL_TESTING.md](LOCAL_TESTING.md) is **out of date for the new app** | It still describes **Expo SDK 57** and the previous screens; the app is SDK 58 with the new navigation and screens | docs | Open |
| 15 | `verify_002.sql`'s **cut-off check fails on any database used after the migration** | It compares `notify_email_since` with `max(created_at)` of all notifications, which only holds for a **fresh** run. On `ariba_local` it reported `26 ok / 1 FAIL` (3 notifications raised after the cut-off) while a pristine copy reported `27 / 27`. Either make the check compare against the notifications that existed **at** the cut-off, or document that it must run once, immediately after `002` | backend / db | Open |
| 16 | The **baseline numbers changed** | `api_smoke` is now **PASS=157** (not 156), `RULE=3`, `STUB=1`, `FAIL=0`; `pytest` 56 passed / 16 skipped; `railway_validate` 13/13; `verify_002` 27/27. Any document quoting 156 is stale. The exact runs are at the bottom of this file | docs | Recorded |
| 17 | **`api_smoke` is not self-cleaning** | It deletes the employee, the account and the payroll row, but leaves `ariba_audit_log` +49 rows, `ariba_app_settings` `ins_settings` (11 → 12), `ariba_deleted_items` +4, `attendance` +1 and the `payroll_periods` row `2099-01`. So `railway_validate` is red on **any** database the smoke test has touched. Either extend the cleanup or always verify on a throwaway copy (see #18) | backend / tools | Open |
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


