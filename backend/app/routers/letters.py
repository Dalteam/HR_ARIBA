"""Forms & letters sent to employees (legacy V71 "إرسال للموظف للتوقيع" + status card, V114 for all forms, V117
salary certificate). HR sends; the employee approves (موافقة) or objects (اعتراض, reason ≥ 3 chars) from the app."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.auth import get_current_user
from app.core.errors import ApiError, forbidden, not_found
from app.core.permissions import HR_READ_ROLES, HR_ROLES, require_roles
from app.database import get_db
from app.models import Employee, SentLetter, User

router = APIRouter(tags=["letters"])

TYPES = {"onboarding", "custody", "extension", "termination", "clearance", "experience", "evaluation", "contract_end", "salary_cert"}


class LetterIn(BaseModel):
    employee_id: uuid.UUID
    type: str
    title: str = Field(min_length=1, max_length=200)
    html: str = Field(min_length=1, max_length=5_000_000)


class LetterOut(BaseModel):
    id: uuid.UUID
    employee_id: uuid.UUID
    employee_name: str
    type: str
    title: str
    status: str
    rejection_reason: str | None
    created_at: datetime
    responded_at: datetime | None


class AckIn(BaseModel):
    action: str = Field(pattern="^(approved|rejected)$")
    reason: str | None = Field(None, max_length=2000)


def _out(x: SentLetter, names: dict) -> LetterOut:
    return LetterOut(id=x.id, employee_id=x.employee_id, employee_name=names.get(x.employee_id, "—"), type=x.type, title=x.title,
                     status=x.status, rejection_reason=x.rejection_reason, created_at=x.created_at, responded_at=x.responded_at)


def _names(db: Session, ids) -> dict:
    ids = set(ids)
    return {e.id: e.name_ar for e in db.scalars(select(Employee).where(Employee.id.in_(ids)))} if ids else {}


@router.post("/letters", response_model=LetterOut, status_code=201)
def send_letter(body: LetterIn, request: Request, user: User = Depends(require_roles(*HR_ROLES)), db: Session = Depends(get_db)):
    if body.type not in TYPES:
        raise ApiError(422, "invalid_type", "Unknown form type")
    emp = db.get(Employee, body.employee_id)
    if emp is None or emp.deleted_at is not None:
        raise not_found("Employee")
    x = SentLetter(employee_id=emp.id, type=body.type, title=body.title, html=body.html, status="pending", sent_by=user.id)
    db.add(x)
    db.flush()
    audit(db, request, user, "send", "letter", x.id, {"type": body.type})
    db.commit()
    return _out(x, {emp.id: emp.name_ar})


@router.get("/letters", response_model=list[LetterOut])
def letters_status(_: User = Depends(require_roles(*HR_READ_ROLES)), db: Session = Depends(get_db)):
    rows = list(db.scalars(select(SentLetter).order_by(SentLetter.created_at.desc())))
    names = _names(db, (r.employee_id for r in rows))
    return [_out(r, names) for r in rows]


@router.delete("/letters/{letter_id}", status_code=204)
def delete_letter(letter_id: uuid.UUID, request: Request, user: User = Depends(require_roles(*HR_ROLES)), db: Session = Depends(get_db)):
    x = db.get(SentLetter, letter_id)
    if x is None:
        raise not_found("Letter")
    db.delete(x)
    audit(db, request, user, "delete", "letter", letter_id)
    db.commit()


def _visible(x: SentLetter, user: User) -> bool:
    return user.role in HR_READ_ROLES or (user.employee_id is not None and user.employee_id == x.employee_id)


@router.get("/letters/{letter_id}/html", response_class=HTMLResponse)
def letter_html(letter_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    x = db.get(SentLetter, letter_id)
    if x is None or not _visible(x, user):
        raise not_found("Letter")
    return HTMLResponse(x.html)


@router.get("/me/letters", response_model=list[LetterOut])
def my_letters(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.employee_id is None:
        return []
    rows = list(db.scalars(select(SentLetter).where(SentLetter.employee_id == user.employee_id).order_by(SentLetter.created_at.desc())))
    names = _names(db, [user.employee_id])
    return [_out(r, names) for r in rows]


@router.post("/me/letters/{letter_id}/respond", response_model=LetterOut)
def respond(letter_id: uuid.UUID, body: AckIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    x = db.get(SentLetter, letter_id)
    if x is None or user.employee_id != x.employee_id:
        raise not_found("Letter")
    if x.status != "pending":
        raise ApiError(409, "already_answered", "تم الرد على هذا النموذج")
    if body.action == "rejected" and len((body.reason or "").strip()) < 3:
        raise ApiError(422, "reason_required", "اكتب سبب الاعتراض (3 أحرف على الأقل)")
    if user.role is None:
        raise forbidden()
    x.status = body.action
    x.rejection_reason = (body.reason or "").strip() or None if body.action == "rejected" else None
    x.responded_at = datetime.now(timezone.utc)
    audit(db, request, user, "respond", "letter", x.id, {"action": body.action})
    db.commit()
    return _out(x, _names(db, [x.employee_id]))
