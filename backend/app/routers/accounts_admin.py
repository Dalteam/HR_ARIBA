"""Accounts (Stage 18): delete an employee into the recycle bin, and the accounts still on a temporary password.

    DELETE /employees/{employee_id}          employees_admin: edit (hr, admin_manager, admin, chairman)
    GET    /accounts/temporary-password      employees_admin: edit

Owner's decisions: deleting is allowed for HR and admin (4 Nov 2026, the matrix's `employees_admin`); the
temporary-password list shows names, usernames and roles, never a password (3 Nov 2026, decision a — passwords are
stored only as hashes). Rules: BUSINESS_RULES § Accounts.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.database import get_db
from app.routers import canonical
from app.services import employee_delete

router = APIRouter(tags=["accounts-admin"])


@router.delete("/employees/{employee_id}")
def delete_employee(employee_id: str, request: Request, actor: dict[str, Any] = Depends(canonical.current_actor),
                    db: Session = Depends(get_db)):
    canonical._perm(actor, "employees_admin", "edit")
    row = canonical._row(db, "SELECT employee_id, name_ar FROM public.employee_directory WHERE employee_id=:e FOR UPDATE",
                         e=employee_id)
    if not row:
        raise ApiError(404, "not_found", "Employee not found")
    if employee_id == actor.get("employee_id"):
        raise ApiError(403, "own_record", "لا يمكنك حذف ملفك بنفسك")
    reasons = employee_delete.blockers(db, employee_id)
    if reasons:
        raise ApiError(409, "employee_linked", "لا يمكن حذف الموظف: " + "، ".join(reasons) +
                       ". يمكنك إنهاء خدمته بدل الحذف.", details={"reasons": reasons})
    counts = employee_delete.delete(db, employee_id, actor)
    canonical._write_audit(db, actor, request, "employees", "delete", "employee", employee_id,
                           summary=f"حذف الموظف {row['name_ar'] or employee_id} (نسخة في سلة المهملات)", details=counts)
    db.commit()
    return {"employee_id": employee_id, "deleted": True, "in_bin": True, **counts}


@router.get("/accounts/temporary-password")
def temporary_password_accounts(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """Active accounts whose `must_change` is on: a temporary password was issued and not yet replaced."""
    canonical._perm(actor, "employees_admin", "edit")
    return canonical._rows(db, """SELECT a.id::text AS user_id, a.employee_id, a.username, a.role, e.name_ar, e.name_en,
            a.updated_at AS since
        FROM public.ariba_auth_accounts a LEFT JOIN public.employee_directory e ON e.employee_id = a.employee_id
        WHERE a.active AND a.must_change ORDER BY a.username""")
