"""Employee app punch (legacy `ariba_attendance` {p_action in/out, p_lat, p_lng}).

Rules (docs 3.2.4, 4.11, 4.12):
- Allowed locations: the employee's own work locations (V121), else every location of their workplace.
- Inside = haversine distance to the nearest located site <= its radius. Outside every site is refused
  (outside_geofence) unless one allowed location is «عن بعد» and the yearly remote limit is not used up.
- Several sessions a day (V117 «رجوع للعمل»); late minutes come from the day's first session only.
- Flexible hours (V86): the first check-in must be inside [window_start, window_end - shift_hours]
  (too_early / too_late_for_flexible_window); no late minutes; expected checkout = first in + shift hours,
  early minutes = expected - checkout. Without flexible hours the fixed start + tolerance rule applies.
"""

import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.core.scheduling import RIYADH, now_riyadh
from app.models import (
    AttendanceRecord,
    AttendanceSettings,
    AttendanceSource,
    AttendanceStatus,
    Employee,
    EmployeeLocation,
    Location,
    LocationType,
    PunchKind,
    Request,
)
from app.services import attendance as att
from app.services import geofence

DEFAULT_REMOTE_LIMIT = 10


def allowed_locations(db: Session, emp: Employee) -> list[Location]:
    base = select(Location).where(Location.deleted_at.is_(None), Location.is_active.is_(True))
    own = list(db.scalars(base.join(EmployeeLocation, EmployeeLocation.location_id == Location.id).where(EmployeeLocation.employee_id == emp.id)))
    if own:
        return own
    if emp.workplace_id is None:
        return []
    return list(db.scalars(base.where(Location.workplace_id == emp.workplace_id).order_by(Location.created_at)))


def sessions_on(db: Session, emp_id: uuid.UUID, day: date) -> list[AttendanceRecord]:
    recs = db.scalars(select(AttendanceRecord).where(AttendanceRecord.employee_id == emp_id, AttendanceRecord.work_date == day))
    return sorted(recs, key=lambda r: (r.time_in is None, att.local(r.time_in) or datetime.min.replace(tzinfo=RIYADH)))


def remote_used(db: Session, emp_id: uuid.UUID, year: int) -> int:
    return db.scalar(
        select(func.count(func.distinct(AttendanceRecord.work_date))).where(
            AttendanceRecord.employee_id == emp_id,
            AttendanceRecord.status == AttendanceStatus.remote,
            AttendanceRecord.work_date >= date(year, 1, 1),
            AttendanceRecord.work_date <= date(year, 12, 31),
        )
    ) or 0


def _minutes(t) -> int:
    return t.hour * 60 + t.minute


def _hhmm(m: int) -> str:
    return f"{m // 60 % 24:02d}:{m % 60:02d}"


def _shift_minutes(s: AttendanceSettings) -> int:
    return int(Decimal(s.shift_hours) * 60)


def expected_checkout(s: AttendanceSettings | None, first_in: datetime | None) -> str | None:
    if s is None or not s.flexible_enabled or first_in is None:
        return None
    return _hhmm(_minutes(att.local(first_in)) + _shift_minutes(s))


@dataclass
class Place:
    location: Location | None
    remote: bool
    distance_m: float | None


def _place(db: Session, emp: Employee, lat: float, lng: float, year: int, s: AttendanceSettings | None) -> Place:
    locs = allowed_locations(db, emp)
    near = geofence.nearest(locs, lat, lng)
    if near and near.inside:
        return Place(near.location, False, near.distance_m)
    remote = next((l for l in locs if l.type == LocationType.remote), None)
    if remote is not None:
        limit = s.remote_days_per_year if s else DEFAULT_REMOTE_LIMIT
        if remote_used(db, emp.id, year) >= limit:
            raise ApiError(409, "remote_limit_reached", "تجاوزت حد العمل عن بعد")
        return Place(remote, True, None)
    details = {"nearest": near.location.name, "distance_m": round(near.distance_m)} if near else None
    raise ApiError(409, "outside_geofence", "أنت خارج نطاق مواقع العمل المسموح بها", details)


