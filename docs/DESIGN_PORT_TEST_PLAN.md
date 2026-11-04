# Test plan — owner walkthrough of the port (3 Nov 2026)

Written for the browser pass over phases 2a, 2b, 2c and 3 before committing. Every expectation below
was checked against the running API today, not guessed.

## 1. What is running

| App | URL | How it was started |
|---|---|---|
| Backend (ours, `ariba_design_port` copy, e-mail off) | **http://127.0.0.1:8040** (`/docs` for the API) | uvicorn from the main folder, bound to 127.0.0.1 |
| HR web | **http://localhost:3040** | `npm run dev` in `frontend/hr-web` |
| Employee app as a web app | **http://localhost:8090** | `npx expo start --web --port 8090` in `frontend/employee-app` (CI mode: no hot reload) |

- Use **`localhost`**, not `127.0.0.1`, for the two front ends: the backend's CORS allows
  `http://localhost:3040` and `http://localhost:8090` only.
- Restart if needed:
  - hr-web: `cd frontend\hr-web; npm.cmd run dev`
  - employee app: `cd frontend\employee-app; npx.cmd expo start --web --port 8090`
  - The Expo app is running with `CI=1` (reloads off). Say the word and I restart it in watch mode.

## 2. Accounts (copy database only)

Password for **all** of them: **`SmokeTest!2026`** (the smoke password from
`tools/smoke/smoke_setup.py`; it exists only in the throw-away copy).

| Username | Role | Use it for |
|---|---|---|
| `EMP010` | admin | the whole HR portal (employees, settings, announcements, temporary password) |
| `EMP040` | admin | the **HR approver** of the workflows (stage `hr`) |
| `EMP086` | ceo | the **manager stage** (13 direct reports) and the CEO stage |
| `EMP002` | employee | the `/me` area: requests, attendance, letters, own data (manager = EMP086) |
| `EMP102` | employee | an employee with no manager (empty-state check) |

The copy has **no** `hr`, `manager` or `finance` role account; `admin` covers HR and the finance
pages, `ceo` covers the manager screens. Sign in at **http://localhost:3040/login** (HR) and
**http://localhost:3040/me/login** (employee).

## 3. What the data looks like right now (so you know what "correct" is)

- **106** active employees; 27 menu pages in 7 sections.
- Requests: **6** total — 3 approved (completed), 3 rejected. **Nothing pending** (the HR approvals
  queue starts empty on purpose; scenario J creates one).
- Attendance: **Sep 2026 → 13 employees**, Oct 2026 → 6 employees (17 sessions), **Nov 2026 → 0**
  (nothing punched yet today, 03/11/2026). Use September or October for the reports.
- Payroll sheets exist for **2026-10, 09, 08, 07, 02, 01**; `/payroll-archive` lists 2026-8.
- `EMP002`: 1 work location only — «المقر الرئيسي - أريبا» **24.795146 / 46.654996, radius 1000 m**;
  no remote days allowed; leave balance **current 0**, carry 0.06, year_end 0.06, annual 21;
  2 payslips (9/2026, 8/2026); no requests, no letters, no team.
- `EMP086`: 13 direct reports; `approve_requests`, `manage_targets`, `evaluate_team` **on**;
  `view_team`, `view_team_data`, `view_team_leaves`, `view_team_requests`, `view_team_attendance` **off**
  → «فريقي» is empty **until HR grants it** (scenario I-3).
- Work locations: 7 rows; `L6` sits at latitude/longitude `0,0` (the "no geofence" row).
- Verified while preparing this plan (then removed again): a request from `EMP102`, who has no manager,
  is created straight at stage **`hr`** — the manager step is skipped.
- Settings → signature (`hr_signer` sheet): a name, an Arabic title, an English title and a drawn
  **signature**; **no stamp image**. So in the seal studio «ختم الشركة» stays greyed out and
  «التوقيع» + «الاسم والصفة» are the two live layers.


## 4. Scenarios

Tick each line; anything that does not match the expectation is a bug to report back.

### A. Sign-in and the HR shell (phase 2a)

