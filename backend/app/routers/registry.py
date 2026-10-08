"""Employee document registry for the Documents page (الوثائق: الإقامات · الجوازات · التأمين الطبي · العقود).

Same rows as the legacy V60 `loadDocs`: every current employee (also those with blank fields); days left are
computed live from the expiry dates (legacy `dl`: round((expiry − today) / 1 day))."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.permissions import HR_READ_ROLES, require_roles
from app.core.scheduling import today_riyadh
from app.database import get_db
from app.models import ContractNature, Employee, User

router = APIRouter(prefix="/registry", tags=["registry"])


class DocRow(BaseModel):
    id: uuid.UUID
    emp_no: str
    name_ar: str
    workplace: str | None
    nationality: str | None
    national_id: str | None
    national_id_expiry: date | None
    national_id_days: int | None
    passport_no: str | None
    passport_expiry: date | None
    passport_days: int | None
    insurance_company: str | None
    insurance_class: str | None
    insurance_card_no: str | None
    insurance_expiry: date | None
    insurance_days: int | None
    contract_type: str
    join_date: date | None
    contract_end_date: date | None
    contract_days: int | None


def _days(d: date | None, today: date) -> int | None:
    return (d - today).days if d else None


@router.get("/documents", response_model=list[DocRow])
def documents(_: User = Depends(require_roles(*HR_READ_ROLES)), db: Session = Depends(get_db)):
    today = today_riyadh()
    q = select(Employee).where(Employee.deleted_at.is_(None)).order_by(Employee.emp_no)
    out = []
    for e in db.scalars(q).unique():
        if e.is_terminated:
            continue
        out.append(DocRow(
            id=e.id, emp_no=e.emp_no, name_ar=e.name_ar,
            workplace=e.workplace.name_ar if e.workplace else None,
            nationality=e.nationality.name_ar if e.nationality else None,
            national_id=e.national_id, national_id_expiry=e.national_id_expiry, national_id_days=_days(e.national_id_expiry, today),
            passport_no=e.passport_no, passport_expiry=e.passport_expiry, passport_days=_days(e.passport_expiry, today),
            insurance_company=e.insurance_company, insurance_class=e.insurance_class, insurance_card_no=e.insurance_card_no,
            insurance_expiry=e.insurance_expiry, insurance_days=_days(e.insurance_expiry, today),
            contract_type="محدد المدة" if e.contract_nature == ContractNature.fixed else "غير محدد المدة",
            join_date=e.join_date, contract_end_date=e.contract_end_date, contract_days=_days(e.contract_end_date, today),
        ))
    return out
