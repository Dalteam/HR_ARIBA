"""Employee dependents (wife, husband, son, daughter, father, mother)."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import not_found
from app.core.permissions import can_view_full_ids
from app.core.security import mask_id
from app.models import Dependent, Employee, User
from app.schemas import DependentCreate, DependentIn, DependentOut, DocumentOut
from app.services import documents as doc_svc


def list_for(db: Session, employee_id: uuid.UUID) -> list[Dependent]:
    return list(
        db.scalars(
            select(Dependent)
            .where(Dependent.employee_id == employee_id, Dependent.deleted_at.is_(None))
            .order_by(Dependent.created_at)
        )
    )


def get(db: Session, dependent_id: uuid.UUID) -> Dependent:
    dep = db.get(Dependent, dependent_id)
    if dep is None or dep.deleted_at is not None:
        raise not_found("Dependent")
    return dep


def create(db: Session, emp: Employee, data: DependentCreate) -> Dependent:
    dep = Dependent(employee_id=emp.id, **data.model_dump())
    db.add(dep)
    db.flush()
    return dep


def update(dep: Dependent, data: DependentIn) -> list[str]:
    values = data.model_dump(exclude_unset=True)
    for required in ("relation", "name_ar"):
        if required in values and values[required] is None:
            values.pop(required)
    changed = [k for k, v in values.items() if getattr(dep, k) != v]
    for k, v in values.items():
        setattr(dep, k, v)
    return changed


def remove(dep: Dependent) -> None:
    dep.deleted_at = datetime.now(UTC)


def to_out(db: Session, dep: Dependent, emp: Employee, user: User) -> DependentOut:
    ident = (lambda v: v) if can_view_full_ids(user, emp) else mask_id
    return DependentOut(
        id=dep.id,
        employee_id=dep.employee_id,
        relation=dep.relation,
        name_ar=dep.name_ar,
        name_en=dep.name_en,
        birth_date=dep.birth_date,
        national_id=ident(dep.national_id),
        national_id_expiry=dep.national_id_expiry,
        passport_no=ident(dep.passport_no),
        passport_expiry=dep.passport_expiry,
        insurance_company=dep.insurance_company,
        insurance_card_no=ident(dep.insurance_card_no),
        insurance_expiry=dep.insurance_expiry,
        mobile=dep.mobile,
        documents=[DocumentOut.model_validate(d) for d in doc_svc.list_for_dependent(db, dep.id)],
    )
