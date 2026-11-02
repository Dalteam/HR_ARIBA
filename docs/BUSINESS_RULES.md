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
this tab — the real type belongs to the leave screens, which is where a leave is a leave. **This is a
ceiling, not an extra promise**: the manager who approves that same leave already reads its real type
and its reason on `GET /me/team/requests`, so the redaction protects the colleagues who hold
`view_team_leaves` **without** `view_team_requests` — measured and recorded in § Documents and
e-signing S2.

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

## Documents and e-signing — ✅ Stage 5 (`services/html_safety.py`, `routers/canonical.py`)

The screens are `app/(tabs)/documents.tsx` (what waits for my signature: sign, approve without a
signature, object with a reason — and «مستندات بانتظار توقيعي كمدير»), `app/document/[id].tsx` (the
viewer) and `app/letter/[id].tsx` (the same HTML in the older viewer). **Five calls** in
`src/lib/port.ts` (`docs.content`, `docs.states`, `docs.employeeSign`, `docs.managerPending`,
`docs.managerSign`), three the screens already use (`GET /me/letters`,
`POST /me/letters/{id}/respond`, `GET /letters/{id}/html`) and one HR needs to close the chain.

**The ceiling, measured before writing any rule.** A manager who has `view_team_requests` already reads
all of this for the *same* leave, from `GET /me/team/requests` (`canonical._workflow_out`):
`employee_name`, `type` (**the real leave type** — `sick`, `maternity`, …), `from_date`, `to_date`,
`days`, **`notes`** (the free-text reason the employee typed), `attachment_id`, `rejection_reason`,
`law_note`, `status`, `stage`. `GET /team/availability` returns `{id, name, job, dept, leaves:
[{from, to, days, type}]}`, and `type` is only ever `annual`, `remote` or `private`. **So availability
shows strictly less than the approval view — nothing beyond it**: it does not name the type, and it
carries no reason, note, attachment or amount. Its only extra fields are `job`/`dept`, which the same
manager already has from `GET /me/team`. The leave attachment is served to nobody today: it is an
`ariba_documents` row hanging off the request (`ariba_documents.request_id`); the
`leave_requests.doc_attachment_id` column that the approval view exposes is legacy and the app's submit
path never fills it. Two consequences, both deliberate:

- **P7 keeps its job** for managers who hold `view_team_leaves` but **not** `view_team_requests` — the
  availability list is their only view of a report's leave, and it still names no type beyond
  `annual`/`remote`. For the approver it is a courtesy, not a guarantee: he can read the type and the
  reason on the approval screen. If you would rather availability named the type too, it is the
  one-line `NAMED_LEAVE_TYPES` allow-list in `services/tasks.py` — it would still show less than the
  approval view.
- **A manager opening a leave attachment (S1) is not new information**: he already approves that leave
  with its notes in front of him. The rule below only lets him see the paper behind the claim.

| Method | Path | Answer | Who |
|---|---|---|---|
| GET | `/documents/{id}/content` | `{id, file_name, mime_type, base64}` | the employee the document belongs to; HR/`admin`/`admin_manager`/`ceo`; a direct manager **only** for (a) the document waiting for *his* signature, or (b) a document attached to a **leave request of his direct report**, all leave types — and nothing else (S1); a manager's open is audited, the owner's is not (S1.1) |
| GET | `/me/sign/states` | `[{request_id, stage, needs_manager, reject_reason, emp_signed_at, mgr_signed_at}]` | the letter's employee, their own rows |
| POST | `/me/letters/{request_id}/sign` | `{next: "manager"\|"hr"\|"done", document_id}` — body `{document_id?, template_type?, signed_base64}` | the letter's employee, while `current_stage='employee'` and `status='pending'` (`next:"done"` means the letter closed with this signature — `hr_closes` off, S10) |
| GET | `/me/sign/pending` | `[{request_id, document_id, employee_id, employee_name, emp_signed_at, template_type}]` | the manager the row is waiting for, nobody else |
| POST | `/me/sign/{request_id}` | `{ok, next}` (`next` is `hr`, `done` or `rejected`) — body `{action: "approved"\|"rejected", signed_base64?, reason?}` | that same manager, while `stage='manager'` |
| POST | `/letters/{request_id}/approve` *(new; the app does not call it — HR does)* | `{ok, status}` | HR/`admin`/`admin_manager`/`ceo` while `stage='hr'` **and `hr_closes` is on**; `409` on any second call (S10) |
| GET | `/settings/doc-sign` | `{hr_closes, manager_types}` | HR/`admin`/`admin_manager`/`ceo` |
| PUT | `/settings/doc-sign` | `{hr_closes, manager_types}` — body `{hr_closes?, manager_types?}` | HR/`admin`/`admin_manager` (the same gate as the other two settings, S10) |

Where the data already lives (no migration needed): a letter is a `workflow_requests` row with
`request_type='template:<type>'` (`onboarding`, `custody`, `extension`, `termination`, `clearance`,
`experience`, `evaluation`, `contract_end`, `salary_cert`, `custom`), `payload = {title, template_type,
sent_by}`, and one `ariba_documents` row (`document_type='letter'`, `text/html`) holding the HTML HR
sent; the chain itself is `ariba_doc_signing`, one row per request keyed by `request_id`, with
`stage ∈ ('manager','hr','rejected')`, `needs_manager`, `manager_id`, `emp_signed_at`, `mgr_signed_at`,
`reject_reason`. `ariba_app_settings['doc_sign_cfg'].manager_types` names the types that need the
direct manager's signature (the seeded setting has `["onboarding"]`, an empty list when unset). A leave
attachment is a second kind of `ariba_documents` row: same table, `request_id` = the leave's request,
`document_type` from the request type (`employee_upload`, `iban_certificate`, …). The migration's
`ariba_leave_files` table is **not** used by this port (no row, no route, no read) — attachments were
already filed in `ariba_documents` before Stage 5, so the viewer reads one table for both. Two columns
are **generated** and no route writes them: `workflow_requests.status` (from `current_stage`:
`completed` → `approved`, `rejected` → `rejected`, else `pending`) and `ariba_documents.file_size`.
And two are foreign keys: `workflow_requests.request_type` → `workflow_request_types` and
`ariba_documents.document_type` → `document_types`, so a letter type that is not in the lookup cannot
be sent at all (the Stage 5 demo seed adds `template:onboarding` and `template:salary_cert` when its
copy lacks them).

