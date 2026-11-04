"""Business cards (بطاقات العمل): the company design, per-employee overrides, and one employee's own card.

    GET  /bizcards                 the design panel's data: company design + cfg, overrides, and the people
    PUT  /bizcards                 HR saves the company design and its settings (two `ariba_app_settings` keys)
    PUT  /bizcards/{employee_id}   HR saves (or clears, with `design: null`) one employee's own design
    GET  /me/bizcard               the signed-in employee's card («بطاقتي»), the design resolved for them

All rendering stays in the browser, as in the design: `bizcardHtml.js` becomes `src/lib/bizcard.ts` in hr-web
and draws the same 90×50 mm card / 54×86 mm badge; the server only stores the design and answers the data.

Two rules worth naming:

* **`ariba_bizcards` is created by `docs/db-migrations/004_four_screens.sql`.** A database without it still
  answers `GET /bizcards` (no overrides) so the screen works read-only; saving returns `503
  migration_required` instead of a 500.
* **`ceo` may read and print, only `hr`/`admin`/`admin_manager` may save** (`employees:view` vs
  `employees:edit` in `ariba_role_perms`).
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.database import get_db
from app.routers import canonical

router = APIRouter(tags=["bizcards"])

#: The two settings keys of the design (`bizcard_design`, `bizcard_cfg`) — created on the first save.
DESIGN_KEY, CFG_KEY = "bizcard_design", "bizcard_cfg"

#: The reference refuses a per-employee design above 1.5 MB (`ariba_hr_set_bizcard`).
MAX_DESIGN_BYTES = 1_500_000


def _reader(actor: dict[str, Any]) -> None:
    canonical._require(actor, *canonical.HR_READ_ROLES)


def _writer(actor: dict[str, Any]) -> None:
    canonical._require(actor, *canonical.HR_ROLES)


def _table_ready(db: Session) -> bool:
    return bool(db.scalar(text("SELECT to_regclass('public.ariba_bizcards') IS NOT NULL")))


def _needs_migration() -> ApiError:
    return ApiError(503, "migration_required",
                    "جدول بطاقات العمل غير موجود — شغّل docs/db-migrations/004_four_screens.sql أولًا")


def _design(value: Any, field: str) -> dict[str, Any]:
    """A design is a JSON object; anything else is refused before it reaches the column."""
    if not isinstance(value, dict):
        raise ApiError(422, "validation_error", f"{field} must be an object")
    size = len(json.dumps(value, ensure_ascii=False).encode("utf-8"))
    if size > MAX_DESIGN_BYTES:
        raise ApiError(413, "value_too_large", f"{field} أكبر من الحد المسموح")
    return value


def _employees(db: Session) -> list[dict[str, Any]]:
    """The people a card can be printed for: active employees, with the fields the card prints.

    `job_title`, `department` and `employer` come from the lookup tables (the canonical shape) and fall back to
    the legacy `data` keys the card template reads, so an employee whose lookup row was never set still prints.
    """
    rows = canonical._rows(db, """
        SELECT d.employee_id, d.name_ar, d.name_en,
               coalesce(jt.name, d.data->>'jobTitle') AS job_title,
               coalesce(dp.name, d.data->>'dept') AS department,
               coalesce(er.name, d.data->>'employer') AS employer,
               coalesce(nullif(d.data->>'empNo',''), aa.username, d.employee_id) AS emp_no,
               d.data->>'mobile' AS mobile, d.data->>'email' AS email,
               coalesce(d.data->>'photoUrl','') <> '' AS has_photo
        FROM public.employee_directory d
        LEFT JOIN public.employers er ON er.id = d.employer_id
        LEFT JOIN public.departments dp ON dp.id = d.department_id
        LEFT JOIN public.job_titles jt ON jt.id = d.job_title_id
        LEFT JOIN public.ariba_auth_accounts aa ON aa.employee_id = d.employee_id
        WHERE d.active ORDER BY d.name_ar""")
    return [{"id": r["employee_id"], "employee_id": r["employee_id"], "emp_no": r["emp_no"],
             "name_ar": r["name_ar"] or "", "name_en": r["name_en"],
             "job_title": r["job_title"], "department": r["department"], "employer": r["employer"],
             "mobile": r["mobile"], "email": r["email"], "has_photo": bool(r["has_photo"])} for r in rows]


def _overrides(db: Session) -> dict[str, Any]:
    if not _table_ready(db):
        return {}
    rows = canonical._rows(db, "SELECT employee_id, design FROM public.ariba_bizcards")
    return {r["employee_id"]: r["design"] for r in rows}


@router.get("/bizcards")
def list_bizcards(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """Everything the screen needs in one answer: the design, its settings, the overrides and the people."""
    _reader(actor)
    return {"design": canonical._app_setting(db, DESIGN_KEY), "cfg": canonical._app_setting(db, CFG_KEY) or {},
            "logo": canonical._app_setting(db, "company_logo"), "names": canonical._app_setting(db, "company_names"),
            "overrides": _overrides(db), "employees": _employees(db),
            "can_edit": actor.get("role") in canonical.HR_ROLES}




@router.put("/bizcards")
def save_company_design(body: dict[str, Any], request: Request,
                        actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """Save the company-wide design and the card settings (`bizcard_design`, `bizcard_cfg`)."""
    _writer(actor)
    changed = []
    if "design" in body:
        canonical._set_app_setting(db, DESIGN_KEY, _design(body["design"], "design"), actor)
        changed.append(DESIGN_KEY)
    if "cfg" in body and body["cfg"] is not None:
        canonical._set_app_setting(db, CFG_KEY, _design(body["cfg"], "cfg"), actor)
        changed.append(CFG_KEY)
    if not changed:
        raise ApiError(422, "validation_error", "Send `design`, `cfg` or both")
    canonical._write_audit(db, actor, request, "employees", "bizcard_design", "ariba_app_settings", ",".join(changed),
                           summary="تعديل تصميم بطاقات العمل")
    db.commit()
    return {"design": canonical._app_setting(db, DESIGN_KEY), "cfg": canonical._app_setting(db, CFG_KEY) or {}}


@router.put("/bizcards/{employee_id}")
def save_employee_design(employee_id: str, body: dict[str, Any], request: Request,
                         actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """One employee's own design; `design: null` puts them back on the company design."""
    _writer(actor)
    if not canonical._row(db, "SELECT 1 AS x FROM public.employee_directory WHERE employee_id=:e", e=employee_id):
        raise ApiError(404, "not_found", "Employee not found")
    if not _table_ready(db):
        raise _needs_migration()
    design = body.get("design")
    if design is None:
        db.execute(text("DELETE FROM public.ariba_bizcards WHERE employee_id=:e"), {"e": employee_id})
        canonical._write_audit(db, actor, request, "employees", "bizcard_reset", "employee", employee_id,
                               summary="رجوع بطاقة الموظف لتصميم الشركة")
        db.commit()
        return {"employee_id": employee_id, "design": None, "deleted": True}
    design = _design(design, "design")
    db.execute(text("""INSERT INTO public.ariba_bizcards(employee_id, design, updated_at, updated_by)
        VALUES (:e, CAST(:d AS jsonb), now(), :by)
        ON CONFLICT (employee_id) DO UPDATE SET design=EXCLUDED.design, updated_at=now(), updated_by=EXCLUDED.updated_by"""),
        {"e": employee_id, "d": json.dumps(design, ensure_ascii=False), "by": actor.get("employee_id")})
    canonical._write_audit(db, actor, request, "employees", "bizcard_save", "employee", employee_id,
                           summary="حفظ تصميم بطاقة موظف")
    db.commit()
    return {"employee_id": employee_id, "design": design}


