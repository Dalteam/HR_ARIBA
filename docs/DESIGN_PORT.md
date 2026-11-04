# Design port: notes

Bringing the updated design into `frontend/hr-web` (exactly) and `frontend/employee-app` (structure only, our
identity kept). Kept here, not in `docs/FOLLOW_UPS.md`, so this branch merges cleanly with `backend-new-ui`.
**No personal data in this file**: ids like "employee 2" and counts only.

## Phase 3 (part 2): the four screens that waited on a backend (4 Nov 2026, not committed)

The design's last four menu entries — سجل التعديلات, سلة المهملات, المرشحون + صفحة التقديم, بطاقات العمل — are
built end to end. Backend on `backend-new-ui` (5 new modules, 31 routes, migration `004_four_screens.sql`,
`tests_canonical/test_four_screens.py`); screens on this branch. `audit`, `bin`, `cand` and `bizc` are `ready`
in `src/lib/features.ts`. What was verified live (`ariba_local`, 4 Nov 2026): 17 audit + purge checks,
17 recycle-bin + card checks, 38 candidate + public-form checks, all passing, plus 453 backend tests. The
decisions and the seven places this port differs from the design are §0 of `docs/DESIGN_PORT_FOUR_SCREENS.md`;
the walkthrough for the owner is §M of `docs/DESIGN_PORT_TEST_PLAN.md`.

Not carried over, each still naming its own gap in `features.ts`: the per-section «آخر التعديلات» strip
(`sectionAudit`), automatic registration of applicants (`candidateAuto`), the delete-employee route that
archives to the bin (`empDelete`), and the business card's drag-and-resize element editor.



| Item | State |
|---|---|
| Branch | `design-port`, created from `backend-new-ui` at `f8270ff` (Stage 7). Stage 8 is staged but not committed in the main folder, so it is **not** on this branch |
| Worktree | `C:\Users\GhadyNafisah\Downloads\HR_ARIBA-main\HR_ARIBA-main\design-port` |
| Main folder | untouched: its staged Stage 8 files, `CLAUDE.md` and the Stage 8 demo servers and copies were left as they were |
| Data | `ariba_design_port`, a throwaway copy of `ariba_src` (62 tables, 22 current employees, 24 active accounts) made with `tools/smoke/smoke_setup.py --src ariba_src --dst ariba_design_port`; keep it until the owner says drop it |
| Backend | ours, run from the main folder (its working tree, which includes the staged Stage 8 code), bound to `127.0.0.1:8040` only, uploads in a scratch folder, e-mail off, CORS for `http://localhost:3040` (hr-web) and `http://localhost:8090` (employee web) |
| Local env files (git-ignored) | `frontend/hr-web/.env.local` → `NEXT_PUBLIC_API_URL=http://localhost:8040/api/v1`; `frontend/employee-app/.env` → `EXPO_PUBLIC_API_URL=http://localhost:8040` |
| Dependencies | `npm ci` in both front ends, exit 0 (the locked versions; nothing upgraded, no tracked file changed): Next 16.3.8; Expo 58.0.22, React Native 0.88.1 |
| Updated design | `C:\Users\GhadyNafisah\Downloads\البرنامج` (read-only reference; scan below) |

### Test logins (in the copy only)

The password is the smoke password documented in `tools/smoke/smoke_setup.py` (`PASSWORD`) and
`docs/LOCAL_TESTING.md`; it exists only in throwaway copies.

| Username | Role | What it can do in our API |
|---|---|---|
| `EMP010` | `admin` | HR: everything HR can do (employees, settings, announcements, temporary passwords); 5 current direct reports |
| `EMP040` | `admin` | HR, and the HR approver of the workflows (stage `hr`); in the HR bell pool |
| `EMP086` | `ceo` | CEO approver (stage `ceo`) and the direct manager of employee 2; 13 current direct reports |
| `EMP002` | `employee` | an employee with a manager (employee 86): requests, attendance, letters, own data |
| `EMP102` | `employee` | an employee with no manager |

Real data means goals, tasks, announcements, letters and signing are empty: their empty states are the
test.

### The updated design: read-only scan (3 Nov 2026; values never printed)

- **What it is:** two **Vite + React 19 web apps** (`react-router-dom` 6, Tabler icon font, Chart.js,
  html2canvas, jsPDF, qrcode-generator), not Next.js and not Expo:
  - `ARIBA_HR_React`: 176 source files (107 `.jsx`, 67 `.js`, 2 `.css`);
  - `ARIBA_Employee_React`: 68 source files (40 `.jsx`, 26 `.js`, 2 `.css`).

  Each also has a built `dist`, `node_modules`, `sql/` (the client's Supabase migrations 10–41 for HR,
  10–20 for the employee app, plus `sql/tests`), `supabase/` and `docs/`. A zip next to them holds one
  999-byte README.
- **Its backend is Supabase.** `src/lib/config.js` in both apps reads `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_KEY` and otherwise **falls back to the live project's address and publishable key**,
  written in the file (1 project, 1 publishable key; also baked into both `dist` bundles and three SQL
  files). Sign-in is Supabase Auth (`VITE_AUTH_EMAIL_DOMAIN`). Never run it without overriding those
  variables, and never serve its `dist` (the live address is baked in).
- **No other secret found:** no Supabase secret or `service_role` key, no JWT, no private key, no
  Postgres URL with a password, no API-key or client-secret assignment, no `.env`, dump or spreadsheet.
  The GUID-shaped values are in `sql/tests/phase8_scenario.sql` (test ids).
- **Real personal data:** **5 real employee full names** in `src/lib/trDict.js` (the Arabic→English
  dictionary) of both apps and in their built copies. No real ID, phone, IBAN or e-mail address.
  **`trDict.js` must not be copied as it is**; the names are left out of anything ported.

### Viewing the design safely

A scratch copy (sources, `public`, configs and lock files only; not its `dist`, `node_modules`, `sql`,
`supabase` or `docs`) lives in the session's scratch folder, outside both repositories. Its packages were
installed fresh from its own lock files with `npm ci --ignore-scripts`. It is served on this PC only, with
the Supabase address pointed at a dead local port:

```
VITE_SUPABASE_URL=http://127.0.0.1:9  VITE_SUPABASE_KEY=offline-no-key
npx vite --host 127.0.0.1 --port 5180 --strictPort    # design HR  → http://127.0.0.1:5180/
npx vite --host 127.0.0.1 --port 5181 --strictPort    # design employee → http://127.0.0.1:5181/employee.html
```

Checked: the served `config.js` carries the dead address, so the live project's address in the file is an
unused fallback. Without Supabase nobody can sign in, so only the sign-in screen and the outer shell
render; the screens behind sign-in are compared by reading the design's code.

## Phase 1: analysis (3 Nov 2026; no code changed)

### Sizes

| | Design | Ours |
|---|---|---|
| HR | `ARIBA_HR_React`: 13,474 source lines, 27 menu entries in 7 sections (33 page titles; corrected 3 Nov 2026, see Phase 2a), about 125 Supabase functions + 5 edge functions | `hr-web` (Next.js 16): 12,007 lines, 15 HR screens + a `/me` employee web area, 117 backend routes available |
| Employee | `ARIBA_Employee_React`: 4,561 lines, 10 tabs, about 40 Supabase functions | `employee-app` (Expo SDK 58): 6,366 lines, 11 tabs (the same 10 + «المزيد») + 12 extra screens |
| Shared styling | 176 CSS class names (`legacy-base.css`, `react-extra.css`) | hr-web uses 166, **85 shared**: both descend from the same original stylesheet; the same Tabler icon font |

### (a) hr-web, screen by screen

Status: **exists** (we have it; the design changes its look or behaviour), **new** (the design has it, we do
not), **ours only** (we have it, the design does not). "API" says whether our backend already serves it.

