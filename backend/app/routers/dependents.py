"""Dependents (التابعون) of an employee."""

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.permissions import HR_ROLES, require_roles
from app.database import get_db
from app.models import Role, User
from app.schemas import DependentCreate, DependentIn, DependentOut
from app.services import dependents as svc
from app.services import employees as emp_svc

router = APIRouter(tags=["dependents"])

_READERS = require_roles(Role.employee, Role.manager, Role.hr, Role.ceo, Role.admin)
_WRITERS = require_roles(*HR_ROLES)


@router.get("/employees/{employee_id}/dependents", response_model=list[DependentOut])
def list_dependents(employee_id: uuid.UUID, request: Request, user: User = Depends(_READERS), db: Session = Depends(get_db)):
    emp = emp_svc.get_employee(db, user, employee_id)
    out = [svc.to_out(db, d, emp, user) for d in svc.list_for(db, emp.id)]
    audit(db, request, user, "list", "dependent", details={"employee_id": str(emp.id)})
    db.commit()
    return out


@router.post("/employees/{employee_id}/dependents", response_model=DependentOut, status_code=201)
def create_dependent(
    employee_id: uuid.UUID, body: DependentCreate, request: Request,
    user: User = Depends(_WRITERS), db: Session = Depends(get_db),
):
    emp = emp_svc.get_employee(db, user, employee_id)
    dep = svc.create(db, emp, body)
    audit(db, request, user, "create", "dependent", dep.id, {"employee_id": str(emp.id)})
    db.commit()
    return svc.to_out(db, dep, emp, user)


@router.patch("/dependents/{dependent_id}", response_model=DependentOut)
def update_dependent(
    dependent_id: uuid.UUID, body: DependentIn, request: Request,
    user: User = Depends(_WRITERS), db: Session = Depends(get_db),
):
    dep = svc.get(db, dependent_id)
    emp = emp_svc.get_employee(db, user, dep.employee_id)
    changed = svc.update(dep, body)
    audit(db, request, user, "update", "dependent", dep.id, {"changed": changed})
    db.commit()
    return svc.to_out(db, dep, emp, user)


@router.delete("/dependents/{dependent_id}", status_code=204)
def delete_dependent(dependent_id: uuid.UUID, request: Request, user: User = Depends(_WRITERS), db: Session = Depends(get_db)):
    dep = svc.get(db, dependent_id)
    emp_svc.get_employee(db, user, dep.employee_id)
    svc.remove(dep)
    audit(db, request, user, "delete", "dependent", dep.id)
    db.commit()