- [ ] **A1** `http://localhost:3040/login` → the design's light screen: logo, eye toggle on the
      password, «تذكرني» (keeps the **username** only after reload), «نسيت كلمة المرور» → our
      `/auth/password-recovery`, «تسجيل بالبصمة» which says it waits (WebAuthn is a later stage).
- [ ] **A2** Wrong password → one clear message, no crash; empty fields → the button stays disabled.
- [ ] **A3** Sign in as `EMP010` → lands on `/dashboard`; sign out → back to `/login`; sign in again.
- [ ] **A4** Side menu: collapse it, reload → still collapsed (remembered); narrow the window to phone
      width → it closes; open it and press **Escape** → closes; click the backdrop → closes.
- [ ] **A5** Top bar: company name + logo + colours from `/public/brand`, theme button (icon only),
      today's date, bell (count), language **AR/EN** (whole page flips LTR/RTL), print, refresh,
      top-right role badge «مسؤول HR» (admin), password dialog (change then change back), sign out.
- [ ] **A6** Signed in as `EMP002` (employee), type `http://localhost:3040/dashboard` → redirected to
      `/me` (role guard).
- [ ] **A6a–A6e, the five pages that once had no API behind them.** Four of them are **built** now (Stage 9,
      §M below) and open their own screen: `/audit-log`, `/recycle-bin`, `/candidates`, `/business-cards`.
      **`/assets` is the only one left** and must still answer with the hourglass card «غير متاح بعد» /
      "Not available yet" naming its stage — no empty box, no sample data, no dead buttons — while the menu,
      top bar and the rest of the shell keep working:
      - **A6e** `/assets` → «… بعد مرحلة الأصول والعهد.»
      In English it reads "Not available yet — This page opens after the assets and custody stage." It is the
      next backend stage (see §5, item 9), not a forgotten screen.
- [ ] **A7** Bell: open it, an item opens the matching page; «تعليم الكل كمقروء» clears the dot.

### B. Dashboard (phase 2b + the icon swap just made)

- [ ] **B1** KPI tiles: **106** active employees, Saudis/expats + saudization %, payroll total,
      male/female icons — the values match §3.
- [ ] **B2** **The three small tiles show Tabler icons, not emoji**: bell (`ti-bell`), person-off
      (`ti-user-off`), graduation cap (`ti-school`). Hard-refresh (Ctrl+F5) if you still see emoji.
- [ ] **B3** Cards: department chart (bar), gender (donut), workplaces, alerts, payroll summary,
      nationalities (pie) — every chart draws and its tooltips work.
- [ ] **B4** «تصدير هذه الصفحة» on the dashboard → the table picker appears (or the honest message
      when the page has no table).

### C. Employees (phase 3)

- [ ] **C1** `/employees`: the table of 106, search by name/number, department filter, page size, paging.
- [ ] **C2** Open `EMP002`'s file. The **form** (`/employees/2`) has the design's six tabs (custody
      included); the read-only **details window** has its four (أساسي / وثائق / مالية / إجازات), and the
      **leaves** tab shows today's balance (0) plus the days used in each of the last four years.
- [ ] **C3** Change one field (e.g. mobile) → «↺» appears next to it, «استرجاع الكل» restores, «حفظ»
      saves; reload → the new value stays. (Change it back afterwards.)
- [ ] **C4** The fingerprint **work locations** box: `EMP002` sits on «المقر الرئيسي - أريبا»; add a
      second zone, «حفظ وتحديث», reload → remembered.
- [ ] **C5** Documents tab: view/download a document; delete one (this is a copy of the data).
- [ ] **C6** `/employees/new` → fill and save a test employee; it appears in the list.
- [ ] **C7** Excel import: pick a small sheet → preview with warnings, then import; the list grows.
- [ ] **C8** Delete an employee → the «سلة المهملات» stage message (the recycle bin is a later stage).

### D. Leaves & requests (HR side)

- [ ] **D1** `/leaves`: **6** requests (3 approved + 3 rejected), each row labelled through `reqLabel`
      (annual/sick, not the raw `annual`), stage badge «مكتمل» / «مرفوض».
