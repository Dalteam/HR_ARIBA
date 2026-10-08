"""Saved working sheets (payroll months first): GET/PUT the rows, approve/unapprove.

Keys follow the V114 HTML storage names: `pay_YYYY_MM` is the payroll of that month.
"""

import re
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.auth import get_current_user
from app.core.errors import ApiError, forbidden, not_found
from app.core.permissions import HR_ROLES, SALARY_ROLES
from app.database import get_db
from app.models import Employee, PayrollRow, PayrollRun, Role, Sheet, User

router = APIRouter(prefix="/sheets", tags=["sheets"])
archive = APIRouter(tags=["payroll"])

_KEY = re.compile(r"^[a-z0-9_]{2,80}$")


class SheetOut(BaseModel):
    key: str
    data: Any = None
    approved: bool = False
    approved_at: datetime | None = None
    updated_at: datetime | None = None


class SheetIn(BaseModel):
    data: Any


def _check(key: str, user: User, write: bool) -> None:
    if not _KEY.match(key):
        raise ApiError(422, "invalid_key", "Invalid sheet key")
    allowed = SALARY_ROLES if key.startswith("pay_") else HR_ROLES
    if not write and key.startswith("pay_") and user.role == Role.ceo:
        return
    if user.role not in allowed:
        raise forbidden()


# Payroll months (`pay_YYYY_MM`) live in payroll_runs / payroll_rows; the screen keeps the same sheet contract.
_PAY = re.compile(r"^pay_(\d{4})_(\d{2})$")