**S1 — The viewer opens two doors for a manager, and one envelope for everyone else.** `/content`
returns the bytes of one `ariba_documents` row as base64 plus its name and mime type. Its readers are
(a) the employee the document belongs to, (b) the HR read roles and the CEO, and (c) a **direct
manager**, only for two things: the document **currently waiting for his own signature**
(`ariba_doc_signing.stage='manager'` **and** `manager_id=me` **and** `document_id=that id`), and a
document **attached to a leave request of his direct report, for all leave types** — the paper behind
a claim he is already asked to approve. Nothing else: not the report's ID/iqama, passport, contract,
degree, certificates or photo, not a payslip, not another letter, not a colleague's document. "Direct
report" means `employee_directory.manager_id = me` **at read time** (a viewer is a current
relationship, unlike the signature snapshot in S8). Everyone else — another employee, an account with
no employee row, another team's manager, the report's *former* manager — gets `404 not_found`, the same
answer as an id that does not exist, never a `403` that would confirm the document is real.

**S1.1 — Every manager open is audited, and the content is not.** `ariba_audit_log` gets one row:
`module='documents'`, `action='open'`, `entity_type='document'`, `entity_id=<document id>`,
`actor_employee_id=me`, `details={"employee_id": <owner>, "via": "content"}` — never the bytes, the
base64, the file name or the HTML. The employee opening his own document is not audited (his paper,
the same choice S9 makes for reads); HR's screens keep the `download` row they already write. The
leave itself is already visible in the request screens, so this row answers the one question they
cannot: *did the manager look at the attachment?*

**S2 — Availability may never show a manager more than the approval screen already does.** Measured, not
assumed: the approval list (`GET /me/team/requests`) gives the same manager the real leave type, the
dates, the days, the employee's `notes`, the rejection reason and the law note; `/team/availability`
gives dates, days and a type limited to `annual`/`remote`/`private`. Availability is therefore a subset
by construction, and any field added to it later has to be justified against that ceiling — never
against "he is the manager". The reason text and the attachment are never part of it: the calendar is
a glance, the request is the record.

**S3 — A letter is signed in one order and no other.** employee → (direct manager, only when the type
is listed in `doc_sign_cfg.manager_types`) → HR, and the **HR step is optional**: it happens only when
`doc_sign_cfg.hr_closes` is on, which is **off by default** (S10 decides who closes the letter). The
unsigned approval of S6 takes the same path. The signing row's `stage` is the furthest stage the
letter reached, and every route checks it before writing: the employee's sign route needs
`current_stage='employee'` and `status='pending'` (otherwise `404`: a letter that already moved is not
a pending letter of his), the manager's route needs `stage='manager'` and `manager_id=me`
(otherwise `404`), HR's needs `stage='hr'` (otherwise `409 not_waiting_for_hr`, because HR may open a
letter that is genuinely mid-chain and should be told plainly rather than be shown a 404).

**S4 — The client never chooses which document gets the signature.** `document_id` in the employee's
body is accepted for compatibility (the app sends `null`) and **ignored**: the server signs the letter
the request owns, never another document id a caller supplies. `template_type` is read from the
request's payload, not from the body, so a client cannot make an `onboarding` letter look like a
`salary_cert` to slip past the manager's signature. The request's own row decides everything else.

**S5 — The signature travels only inside a document, and the original is never touched.** The
employee's signature stays on the device (`src/lib/signature.ts`: a file, or `localStorage` on the web;
there is no route that uploads it on its own). What arrives is `signed_base64`: the whole HTML with the
signature embedded. The server stores it as a **new** `ariba_documents` row
(`document_type='signed_document'`, `mime_type='text/html'`, `uploaded_by` = the signer,
`request_id` = the request) and leaves the delivered letter byte-for-byte as it was, so HR can always
see what was sent next to what came back. No column holds a signature, no route returns one, and the
manager's copy is a second `signed_document` row rather than an overwrite of the employee's.

**S6 — What "approve without signature" means.** `POST /me/letters/{id}/respond {action:'approved'}`
stays the unsigned approval: no signed copy, a signing row with `document_id = NULL`, the approval time
in `emp_signed_at`, and **the same stage logic as a signature** (the manager when the type needs one,
then HR only when `hr_closes` is on). This **changes one existing handler**: today an approved letter
jumps to `current_stage='completed'`; from Stage 5 an approval that needs a manager stops at `manager`,
one that does not stops at `hr` when `hr_closes` is on, and one that does not and needs no HR step
closes at `completed` in the same request. A rejection (`rejected` + reason ≥ 3 chars) is unchanged
except that it also requires the letter to still be at the employee's stage.

**S7 — The manager's pending list is his own signature duty, not a team view.** `GET /me/sign/pending`
lists `stage='manager' AND manager_id=me`, newest first, joined to the employee's name and the
template type. It needs no permission flag (`view_team*` does not gate it): signing what your report
already signed is a personal act, not a view of their data. Another team's manager's list is empty, and
that is not a `403`.