- [ ] **D2** Filter by type / status / employee / date; search by number; the counts match the rows.
- [ ] **D3** Open a **rejected** request → the rejection reason is visible.
- [ ] **D4** On an approved annual leave: «إلغاء/استرجاع» → the «مرحلة إجراءات الإجازات الإضافية»
      message (a backend stage); the 🗑 **delete** next to it does work — it returns the days and removes
      the request (there is no recycle bin yet); «إرجاع للمدير المباشر» and «تراجع عن آخر حفظ» name their
      stage too.

### E. Attendance and work locations

- [ ] **E1** `/attendance`, day **03/11/2026** → empty (nothing punched yet). Switch to a day in
      **September 2026** → rows appear.
- [ ] **E2** Add a manual punch for an employee, edit it, then delete it — the row changes and survives a
      reload (HR-only actions).
- [ ] **E3** `/locations`: 7 zones listed with radius and type; edit «المقر الرئيسي - أريبا» radius
      1000 → 1200 → save → reload; then set it back to 1000.
- [ ] **E4** Assign a location to `EMP002` from the locations page (or the employee's fingerprint box)
      → `/me/attendance` for `EMP002` shows that zone.
- [ ] **E5** «التقارير» tab in `/attendance`: period **01/09/2026 – 30/09/2026**, a few employees,
      all columns → the summary table + daily detail + department summary + rankings fill in.
- [ ] **E6** «اطبع» and the plain **PDF** button work (no stamp asked for on that path).

### F. Payroll group (all `ready`)

- [ ] **F1** `/payslips`: `EMP002` → 9/2026 and 8/2026 slips open and print.
- [ ] **F2** `/payroll`: the month picker opens the saved sheets (`pay_2026_10`, `09`, `08`, `07`, `02`,
      `01` all exist) and the archive panel underneath lists **2026-8** (the only archived run).
- [ ] **F3** `/settlement` and `/end-of-service`: enter a salary/date → the numbers compute; «حاسبة
      المخالصة» matches the design's fields.
- [ ] **F4** `/insurance-calculator`, `/salary-calculator`, `/tax-calculator`: compute and explain.
- [ ] **F5** `/salary-transfer` (WPS): pick a month → the file preview + download; `/provisions`:
      the provision report with its columns.

### G. Phase 2c screens (all `ready`)

- [ ] **G1** `/announcements`: create an announcement (title + body + audience), it shows in the list
      for that audience, edit, delete. «نص تهنئة مخصص لكل موظف» says it waits (annTemplates).
- [ ] **G2** `/targets`: create a target for an employee, set weight/progress, edit, delete; the team
      goals view lists them.
- [ ] **G3** `/evaluation`: pick employee + period → read the evaluation; saving HR's own evaluation
      says it waits (evalHrWrite).
- [ ] **G4** `/team`: today's availability (the API returns **21** people for HR today, 03/11/2026; an
      employee account is refused with `allowed:false`), the tasks list, and the task/meeting board card
      that names its stage.
- [ ] **G5** `/reports`: the custom report builder (choose columns/filters → preview → print/PDF/Excel),
      and the **leave report** with its period picker.
- [ ] **G6** `/templates`: the Arabic forms, the contract-end form, and the **job-offer letter**
      (`templatesOffer`) → generate → print/PDF; the **letters status list** underneath (empty until J-4)
      with «إرسال للموظف للتوقيع» and delete.
- [ ] **G7** `/documents`: the document registry list, filters, preview/download of a file. (The letters
      HR sends live on `/templates`, and the employee answers them in `/me/documents`.)
- [ ] **G8** `/settings`: brand (read from `/public/brand`), «الورق الرسمي والتوقيع» (the signer used by
      the seal studio), **«صلاحيات المديرين»** (needed for scenario I-3), the team-salary switch
      (needed for the salary column in I-3), and the sections that name their stage.

### H. Page export + the seal studio (phase 2c, the part I rebuilt)

Prerequisite: `hr_signer` has a **signature** but **no stamp image**, so «ختم الشركة» is greyed out
and «التوقيع» / «الاسم والصفة» are the live layers. (Upload a stamp in Settings → الورق الرسمي
والتوقيع if you want to test the stamp layer too.)

