"""The signed-in user's own account and employee record (employee app)."""

import uuid

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.auth import get_current_user, get_current_user_allow_pending
from app.core.errors import not_found
from app.database import get_db
from app.models import User
from app.schemas import EmployeeOut, UserOut
from app.services import employees as svc

router = APIRouter(prefix="/me", tags=["me"])


class MeOut(BaseModel):
    user: UserOut


@router.get("", response_model=MeOut)
def me(user: User = Depends(get_current_user_allow_pending)):
    return MeOut(user=UserOut.model_validate(user))


@router.get("/employee", response_model=EmployeeOut)
def my_employee(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.employee_id is None:
        raise not_found("Employee")
    emp = svc.get_employee(db, user, user.employee_id)
    audit(db, request, user, "read", "employee", emp.id, {"self": True})
    db.commit()
    return svc.to_detail(db, emp, user)


# --------------------------------------------------------------------------- employee app attendance (GPS punch)
from datetime import date as _date  # noqa: E402
from typing import Literal  # noqa: E402

from pydantic import Field  # noqa: E402

from app.core.scheduling import today_riyadh  # noqa: E402
from app.models import Employee, Location  # noqa: E402
from app.services import attendance as att_svc  # noqa: E402
from app.services import punch  # noqa: E402


class PunchIn(BaseModel):
    action: Literal["in", "out"]
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class MySession(BaseModel):
    id: uuid.UUID
    work_date: _date
    time_in: str | None
    time_out: str | None
    status: str
    late_minutes: int
    early_minutes: int
    location_name: str | None
    notes: str | None


class MyLocation(BaseModel):
    id: uuid.UUID
    name: str
    name_en: str | None
    type: str
    radius_m: int
    latitude: float
    longitude: float


class MyAttendanceOut(BaseModel):
    today: list[MySession]
    history: list[MySession]
    locations: list[MyLocation]
    flexible_enabled: bool
    shift_hours: float | None
    window_start: str | None
    window_end: str | None
    work_start: str | None
    tolerance_minutes: int | None
    expected_checkout: str | None
    remote_limit: int
    remote_used: int


def _my_emp(db: Session, user: User) -> Employee:
    emp = db.get(Employee, user.employee_id) if user.employee_id else None
    if emp is None or emp.deleted_at is not None:
        raise not_found("Employee")
    return emp


def _session(r, names: dict) -> MySession:
    return MySession(
        id=r.id, work_date=r.work_date, time_in=att_svc.fmt(r.time_in), time_out=att_svc.fmt(r.time_out),
        status=r.status.value, late_minutes=r.late_minutes, early_minutes=r.early_minutes,
        location_name=names.get(r.location_id), notes=r.notes,
    )


@router.get("/attendance", response_model=MyAttendanceOut)
def my_attendance(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Everything the attendance tab needs: allowed sites, today's sessions, last 31 days, flexible hours."""
    from sqlalchemy import select

    emp = _my_emp(db, user)
    hist = punch.history(db, emp.id)
    locs = punch.allowed_locations(db, emp)
    ids = {r.location_id for r in hist if r.location_id}
    names = {l.id: l.name for l in db.scalars(select(Location).where(Location.id.in_(ids)))} if ids else {}
    today = today_riyadh()
    day = punch.sessions_on(db, emp.id, today)
    s = att_svc.settings(db)
    return MyAttendanceOut(
        today=[_session(r, names) for r in day],
        history=[_session(r, names) for r in hist],
        locations=[
            MyLocation(id=l.id, name=l.name, name_en=l.name_en, type=l.type.value, radius_m=l.radius_m,
                       latitude=float(l.latitude), longitude=float(l.longitude))
            for l in locs
        ],
        flexible_enabled=bool(s and s.flexible_enabled),
        shift_hours=float(s.shift_hours) if s else None,
        window_start=s.window_start.strftime("%H:%M") if s else None,
        window_end=s.window_end.strftime("%H:%M") if s else None,
        work_start=s.work_start.strftime("%H:%M") if s else None,
        tolerance_minutes=s.tolerance_minutes if s else None,
        expected_checkout=punch.expected_checkout(s, day[0].time_in if day else None),
        remote_limit=s.remote_days_per_year if s else punch.DEFAULT_REMOTE_LIMIT,
        remote_used=punch.remote_used(db, emp.id, today.year),
    )


@router.post("/attendance/punch", response_model=MySession)
def my_punch(body: PunchIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    emp = _my_emp(db, user)
    rec = punch.punch_in(db, emp, body.lat, body.lng) if body.action == "in" else punch.punch_out(db, emp, body.lat, body.lng)
    audit(db, request, user, "punch_" + body.action, "attendance", rec.id, {"status": rec.status.value})
    db.commit()
    loc = db.get(Location, rec.location_id) if rec.location_id else None
    return _session(rec, {rec.location_id: loc.name} if loc else {})