def _num(v) -> float:
    try:
        return round(float(v or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def _run(db: Session, key: str) -> PayrollRun | None:
    m = _PAY.match(key)
    return db.scalar(select(PayrollRun).where(PayrollRun.year == int(m.group(1)), PayrollRun.month == int(m.group(2)))) if m else None


def _run_out(db: Session, run: PayrollRun | None, key: str, with_rows: bool = True) -> SheetOut:
    if run is None:
        return SheetOut(key=key)
    data = None
    if with_rows:
        rows = db.scalars(select(PayrollRow).where(PayrollRow.run_id == run.id).order_by(PayrollRow.position))
        data = [r.data for r in rows]
    return SheetOut(key=key, data=data, approved=run.status == "approved", approved_at=run.approved_at, updated_at=run.updated_at)


def _save_rows(db: Session, run: PayrollRun, rows: list, user: User) -> None:
    db.query(PayrollRow).filter(PayrollRow.run_id == run.id).delete()
    known = {str(e) for e in db.scalars(select(Employee.id))}
    for i, r in enumerate(rows if isinstance(rows, list) else []):
        if not isinstance(r, dict):
            continue
        eid = str(r.get("id") or "")
        db.add(PayrollRow(
            run_id=run.id, position=i, employee_id=uuid.UUID(eid) if eid in known else None,
            emp_no=str(r.get("empNo") or "")[:40] or None, name_ar=str(r.get("name") or "")[:200] or None,
            total_due=_num(r.get("totalDue")), total_deductions=_num(r.get("totalDeduct")),
            gosi_employee=_num(r.get("insEmp")), gosi_employer=_num(r.get("insEr")),
            net=_num(r.get("net")), net_sar=_num(r.get("netSAR")), data=r,
        ))
    run.updated_by = user.id


def _out(s: Sheet | None, key: str) -> SheetOut:
    if s is None:
        return SheetOut(key=key)
    return SheetOut(key=s.key, data=s.data, approved=s.approved, approved_at=s.approved_at, updated_at=s.updated_at)


@router.get("", response_model=list[SheetOut])
def list_sheets(prefix: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Sheets whose key starts with `prefix` (e.g. `pay_` for the payroll archive), without their rows."""
    _check(prefix.rstrip("_") + "_x", user, write=False)
    if prefix.startswith("pay"):
        runs = db.scalars(select(PayrollRun).order_by(PayrollRun.year.desc(), PayrollRun.month.desc()))
        return [_run_out(db, r, f"pay_{r.year}_{r.month:02d}", with_rows=False) for r in runs]
    rows = db.scalars(select(Sheet).where(Sheet.key.startswith(prefix)).order_by(Sheet.key.desc()))
    return [SheetOut(key=s.key, approved=s.approved, approved_at=s.approved_at, updated_at=s.updated_at) for s in rows]


@router.get("/{key}", response_model=SheetOut)
def get_sheet(key: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _check(key, user, write=False)
    if _PAY.match(key):
        return _run_out(db, _run(db, key), key)
    return _out(db.scalar(select(Sheet).where(Sheet.key == key)), key)


@router.put("/{key}", response_model=SheetOut)
def put_sheet(key: str, body: SheetIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _check(key, user, write=True)
    if (m := _PAY.match(key)) is not None:
        run = _run(db, key)
        if run is not None and run.status == "approved":
            raise ApiError(409, "approved", "This sheet is approved and can no longer be edited")
        if run is None:
            run = PayrollRun(year=int(m.group(1)), month=int(m.group(2)), status="draft")
            db.add(run)
            db.flush()
        _save_rows(db, run, body.data, user)
        audit(db, request, user, "save", "payroll", key)
        db.commit()
        return _run_out(db, run, key)
    s = db.scalar(select(Sheet).where(Sheet.key == key))
    if s is not None and s.approved:
        raise ApiError(409, "approved", "This sheet is approved and can no longer be edited")
    if s is None:
        s = Sheet(key=key)
        db.add(s)
    s.data = body.data
    s.updated_by = user.id
    audit(db, request, user, "save", "sheet", key)
    db.commit()
    db.refresh(s)
    return _out(s, key)


@router.post("/{key}/approve", response_model=SheetOut)
def approve_sheet(key: str, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _check(key, user, write=True)
    if _PAY.match(key):
        run = _run(db, key)
        if run is None:
            raise not_found("Payroll")
        run.status, run.approved_at, run.approved_by = "approved", datetime.now(timezone.utc), user.id
        audit(db, request, user, "approve", "payroll", key)
        db.commit()
        return _run_out(db, run, key)
    s = db.scalar(select(Sheet).where(Sheet.key == key))
    if s is None:
        raise not_found("Sheet")
    s.approved, s.approved_at, s.approved_by = True, datetime.now(timezone.utc), user.id
    audit(db, request, user, "approve", "sheet", key)
    db.commit()
    db.refresh(s)
    return _out(s, key)


@router.post("/{key}/unapprove", response_model=SheetOut)
def unapprove_sheet(key: str, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role not in HR_ROLES:
        raise forbidden()
    if _PAY.match(key):
        run = _run(db, key)
        if run is None:
            raise not_found("Payroll")
        run.status, run.approved_at, run.approved_by = "draft", None, None
        audit(db, request, user, "unapprove", "payroll", key)
        db.commit()
        return _run_out(db, run, key)
    s = db.scalar(select(Sheet).where(Sheet.key == key))
    if s is None:
        raise not_found("Sheet")
    s.approved, s.approved_at, s.approved_by = False, None, None
    audit(db, request, user, "unapprove", "sheet", key)
    db.commit()
    db.refresh(s)
    return _out(s, key)


class ArchiveRow(BaseModel):
    year: int
    month: int
    approved_at: datetime | None
    employees: int
    total: float
    net_sar: float


@archive.get("/payroll-archive", response_model=list[ArchiveRow], tags=["payroll"])
def payroll_archive(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Legacy V53 «سجل المسيرات المعتمدة»: every approved month with its totals."""
    _check("pay_x", user, write=False)
    from sqlalchemy import func

    q = (
        select(PayrollRun.year, PayrollRun.month, PayrollRun.approved_at, func.count(PayrollRow.id), func.coalesce(func.sum(PayrollRow.total_due), 0), func.coalesce(func.sum(PayrollRow.net_sar), 0))
        .join(PayrollRow, PayrollRow.run_id == PayrollRun.id, isouter=True)
        .where(PayrollRun.status == "approved")
        .group_by(PayrollRun.id)
        .order_by(PayrollRun.year.desc(), PayrollRun.month.desc())
    )
    return [ArchiveRow(year=y, month=m, approved_at=at, employees=n, total=float(t), net_sar=float(ns)) for y, m, at, n, t, ns in db.execute(q)]
