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
