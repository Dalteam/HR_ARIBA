"""Employees: list with tabs/filters, detail, create, update, terminate, reactivate."""

import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.pagination import Page, PageParams, page_params
from app.core.permissions import HR_ROLES, require_roles
from app.database import get_db
from app.models import Role, User
from app.schemas import (
    EmployeeCounts,
    EmployeeCreate,
    EmployeeListItem,
    EmployeeOut,
    EmployeeUpdate,
    SalaryPreviewIn,
    SalaryPreviewOut,
    TerminateIn,
)
from app.services import employees as svc

router = APIRouter(prefix="/employees", tags=["employees"])

# Finance works only with payroll/EOS endpoints and has no access to the employee directory.
_READERS = require_roles(Role.employee, Role.manager, Role.hr, Role.ceo, Role.admin)
_WRITERS = require_roles(*HR_ROLES)


@router.get("", response_model=Page[EmployeeListItem])
def list_employees(
    request: Request,
    params: PageParams = Depends(page_params),
    tab: svc.Tab = Query("all"),
    workplace_id: uuid.UUID | None = None,
    department_id: uuid.UUID | None = None,
    user: User = Depends(_READERS),
    db: Session = Depends(get_db),
):
    items, total = svc.list_employees(db, user, params, tab, workplace_id, department_id)
    audit(db, request, user, "list", "employee", details={"tab": tab, "count": len(items)})
    db.commit()
    return Page(items=items, total=total, page=params.page, page_size=params.page_size)


@router.get("/counts", response_model=EmployeeCounts)
def employee_counts(user: User = Depends(_READERS), db: Session = Depends(get_db)):
    return svc.counts(db, user)


@router.post("/salary-preview", response_model=SalaryPreviewOut)
def salary_preview(body: SalaryPreviewIn, _: User = Depends(_WRITERS), db: Session = Depends(get_db)):
    """Live total / GOSI / net while HR edits the salary tab. Nothing is saved."""
    return svc.preview(db, body)


@router.post("", response_model=EmployeeOut, status_code=201)
def create_employee(
    body: EmployeeCreate, request: Request, user: User = Depends(_WRITERS), db: Session = Depends(get_db)
):
    emp = svc.create_employee(db, body)
    audit(db, request, user, "create", "employee", emp.id, {"fields": sorted(body.model_fields_set)})
    db.commit()
    return svc.to_detail(db, emp, user)


@router.get("/{employee_id}", response_model=EmployeeOut)
def get_employee(
    employee_id: uuid.UUID, request: Request, user: User = Depends(_READERS), db: Session = Depends(get_db)
):
    emp = svc.get_employee(db, user, employee_id)
    out = svc.to_detail(db, emp, user)
    audit(db, request, user, "read", "employee", emp.id, {"salary": out.salary is not None, "full_ids": not out.ids_masked})
    db.commit()
    return out


@router.patch("/{employee_id}", response_model=EmployeeOut)
def update_employee(
    employee_id: uuid.UUID,
    body: EmployeeUpdate,
    request: Request,
    user: User = Depends(_WRITERS),
    db: Session = Depends(get_db),
):
    emp = svc.get_employee(db, user, employee_id)
    changed = svc.update_employee(db, emp, body)
    audit(db, request, user, "update", "employee", emp.id, {"changed": changed})
    db.commit()
    return svc.to_detail(db, emp, user)


@router.post("/{employee_id}/terminate", response_model=EmployeeOut)
def terminate_employee(
    employee_id: uuid.UUID,
    body: TerminateIn,
    request: Request,
    user: User = Depends(_WRITERS),
    db: Session = Depends(get_db),
):
    emp = svc.get_employee(db, user, employee_id)
    svc.terminate(db, emp, body)
    audit(db, request, user, "terminate", "employee", emp.id, {"article": body.article.value})
    db.commit()
    return svc.to_detail(db, emp, user)


@router.post("/{employee_id}/reactivate", response_model=EmployeeOut)
def reactivate_employee(
    employee_id: uuid.UUID, request: Request, user: User = Depends(_WRITERS), db: Session = Depends(get_db)
):
    emp = svc.get_employee(db, user, employee_id)
    svc.reactivate(db, emp)
    audit(db, request, user, "reactivate", "employee", emp.id)
    db.commit()
    return svc.to_detail(db, emp, user)
