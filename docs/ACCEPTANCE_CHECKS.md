# Acceptance checks — one block per group, run them all at the end

The owner's single walkthrough for the work being shipped group by group. **This file grows: one block per
group, appended when the group ships** (`a5eecd1`-style backend commit + `6e6040c`-style app commit + the
numbers the screens must show). Nothing here waits on a new session: when the last group is in, start the
stack from §1 and run the file top to bottom.

Two rules we keep in this file:

1. **No guessed numbers.** Every figure below was measured on the running stack (backend on `127.0.0.1:8040`,
  `ariba_local`) on the date written beside it. If a figure is old, its line says so.
2. **No over-claiming.** A line checked on the API but not yet on a screen is marked `API-verified, screen
  pending` — never ✅. Only your eye on the screen closes a line.

## 1. Start the stack

| Piece | URL | Command | Running 5 Nov 2026? |
|---|---|---|---|
| Backend (ours, copy `ariba_local`, e-mail off) | **http://127.0.0.1:8040** (`/docs` for the API in dev) | `cd <main repo>\backend; .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8040` | yes, pid 35024 (restarted 5 Nov for Stage 20) |
| Employee app as a web app | **http://localhost:8081** | `cd design-port\frontend\employee-app; npx.cmd expo start --web --port 8081` | yes, pid 44852 |
| HR web | **http://localhost:3000** | `cd design-port\frontend\hr-web; npm.cmd run dev` (`next dev`, its default port) | yes, pid 43532 (it picks 3000, then 3001; if both are taken it prints the port it took) |

