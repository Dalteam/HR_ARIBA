"""The audit log (سجل التعديلات) and its two-person purge.

    GET  /audit-log                     the screen's table and its five filters
    GET  /audit-log/modules             every module seen in the log, with its row count
    GET  /audit-log/purge               the purge box: eligible months and the last 30 requests
    POST /audit-log/purge               ask Finance to approve deleting one month
    POST /audit-log/purge/{id}/decide   Finance approves or rejects — nothing is deleted here

The rows already exist: `ariba_audit_log` is written by every one of our own writes (`canonical._write_audit`),
so this module only reads them. `audit_list` in the design's own SQL is the specification, and three of its
rules are load-bearing here:

* **Finance may only see four modules** (`payroll`, `insurance`, `settlement`, `eos`). The filter is applied in
  the query, not in the screen, so a hand-made request cannot read a salary change as `finance`.
* **`limit` is clamped to 1…1000 with 300 by default**, and the answer carries `total` so the screen can say
  «معروض آخر 300».
* **A purge is two people**: any audit viewer may *request* a month that ended more than 30 days ago, only
  `finance` may *decide*, and approving only records the decision — the design's own note is «المسح الفعلي
  بتنفذه المالية يدويًا», and this port keeps that.

Every request and every decision is audited (`ariba_audit_log`, module `audit`), and a request rings the bell
of each active `finance` account (`workflow_notifications`), never the requester's own.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.core.scheduling import RIYADH
from app.database import get_db
from app.routers import canonical

router = APIRouter(tags=["audit"])

#: Who reads the log: `audit: view` in the permission matrix (Stage 11; hr / finance edit, ceo and
#: admin_manager view, admin and chairman always). Kept as the client's starting list for reference.
AUDIT_ROLES = ("hr", "admin", "admin_manager", "ceo", "finance", "chairman")

#: The only modules `finance` may read (the design's `fin_mods`). A salary change in `employees`, a hire or
#: a permission change is not finance's to read.
FINANCE_MODULES = ("payroll", "insurance", "settlement", "eos")

#: `audit_list` clamps to 1…1000 with 300 by default; the screen prints «معروض آخر N».
DEFAULT_LIMIT, MAX_LIMIT = 300, 1000

#: The purge needs a month that ended more than 30 days ago (`ariba_audit_month_eligible`).
ELIGIBLE_AFTER_DAYS = 30

_MONTH = re.compile(r"^[0-9]{4}-(0[1-9]|1[0-2])$")


def _viewer(actor: dict[str, Any]) -> None:
    canonical._perm(actor, "audit")


def _modules_query(db: Session, limit: int) -> list[dict[str, Any]]:
    return canonical._rows(db, """SELECT l.module, count(*)::int AS count, max(l.at) AS last_at
        FROM public.ariba_audit_log l GROUP BY l.module ORDER BY count(*) DESC, l.module LIMIT :limit""",
        limit=limit)


def _allowed_modules(actor: dict[str, Any]) -> list[str]:
    """The modules `finance` may read; every other role is not restricted here (the route decides)."""
    return list(FINANCE_MODULES) if actor.get("role") == "finance" else []


def _module_filter(modules: list[str] | None, module: str | None) -> list[str] | None:
    """`modules` (repeated) wins over `module`; empty means «every module». Names are trimmed, never guessed."""
    wanted = [m.strip() for m in (modules or []) if m and m.strip()]
    if not wanted and module and module.strip():
        wanted = [module.strip()]
    return wanted or None


def _month_eligible(month: str, now: datetime | None = None) -> bool:
    """`(first day of the month + 1 month) <= now - 30 days` — `ariba_audit_month_eligible`, in Python.

    The installed function is one of the three that need no session, so this is a port of its body and not a
    second definition of the rule: the first day of the *next* month must already be 30 days behind us. With
    today 03/11/2026, `2026-09` is eligible and `2026-10` is not.
    """
    if not _MONTH.match(month or ""):
        return False
    year, mon = int(month[:4]), int(month[5:])
    next_first = datetime(year + (mon // 12), (mon % 12) + 1, 1, tzinfo=RIYADH)
    return next_first <= (now or datetime.now(UTC)) - timedelta(days=ELIGIBLE_AFTER_DAYS)


def _timestamp(value: str | None, field: str) -> str | None:
    """Validate an ISO date or date-time from the screen; the SQL casts it to `timestamptz`."""
    if value is None or not str(value).strip():
        return None
    raw = str(value).strip()
    try:
        datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ApiError(422, "invalid_date", f"{field} must be an ISO date or date-time") from exc
    return raw


@router.get("/audit-log")
def audit_list(
    modules: list[str] | None = Query(None, description="Repeated: payroll, employees, …"),
    module: str | None = Query(None, description="One module; `modules` wins when both are sent"),
    actor_username: str | None = Query(None, max_length=60),
    q: str | None = Query(None, max_length=100),
    date_from: str | None = Query(None, description="ISO date or date-time, inclusive"),
    date_to: str | None = Query(None, description="ISO date or date-time, exclusive"),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    offset: int = Query(0, ge=0),
    actor: dict[str, Any] = Depends(canonical.current_actor),
    db: Session = Depends(get_db),
):
    """One page of the log, newest first, with the total behind it."""
    _viewer(actor)
    wanted = _module_filter(modules, module)
    if actor.get("role") == "finance":
        allowed = [m for m in (wanted or list(FINANCE_MODULES)) if m in FINANCE_MODULES]
        if not allowed:
            return {"items": [], "total": 0, "limit": limit, "offset": offset}
        wanted = allowed

    where, params = ["1=1"], {"limit": limit, "offset": offset}
    if wanted:
        where.append("l.module = ANY(CAST(:modules AS text[]))")
        params["modules"] = wanted
    if actor_username and actor_username.strip():
        where.append("l.actor_username = :actor")
        params["actor"] = actor_username.strip()
    start = _timestamp(date_from, "date_from")
    end = _timestamp(date_to, "date_to")
    if start:
        where.append("l.at >= CAST(:date_from AS timestamptz)")
        params["date_from"] = start
    if end:
        where.append("l.at < CAST(:date_to AS timestamptz)")
        params["date_to"] = end
    if q and q.strip():
        where.append("(l.summary ILIKE :q OR l.entity_name ILIKE :q OR l.action ILIKE :q OR l.actor_name ILIKE :q)")
        params["q"] = f"%{q.strip()}%"
    clause = " AND ".join(where)

    total = int(db.scalar(text(f"SELECT count(*) FROM public.ariba_audit_log l WHERE {clause}"), params) or 0)
    rows = canonical._rows(db, f"""SELECT l.id, l.at, l.actor_username,
            coalesce(nullif(l.actor_name,''), l.actor_username) AS actor_name, l.actor_role, l.module,
            l.action, l.entity_type, l.entity_id, l.entity_name, l.summary, l.details
        FROM public.ariba_audit_log l WHERE {clause}
        ORDER BY l.at DESC, l.id DESC LIMIT :limit OFFSET :offset""", **params)
    return {"items": rows, "total": total, "limit": limit, "offset": offset}


@router.get("/audit-log/modules")
def audit_modules(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """The module filter: every module in the log with its row count (finance sees its four only)."""
    _viewer(actor)
    rows = _modules_query(db, 100)
    if actor.get("role") == "finance":
        rows = [r for r in rows if r["module"] in FINANCE_MODULES]
    return {"items": rows, "modules": [r["module"] for r in rows]}


@router.get("/audit-log/purge")
def audit_purge_info(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """The purge box: the months old enough to ask about, and the last 30 requests."""
    _viewer(actor)
    months = canonical._rows(db, """SELECT to_char(at AT TIME ZONE 'Asia/Riyadh','YYYY-MM') AS month,
            count(*)::int AS count FROM public.ariba_audit_log GROUP BY 1 ORDER BY 1""")
    requests = canonical._rows(db, """SELECT id, month, requester_name, requester_role, status, created_at,
            decided_name, decided_at FROM public.ariba_audit_purge_requests ORDER BY created_at DESC LIMIT 30""")
    return {"is_finance": actor.get("role") == "finance",
            "months": [m for m in months if _month_eligible(m["month"])],
            "requests": requests}



@router.post("/audit-log/purge", status_code=201)
def audit_purge_request(body: dict[str, Any], request: Request,
                        actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """Ask Finance to delete one old month; every active `finance` account gets a bell entry."""
    _viewer(actor)
    month = str(body.get("month") or "").strip()
    if not _MONTH.match(month):
        raise ApiError(422, "invalid_month", "الشهر غير صحيح")
    if not _month_eligible(month):
        raise ApiError(422, "month_too_recent", "الشهر حديث — الحذف مسموح للشهور الأقدم من 30 يوم فقط")
    if canonical._row(db, "SELECT 1 AS x FROM public.ariba_audit_purge_requests WHERE month=:m AND status='pending'", m=month):
        raise ApiError(409, "purge_pending", "هناك طلب حذف معلق لنفس الشهر")
    name = canonical._row(db, "SELECT name_ar FROM public.employee_directory WHERE employee_id=:e",
                          e=actor.get("employee_id"))
    requester_name = (name or {}).get("name_ar") or actor.get("name_ar") or actor.get("username")
    row = canonical._row(db, """INSERT INTO public.ariba_audit_purge_requests
        (month, requested_by, requester_name, requester_role) VALUES (:month, :by, :name, :role) RETURNING id""",
        month=month, by=actor["account_id"], name=requester_name, role=actor.get("role"))
    notified = 0
    for finance in canonical._rows(db, """SELECT DISTINCT employee_id FROM public.ariba_auth_accounts
            WHERE active AND role='finance' AND employee_id IS NOT NULL"""):
        canonical._insert_notification(db, finance["employee_id"], None, "طلب موافقة على حذف سجل التعديلات",
                                       f"طلب {requester_name or 'مستخدم'} حذف سجل التعديلات لشهر {month}. "
                                       "افتح سجل التعديلات للموافقة أو الرفض.", "finance", "request")
        notified += 1
    canonical._write_audit(db, actor, request, "audit", "purge_request", "ariba_audit_purge_requests", row["id"],
                           summary=f"طلب حذف سجل التعديلات لشهر {month}",
                           details={"month": month, "notified": notified})
    db.commit()
    return {"id": row["id"], "month": month, "status": "pending", "notified": notified}


@router.post("/audit-log/purge/{request_id}/decide")
def audit_purge_decide(request_id: str, body: dict[str, Any], request: Request,
                       actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """Finance approves or rejects — the decision is recorded, nothing is deleted."""
    canonical._require(actor, "finance")
    row = canonical._row(db, "SELECT * FROM public.ariba_audit_purge_requests WHERE id=CAST(:id AS uuid) FOR UPDATE",
                         id=request_id)
    if not row:
        raise ApiError(404, "not_found", "الطلب غير موجود")
    if row["status"] != "pending":
        raise ApiError(409, "purge_decided", "تم اتخاذ قرار في هذا الطلب بالفعل")
    approve = body.get("approve")
    if not isinstance(approve, bool):
        raise ApiError(422, "validation_error", "approve must be true or false")
    name = canonical._row(db, "SELECT name_ar FROM public.employee_directory WHERE employee_id=:e",
                          e=actor.get("employee_id"))
    decided_name = (name or {}).get("name_ar") or actor.get("name_ar") or actor.get("username")
    canonical._row(db, """UPDATE public.ariba_audit_purge_requests
        SET status=:status, decided_by=:by, decided_name=:name, decided_at=now()
        WHERE id=CAST(:id AS uuid) RETURNING id""",
        status="approved" if approve else "rejected", by=actor["account_id"], name=decided_name, id=request_id)
    canonical._write_audit(db, actor, request, "audit", "purge_decide", "ariba_audit_purge_requests", request_id,
                           summary=("موافقة على حذف سجل التعديلات لشهر " if approve else "رفض حذف سجل التعديلات لشهر ") + str(row["month"]),
                           details={"month": row["month"], "approved": approve})
    db.commit()
    return {"id": request_id, "month": row["month"], "status": "approved" if approve else "rejected",
            "approved": approve, "note": "الموافقة مسجلة، والمسح الفعلي تنفذه المالية يدويًا"}

