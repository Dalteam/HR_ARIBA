"""Leaves page (الإجازات): official holidays, requests + approvals, balances and the year-by-year balance editor.

Same tabs as #pg-lv in frontend/legacy/hr-portal/index.html: معلقة · كل الطلبات · طلب جديد · الأرصدة ·
الإجازات الرسمية · عمل إضافي.
"""

import uuid
from datetime import date, datetime, time
from decimal import Decimal

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.errors import ApiError, not_found
from app.core.permissions import HR_READ_ROLES, HR_ROLES, require_roles
from app.core.scheduling import today_riyadh
from app.database import get_db
from app.models import (
    Employee,
    Role,
    Holiday,
    Request as Req,
    RequestStatus,
    RequestType,
    User,
    WorkflowStage,
)
from app.services import leave as lv
from app.services import workflow as wf

router = APIRouter(tags=["leave"])
_READ = require_roles(*HR_READ_ROLES)
_WRITE = require_roles(*HR_ROLES)

# Request types shown on the HR leaves page (legacy LVL) — permission-like types are listed too.
LEAVE_TYPES = {
    RequestType.annual, RequestType.sick, RequestType.emergency, RequestType.death, RequestType.marriage,
    RequestType.paternity, RequestType.maternity, RequestType.umrah, RequestType.hajj, RequestType.remote,
}


# --------------------------------------------------------------------------- holidays


class HolidayIn(BaseModel):
    name_ar: str = Field(min_length=1, max_length=120)
    name_en: str | None = None
    start_date: date
    days: int = Field(1, ge=1, le=60)
    is_recurring: bool = False


class HolidayOut(HolidayIn):
    id: uuid.UUID


def _hol_out(h: Holiday) -> HolidayOut:
    return HolidayOut(id=h.id, name_ar=h.name_ar, name_en=h.name_en, start_date=h.start_date, days=h.days, is_recurring=h.is_recurring)


@router.get("/holidays", response_model=list[HolidayOut])
def list_holidays(_: User = Depends(_READ), db: Session = Depends(get_db)):
    return [_hol_out(h) for h in db.scalars(select(Holiday).order_by(Holiday.start_date))]


@router.post("/holidays", response_model=HolidayOut, status_code=201)
def add_holiday(body: HolidayIn, request: Request, user: User = Depends(_WRITE), db: Session = Depends(get_db)):
    h = Holiday(name_ar=body.name_ar, name_en=body.name_en or body.name_ar, start_date=body.start_date, days=body.days, is_recurring=body.is_recurring)
    db.add(h)
    db.flush()
    audit(db, request, user, "create", "holiday", h.id)
    db.commit()
    return _hol_out(h)


@router.delete("/holidays/{holiday_id}", status_code=204)
def delete_holiday(holiday_id: uuid.UUID, request: Request, user: User = Depends(_WRITE), db: Session = Depends(get_db)):
    h = db.get(Holiday, holiday_id)
    if h is None:
        raise not_found("Holiday")
    db.delete(h)
    audit(db, request, user, "delete", "holiday", holiday_id)
    db.commit()


# --------------------------------------------------------------------------- requests


class RequestOut(BaseModel):
    id: uuid.UUID
    employee_id: uuid.UUID
    employee_name: str
    type: str
    status: str
    stage: str
    from_date: date | None
    to_date: date | None
    days: Decimal | None
    on_date: date | None
    time_from: time | None
    hours: Decimal | None
    amount: Decimal | None
    punch_kind: str | None
    notes: str | None
    rejection_reason: str | None
    attachment_id: uuid.UUID | None = None
    created_at: datetime


class RequestIn(BaseModel):
    employee_id: uuid.UUID
    type: RequestType
    from_date: date | None = None
    to_date: date | None = None
    on_date: date | None = None
    time_from: time | None = None
    hours: Decimal | None = Field(None, ge=0, le=24)
    amount: Decimal | None = Field(None, ge=0)
    notes: str | None = Field(None, max_length=2000)
    attachment_id: uuid.UUID | None = None


class ReasonIn(BaseModel):
    reason: str | None = Field(None, max_length=2000)


