"""Employee app: my requests and leave balance, my team, and the approvals queue (legacy ariba_submit_request,
ariba_employee_context.workflowRequests/team, ariba_staff_queue, ariba_workflow_action).

Approvals: the direct manager acts on the `manager` stage of their team's requests; hr/admin on `hr`; ceo/admin on `ceo`.
"""

import uuid
from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.auth import get_current_user
from app.core.errors import ApiError, forbidden, not_found
from app.core.scheduling import today_riyadh
from app.database import get_db
from app.models import (
    Employee,
    Holiday,
    PunchKind,
    Request as Req,
    RequestStatus,
    RequestStep,
    RequestType,
    Role,
    User,
    WorkflowStage,
)
from app.routers.leave import LEAVE_TYPES
from app.services import leave as lv
from app.services import workflow as wf

router = APIRouter(prefix="/me", tags=["me"])

# Types the employee app offers (legacy LVL + V114 forgot_punch + V21 overtime).
HOURLY = {RequestType.permission, RequestType.maternity_permission, RequestType.early_leave}


class MyRequestIn(BaseModel):
    type: RequestType
    from_date: date | None = None
    to_date: date | None = None
    on_date: date | None = None
    time_from: time | None = None
    time_to: time | None = None
    hours: Decimal | None = Field(None, ge=0, le=24)
    amount: Decimal | None = Field(None, ge=0)
    punch_kind: PunchKind | None = None
    notes: str | None = Field(None, max_length=2000)


class MyRequestOut(BaseModel):
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
    time_from: str | None
    time_to: str | None
    hours: Decimal | None
    amount: Decimal | None
    punch_kind: str | None
    notes: str | None
    rejection_reason: str | None
    created_at: datetime


def _hm(t: time | None) -> str | None:
    return t.strftime("%H:%M") if t else None


def _out(r: Req, name: str) -> MyRequestOut:
    return MyRequestOut(
        id=r.id, employee_id=r.employee_id, employee_name=name, type=r.type.value, status=r.status.value,
        stage=r.current_stage.value, from_date=r.from_date, to_date=r.to_date, days=r.days, on_date=r.on_date,
        time_from=_hm(r.time_from), time_to=_hm(r.time_to), hours=r.hours, amount=r.amount,
        punch_kind=r.punch_kind.value if r.punch_kind else None, notes=r.notes,
        rejection_reason=r.rejection_reason, created_at=r.created_at,
    )


def _me(db: Session, user: User) -> Employee:
    emp = db.get(Employee, user.employee_id) if user.employee_id else None
    if emp is None or emp.deleted_at is not None:
        raise not_found("Employee")
    return emp


def _bad(msg: str) -> ApiError:
    return ApiError(422, "invalid_request", msg)


