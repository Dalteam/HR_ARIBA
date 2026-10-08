"""Annual leave ledger — a line-for-line port of the V114 HTML engine
(frontend/legacy/hr-portal/js/calculations/02-workdays-holidays.js and 03-leave-balance-engine.js, docs §4.3).

Rules (as in the legacy code):
- Workday = not Friday/Saturday and not an official holiday (multi-day holidays expanded; recurring ones moved to the year).
- Accrual = min(annual, annual × workdays(start..end) / workdays(full year)), start = max(join, 1 Jan).
- Used = baseline (imported history / override.used) + approved annual requests that start in the year
  (requests that start before override.asOf are already inside the imported baseline).
- Carry into a year: override.carry → 0 in the join year → 2024: close(2023) − 10 → previous override.carryNext (≤10)
  → min(10, close(previous year)).
- Close = max(0, opening + entitlement + adjustment − used); carry to next = min(10, close); EOS excess = close − 10 (from 2024).
- Current = override.current, else max(0, carry + accrued(today) + manual(today) − used(today)).

Floats are used on purpose: the legacy code used JS numbers, and results are rounded only for display.

Storage: leave_year_overrides (HR's figures per employee/year, NULL = computed), leave_adjustments (+/- deltas and
replace_year snapshots), employees.leave_eos_excess. load_book() turns them into the legacy shapes the engine reads.

Not replicated on purpose: the legacy approveLv also added the days to `leaveUsed<year>` while the approved request was
counted again by leaveDefaultUsed (double counting). Here an approved request is counted once.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Employee, Holiday, LeaveAdjustment, LeaveYearOverride, Request, RequestStatus, RequestType

CARRY_CAP = 10


def _d(v) -> date | None:
    if not v:
        return None
    if isinstance(v, date):
        return v
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        return None


@dataclass
class HolidayCalendar:
    rows: list[tuple[date, int, bool]]  # (start, days, recurring)
    _cache: dict[int, frozenset[date]] = field(default_factory=dict)

    def for_year(self, y: int) -> frozenset[date]:
        if y not in self._cache:
            out: set[date] = set()
            for base, days, recurring in self.rows:
                if recurring:
                    try:
                        start = date(y, base.month, base.day)
                    except ValueError:  # 29 Feb in a non-leap year: JS rolls over to 1 Mar
                        start = date(y, 3, 1)
                elif base.year != y:
                    continue
                else:
                    start = base
                for i in range(max(1, int(days or 1))):
                    out.add(start + timedelta(days=i))
            self._cache[y] = frozenset(out)
        return self._cache[y]

    def is_holiday(self, d: date) -> bool:
        return d in self.for_year(d.year)


def is_workday(d: date) -> bool:
    # JS getDay(): Friday = 5, Saturday = 6. Python weekday(): Friday = 4, Saturday = 5.
    return d.weekday() not in (4, 5)


class LeaveBook:
    """Everything the ledger needs, loaded once. `today` is injectable for tests."""

    def __init__(
        self,
        *,
        holidays: HolidayCalendar,
        data: dict,
        adjustments: list[dict],
        approved_annual: dict[str, list[tuple[date, date]]],
        today: date,
    ):
        self.holidays = holidays
        self.data = data or {}
        self.adjustments = adjustments or []
        self.approved = approved_annual
        self.today = today
        self._memo: dict = {}

    # ------------------------------------------------------------------ calendar
    def count_workdays(self, start: date | None, end: date | None) -> int:
        if not start or not end or start > end:
            return 0
        key = ("wd", start, end)
        if key not in self._memo:
            n, d = 0, start
            while d <= end:
                if is_workday(d) and not self.holidays.is_holiday(d):
                    n += 1
                d += timedelta(days=1)
            self._memo[key] = n
        return self._memo[key]

    def workdays_in_year(self, y: int) -> int:
        return self.count_workdays(date(y, 1, 1), date(y, 12, 31))

    # ------------------------------------------------------------------ employee data
    def _emp(self, emp: Employee) -> dict:
        return self.data.get(str(emp.id)) or {}

    def override(self, emp: Employee, y: int) -> dict | None:
        o = (self._emp(emp).get("years") or {}).get(str(int(y)))
        return o if isinstance(o, dict) else None

    @staticmethod
    def annual(emp: Employee) -> float:
        return max(0.0, float(emp.annual_leave_days or 21) or 21.0)

    def start_year(self, emp: Employee) -> int:
        return emp.join_date.year if emp.join_date else self.today.year

    # ------------------------------------------------------------------ pieces
    def accrued(self, emp: Employee, y: int, to: date | None = None) -> float:
        end0 = to or date(y, 12, 31)
        y_start, y_end = date(y, 1, 1), date(y, 12, 31)
        annual, join = self.annual(emp), emp.join_date
        if join and join > y_end:
            return 0.0
        start = join if join and join > y_start else y_start
        end = min(end0, y_end)
        if end < start:
            return 0.0
        full = self.workdays_in_year(y)
        if full <= 0:
            return 0.0
        return min(annual, max(0.0, annual * (self.count_workdays(start, end) / full)))

    def default_used(self, emp: Employee, y: int, to: date | None = None) -> float:
        end = to or date(y, 12, 31)
        o = self.override(emp, y)
        snapshot = _d(o.get("asOf")) if o else None
        req = 0
        for f, t in self.approved.get(str(emp.id), []):
            if f.year != y or f > end:
                continue
            if snapshot and f < snapshot:
                continue  # already inside the imported balance
            req += self.count_workdays(f, min(t, end))
        hist = self._emp(emp)
        baseline = max(
            float((hist.get("used_history") or {}).get(str(y), 0) or 0),
            float((o or {}).get("used", 0) or 0),
        )
        return baseline + req

    def manual_net(self, emp: Employee, y: int, to: date | None = None) -> float:
        end = to or date(y, 12, 31)
        total = 0.0
        for a in self.adjustments:
            if str(a.get("employee_id")) != str(emp.id):
                continue
            d = _d(a.get("date"))
            if d and d.year == y and d <= end:
                total += float(a.get("delta") or 0)
        return total

    def carry_forward(self, emp: Employee, y: int) -> float:
        o = self.override(emp, y)
        if o and o.get("carry") is not None:
            return max(0.0, float(o["carry"] or 0))
        if y == self.start_year(emp):
            return 0.0
        if y == 2024:
            return max(0.0, self.year_closing(emp, 2023) - CARRY_CAP)
        prev = self.override(emp, y - 1)
        if prev and prev.get("carryNext") is not None:
            return min(CARRY_CAP, max(0.0, float(prev["carryNext"] or 0)))
        return min(CARRY_CAP, max(0.0, self.year_closing(emp, y - 1)))

    def ledger(self, emp: Employee, y: int) -> dict:
        key = ("ledger", emp.id, y)
        if key in self._memo:
            return self._memo[key]
        o = self.override(emp, y)
        opening = self.carry_forward(emp, y)
        has = lambda k: o is not None and o.get(k) is not None  # noqa: E731
        entitlement = max(0.0, float(o["entitlement"] or 0)) if has("entitlement") else self.accrued(emp, y)
        used = max(0.0, float(o["used"] or 0)) if has("used") else self.default_used(emp, y)
        adjustment = float(o["adjustment"] or 0) if has("adjustment") else self.manual_net(emp, y)
        close = (
            max(0.0, float(o["yearEnd"] or 0))
            if has("yearEnd")
            else max(0.0, opening + entitlement + adjustment - used)
        )
        out = {
            "year": y,
            "opening": opening,
            "entitlement": entitlement,
            "used": used,
            "adjustment": adjustment,
            "close": close,
            "carry": min(CARRY_CAP, max(0.0, close)),
            "eos": max(0.0, close - CARRY_CAP) if y >= 2024 else 0.0,
            "override": o,
        }
        self._memo[key] = out
        return out

    def year_closing(self, emp: Employee, y: int) -> float:
        o = self.override(emp, y)
        if y < self.start_year(emp):
            return 0.0
        if o and o.get("yearEnd") is not None:
            return max(0.0, float(o["yearEnd"] or 0))
        if y == self.today.year:
            end = date(y, 12, 31)
            return max(
                0.0,
                self.carry_forward(emp, y) + self.accrued(emp, y, end) + self.manual_net(emp, y) - self.default_used(emp, y, end),
            )
        return self.ledger(emp, y)["close"]

    def year_excess(self, emp: Employee, y: int) -> float:
        return max(0.0, self.year_closing(emp, y) - CARRY_CAP)

    def current(self, emp: Employee) -> float:
        y, now = self.today.year, self.today
        o = self.override(emp, y)
        if o and o.get("current") is not None:
            return max(0.0, float(o["current"] or 0))
        return max(
            0.0,
            self.carry_forward(emp, y) + self.accrued(emp, y, now) + self.manual_net(emp, y, now) - self.default_used(emp, y, now),
        )

    def accumulated_eos(self, emp: Employee, end_year: int | None = None) -> float:
        start = max(2024, self.start_year(emp))
        end = end_year or self.today.year
        total = float(self._emp(emp).get("eos_excess") or 0)
        for y in range(start, end):
            total += self.year_excess(emp, y)
        return max(0.0, total)

    def _cumulative(self, emp: Employee, field_: str, fn) -> float:
        cy, total = self.today.year, 0.0
        for y in range(self.start_year(emp), cy + 1):
            o = self.override(emp, y)
            if o and o.get(field_) is not None and (y < cy or field_ == "adjustment"):
                v = float(o[field_] or 0)
                total += v if field_ == "adjustment" else max(0.0, v)
            else:
                total += fn(emp, y, self.today if y == cy else date(y, 12, 31))
        return total

    def cumulative_accrued(self, emp: Employee) -> float:
        return self._cumulative(emp, "entitlement", self.accrued)

    def cumulative_used(self, emp: Employee) -> float:
        return self._cumulative(emp, "used", self.default_used)

    def cumulative_manual(self, emp: Employee) -> float:
        return self._cumulative(emp, "adjustment", self.manual_net)

    def used_through(self, emp: Employee, end: date) -> float:
        """Legacy payroll `usedThrough`: annual leave taken from the start of service up to `end`."""
        total = 0.0
        for y in range(self.start_year(emp), end.year + 1):
            o = self.override(emp, y)
            if o and o.get("used") is not None and y < end.year:
                total += max(0.0, float(o["used"] or 0))
            else:
                total += self.default_used(emp, y, end if y == end.year else date(y, 12, 31))
        return round(total, 2)

    def summary(self, emp: Employee) -> dict:
        """One row of the legacy balances table (rLvBal)."""
        y = self.today.year
        if emp.is_terminated:
            # V93: a terminated employee's balance is frozen at their last year's year-end override.
            years = self._emp(emp).get("years") or {}
            last = emp.termination_date.year if emp.termination_date else None
            use = str(last) if last and str(last) in years else (max(years, key=int) if years else None)
            frozen = years.get(use, {}).get("yearEnd") if use else None
            current = round(float(frozen), 2) if frozen is not None else round(self.current(emp), 2)
        else:
            current = round(self.current(emp), 2)
        accrued, used = self.cumulative_accrued(emp), self.cumulative_used(emp)
        return {
            "employee_id": str(emp.id),
            "carry": round(self.carry_forward(emp, y), 2),
            "current": current,
            "year_end": round(self.year_closing(emp, y), 2),
            "accrued_since_join": round(accrued, 2),
            "used_since_join": round(used, 2),
            "remaining_since_join": round(max(0.0, accrued - used + self.cumulative_manual(emp)), 2),
            "eos": round(self.accumulated_eos(emp, y) + self.year_excess(emp, y), 2),
        }

    def years(self, emp: Employee) -> list[dict]:
        out = []
        for y in range(self.start_year(emp), self.today.year + 1):
            led = self.ledger(emp, y)
            out.append({k: (round(v, 2) if isinstance(v, float) else v) for k, v in led.items() if k != "override"}
                       | {"override": led["override"]})
        return out


_OV = {"carry": "carry", "entitlement": "entitlement", "used": "used", "adjustment": "adjustment", "year_end": "yearEnd",
       "carry_next": "carryNext", "current_balance": "current", "eos": "eos"}


def load_book(db: Session, today: date) -> LeaveBook:
    hol = HolidayCalendar([(h.start_date, h.days, h.is_recurring) for h in db.scalars(select(Holiday))])
    approved: dict[str, list[tuple[date, date]]] = {}
    q = select(Request).where(Request.type == RequestType.annual, Request.status == RequestStatus.approved)
    for r in db.scalars(q):
        if r.from_date:
            approved.setdefault(str(r.employee_id), []).append((r.from_date, r.to_date or r.from_date))
    data: dict = {}
    for e_id, eos in db.execute(select(Employee.id, Employee.leave_eos_excess).where(Employee.leave_eos_excess != 0)):
        data.setdefault(str(e_id), {})["eos_excess"] = float(eos)
    for o in db.scalars(select(LeaveYearOverride)):
        entry = data.setdefault(str(o.employee_id), {})
        y = {legacy: float(getattr(o, col)) for col, legacy in _OV.items() if getattr(o, col) is not None}
        if o.as_of:
            y["asOf"] = o.as_of.isoformat()
        entry.setdefault("years", {})[str(o.year)] = y
        if o.used_history is not None:
            entry.setdefault("used_history", {})[str(o.year)] = float(o.used_history)
    adjustments = [
        {"employee_id": str(a.employee_id), "date": a.entry_date.isoformat(), "delta": float(a.delta)}
        for a in db.scalars(select(LeaveAdjustment).where(LeaveAdjustment.delta.is_not(None)))
    ]
    return LeaveBook(holidays=hol, data=data, adjustments=adjustments, approved_annual=approved, today=today)


def request_days(book: LeaveBook, type_: RequestType, start: date, end: date) -> int:
    """Days of a request: annual = workdays (no Fri/Sat, no holidays); other types = calendar days (legacy rule)."""
    if type_ == RequestType.annual:
        return book.count_workdays(start, end)
    return (end - start).days + 1