@router.get("/me/bizcard")
def my_bizcard(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """The signed-in employee's own card: the company design (or their override) plus their own fields."""
    employee_id = actor.get("employee_id")
    if not employee_id:
        raise ApiError(404, "not_found", "Employee not found")
    person = next((e for e in _employees(db) if e["id"] == employee_id), None)
    if person is None:  # a former employee keeps their card, read from the row itself
        row = canonical._row(db, """SELECT employee_id, name_ar, name_en, data FROM public.employee_directory
            WHERE employee_id=:e""", e=employee_id)
        if not row:
            raise ApiError(404, "not_found", "Employee not found")
        data = row.get("data") or {}
        person = {"id": row["employee_id"], "employee_id": row["employee_id"],
                  "emp_no": str(data.get("empNo") or row["employee_id"]), "name_ar": row["name_ar"] or "",
                  "name_en": row["name_en"], "job_title": data.get("jobTitle"), "department": data.get("dept"),
                  "employer": data.get("employer"), "mobile": data.get("mobile"), "email": data.get("email"),
                  "has_photo": bool(data.get("photoUrl"))}
    return {"cfg": canonical._app_setting(db, CFG_KEY) or {}, "names": canonical._app_setting(db, "company_names"),
            "logo": canonical._app_setting(db, "company_logo"), "design": canonical._app_setting(db, DESIGN_KEY),
            "mine": _overrides(db).get(employee_id), "employee": person}