**S8 — `manager_id` is a snapshot, not a lookup.** It is written when the employee signs or approves,
from `employee_directory.manager_id` at that moment. Moving the employee to another manager afterwards
does not move an open signature, and the new manager does not inherit it — the row would otherwise
change hands silently mid-chain. **If the type needs a manager and the employee has none**, the chain
does not stall and does not fail: it goes straight to `stage='hr'`, `needs_manager` stays `true` (the
type did need one), `manager_id` stays `NULL`, and the audit row carries `no_manager` in
`details.reason` so HR can see the signature was skipped for want of a manager — not refused by one.
Decided, not defaulted.

**S9 — The row is the evidence: times, never signature bytes.** The signing row carries
`emp_signed_at`, `mgr_signed_at`, `reject_reason`, `updated_at`; `workflow_actions` gets one row per
step; `ariba_audit_log` gets `sign_employee` / `sign_manager` / `sign_reject` / `letter_approve` with
the request id and the new document id — and no signed content. Reading (`/content` for one's own
document, `/states`, `/pending`) is **not** audited, the same choice Stage 4 made for reads: these are a
person's own papers, and an audit row per glance would bury the signatures it is meant to protect. The
manager's opens on a report's leave attachment are the one exception and have their own row (S1.1) —
he is reading somebody else's paper.

**S10 — Who closes the chain, and then nothing moves again.** The last signature closes the letter when
`doc_sign_cfg.hr_closes` is **off** (the default): `current_stage='completed'`, `status` reads back
`approved` (it is the generated column, so no route ever writes it), the employee's bell rings
(«اعتُمد مستندك») and the row's `stage` stays where the letter got to (`hr`) — the row records how far
it went, the request records whether anybody still has to act. When `hr_closes` is **on**, the letter
waits at `stage='hr'` and `POST /letters/{request_id}/approve` is the last step (Option A): it needs
`stage='hr'`, sets `current_stage='completed'`, rings the employee's bell, writes `letter_approve` and
refuses a second call (`409 already_closed` — also when the setting was off and the letter already
closed itself) as well as an employee, a manager or an outsider (`403` from the role gate, and `404`
when the id is not a letter at all — the two answers the existing HR letter routes already give).
A rejected chain is closed for good too: the employee cannot re-sign the same request — HR sends a new
letter — and a manager cannot reopen what he rejected. **Follow-up entry 31** asks HR to confirm they
want this final step at all and to build a screen for it; until then the setting stays off and the
route is API-only.

**S11 — Only the next actor's bell rings.** Employee signs or approves → the manager
(«مستند بانتظار توقيعك» with the employee's name) or HR («مستند بانتظار اعتمادك» when `hr_closes` is
on); the manager signs → HR («مستند موقّع بانتظار اعتمادك») when `hr_closes` is on, otherwise the
employee («اعتُمد مستندك»); the manager rejects → the employee, with the reason; HR approves → the
employee. A letter that closes at the employee's own signature rings nobody: the employee's own action
never notifies them, and with `hr_closes` off there is no next actor to ring. No bell goes to anybody
who is not the next actor in the chain.