- [ ] **H1** `/employees` → top-bar «تصدير هذه الصفحة» → «اختر الجدول» → pick the employees table →
      the «تصدير / إرسال: …» dialog opens with Excel / PDF / Word and the checkbox
      **«ختم / توقيع (قابل للتحريك)»**.
- [ ] **H2** Tick the checkbox and press **«تنزيل»** → the studio appears over an A4 preview: the saved
      signature and the name/title already on the page; **drag** each layer, **resize** and **tilt** with
      the sliders (stamp size/tilt, signature size/tilt); «الاسم» and «الصفة» are editable text fields.
- [ ] **H3** Press **«تطبيق»** → the PDF downloads and page **1** carries the signature + name where you
      put them; page 2+ are clean.
- [ ] **H4** Export the same page again → the studio reopens **in the same places** (they are kept per
      form in this browser) and with your name/title choices.
- [ ] **H5** «بدون ختم» (plain) → a clean PDF, no overlay.
- [ ] **H6** Cancel / Escape (or the ✕) → nothing downloads, no half-saved state.
- [ ] **H7** Landscape guard: an export that has to be landscape (more than 9 columns/employees in the
      attendance report) → the PDF comes out landscape and the overlay is **not** stamped (portrait
      only, as in the design's `pdfBlob`).
- [ ] **H8** Excel and Word downloads are unaffected by the seal checkbox.
- [ ] **H9** `/attendance` → «التقارير» → «تصدير / إرسال (PDF · Excel · Word)» → same checkbox, same
      studio, same stamped first page; the report's own «PDF» button stays stamp-free.
- [ ] **H10** The dialog's e-mail half says «غير متاح بعد — يُفتح بعد تفعيل إرسال البريد» (the approved
      sender is still missing, FOLLOW_UPS #7).

### I. The employee web area `/me` (phase 3, all nine tabs)

Sign in at **http://localhost:3040/me/login** as `EMP002`.

- [ ] **I-1 الرئيسية**: leave balance (current 0, carry 0.06, year-end 0.06, annual 21), next holiday
      (**none in the copy** → an honest empty state), the newest payslip card (9/2026), quick actions
      that jump to the tabs.
- [ ] **I-2 الحضور**: the location badge shows the distance to «المقر الرئيسي - أريبا»; allow location
      → punch **in**, then punch **out**, then **re-enter**; the 31-day log fills a row for today;
      the period lookup works; «نسيت البصمة» submits with a reason (≥ 3 characters) and appears in
      الإجازات/طلباتي.
      *Tip:* this machine's real coordinates are probably far from Riyadh → the badge will say you are
      outside the zone and the punch is refused (that is a valid test). To make punching succeed, open
      DevTools → ⋯ → More tools → **Sensors** → Location → custom: **24.795146 / 46.654996**.
      Zone `L6` (radius 5000) sits at `0,0` and is the only circle a far-away position can match.
- [ ] **I-3 فريقي**: as `EMP002` → empty (no reports). Sign in as `EMP086` → still empty, **by design**:
      his `view_team*` permissions are off. Then as `EMP010` open **`/settings` → «صلاحيات المديرين
      المباشرين»** (`#MGR_PERMS`), tick «رؤية قائمة فريقه» for Husam (+ «بيانات الفريق (الوظيفية)»,
      «إجازات وأرصدة الفريق», «رواتب الفريق» if you want those columns; the salary column also needs the
      «إظهار رواتب الفريق» switch above the table) and press its «حفظ» → back as `EMP086`, `/me/team` now
      lists his **13** reports.
- [ ] **I-4 عمل إضافي**: submit an overtime request (day, from/to hours) → it appears in طلباتي and in
      الإجازات; delete it → gone.
- [ ] **I-5 المستندات**: empty until HR sends a letter (scenario J-4). Then: open a letter, **draw** the
      signature on the canvas, «موافق مع التوقيع» → the letter's status becomes signed and the drawn
      image is sent as base64 (the drawing is kept in `localStorage ariba_sig_v1_<emp>`, the server
      files the signed copy); a second letter «موافقة بدون توقيع»; a third «اعتراض» with a reason.
- [ ] **I-6 الموافقات**: the tab appears only for the **manager / hr / ceo** roles, so in this copy it is
      `EMP086` who sees it (stage J's request lands there); `EMP002` (employee) does not see the tab, and
      `EMP040` (admin) does not either — he approves from the HR portal's `/leaves` instead. Open a
      request → «موافقة» moves it to the next stage; «رفض» asks for a reason; the override action is
      there for a manager.
- [ ] **I-7 الإجازات**: my requests with labels and stages, the composer with every type, and the
      working-day preview (the holiday list is still short — `/me/leave` returns `upcoming_holidays: []`,
      so the preview counts normal days; a known backlog item).
- [ ] **I-8 الراتب**: the 9/2026 and 8/2026 slips open and print; the totals match `/payslips`.
- [ ] **I-9 ملفي**: name/number/job/department/location, and the links that change data (IBAN change,
      profile edit, upload document, change password) — each submits and returns a pending request.
- [ ] **I-10** `EMP102` (no manager): a request goes straight to HR (no manager stage), «فريقي» stays an
      empty state, «الموافقات» is not in the menu, and nothing crashes.


### J. End-to-end: a request through every stage, plus a letter to sign

The one flow that touches the manager screen, HR, the employee app and the signing.

- [ ] **J-1** `EMP002` → `/me/leaves` → annual leave, two working days in the future, reason →
      submit. Its badge reads «بانتظار المدير المباشر».
- [ ] **J-2** `EMP086` → `/me/approvals` (or the HR bell on `/leaves`) → the same request is there →
      **approve** → its badge moves to «بانتظار الموارد البشرية»; `EMP002` already sees the new stage.
- [ ] **J-3** `EMP040` (HR) → `/leaves` → pick the request → approve (final) → «مكتمل»; `EMP002`'s
      balance and 31-day log reflect it; `/dashboard`'s pending-requests counter drops back to 0.
      Then repeat once with **reject** (with a reason) so both endings are checked.
- [ ] **J-4** `EMP010` → `/templates` → choose `EMP002`, an Arabic form (or the salary certificate),
      «إرسال للموظف للتوقيع» → success toast; the letter now appears in that page's letters list.
- [ ] **J-5** `EMP002` → `/me/documents` → the letter is listed → open it (sandboxed viewer, scripts
      off) → draw the signature → «موافق مع التوقيع» → the request closes with this signature
      (`doc_sign_cfg.hr_closes` is **off**, so the last signature closes it) and HR's letters list shows
      it approved/signed. The drawn image is sent as base64 and kept in `localStorage ariba_sig_v1_<emp>`.
- [ ] **J-6** Send a second letter and answer it with «موافقة بدون توقيع», a third with «اعتراض» +
      reason → HR sees the objection reason and the employee can send it again.
- [ ] **J-7** The exception: `doc_sign_cfg.manager_types = ["onboarding"]`, so an **onboarding letter**
      («مباشرة عمل») stops at the manager after the employee signs. Today that manager screen exists only
      in the **Expo app** (المستندات → «بانتظار توقيعك»), not in the web `/me/documents` — check it there,
      and tell me whether you want it added to the web area too.

### K. The employee app itself (Expo, http://localhost:8090)

Same backend, native-ish screens: this is the parity check between the web `/me` and the app.

- [ ] **K-1** Sign in as `EMP002` (same password) → the tabs render (index/attendance/leaves/salary/
      documents/team/approvals/goals/overtime/more).
- [ ] **K-2** Punch in/out from the app (allow location; the same zone rule applies).
- [ ] **K-3** Submit a leave from the app, then see it in the web `/me/leaves` (same data).
- [ ] **K-4** Open the letter sent in J-4 from the app, sign it; then do J-7's onboarding letter: the
      **manager** list («بانتظار توقيعك») appears for `EMP086` there and signing it is the last step.
- [ ] **K-5** `/more`: profile edit, IBAN change, upload document, change password, sign out.
- [ ] **K-6** The app's screens do **not** show the design's `bizc` business card or the leave
      cancel/edit (backend stages), and nothing looks like a broken button.

### L. Cross-cutting checks

- [ ] **L-1** Toggle AR ⇄ EN on every page you visit: no untranslated key, no clipped Arabic, RTL
      flips the whole layout (numbers and dates stay readable).
- [ ] **L-2** Browser console: no red errors, no 401 loops after sign-in, no CORS errors (if a call
      fails, make sure both front ends were opened on **localhost**, not 127.0.0.1).
- [ ] **L-3** Print preview (Ctrl+P) of two pages: the shell chrome is hidden, the tables fit.
- [ ] **L-4** Device width 390 px: menu, top bar, tables and the seal studio stay usable.
- [ ] **L-5** Every page that is not built yet names its stage instead of showing an empty box.

### M. The four screens (Stage 9: audit log, recycle bin, candidates, business cards)

Each line is something the API was checked against today, live, with the copy's own data (`ariba_local`).
Restart the backend before this pass: the four screens need the new routes.

- [ ] **M1 `/audit-log` as `EMP010`**: the table is not empty (**473** rows + one per action since), newest
      first; the module filter narrows it and shows a count per module; «من/إلى» narrows by date; the search
      finds an Arabic word in a summary; «عدد التعديلات: N — معروض آخر 300» matches what is on screen; print
      and Excel open the same rows.
- [ ] **M2 the same screen as `EMP015` (finance)**: the table shows payroll / insurance / settlement / eos
      only, and choosing «الموظفون» returns an empty table (the lock is in the query, not the screen). The
      sentence under the counter says why.
- [ ] **M3 the purge box**: months older than 30 days only (`2026-09` yes, `2026-10`/`2026-11` no); «طلب حذف»
      creates a `pending` row and rings every active finance account; a second request for the same month is
      refused («هناك طلب حذف معلق لنفس الشهر»); as `hr` there are no approve/reject buttons and the API refuses
      (`403`); as `EMP015` «موافقة» records the decision — and deletes nothing.
- [ ] **M4 `/recycle-bin` as `EMP010`**: the four categories with their counts (الطلبات **57**, الأخرى **5**,
      الموظفون **0**, الإجازات **0**); a `document` row reads «للأرشيف فقط» and the API answers `409`.
- [ ] **M5 restore**: restore a deleted request → it reappears in `/leaves` and leaves the bin, and the
      employee gets a bell entry; restoring it twice is refused. «حذف نهائي» asks for confirmation and deletes
      only what was selected (or the chosen year/month of the current category).
- [ ] **M6 `/candidates`**: the counters (جديد/مقبول/مرفوض), the status filter and the search; «مراجعة» opens
      the drawer with the submitted fields and every file (a click opens it); «رفض» without a note is refused.
- [ ] **M7 the public form**: copy the link from the candidates screen, open it in a private window
      (`/apply?k=…`) → fill it, attach a PDF, send → the reference appears; the candidate shows in
      `/candidates` with the file, and HR's bell rings. A wrong/rotated key says the form is closed.
- [ ] **M8 invites**: «إنشاء دعوة» → the link is copied; opening it fills the form; after sending, the invite
      reads «مستخدم» and a second submit is refused; «إلغاء» on a fresh invite makes it «ملغى»; switching
      «الاستمارة مفتوحة للجميع» on closes the open key (`invite_only`) and off opens it again; «تغيير الرابط»
      closes every old link.
- [ ] **M9 the medical form**: upload a PDF, open the public form → «تحميل النموذج الطبي» downloads the same
      bytes; «حذف» removes it. «مَن يُبلَّغ بكل مرشح جديد؟» saves the chosen people (empty = every HR/admin).
- [ ] **M10 accept**: «قبول وإضافة كموظف» asks for workplace, department, job, join date, contract and salary,
      then creates the employee (next `emp_no`, `EMP###` account), moves every candidate file into their
      documents and leaves the drawer showing «مقبول — الموظف رقم …».
- [ ] **M11 `/business-cards`**: pick an employee, switch «بطاقة أعمال / بطاقة موظف» and the three templates,
      change the accent colours, untick a field → the preview follows; PNG downloads, PDF opens, `.vcf` opens
      in a phone, «ورقة A4» prints 10 cards (or 9 badges) per page with cut guides.
- [ ] **M12 cards as `EMP086` (ceo)**: the screen reads and prints, and both save buttons are disabled with
      the sentence «صلاحيتك للقراءة والطباعة فقط» (the API answers `403` too). As `EMP010`: «حفظ تصميم الشركة»
      stores it (a reload keeps it), «حفظ بطاقة الموظف» marks that employee «مخصصة», and «رجوع لتصميم الشركة»
      removes the override.
- [ ] **M13 card edge cases**: an employee with no mobile/e-mail, a long name and a long job title still draws,
      exports and prints without clipped text; an employee with no photo shows the monogram (nobody in this
      copy has a photo — 0 of the active employees).


## 5. Report back

Please note, for every failure: **page + language + account + what you clicked + what you expected +
what happened** (a screenshot of the PDF's first page for the seal ones). Then I fix them, re-run
`tsc` / `eslint` / `npm run build` / `legacy-parity`, and commit with explicit paths (no `git add -A`,
no push) after showing you `git diff --cached --name-only`.

Known and accepted (not bugs):

1. The copy's data is real, so goals, tasks, announcements, letters, overtime and signing are mostly
   **empty** — the empty states are the test.
2. No stamp image is saved, so the studio's stamp layer is disabled until one is uploaded.
3. `view_team*` are off for `EMP086`, so «فريقي» needs the Settings grant in I-3.
4. The seal is **portrait page 1 only**, exactly like the design.
5. E-mailing an export, custom greeting texts, HR-written evaluations, leave cancel/edit, the recycle
   bin, custody, **candidates + the public application page**, business cards, the audit viewer and
   WebAuthn are backend stages, each named on screen (A6a–A6e).
6. `/me/leave` returns no upcoming holidays, so the composer's working-day preview counts plain days.
7. Expo is running in **CI mode** (no hot reload); ask me to restart it in watch mode if you want it.
8. The **manager's own letter-signing screen** (`/me/sign/pending`) exists in the Expo app only, not in
   the new web `/me/documents`; tell me whether it belongs in the web area (J-7).
9. The four pages you flagged as undone are **built** (Stage 9, `docs/DESIGN_PORT_FOUR_SCREENS.md` §0): the
   backend now has 31 new routes (`/audit-log`, `/recycle-bin`, `/candidates`, `/public/apply`, `/bizcards`,
   `/me/bizcard`) and the four screens are real. What is left from that list, and what the walkthrough in §M
   should check:
   - **سجل التعديلات** (`/audit-log`): **built.** `ariba_audit_log` holds the real rows (473 before this stage,
     plus one per action taken since), `finance` is locked to payroll/insurance/settlement/eos, and the purge
     is two people. Still to build: the per-section «آخر التعديلات» strip (`sectionAudit`).
   - **سلة المهملات** (`/recycle-bin`): **built** for the three restorable kinds; the `employee` tab needs the
     `DELETE /employees/{id}` route that archives to the bin (`empDelete` still waits), and a `document`
     snapshot is «للأرشيف فقط» on purpose.
   - **المرشحين** (`/candidates` + `/apply`): **built** — the review list, accept/reject, invites, the apply
     switch and key rotation, the medical form and the notify list, plus the public form. Still to build:
     `candidateAuto` (registering an applicant as an employee automatically while HR has the portal open).
   - **بطاقات العمل** (`/business-cards`): **built** — the company design panel, presets, the live preview, PNG /
     PDF / `.vcf` / A4 sheet and per-employee overrides (`ariba_bizcards`, migration 004). The design's
     drag-and-resize element editor is **not** ported; the API stores the whole design object, so it can be
     added later without a schema change.

   The full requirements of these four, the reference function signatures, the schema drift found in this
   copy and the suggested order are in `docs/DESIGN_PORT_FOUR_SCREENS.md`.