| Design menu entry | Our route | Status | API |
|---|---|---|---|
| لوحة التحكم (dash) | `/dashboard` | exists; the design adds a work queue (`staff_queue`) | partly: `/dashboard` yes; queue = `/requests` pending |
| الموظفون (emps) + employee form | `/employees`, `/employees/new`, `/employees/[id]` | exists; the design adds sub-lists (Saudis, expats, consultants, excluded, by project) | yes (`/employees`, `/employees/counts`) |
| المرشحين (cand) + public apply page | — | **new** | **no** (tables exist from migration 001, no routes) |
| بطاقات العمل (bizc) | — | **new** | **no** (no table either) |
| الإعلانات والتهاني (ann) | — | **new screen** | **yes** (Stage 7: `/announcements`, `/occasions`, `/settings/greetings`, `/settings/announcements`); closes FOLLOW_UPS #43 |
| المستهدفات (goals) | — | **new screen** | yes (`/targets`) |
| التقييم (eval) | — | **new screen** | partly: get/approve per employee and period; **no "list all" route**; HR must stay read-only (privacy rule: HR never writes evaluations) |
| الحضور والانصراف (att) | `/attendance` | exists | yes |
| مواقع البصمة (loc) | `/locations` | exists | yes |
| الإجازات والطلبات (lv) | `/leaves` | exists; the design adds HR recording a leave, cancelling, returning to the manager, escalation, leave files, balance snapshots, workflow settings | partly (`/requests/*` approve/reject/override/final-approve; the rest **no**) |
| توفر الفريق والمهام (team) | — | **new screen** | yes (Stage 4: `/team/availability`, `/tasks`) |
| مسير الرواتب (pay) | `/payroll` | exists; the design's prepare/draft/reopen steps | partly (`/sheets` approve/unapprove, `/payroll-archive`) |
| حاسبة التأمينات / الراتب / الضريبة (insc, salcalc, taxcalc) | — | **new** (three calculators) | mostly client-side; GOSI rates from `/settings/gosi-rates` |
| ملف تحويل الرواتب (wps) | — | **new** (bank transfer file export) | data from `/sheets` (salary roles only) |
| تقرير المخصصات (prov) | — | **new** (end-of-service provisions report) | client-side from `/employees` + `/salary/basis` |
| الأصول والعهد (assets) | — | **new** | **no** (tables exist, no routes) |
| كشف الراتب (slip) | `/payslips` | exists | yes |
| نهاية الخدمة (eos) / المخالصة (eoscalc) | `/end-of-service`, `/settlement` | exists | yes |
| الوثائق (docs) | `/documents` | exists | yes |
| التقارير (rpt) | `/reports` | exists | yes |
| الإعدادات (set) | `/settings` | exists; the design's settings are much larger (27 files): roles and permission matrix, mail accounts, expiry alerts, flexible hours / Ramadan, brand colours from a website, apply mode | partly (company, attendance, gosi, lists, accounts, app links, doc-sign, manager perms, push, greetings); the rest **no** |
| سجل التعديلات (audit) | — | **new** (audit log + purge requests) | **no** (tables exist, no routes) |
| سلة المهملات (bin) | — | **new** | **no** (table `ariba_deleted_items` exists, no routes) |
| نماذج (forms) | `/templates` | exists | yes (`/letters`) |
| AI assistant (floating) | — | **new** | **no** (Supabase edge function `ariba-ai`, an external AI service) |
| — | `/me/*` (employee web area: home, attendance, leaves, overtime, salary, team, approvals, documents, profile, login) | **ours only** | yes; DEPLOY_RAILWAY.md names it the browser path for employees, so it is kept |

### (a) employee app: structure, and identity to map

The tab set is already the design's (home, attendance, leaves, salary, team, profile, approvals, goals,
overtime, documents), plus our «المزيد». Structure changes still needed:

| Design piece | Ours | Change |
|---|---|---|
| `MyCard` (my business card, QR / vCard) | — | new; **gap** (no business-card API) |
| Leaves: cancel or edit my own request (`leave_emp_cancel`, `leave_emp_edit`, `leave_cancel_request`) | — | new; **gap** |
| Leave balance snapshot (`my_leave_snapshot`, `mgr_team_leave_snapshots`) | balances from `/me/leave` | **gap** (decide whether our balance answer is enough) |
| `IdleGuard` (warn after 5 minutes idle, sign out after 3 more) | — | new; front-end only |
| `password_status` prompt | `must_change_password` → change-password screen | **ours already covers it**; keep ours |
| `AnnCard`, `Bell`, `Delegation`, `ForgotPunch`, `WorkLocations`, `ProfileRequests`, `MgrSignDocs`, `SigManager`, `MgrTeam`, `MyGoals` | present (announcements card, bell, delegation, forgot-punch, work-locations card, profile edit / IBAN change, signing, team, goals) | compare layout and states screen by screen in Phase 3 |
| `BioAsk` (offer biometric sign-in) | biometric in `login.tsx` | compare |

**Identity to map, not copy:** the design's colours, fonts, icons and logos map to our theme tokens
(`src/theme.tsx`), our fonts, our icon set (`src/components/icons.tsx`) and `/public/brand`. **Default when
unclear:**
- a functional label (a button, tab or field) takes the design's wording;
- a company name, slogan or greeting keeps ours;
- a colour that marks a state (danger, success, warning) maps to our nearest token, never a new colour;
- an illustration the design draws itself is replaced by our icon of the same meaning.

### (b) Endpoint and field gaps (front ends adapt; nothing invented; each is a decision for the owner)

| Screen | Design call(s) | What it expects | What we have | Size |
|---|---|---|---|---|
| Candidates + public apply page | `hr_candidates`, `hr_candidate_*`, `hr_invite_*`, `hr_apply_key_rotate`, `hr_apply_mode_set`, `hr_medical_form_*` | candidate list, files, invites, accept/reject, an unauthenticated application page | tables only | L (and a public, unauthenticated page: a security decision) |
| Business cards (HR + employee `MyCard`) | `hr_bizcards`, `hr_set_bizcard`, `get_bizcard` | per-employee card fields, QR | nothing | M (needs a migration) |
| Assets & custody | `assets_list`, `assets_upsert`, `assets_delete`, `asset_custody` | assets with custody history | tables only | M |
| Audit log | `audit_list`, `audit_add_many`, `audit_purge_*` | readable audit list, a two-person purge flow | table `ariba_audit_log` (written, never listed) | M (privacy: who may read it) |
| Recycle bin | `bin_list`, `bin_restore`, `bin_purge` | deleted items, restore | table only | M |
| Roles and permission matrix | `hr_list_roles`, `hr_set_role`, `perms_matrix`, `perms_set` | editable role permissions | roles are fixed in code (`HR_ROLES` …); table `ariba_role_perms` unused | L (it changes how access works) |
| Evaluation list | `eval_list` | all evaluations for a period | per employee only | S |
| HR leave actions | `hr_record_leave`, `hr_leave_cancel`, `hr_return_to_manager`, `hr_run_escalation`, `hr_delete_leave`, `leave_file_*`, `hr_leave_snapshots`, `hr_get/set_wf_config` | HR acting on leaves beyond approve/reject | approve, reject, override, final-approve | M–L |
| Employee leave cancel / edit | `leave_emp_cancel`, `leave_emp_edit`, `leave_cancel_request` | an employee withdrawing or changing a pending request | nothing | M |
| Leave snapshots | `my_leave_snapshot`, `mgr_team_leave_snapshots` | stored balance snapshots | live balances | S–M |
| Payroll steps | `payroll_prepare`, `payroll_draft_get`, `payroll_reopen`, `payroll_status_get` | a draft → approve → reopen cycle | `/sheets` approve/unapprove | M (mapping, maybe no backend change) |
| Mail accounts settings | `mail_get/set/delete` | SMTP account settings | none (e-mail is off by rule) | hide while e-mail is off |
| Expiry alerts | `hr_alerts_run`, `hr_alerts_status` | a daily alerts run | none | M |
| Flexible hours / Ramadan | `hr_set_flexible_hours`, `hr_set_ramadan_flex` | attendance variants | `/settings/attendance` (partly) | S–M |
| Brand colours from a website | edge `ariba-brand-colors` | the server fetches a URL | none | refuse by default (an outbound fetch to any URL) |
| E-mail / report sending | edge `ariba-send-email`, `ariba-send-report` | sending mail | none, e-mail off | hide |
| AI assistant | edge `ariba-ai` | an external AI service | none | hide |
| Accounts with a default password | `hr_default_password_list` | a list of accounts still on a default password | none | **refuse as designed**; at most a `must_change` count (passwords are never readable) |
| Direct message to an employee | `hr_send_message` | a bell message from HR | announcements to chosen employees (Stage 7) | S (map to announcements) |

### (c) Our work that the design lacks (kept unless the owner says otherwise)

- **hr-web:** the `/me` employee web area; the notification-links settings card (`/settings/app-links`); the
  Stage 2/5/6/7 settings (manager permissions, team salary, doc-sign, push, greetings, announcements e-mail).
- **employee app:** `/public/brand` theming and logo; the request envelope (`POST /me/requests`); documents and
  the letter viewer (sandboxed, scripts off); signing; tasks; goals and team goals; announcements; password
  recovery (Stage 8, same answer for everyone); push-token registration; «المزيد»; the home-screen install
  hint and PWA files; IBAN change, profile edit, submit-for, upload-document.
- **Privacy rules that stay:**
  - managers see direct reports only;
  - salary is hidden unless the setting and permission allow;
  - a leave's type reaches colleagues as "away" only;
  - HR never writes evaluations;
  - refusals are 404.

  Any design screen that would show more than the API returns is hidden or listed as a gap, never filled
  with sample data.

### (d) Dependencies