def _req_out(r: Req, names: dict) -> RequestOut:
    return RequestOut(
        id=r.id, employee_id=r.employee_id, employee_name=names.get(r.employee_id, "—"), type=r.type.value,
        status=r.status.value, stage=r.current_stage.value, from_date=r.from_date, to_date=r.to_date, days=r.days,
        on_date=r.on_date, time_from=r.time_from, hours=r.hours, amount=r.amount,
        punch_kind=r.punch_kind.value if r.punch_kind else None, notes=r.notes, rejection_reason=r.rejection_reason,
        attachment_id=r.attachment_id,
        created_at=r.created_at,
    )


def _names(db: Session, ids) -> dict:
    ids = set(ids)
    return {e.id: e.name_ar for e in db.scalars(select(Employee).where(Employee.id.in_(ids)))} if ids else {}


@router.get("/requests", response_model=list[RequestOut])
def list_requests(
    status: RequestStatus | None = None,
    type: RequestType | None = None,
    employee_id: uuid.UUID | None = None,
    pending_now: bool = Query(False, description="Legacy 'معلقة': pending and not already over"),
    _: User = Depends(_READ),
    db: Session = Depends(get_db),
):
    q = select(Req)
    if status:
        q = q.where(Req.status == status)
    if type:
        q = q.where(Req.type == type)
    if employee_id:
        q = q.where(Req.employee_id == employee_id)
    rows = list(db.scalars(q.order_by(Req.from_date.desc().nullslast(), Req.created_at.desc())))
    if pending_now:
        today = today_riyadh()
        rows = [
            r for r in rows
            if r.status == RequestStatus.pending and (r.to_date or r.on_date or today) >= today
        ]
    names = _names(db, (r.employee_id for r in rows))
    return [_req_out(r, names) for r in rows]


@router.post("/requests", response_model=RequestOut, status_code=201)
def create_request(body: RequestIn, request: Request, user: User = Depends(_WRITE), db: Session = Depends(get_db)):
    """HR records a request for an employee (legacy subLv / submitHrOvertime): starts at the HR stage."""
    emp = db.get(Employee, body.employee_id)
    if emp is None or emp.deleted_at is not None:
        raise not_found("Employee")
    r = Req(employee_id=emp.id, type=body.type, notes=body.notes, submitted_by=user.id, attachment_id=body.attachment_id)
    if body.type in LEAVE_TYPES:
        if not body.from_date or not body.to_date or body.to_date < body.from_date:
            raise ApiError(422, "dates_required", "From and to dates are required")
        book = lv.load_book(db, today_riyadh())
        days = lv.request_days(book, body.type, body.from_date, body.to_date)
        if body.type == RequestType.annual and days > book.current(emp):
            raise ApiError(422, "exceeds_balance", "يتجاوز الرصيد المتاح")
        r.from_date, r.to_date, r.days = body.from_date, body.to_date, Decimal(days)
    elif body.type == RequestType.overtime:
        if not body.on_date or not body.hours or body.hours < Decimal("0.5"):
            raise ApiError(422, "invalid_overtime", "Date and hours (≥ 0.5) are required")
        r.on_date, r.hours = body.on_date, body.hours
    else:
        r.on_date, r.time_from, r.hours, r.amount = body.on_date, body.time_from, body.hours, body.amount
        r.from_date, r.to_date = body.from_date, body.to_date
    r.current_stage = wf.first_stage(db, body.type, has_manager=emp.manager_id is not None, submitted_by_hr=True)
    db.add(r)
    db.flush()
    wf.submitted(db, r, user)
    audit(db, request, user, "create", "request", r.id, {"type": body.type.value})
    db.commit()
    return _req_out(r, {emp.id: emp.name_ar})


def _get(db: Session, request_id: uuid.UUID) -> Req:
    r = db.get(Req, request_id)
    if r is None:
        raise not_found("Request")
    return r


def _done(db: Session, request: Request, user: User, r: Req, action: str) -> RequestOut:
    audit(db, request, user, action, "request", r.id)
    db.commit()
    return _req_out(r, _names(db, [r.employee_id]))


