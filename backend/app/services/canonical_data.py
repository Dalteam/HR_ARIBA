"""Read the canonical Supabase tables into the shapes the pure calculation services expect.

The calc engines (leave ledger, punch rules) were verified number-for-number against the legacy app; here they
are fed from `employee_directory` (+ its `data` JSONB), `public_holidays` and `workflow_requests` instead of the
retired ORM tables. Nothing here writes.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.leave import HolidayCalendar, LeaveBook


def _d(v: Any) -> date | None:
    if not v:
        return None
    if isinstance(v, date):
        return v
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        return None


@dataclass(frozen=True)
class EmpView:
    """The fields the leave engine reads, taken from one employee_directory row."""

    id: str
    name_ar: str
    join_date: date | None
    termination_date: date | None
    annual_leave_days: float
    data: dict

    @property
    def is_terminated(self) -> bool:
        return self.termination_date is not None


def emp_view(row: dict[str, Any]) -> EmpView:
    d = dict(row.get("data") or {})
    terminated = not row.get("active", True) or d.get("isTerminated") or d.get("term")
    end = _d(d.get("terminationDate")) or _d(d.get("lastDay")) if terminated else None
    if terminated and end is None:
        end = _d(row.get("updated_at")) or date.today()
    try:
        annual = float(d.get("leaveDaysContract") or 21)
    except (TypeError, ValueError):
        annual = 21.0
    return EmpView(
        id=str(row["employee_id"]),
        name_ar=row.get("name_ar") or d.get("nameAr") or d.get("name_ar") or str(row["employee_id"]),
        join_date=_d(row.get("join_date")) or _d(d.get("contractJoin")) or _d(d.get("join_date")),
        termination_date=end,
        annual_leave_days=annual,
        data=d,
    )


def employees(db: Session, *, active_only: bool = False, employee_id: str | None = None) -> list[EmpView]:
    sql = "SELECT employee_id,name_ar,join_date,active,data,updated_at FROM public.employee_directory"
    params: dict[str, Any] = {}
    if employee_id is not None:
        sql += " WHERE employee_id=:eid"
        params["eid"] = employee_id
    elif active_only:
        sql += " WHERE active"
    rows = [dict(r) for r in db.execute(text(sql + " ORDER BY name_ar"), params).mappings()]
    return [emp_view(r) for r in rows]


def holidays(db: Session) -> HolidayCalendar:
    rows = db.execute(text("SELECT DISTINCT holiday_date,days,recurring FROM public.public_holidays")).all()
    return HolidayCalendar([(r[0], int(r[1] or 1), bool(r[2])) for r in rows if r[0]])


def approved_annual(db: Session) -> dict[str, list[tuple[date, date]]]:
    """Approved annual leave per employee from workflow_requests (payload from/to), each period once."""
    out: dict[str, set[tuple[date, date]]] = {}
    for eid, payload in db.execute(text(
        "SELECT employee_id,payload FROM public.workflow_requests WHERE request_type='annual' AND status='approved'"
    )).all():
        p = payload or {}
        f, t = _d(p.get("from") or p.get("from_date")), _d(p.get("to") or p.get("to_date"))
        if f:
            out.setdefault(str(eid), set()).add((f, t or f))
    return {k: sorted(v) for k, v in out.items()}


def leave_book(db: Session, today: date, emps: list[EmpView] | None = None) -> LeaveBook:
    """LeaveBook fed from employee_directory.data: leaveYearOverrides, leaveHistoryByYear, leaveEosExcess."""
    data: dict[str, dict] = {}
    for e in emps if emps is not None else employees(db):
        d = e.data
        entry: dict[str, Any] = {}
        if isinstance(d.get("leaveYearOverrides"), dict):
            entry["years"] = d["leaveYearOverrides"]
        if isinstance(d.get("leaveHistoryByYear"), dict):
            entry["used_history"] = d["leaveHistoryByYear"]
        try:
            if float(d.get("leaveEosExcess") or 0):
                entry["eos_excess"] = float(d["leaveEosExcess"])
        except (TypeError, ValueError):
            pass
        if entry:
            data[e.id] = entry
    return LeaveBook(holidays=holidays(db), data=data, adjustments=[], approved_annual=approved_annual(db), today=today)
