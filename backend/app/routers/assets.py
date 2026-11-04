"""Fixed assets and custody (الأصول الثابتة والعهد): the register, its custody moves, and the delete to the bin.

    GET    /assets                    every asset (with its holder's name), the newest 1000 custody moves, and for
                                      the editing roles the active employees custody can go to (names only)
    POST   /assets                    add one; the server numbers it AST-0001, AST-0002, … (`ariba_asset_seq`)
    PUT    /assets/{asset_id}         edit one
    DELETE /assets/{asset_id}         delete one; a snapshot goes to `ariba_deleted_items` (kind `asset`)
    POST   /assets/{asset_id}/custody hand it to an employee, or return it to the company (`employee_id: null`)

The design's database functions are the specification (`ariba_assets_list`, `ariba_assets_upsert`,
`ariba_assets_delete`, `ariba_asset_custody`); the rules are BUSINESS_RULES § Fixed assets and custody (A1–A7).
Both tables already exist in this schema with the design's columns and checks, so there is no migration.

* **The server stores, the browser computes**: depreciation, the register totals and the annual inventory are
  worked out by the screen from this list, as the design does.
* **The checks run here first** (A1–A3), so a bad form answers 422 with a message instead of a database error.
* **A deleted asset is archive-only in the bin**, as in the design: its custody moves go with the snapshot (the
  log rows themselves cascade away with the asset).
"""

from __future__ import annotations

import json
import uuid
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.database import get_db
from app.routers import canonical

router = APIRouter(tags=["assets"])

#: The client's starting matrix for `assets` (Stage 11 reads the live one): edit for hr, admin_manager,
#: finance (+ admin, chairman), view for the CEO. The checks below go through `canonical._perm`.
EDIT_ROLES = ("hr", "admin", "admin_manager", "finance", "chairman")
READ_ROLES = EDIT_ROLES + ("ceo",)

CATEGORIES = ("computers", "electronics", "vehicles", "furniture", "equipment", "software", "other")
STATUSES = ("active", "sold", "disposed", "lost")

#: How many custody moves the list returns (the design's `limit 1000`).
LOG_LIMIT = 1000
#: A new asset with no life given gets the design's default of five years.
DEFAULT_LIFE_MONTHS = 60
#: numeric(14,2): twelve digits before the point.
MAX_AMOUNT = Decimal("999999999999.99")
TEXT_LIMITS = {"serial_no": 120, "model": 120, "location": 200, "condition": 200, "notes": 2000}


def _reader(actor: dict[str, Any]) -> None:
    canonical._perm(actor, "assets")


def _editor(actor: dict[str, Any]) -> None:
    canonical._perm(actor, "assets", "edit")


def _invalid(message: str) -> ApiError:
    return ApiError(422, "validation_error", message)


def _uuid(value: Any) -> str:
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, AttributeError, TypeError) as exc:
        raise _invalid("asset_id must be a uuid") from exc


def _date(value: Any, field: str) -> date | None:
    if value is None or not str(value).strip():
        return None
    try:
        return date.fromisoformat(str(value).strip()[:10])
    except ValueError as exc:
        raise _invalid(f"{field} must be a date (YYYY-MM-DD)") from exc


def _amount(value: Any, field: str, default: Decimal) -> Decimal:
    if value is None or (isinstance(value, str) and not value.strip()):
        return default
    if isinstance(value, bool):
        raise _invalid(f"{field} must be a number")
    try:
        amount = Decimal(str(value).strip())
    except InvalidOperation as exc:
        raise _invalid(f"{field} must be a number") from exc
    if not amount.is_finite() or amount < 0 or amount > MAX_AMOUNT:
        raise _invalid(f"{field} يجب أن يكون رقمًا موجبًا")
    return amount.quantize(Decimal("0.01"))


def _life_months(body: dict[str, Any], default: int) -> int:
    """`useful_life_months`, or `useful_life_years` × 12 (the design's function accepts both)."""
    months, years = body.get("useful_life_months"), body.get("useful_life_years")
    try:
        if months not in (None, ""):
            life = Decimal(str(months))
        elif years not in (None, ""):
            life = Decimal(str(years)) * 12
        else:
            return default
    except InvalidOperation as exc:
        raise _invalid("useful_life_months must be a number") from exc
    if not life.is_finite():
        raise _invalid("useful_life_months must be a number")
    life_months = int(life.to_integral_value())
    if not 1 <= life_months <= 1200:
        raise _invalid("العمر الافتراضي بين شهر و100 سنة")
    return life_months


def _text(body: dict[str, Any], field: str, existing: dict[str, Any] | None) -> str | None:
    if field not in body:
        return (existing or {}).get(field)
    value = str(body.get(field) or "").strip()
    if len(value) > TEXT_LIMITS[field]:
        raise _invalid(f"{field} أطول من المسموح")
    return value or None