@router.post("/requests/{request_id}/approve", response_model=RequestOut)
def approve_request(request_id: uuid.UUID, body: ReasonIn, request: Request, user: User = Depends(_WRITE), db: Session = Depends(get_db)):
    r = _get(db, request_id)
    if r.current_stage != WorkflowStage.hr:
        raise ApiError(409, "not_hr_stage", "Use 'approve on behalf' for this stage")
    wf.approve(db, r, user, body.reason)
    return _done(db, request, user, r, "approve")


@router.post("/requests/{request_id}/override", response_model=RequestOut)
def override_request(request_id: uuid.UUID, body: ReasonIn, request: Request, user: User = Depends(_WRITE), db: Session = Depends(get_db)):
    r = _get(db, request_id)
    wf.override(db, r, user, body.reason or "")
    return _done(db, request, user, r, "override")


@router.post("/requests/{request_id}/final-approve", response_model=RequestOut)
def final_approve_request(request_id: uuid.UUID, body: ReasonIn, request: Request, user: User = Depends(_WRITE), db: Session = Depends(get_db)):
    r = _get(db, request_id)
    wf.final_approve(db, r, user, body.reason)
    return _done(db, request, user, r, "final_approve")


@router.post("/requests/{request_id}/reject", response_model=RequestOut)
def reject_request(request_id: uuid.UUID, body: ReasonIn, request: Request, user: User = Depends(_WRITE), db: Session = Depends(get_db)):
    r = _get(db, request_id)
    wf.reject(db, r, user, body.reason or "")
    return _done(db, request, user, r, "reject")


@router.delete("/requests/{request_id}", status_code=204)
def delete_request(request_id: uuid.UUID, request: Request, user: User = Depends(_WRITE), db: Session = Depends(get_db)):
    """V124: deleting an approved annual leave returns its days (the ledger is recomputed from requests)."""
    r = _get(db, request_id)
    from sqlalchemy import delete

    from app.models import RequestStep

    db.execute(delete(RequestStep).where(RequestStep.request_id == r.id))
    db.flush()
    db.delete(r)
    audit(db, request, user, "delete", "request", request_id)
    db.commit()


# --------------------------------------------------------------------------- balances


class BalanceRow(BaseModel):
    employee_id: str
    name_ar: str
    carry: float
    current: float
    year_end: float
    accrued_since_join: float
    used_since_join: float
    remaining_since_join: float
    eos: float
    annual: float = 21
    # Legacy rptLv columns 2023..2026 = the year override's `used` (0 when none).
    override_used: dict[str, float] = {}


class LedgerYear(BaseModel):
    year: int
    opening: float
    entitlement: float
    used: float
    adjustment: float
    close: float
    carry: float
    eos: float
    current: float | None = None


class BalanceDetail(BaseModel):
    summary: BalanceRow
    accumulated_eos: float
    years: list[LedgerYear]


@router.get("/leave/balances", response_model=list[BalanceRow])
def balances(_: User = Depends(_READ), db: Session = Depends(get_db)):
    book = lv.load_book(db, today_riyadh())
    emps = db.scalars(select(Employee).where(Employee.deleted_at.is_(None)).order_by(Employee.name_ar)).unique()
    def row(e: Employee) -> BalanceRow:
        ou = {str(y): float((book.override(e, y) or {}).get("used") or 0) for y in range(2023, book.today.year + 1)}
        return BalanceRow(name_ar=e.name_ar, annual=book.annual(e), override_used=ou, **book.summary(e))

    return [row(e) for e in emps if not e.is_terminated]


@router.get("/leave/employees/{employee_id}", response_model=BalanceDetail)
def balance_detail(employee_id: uuid.UUID, _: User = Depends(_READ), db: Session = Depends(get_db)):
    emp = db.get(Employee, employee_id)
    if emp is None:
        raise not_found("Employee")
    book = lv.load_book(db, today_riyadh())
    years = []
    for y in range(book.start_year(emp), book.today.year + 1):
        led = book.ledger(emp, y)
        years.append(LedgerYear(**{k: led[k] for k in ("year", "opening", "entitlement", "used", "adjustment", "close", "carry", "eos")},
                                current=book.current(emp) if y == book.today.year else None))
    return BalanceDetail(
        summary=BalanceRow(name_ar=emp.name_ar, **book.summary(emp)),
        accumulated_eos=book.accumulated_eos(emp),
        years=years,
    )