- Two **older** Metro servers from 3 Nov are still alive — `8090` (same design-port `employee-app` folder) and `8082`
  (the main worktree's `frontend\employee-app`, started with `--clear`). They serve stale code; use **8081** only.
- Open **exactly** these origins: the backend's CORS list today (`backend\.env`) is
  `http://localhost:3000`, `http://127.0.0.1:3000`, `http://localhost:8081`. So the app must be opened on
  **`localhost:8081`** — `127.0.0.1:8081` is *not* in the list and every call would fail on CORS. hr-web belongs on
  `localhost:3000` for the same reason (the 3 Nov test plan's `3040` was a hand-made `next dev -p 3040` run and is not
  in the list).
- The app reads its API address from `design-port\frontend\employee-app\.env`
  (`EXPO_PUBLIC_API_URL=http://localhost:8040` today). Expo inlines it at startup, so after changing it
  restart Metro **with `--clear`** — without `--clear` the old value stays in the cache.
- Health before testing: <http://127.0.0.1:8040/health> → `{"status":"ok"}`, and the app's login screen
  answers on <http://localhost:8081>.

## 2. The accounts (all verified logging in, 5 Nov 2026)

Password for **every** account: **`SmokeTest!2026`** (from `tools/smoke/smoke_setup.py`; it exists in the
throw-away copy only). All five answer `must_change_password = false`, so nobody is pushed into the
change-password screen.

| Login | Role | Employee | Use it for |
|---|---|---|---|
| `EMP102` | employee, **no manager** | 102 | the plainest view; the annual-leave composer checks in §5 (balance 5.27) |
| `EMP002` | employee, manager `EMP086` | 2 | the same screens with a manager in the chain (balance 0 → the "not enough" path) |
| `EMP086` | ceo, manager of employee 2 | 86 | the approvals screen and the manager stage |
| `EMP040` | admin (HR approver) | 40 | the HR stage of a request, the HR bell pool |
| `EMP010` | admin | 10 | employees, settings, payroll, announcements |

## 3. What the data looks like today (measured 5 Nov 2026, so "correct" is known)

- Employees: **106** total — **21 active**, **85 terminated**, 0 tamheer / training / consultants; of the
  active, 10 Saudi + 11 expat, Saudization **47.6 %**. (The 3 Nov 2026 note said "106 active"; today's
  `/employees/counts` says 106 **total**, 21 active — quote today's split if a counter is questioned.)
  ⚠ `/employees/counts` hard-codes `tamheer: 0` (`routers/canonical.py:520`) while `/dashboard` counts
  **2** as "the job title holds «تمهير»" (`canonical.py:1139`) — so the employees page's «تمهير» tab is
  empty and the dashboard card says 2 in the same copy. Two definitions, not a screen bug; §9 note 8.
- `EMP102` (no manager): `current` **5.27**, `carry` **0**, `year_end` **8.34**, `annual` **21**; one
  request (`annual`, **rejected**, 4→5 Oct 2026, refusal reason «test»), `/me/team` and `/me/approvals`
  empty, `/me/letters` empty, `/me/notifications` **2** rows, `/me/payslips` **2**. The empty ones are
  correct for this account, not failures.
- `EMP002`: `current` **0**, `carry` **0.06**, `year_end` **0.06**, `annual` **21**; 0 requests, 1
  notification. Its direct manager is employee **86** (`manager` on `GET /employees/2`), i.e. `EMP086`.
- `EMP040`: `current` **5.78**, `carry` **5.07**, `year_end` **9.07**; **the only one of the five logins with an
  approved leave** (`sick`, 7→8 Oct 2026, stage `completed`) — the row where the employee's «طلب إلغاء الإجازة»
  can be seen (§5.5). Two other employees (76, 74) hold approved one-day annuals, but they have no login here.
- The copy holds **six requests in all**: approved **3** (`annual` 29 Sep for 76, `annual` 6 Oct for 74,
  `sick` 7→8 Oct for 40) and rejected **3** (`annual` 30 Sep→1 Oct for 10 — the same row twice — and `annual`
  4→5 Oct for 102, refusal reason «test»). `GET /requests` returns all six; no filter hides them.
- `EMP010`: `current` **21.77**, `carry` **4.06**, `year_end` **25.06**; two `annual` requests, both
  **rejected** (30 Sep→1 Oct). `is_manager` true, `team_count` **5**, `approve_requests` /
  `manage_targets` / `evaluate_team` true, all `view_team*` false.
- `EMP086`: `is_manager` true, `team_count` **12**, `approve_requests` / `manage_targets` /
  `evaluate_team` true — but **every** `view_team*` permission is false, so `/me/team` is `[]`,
  `/me/team/requests` answers **403** and `/me/approvals` is `[]`. `team_count` still reports 12. The
  copy's permissions, not an empty-state bug.
- **No request anywhere is `pending`** — `GET /requests?status=pending` → `[]`. Every HR approve / return /
  cancel button and the employee's «تعديل التواريخ» / «إلغاء الطلب» need one: recipe §5.13.1.
- **No employee has targets or an evaluation** — `/targets` 0 rows and `evaluation: null` on
  `/evaluations/{id}/annual/2026` for all 14 employees probed (`can_write` true for HR). The evaluation
  form opens empty everywhere: recipe §5.13.3.
- **No letter, asset, announcement, candidate or register attachment** exists — `/letters` `[]`,
  `/assets` `assets: []` (with `people` 21), `/announcements` `[]`, `/candidates` 0,
  `/registry/attachments` `[]`. Those screens show their empty states today, by design.
- Settings today (quoted by §5.3–5.7): leave policy `emp_edit_pending` / `emp_cancel_pending` /
  `emp_request_cancel_approved` **true**, `allow_advance_balance` **false**; workflow 3 / 3 days, advance
  cap 100 %, 5 final-approval types; alerts 7 kinds on (30/60/60/90/90/60/60 days, notice 10 days,
  channels program+app+e-mail), `last_run: null`, `ready: false`, `email_sending: false`; brand colours
  `p #004d3d` / `s #f4f0e4` (accent empty), `custom: true`; permissions 4 roles + admin & chairman full,
  19 modules, 3 levels (`permissions` capped at `view`).
- Announced public holidays, 2026: **22 Feb** (1 day, recurring), **20 Mar** (4 days), **27 May**
  (4 days), **23 Sep** (1 day, recurring). All four are **past**, so `upcoming_holidays` is empty and no
  screen shows a «next holiday» pill today.
- Today is **Thursday 5 Nov 2026**; the working week is **Sunday → Thursday** (Friday and Saturday off).

## 4. Index

| # | Group (name it as the prompt names it) | Shipped | Backend | App | Run | Result |
|---|---|---|---|---|---|---|
| 10 | الأصول والعهد — the fixed-asset register, custody log, give/return | 4 Nov 2026 | `3a065b6` | `5928a52` | – | **API-verified, screen pending** (§5.1) |
| 11 | الصلاحيات والأشخاص — the 19-module × 4-role matrix in Settings ▸ 10 | 4 Nov 2026 | `345ffc8` | `66b5def` | 4 Nov 2026 | **owner's browser pass** (§5.2 — re-check after §5.4/5.6 touched settings) |
| 12 | HR leave actions — return to manager, HR cancel, balance undo, policy & workflow cards | 4 Nov 2026 | `b4bcbf7` | `58aedb0` | – | **API-verified, screen pending** (§5.3) |
| 13 | التنبيهات — the AlertsCard in Settings ▸ 9 | 4 Nov 2026 | `476615a` | `ff3e7b2` | – | **API-verified, screen pending** (§5.4) |
| 14 | the employee's own leave actions (app + `/me`) | 4 Nov 2026 | `dbebe67` | `6b80aa5`, `da4a8d1` | – | **API-verified, screen pending** (§5.5) |
| 15 | the evaluation form (HR writes it; HR's save is final) | 4 Nov 2026 | `68844b9` | `274abe2` | – | **API-verified, screen pending** (§5.6) |
| 16 | ألوان الهوية — brand colours, hex-only | 4 Nov 2026 | `861b26c` | `6ad28ca` | – | **API-verified, screen pending** (§5.7) |
| 17 | the employee record's extras (certificate, national-address expiry, GOSI, probation, document slots) | 4 Nov 2026 | `7dce11c` | `209ed2b` | – | **API-verified, screen pending** (§5.8) |
| 18 | delete an employee into the recycle bin + «الحسابات بكلمة مؤقتة» | 4 Nov 2026 | `137422d` | `cce52bb` | – | **API-verified, screen pending** (§5.9) |
| 19 | the payroll cycle — «تجهيز للمالية» then «اعتماد» | 5 Nov 2026 | `c7231a9` | `4eb3f05` | – | **API-verified, screen pending** (§5.10) |
| A1 | the home pills, «إجازات رسمية قادمة», the overtime line, the photo | 5 Nov 2026 | – (no backend change) | `e6d9c23` | – | **API-verified, screen pending** (§5.11) |
| A2 | «سيتبقى» counts annual leave in workdays; `/me/leave` publishes the holiday calendar; the English `{#}` strings | 5 Nov 2026 | `a5eecd1` | `6e6040c` | – | **API-verified, screen pending** (§5.12) |
| 20 | «جدول الدوام (رسمي + رمضان)» in Settings ▸ 3 and «ترحيل الرصيد وطريقة الاستحقاق والاستحقاقات الخاصة» in Settings ▸ 4 | 5 Nov 2026 | branch `backend-new-ui` (uncommitted) | branch `design-port` (uncommitted) | – | **API-verified, screen pending** (§5.14) |

## 5. Group blocks

- **§5.1 – §5.10** — the ten groups shipped 4–5 Nov 2026 that have never been on a screen (Stages 10–19).
  Every figure in them was measured on the running stack on 5 Nov 2026 (§6.4 is the probe that produced them).
- **§5.11** A1, **§5.12** A2 and **§5.14** Stage 20 — the newest (5 Nov 2026).
- **§5.13** — the recipes for the data this copy does not have. Run a recipe **before** the block that needs it,
  or the line cannot be seen at all (that is the honest state, not a defect).

Each block is self-contained: what changed, how to get there in Arabic, the lines to tick, and what is already
proven. A line stays `API-verified, screen pending` until your eye closes it (§7).

### 5.1 Stage 10 — «الأصول والعهد» (shipped 4 Nov 2026)

**What it changed.** The design's asset register with its custody log and, for the editing roles, the names
custody can be given to (`GET|POST /assets`, `POST /assets/{id}/custody`, `routers/assets.py`, `/assets` page).

**How to get there.** HR web → «الأصول والعهد» (`/assets`).

- [ ] **10-1 the register today.** `assets: []` and `log: []` in this copy: both tables show the design's empty
      text and nothing looks broken. `can_edit: true` as `EMP010`.
- [ ] **10-2 the ceo is read-only.** `can_edit: false` as `EMP086` — no add / give / return buttons, and the
      custody picker is not even sent (`people: 0` for that account, 21 names for an editor).
- [ ] **10-3 give a custody.** As `EMP010`: add one asset (kind, serial, date) and give it to `EMP040` → the row
      appears and the log gains a «تسليم» line with your name and the time.
- [ ] **10-4 take it back.** Return it → a second line «استلام», the row shows it is back, and the log keeps both
      lines (append-only history, nothing overwritten).
- [ ] **10-5 it reaches the employee.** The employee form's custody tab (§5.8) lists the same asset for `EMP040`
      and says delivery/receipt happens on «الأصول والعهد» (`emp-custody.tsx`).

### 5.2 Stage 11 — «الصلاحيات والأشخاص» (shipped 4 Nov 2026 — you passed this on 4 Nov)

**What it changed.** The design's PermsCard on our `/settings`: 19 modules × the roles, three levels, saved to
`ariba_role_perms`, and every HR-side check reads that table afterwards (`routers/permissions.py`,
`components/hr/perms-card.tsx`). There is **no `/permissions` page in this copy** — the card is the third card of
section 10. The block stays here because §5.4 and §5.7 also write settings — re-run it at the end and restore
what you changed.

**How to get there.** HR web → «الإعدادات» → section **10** «المستخدمون والصلاحيات والأمان» → scroll past
«كلمات المرور والأمان» and the public-application card → «الصلاحيات والأشخاص».

- [ ] **11-1 the shape.** 19 modules (`staff`, `employees`, …, `assets`), levels `none` / `view` / `edit`, the
      `hr`, `admin_manager`, `finance`, `ceo` columns, and `admin` + `chairman` shown as full roles outside the
      matrix (`full_roles`), with `capped: {"permissions": "view"}`. `GET /permissions` today returns exactly
      that in that order (`roles`, `full_roles`, `modules`, `levels`, `capped`, `matrix`, `can_edit`), and the
      ceo column is `edit` on **nothing**.
- [ ] **11-2 who may edit the matrix.** `can_edit: true` as `EMP010` (admin), `false` as `EMP086` (ceo) — the
      cells are read-only for the CEO.
- [ ] **11-3 the hr column** is `edit` on **17** of the 19 modules and `view` on `payroll_approve` and
      `permissions` (the same two the `capped` key names).
- [ ] **11-4 a cell bites.** Set `attendance` for `hr` to `none` → save → sign in as `EMP040` → «الحضور» leaves
      the sidebar and `/attendance` refuses → put it back to `edit`. (The only block that changes the matrix:
      run it last and restore the cell.)
- [ ] **11-5 a 403 reads as a 403.** With a cell at `none`, the page must say «ليست لديك صلاحية» — not an empty
      table and not an endless spinner.

### 5.3 Stage 12 — the HR leave page: return, cancel, undo and the two settings cards (shipped 4 Nov 2026)

**What it changed.** «إعادة لمديرك» with a required note and «إلغاء الإجازة» as HR, «تراجع عن آخر حفظ» on the
balance editor, plus the design's LeavePolicyCard and the workflow card «سير الطلبات: مسار الاعتماد والتصعيد»
in Settings ▸ 4 (`routers/canonical.py`, `components/hr/leave-settings.tsx`, `/leaves/page.tsx`).

**How to get there.** HR web → «الإجازات والطلبات» (`/leaves`); Settings ▸ **4** «الإجازات والأرصدة»; an
employee's ledger by pressing their row.

- [ ] **12-1 the policy card** «إلغاء وتعديل واسترجاع الإجازات». Three switches on (`emp_edit_pending`,
      `emp_cancel_pending`, `emp_request_cancel_approved`) and «السماح بالسحب على الرصيد» **off**
      (`allow_advance_balance: false`); flipping one saves with the toast and survives a reload
      (`GET /settings/leave-policy`).
- [ ] **12-2 the workflow card.** 3 days for the manager, 3 for the CEO, advance cap 100 %, 5 final-approval
      types — the numbers `GET /settings/workflow` returns; saving + reloading keeps them.
- [ ] **12-3 the balance editor and undo.** `EMP102`: current **5.27**, carry **0**, year-end **8.34**, annual
      **21** — identical to `/me/leave` and to `GET /leave/employees/102`. «تراجع عن آخر حفظ» is **greyed**
      because `/leave/employees/102/history` is `items: []`, `can_undo: false`; type a balance, save → it becomes
      live and restores the old value.
- [ ] **12-4 «إعادة لمديرك».** Needs a pending request (recipe §5.13.1): the button is on pending rows only, the
      note is mandatory, and the employee then sees «↩ أعادته الموارد البشرية لمديرك: <note>» (`payload.returned`).
- [ ] **12-5 HR cancel.** On the approved annual of recipe §5.13.1: the dialog warns that the days go back to the
      balance; after it the row reads «أُلغيت هذه الإجازة: <reason>» for the employee and their `current` rises by
      the days.
- [ ] **12-6 HR's queue.** «الإجازات والطلبات» lists all **six** requests with their stage — **3 approved**
      (76 annual 29 Sep, 74 annual 6 Oct, 40 sick 7→8 Oct) and **3 rejected** (10 annual 30 Sep→1 Oct twice,
      102 annual 4→5 Oct with the refusal «test»), and **nothing pending** (`/requests?status=pending` → `[]`).
      That is the data, not a filter bug.

### 5.4 Stage 13 — Settings ▸ 9 «التنبيهات» (shipped 4 Nov 2026)

**What it changed.** The design's AlertsCard («التنبيهات (قبل الانتهاء بكم يوم؟)», section **9** of `/settings`) on
`GET|PUT /settings/alerts`: seven expiry kinds with their lead days, a notice sub-switch (channels + recipients),
the probation default, «شغّل الآن» and the run log (`routers/alerts.py`, `services/expiry_alerts.py`,
`components/hr/alerts-card.tsx`).

**How to get there.** HR web → «الإعدادات» → section **9** «التنبيهات»; the dashboard card «⚠ تنبيهات عاجلة» is
the list these belong to.

- [ ] **13-1 the seven kinds today.** `probation` **30**, `contract` **60**, `iqama` **60**, `passport` **90**,
      `insurance` **90**, `natAddr` **60**, `gosiCert` **60** days — all on; each notice 10 days ahead on
      `program` + `app` + `email` to `hr`; `probation_default` **90**. `GET /settings/alerts` returns exactly
      that inside `cfg` (its top-level `probation_default` is `null` — the card reads `cfg`; the API's own kind
      names are `natAddr` / `gosiCert`, and the card shows «انتهاء العنوان الوطني» / «انتهاء شهادة التأمينات
      الاجتماعية»).
- [ ] **13-2 a change sticks.** probation 30 → 45, «حفظ» (toast), reload → 45 in the card **and** in the API
      (`PUT /settings/alerts` writes one audit row with the whole `cfg`; put it back to 30 afterwards).
- [ ] **13-3 the run cannot run in this copy — by design of the schema.** `GET /alerts/status` answers
      `ready: false, rows: [], last_run: null` and `GET /settings/alerts` the same `ready: false`, because
      migration **005** (`docs/db-migrations/005_expiry_alerts.sql`, which creates `ariba_alert_log` and
      `ariba_alert_daily`) has not been applied. So «شغّل الآن» must surface the API's **503**
      «جداول التنبيهات غير موجودة — شغّل docs/db-migrations/005_expiry_alerts.sql أولًا» — an Arabic message,
      never a silent no-op and never a fake «تم». Applying that migration is a decision for you (§9 note 11);
      after it, the same button writes rows that appear in the log with their dates.
- [ ] **13-4 where they land.** The dashboard's «تنبيهات عاجلة» is **not** empty and never was: it counts and
      lists the expiry dates computed at read time from these settings — today **12** rows (6 `contract`,
      6 `iqama`: 3 «منتهي» in red, 2 red within 14 days, 7 amber within 30) with the employee's name and
      «(N أيام)» (`GET /dashboard` → `alerts`). The run of 13-3 feeds the bell and the log, not this card.
- [ ] **13-5 e-mail is off.** `email_sending: false` in this copy: nothing on the card may claim an e-mail went
      out (the channel stays listed — that is the design).

### 5.5 Stage 14 — the employee's own leave actions, app and `/me` (shipped 4 Nov 2026)

**What it changed.** The request line shows «تعديل التواريخ», «إلغاء الطلب» and «طلب إلغاء الإجازة», each only
while HR's switch for it is on (`GET /me/leave-policy`), plus «طلب إلغاء هذه الإجازة قيد الاعتماد» while one is
in flight; the same three exist on the web `/me/leaves` page. `da4a8d1` had to hide the cancel button while a
cancellation is pending (`routers/canonical.py`, `components/request-item.tsx`).

**How to get there.** Employee app → «طلباتي»; and HR web → `/me/login` → **`EMP040`** → «طلباتي».

- [ ] **14-1 the one action visible today.** `EMP040`'s approved sick leave (7→8 Oct) carries «طلب إلغاء
      الإجازة» — the policy has `emp_request_cancel_approved: true`. Confirm → the row reads «طلب إلغاء هذه
      الإجازة قيد الاعتماد» and the button **disappears** (that is the `da4a8d1` fix).
- [ ] **14-2 no buttons where they do not belong.** `EMP102`'s rejected row and `EMP010`'s two rejected rows
      show «سبب الرفض: test» and **no** action button; 🗑 appears only on rows that are not approved.
- [ ] **14-3 the pending pair needs data.** «تعديل التواريخ» / «إلغاء الطلب» exist only on a `pending` leave and
      nothing in this copy is pending (§3) → recipe §5.13.1. Then: change 15→19 Nov into 15→16 Nov and the
      stored row must count **2** workdays with «سيتبقى» recomputed before saving.
- [ ] **14-4 the same on the web `/me/leaves`** — same three labels, same conditions (the page reads the same
      policy); «حفظ» after «تعديل التواريخ» answers «تم تعديل التواريخ».
- [ ] **14-5 a cancelled leave reads as cancelled.** After any cancellation the employee's row shows «أُلغيت
      هذه الإجازة» + the reason and loses every action.

### 5.6 Stage 15 — the evaluation form: HR writes it, and HR's save is final (shipped 4 Nov 2026)

**What it changed.** The evaluation page's HR form (the design's EvalForm: lines seeded from the employee's
targets, weights, live total) on `GET|PUT /evaluations/{employee_id}/{period}/{key}`, per your 4 Nov decision
(b): HR may write any employee's evaluation (`routers/goals.py`, `components/hr/goals.tsx`, page `/evaluation`),
and an HR submit is final at once — the API stores it `approved`, tells the employee, and leaves no approval
stage after HR (`routers/goals.py:186-197`).

**How to get there.** HR web → «التقييم» (`/evaluation`) → «اختر الموظف…» = **102** → the period row under the
title defaults to «ربع سنوي»: choose **«سنوي»** and the year select (`PP_YEAR`) stays **2026** → the form opens
at once, because HR may write that period.

- [ ] **15-1 it opens empty, and that empty state is the thing to see.** Nobody in this copy has targets
      (`/targets` returns 0 rows for all 14 employees probed) and nobody has an evaluation (`/me/goals` for
      `EMP102` → `targets: []`, `evaluations: []`), so `evaluation: null`, `targets: []`, `can_write: true`,
      `can_approve: false`: the form shows «+ بند جديد» and nothing else, and **both** buttons are disabled —
      an empty evaluation is not an evaluation, and the API refuses it in the same words.
- [ ] **15-2 two lines, saved as a draft.** «+ بند جديد» twice, each with a title, «الدرجة %» and «الوزن» →
      «النتيجة» and its word («ممتاز» / «جيد جداً» / «جيد» …) move as you type → «حفظ كمسودة» → toast «✓ حُفظ
      التقييم كمسودة» → reload → the lines come back with the badge «مسودة» (`status: draft`).
- [ ] **15-3 the numbers the API trusts.** Weights are relative: neither the screen nor the API requires them to
      total 100 (`overall = Σ(score·w)/Σw`, `routers/goals.py:131`), so a form that blocks the save for
      "weights ≠ 100" is wrong. What *is* refused, in the API's own words: a blank title «عنوان البند مطلوب», a
      score outside 0–100 «درجة البند يجب أن تكون بين 0 و100», and no lines at all «التقييم يحتاج بنداً واحداً
      على الأقل» (both buttons stay disabled).
- [ ] **15-4 HR's own save is the signature.** The second button on HR's form is «✓ اعتماد نهائي وإبلاغ
      الموظف», with the note «تقييم الموارد البشرية نهائي فور اعتماده — لا يحتاج موافقة بعدها»: press it →
      modal «اعتماد التقييم» → «اعتماد» → toast «✅ اعتُمد التقييم وأُرسلت النتيجة للموظف», badge «معتمد», form
      gone, and a second save answers 409 «اعتُمد هذا التقييم نهائياً ولا يمكن تعديله». That is the shipped
      rule, and it replaces the earlier «HR never approves».
- [ ] **15-5 the only separate signature is on someone else's pending row.** `can_approve` reads `false` on HR's
      empty period because there is no row to sign; the default approver stage is HR
      (`goals_config.evaluation_approver`), so when a manager submits an evaluation, `EMP010` opening that
      period sees it read-only with «✓ اعتماد نهائي وإبلاغ الموظف» (`EV_APPROVE`) — and may still write over it.
- [ ] **15-6 the employee's side.** With §5.13.3 done and that evaluation `approved`, `EMP102`'s «أهدافي
      وتقييمي» shows the same rows read-only (its `/me/goals` returns one approved evaluation). `EMP086` (ceo:
      `evaluate_team: true`, `manage_targets: true` on `/me/manager-perms`) may write his team's.

### 5.7 Stage 16 — «ألوان الهوية» (shipped 4 Nov 2026)

**What it changed.** Settings gains the design's brand colours: presets, a primary and a secondary picker, hex
only, saved through `PUT /settings/brand-colors` (`routers/settings_extra.py`,
`components/hr/settings-extra.tsx`).

**How to get there.** HR web → «الإعدادات» → section **1** «بيانات الشركة والهوية» → «ألوان الهوية».

- [ ] **16-1 the pair today.** `GET /settings/brand-colors` → `custom: true`, primary **#004d3d**, secondary
      **#f4f0e4**, accent empty — the card must show exactly these two.
- [ ] **16-2 a preset, then save.** Pick a preset → «حفظ» → toast → reload → the pickers and the API agree, and
      the sidebar/top bar use the primary.
- [ ] **16-3 a bad value is refused.** `red` or `#12345` must be refused before saving; the API itself answers
      **422** «اللون p يجب أن يكون بصيغة #RRGGBB» and keeps the stored pair (checked today: after the refused
      call `GET` still returned #004d3d / #f4f0e4).
- [ ] **16-4 the note under the card.** The card says the employee app follows the same pair — read it against
      what the app actually shows; `/public/brand` serves the pair and the logo **without a token**, which is
      what the app's sign-in screen can use.

### 5.8 Stage 17 — the employee record's extras and the document slots (shipped 4 Nov 2026)

**What it changed.** The form gains the design's certificate box, «تاريخ انتهاء العنوان الوطني», the GOSI
number and system, the probation fields and the document slots; the values live in the employee's own record
(`routers/canonical.py`, `components/hr/employee-form.tsx`).

**How to get there.** HR web → «الموظفون» → «إضافة موظف» (blank form) or open **102** (empty values to fill).

- [ ] **17-1 the new fields are blank, not invented.** `GET /employees/102` today: `national_address: null`,
      `national_address_expiry: null`, `gosi_no: null`, `probation_days: ""`, `has_photo: false`. The screen
      must show them empty — a value here would be a lie.
- [ ] **17-2 they survive a save.** Fill certificate type, national-address expiry and GOSI number → «حفظ» →
      reload → the three come back from the API, and «↺» on a changed field (and «استرجاع الكل») undoes it.
- [ ] **17-3 the salary strip is live, not saved.** Changing «الراتب الأساسي» updates total / GOSI / net through
      `POST /employees/salary-preview` before «حفظ»; 102 today: basic **2000.00**, housing/transport/other
      **0.00**, total **2000.00**, GOSI employee **0.00**, GOSI employer **0.00**, net **2000.00**,
      `gosi_system: matching` (`GET /employees/102` → `salary`). A change in the basic must move the total and
      the net on screen before you press «حفظ».
- [ ] **17-4 the document slots.** 102 has no document at all (`GET /employees/102/documents` → `[]`), so every
      slot is empty with its upload button; after one upload the row carries the file's name, size and date.
- [ ] **17-5 the dependents tab is honest.** `GET /employees/102/dependents` answers **501** «Dependents are not
      represented in the canonical schema» — the tab must say so in Arabic instead of spinning or showing an
      empty table as if it worked (§9 note 9).

### 5.9 Stage 18 — deleting an employee into the recycle bin, and temporary passwords (shipped 4 Nov 2026)

**What it changed.** The employees list's 🗑 (only for roles with `employees_admin` **edit**) asks for
confirmation, says a full copy goes to the recycle bin and shows the API's refusal reasons; the employee form
gains «الحسابات بكلمة مرور مؤقتة» (`routers/accounts_admin.py`, `services/employee_delete.py`).

**How to get there.** HR web → «الموظفون» → a row's 🗑; and «الموظفون» → open an employee → the small button
beside «حفظ».

- [ ] **18-1 who sees the delete.** As `EMP010` (admin) the 🗑 is on the row; as `EMP086` (ceo) it is absent —
      the matrix gives ceo `employees_admin: view` and admin `edit` (`GET /permissions` agrees).
- [ ] **18-2 the confirmation.** The dialog names the employee and says a full copy goes to the recycle bin;
      when the API refuses, its Arabic reason is shown (never a silent failure).
- [ ] **18-3 the whole loop.** Delete one expendable terminated employee → «الموظفون» goes **106 → 105** and the
      row is in «سلة المهملات» (62 items today: 57 `workflow_request`, 5 `other`, all `restorable: true`); restore
      it → back to **106**.
- [ ] **18-4 the temporary-password list.** The button «الحسابات بكلمة مؤقتة» (beside «حفظ», and only with
      `employees_admin: edit`) opens the modal «الحسابات بكلمة مرور مؤقتة», which must list exactly **one** row
      today — `Admin`, role `admin`, since **07/10/2026** (`GET /accounts/temporary-password`) — with no password
      column. It is *not* the «لا توجد حسابات بكلمة مؤقتة» empty state.

### 5.10 Stage 19 — the payroll cycle: «تجهيز للمالية» then «اعتماد» (shipped 5 Nov 2026)

**What it changed.** The month's cycle is shown on the payroll page («📝 مسودة» / «📤 جاهز للاعتماد» /
«🔒 معتمد» / «🔓 مفتوح بعد الاعتماد») with who, when and the note or reason; «تجهيز للمالية» saves the figures on
screen and prepares the month with an optional note for finance; finance's «اعتماد» stays disabled until the
month is prepared (admin and chairman may approve directly, as before) — `routers/payroll_status.py`,
`app/(hr)/(portal)/payroll/page.tsx`.

**How to get there.** HR web → «مسير الرواتب» → month **10/2026**; the chip and the prepare/reopen buttons are
on the strip under the month pickers, «اعتماد» is in the toolbar above the sheet.

- [ ] **19-1 the state today.** 10/2026 reads «📝 مسودة» with the helper «جهّز المسير ثم أرسله للمالية
      للاعتماد» — `GET /payroll/status/pay_2026_10` → `status: draft`, `rows: 23`, `approved: false`.
- [ ] **19-2 prepare it.** «📤 تجهيز للمالية» (disabled while the month has no rows) → «تجهيز المسير
      للمالية» — «يُحفظ المسير كما هو ويُرسل إشعار للمالية لاعتماده» with «ملاحظة للمالية (اختياري)» —
      confirm «تجهيز وإرسال» → the chip turns «📤 جاهز للاعتماد» with «جهّزه <your name> — <time> — <note> —
      بانتظار اعتماد المالية», the button becomes «إعادة التجهيز», and a reload keeps it (`status: prepared`,
      `prepared_by_name`, `prepared_at`, `prepare_note`).
- [ ] **19-3 approve.** «اعتماد» (green, in the toolbar) opens «اعتماد مسير الرواتب» — «لن يمكن التعديل بعد
      الاعتماد (فتحه بسبب مسجّل فقط)»; after it the chip reads «🔒 معتمد» and the month joins the archive page,
      which today holds only **8/2026**: 29 employees, total 315,413.29, **net_sar 316,773.57**
      (`GET /payroll-archive`). 9/2026 is approved too but has no archive row — that is the data.
- [ ] **19-4 the finance rule, and why you cannot see it here.** «اعتماد» is blocked only for the **finance**
      role (`approveBlocked = role === "finance" && state !== "prepared"`, tooltip «يُعتمد بعد أن تجهّزه الموارد
      البشرية»), and the API refuses the same call with **409** `payroll_not_prepared`
      «المسير لم يُجهَّز للاعتماد بعد — تجهّزه الموارد البشرية أولًا» (`before_approve`,
      `routers/payroll_status.py:90`). There is **no finance account in this copy**, and as `EMP010` (admin) the
      button is live even in draft — so this line is code-verified only and must be closed by a finance login,
      not by a click here (§9 note 10).
- [ ] **19-5 an empty month.** 11/2026 has `rows: 0` → «تجهيز للمالية» is **disabled**, and the API answers
      **404** «احفظ المسير أولًا ثم جهّزه للاعتماد» (it saves the sheet first) — never a prepared empty month.
- [ ] **19-6 reopen.** On an approved month the strip shows «🔓 فتح المسير» → «فتح المسير بعد اعتماده» with
      «السبب (إلزامي — يُسجَّل في سجل التعديلات، 5 حروف على الأقل)»; after «فتح» the chip reads «🔓 مفتوح بعد
      الاعتماد» with «فتحه <name> — <time> — السبب: <reason>». A 4-letter reason must be refused (**422**
      «اكتب سبب فتح المسير (5 أحرف على الأقل)»).
- [ ] **19-7 the other five months.** `GET /sheets` lists the six keys with only an `approved` flag —
      **09/2026** (approved 4 Oct 2026) and **08/2026** (approved 1 Oct 2026) true, **10 / 07 / 02 / 01**
      false — and `GET /payroll/status/<key>` gives their size: 37, 29, 23, 25, 22, 38 rows, all
      `status: draft`. Each month must show its own chip — an approved month is read-only, a draft one is not
      (and preparing an already-approved month answers **409** «المسير معتمد بالفعل»).

### 5.11 A1 — the home pills, «إجازات رسمية قادمة», the overtime line, the photo (shipped 5 Nov 2026)

**What it changed.** Three gaps the web `/me` pages did not have: the home shows «مرحّل» and the nearest public
holiday as two slim pills under the leave ledger, «طلباتي» lists «إجازات رسمية قادمة», and the employee's photo
replaces the initial letter on three heroes (`lib/photo.ts`: one `GET /employees/{id}/photo` per session, a 404
means "no photo", the value is dropped on sign-out). No backend change.

**How to get there.** Employee app (`localhost:8081`) — sign in as **`EMP040`** (carry 5.07) and as **`EMP102`**
(carry 0). Home is «الرئيسية»; the heroes are home, «ملفي» and «المزيد»; the list is «طلباتي»; the tab is
«عمل إضافي».

- [ ] **A1-1 the two pills.** As `EMP040`, under the leave tiles: «مرحّل: 5.07 يوم»; as `EMP102`: «مرحّل: 0 يوم»
      (both are `carry` on `GET /me/leave`). The second pill is **absent** today and that is correct — it is the
      nearest *future* holiday and `upcoming_holidays` is empty (§9 note 1); it appears only through the A2-5b
      holiday probe.
- [ ] **A1-2 «إجازات رسمية قادمة» is hidden today, correctly.** The card keeps rows with `date >= today`
      (`app/(tabs)/leaves.tsx:41`) and all four announced holidays are past (§3). With the temporary 17 Nov row
      of A2-5b it appears above the request list with the holiday's name, «17/11/2026» and its day count.
- [ ] **A1-3 the overtime line.** «عمل إضافي» shows its empty state — no overtime request exists (§9 note 5).
      After recipe §5.13.2 the row must carry the type, the status badge, the reason, the sent date and 🗑 while
      it is not approved (that is the whole point of the change).
- [ ] **A1-4 the photo.** No employee has one (`has_photo` false on every row; `GET /employees/102/photo` →
      404), so all three heroes show the monogram today. Upload one in the employee form (§5.8), sign in as
      that employee → the photo replaces the letter on home + «ملفي» + «المزيد»; sign in as `EMP102` afterwards
      → **no** leftover face (the value is per session).

### 5.12 A2 — «سيتبقى» counts annual leave the way the server does (shipped 5 Nov 2026)

**What it changed.** The composer counted calendar days, so a range over a weekend or a public holiday promised
a balance the server then refused. Annual leave is now counted Sunday→Thursday with the official holidays out
(`lib/port.ts` `workdays()`, mirroring `services/leave.py`), and two lines explain the number. `GET /me/leave`
gained `holidays` (the whole announced calendar) because an employee cannot read `/holidays`; the
`upcoming_holidays` key is unchanged. Three English strings left with `{#}` by Stage A1 were fixed in
`src/i18n/en.ts`.

**How to get there.** Sign in as `EMP102`, home → the quick action «طلب إجازة» (opens the sheet straight on
«سنوية»), or «طلباتي» → «طلب جديد» → group «إجازات» → «سنوية». The composer's first screen is titled
«ماذا تريد أن تطلب؟».

- [ ] **A2-1 the counting itself.** «من تاريخ» **2026-11-12** (Thu) → «إلى تاريخ» **2026-11-15** (Sun).
      The yellow box must read, in this order: «المتاح لك 5.27» · «المدة المحتسبة **2** يوم عمل» ·
      «بدون الجمعة والسبت والإجازات الرسمية» · «سيتبقى **3.27**».
      Before A2 the same range read 4 days and «سيتبقى 1.27» — that difference is the whole stage.
- [ ] **A2-2 a weekend-only request.** **2026-11-13** → **2026-11-13** (Friday). The box shows
      «المدة المحتسبة **0** يوم عمل» and the rule line, and **no** «سيتبقى» line at all (it is hidden while the
      count is 0, so the balance is never announced as unchanged by a request that costs nothing).
- [ ] **A2-3 both counts agree when there is no weekend inside.** **2026-11-15** → **2026-11-19**:
      «المدة المحتسبة **5** يوم عمل» and «سيتبقى **0.27**» (5 calendar days = 5 workdays, 5.27 − 5).
- [ ] **A2-4 client and server agree on the stored request.** From A2-3, press send → «أُرسل طلبك»; the row in
      «طلباتي» reads **5** days, not 5.27 and not 8. `EMP102` has no manager, so the request lands on the HR
      stage in one step (cancel it afterwards if you do not want it in HR's queue).
- [ ] **A2-5 every other request type is untouched.** «طلباتي» → «طلب جديد» → e.g. «عن بعد» or «بدون راتب»
      with the same 12→15 Nov: **no** «المدة المحتسبة» box (it exists for annual leave only) and the stored row
      still counts calendar days (**4**). Annual leave is the only type the server counts in workdays.
- [ ] **A2-5b the holiday exclusion (optional, needs my two minutes).** No announced holiday is left in 2026
      (see §3), so the exclusion cannot be seen today. Say the word and I insert one row in
      `public.public_holidays` (**Tue 2026-11-17**, 1 day) while you watch, then delete it again. With it in
      place: **2026-11-15 → 2026-11-18** must read «المدة المحتسبة **3** يوم عمل» and «سيتبقى **2.27**»
      (Sun 15, Mon 16, Tue 17 out, Wed 18), while **12 → 15 Nov** stays at **2** — the control, because the
      holiday sits outside that range.
- [ ] **A2-6 the three English strings.** Switch the app to English:
      - home, under the leave tiles: **"Carried: 0 day(s)"** (Arabic «مرحّل: 0 يوم») — not `{#}`;
      - the nearest-holiday pill is hidden today (no future holiday), see `§9` note 1;
      - an overtime row's «أُرسل 17/11/2026» → **"Sent 17/11/2026"** — no overtime request exists yet (§9 note 5),
        so this one cannot be seen on screen today (the harness proves the string, §6).
      The composer's own two lines in English read "Counted: 2 working day(s)" and "Fridays, Saturdays and
      official holidays are not counted".

**What was already proven without a screen (5 Nov 2026).** `pytest` **563 passed / 59 skipped**; `tsc --noEmit`
clean; the Expo dev bundle rebuilt (5.35 MB) and contains `(0, _libPort.workdays)(from, to, announced)` and both
new Arabic lines; `workdays()` **extracted from `port.ts`** agreed with the API's `LeaveBook.count_workdays` on
**13 ranges** (weekend-only, the four-day holidays, recurring rows projected into 2027, a synthetic 29 Feb row,
an inverted range, a year boundary); live through `:8040` a temporary holiday on 2026-11-17 was published in
**both** keys and both sides counted 5 / 0 / 2 / 12, then the row was deleted (database back to 4 holiday rows,
`EMP102` `current` still 5.27); the i18n walk covered all **584** entries and **50** placeholder pairs with
**0** broken (3 broken before the fix).


### 5.13 The data this copy is missing — make it before the block that needs it

Each recipe writes to the throw-away copy only, and each says how to put things back. Nothing here is a code
change; it is the difference between "the button is not there" and "there was no row to press it on" (§3).

**5.13.1 a pending leave — for the approve / return / cancel / edit buttons** (needs: §5.3 12-4…12-6, §5.5 14-3)

- *at the manager stage.* Employee app → sign in **`EMP002`** → «طلباتي» → the dock's **«+»** → group «إجازات» →
  **«عن بعد»** (not «سنوية»: `EMP002`'s `current` is **0**, so an annual request is refused for balance) →
  15 → 19 Nov 2026 → «إرسال». The row is `pending` at the **manager** stage and **`EMP086`** — employee 2's
  direct manager, employee 86 — sees it in «الموافقات». From there: `EMP086` approves it, or HR returns it with
  a note (12-4), or `EMP002` edits the dates / cancels it (14-3).
- *at the HR stage.* Employee app → **`EMP102`** (no manager, so its request reaches HR in one step) →
  **«سنوية»** → 15 → 16 Nov 2026 (2 workdays ≤ 5.27) → «إرسال». HR can then cancel it with a reason (12-5) and
  the two days return to the balance — `EMP102` `current` 5.27 → **7.27**.
- *put it back:* cancel every row you created from «الإجازات والطلبات» (HR) and the copy matches §3 again.

**5.13.2 an overtime request — for §5.11 A1-3** (7 Nov 2026: no overtime row exists anywhere)

Employee app → `EMP102` → «عمل إضافي» → «التاريخ» **12/11/2026**, «عدد الساعات» **2**, «السبب / المهمة»
anything → «⏱️ إرسال الطلب». The row then appears in «عمل إضافي» with its type, status badge, reason, sent date
and 🗑 — and **not** in «طلباتي», which filters `type !== "overtime"` out (`app/(tabs)/leaves.tsx:61`).

**5.13.3 two targets — for the evaluation form** (needs: §5.6 15-1, 15-2, 15-6)

HR web → «المستهدفات» → employee **102**, period **«سنوي»** + year **2026** (the picker defaults to «ربع سنوي»,
and a target saved in another period never seeds the annual evaluation) → «+ مستهدف جديد» → title +
«الوزن (الأهمية)» → «حفظ» (toast «✓ حُفظ المستهدف وأُشعر الموظف»). Then «التقييم» → 102 → «سنوي» 2026 opens with
the two lines seeded instead of an empty form, `GET /targets?employee_id=102&year=2026` returns 2, and after you
approve, `EMP102`'s «أهدافي وتقييمي» shows them read-only.

**5.13.4 a temporary holiday — for §5.12 A2-5b and §5.11 A1-2.** One row in `public.public_holidays`
(**Tue 2026-11-17**, 1 day) while you watch, deleted afterwards; §5.12 A2-5b carries the expected numbers.

### 5.14 Stage 20 — «جدول الدوام (رسمي + رمضان)» and «ترحيل الرصيد وطريقة الاستحقاق والاستحقاقات الخاصة» (shipped 5 Nov 2026)

**What it changed.** Two cards that were placeholders on the Settings page now read and save the server's own
rules instead of a picture of them: `ScheduleCard` is the **first** card of §3 «الحضور والدوام»
(`components/hr/schedule-settings.tsx`, the rules in `services/schedule.py`), and `LeaveRulesCard` is the
**third** card of §4 «الإجازات والأرصدة» (`components/hr/leave-settings.tsx`, `services/leave_rules.py`). The
routes are `GET/PUT /settings/schedule` and `GET/PUT /settings/leave-rules` (`routers/settings_extra.py`), no
migration: four `ariba_app_settings` rows, written on save and read by the attendance and leave code itself. The
schedule switch is **off**, so no stored punch changes — the card says so in as many words.

**How to get there.** HR web **http://localhost:3000** → «الإعدادات» → **3 «الحضور والدوام»** (first card) and
**4 «الإجازات والأرصدة»** (third card, under «سياسة الإجازات» and «دائرة الموافقات»). Sign in as **`EMP010`**
(admin ⇒ `settings: edit`); without it every box is greyed and «حفظ» is not drawn.

- [ ] **20-1 the schedule card as it stands (nothing saved yet).** Switch «تفعيل حساب الحضور على الجدول» **off**,
      under it «غير مُفعّل: يبقى وقت بدء العمل وهامش التأخير من إعدادات الشركة (بطاقة إعدادات الشركة) كما هو.»;
      «الدوام الرسمي» البداية **08:00** النهاية **17:00** عدد ساعات **8** سماح **15**; «دوام رمضان»
      **09:00 / 15:00 / 6 / 15**; «تحديد رمضان» with «تحديد رمضان تلقائيًا بالتقويم الهجري» **ticked** and the two
      dates empty (its note: «الحساب التلقائي مُفعّل — يُستخدم في الأيام التي لا يغطيها التاريخان.»); the bottom
      strip reads «الجدول غير مُفعّل، فالحضور اليوم على إعدادات الشركة.» — **not** a shift line.
      `GET /settings/schedule` today: `enabled: false`, `official {start: "08:00", end: "17:00", hours: 8.0,
      grace: 15}`, `ramadan {start: "09:00", end: "15:00", hours: 6.0, grace: 15}`, `ramadan_auto: true`,
      `today: {date: "2026-11-05", shift: null}`.
- [ ] **20-2 what a save is refused for (nothing is written).** «النهاية» **07:00** → «حفظ» → toast
      «official: وقت النهاية يجب أن يكون بعد البداية»; «عدد ساعات الدوام» **20** → «official.hours: يجب أن يكون
      بين 1 و 16»; «سماح التأخير» **200** → «official.grace: يجب أن يكون بين 0 و 120»; «من تاريخ» alone
      (18/02/2027) → «ramadan_from / ramadan_to: التاريخان معًا أو لا شيء». All four answer **422** on the API
      today, and a reload shows the old values — nothing was saved.
- [ ] **20-3 switching it on decides today (a write — put it back).** Tick the switch → «حفظ» → toast
      «✓ اتحفظ جدول الدوام» and the strip turns into «الدوام المُطبَّق اليوم **05/11/2026** — الدوام الرسمي
      08:00 – 17:00 · 8 ساعة · سماح 15 دقيقة»; `GET /settings/schedule` then answers
      `today.shift.kind: "official"`. Untick → «حفظ» → back to «الجدول غير مُفعّل…» with `today.shift: null`:
      that is the switch doing its job, and the punches stored before it keep their own figures.
- [ ] **20-4 the leave card as it stands.** «ترحيل ما تبقّى من الرصيد إلى السنة التالية» **ticked**, «حد الترحيل»
      **10** «يوم في السنة» with «ما زاد على 10 يومًا لا يُرحَّل، ويُدفع مع نهاية الخدمة كفائض إجازات.»; «طريقة
      احتساب الاستحقاق» = **«أيام العمل»** and the note under it; the table's three rows (استشاري / التمهير /
      متدرب) with every «إجازات» and «نهاية الخدمة» box **unticked** and **0 / 2 / 0** employees, then
      «ومن ليس من هذه الأنواع (0 موظفًا) تبقى له إجازاته وفائض نهاية الخدمة دائمًا.»
      `GET /settings/leave-rules`: `carry {enabled: true, days: 10}`, `accrual {method: "workdays"}`, the three
      rights all false, `employees {tamheer: 2, trainee: 0, consultant: 0, other: 0}` (21 active employees:
      19 ordinary + those 2 Tamheer), `max_carry_days: 365`.

- [ ] **20-5 the two other methods are choices, not figures.** Choosing «تقويمي» or «شهري» changes only the note
      under the box — nothing moves until a save, so read both notes and leave it on **«أيام العمل»** unless you
      mean it (a saved «تقويمي» re-accrues every balance in the file; «شهري» gives 1/12 a month, the current month
      by its elapsed days).
- [ ] **20-6 a tick changes a ledger (a write — untick and save to put it back).** Tick «إجازات» on the **التمهير**
      row → «حفظ» → toast «✓ اتحفظت قواعد الإجازات»; «الإجازات والأرصدة» then shows **`EMP102`** (and the second
      Tamheer row, `XLS-6acee8708e51`) with annual **21** / current **5.27** / carry **0** / year end **8.34**,
      where they showed **0 / 0 / 0 / 0** a moment before. Untick → «حفظ» → both are **0 / 0 / 0 / 0** again
      (`GET /leave/balances`, 21 rows). «نهاية الخدمة» is the other box: unticked, the leave excess is not counted
      there either.
- [ ] **20-7 the role gate.** `EMP002` (employee) asking the API directly gets **403** on both
      `GET /settings/schedule` and `GET /settings/leave-rules`, and an HR account without `settings: edit` sees no
      «حفظ» and greyed boxes. This copy has no such account (§2), so the screen half of this line is code-verified
      only.

**Already proven without a screen (5 Nov 2026).** `pytest tests_canonical` on a fresh copy of `ariba_src` with
migrations 001–007: **627 passed / 15 skipped**, of which `test_stage20_settings.py` is **20 passed** (2 of them
DB-backed, inside a transaction that is rolled back): the schedule off and on, the day's row choosing the shift,
the punches measured against it, Ramadan found by the Hijri month with the two dates winning, the three accrual
methods accruing differently, the cap on / off (the cap kept while off), a type with no leave keeping no ledger,
`eos` zeroing only the excess, and a hand-edited row falling back to the default. `tsc --noEmit` and `eslint` are
clean on the five touched frontend files. On the running 8040 stack: the two GETs answer the numbers above, five
bad PUTs answer **422** with the messages quoted in 20-2, and `EMP002` gets **403** on both (20-7).
The same suite run against `ariba_local` (the copy the running stack reads) shows 6 failures in
`test_expiry_alerts` / `test_me_leave` / `test_record_extras` — that copy's `document_types` has no `professional`
row and it lacks a request row the cancel test expects; all six pass on the fresh copy, and none of them touches
Stage 20.

## 6. Machine checks (run these before the screen pass — they never go stale)

Four groups: **§6.1** the three gates that must be green before anything else, **§6.2** the two checks of this
session that are not in the repo (their method, so they can be re-built), **§6.3** the map of where every block
lives and the order to run them in, **§6.4** the read-only sweep that produced every number in §5.

### 6.1 the three gates

```powershell
# 1. the backend's own tests (from the main repo's backend folder)
cd 'C:\Users\GhadyNafisah\Downloads\HR_ARIBA-main\HR_ARIBA-main\HR_ARIBA-main\backend'
.\.venv\Scripts\python.exe -m pytest -q          # 5 Nov 2026: 563 passed, 59 skipped

# 2. the app type-checks and runs its own service-worker test
#    (this app has no ESLint dependency or config — `tsc` is its gate; do not run `npx eslint` here)
cd 'C:\Users\GhadyNafisah\Downloads\HR_ARIBA-main\HR_ARIBA-main\design-port\frontend\employee-app'
npm.cmd run typecheck                           # 5 Nov 2026: no output, exit 0
npm.cmd run test:sw                             # 5 Nov 2026: "sw.js: all checks passed", exit 0

# 3. the app the browser runs really carries the new code (Metro web, same bundle)
#    open http://localhost:8081 first, then, in a scratch PowerShell window:
$html = (Invoke-WebRequest 'http://localhost:8081' -UseBasicParsing).Content
$src  = [regex]::Match($html, 'src="([^"]+\.bundle[^"]*)"').Groups[1].Value
$url  = if ($src -like 'http*') { $src } else { 'http://localhost:8081' + $src }
Invoke-WebRequest $url -OutFile "$env:TEMP\b.js"
Select-String -Path "$env:TEMP\b.js" -Pattern 'workdays\)\(from, to, announced\)' | Select-Object -First 1
# 5 Nov 2026: 5,367,818 bytes, one match for the workdays() call, two for «المدة المحتسبة»
```

### 6.2 two checks that are not in the repo yet

Two checks of this session are **not** in the repo yet — they lived as throwaway scripts in `%TEMP%`
(`i18n_check.mjs`, `run_workdays.ts`, `py_workdays.py`, `workdays_hols.json`). Their method, if they are ever
wanted permanently (say the word and I add them under `tools/`):

* **i18n placeholders.** Re-implement the translator of `src/i18n/index.tsx` in plain Node, then for every
  `en.ts` pair whose Arabic side contains `{#}`/`{n}` assert the English side contains `{1}`: the app substitutes
  only there, so `{#}` on the English side renders literally. 5 Nov 2026: 584 entries, 50 placeholder pairs,
  **0** broken (3 before the fix — «مرحّل», «أقرب إجازة رسمية», «أُرسل»).
* **workday parity.** Pull `workdays()`, `calendarDays()`, `holidayDates()` out of `src/lib/port.ts` (they are
  self-contained), run them over the ranges in §5, and compare with the API's own counting: either
  `services/leave.py`'s `LeaveBook.count_workdays` on a throwaway copy, or the number the API stores when a
  request is created. The 13-range list is: a single workday, a Friday only, a Friday+Saturday pair, Thu→Sun,
  Sun→Thu, a 4-day holiday inside and outside the range, a recurring holiday projected into the next year,
  a 29 Feb holiday, an inverted range, a year boundary — and the live `/me/leave` payload.

### 6.3 the screen pass — where every block lives, and the order to run them in

**Where.** The HR web's side menu is `src/lib/hr-nav.ts`; the Settings page is one long page split into ten
numbered sections (`SECS` in `settings/page.tsx`, collapsible, with a sticky bar of numbered chips and a search
box that opens whichever sections contain the typed word). Every «How to get there» in §5 uses these names.

| § | Block | Where exactly | URL |
|---|---|---|---|
| 5.1 | assets & custody | «الأصول والعهد» | `/assets` |
| 5.2 | the permission matrix | «الإعدادات» → **10** «المستخدمون والصلاحيات والأمان» → «الصلاحيات والأشخاص» | `/settings` |
| 5.3 | leave policy + workflow cards | «الإعدادات» → **4** «الإجازات والأرصدة» → «إلغاء وتعديل واسترجاع الإجازات» then «سير الطلبات: مسار الاعتماد والتصعيد» | `/settings` |
| 5.4 | the alerts card | «الإعدادات» → **9** «التنبيهات» | `/settings` |
| 5.5 | the employee's own actions | the app, «طلباتي»; the same data on HR's «الإجازات والطلبات» | `/leaves` |
| 5.6 | the evaluation form | «التقييم» → the employee → period **«سنوي»** + year 2026 (the picker starts on «ربع سنوي») | `/evaluation` |
| 5.7 | brand colours | «الإعدادات» → **1** «بيانات الشركة والهوية» → «ألوان الهوية» | `/settings` |
| 5.8 | employee 102's record | «الموظفون» → the row of **غدي … نفيسه** (`102`) | `/employees/102` |
| 5.9 | delete + temporary passwords | «الموظفون» → the 🗑 on a row; «سلة المهملات»; and in the employee form the button «الحسابات بكلمة مؤقتة» beside «حفظ» | `/employees`, `/recycle-bin` |
| 5.10 | the payroll cycle | «مسير الرواتب» | `/payroll` |
| 5.11 | the home pills, the photo | the app, «الرئيسية» | `localhost:8081` |
| 5.12 | «سيتبقى» in workdays, English strings | the app, «طلباتي» → the annual composer; the «EN» switch in the header | `localhost:8081` |
| 5.13 | the four data recipes | «المستهدفات»، «التقييم»، «الإجازات والطلبات»، «الإعدادات» → **4** | see the block |
| 19-2 | the audit row | «سجل التعديلات» | `/audit-log` |

The app's screens are the bottom dock's four pills — «الرئيسية»، «طلباتي»، «الراتب»، «المزيد» — and behind
«المزيد»: «الحضور»، «فريقي»، «أهدافي وتقييمي»، «عمل إضافي»، «المستندات»، «الموافقات»، «ملفي».

**Order.** The pass writes as it goes: §5.2 changes the matrix that guards everything else, §5.3/§5.4/§5.7 change
settings, §5.10 approves a month, §5.13 creates requests. Run the blocks in this order so whatever you return to
is one step behind, never half-changed.

| Step | What to run | Account | Why here | Time |
|---|---|---|---|---|
| 0 | start HR web: `cd design-port\frontend\hr-web; npm.cmd run dev` → **http://localhost:3000** | – | the backend (`:8040`) and the app (`:8081`) are already up (§1) | 2 min |
| 1 | §5.1 assets, §5.6's **15-1** (the empty form — writes nothing), §5.9's read parts (18-1, 18-4) | `EMP010`, then `EMP086` | read-only pages that also prove the role difference; §5.6's write lines wait for the recipes | 15 min |
| 2 | §5.2 the matrix — change nothing yet | `EMP010` | it must be screenshotted before §5.3–§5.7 touch settings | 10 min |
| 3 | §5.3 policy + workflow, §5.4 alerts, §5.7 brand colours | `EMP010` | the three settings screens; put back every value you change | 20 min |
| 4 | §5.8 employee 102 | `EMP010` | pure read | 10 min |
| 5 | §5.10 payroll — months **11 → 10 → 09** | `EMP010` | 19-3 approves 10/2026 and 19-6 reopens it; an approved month is read-only until then | 15 min |
| 6 | §5.5 and §5.11/§5.12 in the app | `EMP102` in the app, `EMP040` in HR web | one sign-in switch for the app | 25 min |
| 7 | §5.13's four recipes, then §5.6's write lines (15-2 … 15-5, then 15-6 in the app), then §5.2's write checks | as each block says | they create rows — last, so a failure cannot poison an earlier block | 25 min |
| 8 | re-run §6.4 | – | every number in §5 must still print the same | 2 min |

Rules for the pass:

- **one account per browser profile.** HR web keeps the session in `localStorage`, so a second login in the same
  window signs the first one out. Use a second Chrome profile (or a private window) for `EMP086`/`EMP040`.
- **screenshot on every ❌**, named after the line: `5.10_19-3_fail.png`. A ❌ is not closed by editing this doc —
  paste the number you saw next to the line and send it to me.
- **write nothing down from memory.** After any write, the authority is a fresh §6.4 run, not the screen.
- **the app is `localhost:8081`, never `127.0.0.1:8081`** (§1), and it is Expo **web** in CI mode: no hot reload,
  so a Metro restart is needed to see new code.

### 6.4 the read-only parity sweep that produced §5's numbers

Every number in §5 came from this script, one GET at a time, on 5 Nov 2026. It is **GET only** — it cannot
change the copy — and it is the answer to «is the data still what the doc says»: run it at the start of a pass,
after every §5.13 recipe, and at the end. Save it as `%TEMP%\sweep.py` and run it with the backend's interpreter:

```powershell
cd 'C:\Users\GhadyNafisah\Downloads\HR_ARIBA-main\HR_ARIBA-main\HR_ARIBA-main\backend'
.\.venv\Scripts\python.exe "$env:TEMP\sweep.py"
```

```python
"""Read-only parity sweep: prints every number section 5 of ACCEPTANCE_CHECKS.md quotes."""
import json, sys, urllib.error, urllib.request
sys.stdout.reconfigure(encoding="utf-8", errors="replace")   # Arabic in a cp1252 console
B, PWD = "http://127.0.0.1:8040/api/v1", "SmokeTest!2026"

def call(method, path, token=None, body=None):
    h, data = {"Accept": "application/json"}, None
    if body is not None:
        h["Content-Type"] = "application/json"; data = json.dumps(body).encode()
    if token:
        h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(B + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            raw = r.read().decode("utf-8", "replace")
            try: return r.status, json.loads(raw or "null")
            except ValueError: return r.status, "<%d bytes>" % len(raw)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try: return e.code, json.loads(raw)
        except ValueError: return e.code, raw[:200]

def login(user):
    return call("POST", "/auth/login", None, {"username": user, "password": PWD})[1]["access_token"]

T = {u: login(u) for u in ("EMP010", "EMP086", "EMP040", "EMP102")}

# (block, account, path, the keys worth printing) -- GET only
UNITS = [
    ("10 assets ", "EMP010", "/assets", ("can_edit",)),
    ("11 matrix ", "EMP010", "/permissions", ("roles", "full_roles", "modules", "levels", "capped", "can_edit")),
    ("11 ceo    ", "EMP086", "/permissions", ("can_edit",)),
    ("12 policy ", "EMP010", "/settings/leave-policy", None),
    ("12 workflw", "EMP010", "/settings/workflow", None),
    ("12 ledger ", "EMP010", "/leave/employees/102", ("summary", "accumulated_eos", "years")),
    ("12 undo   ", "EMP010", "/leave/employees/102/history", ("can_undo",)),
    ("12 queue  ", "EMP010", "/requests?status=pending", None),
    ("12 me 102 ", "EMP102", "/me/leave", ("annual", "current", "carry", "year_end")),
    ("12 me 040 ", "EMP040", "/me/leave", ("annual", "current", "carry", "year_end")),
    ("13 alerts ", "EMP010", "/settings/alerts", ("ready", "email_sending", "last_run", "cfg")),
    ("13 runlog ", "EMP010", "/alerts/status", ("ready", "last_run", "rows")),
    ("14 pol 102", "EMP102", "/me/leave-policy", None),
    ("14 pol 040", "EMP040", "/me/leave-policy", None),
    ("14 rows102", "EMP102", "/me/requests", None),
    ("14 rows040", "EMP040", "/me/requests", None),
    ("15 targets", "EMP010", "/targets?employee_id=102&year=2026", None),
    ("15 eval102", "EMP010", "/evaluations/102/annual/2026", ("evaluation", "can_write", "can_approve")),
    ("16 colours", "EMP010", "/settings/brand-colors", ("custom", "p", "s", "a")),
    ("17 rec 102", "EMP010", "/employees/102", ("salary", "national_address", "national_address_expiry",
                                               "gosi_no", "probation_days", "has_photo")),
    ("17 docs 102", "EMP010", "/employees/102/documents", None),
    ("17 deps 501", "EMP010", "/employees/102/dependents", None),
    ("18 bin    ", "EMP010", "/recycle-bin", ("counts", "total")),
    ("18 temp pw", "EMP010", "/accounts/temporary-password", None),
    ("19 sheets ", "EMP010", "/sheets", None),
    ("19 10/2026", "EMP010", "/payroll/status/pay_2026_10",
     ("status", "rows", "approved", "prepared_by_name", "prepare_note")),
    ("19 11/2026", "EMP010", "/payroll/status/pay_2026_11", ("status", "rows", "approved")),
    ("A1 holidays", "EMP010", "/holidays", None),
    ("A1 manager", "EMP086", "/me/manager-perms", ("is_manager", "team_count", "view_team", "view_team_leaves")),
    ("A1 dash   ", "EMP010", "/dashboard", ("tamheer", "pending_requests")),
    ("A1 counts ", "EMP010", "/employees/counts", ("all", "active", "tamheer")),
]

def show(tag, status, body, keys):
    if isinstance(body, dict) and "error" in body:
        body = body["error"].get("message")
    elif isinstance(body, dict) and keys:
        body = {k: body.get(k) for k in keys}
    elif isinstance(body, list):
        body = "%d rows" % len(body)
    print("%s  %s: %s" % (status, tag, json.dumps(body, ensure_ascii=False)[:260]))

for tag, who, path, keys in UNITS:
    status, body = call("GET", path, T[who])
    show(tag + " " + who + " " + path, status, body, keys)

# the answers a key list cannot shrink
st, a = call("GET", "/assets", T["EMP010"])
print("        assets: %d rows, %d people" % (len(a.get("assets") or []), len(a.get("people") or [])))
st, mx = call("GET", "/permissions", T["EMP010"])
hr = {k: v for k, v in ((mx.get("matrix") or {}).get("hr") or {}).items() if v == "edit"}
print("        hr column at edit: %d modules" % len(hr))
st, d = call("GET", "/dashboard", T["EMP010"])
print("        dashboard alerts: %d rows" % len(d.get("alerts") or []))
st, ar = call("GET", "/payroll-archive", T["EMP010"])
print("        archive: " + json.dumps(ar, ensure_ascii=False)[:200])
```

What the first run printed on 5 Nov 2026, in this order: 106 employees / 21 active / 0 tamheer, **17 of 19**
modules at `edit` for `hr` (and **0** for `ceo`, whose `can_edit` is false), `current` 5.27 and 5.78,
`ready: false` on both alert routes, 0 pending requests, 0 targets and `evaluation: null`, `#004d3d` /
`#f4f0e4`, a salary total of 2000.00 with GOSI 0.00, **501** on dependents, 62 rows in the bin, one temporary
password, six payroll months (10/2026 = 23 rows, 11/2026 = 0), four announced holidays, `team_count` 12 with
`view_team` false, 2 tamheer on the dashboard against 0 on the employees page (§9 note 8), 0 assets with 21
custody people, 12 dashboard alerts, and one archived month (08/2026, 29 employees, 315,413.29). A line that
prints differently is either a real regression or data you changed — decide which before touching §3 or §5.

## 7. Adding the next group's block

When a group ships, do three things: add its row to the index in §4, paste this block under a new `### 5.<n>`
heading (never a new `##`), and fill the numbers from the API **before** writing them down (never from memory).

```markdown
### 5.<n> <the group's name as the prompt names it> — shipped <date>

**What it changed.** <two or three lines, and the files/commits>.
**How to get there.** <account → screen → the exact buttons, in Arabic as they appear>
- [ ] **5.<n>-1** <step> → must show «…» with <measured number>.
- [ ] **5.<n>-2** <the edge case> → must show «…» (and what must NOT appear).
**Already proven without a screen:** <the tests/API probes and their results, with dates>.
```

Keep every line either ✅ (you saw it) or ❌ (with account + language + what you clicked + what you expected +
what happened). A line nobody has looked at stays `API-verified, screen pending` — that is information, not a gap.

## 8. Report back

For every ❌: **screen + language + account + what you clicked + what you expected + what happened** (a
screenshot for layout ones). Then the fix, a re-run of §6, and a commit with explicit paths after you see
`git diff --cached --name-only`.

## 9. Known and accepted today (5 Nov 2026 — not bugs)

1. **No announced holiday is left in 2026** (22 Feb, 20 Mar, 27 May, 23 Sep are all past), so
   `upcoming_holidays` is empty, the nearest-holiday pill is hidden and the holiday exclusion in the composer
   cannot be seen without the temporary-holiday probe (§5 A2-5b).
2. In **English** the nearest-holiday pill would read "Next public holiday: <Arabic holiday name> — <date>": the
   name comes from the database, it is not a UI key. Worth a decision if English should show a Latin name.
3. `EMP086`'s «فريقي» and «الموافقات» are empty — `view_team*` is off for that account in the copy and nothing is
   pending. Not an empty-state bug.
4. `EMP102` has **no manager**, so its requests reach the HR stage in one step (fine for testing the composer,
   wrong account for testing the manager stage — use `EMP002` + `EMP086`).
5. **No overtime request exists to look at** — the overtime tab is the employee's own list filtered to
   `type === "overtime"` (`app/(tabs)/overtime.tsx` line 22), and `EMP102`'s list is empty, so the third fixed
   English string («أُرسل {date}» → "Sent {date}") has no row to appear on until someone sends one.
6. **No employee in this copy has a photo** — `has_photo` is false on all 100 rows that
   `/employees?page_size=100` returns (the API caps a page at 100 of 106), so avatars are monograms everywhere.
   That is the data, not the screen.
7. The app on `:8081` is Metro **web** (no QR, no watch mode beyond Fast Refresh). For a phone, §4 of
   [LOCAL_TESTING.md](LOCAL_TESTING.md) — and the firewall rule for the LAN port is still blocked (follow-up #4).
8. **«تمهير» is 0 in one place and 2 in another, on purpose-less code.** `GET /employees/counts` hard-codes
   `"tamheer": 0` (`routers/canonical.py:520`), while `GET /dashboard` counts the active rows whose job title
   contains «تمهير» (`routers/canonical.py:1139`) — that is where the 2 comes from. Neither number is derived from
   the `category` field (`102` carries `wps_type: "tamheer"`, `category: "active"`), so a screen showing 0 on
   «الموظفون» and 2 on the dashboard is **not** a regression: it is two definitions. Decide which one is right
   before a block is written against either.
9. **`GET /employees/{id}/dependents` is a declared gap, not a wired tab.** The canonical schema has no dependents
   table, so the route answers **501** `feature_unavailable`
   «Dependents are not represented in the canonical schema» (`routers/canonical.py:745`, `:2578`). The tab must say so in Arabic; an empty table would be a lie. Same for
   the department/workplace catalogs (`:1051`, `:1056`).
10. **The payroll cycle's finance gate cannot be seen in this copy.** `before_approve`
    (`routers/payroll_status.py:90`) refuses a *finance* approval of an unprepared month, and the web page blocks
    the same button for `role === "finance"`; there is **no finance account** in the copy (§2), and `admin` /
    `chairman` may approve any month (`full_roles`). So §5.10's 19-4 is code-verified only — close it with a
    finance login when one exists.
11. **The expiry-alert tables are not in this database.** `GET /settings/alerts` and `GET /alerts/status`
    both report `ready: false` because `to_regclass('public.ariba_alert_log')` / `ariba_alert_daily` are
    null — migration **005** (`docs/db-migrations/005_expiry_alerts.sql`) was never applied to the copy. The
    card still saves its settings (`PUT` works, it writes `ariba_app_settings`), and the dashboard's
    «تنبيهات عاجلة» still lists 12 computed rows, but «شغّل الآن» can only answer **503**
    «جداول التنبيهات غير موجودة …» until that SQL runs. Running it is your call: it creates two tables and
    starts the daily bell pass (§5.4 13-3).