**S12 — What arrives with the signature is content, never code.** `signed_base64` is the whole letter
as the device sent it, so the server treats it as untrusted text before storing it
(`services/html_safety.py`, a stdlib allow-list sanitizer — the project has no HTML-sanitizing
dependency and does not add one for this): the tags a letter is made of are kept (`html`, `head`,
`body`, `div`, `p`, `span`, `table` and friends, lists, headings, `b/i/u/s/small`, `br`, `hr`, `img`,
`a`, `style`), and everything a letter is not made of is dropped **with its content** — `script`,
`iframe`, `frame`, `object`, `embed`, `applet`, `form`, `input`, `button`, `select`, `textarea`,
`svg`, `math`, `link`, `base`, `template`, `noscript`, and every `on*` handler attribute. `img src`
must be a **`data:` image** (`png`/`jpeg`/`gif`/`webp`/`bmp`) — there is no remote image, font or
stylesheet, so viewing a letter never calls out to a third party; `a href` may only be `http`,
`https`, `mailto`, `tel` or a `#fragment` (a `javascript:` link keeps its text and loses the href);
`<style>` and `style=""` are kept but any declaration naming `url(`, `@import`, `expression(`,
`behavior`, `-moz-binding` or `image-set(` is removed, so a stylesheet cannot fetch either. The
`<!--ARIBA_EN-->` marker survives (it is how the app splits the Arabic sheet from the English copy);
every other comment is dropped, `<meta>` keeps only `charset`. The cleaned text — not the submitted
one — is what is stored in the `signed_document` row (S5), so what HR opens next to the original is
already safe; a body over **1 MiB** is refused with `413 file_too_large` before anything is written.
The letter HR sends is cleaned the same way before it is stored (D30), so a hostile `html` body never
reaches a viewer at all — and `svg` is never accepted as an image, even as `data:`, because an SVG is
a document that can carry script while the signature the app draws is a PNG.
The web viewer already loads documents in an iframe with **no script permission and no same-origin**
(`html-view.web.tsx`), and the phone viewer disables JavaScript outright (`html-view.tsx`'s
`javaScriptEnabled={false}`, since Stage 5's review): S12 is the first line, those two are the second. The
third is the header on the one route that hands a stored letter to a browser, `GET /letters/{id}/html`:
`default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none';
form-action 'none'; frame-ancestors 'none'` (`html_safety.DISPLAY_CSP`, `nosniff` alongside) — so a row
written **before** this stage existed, which was never cleaned, still cannot run or fetch anything;
`core/security.py` keeps a route's own policy and sends its blanket `default-src 'none'` only to the answers
that set none. What S12 does not promise: the sheet's CSS layout is preserved but fonts are whatever the
device has, and an image that is not embedded in the HTML does not survive (letters embed their signature,
which is why it does).

| # | Caller → route | Answer |
|---|---|---|
| D1 | **another employee** → `GET /documents/{id}/content` on a colleague's letter | `404 not_found` — never `403`, and the body carries no name, size or mime type |
| D2 | **an account with no employee row** (outsider) → the same | `404 not_found` |
| D3 | **another team's manager** → the same | `404` |
| D4 | a direct manager → `/content` of that report's **ID/iqama, passport, contract, degree, certificate or photo** | `404` — the viewer opens two doors for him and no more (S1) |
| D5 | a direct manager → `/content` of another **letter** of that report (a `template:` request that is not waiting for him) | `404` |
| D6 | that manager → the same document **after** he signed it | `404` (the chain moved on) |
| D7 | a direct manager → `/content` of an attachment on his report's **leave request** (any leave type: annual, sick, maternity, unpaid, …) | `200`, the bytes, **plus exactly one `ariba_audit_log` row** `documents/open/document` with `{employee_id, via:'content'}` and no content (S1.1) |
| D8 | the same manager → the same attachment **after** the employee's `manager_id` changed | `404` — the door follows the current relationship (S1) |
| D9 | **another team's manager** → that same leave attachment | `404` |
| D10 | **an outsider** (account, no employee row) → that same leave attachment | `404` |
| D11 | **another employee** (a teammate, not the owner) → that same leave attachment | `404` |
| D12 | that manager → `/content` of an attachment on his report's **non-leave** request (`document` upload, `iban_change`, `profile_edit`, overtime) | `404` — the door is "a leave request", not "any request" |
| D13 | another employee → `POST /me/letters/{id}/sign` | `404`, nothing written, no signing row, no audit row |
| D14 | the employee himself → `POST /me/sign/{id}` (the manager's route) | `404` |
| D15 | another team's manager → `POST /me/sign/{id}` | `404`, nothing written |
| D16 | the right manager → `POST /me/sign/{id}` when `stage` is `hr` or `rejected` | `404` |
| D17 | the employee → sign again, or after a rejection, or after HR closed it | `404` (it is no longer a pending letter of his) |
| D18 | the manager → `POST /me/sign/{id}` with `action:"rejected"` and no reason (or < 3 characters) | `422 invalid_request`, the row stays at `manager` |
| D19 | the employee → sign with `signed_base64` missing, not valid base64, or over the upload limit | `422 invalid_request` / `413 file_too_large`, the request stays at `employee` |
| D20 | **an employee, a manager or an outsider** → `POST /letters/{request_id}/approve` | `403 forbidden` from the role gate; `404` when the id is not a letter — and in both cases nothing is written |
| D21 | HR → `POST /letters/{id}/approve` while `stage` is `manager` or `rejected` | `409 not_waiting_for_hr` |
| D22 | HR → the same approve twice | `409 already_closed` |
| D23 | anybody → `GET /me/sign/states` | only the caller's own requests; an account with no employee row gets `[]`, never somebody else's row |
| D24 | the employee → `POST /me/letters/{id}/sign` on a letter whose type needs no manager, with `hr_closes` **off** | `200 {next:"done"}`, `document_id`; request `current_stage='completed'`, row `stage='hr'`, and **no bell** to HR (S10/S11) |
| D25 | HR → `POST /letters/{id}/approve` on a letter that closed itself because `hr_closes` was off | `409 already_closed`, nothing written (S10) |
| D26 | the employee → sign a letter whose type **is** in `manager_types` | `200 {next:"manager"}`; row `stage='manager'` with `manager_id` = their manager at that moment, that manager's bell rings, and the employee's `/me/sign/states` shows `stage:"manager"` |
| D27 | that manager → sign it, `hr_closes` **off** | `200 {ok:true}`; request `completed`, row `stage='hr'` + `mgr_signed_at`, the employee's bell rings («اعتُمد مستندك»), HR's does not (S10/S11) |
| D28 | the employee → sign with a `signed_base64` carrying `<script>`, an `onclick`, a `javascript:` link and a remote `<img src>` | `200`; the stored `signed_document` row contains none of them, keeps the letter's text, the `<!--ARIBA_EN-->` marker and the `data:` signature image (S12) |
| D29 | the employee → sign with a body over 1 MiB | `413 file_too_large`, no `signed_document` row and no signing row written (S12) |
| D30 | HR → `POST /letters` with a hostile `html` body | the letter is created and the **stored** `ariba_documents` row is the sanitized HTML, not the submitted one (S12) |
| D31 | an employee / a manager → `PUT /settings/doc-sign` | `403 forbidden`, the setting unchanged |

**The three decisions, as settled on 2026-11-01:**

1. **A manager opens the documents attached to his direct reports' leave requests, for all leave types —
   and nothing else.** Implemented as S1(c) + S1.1 (audited, no content) with D7–D12 as the negatives
   (another team's manager, an outsider, another employee, a non-leave request, a former report). The
   same principle caps `/team/availability` (S2): measured, it already returns strictly less than the
   approval screen — it does not even name the type it is allowed to name.
2. **A type that needs a manager, for an employee who has none: straight to HR, `no_manager` in the
   audit** (S8). Not a `409`: the employee's own act must not fail because HR has not filled in
   `manager_id` yet, and the audit row is what tells HR a signature was skipped and why.
3. **Option A — HR closes the `hr` stage** through the new `POST /letters/{request_id}/approve` (S10),
   with D20–D22 as the negatives. It is **behind `doc_sign_cfg.hr_closes`, off by default**: with the
   setting off the chain closes at the last signature the type needs, which is what the business does
   today. Follow-up entry 31 asks HR to confirm they want this final step and to build a screen for it,
   since the app does not call the route.

**The two build decisions taken on 2026-11-01, when Stage 5 was implemented:**

4. **`hr_closes` is a setting, not a constant**, stored with the rest of the letter configuration
   (`doc_sign_cfg` in `app_settings`, read and written by `GET`/`PUT /settings/doc-sign`) and read on
   every signature — turning it on takes effect on the next signature, not on restart. Off is the
   default because today's letters end at HR's desk, not HR's approve button (S10).
5. **The signed HTML is sanitized on write** (`services/html_safety.py`, S12) rather than on read, and
   with the standard library rather than a new dependency. Sanitizing on write means one bad payload
   can never be stored, and every reader (the employee app, the web view, a future HR screen, a file
   downloaded through `GET /documents/{id}/file`) is protected by the same code — while sanitizing on
   read would leave the raw payload in the database and in every backup. The rule applies to the HR
   letter body as well, not only to the employee's signature (D30).

**Still open (not a blocker, one line either way):** P7 names a leave `annual`/`remote` and calls
everything else «إجازة» on `/team/availability`. That is now known to be *stricter* than what the
approver sees; it protects only the managers who hold `view_team_leaves` without `view_team_requests`.
Say the word and `NAMED_LEAVE_TYPES` in `services/tasks.py` names every type instead.

**Flagged, not changed (follow-up entry 32):** the older `GET /documents/{id}/file` still lets an
account whose role is `manager` download **any** document of a report — the exact width S1 refuses for
the viewer. Narrowing it would change an endpoint the HR screens already use, so it is your call, and
it is recorded rather than done.

## Public brand and push tokens — ✅ Stage 6 (`services/brand.py`, `services/push.py`, `routers/public.py`, `routers/push.py`)

Two surfaces with one phone each: a phone that has **not** signed in still has to know what the
company looks like (the login screen, the splash and every palette — `brandInfo()` in
`src/lib/port.ts`, re-pulled by `theme.tsx` on foreground and every 90 s), and a phone that has signed
in has to leave its Expo token somewhere (`push.register()` in `src/lib/push.ts`). **Sending is not in
this stage** (class C): there is no sender, no queue and no outbound call anywhere — storage, and the
switch a later stage will read.

| Method | Path | Answer | Who |
|---|---|---|---|
| GET | `/public/brand` | the envelope of B1 | **nobody in particular** — no token, no session |
| POST | `/me/push-token` | `{ok: true}` — body `{token, platform}` | any signed-in account, its own row (T1) |
| GET | `/me/push-token` | `{ok, enabled, items: [{platform, created_at, last_seen_at}]}` — **never the token itself** | the caller, its own rows (T2) |
| DELETE | `/me/push-token` | `{ok, removed}` — body `{token?}`; without a token, **all** of mine | the token's owner; anybody else's token is `404` (T2) |
| GET | `/settings/push` | `{enabled, devices}` | HR/`admin`/`admin_manager`/`ceo` |
| PUT | `/settings/push` | `{enabled, devices}` — body `{enabled}`, a boolean or `422` | HR/`admin`/`admin_manager` |

**B1 — the whole of `/public/brand`, field by field.** This is the complete list; a field that is not
in it is not in the answer.

| Field | Read from | What is sent |
|---|---|---|
| `names.coAr`, `names.coEn` | `ariba_app_settings['company_names']` | the two strings, trimmed, at most 200 characters |
| `brand.p`, `brand.s`, `brand.a`, `brand.hero` | `brand_colors` | a `#rgb`/`#rrggbb` colour; an empty or unparsable value is left **out**, never guessed |
| `brand.heroImage` | `brand_colors.heroImage` | a raster `data:` URI, or nothing (B3) |
| `brand.punch` | `brand_colors.punch`, else `punch_watermark.data` | the same (HR edits the colour row; the old screens wrote the watermark row) |
| `brand.reset` | `brand_colors.reset` | `true` only when the stored value is literally `true` |
| `logo` | `company_logo.data` | the company logo — `null` when it is absent or refused (B3) |
| `appLogo` | `app_logo.data`, else `company_logo.data` | what `login.tsx` paints before sign-in |

Measured on the migrated database: `logo` 46,706 characters, `brand.punch` 44,646, `appLogo` = the
company logo (no separate `app_logo` row yet), **138,232 bytes** for the whole answer.

**B2 — nothing else in `ariba_app_settings` can reach this route.** It reads **five keys by name**
(`company_names`, `brand_colors`, `company_logo`, `app_logo`, `punch_watermark`) and copies named
fields out of each; the table's other rows are never selected, and that matters because some of them
are the most sensitive data the system holds: `hr_signer` (the HR manager's signature and stamp,
234 KB), `letterhead` (the letter page), `medical_form`, `ins_settings`, `doc_sign_cfg`,
`workflow_config`, `app_links`, `leave_carry`, `manager_team_salary`, `goals_config`,
`notify_email_since` and `push_config`. The same rule applies inside the rows it does read:
`company_logo` stores `{data, name, updated}` and only `data` leaves — not the file name HR uploaded,
not the timestamp. A wrong type, a colour that is not hex, an image that is not a raster `data:` URI
(an SVG can carry script, so SVG is **not** on the list) or a name that is not a string is *absent*
from the answer rather than passed through. Pinned by `test_only_the_five_named_keys_are_ever_read`,
`test_the_stored_row_keeps_its_other_fields_on_the_server`,
`test_a_colour_that_does_not_parse_is_dropped_not_passed_through`,
`test_an_image_must_be_an_embedded_raster`, and by the smoke's ten "no `hr_signer` / no `letterhead` /
…" checks against the live database.

**B3 — a cap and a cache, because the answer is large and public.** The stored logo is ~46 KB of
base64 and the punch picture ~44 KB; a settings row has no ceiling, so each image field is capped at
`MAX_IMAGE_CHARS` (512 KiB) and a bigger one is treated as **absent** — a half-sent data URI would
render as a broken image, and truncating it would be worse than the wordmark fallback the login
screen already has. The answer is identical for every caller, so it is served
`Cache-Control: public, max-age=300, must-revalidate` with an `ETag` (a hash of the answer) and
answers **`304`** with an empty body when the phone sends it back; `If-None-Match: *`, a list and the
weak `W/` form are honoured. `core/security.py` keeps the `Cache-Control` a route sets — every other
answer still says `no-store` — and the blanket `Content-Security-Policy: default-src 'none'` is
unchanged on this route too (it is JSON; the policy costs nothing and closes the door on a browser
being talked into rendering it).


**T1 — a token belongs to the account that registers it.** The token is the primary key of
`ariba_push_tokens`, so `POST /me/push-token` is an upsert: it writes the caller's `account_id`, and a
phone that signs in as somebody else moves the row to that account (the same install is the same
device). One account may hold several tokens. The format is checked **before** anything is written —
`ExponentPushToken[…]` or `ExpoPushToken[…]`, at most 210 characters, `platform` one of `android`,
`ios` — and anything else is `422` with nothing stored, because a token that cannot be delivered to is
a row that fails on every future send.

**T2 — nobody lists anybody's tokens, and no route ever returns one.** `GET /me/push-token` takes no
account parameter (the account is the caller's, from the session) and answers `platform` +
`created_at` + `last_seen_at`: the token text is not in the query, so it cannot appear in the answer.
`DELETE` removes **one of mine** (body `{token}`) or **all of mine** (body `{}` — what the app sends
when it has lost its token); a token that belongs to another account is `404 not_found`, the same
answer as one that does not exist, and removes nothing. Both writes are audited **without the token**
(`push_token_register {platform}`, `push_token_delete {all, count}`) — the row is the evidence, the
credential is not (S9's principle, applied to a device).


**T3 — a token dies with the session.** `POST /auth/logout` deletes every token of the account,
`PATCH /auth/users/{id}` with `is_active: false` deletes them, and a temporary password (which already
kills the sessions) deletes them too. The app sends its own delete on sign-out; the server does not
depend on it having got that far. Every read also joins `ariba_auth_accounts` on `active`, so a row
that survives a path nobody thought of still cannot reach a disabled account.

**T4 — sending stays off.** `push_config` ships absent, so `enabled` is `false`; `PUT /settings/push`
is the switch HR will flip when a sender exists, and it is read on every registration and every device
read, so flipping it needs no restart. With it off, a registration writes **one row and nothing else**
— no bell entry, no e-mail, no outbound request — which the unit test pins by counting the statements
a registration issues and the smoke pins by counting the caller's notifications before and after.
There is no sender in the codebase to switch on.

| # | Caller → route | Answer |
|---|---|---|
| N1 | an anonymous client → `GET /public/brand` | `200`, and the body carries none of `hr_signer`, `letterhead`, `medical_form`, `doc_sign_cfg`, `ins_settings`, `workflow_config`, `push_config`, `sigs`, `stamp` |
| N2 | the same → `GET /public/brand` when a stored image is over the cap | that field is absent (`null`), never truncated |
| N3 | the same → `GET /public/brand` with `If-None-Match` equal to the answer's `ETag` | `304`, empty body (and `200` again for a stale tag) |
| N4 | a signed-in employee → `POST /me/push-token {token: "not-a-token"}` | `422 invalid_token`, nothing written |
| N5 | the same → `{token: …, platform: "windows"}` | `422 invalid_platform`, nothing written |
| N6 | the same → a token over `TOKEN_MAX_CHARS` | `422 invalid_token`, nothing written |
| N7 | an employee → `GET /me/push-token` | his own rows, and the token text is in no field and at no depth |
| N8 | an employee → `DELETE /me/push-token {token: <HR's token>}` | `404 not_found`; HR's row is still there |
| N9 | an employee → `DELETE /me/push-token {}` | his own tokens only; HR's row untouched |
| N10 | an employee → `GET` or `PUT /settings/push` | `403 forbidden`, the switch unchanged |
| N11 | HR → `PUT /settings/push {enabled: "yes"}` (or `{}`, or `1`) | `422 invalid_request`, the switch unchanged |
| N12 | HR → `PATCH /auth/users/{id} {is_active: false}` for an account holding a token | `200`; that account's tokens are gone (T3) |
| N13 | the owner → `POST /auth/logout` | `204`; every token of that account is gone, and a fresh sign-in lists none |
| N14 | a device registered while the switch is off | nothing is sent and no bell row is written — the token is only stored |

**Not built, on purpose:** a sender (class C), a reminder job, and any HR screen for the device list.
`port.ts` has exactly the three token calls above and `push.ts` uses two of them, so nothing invents a
fourth.

## Announcements and greetings — ✅ Stage 7, rules approved by the owner 2 Nov 2026 (`services/announcements.py`, `routers/announcements.py`, migration `003_announcements.sql`)

The screen is the home card «الإعلانات والتهاني» (`src/components/announcements.tsx`). It calls one route,
`GET /me/announcements`, and expects `{ok, items: [{id, kind, occasion, title, body, pinned, created_at}]}`
(`src/lib/api.ts`). The bell already knows the kinds `announcement` and `greeting` (`Notification.kind`).
Neither `hr-web` nor the app has a screen for **writing** one, so HR's side is API-only in this stage,
like the Stage 2 permissions (#28). The client's reference (`port_announcements.py`, their
`002_announcements.sql`) is the guide for the table shape; it is not copied, and three of its choices are
deliberately changed (A5, A9, A10).

| Method | Path | Answer | Who |
|---|---|---|---|
| GET | `/me/announcements` | `{ok, items}`: the card's shape above, at most 10 | any signed-in account, its own items only (A3) |
| GET | `/announcements` | `{ok, items}`: every non-hidden row with `audience`, `employer_id`, `recipients` (count), `pinned`, `expires_on`, `source`, `created_at` | HR (`hr`/`admin`/`admin_manager`) only (A2) |
| POST | `/announcements` | `{ok, id, sent}`; body `{kind, title, body?, occasion?, audience, employer_id?, employee_ids?, pinned?, expires_on?}` | HR only |
| PATCH | `/announcements/{id}` | `{ok}`; body any of `{title, body, pinned, expires_on}` | HR only (A6) |
| DELETE | `/announcements/{id}` | `{ok}`: hides the row (A7) | HR only |
| GET | `/occasions` | `{ok, items: [{id, employee_id, name, occasion, occ_date, yearly, note}]}` | HR only (A10) |
| POST | `/occasions` | `{ok, id}`; body `{employee_id, occasion, occ_date, yearly?, note?}` | HR only |
| DELETE | `/occasions/{id}` | `{ok}`: hides the row | HR only |
| GET / PUT | `/settings/greetings` | `{enabled, birthday, anniversary, custom}`, all **off** by default | HR only (A9) |
| GET / PUT | `/settings/announcements` | `{email}`, **off** by default | HR only (A12) |
| POST | `/occasions/run-auto` | `{ok, sent}`: today's automatic greetings, once each | HR only (A9) |

### The table design (migration `003_announcements.sql`, two new tables, nothing existing changed)

- **`ariba_announcements`**: `id uuid`, `kind` (`announcement`/`greeting`), `occasion` (greetings only, from
  the list in A8), `title` (≤ 200), `body` (≤ 2000, plain text), `audience` (`all`/`employer`/`employees`),
  `employer_id smallint` → `employers(id)` (when `audience='employer'`), `employee_ids text[]` (when
  `audience='employees'`), `pinned`, `expires_on date`, `source` (`manual`/`auto`), `auto_key` (unique: one
  automatic greeting per person, occasion and year), `sent_count`, `hidden`, `created_by`, `created_at`,
  `updated_by`, `updated_at`. The column names match the client's table so a future client drop lines up;
  the one change is `employer_id` instead of the employer's *name* (a renamed employer would otherwise lose
  its announcements).
- **`ariba_emp_occasions`**: `id uuid`, `employee_id` → `employee_directory` (cascade), `occasion`, `occ_date`,
  `yearly`, `note`, `hidden`, `created_by`, `created_at`.
- Checks in the database as well as in the code: the `kind`, `audience` and `source` values, `title` not
  blank, and "`employer` needs an employer, `employees` needs at least one id".

**A1 — Recipients are today's employees.** When a row is sent, the server works out who receives it:
`all` means every employee who is `active` and not terminated (`isTerminated`/`term`); 22 people in
`ariba_src` today, never the 84 former staff. `employer` is those of them with that `employer_id`.
`employees` is the listed ids, and **every** id must be a current employee: one that is not makes the
whole request `422 invalid_recipients` with the list of the ids that cannot receive, and nothing is
written. (HR is the only caller, so naming those ids back to HR leaks nothing.)

**A2 — Only HR writes, and only HR lists.** `hr`/`admin`/`admin_manager` create, edit, hide and list.
The CEO, managers and employees get `403` on every HR route; they read announcements the same way as
everybody else, through their own card (A3). The HR list carries a recipient **count**, never the
recipients' names. A targeted greeting ("congratulations on your newborn") is about one person's life,
so it is not shown to the CEO by default (decision D6).

**A3 — The card shows only what is addressed to me, and only while it is current.**
`GET /me/announcements` returns rows that are not hidden and not expired (`expires_on` on or after today
in Riyadh), where:
- the row is an **announcement** that is pinned or less than 14 days old, or a **greeting** less than 24
  hours old (the app filters again for an app left open overnight);
- the audience matches me **now**: `all`, or `employer` = my current employer, or my id is in
  `employee_ids`.

They are ordered pinned first, then newest, with at most 10. An account with no employee record (a pure
admin login) sees only `all`.

**A4 — The card never shows who else got it.** The answer has exactly the seven fields above.
`audience`, `employer_id`, `employee_ids`, `sent_count`, `created_by`, `source` and `auto_key` are not
selected for `/me`. A greeting sent to three people does not tell any of them who the other two are.

**A5 — The bell rings once, for the right person only.** Sending writes one `workflow_notifications`
row per recipient, with `kind='announcement'` or `'greeting'`. `GET /me/notifications` gets one
additive change: those two kinds are passed through as themselves with `target: "index"`, instead of
being turned into the "approved/rejected" kinds as today. **Changed from today's bell:** HR accounts
see every entry addressed to the HR pool (`ariba_hr_pool()`, employee 40 today). For these two kinds
that would show a colleague's personal greeting to every HR account, so **announcement and greeting
entries are never forwarded through the pool**: each person sees only their own.

**A6 — Editing fixes the wording, not the audience.** `PATCH` may change `title`, `body`, `pinned` and
`expires_on`, with the same limits as on create. `kind`, `occasion`, `audience` and the recipients
cannot change, because the bell entries have already been delivered to those people. To reach other
people, send a new announcement. An edit changes what the card shows and **does not ring the bell
again**; the bell entries already sent keep their original text (they are the delivery record).

**A7 — "Delete" hides, and takes it out of every bell (D4).** `DELETE` sets `hidden`. The row leaves the
card and the HR list at once, and stays in the table for the record (with the audit row). Its bell
entries are **deleted**, through the link table `ariba_announcement_notifs`, so nobody's bell keeps a
withdrawn notice; a "withdrawn" placeholder was not chosen, because it would still tell people that
something had been sent. An e-mail that already went out cannot be recalled (e-mail is off today, #7).
A hidden or unknown id is `404` on `PATCH` and `DELETE`.

**A8 — Occasions are an allow-list.** A greeting's `occasion` and an `ariba_emp_occasions.occasion` must
be one of `birthday`, `anniversary`, `graduation`, `wedding`, `newborn`, `promotion`, `achievement`,
`other`. Anything else is `422`. The client's list also has **`recovery` (الشفاء)**: that is health
information, so it is **left out** until HR confirms they want it (decision D2). An announcement has no
occasion (it is stored as `null`).

**A9 — Automatic greetings are off, and only HR can run them.** `/settings/greetings`
(`ariba_app_settings['occasions_auto']`, the client's key) ships with `enabled: false`. With it on,
`POST /occasions/run-auto` sends today's birthday, work-anniversary and registered-occasion greetings
(each part has its own switch), **each only to the person it is about**: colleagues never learn
someone's birthday or age. `auto_key` makes a second run on the same day send nothing.
**Changed from the client's code:**
- there, *any* signed-in account could trigger the run; here it is HR only;
- nothing runs on a timer in this stage. A daily automatic run is decision D3.

**A10 — Personal occasions are HR's notes.** `ariba_emp_occasions` holds dates from people's private
lives (a wedding, a newborn). Only HR lists, adds or hides them. Nobody else, the employee included, has
a route to them in this stage. Every write is audited (the client's code audited none).

**A11 — Plain text, length-limited, audited.**
- **Text:** `title` is required, trimmed, at most 200 characters, and over 200 is `422`, not cut.
  `body` is at most 2000 characters.
- **Never HTML, and defanged on write:** both are plain **text**. Control characters are dropped, and
  migration 003 attaches the database's existing `ariba_sanitize` trigger (the one already on
  `workflow_notifications`, `employee_directory`, `workflow_requests` and 14 other tables), which stores
  `<`, `>` and `"` as look-alike characters. So `<script>` arrives as harmless text on the card and in
  the bell alike. The app prints both with `<T>`, and any future HR screen must not render them as HTML.
- **Dates:** `expires_on` is `YYYY-MM-DD` and not in the past.
- **Audit:** every create, edit, hide, occasion write, settings change and automatic run appends
  `ariba_audit_log` with the id, kind, audience and recipient count, **never the body**. Reading the
  card is not audited (it is a notice board, not a personal file).

**A12 — E-mail is a separate switch, and greetings are never mailed (D5).** Even once e-mail is on (#7),
the sender (`services/notify_email.py`) skips every `greeting` bell row, and skips `announcement` rows
unless HR turns on `/settings/announcements` `{email: true}` (`ariba_app_settings['announcements_mail']`,
**off** by default). No push is sent: there is still no sender (#37).

### The refusals the negative tests pin

| # | Who → what | Expected |
|---|---|---|
| N1 | employee, manager, CEO → `POST`/`PATCH`/`DELETE /announcements`, `GET /announcements` | 403 `forbidden`, nothing written |
| N2 | employee → `GET /me/announcements` with a greeting addressed to a colleague | not in the list |
| N3 | employee of employer A → an `employer` announcement for employer B | not in the list |
| N4 | anybody → `/me/announcements` | each item has exactly the seven keys; no `employee_ids`/`audience`/`created_by` anywhere in the JSON |
| N5 | HR → `POST` with one former employee among `employee_ids` | 422 `invalid_recipients` naming that id; no row and no bell entry written |
| N6 | HR account → bell, after a greeting to employee 40 (the HR pool) | not in the HR account's bell |
| N7 | anybody → a greeting older than 24 h, an announcement older than 14 days and not pinned, an expired one, a hidden one | not in the card |
| N8 | HR → `PATCH` trying to change `audience`/`employee_ids`/`kind` | 422; recipients unchanged |
| N9 | HR → `PATCH`/`DELETE` an unknown or hidden id | 404 `not_found` |
| N10 | employee, manager, CEO → `/occasions` (any method), `/settings/greetings`, `/occasions/run-auto` | 403 |
| N11 | HR → `run-auto` with the switch off | `{sent: 0}`, nothing written |
| N12 | HR → `run-auto` twice on the same day with it on | the second run sends 0 |
| N13 | HR → occasion `recovery`, or any value off the list | 422 |
| N14 | HR → title of 201 characters, an `expires_on` in the past, `audience='employer'` with no employer | 422 |

### Decisions (owner, 2 Nov 2026)
- **D1:** may a manager send an announcement to their own team? **No**, HR only (default kept).
- **D2:** should `recovery` (health) be an occasion? **No** (default kept). Whether the occasion notes
  should exist at all is for HR to confirm (FOLLOW_UPS #44).
- **D3:** should automatic greetings run daily by themselves? **No** (default kept): the switch is off
  and only HR can run them.
- **D4:** when HR deletes an announcement, it **disappears from the bells too** (A7).
- **D5:** announcements are **not** e-mailed by default (a switch that ships off) and greetings are
  **never** e-mailed (A12).
- **D6:** may the CEO read the HR list? **No** (default kept).

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
