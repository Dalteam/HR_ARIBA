"""Payroll «prepare for finance» (Stage 19): the month's cycle draft → prepared → approved (→ reopened).

    GET  /payroll/status/{key}      PY1  payroll: view
    POST /sheets/{key}/prepare      PY2  payroll_prepare: edit   {note}

and the two hooks the existing routes call (`routers/canonical.py`): `before_approve` (PY3: finance approves a prepared
month only) / `after_approve`, and `after_reopen` (PY4). The design's functions are the specification
(`ariba_payroll_prepare`, `ariba_payroll_status_get`, `ariba_payroll_reopen`); the table `ariba_payroll_status` was
already in the schema. Rules: BUSINESS_RULES § Payroll «prepare for finance».
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.database import get_db
from app.routers import canonical

router = APIRouter(tags=["payroll-status"])

MIN_REASON = 5


def _month(key: str) -> tuple[int, int]:
    ym = canonical._pay_key(key)
    if ym is None:
        raise ApiError(422, "invalid_key", "Invalid payroll sheet key")
    return ym


def _name(db: Session, actor: dict[str, Any]) -> str:
    row = canonical._row(db, "SELECT coalesce(name_ar, name_en) AS n FROM public.employee_directory WHERE employee_id=:e",
                         e=actor.get("employee_id"))
    return (row or {}).get("n") or actor.get("username") or ""


def status(db: Session, year: int, month: int) -> dict[str, Any]:
    row = canonical._row(db, "SELECT * FROM public.ariba_payroll_status WHERE pay_year=:y AND pay_month=:m", y=year, m=month) or {}
    rows, approved, approved_at, _ = canonical._month_rows(db, year, month)
    state = "approved" if approved else (row.get("status") if row.get("status") in ("prepared", "reopened") else "draft")
    return {"status": state, "rows": len(rows), "approved": approved,
            "prepared_by": row.get("prepared_by_name"), "prepared_at": row.get("prepared_at"), "prepare_note": row.get("prepare_note"),
            "approved_by": row.get("approved_by_name"), "approved_at": row.get("approved_at") or approved_at,
            "reopened_by": row.get("reopened_by_name"), "reopened_at": row.get("reopened_at"), "reopen_reason": row.get("reopen_reason")}


@router.get("/payroll/status/{key}")
def get_status(key: str, actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    canonical._perm(actor, "payroll")
    return status(db, *_month(key))


@router.post("/sheets/{key}/prepare")
def prepare(key: str, request: Request, body: dict[str, Any] | None = None,
            actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    canonical._perm(actor, "payroll_prepare", "edit")
    year, month = _month(key)
    rows, approved, _, _ = canonical._month_rows(db, year, month)
    if not rows:
        raise ApiError(404, "not_found", "احفظ المسير أولًا ثم جهّزه للاعتماد")
    if approved:
        raise ApiError(409, "already_approved", "المسير معتمد بالفعل")
    note = str((body or {}).get("note") or "").strip()[:500] or None
    who = _name(db, actor)
    db.execute(text("""INSERT INTO public.ariba_payroll_status (pay_year, pay_month, status, prepared_by, prepared_by_name,
            prepared_at, prepare_note, updated_at)
        VALUES (:y, :m, 'prepared', :by, :name, now(), :note, now())
        ON CONFLICT (pay_year, pay_month) DO UPDATE SET status='prepared', prepared_by=EXCLUDED.prepared_by,
            prepared_by_name=EXCLUDED.prepared_by_name, prepared_at=now(), prepare_note=EXCLUDED.prepare_note, updated_at=now()"""),
        {"y": year, "m": month, "by": actor.get("employee_id"), "name": who, "note": note})
    finance = canonical._rows(db, """SELECT DISTINCT employee_id FROM public.ariba_auth_accounts
        WHERE role='finance' AND active AND employee_id IS NOT NULL""")
    for person in finance:
        canonical._insert_notification(db, person["employee_id"], None, f"مسير {month}/{year} جاهز للاعتماد",
                                       f"جهّزه {who or 'الموارد البشرية'} — {len(rows)} موظف" + (f" — {note}" if note else ""),
                                       "finance", "payroll")
    canonical._write_audit(db, actor, request, "payroll", "prepare", "payroll_month", key,
                           summary=f"تجهيز مسير {month}/{year} للمالية ({len(rows)} موظف)", details={"rows": len(rows), "note": note})
    db.commit()
    return status(db, year, month)


# ---------------------------------------------------------------------- hooks for the existing approve / unapprove

def before_approve(db: Session, actor: dict[str, Any], year: int, month: int) -> None:
    """PY3: finance approves a prepared month only (the design's PAYROLL_NOT_PREPARED); admin / chairman directly."""
    if actor.get("role") != "finance":
        return
    current = canonical._row(db, "SELECT status FROM public.ariba_payroll_status WHERE pay_year=:y AND pay_month=:m", y=year, m=month)
    if (current or {}).get("status") != "prepared":
        raise ApiError(409, "payroll_not_prepared", "المسير لم يُجهَّز للاعتماد بعد — تجهّزه الموارد البشرية أولًا")


def after_approve(db: Session, actor: dict[str, Any], year: int, month: int) -> None:
    db.execute(text("""INSERT INTO public.ariba_payroll_status (pay_year, pay_month, status, approved_by, approved_by_name,
            approved_at, updated_at)
        VALUES (:y, :m, 'approved', :by, :name, now(), now())
        ON CONFLICT (pay_year, pay_month) DO UPDATE SET status='approved', approved_by=EXCLUDED.approved_by,
            approved_by_name=EXCLUDED.approved_by_name, approved_at=now(), updated_at=now()"""),
        {"y": year, "m": month, "by": actor.get("employee_id"), "name": _name(db, actor)})


def check_reason(body: dict[str, Any] | None) -> None:
    """PY4: a reason that is sent must say something; an old caller that sends none keeps today's default."""
    reason = (body or {}).get("reason")
    if reason is not None and len(str(reason).strip()) < MIN_REASON:
        raise ApiError(422, "reason_required", "اكتب سبب فتح المسير (5 أحرف على الأقل)")


def after_reopen(db: Session, actor: dict[str, Any], year: int, month: int, reason: str) -> None:
    who = _name(db, actor)
    db.execute(text("""INSERT INTO public.ariba_payroll_status (pay_year, pay_month, status, reopened_by, reopened_by_name,
            reopened_at, reopen_reason, updated_at)
        VALUES (:y, :m, 'reopened', :by, :name, now(), :r, now())
        ON CONFLICT (pay_year, pay_month) DO UPDATE SET status='reopened', reopened_by=EXCLUDED.reopened_by,
            reopened_by_name=EXCLUDED.reopened_by_name, reopened_at=now(), reopen_reason=EXCLUDED.reopen_reason, updated_at=now()"""),
        {"y": year, "m": month, "by": actor.get("employee_id"), "name": who, "r": reason})
    for person in canonical._stage_people(db, "hr"):
        canonical._insert_notification(db, person, None, f"اتفتح مسير {month}/{year} بعد الاعتماد",
                                       f"فتحه {who} — السبب: {reason}", "hr", "payroll")
