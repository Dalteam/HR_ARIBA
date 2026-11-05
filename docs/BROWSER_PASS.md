# The browser pass — every screen line, in the order you click

`ACCEPTANCE_CHECKS.md` is written **by group** (one stage at a time). That is right for reading and wrong for
testing: it sends you back to «الإعدادات» eight times and across the sidebar four times. This file holds the same
screen lines — sections **§5.1 – §5.14** of `ACCEPTANCE_CHECKS.md` — **re-ordered by screen**, so the pass is:
open one page, tick everything that belongs to it, move on. Nothing new is claimed here: every line exists in
both files under the same id (`20-3`, `A2-1`, …) and has to be closed in both.

Three rules, unchanged from `ACCEPTANCE_CHECKS.md`:

1. **No guessed numbers.** Every figure was measured on the running stack (`127.0.0.1:8040`, copy `ariba_local`)
   on 4–5 Nov 2026. Where this file and a block disagree, the block's date wins and the line says so.
2. **A line closes only with your eye.** If the screen does something else, write what it did on the line
   instead of ticking it. An unticked line with a note is worth more than a wrong ✅.
3. **⌫ marks a write.** §D lists every ⌫ with its way back. The pass is not finished until §D is done.

## 0. Before you start

| Piece | URL | Running 5 Nov 2026 |
|---|---|---|
| Backend | **http://127.0.0.1:8040** (`/health` → `{"status":"ok"}`) | yes, pid 35024 |
| HR web (the pass's main app) | **http://localhost:3000** | yes, pid 43532 |
| Employee app as a web app | **http://localhost:8081** | yes, pid 44852 |

Open **`localhost`**, never `127.0.0.1`, on the two front ends: the backend's `CORS_ORIGINS` is
`http://localhost:3000`, `http://127.0.0.1:3000`, `http://localhost:8081`. (The two older Metro servers from 3 Nov —
`8090` and `8082` — were killed on 5 Nov 2026 and those ports are free; if something answers there now, it is a server
you started yourself, and it is not this stack.)

Password for **every** account: **`SmokeTest!2026`** (throw-away copy only; `tools/smoke/smoke_setup.py`).

| Login | Role | Employee | Where you need it |
|---|---|---|---|
| `EMP010` | admin | 10 | everything in §B (the settings matrix, the settings cards, the employee form) |
| `EMP040` | admin (HR approver) | 40 | §B4 (the HR leave actions on his own sick leave), §C (carry 5.07, the employee side of a request) |
| `EMP086` | ceo | 86 | §B2 18-1, §B8 11-2 (read-only), §C4 (the manager stage) |
| `EMP102` | employee, **no manager** | 102 | §C (carry 0, the composer's counting, his rejected request) |
| `EMP002` | employee, manager `EMP086` | 2 | §C4 (the pending request at the manager stage), §B8 20-7 |

Five minutes of arithmetic before the first click, because most lines are numbers: **106** employees (21 active),
`EMP102` current **5.27** / carry **0** / year-end **8.34** / annual **21**, `EMP040` carry **5.07**, six leave
requests (3 approved, 3 rejected, **none pending**), payroll **10/2026** = 23 rows in `draft`.

## A. Make the rows this copy is missing (do this first — 15 minutes)

Five blocks below cannot be seen without data, and the data is legitimate to create (§5.13 of
`ACCEPTANCE_CHECKS.md`). A-1 … A-3 happen in the employee app, A-4 in the HR web, A-5 is one row I insert for you;
all of it is put back at the end (§D).

- **A-1 a pending leave at the manager stage** → for 12-4, 14-1b, 14-3, 14-5.
  Employee app (`:8081`) → **`EMP002`** → «طلباتي» → the dock's **«+»** → group «إجازات» → **«عن بعد»**
  (not «سنوية»: `EMP002`'s current is **0**) → **15 → 19 Nov 2026** → «إرسال».
  It is `pending` at the **manager** stage and **`EMP086`** sees it in «الموافقات».
- **A-2 a pending leave at the HR stage** → for 12-5, and for the 5.27 → 7.27 figure.
  Employee app → **`EMP102`** (no manager, so it reaches HR in one step) → **«سنوية»** → **15 → 16 Nov 2026**
  (2 workdays ≤ 5.27) → «إرسال».
- **A-3 an overtime request** → for A1-3. Employee app → **`EMP102`** → «المزيد» (the dock carries six tabs;
  «عمل إضافي» sits behind «المزيد») → «عمل إضافي» → «التاريخ» **12/11/2026**,
  «عدد الساعات» **2**, «السبب / المهمة» anything → «⏱️ إرسال الطلب».
  Two things that are not defects: the row will **not** appear in «طلباتي» (that tab drops `type !== "overtime"`,
  `app/(tabs)/leaves.tsx:61`) — it appears in «عمل إضافي» with its type, status badge, reason, sent date and 🗑;
  and «عمل إضافي» is not on the dock at all, which is why the step above goes through «المزيد».
- **A-4 two targets for 102** → for 15-1b, 15-2 and 15-6. HR web → «المستهدفات» (`/targets`) → employee **102**, period
  **«سنوي»** + year **2026** (the picker defaults to «ربع سنوي»; a target saved in another period never seeds the
  annual evaluation) → «+ مستهدف جديد» → title + «الوزن (الأهمية)» → «حفظ» (toast «✓ حُفظ المستهدف وأُشعر
  الموظف»). Repeat for the second line. «الوزن» must be **0.1 or more** (`min="0.1"`; an empty box is saved as
  **1**), and «المستهدفات» opens on its own card «مستهدفات الموظفين» — the same page's other mode is «تقييم
  الموظفين», which is §B5's screen, not this one.
- **A-5 a temporary holiday on Tue 2026-11-17** → for A1-2 and A2-5b **only**. One row in
  `public.public_holidays`; ask me to insert and delete it while you watch — do not confuse it with a defect when
  the line stays hidden without it.

## B. HR web — `http://localhost:3000`, signed in as `EMP010`

### B1. «لوحة المعلومات» (`/dashboard`)

- [ ] **13-4 «⚠ تنبيهات عاجلة»** — **12** rows: 6 `contract`, 6 `iqama`; 3 «منتهي» in red, 2 red within 14
      days, 7 amber within 30 — each with the employee's name and «(N أيام)». It is **not** the «شغّل الآن» run
      of 13-3 that fills this card: these are computed at read time from the alerts settings.

### B2. «الموظفون» (`/employees` → open **102**)

- [ ] **18-1 the 🗑 is mine, not the ceo's** — as `EMP010` the 🗑 sits on every row; sign in as `EMP086` and it
      is **absent** (`employees_admin`: admin `edit`, ceo `view`).
- [ ] **17-1 the new fields are blank, not invented** — `national_address`, `national_address_expiry`,
      `gosi_no`, `probation_days` are empty and `has_photo` shows no photo. A value here would be a lie.
- [ ] **17-3 the salary strip is live, not saved** — 102 today: basic **2000.00**, housing/transport/other
      **0.00**, total **2000.00**, GOSI employee **0.00**, GOSI employer **0.00**, net **2000.00**,
      `gosi_system: matching`. Change the basic → total and net move **before** you press «حفظ».
- [ ] **17-2 they survive a save** ⌫ — fill certificate type, «تاريخ انتهاء العنوان الوطني» and the GOSI number
      → «حفظ» → reload → the three come back; «↺» on a changed field and «استرجاع الكل» undo them.
- [ ] **17-4 the document slots** — 102 has no document, so every slot is empty with its upload button; after one
      upload the row carries the file's name, size and date.
- [ ] **17-5 the dependents tab is honest** — it says, in Arabic, that dependents are not represented in the
      schema (**501** from `/employees/102/dependents`) — not a spinner, not an empty table pretending to work.
- [ ] **18-4 «الحسابات بكلمة مؤقتة»** — the small button beside «حفظ» opens «الحسابات بكلمة مرور مؤقتة» with
      exactly **one** row: `Admin`, role `admin`, since **07/10/2026**, and **no** password column.

### B3. «الأصول والعهد» (`/assets`)

- [ ] **10-1 the register today** — both tables show the design's empty text, nothing looks broken,
      `can_edit: true` as `EMP010`.
- [ ] **10-2 the ceo is read-only** — as `EMP086`: no add / give / return buttons at all.
- [ ] **10-3 give a custody** ⌫ — add one asset (kind, serial, date) and give it to `EMP040` → the row appears
      and the log gains a «تسليم» line with your name and the time.
- [ ] **10-4 take it back** ⌫ — return it → a second line «استلام», the row shows it is back, and the log keeps
      **both** lines (append-only, nothing overwritten).
- [ ] **10-5 it reaches the employee** — the employee form's custody tab (B2, employee 40) lists the same asset
      and says delivery/receipt happens here.

### B4. «الإجازات والطلبات» (`/leaves`)

- [ ] **12-6 HR's queue** — all **six** requests with their stage: **3 approved** (76 annual 29 Sep, 74 annual
      6 Oct, 40 sick 7→8 Oct) and **3 rejected** (10 annual 30 Sep→1 Oct twice, 102 annual 4→5 Oct with the
      refusal «test»), and **nothing pending** until you run A-1/A-2. That is the data, not a filter bug.
- [ ] **12-3 the balance editor and undo** — `EMP102`: current **5.27**, carry **0**, year-end **8.34**,
      annual **21**. «تراجع عن آخر حفظ» is **greyed** (no history yet); type a balance and save → it becomes live
      and restores the old value ⌫.
- [ ] **12-4 «إعادة لمديرك»** ⌫ — on A-1's pending row only: the note is mandatory; after it the employee reads
      «↩ أعادته الموارد البشرية لمديرك: <note>» in §C3.
- [ ] **12-5 HR cancel** ⌫ — on A-2's annual: the dialog warns that the days return to the balance; the row then
      reads «أُلغيت هذه الإجازة: <reason>» for the employee, and `EMP102`'s current rises **5.27 → 7.27**.

### B5. «التقييم» (`/evaluation` → employee **102** → period **«سنوي»**, year **2026**)

The period picker defaults to «ربع سنوي»: choose **«سنوي»** or the form describes a different period.

- [ ] **15-1 it opens empty, and that empty state is the thing to see** — with A-4 done it opens with the two
      seeded lines; **without** A-4 it shows «+ بند جديد» only and **both** buttons are disabled (an empty
      evaluation is not an evaluation, and the API refuses it in the same words).
- [ ] **15-2 two lines, saved as a draft** ⌫ — title + «الدرجة %» + «الوزن» each; «النتيجة» and its word
      («ممتاز» / «جيد جداً» / …) move as you type → «حفظ كمسودة» → toast «✓ حُفظ التقييم كمسودة» → reload → the
      lines come back with the badge «مسودة».
- [ ] **15-3 the numbers the API trusts** — weights do **not** have to total 100 (`overall = Σ(score·w)/Σw`), so
      a form that blocks the save for "weights ≠ 100" is wrong; what **is** refused: a blank title «عنوان البند
      مطلوب», a score outside 0–100 «درجة البند يجب أن تكون بين 0 و100», and no lines at all «التقييم يحتاج
      بنداً واحداً على الأقل».
- [ ] **15-4 HR's own save is the signature** ⌫ — «✓ اعتماد نهائي وإبلاغ الموظف» → modal «اعتماد التقييم» →
      «اعتماد» → toast «✅ اعتُمد التقييم وأُرسلت النتيجة للموظف», badge «معتمد», form gone, and a second save
      answers **409** «اعتُمد هذا التقييم نهائياً ولا يمكن تعديله».
- [ ] **15-5 the only separate signature is someone else's pending row** — not visible today: it needs an
      evaluation a manager submitted (no manager-submitted row exists in this copy).

### B6. «مسير الرواتب» (`/payroll` → month **10/2026**)

- [ ] **19-1 the state today** — «📝 مسودة» with «جهّز المسير ثم أرسله للمالية للاعتماد», `rows: 23`,
      `approved: false`.
- [ ] **19-2 prepare it** ⌫ — «📤 تجهيز للمالية» (disabled while the month has no rows) → «تجهيز المسير
      للمالية» → optional note → «تجهيز وإرسال» → the chip turns «📤 جاهز للاعتماد» with «جهّزه <your name> —
      <time> — <note> — بانتظار اعتماد المالية», the button becomes «إعادة التجهيز», and a reload keeps it.
- [ ] **19-3 approve** ⌫ — «اعتماد» → «اعتماد مسير الرواتب» («لن يمكن التعديل بعد الاعتماد (فتحه بسبب مسجّل
      فقط)») → chip «🔒 معتمد»; the archive today holds only **8/2026**: 29 employees, total 315,413.29, net
      **316,773.57**. 9/2026 is approved and has no archive row — that is the data.
- [ ] **19-6 reopen** ⌫ — on an approved month the strip shows «🔓 فتح المسير» → «فتح المسير بعد اعتماده» with a
      mandatory reason («5 حروف على الأقل»): after «فتح» the chip reads «🔓 مفتوح بعد الاعتماد» with name, time
      and «السبب: <reason>»; a 4-letter reason is refused (**422** «اكتب سبب فتح المسير (5 أحرف على الأقل)»).
- [ ] **19-5 an empty month** — 11/2026 has `rows: 0` → «تجهيز للمالية» is **disabled**, never a prepared empty
      month.
- [ ] **19-7 the other five months** — 09/2026 and 08/2026 read approved; 10 / 07 / 02 / 01 read draft; the six
      months' row counts are 37, 29, 23, 25, 22, 38. Each month shows its own chip and an approved month is
      read-only.
- [ ] **19-4 the finance rule** — **cannot be closed here** (see §E): it needs a `finance` login, and this copy
      has none.

### B7. «سلة المهملات» (`/recycle-bin`)

- [ ] **18-3 the whole loop** ⌫ — delete one expendable terminated employee from «الموظفون»: the dialog names
      them and says a full copy goes to the recycle bin; «الموظفون» goes **106 → 105** and the row is here (62
      items today: 57 `workflow_request`, 5 `other`, all `restorable: true`) → restore → back to **106**.

### B8. «الإعدادات» (`/settings`) — the five sections that changed

**§1 «بيانات الشركة والهوية» → «ألوان الهوية»**

- [ ] **16-1 the pair today** — primary **#004d3d**, secondary **#f4f0e4**, accent empty (`custom: true`).
- [ ] **16-2 a preset, then save** ⌫ — pick a preset → «حفظ» → toast → reload → pickers and API agree, and the
      sidebar/top bar use the primary.
- [ ] **16-3 a bad value is refused** — `red` or `#12345` is refused before saving; the API itself answers
      **422** «اللون p يجب أن يكون بصيغة #RRGGBB» and keeps the stored pair.
- [ ] **16-4 the note under the card** — it says the employee app follows the same pair: read it against what
      the app at `:8081` actually shows.

**§3 «الحضور والدوام» → the first card, «جدول الدوام»** (Stage 20 — as `EMP010`; without `settings: edit`
every box is greyed and «حفظ» is not drawn)

- [ ] **20-1 the card as it stands (nothing saved yet)** — switch «تفعيل حساب الحضور على الجدول» **off** with
      «غير مُفعّل: يبقى وقت بدء العمل وهامش التأخير من إعدادات الشركة (بطاقة إعدادات الشركة) كما هو.»;
      «الدوام الرسمي» **08:00 / 17:00 / 8 / 15**; «دوام رمضان» **09:00 / 15:00 / 6 / 15**; «تحديد رمضان
      تلقائيًا بالتقويم الهجري» **ticked** with both dates empty; the bottom strip reads «الجدول غير مُفعّل،
      فالحضور اليوم على إعدادات الشركة.» — **not** a shift line.
- [ ] **20-2 what a save is refused for (nothing is written)** — «النهاية» **07:00** → «official: وقت النهاية
      يجب أن يكون بعد البداية»; «عدد ساعات الدوام» **20** → «official.hours: يجب أن يكون بين 1 و 16»; «سماح
      التأخير» **200** → «official.grace: يجب أن يكون بين 0 و 120»; «من تاريخ» alone (18/02/2027) →
      «ramadan_from / ramadan_to: التاريخان معًا أو لا شيء». After each: reload shows the old values.
- [ ] **20-3 switching it on decides today** ⌫ — tick → «حفظ» → toast «✓ اتحفظ جدول الدوام» and the strip turns
      into «الدوام المُطبَّق اليوم **05/11/2026** — الدوام الرسمي 08:00 – 17:00 · 8 ساعة · سماح 15 دقيقة».
      **Then untick, save, and check the strip is back** — that is the switch doing its job (punches stored
      before it keep their own figures).
- [ ] **20-7 the role gate, screen half** — see §E: the 403 half is proven on the API, the greyed-boxes half
      needs an HR account without `settings: edit`, and this copy has none.

**§4 «الإجازات والأرصدة»** — three cards in this order: «سياسة الإجازات» → «دائرة الموافقات» → «ترحيل
الرصيد وطريقة الاستحقاق والاستحقاقات الخاصة»

- [ ] **12-1 the policy card «إلغاء وتعديل واسترجاع الإجازات»** — three switches on (`emp_edit_pending`,
      `emp_cancel_pending`, `emp_request_cancel_approved`), «السماح بالسحب على الرصيد» **off**; flipping one
      saves with the toast and survives a reload.
- [ ] **12-2 the workflow card «سير الطلبات: مسار الاعتماد والتصعيد»** — 3 days for the manager, 3 for the CEO,
      advance cap 100 %, 5 final-approval types; saving and reloading keeps them.
- [ ] **20-4 the leave-rules card as it stands** — «ترحيل ما تبقّى من الرصيد إلى السنة التالية» **ticked**,
      «حد الترحيل» **10** «يوم في السنة» with «ما زاد على 10 يومًا لا يُرحَّل، ويُدفع مع نهاية الخدمة كفائض
      إجازات.»; «طريقة احتساب الاستحقاق» = **«أيام العمل»** with its note; the three rows (استشاري / التمهير /
      متدرب) with every «إجازات» and «نهاية الخدمة» box unticked and **0 / 2 / 0** employees, then «ومن ليس من
      هذه الأنواع (0 موظفًا) تبقى له إجازاته وفائض نهاية الخدمة دائمًا.»
- [ ] **20-5 the two other methods are choices, not figures** — «تقويمي» and «شهري» change only the note under
      the box; nothing moves until a save. Leave it on **«أيام العمل»** unless you mean it (a saved «تقويمي»
      re-accrues every balance in the file; «شهري» gives 1/12 a month, the current month by its elapsed days).
- [ ] **20-6 a tick changes a ledger** ⌫ — tick «إجازات» on the **التمهير** row → «حفظ» → toast «✓ اتحفظت قواعد
      الإجازات»; «الإجازات والأرصدة» then shows **`EMP102`** (and the second Tamheer row, `XLS-6acee8708e51`)
      with annual **21** / current **5.27** / carry **0** / year end **8.34**, where they read **0 / 0 / 0 / 0**
      a moment before. **Untick, save, and confirm both are 0 / 0 / 0 / 0 again** (`/leave/balances`, 21 rows).

**§9 «التنبيهات»**

- [ ] **13-1 the seven kinds today** — `probation` **30**, `contract` **60**, `iqama` **60**, `passport` **90**,
      `insurance` **90**, `natAddr` **60**, `gosiCert` **60** days, all on; each notice 10 days ahead on
      «برنامج» + «تطبيق» + «بريد» to `hr`; the probation default **90**. The card shows the local names «انتهاء
      العنوان الوطني» / «انتهاء شهادة التأمينات الاجتماعية».
- [ ] **13-2 a change sticks** ⌫ — probation 30 → 45 → «حفظ» → reload → 45 in the card **and** in the API; put
      it back to **30**.
- [ ] **13-3 «شغّل الآن» cannot run in this copy — by design** — migration **005** (`ariba_alert_log`,
      `ariba_alert_daily`) is not applied, so the button must surface the API's **503** «جداول التنبيهات غير
      موجودة — شغّل docs/db-migrations/005_expiry_alerts.sql أولًا»: an Arabic message, never a silent no-op and
      never a fake «تم».
- [ ] **13-5 e-mail is off** — nothing on the card may claim an e-mail went out (the channel stays listed).

**§10 «المستخدمون والصلاحيات والأمان» → «الصلاحيات والأشخاص»** (past «كلمات المرور والأمان» and the public
application card)

- [ ] **11-1 the shape** — 19 modules (`staff`, `employees`, …, `assets`), levels `none` / `view` / `edit`, the
      `hr`, `admin_manager`, `finance`, `ceo` columns, `admin` + `chairman` as full roles outside the matrix,
      `capped: {"permissions": "view"}`; the ceo column is `edit` on **nothing**.
- [ ] **11-2 who may edit the matrix** — cells editable as `EMP010`, read-only as `EMP086`.
- [ ] **11-3 the hr column** — `edit` on **17** of the 19 modules, `view` on `payroll_approve` and `permissions`.
- [ ] **11-4 a cell bites** ⌫ — set `attendance` for `hr` to `none` → save → as `EMP040` «الحضور» leaves the
      sidebar and `/attendance` refuses → **put it back to `edit`**.
- [ ] **11-5 a 403 reads as a 403** — with a cell at `none`, the page says «ليست لديك صلاحية», not an empty
      table and not an endless spinner.

## C. Employee app — `http://localhost:8081`

### C1. «الرئيسية» as `EMP040`, then as `EMP102`

- [ ] **A1-1 the two pills** — under the leave tiles: as `EMP040` «مرحّل: **5.07** يوم», as `EMP102` «مرحّل: **0**
      يوم». The second pill is **absent** today and that is correct: it is the nearest *future* public holiday
      and no announced holiday is left in 2026 (A-5).
- [ ] **A1-4 the photo** — nobody has one, so the home, «ملفي» and «المزيد» heroes show the monogram. Upload one
      in B2, sign in as that employee → the photo replaces the letter on all three; sign in as `EMP102`
      afterwards → **no** leftover face (it is per session).

### C2. «طلباتي» and the composer as `EMP102`

The composer's first screen is «ماذا تريد أن تطلب؟»; the quick action «طلب إجازة» on the home opens it straight
on «سنوية».

- [ ] **A2-1 the counting itself** — «من تاريخ» **2026-11-12** (Thu) → «إلى تاريخ» **2026-11-15** (Sun): the
      yellow box reads, in this order, «المتاح لك **5.27**» · «المدة المحتسبة **2** يوم عمل» · «بدون الجمعة
      والسبت والإجازات الرسمية» · «سيتبقى **3.27**». Before A2 the same range said 4 days and «سيتبقى 1.27» —
      that difference is the whole stage.
- [ ] **A2-2 a weekend-only request** — **2026-11-13** → **2026-11-13** (Friday): «المدة المحتسبة **0** يوم عمل»
      and the rule line, and **no** «سيتبقى» line at all (it is hidden while the count is 0, so a request that
      costs nothing never announces an unchanged balance).
- [ ] **A2-3 both counts agree when no weekend is inside** — **2026-11-15 → 2026-11-19**: «المدة المحتسبة **5**
      يوم عمل» and «سيتبقى **0.27**».
- [ ] **A2-4 client and server agree on the stored row** ⌫ — send A2-3's range → «أُرسل طلبك»; the row in
      «طلباتي» reads **5** days, not 5.27 and not 8. `EMP102` has no manager, so it lands on the HR stage in one
      step.
- [ ] **A2-5 every other request type is untouched** ⌫ — «طلب جديد» → «عن بعد» or «بدون راتب» with the same
      12 → 15 Nov: **no** «المدة المحتسبة» box (annual leave only) and the stored row counts calendar days
      (**4**).
- [ ] **A2-5b the holiday exclusion** — optional, needs A-5: **2026-11-15 → 2026-11-18** must read «المدة
      المحتسبة **3** يوم عمل» and «سيتبقى **2.27**» (Sun 15, Mon 16, Tue 17 out, Wed 18), while **12 → 15 Nov**
      stays at **2** — the control, because the holiday sits outside that range.
- [ ] **A2-6 the English strings** — switch the app to English: the home reads **"Carried: 0 day(s)"** (not
      `{#}`), the composer reads "Counted: 2 working day(s)" and "Fridays, Saturdays and official holidays are
      not counted". The overtime row's «أُرسل …» → **"Sent …"** line is the request's `created_at`, the day you
      submitted it (`overtime.tsx:66`) — so after A-3 it reads the day you ran A-3, **not** A-3's «التاريخ»
      12/11/2026.
- [ ] **14-2 no buttons where they do not belong** — `EMP102`'s rejected row and `EMP010`'s two rejected rows show
      «سبب الرفض: test» and **no** action button; 🗑 appears only on rows that are not approved.
- [ ] **14-3 the pending pair** ⌫ — «تعديل التواريخ» / «إلغاء الطلب» exist only on a `pending` leave (A-1/A-2):
      change 15 → 19 Nov into 15 → 16 Nov and the stored row must count **2** workdays with «سيتبقى» recomputed
      before saving.

### C3. «طلباتي» as `EMP040` — the actions on his own leaves

- [ ] **14-1 the one action visible today** ⌫ — `EMP040`'s approved sick leave (7 → 8 Oct) carries «طلب إلغاء
      الإجازة» (the policy has `emp_request_cancel_approved: true`) → confirm → the row reads «طلب إلغاء هذه
      الإجازة قيد الاعتماد» and the button **disappears**.
- [ ] **12-4's employee side** — after HR returned A-1's request, `EMP002` reads «↩ أعادته الموارد البشرية
      لمديرك: <note>».
- [ ] **12-5's employee side** — after HR cancelled A-2's request, `EMP102` reads «أُلغيت هذه الإجازة: <reason>»
      with no actions left (that is **14-5**), and his current is **7.27**.

> **14-4 (the same three labels on the web `/me/leaves`) is closed by removal, not by a click:** the web copy of
> the employee app was retired — see the note on §5.5 in `ACCEPTANCE_CHECKS.md`. The employee app above is the
> one place those actions live now.

### C4. «الموافقات» as `EMP086` — the manager stage

- [ ] **A-1 seen by the manager** — `EMP002`'s «عن بعد» request (15 → 19 Nov) is listed with the requester and
      the range; approving it here is what closes the manager stage, so approve it **after** 12-4/12-5, which
      need it still pending.

### C5. «عمل إضافي» as `EMP102`

- [ ] **A1-3 the overtime line** — before A-3 the tab shows its empty state (correct: no overtime row exists).
      After A-3 the row carries the type, the status badge, the reason, the sent date and 🗑 while it is not
      approved — and it must **not** appear in «طلباتي», which filters overtime out.

### C6. «أهدافي وتقييمي» as `EMP102`

- [ ] **15-6 the employee's side** — after A-4 and 15-4, the two targets and the approved evaluation appear
      read-only, with the same scores HR saw.

## D. Every ⌫ you made, and the way back

| Line | What you wrote | The way back |
|---|---|---|
| 20-3 | the schedule switch on | untick → «حفظ»; the strip must read «الجدول غير مُفعّل…» again |
| 20-6 | «إجازات» on the التمهير row | untick → «حفظ»; `EMP102` back to 0 / 0 / 0 / 0 |
| 13-2 | probation lead 45 | set **30** → «حفظ» |
| 11-4 | `attendance` for `hr` = `none` | back to **`edit`** → save (do this **last**, after B8) |
| 16-2 | a new brand pair | set **#004d3d** / **#f4f0e4** again (or the preset you started from) |
| 17-2 | certificate / address expiry / GOSI | «↺» per field or «استرجاع الكل», then «حفظ» |
| 12-3 | a hand-typed balance | «تراجع عن آخر حفظ» restores the previous value |
| 10-3 / 10-4 | an asset and its custody | the return (10-4) closes the custody; the asset row may stay |
| 18-3 | one employee deleted | restore it from «سلة المهملات» → 106 again |
| 19-2 / 19-3 / 19-6 | a month prepared / approved / reopened | «فتح المسير» with a ≥5-letter reason is the only way back — **expect 10/2026 to stay approved** |
| 15-2 / 15-4 | an evaluation drafted / approved | an approved one is final (409 on a second save); a draft can simply stay |
| 12-5 | a request cancelled | nothing to undo: the days are back in the balance and the row keeps its reason |
| A-1 / A-2 | the two pending leaves | cancel them in «الإجازات والطلبات» (HR) with a reason — the days go back to the balance by themselves |
| A-3 | the overtime request | 🗑 on its row in «عمل إضافي» (the app's own delete asks «هل تريد حذف طلب العمل الإضافي؟») |
| A-4 | two targets for 102 | «حذف المستهدف» in «المستهدفات» (`/targets`) — or leave them: §B5 is the only screen that reads them |

## E. Lines that cannot be closed from your chair (and why)

- **19-4** — needs a **`finance`** login, and this copy has none. Code-verified only: the button is blocked for
  `finance` until the month is prepared, and the API answers **409** `payroll_not_prepared`.
- **20-7 (screen half)** — needs an HR account **without** `settings: edit`; none exists here. The API half is
  proven (`EMP002` → **403** on both settings routes).
- **13-3** — the run cannot work until migration **005** is applied; the line is "an Arabic 503 must appear",
  not "a run must succeed".
- **15-5** — needs an evaluation a manager submitted; no such row exists.
- **A1-2 / A2-5b / A1-1's second pill** — need the temporary holiday row (A-5).
- **A2-6's "Sent …"** — needs the overtime row (A-3) to exist at all; the date it prints is the row's `created_at`,
  i.e. the day you ran A-3, not A-3's «التاريخ».


## F. Sign-off

| Part | Who | Date | Result |
|---|---|---|---|
| A — the missing rows | | | |
| B — HR web (B1–B8) | | | |
| C — employee app (C1–C6) | | | |
| D — every ⌫ put back | | | |

When a line is closed here, close it in `ACCEPTANCE_CHECKS.md` too: `- [ ]` → `- [x]` on the same id, and flip
that file's index row (§4) for the stage from `API-verified, screen pending` to the date you closed it.