def asset_fields(body: dict[str, Any], existing: dict[str, Any] | None = None) -> dict[str, Any]:
    """The columns one add / edit writes, after A1–A3. `existing` fills what an edit leaves out."""
    if not isinstance(body, dict):
        raise _invalid("The body must be an object")
    old = existing or {}
    name = str((body.get("name") if "name" in body else old.get("name")) or "").strip()
    if not name:
        raise _invalid("اكتب اسم الأصل")
    if len(name) > 200:
        raise _invalid("اسم الأصل أطول من المسموح")
    category = str(body.get("category") or old.get("category") or "other").strip()
    if category not in CATEGORIES:
        raise _invalid("الفئة غير معروفة")
    acquired = _date(body.get("acquisition_date"), "acquisition_date") if "acquisition_date" in body \
        else old.get("acquisition_date")
    if acquired is None:
        raise _invalid("تاريخ الشراء مطلوب")
    cost = _amount(body.get("cost"), "cost", Decimal(str(old.get("cost") or 0)))
    salvage = _amount(body.get("salvage_value"), "salvage_value", Decimal(str(old.get("salvage_value") or 0)))
    if salvage > cost:
        raise _invalid("القيمة التخريدية أكبر من التكلفة")
    life = _life_months(body, int(old.get("useful_life_months") or DEFAULT_LIFE_MONTHS))
    capitalized = body.get("capitalized", old.get("capitalized", True))
    if not isinstance(capitalized, bool):
        raise _invalid("capitalized must be true or false")
    status = str(body.get("status") or old.get("status") or "active").strip()
    if status not in STATUSES:
        raise _invalid("حالة الأصل غير معروفة")
    if status == "active":
        disposal_date, disposal_value = None, Decimal("0")
    else:
        disposal_date = _date(body.get("disposal_date"), "disposal_date") if "disposal_date" in body \
            else old.get("disposal_date")
        if disposal_date is None:
            raise _invalid("اكتب تاريخ الاستبعاد")
        if disposal_date < acquired:
            raise _invalid("تاريخ الاستبعاد قبل الشراء")
        disposal_value = _amount(body.get("disposal_value"), "disposal_value",
                                 Decimal(str(old.get("disposal_value") or 0)))
    fields = {"name": name, "category": category, "acquisition_date": acquired, "cost": cost,
              "salvage_value": salvage, "useful_life_months": life, "capitalized": capitalized,
              "status": status, "disposal_date": disposal_date, "disposal_value": disposal_value}
    for field in TEXT_LIMITS:
        fields[field] = _text(body, field, existing)
    return fields


_SELECT = """SELECT a.*, d.name_ar AS custodian_name
    FROM public.ariba_assets a LEFT JOIN public.employee_directory d ON d.employee_id = a.custodian_employee_id"""


def _asset(db: Session, asset_id: str, *, lock: bool = False) -> dict[str, Any]:
    row = canonical._row(db, "SELECT * FROM public.ariba_assets WHERE id=CAST(:id AS uuid)"
                         + (" FOR UPDATE" if lock else ""), id=asset_id)
    if not row:
        raise ApiError(404, "not_found", "الأصل غير موجود")
    return row


def _answer(db: Session, asset_id: str) -> dict[str, Any]:
    return canonical._row(db, _SELECT + " WHERE a.id=CAST(:id AS uuid)", id=asset_id) or {}


def _details(row: dict[str, Any]) -> dict[str, Any]:
    return json.loads(json.dumps(row, default=str, ensure_ascii=False))


