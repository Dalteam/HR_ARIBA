"""Attendance records (الحضور والانصراف): manual HR entry, late/early minutes, monthly summary.

The geofenced employee punch (mobile app) will land here too; the web HR screen only needs manual
records, the per-day list and the monthly summary.
"""

import calendar
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import not_found
from app.core.scheduling import RIYADH
from app.models import AttendanceRecord, AttendanceSettings, AttendanceSource, AttendanceStatus, Employee, Location, User
from app.schemas import AttendanceCreate, AttendanceOut, AttendanceSummaryOut, AttendanceUpdate


def settings(db: Session) -> AttendanceSettings | None:
    return db.scalar(select(AttendanceSettings))


def _hm(s: str | None) -> tuple[int, int] | None:
    if not s:
        return None
    h, m = s.split(":")
    return int(h), int(m)


def _dt(d: date, hm: tuple[int, int] | None) -> datetime | None:
    if d is None or hm is None:
        return None
    return datetime(d.year, d.month, d.day, hm[0], hm[1], tzinfo=RIYADH)


def local(dt: datetime | None) -> datetime | None:
    """Riyadh wall time. Postgres hands timestamptz back in the session zone (UTC); SQLite hands it back naive."""
    if dt is None:
        return None
    return dt.replace(tzinfo=RIYADH) if dt.tzinfo is None else dt.astimezone(RIYADH)


def fmt(dt: datetime | None) -> str | None:
    return local(dt).strftime("%H:%M") if dt else None


def late_early(db: Session, tin: datetime | None, tout: datetime | None) -> tuple[int, int]:
    s = settings(db)
    if s is None:
        return 0, 0
    ws = s.work_start
    tol = s.tolerance_minutes
    work_end = ws.hour * 60 + ws.minute + int(Decimal(s.shift_hours) * 60)
    late = max(0, tin.hour * 60 + tin.minute - (ws.hour * 60 + ws.minute + tol)) if tin else 0
    early = max(0, work_end - tol - (tout.hour * 60 + tout.minute)) if tout else 0
    return late, early


def list_for_date(db: Session, work_date: date) -> list[AttendanceRecord]:
    return list(
        db.scalars(
            select(AttendanceRecord)
            .where(AttendanceRecord.work_date == work_date)
            .order_by(AttendanceRecord.created_at)
        )
    )


def get(db: Session, rec_id: uuid.UUID) -> AttendanceRecord:
    rec = db.get(AttendanceRecord, rec_id)
    if rec is None:
        raise not_found("Attendance record")
    return rec


def _find(db: Session, employee_id: uuid.UUID, work_date: date) -> AttendanceRecord | None:
    return db.scalar(
        select(AttendanceRecord).where(
            AttendanceRecord.employee_id == employee_id,
            AttendanceRecord.work_date == work_date,
        )
    )


def _apply(
    db: Session,
    rec: AttendanceRecord,
    *,
    work_date: date,
    time_in: str | None,
    time_out: str | None,
    location_id: uuid.UUID | None,
    status: AttendanceStatus,
    notes: str | None,
    user: User,
) -> None:
    tin = _dt(work_date, _hm(time_in))
    tout = _dt(work_date, _hm(time_out))
    rec.time_in = tin
    rec.time_out = tout
    rec.location_id = location_id
    rec.status = status
    rec.notes = notes
    rec.source = AttendanceSource.manual
    rec.created_by = user.id
    rec.late_minutes, rec.early_minutes = late_early(db, tin, tout)


def upsert(db: Session, data: AttendanceCreate, user: User) -> AttendanceRecord:
    """Adds a session (several sessions a day are allowed, legacy V117); edits go through update()."""
    rec = AttendanceRecord(employee_id=data.employee_id, work_date=data.work_date)
    db.add(rec)
    _apply(
        db,
        rec,
        work_date=data.work_date,
        time_in=data.time_in,
        time_out=data.time_out,
        location_id=data.location_id,
        status=data.status,
        notes=data.notes,
        user=user,
    )
    db.flush()
    return rec


def update(db: Session, rec: AttendanceRecord, data: AttendanceUpdate, user: User) -> list[str]:
    changed = []
    if data.time_in is not None:
        changed.append("time_in")
    if data.time_out is not None:
        changed.append("time_out")
    if data.location_id is not None:
        changed.append("location_id")
    if data.status is not None:
        changed.append("status")
    if data.notes is not None:
        changed.append("notes")
    tin = _dt(rec.work_date, _hm(data.time_in if data.time_in is not None else fmt(rec.time_in)))
    tout = _dt(rec.work_date, _hm(data.time_out if data.time_out is not None else fmt(rec.time_out)))
    rec.time_in = tin
    rec.time_out = tout
    if data.location_id is not None:
        rec.location_id = data.location_id
    if data.status is not None:
        rec.status = data.status
    if data.notes is not None:
        rec.notes = data.notes
    rec.source = AttendanceSource.manual
    rec.created_by = user.id
    rec.late_minutes, rec.early_minutes = late_early(db, tin, tout)
    return changed


def remove(db: Session, rec: AttendanceRecord) -> None:
    db.delete(rec)


def to_out(db: Session, rec: AttendanceRecord, emp: Employee | None, loc: Location | None) -> AttendanceOut:
    return AttendanceOut(
        id=rec.id,
        employee_id=rec.employee_id,
        employee_name=emp.name_ar if emp else "",
        workplace=emp.workplace.name_ar if emp and emp.workplace else None,
        work_date=rec.work_date,
        time_in=fmt(rec.time_in),
        time_out=fmt(rec.time_out),
        location_id=rec.location_id,
        location_name=loc.name if loc else None,
        status=rec.status,
        late_minutes=rec.late_minutes,
        early_minutes=rec.early_minutes,
        source=rec.source,
        notes=rec.notes,
    )


def summary(db: Session, year: int, month: int) -> list[AttendanceSummaryOut]:
    last = calendar.monthrange(year, month)[1]
    start, end = date(year, month, 1), date(year, month, last)
    emps = list(
        db.scalars(
            select(Employee)
            .where(Employee.deleted_at.is_(None), Employee.termination_date.is_(None))
            .order_by(Employee.name_ar)
        )
    )
    recs = db.scalars(
        select(AttendanceRecord).where(AttendanceRecord.work_date >= start, AttendanceRecord.work_date <= end)
    )
    # One status per employee per day: the first session of the day (legacy V117 grouping).
    first: dict[tuple[uuid.UUID, date], AttendanceRecord] = {}
    for r in sorted(recs, key=lambda x: (x.time_in is None, x.time_in.replace(tzinfo=None) if x.time_in else datetime.min)):
        first.setdefault((r.employee_id, r.work_date), r)
    counts: dict[uuid.UUID, dict[str, int]] = {}
    for (emp_id, _), r in first.items():
        c = counts.setdefault(emp_id, {"present": 0, "late": 0, "absent": 0, "leave": 0, "remote": 0})
        c[r.status.value] += 1
    zero = {"present": 0, "late": 0, "absent": 0, "leave": 0, "remote": 0}
    return [
        AttendanceSummaryOut(employee_id=e.id, employee_name=e.name_ar, **(counts.get(e.id, zero)))
        for e in emps
    ]