def punch_in(db: Session, emp: Employee, lat: float, lng: float) -> AttendanceRecord:
    now = now_riyadh().replace(second=0, microsecond=0)
    today = now.date()
    day = sessions_on(db, emp.id, today)
    if any(r.time_in and r.time_out is None for r in day):
        raise ApiError(409, "already_checked_in", "سجلت حضورك بالفعل — سجّل الانصراف أولاً")
    s = att.settings(db)
    first = not day
    late = 0
    if first and s is not None and s.flexible_enabled:
        start, end, m = _minutes(s.window_start), _minutes(s.window_end), _minutes(now)
        if m < start:
            raise ApiError(409, "too_early_for_flexible_window", f"لا يمكن تسجيل الحضور قبل بداية الدوام المرن {_hhmm(start)}")
        if m + _shift_minutes(s) > end:
            raise ApiError(409, "too_late_for_flexible_window", f"لا يمكن تسجيل الحضور: الانصراف المتوقع يتجاوز نهاية الدوام المرن {_hhmm(end)}")
    elif first:
        late, _ = att.late_early(db, now, None)
    place = _place(db, emp, lat, lng, today.year, s)
    status = AttendanceStatus.remote if place.remote else (AttendanceStatus.late if late > 0 else AttendanceStatus.present)
    rec = AttendanceRecord(
        employee_id=emp.id,
        work_date=today,
        time_in=now,
        location_id=place.location.id if place.location else None,
        status=status,
        late_minutes=late,
        early_minutes=0,
        lat_in=Decimal(str(round(lat, 6))),
        lng_in=Decimal(str(round(lng, 6))),
        source=AttendanceSource.app,
    )
    db.add(rec)
    db.flush()
    return rec


def punch_out(db: Session, emp: Employee, lat: float, lng: float) -> AttendanceRecord:
    now = now_riyadh().replace(second=0, microsecond=0)
    day = sessions_on(db, emp.id, now.date())
        rec = next((r for r in reversed(day) if r.time_in and r.time_out is None), None)
    if rec is None:
        raise ApiError(409, "not_checked_in", "لا يوجد سجل حضور مفتوح اليوم")
    s = att.settings(db)
    if rec.status != AttendanceStatus.remote:
        _place(db, emp, lat, lng, now.year, s)
    rec.time_out = now
    rec.lat_out = Decimal(str(round(lat, 6)))
    rec.lng_out = Decimal(str(round(lng, 6)))
    expected = expected_checkout(s, day[0].time_in)
    if expected is not None:
        h, m = (int(x) for x in expected.split(":"))
        rec.early_minutes = max(0, h * 60 + m - _minutes(now))
    else:
        _, rec.early_minutes = att.late_early(db, None, now)
    db.flush()
    return rec


def history(db: Session, emp_id: uuid.UUID, days: int = 31) -> list[AttendanceRecord]:
    since = now_riyadh().date() - timedelta(days=days - 1)
    return list(
        db.scalars(
            select(AttendanceRecord)
            .where(AttendanceRecord.employee_id == emp_id, AttendanceRecord.work_date >= since)
            .order_by(AttendanceRecord.work_date.desc(), AttendanceRecord.time_in)
        )
    )


def record_forgot_punch(db: Session, req: Request) -> AttendanceRecord:
    """V114: an approved «نسيان بصمة» is written to the attendance log (check-in, check-out, or both).
    A missed check-out closes that day's open session when there is one."""
    day, kind = req.on_date, req.punch_kind
    tin = datetime.combine(day, req.time_from, tzinfo=RIYADH) if kind != PunchKind.check_out else None
    tout_t = req.time_from if kind == PunchKind.check_out else req.time_to
    tout = datetime.combine(day, tout_t, tzinfo=RIYADH) if tout_t else None
    note = "نسيان بصمة" + (f": {req.notes}" if req.notes else "")
    rec = None
    if kind == PunchKind.check_out:
        rec = next((r for r in reversed(sessions_on(db, req.employee_id, day)) if r.time_in and r.time_out is None), None)
    if rec is None:
        first = not sessions_on(db, req.employee_id, day)
        late = att.late_early(db, tin, None)[0] if tin and first else 0
        rec = AttendanceRecord(
            employee_id=req.employee_id, work_date=day, time_in=tin,
            status=AttendanceStatus.late if late > 0 else AttendanceStatus.present,
            late_minutes=late, source=AttendanceSource.manual, notes=note,
        )
        db.add(rec)
    else:
        rec.notes = f"{rec.notes} · {note}" if rec.notes else note
    if tout is not None:
        rec.time_out = tout
        rec.early_minutes = att.late_early(db, None, tout)[1]
    db.flush()
    return rec
