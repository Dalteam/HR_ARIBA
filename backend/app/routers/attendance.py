"""Attendance records (الحضور والانصراف): list by date, manual entry, monthly summary."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.permissions import HR_READ_ROLES, HR_ROLES, require_roles
from app.database import get_db
from app.models import Employee, Location, User
from app.schemas import AttendanceCreate, AttendanceOut, AttendanceSummaryOut, AttendanceUpdate
from app.services import attendance as svc

router = APIRouter(tags=["attendance"])

_READERS = require_roles(*HR_READ_ROLES)
_WRITERS = require_roles(*HR_ROLES)


def _maps(db: Session, recs) -> tuple[dict[uuid.UUID, Employee], dict[uuid.UUID, Location]]:
    emp_ids = {r.employee_id for r in recs}
    loc_ids = {r.location_id for r in recs if r.location_id}
    emps = {e.id: e for e in db.scalars(select(Employee).where(Employee.id.in_(emp_ids)))} if emp_ids else {}
    locs = {l.id: l for l in db.scalars(select(Location).where(Location.id.in_(loc_ids)))} if loc_ids else {}
    return emps, locs


@router.get("/attendance", response_model=list[AttendanceOut])
def list_attendance(date: date, user: User = Depends(_READERS), db: Session = Depends(get_db)):
    recs = svc.list_for_date(db, date)
    emps, locs = _maps(db, recs)
    return [svc.to_out(db, r, emps.get(r.employee_id), locs.get(r.location_id)) for r in recs]


@router.get("/attendance/range", response_model=list[AttendanceOut])
def attendance_range(date_from: date, date_to: date, user: User = Depends(_READERS), db: Session = Depends(get_db)):
    """Every session between two dates (legacy ariba_hr_attendance_range) for the V117 attendance reports."""
    from app.models import AttendanceRecord

    recs = list(db.scalars(select(AttendanceRecord).where(AttendanceRecord.work_date >= date_from, AttendanceRecord.work_date <= date_to)))
    emps, locs = _maps(db, recs)
    return [svc.to_out(db, r, emps.get(r.employee_id), locs.get(r.location_id)) for r in recs]


@router.get("/attendance/summary", response_model=list[AttendanceSummaryOut])
def attendance_summary(month: str, user: User = Depends(_READERS), db: Session = Depends(get_db)):
    year, mon = (int(x) for x in month.split("-"))
    return svc.summary(db, year, mon)


@router.post("/attendance", response_model=AttendanceOut, status_code=201)
def upsert_attendance(body: AttendanceCreate, request: Request, user: User = Depends(_WRITERS), db: Session = Depends(get_db)):
    rec = svc.upsert(db, body, user)
    audit(db, request, user, "save", "attendance", rec.id, {"employee_id": str(body.employee_id), "date": body.work_date.isoformat()})
    db.commit()
    db.refresh(rec)
    emp = db.get(Employee, rec.employee_id)
    loc = db.get(Location, rec.location_id) if rec.location_id else None
    return svc.to_out(db, rec, emp, loc)


@router.patch("/attendance/{record_id}", response_model=AttendanceOut)
def update_attendance(record_id: uuid.UUID, body: AttendanceUpdate, request: Request, user: User = Depends(_WRITERS), db: Session = Depends(get_db)):
    rec = svc.get(db, record_id)
    changed = svc.update(db, rec, body, user)
    audit(db, request, user, "update", "attendance", rec.id, {"changed": changed})
    db.commit()
    emp = db.get(Employee, rec.employee_id)
    loc = db.get(Location, rec.location_id) if rec.location_id else None
    return svc.to_out(db, rec, emp, loc)


@router.delete("/attendance/{record_id}", status_code=204)
def delete_attendance(record_id: uuid.UUID, request: Request, user: User = Depends(_WRITERS), db: Session = Depends(get_db)):
    rec = svc.get(db, record_id)
    svc.remove(db, rec)
    audit(db, request, user, "delete", "attendance", rec.id)
    db.commit()
