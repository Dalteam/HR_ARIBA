"""HR portal dashboard."""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.permissions import HR_READ_ROLES, require_roles
from app.database import get_db
from app.models import User
from app.schemas import DashboardOut
from app.services import dashboard as svc

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut)
def dashboard(request: Request, user: User = Depends(require_roles(*HR_READ_ROLES)), db: Session = Depends(get_db)):
    out = svc.build(db, user)
    audit(db, request, user, "read", "dashboard", details={"salary": out.payroll_total is not None})
    db.commit()
    return out
