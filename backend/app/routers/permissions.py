"""Roles and permissions (الصلاحيات والأشخاص): the matrix, the accounts and their roles, and my own levels.

    GET  /permissions                          the matrix of the four edited roles × 19 modules, and can_edit
    PUT  /permissions                          {role, module, level} — admin / chairman only (P1, P3)
    GET  /permissions/accounts                 active accounts: employee, username, name, role
    PUT  /permissions/accounts/{employee_id}   {role} — admin / chairman only; admin / chairman roles by admin (P2)
    GET  /me/permissions                       my role's 19 levels (P5: the portal's menu and buttons)

The design's `ariba_perms_matrix`, `ariba_perms_set`, `ariba_hr_list_roles` and `ariba_hr_set_role` are the
specification; BUSINESS_RULES § Roles and permissions matrix (P1–P6) has the rules. Every change writes an audit
row under module `security` with the old and new values (P4), and clears the matrix cache so it applies at once.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.database import get_db
from app.routers import canonical
from app.services import permissions as perms

router = APIRouter(tags=["permissions"])


def _admin(actor: dict[str, Any]) -> None:
    if actor.get("role") not in perms.FULL_ROLES:
        raise ApiError(403, "forbidden", "تعديل الصلاحيات للمدير (Admin) ورئيس المجلس فقط")


def _invalid(message: str) -> ApiError:
    return ApiError(422, "validation_error", message)


@router.get("/permissions")
def get_matrix(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    canonical._perm(actor, "permissions")
    stored = perms.load(db)
    return {"roles": list(perms.EDITABLE_ROLES), "full_roles": list(perms.FULL_ROLES), "modules": list(perms.MODULES),
            "levels": list(perms.LEVELS), "capped": perms.CAPPED,
            "matrix": {role: perms.levels_for(role, stored) for role in perms.EDITABLE_ROLES},
            "can_edit": actor.get("role") in perms.FULL_ROLES}


def matrix_change(body: Any) -> tuple[str, str, str]:
    """P3: one of the four roles, one of the 19 modules, one of the three levels; `permissions` above `view` is
    refused rather than silently capped."""
    if not isinstance(body, dict):
        raise _invalid("The body must be an object")
    role, module, level = (str(body.get(k) or "").strip() for k in ("role", "module", "level"))
    if role not in perms.EDITABLE_ROLES:
        raise _invalid("هذا الدور لا تُعدَّل صلاحياته")
    if module not in perms.MODULES:
        raise _invalid("الوحدة غير معروفة")
    if level not in perms.LEVELS:
        raise _invalid("المستوى يجب أن يكون none أو view أو edit")
    cap = perms.CAPPED.get(module)
    if cap and perms.RANK[level] > perms.RANK[cap]:
        raise _invalid("تعديل الصلاحيات يبقى للمدير (Admin) ورئيس المجلس فقط")
    return role, module, level


@router.put("/permissions")
def set_level(body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(canonical.current_actor),
              db: Session = Depends(get_db)):
    _admin(actor)
    role, module, level = matrix_change(body)
    old = db.scalar(text("SELECT level FROM public.ariba_role_perms WHERE role=:r AND module=:m"),
                    {"r": role, "m": module})
    db.execute(text("""INSERT INTO public.ariba_role_perms(role, module, level, updated_at, updated_by)
        VALUES (:r, :m, :l, now(), :by)
        ON CONFLICT (role, module) DO UPDATE SET level=EXCLUDED.level, updated_at=now(), updated_by=EXCLUDED.updated_by"""),
        {"r": role, "m": module, "l": level, "by": actor.get("employee_id")})
    canonical._write_audit(db, actor, request, "security", "تعديل صلاحية", "role_perms", f"{role}.{module}",
                           summary=f'صلاحية "{module}" للدور {role}: من {old or "none"} إلى {level}',
                           details={"role": role, "module": module, "old": old, "new": level})
    db.commit()
    perms.clear_cache()
    return {"role": role, "module": module, "level": level}


@router.get("/permissions/accounts")
def list_accounts(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    canonical._perm(actor, "permissions")
    rows = canonical._rows(db, """SELECT a.id::text AS user_id, a.employee_id, a.username, a.role, e.name_ar, e.name_en
        FROM public.ariba_auth_accounts a LEFT JOIN public.employee_directory e ON e.employee_id = a.employee_id
        WHERE a.active ORDER BY a.username""")
    return {"accounts": rows, "roles": list(perms.ALL_ROLES), "can_edit": actor.get("role") in perms.FULL_ROLES,
            "can_grant_admin": actor.get("role") == "admin"}


@router.put("/permissions/accounts/{employee_id}")
def set_role(employee_id: str, body: dict[str, Any], request: Request,
             actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """P2, the design's ariba_hr_set_role: one employee's account(s) get the role."""
    _admin(actor)
    role = str((body or {}).get("role") or "").strip()
    if role not in perms.ALL_ROLES:
        raise _invalid("الدور غير معروف")
    canonical._role_grant(actor, role)
    accounts = canonical._rows(db, "SELECT * FROM public.ariba_auth_accounts WHERE employee_id=:e AND active",
                               e=employee_id)
    if not accounts:
        raise ApiError(404, "not_found", "لا يوجد حساب فعّال لهذا الموظف")
    if any(str(a["id"]) == str(actor.get("account_id")) for a in accounts):
        raise ApiError(403, "own_role", "لا يمكنك تغيير دورك بنفسك")
    for account in accounts:
        canonical._keep_an_admin(db, account, role, True)
    old = sorted({a["role"] for a in accounts})
    db.execute(text("UPDATE public.ariba_auth_accounts SET role=:r, updated_at=now() WHERE employee_id=:e AND active"),
               {"r": role, "e": employee_id})
    canonical._write_audit(db, actor, request, "security", "تغيير دور", "employee", employee_id,
                           summary=f"تغيير دور الموظف {employee_id}: من {', '.join(old)} إلى {role}",
                           details={"employee_id": employee_id, "old": old, "new": role})
    db.commit()
    return {"employee_id": employee_id, "role": role, "accounts_updated": len(accounts)}


@router.get("/me/permissions")
def my_permissions(actor: dict[str, Any] = Depends(canonical.current_actor)):
    """P5: what the portal may show this person; the API still checks every call."""
    role = actor.get("role")
    return {"role": role, "full": role in perms.FULL_ROLES,
            "perms": actor.get("perms") or perms.levels_for(role)}
