"""The employee's own leave actions (Stage 14): cancel a pending leave, change its dates, ask to cancel an
approved one — each behind its switch in `leave_policy` (Settings ▸ إلغاء وتعديل واسترجاع الإجازات).

    POST  /me/requests/{request_id}/cancel           emp_cancel_pending           a pending leave ends «ملغاة»
    PATCH /me/requests/{request_id}/dates            emp_edit_pending             new dates, days and balance re-checked
    POST  /me/requests/{request_id}/cancel-request   emp_request_cancel_approved  a `leave_cancel` request is sent

The design's SQL is the specification (`ariba_leave_emp_cancel`, `ariba_leave_emp_edit`,
`ariba_leave_cancel_request`, sql/26_leave_cancel.sql), and `allow_advance_balance` (sql/31) decides how many days
an annual leave may take (`available_days`, also used by POST /me/requests). An approved `leave_cancel` request
cancels the leave it names (`apply_leave_cancel`, called by the workflow when it completes). Someone else's request
is 404, so its existence is never confirmed.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, date, datetime
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.core.scheduling import today_riyadh
from app.database import get_db
from app.routers import canonical, leave_actions
from app.services import canonical_data as cdata
from app.services import escalation

router = APIRouter(tags=["me-leave"])

CANCEL_TYPE = "leave_cancel"


def _switch(db: Session, key: str) -> None:
    if not leave_actions.leave_policy(db)[key]:
        raise ApiError(403, "feature_disabled", "هذا الإجراء موقوف من إعدادات الموارد البشرية")


def _mine(db: Session, actor: dict[str, Any], request_id: uuid.UUID) -> dict[str, Any]:
    row = canonical._row(db, """SELECT * FROM public.workflow_requests WHERE id=:id AND employee_id=:e FOR UPDATE""",
                         id=request_id, e=actor.get("employee_id"))
    if not row:
        raise ApiError(404, "not_found", "الطلب غير موجود")
    if not leave_actions.is_leave(db, request_id):
        raise ApiError(409, "not_a_leave", "هذا الطلب ليس إجازة")
    return row


def _name(db: Session, employee_id: str) -> str:
    row = canonical._row(db, "SELECT coalesce(name_ar, employee_id) AS n FROM public.employee_directory WHERE employee_id=:e",
                         e=employee_id)
    return (row or {}).get("n") or employee_id


def _ring_holder(db: Session, row: dict[str, Any], title: str, body: str) -> None:
    """The person the request waits for: the direct manager at `manager`, HR's stage people otherwise."""
    if row["current_stage"] == "manager":
        mgr = canonical._row(db, "SELECT manager_id FROM public.employee_directory WHERE employee_id=:e", e=row["employee_id"])
        people = [(mgr or {}).get("manager_id")]
    else:
        people = canonical._stage_people(db, "hr")
    for person in people:
        if person and person != row["employee_id"]:
            canonical._insert_notification(db, person, row["id"], title, body, row["current_stage"], "request")


def available_days(db: Session, employee_id: str, today: date) -> float:
    """Annual days the employee may take now: the balance to date, plus the rest of this year's entitlement when
    `allow_advance_balance` is on (the design's sql/31: the year's entitlement in any month)."""
    emps = cdata.employees(db, employee_id=employee_id)
    if not emps:
        return 0.0
    book = cdata.leave_book(db, today, emps)
    available = book.current(emps[0])
    if leave_actions.leave_policy(db)["allow_advance_balance"]:
        year_end = date(today.year, 12, 31)
        available += max(0.0, book.accrued(emps[0], today.year, year_end) - book.accrued(emps[0], today.year, today))
    return available


def leave_days(db: Session, employee_id: str, leave_type: str, start: date, end: date, today: date) -> int:
    """The same count POST /me/requests uses: working days for annual leave, calendar days otherwise."""
    if leave_type != "annual":
        return (end - start).days + 1
    emps = cdata.employees(db, employee_id=employee_id)
    return cdata.leave_book(db, today, emps).count_workdays(start, end)


#: the switches the employee's screens follow (the HR one stays in Settings)
EMPLOYEE_SWITCHES = ("emp_cancel_pending", "emp_edit_pending", "emp_request_cancel_approved", "allow_advance_balance")