class YearEdit(BaseModel):
    year: int
    carry: float | None = None
    entitlement: float | None = None
    used: float | None = None
    adjustment: float | None = None
    current: float | None = None
    yearEnd: float | None = None
    carryNext: float | None = None
    eos: float | None = None


class BalanceEdit(BaseModel):
    date: date
    note: str | None = None
    years: list[YearEdit]


@router.put("/leave/employees/{employee_id}", response_model=BalanceDetail)
def save_balance(employee_id: uuid.UUID, body: BalanceEdit, request: Request, user: User = Depends(_WRITE), db: Session = Depends(get_db)):
    """Legacy saveLeaveBalanceAdjustment: replace every year's figures for the employee (same normalisation)."""
    emp = db.get(Employee, employee_id)
    if emp is None:
        raise not_found("Employee")
    y_now = today_riyadh().year
    overrides: dict[str, dict] = {}
    for row in body.years:
        o = {k: v for k, v in row.model_dump(exclude={"year"}).items() if v is not None}
        o["carry"] = max(0.0, float(o.get("carry") or 0))
        o["entitlement"] = max(0.0, float(o.get("entitlement") or 0))
        o["used"] = max(0.0, float(o.get("used") or 0))
        o["adjustment"] = float(o.get("adjustment") or 0)
        calc_end = max(0.0, o["carry"] + o["entitlement"] + o["adjustment"] - o["used"])
        o["yearEnd"] = calc_end if o.get("yearEnd") is None else max(0.0, float(o["yearEnd"]))
        o["carryNext"] = min(10.0, max(0.0, float(o.get("carryNext") or 0) or min(10.0, o["yearEnd"])))
        o["eos"] = max(0.0, float(o.get("eos") or 0) or max(0.0, o["yearEnd"] - 10))
        if row.year != y_now:
            o.pop("current", None)
        o["note"] = (body.note or "").strip()
        o["updatedAt"] = datetime.now().isoformat()
        overrides[str(row.year)] = o

    from app.models import LeaveAdjustment, LeaveYearOverride

    db.query(LeaveYearOverride).filter(LeaveYearOverride.employee_id == emp.id).delete()
    db.query(LeaveAdjustment).filter(LeaveAdjustment.employee_id == emp.id).delete()
    cols = {"carry": "carry", "entitlement": "entitlement", "used": "used", "adjustment": "adjustment", "yearEnd": "year_end",
            "carryNext": "carry_next", "current": "current_balance", "eos": "eos"}
    for y, o in overrides.items():
        db.add(LeaveYearOverride(employee_id=emp.id, year=int(y), note=o["note"] or None, updated_by=user.id,
                                 **{col: o.get(k) for k, col in cols.items()}))
        db.add(LeaveAdjustment(employee_id=emp.id, year=int(y), entry_date=body.date, action="replace_year",
                               note=o["note"] or None, created_by=user.id, snapshot={k: o.get(k) for k in cols}))
    audit(db, request, user, "update", "leave_balance", emp.id, {"years": sorted(overrides)})
    db.commit()
    return balance_detail(employee_id, user, db)


class UsedThroughIn(BaseModel):
    employee_id: uuid.UUID
    end: date


@router.post("/leave/used-through", response_model=dict[str, float])
def used_through(body: list[UsedThroughIn], _: User = Depends(require_roles(*HR_READ_ROLES, Role.finance)), db: Session = Depends(get_db)):
    """For the payroll «ما تم استحقاقه» column: days of annual leave taken up to each end date. Key = "<id>|<end>"."""
    book = lv.load_book(db, today_riyadh())
    out: dict[str, float] = {}
    for it in body[:500]:
        emp = db.get(Employee, it.employee_id)
        if emp is not None:
            out[f"{it.employee_id}|{it.end.isoformat()}"] = book.used_through(emp, it.end)
    return out
