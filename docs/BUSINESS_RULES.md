# Business rules

Every calculation, with its formula and a worked example. Rules come from the V114 prototype code
(latest patch wins) plus the decisions recorded below. **Status** says whether the backend implements it yet.

All amounts are `Decimal`, rounded half-up to 2 places at the end of each formula.

## Decisions
| Topic | Decision | Prototype had |
|---|---|---|
| EOS base | **basic + housing**, everywhere | basic + housing on payroll/EOS page; full total in the settlement |
| Service years | **actual calendar days ÷ 365** | 365.25 in one place, years + months/12 + days/360 in another |
| Saudization | **Saudis ÷ current employees × 100**, count-based | same |
| Approval stages | per request type, stored in `workflow_rules` (see Workflow) | decided on the server, not visible |
| Evaluation approval | who signs an evaluation is a **setting** (`goals_config.evaluation_approver`: `hr` by default, `ceo`), resolved to that stage's people and never to the evaluator himself — see Goals | the screen only rendered its button when the server answered `can_approve`; no rule was visible in the code ported |

## Calendar — ✅ implemented (`core/scheduling.py`)
- Time zone Asia/Riyadh. Workweek **Sunday–Thursday**; Friday and Saturday off.
- Official holidays (`holidays` table) are excluded from leave days and from leave accrual. Recurring ones
  (National Day 23 Sep, Founding Day 22 Feb) repeat yearly; the two Eids are entered per year (Hijri).
- `workdays_between(a, b, holidays)` counts both ends.

**Example.** 2026 has 261 Sun–Thu days. Seeded holidays that fall on workdays: Founding Day (Sun 22 Feb),
Eid al-Fitr (Sun 22 and Mon 23 Mar), Eid al-Adha (Tue 26 – Thu 28 May), National Day (Wed 23 Sep) = 7
→ **254 workdays**.

## Contracts — ✅ implemented (`services/contracts.py`)
- Fixed-term: `end = join + duration months`, clamped to the end of the month. Indefinite: no end date.
- Example: join 31 Jan 2026, 12 months → **31 Jan 2027**; 1 month → **28 Feb 2026**.
- This matches the prototype (`addMonthsSafe`), so imported dates don't shift. Some HR teams use
  "join + N months − 1 day" instead: confirm if that is preferred.

## Saudization — ✅ implemented (`services/saudization.py`)
`pct = round(saudis × 100 ÷ current, 1)`. Current = not terminated, any category.
Example: 2 Saudis of 5 current → **40.0%**; 1 of 3 → **33.3%**.

## Leave — ⏳ next phase (`services/leave.py`)
- Entitlement = contract annual days (default 21).
- **Accrued in a year** = `annual × workdays worked from max(join, 1 Jan) to date ÷ workdays in the whole year`,
  capped at `annual`. Holidays are not workdays.
  Example: 21 days, joined 1 Mar 2026, as of 30 Jun 2026: 83 workdays worked ÷ 254 in 2026 → `21 × 83 / 254` = **6.86 days**.
- **Year ledger**: `close = opening + entitlement + adjustment − used`; `carry = min(10, close)`;
  from 2024 on, `eos_bank += max(0, close − 10)`.
  Example: opening 8, entitlement 21, adjustment 0, used 12 → close **17**, carry **10**, EOS bank **+7**.