- **hr-web** already has `@tabler/icons-webfont`, `chart.js` and React 19.2.8 (the design's versions).
  Possibly new: `qrcode-generator` (only with business cards, a gap), and `jspdf` + `html2canvas` (only if a
  ported screen exports PDF; the employee app already has both). Not needed: `react-router-dom` (Next.js
  routes), `vite`. Each new package will be listed, with `npm audit`, before it is added.
- **employee app:** none expected. The design's web-only pieces (CSS, DOM printing) are rebuilt with React
  Native components we already use. Expo, React Native and Next stay on their versions.

### (e) Risks

1. **"Exactly like the design" for hr-web is a rebuild, not a copy:** the design is Vite + React Router +
   Supabase calls, ours is Next.js + our API. Every screen is re-written on our data layer, and the
   result is checked by eye, not by a tool.
2. **The design can only be seen up to its sign-in screen** without Supabase, so most of the comparison is
   code-to-screen; visual details may need the owner's eye on screenshots the owner already has.
3. **About half the new HR screens need backend work** (candidates, business cards, assets, audit, recycle
   bin, roles matrix, HR leave actions). Until approved they are hidden or shown as "not available yet",
   never faked.
4. **Privacy conflicts in the design:** HR saving evaluations, the default-password list, a public
   application page, an AI assistant that would send data to an outside service. Each stays off unless
   decided.
5. **Real data in the design's dictionary** (5 names in `trDict.js`): it must be cleaned before anything
   from it is ported.
6. **Scale:** a full parity effort is weeks of work, not days.

### Honest size estimate (working days, one person)

| Part | Estimate |
|---|---|
| hr-web shell: layout, menu (27 entries, gaps marked), theme, sign-in, header, toasts, modals | 2–3 |
| hr-web: restyle the 15 existing screens to the design | 6–9 |
| hr-web: new screens our API already serves (announcements, targets, evaluation read-only, team & tasks, three calculators, provisions, transfer file) | 5–7 |
| hr-web: new screens that need backend work | each M = 2–3, L = 4–6, plus rules and a gate per backend change; about 20–30 for all of them |
| employee app: structure parity (idle guard, layout and state alignment across the 10 tabs) | 3–5 |
| employee app: leave cancel/edit, business card, snapshots | blocked on the gaps above |

### Recommended order

1. **Phase 2a: the hr-web shell.** Menu, layout, theme, sign-in, with every gap screen visible as "not
   available yet". This shows the whole design's shape early.
2. **Phase 2b: restyle the existing 15 hr-web screens**, in small steps (one or two screens each), each with
   `tsc`, lint and a production build.
3. **Phase 2c: the new hr-web screens our API already serves** (announcements first: it closes #43).
4. **Phase 3: the employee app** (smaller, mostly alignment).
5. **The backend gaps last, one decision at a time**, each as its own backend stage on `backend-new-ui`
   (rules, gate, commit), never inside the design branch.

## Owner decisions (3 Nov 2026)

1. **All of the design's features are required**, except the AI assistant (6). Nothing else is hidden as a
   permanent default. A screen whose backend does not exist yet shows "not available yet" until its stage is
   done. **The one list is `frontend/hr-web/src/lib/features.ts`**: switching a screen on is one word there.
2. **Every backend gap is its own stage**, after the hr-web and employee-app work, in this order:
   1. roles and permissions matrix;
   2. audit-log viewer;
   3. recycle bin;
   4. candidates and the public job-application page;
   5. assets and custody;
   6. business cards;
   7. more HR leave actions;
   8. expiry alerts;
   9. the employee app's extra leave features.

   Each uses the method of stages 1–8. **Added by the port (not in the owner's list yet):**
   - fingerprint / Face ID sign-in on the web (WebAuthn; the design's sign-in button and its
     after-sign-in prompt);
   - mail-account settings (save only, sending stays off).
3. **Three decisions wait for the owner and others** (options below).
4. **The public job-application page:** rules first (draft below), and what it needs from Railway.
5. **Estimates** in screens, endpoints, review rounds and elapsed time (below).
6. **The AI assistant is OUT of scope. Deliberate deviation from "exactly like the design", 3 Nov 2026,
   owner: not needed.**
   - **Nothing of it is in our code:** no menu entry, route, screen, button or floating widget; no copied
     file or component; no call to an outside AI service; no API key or environment variable for one; no
     dependency that exists only for it.
   - **The design's stylesheets were copied with every `.ai-*` rule removed**, checked line by line
     against the originals: only those rules, their two comment lines and blank lines differ.
   - **Check run 3 Nov 2026 over the whole worktree** (`node_modules` aside):
     - no assistant code, style, translation or `ariba-ai` call in hr-web or the employee app, only notes
       saying it is out of scope;
     - no outside AI address (OpenAI, Anthropic, Google, OpenRouter, Mistral, Cohere, Hugging Face,
       Azure OpenAI) or AI key name anywhere, the hr-web build output included;
     - no AI package installed in either front end.
   - **One pre-existing exception, not added by this work:** `frontend/legacy/hr-portal/` (the old static
     prototype from the client's first commit, archive only, served by nothing) still contains its old
     assistant. Removing that folder is part of the #47 history decision.

## The three decisions waiting for the owner (and others)

**Answered by the owner, 3 Nov 2026** (the options below are kept as the record):
- **(a) Keep the design's list.** Checked: it never showed a password. It lists the name, username and
  role of active accounts "still on a default or temporary password", which the client's backend builds
  from the `must_change` flag, so it is safe exactly as designed. It needs one small HR-only read route
  (backend stage "accounts on a temporary password").
- **(b) HR may write evaluations.** This changes the Stage 3 rule "HR never writes evaluations"
  (BUSINESS_RULES § Goals). It is a backend change, so it gets its own stage, with rules first: who may
  then approve an evaluation HR wrote (proposed: not the same person; the CEO, or a second HR account)
  and the audit row. Until that stage the design's save button for HR shows "not available yet".
- **(c) A plain colour picker** with the design's presets. Our API reads the colours (`/public/brand`) but
  has **no route to save them**, so it needs a small backend stage (HR-only save of `brand_colors`, hex
  values checked, audited).

**Backend stages added by these decisions** (to the owner's list in decision 2): HR writes evaluations;
brand colours save; accounts on a temporary password. Mail settings and WebAuthn were already added.

**(a) The design's "accounts with a default password" list.** Passwords are stored only as hashes, so no
one can read or compare them.
- **Recommended: a "must change password" list instead.** It lists the accounts whose `must_change` flag is
  on (a temporary password was issued and not yet replaced), with how long ago it was issued. It is
  HR-only, and shows no password ever.
- Or: no list at all.
- The design's own list cannot be built safely.

**(b) HR saving evaluations, against the rule "HR never writes evaluations".**
- **Recommended: keep the rule.** The direct manager writes, and HR (or the CEO, per
  `goals_config.evaluation_approver`) reads and approves. The design's save button stays hidden for HR.
  This keeps one person from both writing and approving the same evaluation.
- Or: HR may write only when the approver is the CEO, audited.
- Or: HR may draft, and the manager must confirm before it counts.

**(c) Brand colours "from a website".**
- **Recommended: a plain colour picker** with the design's own presets (green, blue, brown, purple, teal,
  slate). The server never fetches anything, so there is no risk of it being used to reach internal
  addresses.
- Or: a safe fetch, if the client insists on it:
  - HTTPS only, public addresses only (every DNS answer and every redirect checked against private
    ranges);
  - at most 600 KB and 8 seconds;
  - HR only, rate-limited, audited.

  It is more work and leaves a small residual risk.

**Mail settings:** the screen is built as in the design; it saves the account details (host, port, user,
sender) but **never stores a password** (the password stays an environment variable, as today), and
**sending stays off** (FOLLOW_UPS #7). It needs a small backend stage (save/read on the existing
`ariba_mail_accounts` table).

## Draft rules for the public job-application page (for its backend stage)

These move to `docs/BUSINESS_RULES.md` when the candidates stage starts.

- **The link:** the page opens only with a current application key in the link (the design rotates it:
  `hr_apply_key_rotate`). A wrong or old key gets the same "not found" as any other page. HR can switch
  the page off (`hr_apply_mode_set`).
- **What is asked:** name, phone, e-mail, position, nationality, years of experience, expected salary, and
  a CV, plus a consent box with a short privacy notice (Saudi Personal Data Protection Law): what is kept,
  why, for how long, and who reads it. **Not asked here:** ID numbers, health or family details. The
  design's medical form is a separate decision, because it is health data.
- **Files:**
  - **Types:** PDF, JPG or PNG only, checked by the file's contents, not its name.
  - **Size:** at most 5 MB each, 3 files, 10 MB in total.
  - **Names and storage:** the server renames them and stores them like our other documents (database
    rows, the same `max_upload_bytes` cap), **never served on a public address**.
  - **Viewing:** opened only by HR, every opening audited.
- **Rate limits:**
  - at most 5 applications per address per hour and 20 per day;
  - at most 3 per e-mail or phone per day;
  - a daily total cap;
  - the same 429 for everyone.

  They are counted in the database (like login and recovery), so a restart keeps them.
- **Spam:** a hidden "honeypot" field and a minimum time on the page first. A CAPTCHA would mean an outside
  service, so it is a separate decision, only if spam gets through.
- **Who reads applications:** HR only (`hr`, `admin`, `admin_manager`). Managers, the CEO and employees do
  not, by default.
- **Notice to HR:** a bell entry. No e-mail while sending is off.
- **Retention:** rejected applications and their files are deleted after a set period (proposed: 12 months),
  accepted ones become the employee's file.
- **Audit:** each submission (no content), each HR opening, each accept or reject.
- **What it needs from Railway:**
  - the page served by the hr-web service (or a separate small service if the client wants
    `careers.…`, which then needs a DNS record);
  - the public address added to `CORS_ORIGINS`;
  - Railway's request-size limit confirmed above 10 MB (**not verified**);
  - the real client address passed correctly behind Railway's proxy, for the rate limits (#40);
  - database backups sized for the files;
  - no extra paid service, unless a CAPTCHA or virus scanning is chosen (neither is on Railway by
    default; **not verified**).

## Estimates in units (3 Nov 2026; every elapsed time is a guess)

Pace taken from stages 1–8: **one review round (build, gate, the owner's check) ≈ 3–6 hours** including the
owner's review.

| Part | Units | Review rounds | Elapsed (guess) |
|---|---|---|---|
| 2a hr-web shell | shell, menu (27), sign-in, 14 waiting pages | 1 (this one) | done, pending review |
| 2b restyle the 15 existing hr-web screens | 15 screens | about 8 (two screens a round) | 24–48 h |
| 2c new screens our API serves | 9 screens (announcements, targets, evaluation, team & tasks, 3 calculators, transfer file, provisions) | about 5 | 15–30 h |
| 3 employee app alignment | 10 tabs + idle guard | about 4 | 12–24 h |
| Backend stages (9 in the owner's order + WebAuthn + mail settings) | about 50–60 endpoints in total: roles matrix ~8, audit ~4, bin ~3, candidates + public page ~12, assets ~4, business cards ~3 (+ migration), HR leave actions ~8, expiry alerts ~2 (+ a daily run), employee leave ~3, WebAuthn ~4, mail settings ~2 | 2–3 each (rules, build/gate, fixes) + 1 each for its screen = 33–44 | 100–260 h |
| **Total** | | **about 50–60 rounds** | **about 150–360 h, roughly 5–12 weeks at one round a day (guess)** |

Measured, not guessed: the sizes of both codebases, the endpoint counts per gap (from the design's calls),
and the pace range of stages 1–8. The guesses are the number of rounds per screen and the elapsed time.

## Phase 2a: the hr-web shell (3 Nov 2026, not committed)

**What changed (branch `design-port`):**

| File | Change |
|---|---|
| `src/lib/hr-nav.ts` (new) | the design's menu: 27 pages in 7 sections, its icons, Arabic and English labels, its three counters (active employees, pending requests, documents in their alert window), its page titles; our pages keep their URLs, the 14 new pages get new ones |
| `src/lib/features.ts` (new) | **the one list** of what waits: 14 pages, plus shell features (section audit strip, candidate auto-registration, fingerprint sign-in, e-mailing an export, the export stamp) |
| `src/components/hr/hr-shell.tsx` | rebuilt on the design's `Layout.jsx`: collapsible menu (remembered, closed on phones, Escape and backdrop), build stamp, company name and logo and colours from OUR `/public/brand`, theme (icon only, as in the design), date, bell, language, export, print, refresh, role badge, password, sign out |
| `src/components/hr/hr-bell.tsx` (new) | the design's bell on OUR `/me/notifications` (checked every 3 s while visible, as in the design) |
| `src/components/hr/idle-guard.tsx` (new) | 5 minutes idle → a 3-minute countdown → sign-out, and the sign-in screen says why |
| `src/components/hr/occasions-auto.tsx` (new) | once a day, OUR `/occasions/run-auto` (HR only; sends nothing while the greetings switch is off) |
| `src/components/hr/page-export.tsx`, `src/lib/exporter.ts`, `src/lib/xlsx.ts` (new) | export any table on the page to PDF / Excel / Word (the design's library-free Excel writer, with its formula-injection guard); the stamp and the e-mail half show "not available yet" |
| `src/components/hr/pending-screen.tsx` (new) + 14 `page.tsx` | "not available yet", with what each page waits for; never sample data |
| `src/lib/brand.ts` (new) | the design's palette from the company colours, fed by `/public/brand` |
| `src/app/(hr)/login/page.tsx` | the design's light sign-in screen: eye toggle, remember me (the **username** only), fingerprint button (waits), forgot password on OUR `/auth/password-recovery`, forget this device, the idle message |
| `src/app/(hr)/layout.tsx` | English turns the page left-to-right, as in the design |
| `src/lib/routes.ts` | the 14 new pages: the five payroll-module ones with payroll's readers, the rest with HR's |
| `src/styles/hr.css` + `src/styles/hr/design/*` (new) + `ours-extra.css` + `fonts.css`; **27 old `src/styles/hr/NN-*.css` removed** | the design's two stylesheets (AI rules removed) replace the 27 V114 files; `ours-extra.css` keeps the 43 rules only our screens use (date-time field, gender icons, KPI icon, department bar, calendar cells); `fonts.css` loads the real ARIBA Two files (the design only looks for an installed font) |
| `next.config.ts` | the build stamp (build time in Riyadh) |
| `package.json` / `package-lock.json` | **two new packages** for PDF export: `html2canvas` 1.4.1 and `jspdf` 4.2.1, the versions the employee app already uses |

**Checks run (3 Nov 2026):**
- `npx tsc --noEmit`: exit 0.
- `npm run lint`: 0 errors, 0 warnings.
- `npm run build`: exit 0, 43 pages.
- Backend tests on this branch: 384/20 without a database, and 389/15 against a fresh copy of `ariba_src`
  (the Stage 7 baseline, unchanged).
- The shell's backend calls, as HR (`EMP010`) and as an employee (`EMP002`):
  - **HR:** brand, counters, document registry, bell → 200; greetings run → 200 with 0 sent;
  - **employee:** pending requests, document registry and the greetings run → **403**.
- The AI check above.

**`npm audit` after the change: 18 findings, none from the two new packages** (`jspdf` brings `canvg`,
`core-js`, `dompurify`, none flagged). All 18 were already there:
- **critical: Next.js 16.3.8** (remote code execution in the image-optimisation endpoint with SVG
  files);
- **high: `zod`** (memory exhaustion on oversized input);
- **16 moderate in the lint tools** (`eslint`, `minimatch` and plugins; development only).

Fixing Next or `zod` needs a version change, which needs the owner's OK. **Recommended:** a patch-level
Next upgrade as its own small step, or meanwhile switching off image optimisation
(`images.unoptimized`, we use plain `<img>`).

**Next.js upgrade (owner's OK, 3 Nov 2026, design branch only):** `next` and `eslint-config-next`
16.3.8 → **16.4.4** (the fixed version npm offers inside major 16). It fixes:
- GHSA-2464-fhr4-w9xw, critical: unauthenticated remote code execution in the image-optimisation API
  with SVG files;
- GHSA-673q-mjm6-r5xr, critical: unauthenticated remote code execution in `use cache` functions
  returning typed arrays;
- GHSA-p3m5-59mp-jv5r, high: denial of service in the App Router with Server Actions.

All three affect 16.0.0–16.4.0. Afterwards: `tsc` exit 0, lint 0 problems, build exit 0 (43 pages), backend
tests 384/20 and 389/15 (unchanged). `npm audit`: **17 left, 0 critical**: 16 moderate in the lint
tools, 1 high in `zod` (GHSA-mrhx-c7xc-m3w5, fixed in 4.6.6, same major; **not done, needs its own OK**;
zod only checks forms in the browser here).

**Not verified:**
- the look in a browser (needs the owner's eye);
- the PDF export in a browser;
- right-to-left / left-to-right switching on every existing screen;
- the 15 existing screens under the new stylesheets (Phase 2b checks them one by one; until then some may
  look off).

**Noticed, not changed:** `GET /employees/counts` answers any signed-in account with company-wide
totals (numbers only).

## Phase 2b progress (restyle the existing screens to the design; not committed)

Method per screen: put the design's page (`ARIBA_HR_React/src/pages/…`) next to ours, keep our data
layer and privacy rules, copy the design's layout, labels, colours and buttons. A design button whose step
is not done yet shows "not available yet" with its reason from `lib/features.ts` (never a silent no-op).
After each screen: `tsc` and lint; a full build at the end of the phase.

| # | Screen | Status | Notes |
|---|---|---|---|
| 1 | Dashboard | done | design colours (brand variables, purple payroll tile, bright-green female count), all departments with %, the three side counters with the design's emoji and colours, coloured alert bars, the pending queue listed (name, type, stage, date; refreshed every 20 s; only for accounts allowed to list requests), salary summary = count + total (total only when the API sends it). **Gap:** the design's company-wide "net" total is not in our API |
| 2 | Employees list | done | muted job title, the design's terminated tag, alternating avatar colours, edit only for editors, end-of-service with the design's icon; **waiting:** delete employee (`empDelete`, recycle-bin stage) and import from Excel (`empImport`, Phase 2c) |
| 3 | Employee form / details | done (3 Nov 2026) | six tabs as in the design (custody added), «↺» on every changed field and «استرجاع الكل», «↩ تراجع», the fingerprint **work locations** box (OUR `/locations/assignments` + `PUT /employees/{id}/work-locations`, saved with «حفظ وتحديث»), document delete, the details window's leaves tab now shows today's balance and the days used in each of the last four years. **Waiting:** custody (`assets`), certificates with title / issuer / dates (`empCerts`), the probation period (`empProbation`), allowances as % of basic (`empAllowPct`), the default-password list (`pwDefaultList`), national address / GOSI fields (`docsNationalAddress`) |
| 4 | Attendance | done (rewritten; 3 Nov 2026) | the design's layout: the day's four KPI cards and record list (30-second refresh, «⏰ تأخير» / «🚪 خروج مبكر» in hours and minutes, every punch pair of a multi-punch day, location), the monthly card (now from the day engine: absences and total lateness included), and the full **report builder**: summary or daily mode, the design's 47 + 21 columns in groups with presets and column order, templates saved in this browser, all / filtered / hand-picked employees (terminated optional), 15 extra sections (KPI cards, departments, rankings, daily trend with chart, weekdays, absence / lateness / early-exit / no-check-out / leave / day-off details, the matrix, the daily detail, method note), sort, totals, group by department, font size, a sandboxed preview, print on the letterhead, PDF, Excel (one sheet per section) and Word. Add / edit only for HR and admin. **Waiting:** e-mailing the report (`exportEmail`), the official / Ramadan shift schedule (`attSchedule`, new). The stamp (`exportSeal`) is done — see "Phase 2c: the seal studio". See "Phase 2b: attendance" below |
| 5 | GPS locations | done | the design's header (title + small add button) and blue info note, its card width; add / edit / delete only for editors (HR, admin), as in the design. Already ours and kept: the card grid, Google Maps link, map preview, linked-employees summary |
| 6 | Leaves & requests | done (3 Nov 2026) | the design's six tabs and wording, Arabic and English; decisions in the design's note dialog (no browser pop-ups): approve (on behalf at the manager / CEO stage), final approval (manager and HR stages only, as in the design), reject with a reason; «طلب جديد» only for editors, with «↺» undo per field and the exemption check for consultants / Tamheer / trainees; all-requests table in the design's columns plus the attachments archive; balances as in the design (one employee in detail + the balance equation; the all-employees table goes to print); balance editor with undo per cell / year / all; holidays add / delete only for editors. **Waiting:** return to manager (`lvReturn`), cancel an approved leave (`lvCancel`), undo the last balance save (`lvBalanceUndo`). **Kept from ours:** the pending type filter (the attendance page links to it), the labour-law note, the missing-Eid warning, deleting a request (permanent: no recycle bin yet, the dialog says so) |
| 7 | Payroll | done (3 Nov 2026) | the design's toolbar (bulk days buttons always there for editors: before, they showed only when a terminated employee could be added), the status bar (📝 draft / 🔒 approved), employer subtotals in the sheet, the design's **Excel with formulas** (`lib/calc/payroll-out.ts`), the printed sheet with its **column chooser** remembered in this browser and our company name, «✓ محفوظ» instead of a toast on every save, other users' edits picked up every 6 s, reopening needs a reason (≥ 5 letters, written to the audit log), the archive loads with the page and «مراجعة» opens the month's rows. Edit for HR and admin; approve / reopen for finance, HR and admin. **Waiting:** «تجهيز للمالية» (`payPrepare`) |
| 8 | Salary slip | done | the design's one-row header (employee, month, year in fixed proportions) and its print button (disabled until a slip is shown). The slip body already matched. Not ported: the design's Egyptian-tax breakdown box (our payslip data has no Egyptian tax fields; shown only for Egypt-paid staff) |
| 9 | End of service | done | the design's employee picker beside the employer filter, KPI tiles that wrap; **changes the totals:** as in the design, consultants, Tamheer and training staff get no end-of-service award and are left out, with a note saying how many |
| 10 | Settlement | done | already matched (same fields, ids and official print; 47 of the design's 55 labels); added the design's e-mail button (**waiting:** `exportEmail`, sending off) and its «(اختياري)» label. **Remaining:** the design asks Arabic or English before the official print (`askLang`); ours prints Arabic only. **Left out on purpose:** the design's `aiBridge` link (the AI assistant filling this form) |
| 11 | Documents | done | the design's top bar order (tabs, then print this tab, refresh, print all), tab labels without icons (🪪 on iqamas), and its **six** tabs; **waiting:** national address (`docsNationalAddress`) and social-insurance certificate (`docsGosiCert`): our documents registry does not return those fields yet (a small backend addition) |
| 12 | Reports | done (rewritten) | the design's model: 11 cards in its order (adds **probation end**, 90 days from the joining date, and **medical insurance**); every report is columns + rows, with the design's column chooser (show / hide / reorder), all or chosen employees, totals, print and Excel. Data from our API as before. **Waiting:** the custom report builder (`reportCustom`, 2c), the comprehensive leave report (`reportLeaves`, 2c), the certificates report (`reportCerts`, needs a route listing every employee's documents). **Gaps:** a per-employee probation extension (no field); the report-language switch (our salary data has no English names). **Changed on purpose:** our old end-of-service report left out two specific people by name in the code; it now follows the design (no award for consultants, Tamheer and training staff; only amounts above zero), so the name list is gone. Alerts now include medical insurance |
| 13 | Settings | done (3 Nov 2026) | the design's ten numbered sections (open state remembered), search and chips; our cards moved into them; **new on OUR routes:** direct-manager permissions with the company-wide team-salary switch (Stage 2), document signing types + the «HR closes» switch (Stage 5, off by default), push switch with the device count (Stage 6); read-only for everyone except HR and admin. **Waiting cards** (each names its stage): brand colours (`brandColors`), letterhead (`letterhead`), official / Ramadan schedule (`attSchedule`), leave policy (`lvCancel`), carry / accrual / special entitlements (`leaveRules`), punch logo (`punchLogo`), workflow and circles (`wfConfig`), mail accounts (`mailSettings`), sending mode (`exportEmail`), expiry alerts (`expiryAlerts`), application page (`cand`), roles matrix (`rolesMatrix`) |
| 14 | Templates | done | already a close port: all eight of the design's documents (onboarding, custody, probation extension, probation end, contract end, clearance, experience, probation evaluation), the salary certificate with Arabic/English, bulk sending and the sent list. Added the design's **job-offer letter** card (4 Nov 2026: `templatesOffer` is ready — a printed letter for a candidate, so it never goes through `/letters`). **Not added:** the e-mail button per document (sending off). **Left out on purpose:** the design's `aiBridge` link |
| 15 | Employee web area `/me` | built (Phase 3, 4 Nov 2026) | all eight tabs on the `/me/*` routes the Expo app uses, in the design's employee look; the design's shell over the area (hero clock, punch button, tiles) is the one piece left | |

### Phase 2b: attendance (3 Nov 2026, not committed)

**Files:**

| File | Change |
|---|---|
| `src/app/(hr)/(portal)/attendance/page.tsx` | rewritten on the design's `attendance/index.jsx` |
| `src/components/hr/attendance-reports.tsx` | rewritten on the design's `AttReport.jsx` (the report builder) |
| `src/lib/calc/att-reports.ts` | **extended, not replaced** (the plan named a new `attendance-engine.ts`; ours already was the design's classifier, both come from V117, so a second copy was not made): each day now also carries its punch pairs, location, notes and a day-off flag; the design's status names, `fmtHM` and the eight filters moved here. The fields the legacy-parity check compares are unchanged |
| `src/lib/exporter.ts` | `htmlPdfBlob`: a several-section report as an A4 PDF (simpler than the design's: no "smart" page breaks, a row can be cut at a page edge) |
| `src/lib/attendance.ts` | `updateAttendance` takes the day as `date`, as the API expects |
| `src/lib/features.ts` | new `attSchedule` (the design's official / Ramadan schedule), waiting for the flexible-hours stage |

**Fixed (was wrong before this change):** our old page's «تعديل» always sent a *create* request, so editing a
record added a second one (or was refused with "already checked in"). It now updates the record. **Not verified
in a browser.**

**Kept from ours, on purpose:**
- the forgot-punch notice;
- editing each session of a multi-session day on its own (our API stores sessions; the design rewrites the day);
- «غائب» today = staff with no record, not on leave and not remote. The design subtracts only present and late,
  so remote and leave staff counted as absent.

**Fixed from the design:** its «متوسط التأخير» KPI read a total that does not exist and always showed 0.

**Not ported (gaps, nothing invented):**
- the "direct manager" and "mobile" columns: our employee list does not return them;
- the official / Ramadan shift schedule (`attSchedule`): required hours come from the number in step 4 (it
  starts at our settings' shift length); the "scheduled shift" column and the lateness detail's "shift start"
  use our fixed work start, and stay empty while flexible hours are on (they are on in `ariba_design_port`);
- work days are Sunday to Thursday, as in the design's fallback (our settings have no work-days field);
- the ID column shows the **masked** number our API returns, never the full one.

**Checks run (3 Nov 2026):**
- `npx tsc --noEmit`: exit 0. `npm run lint`: 0 problems. `npm run build`: exit 0, no route added.
- Read-only on `ariba_design_port` through the 8040 backend:
  - every call the screen makes → 200 as HR (`EMP010`) and as CEO (`EMP086`);
  - attendance, range and requests → **403** as an employee (`EMP002`);
  - our engine on the last five weeks: 27 punch rows grouped into 19 employee-days, 2 of them with several punch
    pairs, 220 weekend / holiday days flagged, 3 approved leaves placed.
- Noticed and checked, fine: `/employees` answers an employee with their own record only.

**Not verified:**
- the look in a browser (needs the owner's eye) and the right-to-left / left-to-right switch;
- print, PDF, Excel and Word output in a browser;
- the edit fix against the API (it writes; it needs the owner's browser test on the copy);
- the legacy-parity check (`tools/legacy-parity`, `npm test`): its own packages (`jsdom`) are not installed,
  and installing them needs the owner's OK.

### Phase 2b: leaves, payroll, employee form, settings (3 Nov 2026, not committed)

**Owner's instruction (3 Nov 2026):** continue with leaves and all the phases; the owner tests everything at once.

**New files:** `src/components/hr/prompt-modal.tsx` (the design's note / confirm dialog), `src/lib/calc/payroll-out.ts`
(the payroll Excel with formulas and the printed sheet with its column chooser).

**Changed on purpose:**
- leaves: «اعتماد نهائي» is no longer offered at the CEO stage (the design offers it at the manager and HR stages only);
- leaves → balances: the on-screen all-employees table and its six totals are gone, as in the design; the same
  table is printed from the 🖨 button;
- payroll: the year list runs 2011–2086, as in the design.

**Checks run:**
- `tsc` exit 0, lint 0 problems and `npm run build` exit 0 after each screen.
- `tools/legacy-parity` (owner's OK to install its packages, 3 Nov 2026; `npm ci --ignore-scripts`, 0
  vulnerabilities): **all suites match**, attendance 40/40.

**Not verified:** every screen in a browser; payroll Excel opened in Excel; the printed payroll sheet; the 6-second
refresh with two users; saving work locations, manager permissions, document signing and push from the new cards.

## Phase 2c: the new hr-web screens our API already serves (3 Nov 2026, not committed)

| Screen | Route | Built on | Notes |
|---|---|---|---|
| Announcements & greetings | `/announcements` | Stage 7: `/announcements`, `/occasions`, `/settings/greetings`, `/settings/announcements` | the design's four tabs (send, automatic greetings, occasions, sent log); closes FOLLOW_UPS #43. **Adapted:** our API knows 8 occasions, the design's others (Eid, Ramadan, National Day, recovery, condolence, appreciation) are sent as «other» with the design's wording; `{name}` / `{years}` are taken out before sending (our API sends one text to everyone); «one company» goes to that company's current employees by name (the API wants the company's internal id, which hr-web does not receive), so a later joiner of that company does not see it; hiding an item also deletes its bell entries (our rule). **Waiting:** HR's own greeting texts and per-person names (`annTemplates`) |
| Targets | `/targets` | Stage 3: `/targets` | one employee, one period (annual / quarterly / monthly), add / edit / delete; the employee is told of new and deleted targets (our API) |
| Evaluation | `/evaluation` | Stage 3: `/evaluations/…` | HR reads approved evaluations and approves submitted ones when HR is the configured approver (the default); «not found» when there is nothing HR may see. **Waiting:** HR writing an evaluation (`evalHrWrite`, owner decision b) |
| Team & tasks | `/team` | Stage 4: `/team/availability`, `/tasks` | availability (private leave types arrive only as «إجازة»), tasks and meeting invitations, inbox / sent, 90-second refresh. «Back to work» skips Friday and Saturday only (the design also skips official holidays) |
| Insurance calculator | `/insurance-calculator` | OUR payroll engine + `/settings/gosi-rates` + documents registry | the same rows, days and rates as the payroll; days editable per row; Excel, official print, the GOSI file (Excel / CSV) |
| Salary calculator | `/salary-calculator` | the design's formulas + `/settings/gosi-rates` | four modes; the employee rate comes from OUR GOSI settings for the date (the design also has a built-in schedule; ours keeps one source). «إنشاء عرض وظيفي بهذه الأرقام» carries the components to the templates page's offer card (4 Nov 2026, see below) |
| Tax calculator | `/tax-calculator` | arithmetic only | as in the design |
| Salary transfer file | `/salary-transfer` | the month's saved payroll sheet + documents registry | payment-method and employer filters, ID and IBAN checks (mod-97), Excel and CSV |
| Provisions report | `/provisions` | OUR payroll engine + `/leave/used-through` | end of service and leave value if every current employee left at month end, and the increase over last month |

**New helpers:** `src/lib/goals.ts`, `src/components/hr/goals.tsx`, `src/lib/calc/month.ts`.

**Checks run:** `tsc` 0, lint 0, `npm run build` exit 0, legacy parity all suites match. Read-only on
`ariba_design_port` as HR (`EMP010`): every route these screens call answers 200 with the expected fields
(`/settings/gosi-rates` returns fractions, e.g. 0.1075, as the salary calculator assumes).

**Not verified:** every screen in a browser; sending an announcement, saving a target, sending a task (they write;
part of the owner's test on the copy); the insurance and provisions figures against a hand calculation.

### Phase 2c, continued: two report tools (3 Nov 2026, not committed)

- **Custom report builder** and **comprehensive leave report** open from the reports page's tool cards
  (`src/components/hr/report-builder.tsx`, `src/components/hr/extra-reports.tsx`), with the design's grouped columns,
  presets, column order, templates in this browser, employees all / filtered / picked, preview and the export dialog
  (`ExportDialog` from `page-export.tsx`, now exported). The leave report adds the design's search, sort, group by
  department, totals and low-balance highlight, and its year ledger comes from `/leave/balances/{id}` per employee
  (six at a time).
- **Gaps (no list route returns them):** mobile, e-mail, religion, direct manager, number of dependents, bank account
  number. The certificates report still waits (`reportCerts`).

### Phase 2c: the seal studio on exports (4 Nov 2026, not committed)

The last Phase 2c item (`exportSeal`): the design's `lib/sealStudio.js`, ported whole.

- **`src/lib/seal.ts` (new)** — the places themselves, with no React in them: `sealState()` opens on the signer saved
  in Settings (`hr_signer`) at this form's saved places, `overlayHtml()` writes the A4 layer in millimetres, and
  `savePositions()` / `saveFlags()` / `sealAuto()` use the design's own store keys (`ariba_seal_pos`,
  `ariba_seal_flags`, `ariba_seal_auto2`), so each form keeps its own places and the last choices in this browser.
  `previewDoc()` wraps a piece of a report in a real A4 page for the preview.
- **`src/components/hr/seal-studio.tsx` (new)** — the studio: a scaled A4 preview in an iframe with the stamp,
  the signature and the name/title sitting on top of it; drag any of them with the mouse or a finger, then the
  side panel has the title and name, three show/hide switches, size and tilt sliders, «إعادة ضبط المواضع»,
  «بدون ختم», «تطبيق الختم» and «استعمل هذه المواضع تلقائياً». `useSealStudio()` returns the element and an
  `askSeal(html, title)` promise, so a caller keeps its own download flow.
- **`src/lib/exporter.ts`** — `ExportSpec.overlay` and `htmlPdfBlob(html, { overlay })`: the layer is rendered once
  as a transparent 794×1123 sheet and drawn over **page 1** of the PDF, exactly as the design's `pdfBlob` did
  (a landscape table has no place for it, so it is offered for portrait only).
- **Where it is offered:** «ختم / توقيع (قابل للتحريك)» in `components/hr/page-export.tsx` (every page's table
  export) and in the attendance report's export dialog (`components/hr/attendance-reports.tsx`) — the two places
  that used to say «غير متاح بعد». `lib/features.ts` `exportSeal` is `ready`, and the `ui` status has no entry left.
- **Kept from ours:** the signer is the one saved in Settings. The design could also name any employee as the
  signer; we store a single signature and stamp (`hr_signer`, V120), so that list would show a name with no
  signature of his. Forms printed through `lib/calc/forms.ts` keep their own V120 signature block — the studio sits
  on top of an export, it does not replace the block on the letterhead.

### Still to do in Phase 2c

Nothing. `exportEmail` was never a Phase 2c item: it waits for a sender to be approved (FOLLOW_UPS #7) and still
says so in both export dialogs.

### Phase 2c: import employees from Excel (3 Nov 2026, not committed)

- **Where:** «استيراد من Excel» on the employees list (`EI_OPEN`) opens `src/components/hr/employee-import.tsx`,
  the design's `pages/employees/Import.jsx`: pick an `.xlsx` / `.csv` file, choose a sheet when there is more than
  one, check the column mapping («— تجاهل —» drops a column), see the four counts and a preview of the first 300
  rows with each row's reason, download the template (the design's 35 Arabic labels, written by our own
  `buildXlsx`), then «استيراد n».
- **The reader is ours and has no library:** `src/lib/import-xlsx.ts` is the design's `lib/importXlsx.js`, typed —
  a zip reader over the browser's `DecompressionStream`, `sharedStrings`, date styles and `DOMParser` for `.xlsx`;
  `,` `;` or tab for `.csv`, quoted cells, Arabic-Indic digits, any date order and Excel serial dates. Its header
  dictionary and conversions are unchanged except that the choices come back as OUR codes (`matching` /
  `non_matching` / `non_saudi`, `mudad` / `bank_transfer` / …, `SAR` / `USD` / …).
- **Every row is checked before anything is written** (`src/lib/employee-import.ts`): the master lists are
  resolved to ids by name (nationality, employer, department, and the direct manager by employee name), and the
  API's own rules are applied first — a name of at least two letters, an employer that exists, a joining date, an
  ID of ten digits, a fixed contract with its months. A bad e-mail, mobile or IBAN is dropped with a warning
  instead of failing the row. A row that breaks a blocking rule shows as «مرفوض» and is never sent.
- **Writes:** a new employee goes through `POST /employees`; an existing one through `PATCH /employees/{id}` (the
  design's «تحديث الموظفين الموجودين» checkbox) that carries only the columns the file has, so an empty cell never
  blanks a saved value. Number / e-mail / ID uniqueness stays the API's job: its 409 is listed per row under the
  preview, and the dialog stays open when anything failed.
- **Two honest differences:** an existing employee is recognised by employee number only — our list masks the ID
  and shows no e-mail, the design matched all three — and the list's tab (category) is derived from the employee
  type for a new record only, so an existing record keeps the category HR chose. The dialog states the first one.
- **Also:** the design's «غير خاضع» (exempt) GOSI cell has no equivalent in our settings, so it is left out with a
  warning; employee numbers are normalised to our `empNNN` shape (`10`, `010`, `EMP-010` → `emp010`).
- **Checks run:** `tsc` 0, lint 0, `npm run build` exit 0, legacy parity all suites match. The reader ran against
  the owner's real `employees_import_template.xlsx` (35 columns, all 35 mapped, dates read) and sample CSV text;
  `planRows` ran over eight sample rows (new, existing → skip, duplicate inside the file, missing employer,
  9-digit ID, bad e-mail dropped, fixed contract without months, a Saudi on the non-Saudi system) plus the
  employee-number shapes — every row came out with the intended action.
- **Not verified:** the dialog in a browser, and a real import writing to `ariba_design_port` (the owner's test on
  the copy); a workbook with several sheets or without shared strings was not tried.

### Phase 2c: the job-offer letter (4 Nov 2026, not committed)

- **Where:** the templates page's **عرض وظيفي لمرشح** card (`TF_OFFER_CARD`, the design's `pages/forms/index.jsx`
  lines 125–143) — the one card of the design's grid we still drew as «غير متاح بعد». It is for a **candidate**, not
  an employee: the candidate's name (the only required field), the five amounts with the name of the «other»
  allowance, the automatic total, the position, the contract type, the proposed joining date, the annual leave, the
  offer date, the medical coverage and the letter's language (Arabic / English).
- **The letter** is `src/lib/calc/offer.ts`, a port of the design's `offerHtml` (`pages/forms/docs.js`): the date
  line, «الأستاذ/ …», «يسعدنا أن نقدم لك العرض الوظيفي للعمل ضمن فريق شركة …» with the company name from
  `/settings/company` (the leading «شركة » dropped, as the design does), the salary table with the total row
  highlighted, «الإجازة السنوية 21 يوم عمل», the medical coverage, the contract type and the joining date, the
  acceptance box (نعم / لا) and the candidate's name / date / signature line. It prints through `tfWrap` on our
  letterhead with the HR signature block from Settings (`hrSign`), and keeps the design's DD/MM/YYYY dates and its
  «ريال سعودي» / «SAR» amounts.
- **Hand-off from the calculator:** «إنشاء عرض وظيفي بهذه الأرقام» stores the components and opens the templates
  page, where the card fills itself once and puts the cursor on the candidate's name; «جلب من حاسبة الراتب»
  refills from the latest result at any time. The design keeps both in a module object (`lib/offerDraft.js`); ours
  is the same two slots in `sessionStorage` (`src/lib/offer-draft.ts`), because a component may not write a module
  value under our compiler lint — and this way a reload keeps them.
- **Honest differences:** the letter is **printed only** — there is no employee to send it to, so it never goes
  through `/letters` and nothing is stored (the design sends documents to employees from their cards, never the
  offer). In the English letter the signer's name and title stay as Settings has them, except that the Arabic title
  is replaced by the signer's English title when one is saved. The wording, the order of the two languages and the
  rest of the design's card are unchanged.
- **Checks run:** `tsc` 0, lint 0, `npm run build` exit 0, legacy parity all suites match.
- **Not verified:** the card, the hand-off and the printed letter (in the browser and as a PDF) — that is the
  owner's test. The English letter reuses our Arabic signature block, so its look in English is worth a look too.

## Phase 3: the employee app (3 Nov 2026, started, not committed)

- **Done:** the design's **idle guard** (`src/components/idle-guard.tsx`, wired in `app/_layout.tsx`): 5 minutes without a
  touch → a 3-minute countdown with «تمديد الجلسة» / «تسجيل الخروج» → sign-out; coming back from the background after
  the whole 8 minutes signs out at once. React Native only (no new package), so it works in Expo Go and on the web.
- **Not done:** the visual pass on a phone (colours, spacing, the hero — the design can only be read as code); it
  follows the code-to-code comparison written below. The design's business card, leave cancel / edit and balance
  snapshots wait for their backend stages (owner's list, decision 2).
- **Checks:** `npx tsc --noEmit` shows **two errors that were already on the branch** (unchanged files):
  `src/components/sig-pad.tsx` line 52 (`touchAction` is not a React Native style) and `src/lib/diag.ts` line 3 (an
  untyped parameter). Not fixed here; noted for a small separate fix. `expo lint` was not run (it would create lint
  configuration files).

### The ten tabs, screen by screen (code-to-code, 3 Nov 2026)

The design can only be read as code (`ARIBA_Employee_React/src/employee`, `goals/`, `pages/team/`), so this compares
file to file: layout blocks, labels, empty states. Ours is `frontend/employee-app` (Expo + React Native). "Same" means
every block of the design's screen has our equivalent; the notes say where ours differs and why.

| Design tab | Their file (lines) | Ours (lines) | Verdict |
|---|---|---|---|
| الرئيسية | `Home.jsx` (95) | `app/(tabs)/index.tsx` (333) | **same blocks, richer.** Announcement card · hero (avatar, greeting, live clock, date, punch ring and button, location chip, «رجوع للعمل») · three tiles (leave balance, year-end balance, remote days left) · quick actions · «بياناتي» · latest approved salary · work locations. Ours swaps their four quick actions for a full service grid (every request type), turns their pending-requests and waiting-signature cards into «طلباتك الجارية» plus the dock's badges, and shows the job title in «بياناتي» where they show the direct manager. |
| الحضور | `Att.jsx` (90) | `app/(tabs)/attendance.tsx` (156) | **same:** live clock and date, location badge, today's status with check-in / check-out / «رجوع للعمل» / forgot punch, the last 31 days, and the period lookup. Ours colours the states and spells out the location verdict (inside · outside with the distance · no work location · permission off). |
| طلباتي | `Leaves.jsx` (178) | `app/(tabs)/leaves.tsx` (69) + `components/composer.tsx` (264) | **same, moved.** Their inline form (type tiles, `workdays` preview, remaining balance, attachment, upcoming holidays) is our «+» sheet: all 22 types in four groups, attachment, holidays. The tab itself is the list — grouped by day, with statuses, delete and the delegation card. Their per-request hide and cancel-leave wait for the backend stage. |
| الراتب | `Pay.jsx` (95) | `app/(tabs)/salary.tsx` (93) | **same:** the current salary from HR, the newest approved payslip (the V119 rows and the older payload shape), the earlier approved months, the bank details. Ours shares a PDF where theirs prints the page. |
| فريقي | `Team.jsx` (72) + `MgrTeam.jsx` (107) | `app/(tabs)/team.tsx` (100) | **same, plus the permission gate:** direct reports, what HR lets the manager see (data, salary, leaves), targets and evaluation, on-behalf requests for a member who delegated, the team's requests with their stage, and a button to the tasks screen in place of their floating «المهام» button. |
| ملفي | `Prof.jsx` (85) + `ProfileRequests.jsx` (192) | `app/(tabs)/profile.tsx` (147) + `profile-edit` / `iban-change` / `upload-document` | **same:** hero, personal data with «طلب تعديل», job and contract, leave balances, salary, bank with «طلب تغيير الآيبان», «وثائقي» with «رفع مستند», theme, language, security, employer and work locations. Waiting: the business card (`MyCard.jsx`), document renewal (`DocRenew`) and document metadata (issuer, issue date) — backend stages; and their «منذ بداية الخدمة» rows only exist on the HR-only `/leave/balances`. |
| عمل إضافي | `Overtime.jsx` (44) | `app/(tabs)/overtime.tsx` (64) | **same:** date, hours, reason, optional attachment, the list with its statuses. Ours refuses less than half an hour, which is the API's own rule. |
| المستندات | `Docs.jsx` (101) + `MgrSignDocs.jsx` (51) | `app/(tabs)/documents.tsx` (171) | **same:** documents awaiting my signature (view, sign with the signature kept on the device, approve without signing, reject with a reason) and the manager's queue once the employee has signed. |
| الموافقات | `Approvals.jsx` (47) | `app/(tabs)/approvals.tsx` (73) | **same:** the queue with the type, the details, the on-behalf note, HR's return note, the attachments, approve / reject with a reason, and the approval path. Their `MgrSignDocs` also sits in this tab; ours keeps signing in one place (المستندات). |
| أهدافي | `goals/MyGoals.jsx` + `EvalForm` + `TargetsEditor` + `PeriodPick` | `app/(tabs)/goals.tsx` (64) + `team-goals.tsx` (186) | **same:** my targets and my evaluation; the manager edits targets and writes the evaluation from فريقي, which is all our API allows (HR never writes one, decision 2). |

Ours also has an eleventh tab, «المزيد», and twelve screens the design does not have (tasks, team goals, profile edit,
IBAN change, upload, letters, documents, change password, submit-for, …). So the **structure** parity of the ten tabs
is complete; what is left is the visual pass on a phone (colours, spacing, the hero) and the items below.

### What the comparison found (3 Nov 2026)

1. **The request-day preview is not the server's rule.** Their `workdays()` counts Sunday–Thursday minus the official
   holidays; our composer shows **calendar** days. The API counts the days itself (`request_days`: workdays for annual
   leave, calendar days for every other type), so nothing wrong is ever stored — only our «سيتبقى» line can be off, and
   an annual request can look affordable when it is not (the API then answers «يتجاوز الرصيد المتاح»). Fixing it needs
   the holiday list, which an employee cannot read today: `GET /holidays` is HR-only, and `/me/leave` publishes only
   the next four. **Small backend stage:** let `/me/leave` return the whole announced list.
2. **The design's «منذ بداية الخدمة» balance rows** come from `/leave/balances` (HR-only). Left out of the app, not
   faked.
3. **Signing** lives in المستندات here and in الموافقات there. Kept ours: one place to sign.
4. The two `tsc` errors that were already on the branch are still there (noted above).

### The employee web area `/me` (hr-web), started 3 Nov 2026

The same employee app on the web (`frontend/hr-web/src/app/(employee)/me/*`). Until this round only «الرئيسية» and
«ملفي» were built; the other seven tabs answered «هذه الشاشة لم تُبنَ بعد». Built now, on the same `/me/*` routes the
Expo app uses and in the design's shape:

- **الراتب** — `me/(app)/salary/page.tsx` over a new `lib/me.ts` (the employee area's own calls and types): the current
  salary from HR, the newest approved payslip (both payload shapes, optional rows only when they exist), the earlier
  months opening in place, and the bank card.
- **طلباتي** — `me/(app)/leaves/page.tsx`: my requests with their stage (awaiting the direct manager · HR · CEO ·
  approved · rejected with the reason), delete for a request that is not approved, and a new request for the eleven
  types our API records with a period. The form shows the balance and says plainly that the day count is the server's;
  the approval path and the announced holidays sit under it.

Every word is a new `me.*` entry in `lib/i18n/ar.ts` and `en.ts` (40 keys), so the area reads in both languages.
Checks after it: `npx tsc --noEmit`, `npm run lint`, `npm run build` and `node tools/legacy-parity/run.js` all pass
("all suites match the legacy HTML").

**Built next (4 Nov 2026, same round):** the five tabs that said «لم تُبنَ بعد», plus a home that stopped guessing.

- **الحضور** — `me/(app)/attendance/page.tsx`, the design's `Att.jsx`: the live clock in Riyadh time, the phone's
  place checked against the work locations (nearest circle within `radius_m`; a location with no coordinates says
  so), today's sessions with «تسجيل الحضور» / «تسجيل الانصراف» / «رجوع للعمل», every session of a multi-punch day,
  the expected check-out under flexible hours, the yearly remote-day counter, the last 31 days from `/me/attendance`
  `history`, a period lookup over `/me/attendance/range`, and «نسيت البصمة / مهمة خارجية» as a `forgot_punch`
  request. The server decides the punch (geofence, remote request, flexible window) and its refusals are shown in
  words: `OUTSIDE_GEOFENCE`, `REMOTE_NOT_APPROVED`, `TOO_EARLY/TOO_LATE_FOR_FLEXIBLE_WINDOW`, `GPS_REQUIRED`.
  The design's polygon zones are not drawn: `/me/attendance` returns circles only.
- **فريقي** — `me/(app)/team/page.tsx`: my direct reports from `/me/team` (`team_scope`: the four base fields
  always, the extra contract / leave / salary fields only with the matching permission, so they are not shown here),
  with a nudge to الموافقات when something waits. The design's task-and-meeting board and the team-availability
  screen read a tasks table our server does not serve, so that card says it waits rather than showing an empty board.
- **عمل إضافي** — `me/(app)/overtime/page.tsx`: a day, the hours (0.5 at least) and the reason as a `POST
  /me/requests` `overtime` request, my overtime requests with the server's stage, and delete while it is not
  approved. The design's optional attachment is left out (the reason carries the context).
- **المستندات** — `me/(app)/documents/page.tsx`: the letters HR sends for my signature (`/me/letters` +
  `/me/sign/states`), each one viewable in a sandboxed iframe (`/letters/{id}/html`), approvable without a
  signature, refusable with a reason of three characters, or **signed**: a canvas pad whose PNG is kept in this
  browser only (`ariba_sig_v1_<emp no>`, the design's rule), drawn into the letter exactly where the design's
  `injectSignature` puts it, then sent base64 to `POST /me/letters/{id}/sign`, which cleans it, files the signed copy
  and moves the chain (direct manager → HR when `hr_closes` is on). The stage of each letter is shown from the
  signing row.
- **الموافقات** — `me/(app)/approvals/page.tsx`, the design's `Approvals.jsx`: what waits for this account at the
  request's stage, approve, or reject with the reason box inline (no browser pop-up), with the approval path under
  it. Only `_can_act` rows arrive, so a manager sees his team, HR the HR stage and the CEO the CEO stage.
- **الرئيسية** — the home now shows the real leave balance (available / carried / by year end, plus the next public
  holiday), the newest approved payslip's net with a link to الراتب, and four quick actions. The «لا يوجد مسير
  معتمد» line it used to print unconditionally is gone — it is only said when `/me/payslips` really is empty.

`lib/me.ts` grew the calls and types for team, approvals, letters and signing (and `NewMyRequest` the hourly /
overtime / forgot-punch fields); `lib/me-labels.ts` holds the Arabic and English names of every request and letter
type, shared by the tabs (the leaves tab now uses it too). The new tabs write their labels inline with `T(ar, en)`
like the HR components, so they did not need dictionary keys; the tabs that were already built keep their `me.*` keys.

**Still open there:** the design's shell over the area (hero with the clock and the punch button, tiles, quick
actions as the design draws them) — the home has the pieces but not the design's layout; the business card
(«بطاقتي», `bizc`), the leave cancel / edit and the balance snapshot (all waiting on their backend stages); and the
attendance polygon zones above.

### Plan for the remaining 2b screens (written 3 Nov 2026, to resume in a fresh session)

The design's sources are in the scratch viewer copy (`ARIBA_HR_React/src/pages/…`); the original folder stays
read-only. Order and method:

1. **Attendance** (done 3 Nov 2026, see above) (`attendance/index.jsx` 116 + `AttReport.jsx` 355 + `engines/attendance.js` 103 lines).
   - Port the design's day classifier (present / late / absent / leave / remote / day off / pending) to
     `src/lib/attendance-engine.ts`. It is fed by OUR `/attendance/range`, approved leaves (`/leave/requests`),
     `/holidays` and `/settings/attendance` (work days, start time, tolerance).
   - Then the report builder on top:
     - presets and the column catalogue (summary, day detail);
     - sections: KPIs, department summary, rankings, daily trend, weekday analysis, the absence / lateness /
       early-exit / no-check-out / leave / day-off details, the matrix and the daily detail;
     - sort, totals, print and Excel.
   - Saved templates live in the browser, as in the design.
   - Keep our manual punch editor.
2. **Leaves & requests** (`leaves/`, 7 files, 600 lines): align the list, filters and request cards. The design's HR
   leave actions (record, cancel, return to manager, escalation, leave files, snapshots, workflow settings) wait for the
   "more HR leave actions" backend stage (feature ids to add).
3. **Payroll** (`payroll/`, 5 files, 616 lines): align the sheet, the columns dialog and the archive with our `/sheets`
   and `/payroll-archive`. The design's prepare / draft / reopen steps map onto approve / unapprove.
4. **Employee form** (`employees/EmpForm.jsx` 291, `EmpDetails`, `EmpDocsBox`, `EmpCerts`, `EmpCustody`, `PwReset`):
   align tabs and fields. Waiting:
   - custody, for the assets stage;
   - certificates, for the certificates route;
   - the "accounts on a temporary password" list (owner decision a), for its backend stage.
5. **Settings** (`settings/`, 27 files, 1,691 lines): the largest, done card by card. The roles matrix, mail accounts,
   expiry alerts, flexible hours / Ramadan, the brand colour picker (owner decision c) and apply mode wait for their
   stages.
6. **The `/me` employee web area**: restyle to the design's employee look together with Phase 3.

Each block: `tsc`, lint and build, then the tracker updated. Nothing is committed until the owner approves the phase.
