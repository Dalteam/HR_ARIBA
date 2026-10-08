"""Punch locations (مواقع البصمة) — CRUD."""

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.auth import get_current_user
from app.core.permissions import HR_ROLES, require_roles
from app.database import get_db
from app.models import User, Workplace
from app.schemas import LocationCreate, LocationOut, LocationUpdate
from app.services import locations as svc

router = APIRouter(tags=["locations"])

_WRITERS = require_roles(*HR_ROLES)


@router.get("/locations", response_model=list[LocationOut])
def list_locations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    locs = svc.list_all(db)
    wps = svc.workplaces_by_id(db, {l.workplace_id for l in locs if l.workplace_id})
    return [svc.to_out(l, wps.get(l.workplace_id)) for l in locs]


@router.post("/locations", response_model=LocationOut, status_code=201)
def create_location(body: LocationCreate, request: Request, user: User = Depends(_WRITERS), db: Session = Depends(get_db)):
    loc = svc.create(db, body)
    wp = db.get(Workplace, loc.workplace_id) if loc.workplace_id else None
    audit(db, request, user, "create", "location", loc.id)
    db.commit()
    db.refresh(loc)
    return svc.to_out(loc, wp)


@router.patch("/locations/{location_id}", response_model=LocationOut)
def update_location(location_id: uuid.UUID, body: LocationUpdate, request: Request, user: User = Depends(_WRITERS), db: Session = Depends(get_db)):
    loc = svc.get(db, location_id)
    changed = svc.update(loc, body)
    wp = db.get(Workplace, loc.workplace_id) if loc.workplace_id else None
    audit(db, request, user, "update", "location", loc.id, {"changed": changed})
    db.commit()
    return svc.to_out(loc, wp)


@router.delete("/locations/{location_id}", status_code=204)
def delete_location(location_id: uuid.UUID, request: Request, user: User = Depends(_WRITERS), db: Session = Depends(get_db)):
    loc = svc.get(db, location_id)
    svc.remove(loc)
    audit(db, request, user, "delete", "location", loc.id)
    db.commit()


# --------------------------------------------------------------------------- V121 per-employee work locations
from pydantic import BaseModel  # noqa: E402
from sqlalchemy import delete, select  # noqa: E402

from app.models import Employee, EmployeeLocation  # noqa: E402


class WorkLocationsIn(BaseModel):
    location_ids: list[uuid.UUID]


class LinkedEmployee(BaseModel):
    employee_id: uuid.UUID
    name_ar: str
    location_ids: list[uuid.UUID]


@router.get("/locations/assignments", response_model=list[LinkedEmployee])
def location_assignments(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Employees linked to specific punch locations (legacy «الموظفين المربوطين بمواقع البصمة»)."""
    links: dict[uuid.UUID, list[uuid.UUID]] = {}
    for el in db.scalars(select(EmployeeLocation)):
        links.setdefault(el.employee_id, []).append(el.location_id)
    names = {e.id: e.name_ar for e in db.scalars(select(Employee).where(Employee.id.in_(links)))} if links else {}
    return [LinkedEmployee(employee_id=k, name_ar=names.get(k, "—"), location_ids=v) for k, v in links.items()]


@router.put("/employees/{employee_id}/work-locations", response_model=LinkedEmployee)
def set_work_locations(employee_id: uuid.UUID, body: WorkLocationsIn, request: Request, user: User = Depends(require_roles(*HR_ROLES)), db: Session = Depends(get_db)):
    """Empty list = punch at the workplace's locations as before."""
    emp = db.get(Employee, employee_id)
    if emp is None:
        from app.core.errors import not_found

        raise not_found("Employee")
    db.execute(delete(EmployeeLocation).where(EmployeeLocation.employee_id == employee_id))
    for lid in dict.fromkeys(body.location_ids):
        db.add(EmployeeLocation(employee_id=employee_id, location_id=lid))
    audit(db, request, user, "update", "employee_locations", employee_id, {"count": len(body.location_ids)})
    db.commit()
    return LinkedEmployee(employee_id=employee_id, name_ar=emp.name_ar, location_ids=list(dict.fromkeys(body.location_ids)))