@router.get("/requests", response_model=list[MyRequestOut])
def my_requests(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    emp = _me(db, user)
    rows = db.scalars(select(Req).where(Req.employee_id == emp.id).order_by(Req.created_at.desc()))
    return [_out(r, emp.name_ar) for r in rows]


@router.post("/requests", response_model=MyRequestOut, status_code=201)
def submit_request(body: MyRequestIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    emp = _me(db, user)
    today = today_riyadh()
    r = Req(employee_id=emp.id, type=body.type, notes=(body.notes or "").strip() or None, submitted_by=user.id)
    t = body.type
    if t in LEAVE_TYPES or t == RequestType.mission:
        if not body.from_date or not body.to_date or body.to_date < body.from_date:
            raise _bad("حدد الفترة بشكل صحيح")
        book = lv.load_book(db, today)
        days = lv.request_days(book, t, body.from_date, body.to_date)
        if t == RequestType.annual and days > book.current(emp):
            raise ApiError(422, "exceeds_balance", "يتجاوز الرصيد المتاح")
        r.from_date, r.to_date, r.days = body.from_date, body.to_date, Decimal(days)
    elif t in HOURLY:
        if not body.on_date or not body.time_from:
            raise _bad("حدد التاريخ والوقت")
        r.on_date, r.time_from, r.hours = body.on_date, body.time_from, body.hours or Decimal(1)
    elif t == RequestType.advance:
        if not body.amount or body.amount <= 0:
            raise _bad("أدخل مبلغ السلفة")
        r.amount = body.amount
    elif t == RequestType.overtime:
        if not body.on_date or not body.hours or body.hours < Decimal("0.5"):
            raise _bad("حدد التاريخ والساعات (0.5 على الأقل)")
        r.on_date, r.hours = body.on_date, body.hours
    elif t == RequestType.forgot_punch:
        if not body.punch_kind or not body.on_date:
            raise _bad("اختر النوع والتاريخ")
        if body.on_date > today:
            raise _bad("لا يمكن اختيار تاريخ في المستقبل")
        if not body.time_from:
            raise _bad("اختر الوقت")
        if body.punch_kind == PunchKind.both and (not body.time_to or body.time_to <= body.time_from):
            raise _bad("وقت الخروج لازم يكون بعد وقت الدخول")
        if not r.notes:
            raise _bad("اكتب السبب")
        r.punch_kind, r.on_date, r.time_from = body.punch_kind, body.on_date, body.time_from
        r.time_to = body.time_to if body.punch_kind == PunchKind.both else None
    else:
        raise _bad("نوع طلب غير مدعوم")
    r.current_stage = wf.first_stage(db, t, has_manager=emp.manager_id is not None, submitted_by_hr=False)
    db.add(r)
    db.flush()
    wf.submitted(db, r, user)
    audit(db, request, user, "create", "request", r.id, {"type": t.value, "self": True})
    db.commit()
    return _out(r, emp.name_ar)


@router.delete("/requests/{request_id}", status_code=204)
def delete_my_request(request_id: uuid.UUID, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """V124: the employee may delete a request that is not approved yet (approved ones stay with HR)."""
    emp = _me(db, user)
    r = db.get(Req, request_id)
    if r is None or r.employee_id != emp.id:
        raise not_found("Request")
    if r.status == RequestStatus.approved:
        raise ApiError(409, "approved", "لا يمكن حذف طلب معتمد")
    db.execute(delete(RequestStep).where(RequestStep.request_id == r.id))
    db.delete(r)
    audit(db, request, user, "delete", "request", request_id, {"self": True})
    db.commit()


class MyLeaveOut(BaseModel):
    current: float
    carry: float
    year_end: float
    annual: float
    upcoming_holidays: list[dict]


@router.get("/leave", response_model=MyLeaveOut)
def my_leave(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    emp = _me(db, user)
    today = today_riyadh()
    book = lv.load_book(db, today)
    s = book.summary(emp)
    hols = [
        {"name": h.name_ar, "date": h.start_date.isoformat(), "days": h.days}
        for h in db.scalars(select(Holiday).where(Holiday.start_date >= today).order_by(Holiday.start_date).limit(4))
    ]
    return MyLeaveOut(current=s["current"], carry=s["carry"], year_end=s["year_end"], annual=book.annual(emp), upcoming_holidays=hols)


# --------------------------------------------------------------------------- team and approvals


class TeamMember(BaseModel):
    id: uuid.UUID
    emp_no: str
    name_ar: str
    job_title: str | None


@router.get("/team", response_model=list[TeamMember])
def my_team(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    emp = _me(db, user)
    rows = db.scalars(
        select(Employee).where(Employee.manager_id == emp.id, Employee.deleted_at.is_(None), Employee.termination_date.is_(None)).order_by(Employee.name_ar)
    )
    return [TeamMember(id=e.id, emp_no=e.emp_no, name_ar=e.name_ar, job_title=e.job_title) for e in rows]


def _can_act(user: User, r: Req, emp: Employee) -> bool:
    if r.status != RequestStatus.pending:
        return False
    if r.current_stage == WorkflowStage.manager:
        return user.employee_id is not None and emp.manager_id == user.employee_id
    if r.current_stage == WorkflowStage.hr:
        return user.role in (Role.hr, Role.admin)
    if r.current_stage == WorkflowStage.ceo:
        return user.role in (Role.ceo, Role.admin)
    return False


@router.get("/approvals", response_model=list[MyRequestOut])
def my_approvals(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = list(db.scalars(select(Req).where(Req.status == RequestStatus.pending).order_by(Req.created_at)))
    emps = {e.id: e for e in db.scalars(select(Employee).where(Employee.id.in_({r.employee_id for r in rows})))} if rows else {}
    return [_out(r, emps[r.employee_id].name_ar) for r in rows if r.employee_id in emps and _can_act(user, r, emps[r.employee_id])]


class DecisionIn(BaseModel):
    action: Literal["approve", "reject"]
    reason: str | None = Field(None, max_length=2000)


@router.post("/approvals/{request_id}", response_model=MyRequestOut)
def decide(request_id: uuid.UUID, body: DecisionIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.get(Req, request_id)
    emp = db.get(Employee, r.employee_id) if r else None
    if r is None or emp is None:
        raise not_found("Request")
    if not _can_act(user, r, emp):
        raise forbidden("ليست لديك صلاحية على هذا الطلب")
    if body.action == "approve":
        wf.approve(db, r, user, body.reason)
    else:
        wf.reject(db, r, user, body.reason or "")
    audit(db, request, user, body.action, "request", r.id, {"stage": r.current_stage.value})
    db.commit()
    return _out(r, emp.name_ar)


# --------------------------------------------------------------------------- payslips (V119)
from app.models import PayrollRow, PayrollRun  # noqa: E402

# Keys of the HR payroll row (frontend/hr-web/src/lib/calc/payroll.ts) shown on the legacy V119 payslip.
_SLIP_KEYS = ("salByDays", "houPay", "traPay", "prjPay", "othPay", "otherAllow", "overtime", "leaveComp", "eosAmt",
              "totalDue", "insEmp", "noInsDeduct", "loanDeduct", "otherDeduct", "net", "netSAR", "currency")


class Payslip(BaseModel):
    year: int
    month: int
    data: dict


@router.get("/payslips", response_model=list[Payslip])
def my_payslips(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Rows of the approved payrolls only (legacy ME.payroll), newest first."""
    emp = _me(db, user)
    q = (
        select(PayrollRun.year, PayrollRun.month, PayrollRow.data)
        .join(PayrollRow, PayrollRow.run_id == PayrollRun.id)
        .where(PayrollRun.status == "approved", PayrollRow.employee_id == emp.id)
        .order_by(PayrollRun.year.desc(), PayrollRun.month.desc())
    )
    return [Payslip(year=y, month=m, data={k: (d or {}).get(k) for k in _SLIP_KEYS}) for y, m, d in db.execute(q)]


# --------------------------------------------------------------------------- notifications bell (V118)
from datetime import timedelta, timezone  # noqa: E402

from app.models import SentLetter  # noqa: E402

TYPE_AR = {
    "annual": "إجازة سنوية", "sick": "إجازة مرضية", "emergency": "إجازة اضطرارية", "death": "إجازة وفاة",
    "marriage": "إجازة زواج", "maternity": "إجازة أمومة", "paternity": "إجازة أبوة", "umrah": "إجازة عمرة",
    "hajj": "إجازة حج", "remote": "عمل عن بعد", "permission": "استئذان", "maternity_permission": "استئذان أمومة",
    "early_leave": "خروج مبكر", "advance": "سلفة", "mission": "مهمة خارجية", "forgot_punch": "نسيان بصمة",
    "overtime": "عمل إضافي",
}


class Notification(BaseModel):
    id: str
    kind: Literal["template", "request", "ok", "no"]
    title: str
    body: str | None
    at: datetime
    target: str  # app tab to open


def _aware(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


@router.get("/notifications", response_model=list[Notification])
def my_notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Built from live data, newest first (last 60 days): forms waiting for my answer, decisions on my requests,
    and requests waiting for my approval. Read/unread is kept on the device."""
    emp = _me(db, user)
    since = datetime.now(timezone.utc) - timedelta(days=60)
    out: list[Notification] = []
    for x in db.scalars(select(SentLetter).where(SentLetter.employee_id == emp.id, SentLetter.status == "pending")):
        out.append(Notification(id=f"l:{x.id}", kind="template", title=f"نموذج جديد بانتظار ردك: {x.title}", body=None, at=_aware(x.created_at), target="documents"))
    q = select(Req).where(Req.employee_id == emp.id, Req.status != RequestStatus.pending, Req.decided_at.is_not(None))
    for r in db.scalars(q):
        ok = r.status == RequestStatus.approved
        name = TYPE_AR.get(r.type.value, r.type.value)
        out.append(Notification(
            id=f"d:{r.id}", kind="ok" if ok else "no",
            title=f"✅ تمت الموافقة على طلب {name}" if ok else f"⚠️ تم رفض طلب {name}",
            body=None if ok else r.rejection_reason, at=_aware(r.decided_at), target="leaves",
        ))
    for r in my_approvals(user, db):
        out.append(Notification(id=f"a:{r.id}", kind="request", title=f"طلب بانتظار موافقتك: {r.employee_name}",
                                body=TYPE_AR.get(r.type, r.type), at=_aware(r.created_at), target="team"))
    # Waiting items stay until answered; decisions are kept for 60 days.
    return sorted((n for n in out if n.kind in ("template", "request") or n.at >= since), key=lambda n: n.at, reverse=True)[:50]
