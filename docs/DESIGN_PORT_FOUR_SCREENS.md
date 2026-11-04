# The four pages that still said «لم تُبنَ» — built (Stage 9)

**Status: built on 04/11/2026.** This file began as analysis only; §0 now records what shipped, and §1–§10
remain the reference (the design's own functions, the schema drift, the permission map). The screens and
routes are in the backend on `backend-new-ui` and in the `design-port` worktree's `frontend/hr-web`:

| Screen | Routes | Screen | Client library |
| --- | --- | --- | --- |
| سجل التعديلات `/audit-log` | `GET /audit-log`, `/audit-log/modules`, `GET/POST /audit-log/purge`, `POST /audit-log/purge/{id}/decide` | `app/(hr)/(portal)/audit-log/page.tsx` | `src/lib/audit.ts` |
| سلة المهملات `/recycle-bin` | `GET /recycle-bin`, `POST /recycle-bin/{id}/restore`, `POST /recycle-bin/purge` | `app/(hr)/(portal)/recycle-bin/page.tsx` | `src/lib/bin.ts` |
| المرشحون `/candidates` | 13 routes under `/candidates/*` (list, one, file, accept, reject, invites ×3, apply-mode, apply-key, medical-form, notify-list) | `app/(hr)/(portal)/candidates/page.tsx` | `src/lib/candidates.ts` |
| صفحة التقديم `/apply` | 5 token-free routes under `/public/apply/*` | `app/(apply)/apply/page.tsx` (its own root layout) | `src/lib/apply.ts` |
| بطاقات العمل `/business-cards` | `GET/PUT /bizcards`, `PUT /bizcards/{employee_id}`, `GET /me/bizcard` | `app/(hr)/(portal)/business-cards/page.tsx` | `src/lib/bizcards.ts` + `src/lib/bizcard.ts` |

Server modules: `backend/app/routers/{audit_log,recycle_bin,candidates,apply,bizcards}.py`, mounted in
`main.py`. One migration: **`docs/db-migrations/004_four_screens.sql`** (creates `ariba_bizcards`, renames
`ariba_candidate_files.file_type` → `doc_type`, gives `ariba_candidates.ref_token` and
`ariba_candidate_invites.token` their defaults, seeds the three `apply_*` flags, adds five indexes; additive,
idempotent). Tests: `backend/tests_canonical/test_four_screens.py` (62 pass without a database, 6 more with
`CANONICAL_TEST_DATABASE_URL`).

## §0. Where the port differs from the design, and why

1. **Generated columns in this copy.** `workflow_requests.status`, `ariba_documents.file_size`,
   `ariba_candidate_files.file_size` and `ariba_candidates.email` are `GENERATED ALWAYS` here (the design's
   database stores them). The restore path therefore writes only the non-generated columns (the status is
   recomputed from `current_stage`, which *is* restored), and the submit path lets the database derive the
   e-mail from `data->>'email'`.
2. **`doc_type` vs `file_type`.** Migration 004 renames the column to the design's name; the routes also read
   either name at runtime (one `information_schema` lookup, cached), so an unmigrated database still works.
3. **A moved candidate file becomes a `document_types` code** (`photo`, `cv`, `id`, …), never the design's
   Arabic label: this schema has `doc_type_fk` on `ariba_documents.document_type`.
4. **The apply switch lives in `ariba_security_flags`** (`apply_invite_only`, `apply_invite_hours`,
   `apply_form_key`) — that is where the design's own `ariba_flag()` reads them. This copy stores `'true'` /
   `'false'` where the design stores `'1'` / `'0'`, so both spellings are read as booleans.
5. **The purge deletes nothing.** Approving records the decision; the design's own note says «المسح الفعلي
   بتنفذه المالية يدويًا», and that is what the API does.
6. **Business cards: the drag-and-resize element editor is not ported.** The screen has the kind switch, the
   three templates per kind, the colours, paper, field toggles, company website/phone/address, the live
   preview (front and back), PNG, PDF, `.vcf` and the A4 sheet, plus per-employee overrides. The API stores the
   whole design object, so the editor can be added later without a schema change.
7. **QR without a new dependency:** `qrcode-generator` (MIT, Kazuhiko Arase) is vendored at
   `src/lib/vendor/qrcode.js` with a typed wrapper — copied from the design's own `node_modules`, so no
   package was added and nothing is fetched at export time.

**The four pages are now `ready` in `src/lib/features.ts`;** `sectionAudit` (the per-section «آخر التعديلات»
strip), `candidateAuto` (registering an applicant automatically) and `empDelete` (a `DELETE /employees/{id}`
that archives to the bin) still name their own gaps.

## §0b. The one routing bug this stage had to fix

`src/proxy.ts` redirected **every** path without a session to `/login`, the public application form included —
so `/apply?k=…` answered with the HR login page (found by opening the link with the dev servers running,
4 Nov 2026). `src/lib/routes.ts` now exports `PUBLIC_APPLY` and `isPublicApply()`, and the proxy returns
`NextResponse.next()` for it before the session check. `/audit-log` and the rest still redirect to
`/login?next=…`. Nothing else about the gate changed: the backend still treats `/public/apply/*` as the only
token-free surface besides `/public/brand` and the login.

The four pages are `/audit-log`, `/recycle-bin`, `/candidates`, `/business-cards`. In hr-web each is a
`PendingScreen` (`src/app/(hr)/(portal)/<page>/page.tsx`) and each waits on a `FEATURES` entry in
`src/lib/features.ts` (`audit`, `bin`, `cand`, `bizc`). So the work is: **backend route + ported screen
+ one word in `features.ts`.**

## Verdict in one table

| Screen | Tables / columns | Rows in this copy | Routes today | What is really missing |
| --- | --- | --- | --- | --- |
| سجل التعديلات `/audit-log` | `ariba_audit_log`, `ariba_audit_purge_requests` — both present and identical to the source | **473** audit rows (13 modules, 05/10→01/11/2026, 395 with `details`); 0 purge requests | **none** | 4 routes (list + purge info/request/decide). Data and rules are already known — this is the cheapest of the four |
| سلة المهملات `/recycle-bin` | `ariba_deleted_items` — identical to the source (`kind, ref_id, employee_id, snapshot, deleted_by, deleted_by_role, deleted_at`) | **62** snapshots (57 `workflow_request`, 3 `auth_account_duplicate`, 1 `attendance_duplicate`, 1 `document`) | **none** | list + restore + purge routes. Restore for `workflow_request`/`document` is a straight re-insert from the snapshot; `employee`/`hr_leave` kinds have **no rows here** (nothing to test them on, and no `hr_delete_employee` route yet) |
| المرشحون `/candidates` (+ the public application form) | 3 tables exist (`ariba_candidates`, `_candidate_files`, `_candidate_invites`) but **drifted** (see §6) | **0** — nothing at all | **none** (and no public apply endpoints) | the biggest one: ~13 HR routes + 4 public routes + the public form page itself. Every piece of logic is written in the design's `sql/11,20,29` and in `schema.sql` |
| بطاقات العمل `/business-cards` | **`ariba_bizcards` does not exist**; `ariba_app_settings` has none of `bizcard_cfg` / `bizcard_design` | 106 employees, **0 with a photo**; `company_logo`, `brand_colors`, `company_names` present | `/employees` + `/employees/{id}` already return name, title, department, workplace, mobile, e-mail | 1 table + 3 routes (company design, per-employee override map) + two client libs to port (`bizcardHtml`, `vcard`) |

**Short answer:** the *data* is there for the audit log and the recycle bin (real rows), the *schema* is
there for the candidates, and nothing at all is there for business cards. The *backend* is missing for
all four — not one of the API's 120 routes matches any of them (checked by importing `app.main` and
grepping the route table for `audit`, `bin`, `candidat`, `invite`, `apply`, `bizcard`: zero hits).