- **2024 opening rule**: the 2024 opening is `max(0, close 2023 − 10)`, uncapped
  (the code's `leaveYearClosing(e, 2023) − 10`). ⚠ Confirm before the import: taken literally, the first 10 days
  of the 2023 close are not carried anywhere. E.g. close 2023 = 25 → 2024 opening 15 (not 10 + 15 in the EOS bank).
- HR can override entitlement / used / adjustment / year-end / carry for any year, with a reason (`leave_adjustments`).
- The employee sees: balance to date, projected balance on 31/12, carried-over days, EOS-reserved days.
- An annual-leave request can't exceed the available balance; leave days are counted in workdays excluding holidays.

## GOSI — ⏳ payroll phase (`services/gosi.py`)
Effective-dated rules (`gosi_rules`, seeded):

| From | System | Employee | Employer | Employee 55+ | Employer 55+ |
|---|---|---|---|---|---|
| 2026-01-01 | matching ("new") | 10.75% | 12.75% | 10.50% | 12.50% |
| 2026-01-01 | non-matching ("old") | 9.75% | 11.75% | 9.00% | 11.00% |
| 2027-07-01 | matching | 11.25% | 13.25% | 11.00% | 13.00% |
| 2027-07-01 | non-matching | 10.25% | 12.25% | 9.50% | 11.50% |
| both | non-Saudi | 0% | 2% | 0% | 2% |

- `base = min(45,000 ÷ month days × work days, basic + housing)`; age ≥ 55 uses the 55+ columns.
- Consultants and non-WPS employees: no GOSI.
- Example: Saudi, matching, age 40, basic 12,000 + housing 3,000, 30-day month, 30 work days →
  base `min(45,000, 15,000)` = 15,000 → employee **1,612.50**, employer **1,912.50**.

## Payroll row — ⏳ payroll phase (`services/payroll.py`)
```
total          = basic + housing + transport + project + other
salary_by_days = total ÷ month_days × work_days
due            = salary_by_days + overtime + leave_compensation + other_allowances
deductions     = gosi_employee + loan/advance + other_deductions
net            = due − deductions;   net_sar = net × exchange_rate
```
Employer GOSI is shown separately. Excluded from the run: terminated, hourly, external consultants,
"exclude from payroll". Approving a run makes it immutable. The employee app shows only the last approved run.
**Editing work days recalculates GOSI** (the prototype didn't).

Example: basic 12,000, housing 3,000, transport 1,000 → total 16,000. 30-day month, 20 work days →
salary by days **10,666.67**. GOSI employee 1,612.50 (cap `45,000 ÷ 30 × 20` = 30,000 > 15,000), loan 500 →
deductions 2,112.50 → net **8,554.17**.

## End of service — ⏳ EOS phase (`services/end_of_service.py`)
Base = basic + housing. Years = days of service ÷ 365.

| Article | Award |
|---|---|
| 84, 74, 74(3) death/disability, 74(4) retirement | `e84 = base/2 × min(y, 5) + base × max(0, y − 5)` |
| 85, 75 (resignation) | `< 2 y`: 0 · `2–5`: ⅓ e84 · `5–10`: ⅔ e84 · `≥ 10`: full e84 |
| 77 | `e84 + max(2 × base, base/30 × 15 × y)` |
| 80, 53 (probation) | 0 |

Example: base 15,000; joined 1 Jan 2019, last day 1 Jul 2026 → 2,738 days ÷ 365 = **7.5014 years**.
Art. 84 → `7,500 × 5 + 15,000 × 2.5014` = **75,020.55**. Art. 85 → ⅔ = **50,013.70**.
Art. 77 → 75,020.55 + `max(30,000, 500 × 15 × 7.5014 = 56,260.27)` = **131,280.82**.

### Settlement
```
total = EOS
      + leave compensation   (salary ÷ 30 × remaining days; remaining = years × annual days − taken)
      − excess-leave deduction
      + final period salary  (salary ÷ month days × attended days)
      ± extra items          (amount, or days × daily rate)
```
Example (salary = basic 12,000, 14 remaining days): leave compensation = 12,000 ÷ 30 × 14 = **5,600.00**.

## Alerts — ⏳ (`services/alerts.py`)
Iqama, passport, medical insurance and fixed-term contract expiring within **90 days**; **≤ 30 days** is urgent
(red); past expiry shows **منتهي**. The employee API already returns `expiry_days` per document.

## Attendance — ⏳ (`services/attendance.py`, `services/geofence.py`)
- Late if check-in > work start + tolerance. The prototype's late minutes = `check-in − (work start + tolerance)`;
  e.g. start 08:00, tolerance 15, check-in 08:20 → **5** late minutes. ⚠ Confirm whether late minutes
  should count from 08:00 (20) instead.
- Geofence checked **on the server**: haversine distance ≤ location radius (default 200 m, 50–5,000 m).
- Remote check-in counts against the yearly remote limit (default 10 days).
- Flexible hours: expected leave = check-in + shift hours (window 08:00–17:00, 8 h by default).
- "Forgot punch" goes through the request workflow.

## Workflow — ⏳ (`services/workflow.py`)
Stages come from `workflow_rules` (seeded, editable later):

| Request types | Stages |
|---|---|
| annual, sick, emergency, death, marriage, maternity, paternity, umrah, hajj, remote, advance | manager → HR → CEO |
| permission, maternity permission, early leave, overtime, mission | manager → HR |
| forgot punch | HR |

Rejection needs a reason. HR may approve on behalf of the manager (override with a reason) and can give the
final approval. Every step is kept in `request_steps`.

**The last stage is data.** `routers/canonical.py` builds each chain from
`ariba_app_settings['workflow_config'].final_by_type`: the migrated setting ends `unpaid`, `salary_advance`,
`iban_change`, `profile_edit` and `document` at **HR**, and every type it does not name at the **CEO**
(`DEFAULT_FINAL_BY_TYPE` is the same map, used only when the setting is missing). A value other than `hr`
or `ceo` is ignored, so a bad setting can never invent a stage. Which types end at HR is still a client
decision — see [FOLLOW_UPS.md](FOLLOW_UPS.md) #23.

## Goals, targets and evaluations — ✅ Stage 3 (`services/goals.py`)

The two screens are the app's **goals tab** (`GET /me/goals`) and **team-goals** (`/targets`,
`/evaluations/…`). Periods, formulas and labels are the app's own
(`frontend/employee-app/src/lib/goals.ts`), so the server stores and returns exactly what the screen shows.

**Periods.** `annual` = `YYYY`, `quarterly` = `YYYY-Q1…Q4`, `monthly` = `YYYY-MM`
(the app's `keyLabel`: «سنة 2026», «الربع 2 / 2026», «مارس 2026»).

**Formulas** — the server recomputes `overall`/`rating` on every save and ignores the client's copy:
- `pct = round(actual ÷ target × 100)`, clamped to 0…100, `null` when `target ≤ 0`: a target with no number
  has no progress rather than 0 %. Target 200, actual 150 → **75**.
- `overall = round(Σ scoreᵢ × wᵢ ÷ Σ wᵢ, 1)`, weight defaulting to 1 (0 or missing counts as 1).
  (80, w2), (90, w1), (70, w1) → `(160 + 90 + 70) ÷ 4` = **80.0**.
- `rating` from `overall`: ≥ 90 **ممتاز**, ≥ 75 **جيد جداً**, ≥ 60 **جيد**, ≥ 50 **مقبول**, else **ضعيف**.

### Privacy: who may see and change what

`D` is a **draft** evaluation (the evaluator's working copy, its `items[].comment` and `comments`
included), `P` is a **submitted** one waiting for a signature, `A` is an **approved** one.

| Actor | `/me/goals` (own) | a report's targets | a report's evaluation | approve |
|---|---|---|---|---|
| the employee | own targets + `A` only | 403 | 403 | 403 |
| direct manager with `manage_targets` | own | read, `POST`, `DELETE` | – | 403 |
| direct manager with `evaluate_team` | own | read (the form scores them) | `D`/`P` read + write, `A` read-only | 403 |
| the configured approver (§ Approval) | own | 403 | `P` + `A` read, **never** `D` | `P` → `A` |
| HR (`hr`/`admin`/`admin_manager`), not the approver | own | read, `POST`, `DELETE` | `A` only | 403 |
| another employee, same team or not | own | 403 | 403 | 403 |
| another team's manager | own | 403 | 403 | 403 |
| an outsider (no reports, no team) | own | 403 | 403 | 403 |

**P1 — Own means own.** `GET /me/goals` takes no employee id and answers for the token's employee only:
their targets (every period) and their **approved** evaluations. A draft or a pending evaluation is not
returned at all — not the row, not a redacted copy, not a count (the screen's list is already
«تقييماتي المعتمدة») — **and nothing on the employee's side announces one either**: submitting an
evaluation rings the approvers and not the employee (P8), so the first the employee hears of it is the
approval itself.

**P2 — The evaluator's notes stay the evaluator's.** A draft's `items[].comment` and `comments` reach the
employee only once the evaluation is approved, and they never reach an approver or HR before submission.
Nothing else copies them: notifications carry no note text and the audit row records the action and id.

**P3 — The manager's scope is the direct reports, gated by what HR granted.**
`employee_directory.manager_id = actor.employee_id AND active`, plus `manage_targets` for `/targets`
writes and `evaluate_team` for `/evaluations` writes; reading a report's targets needs either one (the eval
form builds its items from them). A `false` HR stored means no, whatever else is on
(`team_scope.effective_perms`, the Stage 2 rule).

**P4 — Delegation is not a key.** No goals/targets/evaluations route reads `ariba_delegations`. A report
who delegated on-behalf submission gains nothing here and losing the delegation takes nothing away; a
delegation row naming someone who is not the direct manager opens nothing. `manage_targets` /
`evaluate_team` never imply on-behalf submission and `submit_for_team` never implies goals access — the two
mechanisms stay apart (Stage 2's rules are untouched).

**P5 — A refusal does not confirm that anything exists.** Naming a *person* the caller may not act for is
`403 forbidden` («ليست لديك صلاحية على هذا الموظف», the Stage 2 wording). Naming a *row* the caller may not
see — `DELETE /targets/{id}`, `POST /evaluations/{id}/approve` — is `404 not_found`, the same answer as an
id that does not exist. An employee approving their own evaluation is the exception: the row is theirs, so
the answer is `403`.

**P6 — An approved evaluation is final.** `PUT` on an approved evaluation is `409 locked` (the screen hides
its buttons on `ev.status === "approved"`), and `approve` needs `status = "pending"`: a draft cannot be
approved straight from the manager's form (`409 not_pending`), so the manager has to submit it first.

**P7 — Only the evaluator writes the evaluation.** HR administers targets (the goal cycle) but never writes
`items`/`comments` for a manager, and an approver never edits what they sign. That keeps the second
signature worth something.

**P8 — Every write is audited, and the bell rings for whoever has to act next.** Target
create/update/delete and evaluation save/submit/approve append
`ariba_audit_log` (actor, action, row id — no content). The bell entries (and the queued e-mail) go
through `canonical._insert_notification`, the helper Stage 2 uses, and they obey P1: the employee hears
about a target added or removed («أضاف مديرك مستهدفاً») and about an **approved** evaluation with its
result («اعتُمد تقييمك») — never about a draft or a submitted one, because a «تقييمك بانتظار الاعتماد»
entry would announce exactly the row `/me/goals` hides. Submitting tells the people who may sign
(«تقييم بانتظار اعتمادك») and nobody else; approving also tells the evaluator
(«اعتُمد التقييم الذي أرسلته»). An approver or HR opening an evaluation they did **not** write appends
the same kind of audit row (`evaluation_read`) with the ids and the period, never the items or the
comments, so a signature has a paper trail of who looked at it first; the evaluator's own reads are not
logged.

### Approval: data, not code

`ariba_app_settings['goals_config'].evaluation_approver` names the stage that signs an evaluation: `hr`
(the default) or `ceo`. It is read the way `workflow_config.final_by_type` is — the setting wins, any
other value is ignored so a typo cannot invent a stage, and a missing setting means `hr` (§ Workflow).

The **people** at that stage are the ones the system already trusts for it: the `workflow_approvers` rows
of the stage **plus** the holders of the stage's roles (`hr` → `hr`/`admin`/`admin_manager`, `ceo` →
`ceo`), the same resolution `canonical.py` uses for an override. The evaluator is excluded even when they
hold the role — nobody signs their own evaluation — and a stage that resolves to nobody refuses with
`409 no_approver` («لا يوجد معتمد لهذه المرحلة») instead of falling back to somebody. HR must confirm the
stage: [FOLLOW_UPS.md](FOLLOW_UPS.md) #30.

### Endpoint contract (pinned by the app's own `src/lib/port.ts`)

| Method | Path | Answer | Who |
|---|---|---|---|
| GET | `/me/goals` | `{targets, evaluations}` — own; approved evaluations only | any signed-in employee |
| GET | `/targets?employee_id=&year=` | `{targets}` — that employee's, for the year the screen passed (`period_key` prefix) | self, their manager (either permission), HR |
| POST | `/targets` | `{target}` — body `{target: {…}}`; an `id` inside it edits that row (the screen's «تعديل»), and the period of an existing row cannot change | their manager with `manage_targets`, HR |
| DELETE | `/targets/{id}` | `{ok: true}` | the same two |
| GET | `/evaluations/{employee_id}/{period_type}/{period_key}` | `{evaluation, targets, can_approve}` | their manager with `evaluate_team`, the approver, HR (approved only) |
| PUT | `/evaluations/{employee_id}/{period_type}/{period_key}` | `{evaluation}` — body `{items, comments, submit}` | their manager with `evaluate_team` only |
| POST | `/evaluations/{id}/approve` | `{ok: true}` | the configured approver |

`422 invalid_request` (the Arabic message the screens show) for: an empty `title`; a `period_type` outside
the three periods, or a `period_key` not shaped for it; `target_value < 0`; `weight ≤ 0`; a `status` outside
`active`/`done`; an evaluation with no items, or an item whose `score` is outside 0…100. `overall`/`rating`
sent by the client are ignored.

### The refusals the negative tests pin

| # | Who → what | Expected |
|---|---|---|
| T1 | employee, while a draft **and** a pending evaluation exist → `GET /me/goals` | 200, only their ids, no draft, no pending |
| T2 | employee → `GET /targets?employee_id=<colleague>` | 403 `forbidden` |
| T3 | employee → `POST /targets` for a colleague | 403 `forbidden` |
| T4 | employee → `DELETE /targets/{colleague's id}` | 404 `not_found` |
| T5 | employee → `GET`/`PUT` `/evaluations/<colleague>/…` | 403 `forbidden` |
| T6 | employee → `POST /evaluations/{own pending id}/approve` | 403 `forbidden` |
| T7 | employee → `GET /evaluations/<own id>` (their approved row) | 403 `forbidden` — own data is `/me/goals` |
| T8 | another team's manager → `GET /targets?employee_id=<my report>` | 403 `forbidden` |
| T9 | another team's manager → `DELETE /targets/{my report's id}` | 404 `not_found` |
| T10 | another team's manager → `POST /evaluations/{my report's id}/approve` | 404 `not_found` |
| T11 | direct manager with `manage_targets = false` → `POST /targets` for their own report | 403 `forbidden` |
| T12 | direct manager with `evaluate_team = false` → `PUT /evaluations/<report>` | 403 `forbidden` |
| T13 | a delegating report's manager, same routes as T8–T10 | identical — delegation adds nothing |
| T14 | outsider with no reports → every route above | 403 or 404, never 200 |
| T15 | approver stage = `ceo`, caller is HR (`hr`/`admin`) → `POST /evaluations/{pending}/approve` | 403 `forbidden` |
| T16 | configured approver → `GET /evaluations/<draft's employee>` | 404 `not_found` (a draft is not theirs to see) |
| T17 | configured approver when the stage resolves to nobody → approve | 409 `no_approver` |
| T18 | manager → `PUT /evaluations/…` after approval | 409 `locked` |
| T19 | the evaluator, who also holds the approver's role → `POST /evaluations/{their own evaluation}/approve` | 403 `forbidden`, and `can_approve` is `false` on `GET` |
| T20 | manager → `PUT /evaluations/<report>` with `submit: true` | the row becomes `pending`; the approver's bell gets «تقييم بانتظار اعتمادك», **the employee's bell gains nothing** and `/me/goals` still shows no such evaluation |

Not confirmed by hand: the manual **approve/lock** steps (they are covered by the automated tests and
not by a browser run) — [FOLLOW_UPS.md](FOLLOW_UPS.md) § Stage 3 checks records exactly what was run.

## Tasks, meetings and team availability — ✅ Stage 4 (`services/tasks.py`)

The screen is `app/tasks.tsx` (their `pages/team/index.jsx`): the team's availability with a task and
an invitation button, the inbox and what was sent. The team tab also counts the open inbox rows for
its badge. **Four calls, exactly the ones `src/lib/port.ts` makes** — there is no endpoint for editing
a task, deleting one, listing a whole batch or reminding anybody, because the app calls none of them.

| Method | Path | Answer | Who |
|---|---|---|---|
| GET | `/team/availability` | `{items: [{id, name, job, dept, leaves: [{from, to, days, type}]}], today, allowed}` — `type` is `annual`, `remote` or `private` (see P7) | their manager with `view_team` **and** `view_team_leaves`; HR/`admin`/`admin_manager`/`ceo` (everyone active) |
| GET | `/tasks?box=inbox\|sent` | `{items}` — the `Task` shape below, both names joined | any signed-in employee, their own rows |
| POST | `/tasks` | `{sent, batch_id}` — body `{to[], kind, title, details?, due?, start?, end?, location?}` | the same audience as the availability list |
| POST | `/tasks/{id}/update` | `{ok, status}` — body `{status, note?}` | the assignee (`done`/`accepted`/`declined`), the sender (`cancelled`) |

`Task` is one row of `ariba_tasks`: `id`, `batch_id`, `kind` (`task`/`meeting`), `title`, `details`,
`due_date`, `start_at`, `end_at`, `location`, `status` (`open`/`done`/`accepted`/`declined`/
`cancelled`), `response_note`, `from_id`/`from_name`, `to_id`/`to_name`, `created_at`.

**P1 — You can only write to people you can already see.** The availability list and the recipient
list are one set, because the screen picks recipients from that list. HR (`hr`/`admin`/`admin_manager`)
and the CEO see every active employee; a direct manager sees their own reports and needs **both**
`view_team` and `view_team_leaves` (the second is what makes a leave visible, so a manager without it
gets no list and therefore nobody to write to). Everybody else gets `allowed: false`, an empty list
and a `403` if they try to send — not even a count of their colleagues is returned.

**P2 — One row per recipient, one batch.** `ariba_tasks` keeps one assignee per row, so a task to
three people is three rows with one `batch_id`; the audit row records the batch and the recipients,
and a name repeated in `to` collapses to one row (one person cannot receive the same task twice).

**P3 — The recipient answers, the sender cancels.** `done`/`accepted`/`declined` belong to the
assignee and `cancelled` to the creator; nobody may move a row that is no longer `open` (`409
not_open`), and the sender cannot call a task done on somebody's behalf. The screen offers exactly
these answers: «تم الإنجاز» for a task and «قبول»/«اعتذار» for an invitation in the inbox, «إلغاء» in
the sent box.

**P4 — A refusal does not confirm that a row exists.** A *person* outside the audience is `403`
(«ليست لديك صلاحية على هذا الموظف», the Stage 2 sentence) and the whole request is refused before a
single row is written, so a batch is never half-delivered. A *row* that is not the caller's — another
employee's inbox, another team's manager — is `404`, the same answer as an id that does not exist.

**P5 — `kind` decides which fields matter.** A meeting must carry `start` and may carry `end`
(never before the start) and `location`; a task carries `due`. The field that does not belong to the
kind is dropped rather than stored, because the form cannot send both. `title` is trimmed, required,
and refused above 200 characters (their `ariba_send_task` truncated silently instead).

**P6 — The bell rings for whoever has to act next.** A send queues «مهمة جديدة: …» or «دعوة اجتماع: …»
to each recipient with the sender's name and the time; an answer queues «أُنجزت المهمة» /
«قُبلت دعوة الاجتماع» / «اعتذار عن الاجتماع» / «أُلغيت المهمة» to the other side, with the reason when
there is one. Every write appends `ariba_audit_log` (`task_create` with the batch, then
`task_<status>` with the row); **reads are not audited** — these are a team's own tasks, not somebody's
signature (unlike `evaluation_read` in Stage 3).

**P7 — A leave is "away", not "why".** The availability tab answers *who is not at work and when they
are back*, so a leave reaches a manager as its dates and its length plus a **name only when the type can
safely be named**: `annual` and `remote` (the second because the screen must know that remote work is
work, not an absence). Sickness, maternity, paternity, death, marriage, umrah, hajj, emergency — and any
type added later — all arrive as `private` and the screen prints «إجازة»; the reason/notes column is
**never selected** from `leave_requests`, so there is nothing to leak. It is an allow-list, not a
block-list: a new type is silent until somebody deliberately adds it. HR gets the same redacted row in
this tab — the real type belongs to the leave screens, which is where a leave is a leave.

`422 invalid_request` for: no recipient, a list of blanks, a `kind` other than the two, an empty
`title`, a title over 200 characters, a `due` that is not `YYYY-MM-DD`, a meeting without `start`, a
meeting whose `end` is before its `start`, a time that is not ISO, and a status the caller does not
own.

### The refusals the negative tests pin

| # | Who → what | Expected |
|---|---|---|
| T1 | employee → `GET /team/availability` | 200, `allowed: false`, `items: []` — no names, no leaves |
| T2 | manager with `view_team` but not `view_team_leaves` → availability | 200, `allowed: false`, no team query |
| T3 | manager → availability | their direct reports only, `approved` leaves only, `to_date ≥ today − 60` |
| T4 | manager → `POST /tasks` naming someone outside their team | 403 `forbidden`, and not even the valid names are written |
| T5 | employee → `POST /tasks` | 403 `forbidden` |
| T6 | the recipient → `cancelled` | 422 `invalid_request` |
| T7 | the sender → `done`/`accepted`/`declined` | 422 `invalid_request`, nothing updated |
| T8 | anybody → `POST /tasks/{id}/update` for a row that is not theirs | 404 `not_found` |
| T9 | the owner → any answer once the row left `open` | 409 `not_open` |
| T10 | manager → availability of a report on **sick** leave | one row with dates and `days`, `type: "private"`; the JSON contains no type name (`sick`/`مرضية`) and no reason/notes field at all |

Not confirmed by hand: the browser pass over this screen is **pending** and will be run together with
the signing stage (one seeded database serves both) — see [FOLLOW_UPS.md](FOLLOW_UPS.md) § Stage 4
checks for exactly what was run.

## Open questions from the prototypes (to settle in their phases)
1. **2024 leave opening rule**: where do the first 10 days of the 2023 close go? (see Leave)
2. **Late minutes**: from work start, or from work start + tolerance (see Attendance)?
3. **Settlement leave compensation base**: the prototype uses basic ÷ 30. Should it be basic + housing ÷ 30
   to match the EOS base?
4. **Payroll total vs. "extra allowance"**: the prototype leaves `extraAllowance` out of the payroll total but
   includes it on the employee screen. The new model has only `other_allowances` (in the total).
5. **An 8th template**, `contract_end` (إشعار انتهاء عقد العمل), exists in the HR file but not in the brief's 7.
6. **Company name** differs: settings say "شركة اريبا لخدمات الأعمال", the V114 templates say
   "شركة حلول أريبا لخدمات الأعمال", the brief says "أريبا للاستشارات" (used as the seed default).
7. **GOSI for non-WPS Saudis**: the prototype returns 0 for every non-`wps` WPS type. Confirm that's intended.
8. **Who approves an evaluation, and does HR read drafts?** The stage is a setting (`hr` by default, `ceo` as
   the alternative) and the people at it come from `workflow_approvers` + the stage's roles; drafts stay
   private to the evaluator. Both halves are a client decision — [FOLLOW_UPS.md](FOLLOW_UPS.md) #30.
9. **May an employee update their own `actual_value`?** The ported screens let only the manager (or HR)
   write targets, so progress is reported to the manager today. Letting employees report it themselves is
   one permission decision, not built.
