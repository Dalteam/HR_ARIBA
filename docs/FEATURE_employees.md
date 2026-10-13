# Feature: employees

## What it does
- Directory with tabs **all / active / terminated / Tamheer / training / consultants / Saudi / non-Saudi**,
  workplace and department filters, search (number, Arabic/English name, job title), sort, pagination, tab counts.
- Employee record in 5 tabs: basic data · documents (numbers + expiries with days-left badges) · contract ·
  salary · dependents (next phase).
- Create (HR/admin), edit (PATCH, only changed fields are sent), end service (date + labour-law article + reason),
  reactivate, create a login / issue a temporary password.
- Dashboard headcount KPIs and Saudization % from `/employees/counts`.

## Rules
- `emp_no` is unique, lower-cased, and becomes the username (`emp084`).
- Fixed-term contracts: end date = join + duration (see BUSINESS_RULES › Contracts). Indefinite: no end date.
- Non-Saudis are always on the `non_saudi` GOSI system. Saudis default to `matching`; HR may pick `non_matching`.
- SAR always has exchange rate 1.
- An employee can't be their own manager; manager, workplace, department and nationality must exist.
- Termination date can't be before the join date. Terminating twice or reactivating an active employee → 409.

## Visibility (server-side)
| Role | Sees | Salary | Full IDs |
|---|---|---|---|
| employee | self | own | own |
| manager | self + direct reports | own only | own only |
| finance | no directory (payroll endpoints later) | — | — |
| hr, admin | all | ✔ | ✔ |
| ceo | all | ✘ | ✘ (masked) |

Lists always show the masked ID and never salaries. Records outside the caller's scope return 404.
Reads and writes are audited (`employee` entity: list, read, create, update, terminate, reactivate).

## Code
- Backend: `services/employees.py`, `services/contracts.py`, `services/saudization.py`, `routers/employees.py`, `routers/settings.py`
- Frontend: `lib/employees.ts`, `app/employees/`, `app/employees/[id]/`, `app/employees/new/`, `components/employees/employee-form.tsx`, `app/dashboard/`, `app/me/`
- Tests: `tests/test_employees.py`, `tests/test_permissions.py`

## Known limits
- The manager picker loads the first 100 employees (enough for today's ~85; replace with search if that grows).
- Dependents and document uploads arrive in the next phase.