## 1. Where the reference lives

| What | Where |
| --- | --- |
| The four pages | `…\ARIBA_HR_React\src\pages\{audit,bin,candidates,bizcards}\` (audit 9.2 KB + PurgeBox + SectionAudit, bin 8.2 KB, candidates 16.5 KB + Invites + MedCard, bizcards 29.3 KB) |
| The public form | `…\ARIBA_HR_React\src\apply\ApplyApp.jsx` (18 KB) behind `apply.html` (a second Vite entry) |
| Client helpers to port | `src\lib\audit.js`, `src\lib\candidates.js`, `src\lib\bizcardHtml.js` (14 KB), `src\lib\vcard.js` (3.7 KB) |
| The design's own SQL | `sql\11_phase5_candidates.sql` (candidates, accept, key rotate), `sql\20_candidate_invites.sql` (invites, mode, public submit), `sql\27_recycle_bin.sql` (bin list/restore/purge), `sql\29_candidates_medical_notify.sql` (medical form, notify list), `sql\34_bizcard_for_employee.sql` (`ariba_get_bizcard`), `sql\35_bizcards_per_employee.sql` (`ariba_bizcards`, list/set) |
| **One file with every function** | `…\HR_ARIBA-main\schema.sql` (0.44 MB): all 26 reference functions as plain `CREATE FUNCTION` text, including the four audit functions that are not in `sql\` (they came from an earlier migration) |

`ariba_audit_list`, `ariba_audit_purge_info/request/decide`, `ariba_bin_list/restore/purge`,
`ariba_hr_candidates*`, `ariba_hr_invite*`, `ariba_hr_apply_*`, `ariba_hr_medical_form_*`,
`ariba_hr_bizcards/set_bizcard/get_bizcard`, `ariba_candidate_submit*`, `ariba_candidate_invite_check`,
`ariba_candidate_medical_form` — each body is a ready-made specification: filters, limits, error codes,
which settings key it reads, which rows it writes.

## 2. سجل التعديلات (`/audit-log`) — route only, data is real

**The screen** (`pages\audit\index.jsx`): five filters (module, user, from, to, free search) + refresh,
print and Excel; a table of time / user (name + account + role) / module chip / action / summary with the
`details.changes` list rendered as «old ← new»; a counter «عدد التعديلات: N — معروض آخر 300»; and the
`PurgeBox` under the table. `SectionAudit` is the same table reused elsewhere (a «سجل القسم» modal), and
`lib\audit.js` also batches client-side entries — in our port the server writes them, so only the read
side is needed.

**What the reference read does** (`ariba_audit_list(p_token, p_filters)`):
`filters = {modules[], module, actor, q, from, to, limit, offset}`; `limit` clamped to 1…1000 with
`300` default; ordered `at desc, id desc`; answers `{ok, total, rows[]}`; `q` searches
`summary / entity_name / action / actor_name` with `ILIKE`; **`finance` may only see
`payroll, insurance, settlement, eos`** (any other module filter is intersected away, and with nothing left
it sees nothing). Permission: `ariba_can(role,'audit','view')` → `hr` edit, `ceo` view, `finance` edit,
`admin_manager` view, `admin`/`chairman` always.

**What the copy has:** `ariba_audit_log` with exactly the source columns (`id, at, actor_employee_id,
actor_username, actor_name, actor_role, module, action, entity_type, entity_id, entity_name, summary,
details`) and **473 real rows**: employees 288, settings 51, security 24, locations 18, requests 11,
auth 11, workflow 10, payroll 7, attendance 5, documents 4, letters 3, accounts 3, leaves 2 — 6 actors
(`EMP010` admin 278, `EMP040` admin 144, `EMP002` 7, `EMP086` ceo 3, `EMP015` finance 2, `EMP102` 2, one
anonymous) over 05/10/2026 → 01/11/2026. Our own routes already write to it (`_write_audit`, 395 rows
carry `details`). `ariba_audit_purge_requests` exists (id, month, requested_by, requester_name,
requester_role, status, created_at, decided_by, decided_name, decided_at, deleted_count) and is empty.

**The purge box** (`PurgeBox.jsx`) is a small two-role workflow, fully specified in `schema.sql`:
`info` answers `{is_finance, months:[{month,count}], requests[]}` where a month is eligible only when it
ended more than 30 days ago (`ariba_audit_month_eligible`, checked: `2026-09` → true, `2026-10` and
`2026-11` → false); any audit viewer may `request` a month — it creates a `pending` row and notifies every
active `finance` account (2 in this copy) — and **only `finance` may `decide`**; approving only records the
decision («المسح الفعلي بتنفذه المالية يدويًا»), nothing is deleted.

**Needed:** `GET /audit-log` (filters above), `GET /audit-log/purge`,
`POST /audit-log/purge {month}`, `POST /audit-log/purge/{id}/decide {approve}`. Two details to keep:
`ariba_audit_month_eligible` can be ported as-is (it needs no session), and the finance module lock must be
kept in the list route, or Saudi payroll rows leak to finance.

**Effort:** half a stage. No migration, no new table, no new data.

## 3. سلة المهملات (`/recycle-bin`) — route only (the two "empty tab" kinds also need a delete first)

**The screen** (`pages\bin\index.jsx`): four category buttons with counts — `employee`, `workflow_request`,
`hr_leave`, `other` (`catOf()` maps every other `kind` to `other`) — plus search; a table of item / employee
/ details / deleted-at / by / restore-button, where `restorable === false` shows «للأرشفة فقط»; multi-select
with «حذف نهائي» and a «حسب الفترة» year+month permanent delete behind a confirm.

**What the reference does** (`ariba_bin_list`): answers an **array** (not `{rows}`) of
`{id, kind, ref_id, employee_id, deleted_at, deleted_by, deleted_by_role, emp_name, title, detail,
restorable}` ordered `deleted_at desc`; `emp_name` falls back to `snapshot->'employee'->>'name_ar'` then the
id; `title` per kind (`employee` name, `workflow_request` payload title or request_type, `hr_leave` type +
from → to, else the kind); `detail` = counts for `employee`, `request.status` otherwise; `restorable` only
for `employee | workflow_request | hr_leave` (so **our `document` row will read «للأرشيف فقط»**, which is
right for us too unless we add a restore for it). Permission: `employees_admin:edit` or role `hr`/`admin`.
`ariba_bin_restore` refuses with `EMPLOYEE_EXISTS` / `EMPLOYEE_MISSING` / `REQUEST_EXISTS` — the screen
already maps those three to Arabic messages. `ariba_bin_purge` takes `p_ids uuid[]`, or `p_before
timestamptz` + `p_kind` for the period delete, and answers `{purged:n}`.

**What the copy has:** `ariba_deleted_items` with the source columns, **62 rows**: `workflow_request` 57,
`auth_account_duplicate` 3, `attendance_duplicate` 1, `document` 1 — all written by our own delete routes,
all with `employee_id` set and a full JSON snapshot (`{"request":{...},"leave":[]}` or `{"id","file_name",
"mime_type","file_data_base64"}`), `deleted_by` as a numeric employee id (e.g. `40`), never a name — so
`emp_name` needs the `employee_directory` join the reference does. No `employee` or `hr_leave` rows exist,
so two of the four tabs will be empty here; the employee tab only becomes testable once the delete-employee
stage exists (`ariba_hr_delete_employee` is installed in the DB, but no FastAPI route calls it).

**Needed:** `GET /recycle-bin`, `POST /recycle-bin/{id}/restore`, `POST /recycle-bin/purge
{ids|before+kind}`. Restore must re-insert from the snapshot (`workflow_request` → `workflow_requests` +
its `leave` rows; `document` → `ariba_documents`), which is exactly what the reference body does, and it must
go through the same audit write our other routes use.

**Effort:** half a stage for the three routes; the `employee` restore is part of the delete-employee stage.

## 4. المرشحون (`/candidates`) — schema yes, logic no, data none

**The screen** is three tabs in one page (`pages\candidates\index.jsx`, 16.5 KB):
*المرشحون* (counters + status filter + search, table of name / position / contact / source / date /
status chip, and per-row «عرض» drawer with the submitted data and the uploaded files, «قبول» which asks for
the new `employee_id` + optional note and then calls accept, «رفض» with a **required** note);
*الدعوات* (`Invites.jsx`: the «الاستمارة مفتوحة للجميع» switch + link lifetime in hours, the public URL with
a copy button, «تغيير الرابط» = key rotate, an invite creator (label + hours), and a table of invites with
their state — مفتوح / مستخدم / منتهي / ملغى — each with copy and revoke);
*النموذج الطبي* (`MedCard.jsx`: upload the medical form (PDF or image) that candidates download, show/remove
the current one, and pick which employees get notified about every new candidate).

**The reference functions** (exact signatures, from `schema.sql`):

| Function | Used by | Notes |
| --- | --- | --- |
| `ariba_hr_candidates(p_token, p_status text)` | tab 1 | returns `{ok, counts{new,accepted,rejected}, rows[]}`; each row is `ariba_cand_json()` + `files[]` |
| `ariba_hr_candidate_by_ref(p_token, p_ref)` | drawer | one candidate by `ref_token` |
| `ariba_hr_candidate_file(p_token, p_file_id)` | drawer / download | returns `{file_name, mime_type, file_data_base64}` |
| `ariba_hr_candidate_accept(p_token, p_candidate_id, p_employee_id, p_note)` | «قبول» | writes `employee_directory` + creates the login row; errors `EMPLOYEE_ID_EXISTS`, `BAD_STATUS` |
| `ariba_hr_candidate_reject(p_token, p_candidate_id, p_note)` | «رفض» | note is mandatory in the UI |
| `ariba_hr_invites(p_token)` / `ariba_hr_invite_create(p_token, p_label, p_hours)` / `ariba_hr_invite_revoke(p_token, p_invite)` | tab 2 | |
| `ariba_hr_apply_mode_set(p_token, p_invite_only, p_hours)` | tab 2 switch | persists `apply_mode` |
| `ariba_hr_apply_key_rotate(p_token)` | «تغيير الرابط» | rotates `apply_form_key`, returns the new public URL |
| `ariba_hr_medical_form_get(p_token)` / `ariba_hr_medical_form_set(p_token, p_name, p_mime, p_base64)` | tab 3 | the file lives in settings key `medical_form` |
| `ariba_hr_candidate_notify_set(p_token, p_ids text[])` | tab 3 | settings key `candidate_notify` |
| `ariba_candidate_invite_check(p_invite)` / `ariba_candidate_submit_invite(...)` / `ariba_candidate_submit(p_form_key, ...)` / `ariba_candidate_medical_form(p_form_key, p_invite)` / `ariba_notify_candidate(title, body)` | **the public form** | these five have no session: they *are* the anonymous side and must become the only unauthenticated routes in our API |

**What the copy has:** the three tables exist but **all are empty (0 / 0 / 0)**, and there are no settings
keys at all (`apply_mode`, `apply_form_key`, `candidate_auto`, `candidate_notify`, `medical_form` are all
absent — `ariba_flag('apply_form_key')` answers NULL), and no public form page: hr-web has **no** second
entry point like the design's `apply.html`. So this stage is: migrate the drift (§6), port the logic,
build the public page, and seed 3–5 demo candidates + 1 invite to test with.

**Needed:** the 13 HR routes above under `/candidates/*`, the 5 public ones under `/public/apply/*`, and a
`/apply` page in hr-web (outside the `(hr)` group, no session).

**Effort:** the largest of the four — roughly 2–3 stages, half of it the public form.

## 5. بطاقات العمل (`/business-cards`) — nothing exists yet, but the inputs are all there

**The screen** (`pages\bizcards\index.jsx`, 29.3 KB) is a generator, not a table: a company-level design
panel (colours, logo, which fields to show), an employee picker with search, a live card preview, then
export as PNG (`html2canvas`), PDF (`jspdf`), `.vcf` (`lib\vcard.js`) or an A4 sheet of many cards
(`window.print`, `lib\print.js`). Per-employee tweaks are saved as a `design` JSON override, and the
company defaults live in settings (`bizcard_cfg`, `bizcard_design`).

**The reference functions:** `ariba_hr_bizcards(p_token)` → `{design, overrides{employee_id: design},
employees[]}`; `ariba_hr_set_bizcard(p_token, p_employee, p_design)`; `ariba_get_bizcard(p_token)` → the
logged-in employee's own card (the «بطاقتي» entry point).

**What the copy has:** *`ariba_bizcards` does not exist* (the design's shape: `employee_id, design,
updated_at, updated_by`), `bizcard_cfg` / `bizcard_design` are absent from `ariba_app_settings`, and no
route touches cards. What it *does* have is the input data, complete for cards: 106 employees, all with
`job_title_id`, `department_id`, `name_en`, `employer_id` and `data.jobTitle`, 102 with `data.email`,
99 with `data.mobile`, 101 with `dob`, 100 with `join_date`, 24 with `manager_id`. Company-level:
`company_logo` (image + mime), `brand_colors`, `company_names` are already settings and already served by
`GET /brand`.
**No employee photos exist anywhere** (0 of 106 have `photoUrl`), so the card must look right with a
monogram — worth checking the design's own no-photo path before building.

**Needed:** one migration (the table), two settings keys, three routes (`GET /bizcards`,
`PUT /bizcards/{employee_id}`, `GET /me/bizcard`), and the port of `bizcardHtml.js` + `vcard.js` as a
client module. All rendering stays in the browser, as in the design.

**Effort:** ~1–1.5 stages, most of it the card template and the export paths.

## 6. Schema drift to settle before the stages

Found by comparing `schema.sql` (the design's own dump) with this copy's `ariba_local`:

| # | Item | Design | This copy | What to do |
| --- | --- | --- | --- | --- |
| 1 | `ariba_candidate_files` column name | `doc_type text NOT NULL`, `file_size integer NOT NULL` | `file_type`, `file_size` nullable | both tables are empty, so rename to `doc_type` (keeps the ported logic word-for-word). If you prefer `file_type`, rename inside the ported functions instead — but pick one now |
| 2 | `ariba_candidates.ref_token` | `DEFAULT substr(replace(gen_random_uuid()…),1,24)` | **no default** | the submit route must generate it (24 hex chars) or add the default in a migration |
| 3 | `ariba_candidates` extra columns | — | `source`, `email`, `ip` (this copy added them) | harmless; keep them and fill `source` (`public` / `invite`) — the screen shows a «المصدر» column |
| 4 | `ariba_bizcards` | `employee_id, design, updated_at, updated_by` | **table absent** | add it in the bizcards stage only |
| 5 | `workflow_notifications` | the purge-request function inserts `is_read` | this copy has `read_at` (no `is_read`) | port the insert with `read_at`/`created_at`, matching `/me/notifications` |
| 6 | settings keys | `apply_mode`, `apply_form_key`, `candidate_auto`, `candidate_notify`, `medical_form`, `bizcard_cfg`, `bizcard_design` | **none of the seven exist** (the 12 present keys are app_links, brand_colors, company_logo, company_names, doc_sign_cfg, hr_signer, ins_settings, leave_carry, letterhead, notify_email_since, punch_watermark, workflow_config) | routes must create them on first write (`INSERT … ON CONFLICT (key)`) like `/settings` already does |

## 7. Permissions — what the design checks, and what this copy should check

The design asks the database: `ariba_can(role, module, level)`, fed by `ariba_role_perms`. This copy has
that table (populated) and the function is installed and callable (`select ariba_can('hr','audit','view')`
→ true) — but **no FastAPI route uses it**; the routers use static role sets
(`HR_ROLES = {hr, admin, admin_manager}`, `HR_READ_ROLES` + `ceo`, `PAYROLL_ROLES` + `finance`).

| Screen | Design check | Rows in `ariba_role_perms` | Suggested check in our router |
| --- | --- | --- | --- |
| `/audit-log` list | `audit:view` | hr edit, finance edit, ceo view, admin_manager view | `_require(actor, "hr", "admin", "admin_manager", "ceo", "finance")` + the finance module lock |
| purge request | `audit:view` (any viewer may ask) | same | same set |
| purge decide | hard-coded `role='finance'` | — | `_require(actor, "finance")` |
| `/recycle-bin` | `employees_admin:edit` | hr edit, admin_manager edit, ceo view, finance none | `_require(actor, "hr", "admin", "admin_manager")` |
| `/candidates` | `employees:view` to read, `employees:edit` to accept/reject/invite | hr edit, admin_manager edit, ceo view, finance view | read `HR_READ_ROLES`, write `HR_ROLES` |
| `/business-cards` | `employees:view` to print, `employees:edit` to save a design | same as candidates | read `HR_READ_ROLES`, write `HR_ROLES` |

`admin` and `chairman` are absent from the matrix because `ariba_can` always returns true for them.

## 8. Why the installed database functions cannot simply be called

This copy's `ariba_local` has **121 `ariba_*` functions**, including four that these screens need
(`ariba_audit_list`, `ariba_audit_purge_info/request/decide`) and `ariba_audit_month_eligible`. Tempting
shortcut: a thin route that forwards to them. **It does not work here**, and I checked rather than guessed:
`ariba_session_row` — the first line of every one of them — reads `auth.uid()` / `auth.sessions`, i.e. the
Supabase `auth` schema, which this copy does not have. Calling it with a real session row raised
`InvalidSchemaName: schema "auth" does not exist` (transaction rolled back; 0 session rows left behind).

So the plan stays what the rest of `canonical.py` already does: **port the logic to Python**, copying the
reference bodies as the specification. Only the three session-free helpers could be called as-is
(`ariba_can`, `ariba_flag`, `ariba_audit_month_eligible`) — and of those only
`ariba_audit_month_eligible` is worth calling, since it encodes the 30-day rule in one place.

## 9. Suggested order, and what to seed

1. **Audit viewer + purge box** (½ stage) — no migration, no seeding; 473 rows are already there.
   Smallest risk, and it makes every later stage self-documenting because new routes show up in it.
2. **Recycle bin** (½ stage) — no migration; 62 snapshots already there. Restore must write an audit row,
   which then shows up in (1).
3. **Business cards** (1–1.5 stages) — one small table (only if you want per-employee overrides), two
   settings keys, and the client template. Can ship *without* the table, as item 9 in the test plan says.
4. **Candidates + the public application page** (2–3 stages) — the only one that needs the drift fixed
   (§6 rows 1–2), the seven settings keys, and a new public page in hr-web. Seed 3–5 candidates (one per
   status, with 1–2 files each) and 1 open + 1 used + 1 revoked invite so all three tabs have something
   real, then run the anonymous submit end-to-end.

Each stage ends with: route + tests (the audit/bin/candidates cases are already listed in
`DESIGN_PORT_TEST_PLAN.md`), then flip the one word in `src/lib/features.ts` so the page stops saying
«لم تُبنَ». Nothing about these four requires touching the design-port shell, the auth model or the DB
ownership rules.

## 10. What to check after each stage

Item 9 of `DESIGN_PORT_TEST_PLAN.md` («The four pages you flagged as undone») is the acceptance list.
Worth adding, per stage:

- **audit**: `finance` gets 0 rows for `module=employees` and its own rows for `module=payroll`; `q` and the
  date filter narrow the 473 rows; `limit: 5000` comes back capped at 1000; purge as `hr` → a `pending`
  request + a notification for each of the 2 finance accounts; `decide` as `hr` → 403; `decide` as
  `finance` → approved; a second `request` for the same month → the «معلق لنفس الشهر» error.
- **bin**: 62 rows with the category counts (57 / 0 / 0 / 5); restore a `workflow_request` → it reappears in
  `/requests` and leaves the bin; restoring it twice → `REQUEST_EXISTS`; purge by `before` + `kind` removes
  only that kind; the single `document` row reads «للأرشيف فقط».
- **candidates**: accept creates an employee that `/employees` lists and rejects a duplicate id; reject
  without a note → 400; an expired invite cannot submit; a revoked invite shows «ملغى»; the medical file
  round-trips byte-identically; the public page opens with no cookie and can read nothing else.
- **bizcards**: a card for an employee with a long name, a long job title and no mobile/e-mail still renders
  and exports; the `.vcf` opens in a phone; the A4 sheet has no clipped edges; saving a design as `ceo`
  (view only) → 403.
