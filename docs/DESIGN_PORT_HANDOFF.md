# Design port: handoff (3 Nov 2026)

For the next session that continues the design port. Read this first, then `docs/DESIGN_PORT.md` (the full record:
decisions, every screen's notes, what waits and why), then `CLAUDE.md` in the main folder. **The repo wins** when it
disagrees with this file: check `git status` and `git log --oneline -5` first. No personal data or secrets here.

## 0. Context

**The project.** Ariba HR is an HR and attendance system for a Saudi client, in Arabic and English (right-to-left
matters everywhere): employees, attendance by fingerprint location, leave and request workflows, payroll, end of
service, letters and e-signing, announcements, notifications. It has three parts:
- a FastAPI backend with raw SQL on PostgreSQL;
- `frontend/hr-web`, the HR portal (Next.js 16);
- `frontend/employee-app`, the employee app (Expo SDK 58, also served as a web app).

The data came from the client's Supabase project. It was normalized and the API rebuilt on it. The target is a new,
empty Railway Postgres; nothing is deployed yet. The owner is **not a developer**:
- explain in plain language;
- make the technical decisions yourself;
- ask only for business decisions (who approves, who may see what).

**How we got here.**
- Stages 1–8 (the backend the new employee app needs) were built one at a time on `backend-new-ui`. Stages 1–7 are
  committed. Stage 8 (password recovery) is staged in the main folder, not committed.
- The client then sent an **updated design**: two Vite + React web apps (`ARIBA_HR_React`, `ARIBA_Employee_React`) that
  talk to Supabase directly. The design port brings that design onto **our** stack and **our** API, on its own branch
  `design-port`, so `backend-new-ui` stays clean. The goals differ per app:
  - **hr-web: "exactly like the design"** (layout, labels, buttons, behaviour);
  - **employee app: structure only**, with our identity (colours, fonts, logo from `/public/brand`) kept.
- It is a rebuild, not a copy. Every screen is rewritten on our data layer, and the design can only be viewed up to
  its sign-in screen without Supabase, so most of the comparison is code-to-screen.

**The phases.**

| Phase | What | State |
|---|---|---|
| 0 | Branch, worktree, data copy, servers | done |
| 1 | Analysis of both designs against our code and API | done |
| 2a | The hr-web shell (menu, top bar, sign-in, idle sign-out, export) | committed (`9b999c4`) |
| 2b | Restyle the existing hr-web screens | done (part 1 committed `0eac29a`, part 2 uncommitted) |
| 2c | New hr-web screens our API already serves | done (uncommitted): announcements, targets, evaluation, team & tasks, the three calculators, WPS, provisions, custom reports, leave report, Excel import, job-offer letter, **seal studio on exports** |
| 3 | Employee app alignment | in progress: ten-tab comparison written; `/me` home, salary, requests, **attendance, team, overtime, documents (web signing), approvals** built |
| Later | One backend stage per gap | not started |
| Later | One backend stage per gap | not started |

**The owner's decisions (3 Nov 2026; full text in DESIGN_PORT.md).**
1. All the design's features are required, **except the AI assistant**. That is out of scope: no code, no outside AI
   service, its CSS rules removed.
2. A screen or button without a backend shows "not available yet" (never sample data) until its own backend stage,
   in the owner's order.
3. Three earlier questions are answered:
   - **(a)** keep the design's list of accounts on a temporary password; it shows names only, never passwords;
   - **(b)** HR may write evaluations: this needs its own stage, rules first, and changes the Stage 3 rule;
   - **(c)** brand colours come from a plain colour picker; the server never fetches a website.
4. The owner tests everything at once in the browser, then approves the commit(s).

**Privacy rules that stay.**
- Managers see their direct reports only.
- Salary is hidden unless the setting and the permission allow it.
- A colleague's leave reaches others as "away" only, never its type.
- Refusals that name a row answer 404.
- Passwords are never readable.
- Any design screen that would show more than our API returns is shown as a gap, not filled in.

## 1. Where things are

| Item | Value |
|---|---|
| Worktree | `C:\Users\GhadyNafisah\Downloads\HR_ARIBA-main\HR_ARIBA-main\design-port` (branch `design-port`) |
| Last commit | `0eac29a` (Phase 2b part 1). **Everything below is uncommitted** (33 paths: 25 changed, 8 new) |
| Main folder | `…\HR_ARIBA-main\HR_ARIBA-main\HR_ARIBA-main` (branch `backend-new-ui`): Stage 8 is staged there and is **not** on this branch; do not touch it from here |
| Data | `ariba_design_port` (throwaway copy of `ariba_src`; real data; keep until the owner says drop it). Test logins: `docs/DESIGN_PORT.md` § Test logins; the password is `PASSWORD` in `tools/smoke/smoke_setup.py` |
| Backend | run from the **main folder**, `127.0.0.1:8040`, e-mail off, CORS for `localhost:3040` and `localhost:8090` |
| hr-web | `next dev` on `127.0.0.1:3040` from this worktree (`.env.local` → 8040). A production build can run beside it (Next 16 keeps dev files in `.next/dev`) |
| Employee app (web) | not running; start with `cd frontend\employee-app; npx.cmd expo start --web --port 8090` (`.env` → 8040) |
| Design (read-only reference) | `C:\Users\GhadyNafisah\Downloads\البرنامج\البرنامج\ARIBA_HR_React` and `ARIBA_Employee_React`. Never serve their `dist` (it holds the live Supabase address); never copy `trDict.js` (real names) |

## 2. Rules that still apply

- No push. No commit without showing `git diff --cached --name-only` and the owner's OK; stage by explicit path.
- Real data only in `ariba_design_port`. Never write to `ariba_src`. No e-mail work.
- A design feature whose backend does not exist yet is **never faked**: it is listed in `frontend/hr-web/src/lib/features.ts`
  (the one list) and its button says "not available yet — opens after …".
- Additive API changes only; backend gaps become their own stages on `backend-new-ui`, not on this branch.
- Keep each file's line endings (the files here are CRLF; check `grep -c $'\r$'` against `git show HEAD:<file>`).
- Ask the owner before installs, database writes, deletes.

## 3. What this session did (uncommitted; details in DESIGN_PORT.md)

- **Phase 2b finished:** attendance (+ report builder), leaves & requests, payroll, employee form & details, settings
  (ten sections + search; new cards on our Stage 2/5/6 routes: manager permissions + team salary, doc-sign, push).
- **Phase 2c mostly done:** announcements (closes FOLLOW_UPS #43), targets, evaluation (HR reads / approves only),
  team & tasks, insurance / salary / tax calculators, salary transfer file, provisions report, custom report builder,
  comprehensive leave report.
- **Phase 3 started:** the employee app's idle guard (`src/components/idle-guard.tsx`).
- **Phase 2c closed:** the seal studio (design's `sealStudio.js`) in `lib/seal.ts` + `components/hr/seal-studio.tsx`,
  offered in the page export and the attendance report's export, stamped on page 1 of the PDF
  (`ExportSpec.overlay` / `htmlPdfBlob(html, { overlay })`). `exportSeal` is `ready`; no `ui` feature is left.
- **Phase 3 `/me` finished for this round:** الحضور (clock + geolocation + punch + forgot-punch + 31-day log +
  period lookup), فريقي, عمل إضافي, المستندات (letters, view, approve / reject / draw-and-sign), الموافقات, and a
  home with the real leave balance, the newest payslip and quick actions.
- **Fixed on the way:** attendance «تعديل» created a new record instead of editing; payroll's bulk-days buttons showed
  only when a former employee could be added; the home's «لا يوجد مسير معتمد» was printed even when a payslip existed.
- **Checks (4 Nov 2026):** hr-web `tsc` 0, lint 0, `npm run build` 0 (all six `/me` tabs in the route list);
  `tools/legacy-parity` all suites match. Read-only API checks as HR on the copy: every route the new screens call
  answers 200.
- **Not verified:** anything in a browser, and every action that writes (punching, signing, approving, downloading a
  sealed PDF). The owner has the full test list (step 1 below).

## 4. What is left, in order

1. **The owner's browser test** of everything above (they asked to test it all at once). Fix what they report, then
   ask to commit. Suggested split: one commit "Design port Phase 2b part 2 + Phase 2c (…)", or one per phase.
   **This round's list to try:** (a) any HR table → «تصدير هذه الصفحة» → tick «ختم / توقيع», drag the stamp and the
   name, «تطبيق الختم» → the PDF has them on page 1; repeat to see the places remembered; «بدون ختم» gives a clean
   PDF. (b) Attendance → «التقارير» → «تصدير / إرسال» → the same checkbox on a report. (c) `/me`: the clock and the
   location badge, a punch both ways (allow location!), «نسيت البصمة», the 31-day log, the period lookup; فريقي;
   عمل إضافي (submit, then delete it); المستندات (draw a signature once, then «موافق مع التوقيع» on a letter, and
   «موافقة بدون توقيع» on another); الموافقات as a manager/HR account; and the home's balance + last payslip.
2. **Phase 2c remainders:** none. `exportEmail` waits for an approved sender (FOLLOW_UPS #7), not for a screen.
3. **Phase 3, the employee app:** the ten-tab comparison is in DESIGN_PORT.md and the hr-web `/me` area now has all
   its tabs (home, attendance, requests, salary, team, overtime, documents with web signing, approvals). What is left
   there: the design's shell (hero with the clock and the punch button, tiles, quick actions as drawn) over the area,
   the polygon work-location zones in الحضور (our `/me/attendance` returns circles), and the tabs that wait for backend
   stages (business card `bizc`, leave cancel / edit, balance snapshots). Needs the owner's eye on a phone.
4. **Small fix, separate commit:** two `tsc` errors already on the branch in the employee app
   (`src/components/sig-pad.tsx:52` `touchAction`; `src/lib/diag.ts:3` untyped parameter).
5. **Backend stages** (owner's order, each with rules first, gate, commit on `backend-new-ui`): roles & permission
   matrix; audit-log viewer; recycle bin; candidates + public application page; assets & custody; business cards; more
   HR leave actions (return to manager, cancel approved leave, balance-save undo, workflow config); expiry alerts; the
   employee app's leave features. Added by decisions: HR writes evaluations; brand-colours save; accounts on a
   temporary password; mail settings (save only); WebAuthn sign-in. Smaller ones the screens now show as waiting:
   payroll "prepare for finance", per-person greeting texts, certificate metadata, probation field, allowance as %,
   letterhead upload, punch-button logo, leave-rule settings, the official / Ramadan schedule, national address / GOSI
   fields in the registry, a certificates registry route. The full list with labels is `features.ts`.

## 5. Things learned that save time

- **Shell:** the Bash tool's working folder resets; use absolute paths. Long inline heredocs can break: write Python
  edit scripts to the scratch folder and run them.
- **Lint rules that bite:** `react-hooks/set-state-in-effect` (use a one-line disable with a reason, as elsewhere),
  `react-hooks/static-components` (no components defined inside a component), dependency lists must be plain names.
- **UI helpers already there:** `Modal` (it wraps `footer` in `.mf` itself), `PromptModal`
  (`components/hr/prompt-modal.tsx`), `ExportDialog` (exported from `page-export.tsx`), `ReportBuilder`
  (`components/hr/report-builder.tsx`), `printDoc` + `tfWrap` (letterhead print), `buildXlsx` + `saveBlob`,
  `htmlPdfBlob` (several-section PDF), the waiting-toast pattern (see `employees/page.tsx` `waiting`). Language: inline
  `T(ar, en)` from `useLocale().lang`.
- **Calculations:** use OUR engine (`lib/calc/payroll.ts`, parity-checked) rather than porting the design's second copy;
  `lib/calc/month.ts` has a month context and the leave-used fetch.
- **API facts:** lookup ids are names, not numbers; `/settings/gosi-rates` returns fractions (0.1075); announcements
  know 8 occasions and no per-person names; `PATCH /attendance/{id}` takes the day as `date`; evaluations are written
  only by the direct manager.
- **Roles:** editors are `hasRole("hr", "admin")`; payroll approval also allows `finance`; the CEO reads HR pages.