@router.get("/me/leave-policy")
def my_leave_policy(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """Which of the three buttons the employee's request list shows (the API checks each action itself)."""
    policy = leave_actions.leave_policy(db)
    return {key: policy[key] for key in EMPLOYEE_SWITCHES}


# ------------------------------------------------------------------------------------------ cancel pending

@router.post("/me/requests/{request_id}/cancel")
def cancel_my_leave(request_id: uuid.UUID, body: dict[str, Any], request: Request,
                    actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    _switch(db, "emp_cancel_pending")
    row = _mine(db, actor, request_id)
    if row["status"] != "pending":
        raise ApiError(409, "request_not_pending", "يمكن إلغاء الطلب قبل الموافقة عليه فقط")
    reason = str((body or {}).get("reason") or "").strip()[:500] or "ألغاه الموظف"
    label, _ = leave_actions.do_cancel(db, row, actor.get("employee_id"), actor.get("account_id"), reason, "employee")
    name = _name(db, row["employee_id"])
    _ring_holder(db, row, f"ألغى {name} طلبه", f"ألغى الموظف طلبه ({label}) قبل البتّ فيه")
    canonical._write_audit(db, actor, request, "leaves", "employee_cancel", "workflow_request", request_id,
                           summary=f"إلغاء الموظف {label} قبل الموافقة", details={"reason": reason})
    db.commit()
    return {"id": str(request_id), "status": "rejected", "cancelled": True}


# ------------------------------------------------------------------------------------------ edit dates

@router.patch("/me/requests/{request_id}/dates")
def edit_my_leave(request_id: uuid.UUID, body: dict[str, Any], request: Request,
                  actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    _switch(db, "emp_edit_pending")
    row = _mine(db, actor, request_id)
    if row["status"] != "pending":
        raise ApiError(409, "request_not_pending", "يمكن تعديل الطلب قبل الموافقة عليه فقط")
    start = cdata._d(str((body or {}).get("from") or ""))
    end = cdata._d(str((body or {}).get("to") or ""))
    if not start or not end or end < start:
        raise ApiError(422, "validation_error", "التواريخ غير صحيحة")
    today = today_riyadh()
    leave_type = row["request_type"]
    days = max(1, leave_days(db, row["employee_id"], leave_type, start, end, today))
    if leave_type == "annual" and days > available_days(db, row["employee_id"], today):
        raise ApiError(422, "exceeds_balance", "يتجاوز الرصيد المتاح")
    payload = dict(row.get("payload") or {})
    notes = (body or {}).get("notes")
    payload["edited"] = list(payload.get("edited") or []) + [
        {"at": datetime.now(UTC).isoformat(), "old_from": payload.get("from"), "old_to": payload.get("to"),
         "old_days": payload.get("days")}]
    payload.update({"from": start.isoformat(), "to": end.isoformat(), "days": days})
    if notes is not None:
        payload["notes"] = str(notes).strip()[:1000]
    db.execute(text("UPDATE public.workflow_requests SET payload=CAST(:p AS jsonb), updated_at=now() WHERE id=:id"),
               {"p": json.dumps(payload, ensure_ascii=False, default=str), "id": request_id})
    db.execute(text("""UPDATE public.leave_requests SET from_date=:f, to_date=:t, days=:d, updated_at=now()
        WHERE workflow_request_id=:id"""), {"f": start, "t": end, "d": days, "id": request_id})
    label, name = escalation.request_label(db, leave_type), _name(db, row["employee_id"])
    _ring_holder(db, row, f"عدّل {name} طلبه", f"{label} — التواريخ الجديدة من {start.isoformat()} إلى {end.isoformat()}")
    canonical._write_audit(db, actor, request, "leaves", "employee_edit", "workflow_request", request_id,
                           summary=f"تعديل الموظف تواريخ {label}", details=payload["edited"][-1])
    db.commit()
    return {"id": str(request_id), "from": start.isoformat(), "to": end.isoformat(), "days": days}


# ------------------------------------------------------------------------------------------ cancel request

@router.post("/me/requests/{request_id}/cancel-request", status_code=201)
def request_cancel(request_id: uuid.UUID, body: dict[str, Any], request: Request,
                   actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    _switch(db, "emp_request_cancel_approved")
    if not db.scalar(text("SELECT 1 FROM public.workflow_request_types WHERE code=:c"), {"c": CANCEL_TYPE}):
        raise ApiError(503, "migration_required", "نوع «طلب إلغاء إجازة» غير موجود — شغّل docs/db-migrations/006_leave_cancel_type.sql")
    row = _mine(db, actor, request_id)
    if row["status"] != "approved":
        raise ApiError(409, "only_approved_leave", "طلب الإلغاء لإجازة معتمدة فقط")
    if db.scalar(text("""SELECT 1 FROM public.workflow_requests WHERE employee_id=:e AND request_type=:t
            AND status='pending' AND payload->>'target'=:r"""), {"e": row["employee_id"], "t": CANCEL_TYPE, "r": str(request_id)}):
        raise ApiError(409, "cancel_pending", "يوجد طلب إلغاء معلّق لهذه الإجازة")
    reason = str((body or {}).get("reason") or "").strip()[:500]
    person = canonical._row(db, "SELECT manager_id FROM public.employee_directory WHERE employee_id=:e AND active",
                            e=row["employee_id"]) or {}
    manager = person.get("manager_id") if person.get("manager_id") != row["employee_id"] else None
    stage = "manager" if manager else "hr"
    old = dict(row.get("payload") or {})
    payload = {"target": str(request_id), "leave_type": row["request_type"], "from": old.get("from"), "to": old.get("to"),
               "days": old.get("days"), "notes": reason, "submitted_from": "employee_app",
               "submitted_at": datetime.now(UTC).isoformat()}
    new_id = db.scalar(text("""INSERT INTO public.workflow_requests(employee_id, request_type, payload, current_stage)
        VALUES (:e, :t, CAST(:p AS jsonb), :s) RETURNING id"""),
        {"e": row["employee_id"], "t": CANCEL_TYPE, "p": json.dumps(payload, ensure_ascii=False), "s": stage})
    db.execute(text("""INSERT INTO public.workflow_actions(request_id, actor_account_id, stage, action, comment)
        VALUES (:r, :a, 'employee', 'submitted', :c)"""), {"r": new_id, "a": actor.get("account_id"), "c": reason or None})
    name, label = _name(db, row["employee_id"]), escalation.request_label(db, row["request_type"])
    if manager:
        canonical._insert_notification(db, manager, new_id, "طلب إلغاء إجازة",
                                       f"{name} يطلب إلغاء {label} المعتمدة — بانتظار موافقتك", "manager", "request")
    for person_id in canonical._stage_people(db, "hr"):
        canonical._insert_notification(db, person_id, new_id, f"طلب إلغاء إجازة من {name}",
                                       f"{label} من {old.get('from', '')} إلى {old.get('to', '')}"
                                       + (f" — السبب: {reason}" if reason else ""), "hr", "request")
    canonical._insert_notification(db, row["employee_id"], new_id, "تم استلام طلب إلغاء الإجازة",
                                   "طلب إلغاء إجازتك المعتمدة قيد الاعتماد", "employee", "workflow")
    canonical._write_audit(db, actor, request, "leaves", "employee_cancel_request", "workflow_request", new_id,
                           summary=f"طلب إلغاء {label} المعتمدة", details={"target": str(request_id), "reason": reason})
    db.commit()
    return {"id": str(new_id), "target": str(request_id), "current_stage": stage}


def apply_leave_cancel(db: Session, item: dict[str, Any], account_id: Any) -> None:
    """Called when a `leave_cancel` request is finally approved: cancel the leave it names (no commit)."""
    target = (item.get("payload") or {}).get("target")
    if not target:
        return
    row = canonical._row(db, "SELECT * FROM public.workflow_requests WHERE id=CAST(:r AS uuid) FOR UPDATE", r=target)
    if not row or row["status"] == "rejected" or row["employee_id"] != item["employee_id"]:
        return
    reason = str((item.get("payload") or {}).get("notes") or "").strip() or "طلب إلغاء معتمد"
    leave_actions.do_cancel(db, row, item["employee_id"], account_id, reason, "request")