@router.get("/assets")
def list_assets(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """The register and the custody moves, in one answer (the design's `ariba_assets_list`)."""
    _reader(actor)
    assets = canonical._rows(db, _SELECT + " ORDER BY a.asset_no")
    log = canonical._rows(db, "SELECT * FROM public.ariba_asset_custody_log ORDER BY id DESC LIMIT :n", n=LOG_LIMIT)
    can_edit = canonical._can(actor, "assets", "edit")
    return {"assets": assets, "log": log, "can_edit": can_edit, "people": _people(db) if can_edit else []}


def _people(db: Session) -> list[dict[str, Any]]:
    """Who custody can be handed to: active employees, id + number + names only.

    `finance` edits assets but may not list employees (`GET /employees` refuses it), so the custody picker reads
    its names from here — nothing else about the person.
    """
    return canonical._rows(db, """SELECT d.employee_id, d.name_ar, d.name_en,
               coalesce(nullif(d.data->>'empNo',''), aa.username, d.employee_id) AS emp_no
        FROM public.employee_directory d
        LEFT JOIN public.ariba_auth_accounts aa ON aa.employee_id = d.employee_id
        WHERE d.active ORDER BY d.name_ar""")


@router.post("/assets", status_code=201)
def create_asset(body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(canonical.current_actor),
                 db: Session = Depends(get_db)):
    _editor(actor)
    fields = asset_fields(body)
    columns = ", ".join(fields)
    values = ", ".join(f":{key}" for key in fields)
    row = canonical._row(db, f"""INSERT INTO public.ariba_assets
        (asset_no, {columns}, created_by, updated_by)
        VALUES ('AST-' || lpad(nextval('public.ariba_asset_seq')::text, 4, '0'), {values}, :by, :by)
        RETURNING id::text AS id, asset_no""", **fields, by=actor.get("employee_id"))
    canonical._write_audit(db, actor, request, "assets", "إضافة أصل", "asset", row["id"],
                           summary=f"إضافة {row['asset_no']} — {fields['name']} (التكلفة {fields['cost']})",
                           details=_details(fields))
    db.commit()
    return _answer(db, row["id"])


@router.put("/assets/{asset_id}")
def update_asset(asset_id: str, body: dict[str, Any], request: Request,
                 actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    _editor(actor)
    asset_id = _uuid(asset_id)
    existing = _asset(db, asset_id, lock=True)
    fields = asset_fields(body, existing)
    assignments = ", ".join(f"{key}=:{key}" for key in fields)
    db.execute(text(f"""UPDATE public.ariba_assets SET {assignments}, updated_by=:by, updated_at=now()
        WHERE id=CAST(:id AS uuid)"""), {**fields, "by": actor.get("employee_id"), "id": asset_id})
    canonical._write_audit(db, actor, request, "assets", "تعديل أصل", "asset", asset_id,
                           summary=f"تعديل {existing['asset_no']} — {fields['name']} (التكلفة {fields['cost']})",
                           details=_details(fields))
    db.commit()
    return _answer(db, asset_id)


@router.delete("/assets/{asset_id}")
def delete_asset(asset_id: str, request: Request, actor: dict[str, Any] = Depends(canonical.current_actor),
                 db: Session = Depends(get_db)):
    """Snapshot to the bin (the row and its custody moves), then delete; the moves cascade with the row."""
    _editor(actor)
    asset_id = _uuid(asset_id)
    existing = _asset(db, asset_id, lock=True)
    moves = canonical._rows(db, """SELECT * FROM public.ariba_asset_custody_log
        WHERE asset_id=CAST(:id AS uuid) ORDER BY id""", id=asset_id)
    snapshot = _details({**existing, "custody_log": moves})
    db.execute(text("""INSERT INTO public.ariba_deleted_items
        (kind, ref_id, employee_id, snapshot, deleted_by, deleted_by_role)
        VALUES ('asset', :ref, :emp, CAST(:snap AS jsonb), :by, :role)"""),
        {"ref": asset_id, "emp": existing.get("custodian_employee_id"),
         "snap": json.dumps(snapshot, ensure_ascii=False), "by": actor.get("employee_id"), "role": actor.get("role")})
    db.execute(text("DELETE FROM public.ariba_assets WHERE id=CAST(:id AS uuid)"), {"id": asset_id})
    canonical._write_audit(db, actor, request, "assets", "حذف أصل", "asset", asset_id,
                           summary=f"حذف {existing['asset_no']} — {existing['name']}",
                           details=_details(existing))
    db.commit()
    return {"id": asset_id, "deleted": True}


@router.post("/assets/{asset_id}/custody")
def move_custody(asset_id: str, body: dict[str, Any], request: Request,
                 actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """A4: log the current holder's return, then the new holder's receipt (or leave it with the company)."""
    _editor(actor)
    asset_id = _uuid(asset_id)
    if not isinstance(body, dict):
        raise _invalid("The body must be an object")
    existing = _asset(db, asset_id, lock=True)
    employee_id = str(body.get("employee_id") or "").strip() or None
    on = _date(body.get("date"), "date") or date.today()
    notes = str(body.get("notes") or "").strip() or None
    if notes and len(notes) > TEXT_LIMITS["notes"]:
        raise _invalid("notes أطول من المسموح")
    if employee_id and not canonical._row(db, "SELECT 1 AS x FROM public.employee_directory WHERE employee_id=:e",
                                          e=employee_id):
        raise ApiError(404, "employee_not_found", "الموظف غير موجود")
    log = """INSERT INTO public.ariba_asset_custody_log (asset_id, employee_id, action, at_date, notes, by_employee)
        VALUES (CAST(:a AS uuid), :e, :action, :on, :notes, :by)"""
    previous = existing.get("custodian_employee_id")
    common = {"a": asset_id, "on": on, "notes": notes, "by": actor.get("employee_id")}
    if previous:
        db.execute(text(log), {**common, "e": previous, "action": "return"})
    if employee_id:
        db.execute(text(log), {**common, "e": employee_id, "action": "assign"})
    db.execute(text("""UPDATE public.ariba_assets SET custodian_employee_id=:e, custody_date=:d,
        updated_by=:by, updated_at=now() WHERE id=CAST(:a AS uuid)"""),
        {"a": asset_id, "e": employee_id, "d": on if employee_id else None, "by": actor.get("employee_id")})
    canonical._write_audit(db, actor, request, "assets", "تسليم عهدة" if employee_id else "استلام عهدة", "asset",
                           asset_id,
                           summary=f"{existing['asset_no']} — {existing['name']} "
                                   + (f"← موظف {employee_id}" if employee_id else "← رجعت للشركة"),
                           details={"asset": existing["asset_no"], "from": previous, "to": employee_id})
    db.commit()
    return _answer(db, asset_id)
