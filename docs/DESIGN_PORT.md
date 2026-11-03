# Design port: notes

Bringing the updated design into `frontend/hr-web` (exactly) and `frontend/employee-app` (structure only, our
identity kept). Kept here, not in `docs/FOLLOW_UPS.md`, so this branch merges cleanly with `backend-new-ui`.
**No personal data in this file**: ids like "employee 2" and counts only.

## Phase 0: setup (3 Nov 2026)

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
| 3 | Employee form / details | to do | |
| 4 | Attendance | next (analysed, plan below) | 85 of the design's 145 labels missing; see "Plan for the remaining 2b screens" |
| 5 | GPS locations | done | the design's header (title + small add button) and blue info note, its card width; add / edit / delete only for editors (HR, admin), as in the design. Already ours and kept: the card grid, Google Maps link, map preview, linked-employees summary |
| 6 | Leaves & requests | to do | |
| 7 | Payroll | to do | |
| 8 | Salary slip | done | the design's one-row header (employee, month, year in fixed proportions) and its print button (disabled until a slip is shown). The slip body already matched. Not ported: the design's Egyptian-tax breakdown box (our payslip data has no Egyptian tax fields; shown only for Egypt-paid staff) |
| 9 | End of service | done | the design's employee picker beside the employer filter, KPI tiles that wrap; **changes the totals:** as in the design, consultants, Tamheer and training staff get no end-of-service award and are left out, with a note saying how many |
| 10 | Settlement | done | already matched (same fields, ids and official print; 47 of the design's 55 labels); added the design's e-mail button (**waiting:** `exportEmail`, sending off) and its «(اختياري)» label. **Remaining:** the design asks Arabic or English before the official print (`askLang`); ours prints Arabic only. **Left out on purpose:** the design's `aiBridge` link (the AI assistant filling this form) |
| 11 | Documents | done | the design's top bar order (tabs, then print this tab, refresh, print all), tab labels without icons (🪪 on iqamas), and its **six** tabs; **waiting:** national address (`docsNationalAddress`) and social-insurance certificate (`docsGosiCert`): our documents registry does not return those fields yet (a small backend addition) |
| 12 | Reports | done (rewritten) | the design's model: 11 cards in its order (adds **probation end**, 90 days from the joining date, and **medical insurance**); every report is columns + rows, with the design's column chooser (show / hide / reorder), all or chosen employees, totals, print and Excel. Data from our API as before. **Waiting:** the custom report builder (`reportCustom`, 2c), the comprehensive leave report (`reportLeaves`, 2c), the certificates report (`reportCerts`, needs a route listing every employee's documents). **Gaps:** a per-employee probation extension (no field); the report-language switch (our salary data has no English names). **Changed on purpose:** our old end-of-service report left out two specific people by name in the code; it now follows the design (no award for consultants, Tamheer and training staff; only amounts above zero), so the name list is gone. Alerts now include medical insurance |
| 13 | Settings | to do | |
| 14 | Templates | done | already a close port: all eight of the design's documents (onboarding, custody, probation extension, probation end, contract end, clearance, experience, probation evaluation), the salary certificate with Arabic/English, bulk sending and the sent list. Added the design's **job-offer letter** card (**waiting:** `templatesOffer`, 2c). **Not added:** the e-mail button per document (sending off). **Left out on purpose:** the design's `aiBridge` link |
| 15 | Employee web area `/me` | to do (ours only; restyle to the design's employee look in Phase 3) | |

### Plan for the remaining 2b screens (written 3 Nov 2026, to resume in a fresh session)

The design's sources are in the scratch viewer copy (`ARIBA_HR_React/src/pages/…`); the original folder stays
read-only. Order and method:

1. **Attendance** (`attendance/index.jsx` 116 + `AttReport.jsx` 355 + `engines/attendance.js` 103 lines).
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
