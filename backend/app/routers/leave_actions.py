"""More HR leave actions (Stage 12): return to the manager, cancel a leave, undo a balance save, the workflow
and leave-policy settings, and escalation.

    POST /requests/{request_id}/return-to-manager   {note}     L1 — requests: edit
    POST /requests/{request_id}/cancel              {reason}   L2 — leaves: edit, leave_policy.hr_cancel_approved
    GET  /leave/employees/{employee_id}/history                L3 — the kept balance saves (newest last)
    POST /leave/employees/{employee_id}/undo                   L3 — put the last save back
    GET  /settings/workflow   PUT /settings/workflow           L4 — waiting days, advance ceiling, final approver
    GET  /settings/leave-policy   PUT /settings/leave-policy   L2 — the design's five leave-policy switches
    POST /requests/escalate                                    L5 — HR's «تشغيل الآن» (the daily pass runs by itself)

The design's SQL is the specification (`ariba_hr_return_to_manager`, `ariba_hr_leave_cancel` /
`ariba_leave_do_cancel`, `ariba_hr_get/set_wf_config`, `ariba_leave_policy`, `ariba_hr_run_escalation`); the rules
are BUSINESS_RULES § More HR leave actions (L1–L5). Every action writes one audit row.
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.database import get_db
from app.routers import canonical
from app.services import escalation

router = APIRouter(tags=["leave-actions"])

POLICY_KEY = "leave_policy"
#: The design's LEAVE_POLICY_DEF plus its `allow_advance_balance` row, which defaults to off.
POLICY_DEFAULTS = {"emp_cancel_pending": True, "emp_edit_pending": True, "emp_request_cancel_approved": True,
                   "hr_cancel_approved": True, "allow_advance_balance": False}
FINAL_STAGES = ("hr", "ceo")
MAX_EMAILS = 20
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _invalid(message: str) -> ApiError:
    return ApiError(422, "validation_error", message)


def _request(db: Session, request_id: uuid.UUID, lock: bool = True) -> dict[str, Any]:
    row = canonical._row(db, "SELECT * FROM public.workflow_requests WHERE id=:id" + (" FOR UPDATE" if lock else ""),
                         id=request_id)
    if not row:
        raise ApiError(404, "not_found", "الطلب غير موجود")
    return row


def _note(body: Any, key: str) -> str:
    value = str((body or {}).get(key) or "").strip() if isinstance(body, dict) else ""
    if len(value) > 1000:
        raise _invalid("النص أطول من المسموح")
    return value


def leave_policy(db: Session) -> dict[str, bool]:
    stored = canonical._app_setting(db, POLICY_KEY)
    stored = stored if isinstance(stored, dict) else {}
    return {key: bool(stored.get(key, default)) for key, default in POLICY_DEFAULTS.items()}


def _mark_read(db: Session, request_id: Any, where: str, **params: Any) -> None:
    db.execute(text(f"UPDATE public.workflow_notifications SET read_at=now() WHERE request_id=:r AND read_at IS NULL AND {where}"),
               {"r": request_id, **params})


# --------------------------------------------------------------------------------------------- L1 return

@router.post("/requests/{request_id}/return-to-manager")
def return_to_manager(request_id: uuid.UUID, body: dict[str, Any], request: Request,
                      actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    canonical._perm(actor, "requests", "edit")
    note = _note(body, "note")
    if not note:
        raise ApiError(422, "reason_required", "اكتب سبب الإرجاع للمدير المباشر")
    row = _request(db, request_id)
    if row["status"] != "pending":
        raise ApiError(409, "request_not_pending", "الطلب ليس قيد الانتظار")
    person = canonical._row(db, "SELECT name_ar, manager_id FROM public.employee_directory WHERE employee_id=:e",
                            e=row["employee_id"]) or {}
    manager = person.get("manager_id")
    if not manager or manager == row["employee_id"]:
        raise ApiError(409, "no_manager", "الموظف ليس له مدير مباشر")
    payload = dict(row.get("payload") or {})
    payload["returned"] = list(payload.get("returned") or []) + [
        {"at": datetime.now(UTC).isoformat(), "by": actor.get("employee_id"), "note": note}]
    db.execute(text("""UPDATE public.workflow_requests SET current_stage='manager', returned_at=now(), return_note=:n,
        payload=CAST(:p AS jsonb), updated_at=now() WHERE id=:id"""),
        {"n": note, "p": json.dumps(payload, ensure_ascii=False, default=str), "id": request_id})
    db.execute(text("""INSERT INTO public.workflow_actions(request_id, actor_account_id, stage, action, comment)
        VALUES (:r, :a, 'hr', 'returned', :c)"""), {"r": request_id, "a": actor.get("account_id"), "c": note})
    _mark_read(db, request_id, "stage='hr'")
    label, name = escalation.request_label(db, row["request_type"]), person.get("name_ar") or row["employee_id"]
    canonical._insert_notification(db, manager, request_id, f"مطلوب ردّك على طلب {name}",
                                   f"يرجى الاهتمام بالرد والإفادة (موافقة أو رفض) على {label} للموظف {name}. "
                                   f"ملاحظة الموارد البشرية: {note}", "manager", "request")
    canonical._insert_notification(db, row["employee_id"], request_id, "أُعيد طلبك لمديرك المباشر",
                                   f"طلبك ({label}) أعادته الموارد البشرية لمديرك المباشر للإفادة قبل القرار",
                                   "employee", "workflow")
    canonical._write_audit(db, actor, request, "requests", "hr_return", "workflow_request", request_id,
                           summary=f"إرجاع طلب {label} للمدير المباشر", details={"note": note})
    db.commit()
    return {"id": str(request_id), "status": "pending", "current_stage": "manager"}


# --------------------------------------------------------------------------------------------- L2 cancel

@router.post("/requests/{request_id}/cancel")
def cancel_leave(request_id: uuid.UUID, body: dict[str, Any], request: Request,
                 actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    canonical._perm(actor, "leaves", "edit")
    if not leave_policy(db)["hr_cancel_approved"]:
        raise ApiError(403, "feature_disabled", "إلغاء الإجازات المعتمدة موقوف من الإعدادات")
    reason = _note(body, "reason") or "إلغاء من الموارد البشرية"
    row = _request(db, request_id)
    if not db.scalar(text("SELECT 1 FROM public.leave_requests WHERE workflow_request_id=:r LIMIT 1"), {"r": request_id}):
        raise ApiError(409, "not_a_leave", "هذا الطلب ليس إجازة")
    if row["status"] == "rejected":
        raise ApiError(409, "already_closed", "الطلب مرفوض أو ملغى بالفعل")
    payload = dict(row.get("payload") or {})
    payload["cancelled"] = {"by": actor.get("employee_id"), "at": datetime.now(UTC).isoformat(), "kind": "hr",
                            "reason": reason, "was": row["status"]}
    db.execute(text("""UPDATE public.workflow_requests SET current_stage='rejected', payload=CAST(:p AS jsonb),
        updated_at=now() WHERE id=:id"""), {"p": json.dumps(payload, ensure_ascii=False, default=str), "id": request_id})
    db.execute(text("""INSERT INTO public.workflow_actions(request_id, actor_account_id, stage, action, comment)
        VALUES (:r, :a, 'hr', 'rejected', :c)"""), {"r": request_id, "a": actor.get("account_id"), "c": reason})
    _mark_read(db, request_id, "stage IS DISTINCT FROM 'employee'")
    label = escalation.request_label(db, row["request_type"])
    span = f"من {(row.get('payload') or {}).get('from', '')} إلى {(row.get('payload') or {}).get('to', '')}"
    back = " وإعادة أيامها إلى رصيدك" if row["status"] == "approved" else ""
    canonical._insert_notification(db, row["employee_id"], request_id, "تم إلغاء الإجازة",
                                   f"تم إلغاء {label} {span}{back}. السبب: {reason}", "employee", "decision")
    canonical._write_audit(db, actor, request, "leaves", "إلغاء إجازة وإرجاع الرصيد", "employee", row["employee_id"],
                           summary=f"إلغاء {label} {span}", details={"request": str(request_id), "was": row["status"],
                                                                     "reason": reason})
    db.commit()
    return {"id": str(request_id), "status": "rejected", "cancelled": True, "was": row["status"]}


# ----------------------------------------------------------------------------------------- L3 balance undo

def _employee_data(db: Session, employee_id: str) -> dict[str, Any]:
    row = canonical._row(db, "SELECT data FROM public.employee_directory WHERE employee_id=:e FOR UPDATE", e=employee_id)
    if not row:
        raise ApiError(404, "not_found", "Employee not found")
    return dict(row.get("data") or {})


@router.get("/leave/employees/{employee_id}/history")
def balance_history(employee_id: str, actor: dict[str, Any] = Depends(canonical.current_actor),
                    db: Session = Depends(get_db)):
    canonical._perm(actor, "leaves")
    row = canonical._row(db, "SELECT data FROM public.employee_directory WHERE employee_id=:e", e=employee_id)
    if not row:
        raise ApiError(404, "not_found", "Employee not found")
    history = (row.get("data") or {}).get(canonical.BALANCE_HISTORY_KEY) or []
    return {"items": [{"at": h.get("at"), "by": h.get("by"), "years": sorted((h.get("overrides") or {}).keys())}
                      for h in history], "can_undo": bool(history)}


@router.post("/leave/employees/{employee_id}/undo")
def undo_balance(employee_id: str, request: Request, actor: dict[str, Any] = Depends(canonical.current_actor),
                 db: Session = Depends(get_db)):
    canonical._perm(actor, "leaves", "edit")
    data = _employee_data(db, employee_id)
    history = list(data.get(canonical.BALANCE_HISTORY_KEY) or [])
    if not history:
        raise ApiError(409, "nothing_to_undo", "لا يوجد حفظ سابق للتراجع عنه")
    last = history.pop()
    data["leaveYearOverrides"] = last.get("overrides") or {}
    data[canonical.BALANCE_HISTORY_KEY] = history
    db.execute(text("UPDATE public.employee_directory SET data=CAST(:d AS jsonb), updated_at=now() WHERE employee_id=:e"),
               {"d": json.dumps(data, ensure_ascii=False), "e": employee_id})
    canonical._write_audit(db, actor, request, "leave", "balance_undo", "employee", employee_id,
                           summary="التراجع عن آخر حفظ لأرصدة الإجازات", details={"restored_from": last.get("at")})
    db.commit()
    return canonical._balance_detail(db, employee_id)


# ---------------------------------------------------------------------------------------- L4 workflow

def workflow_change(db: Session, body: Any, current: dict[str, Any]) -> dict[str, Any]:
    """The design's ariba_hr_set_wf_config bounds; unknown keys in the stored value are kept."""
    if not isinstance(body, dict):
        raise _invalid("The body must be an object")
    out = dict(current)
    for key in ("manager_wait_days", "ceo_wait_days"):
        if key in body:
            try:
                days = int(body[key])
            except (TypeError, ValueError) as exc:
                raise _invalid(f"{key} يجب أن يكون عددًا صحيحًا") from exc
            if not 0 <= days <= 60:
                raise _invalid("مدة الانتظار بين 0 و60 يومًا (0 = بدون تصعيد)")
            out[key] = days
    if "advance_max_percent" in body:
        try:
            pct = float(body["advance_max_percent"])
        except (TypeError, ValueError) as exc:
            raise _invalid("advance_max_percent يجب أن يكون رقمًا") from exc
        if not 1 <= pct <= 1000:
            raise _invalid("سقف السلفة بين 1% و1000% من الراتب")
        out["advance_max_percent"] = int(pct) if pct.is_integer() else pct
    if "final_by_type" in body:
        final = body["final_by_type"]
        if not isinstance(final, dict):
            raise _invalid("final_by_type must be an object")
        codes = {r["code"] for r in canonical._rows(db, "SELECT code FROM public.workflow_request_types")}
        for code, stage in final.items():
            if code not in codes:
                raise _invalid(f"نوع طلب غير معروف: {code}")
            if stage not in FINAL_STAGES:
                raise _invalid("الاعتماد الأخير يكون للموارد البشرية (hr) أو الرئيس التنفيذي (ceo)")
        out["final_by_type"] = dict(final)
    if "extra_hr_emails" in body:
        emails = body["extra_hr_emails"]
        if not isinstance(emails, list) or len(emails) > MAX_EMAILS:
            raise _invalid(f"قائمة البريد بحد أقصى {MAX_EMAILS} عنوانًا")
        cleaned = [str(e).strip() for e in emails if str(e).strip()]
        if any(not _EMAIL.match(e) for e in cleaned):
            raise _invalid("عنوان بريد غير صحيح")
        out["extra_hr_emails"] = cleaned
    return out


def _workflow_out(config: dict[str, Any]) -> dict[str, Any]:
    return {"manager_wait_days": int(config.get("manager_wait_days") or 0),
            "ceo_wait_days": int(config.get("ceo_wait_days") or 0),
            "advance_max_percent": config.get("advance_max_percent") or 100,
            "final_by_type": config.get("final_by_type") or dict(canonical.DEFAULT_FINAL_BY_TYPE),
            "extra_hr_emails": config.get("extra_hr_emails") or [],
            "email_sending": False}


@router.get("/settings/workflow")
def get_workflow(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    canonical._perm(actor, ("settings", "requests"))
    out = _workflow_out(canonical._workflow_config(db))
    last = canonical._app_setting(db, escalation.LAST_RUN_KEY)
    out["last_escalation"] = last if isinstance(last, dict) else None
    out["types"] = canonical._rows(db, "SELECT code, name_ar FROM public.workflow_request_types ORDER BY code")
    return out


@router.put("/settings/workflow")
def put_workflow(body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(canonical.current_actor),
                 db: Session = Depends(get_db)):
    canonical._perm(actor, "settings", "edit")
    config = workflow_change(db, body, canonical._workflow_config(db))
    canonical._set_app_setting(db, "workflow_config", config, actor)
    canonical._write_audit(db, actor, request, "settings", "wf_config", "ariba_app_settings", "workflow_config",
                           summary="تحديث إعدادات سير الطلبات", details=_workflow_out(config))
    db.commit()
    return _workflow_out(config)


@router.get("/settings/leave-policy")
def get_leave_policy(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    canonical._perm(actor, ("settings", "leaves"))
    return leave_policy(db)


@router.put("/settings/leave-policy")
def put_leave_policy(body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(canonical.current_actor),
                     db: Session = Depends(get_db)):
    canonical._perm(actor, "settings", "edit")
    if not isinstance(body, dict) or not body:
        raise _invalid("Send at least one switch")
    current = leave_policy(db)
    for key, value in body.items():
        if key not in POLICY_DEFAULTS:
            raise _invalid(f"مفتاح غير معروف: {key}")
        if not isinstance(value, bool):
            raise _invalid(f"{key} يجب أن يكون true أو false")
        current[key] = value
    canonical._set_app_setting(db, POLICY_KEY, current, actor)
    canonical._write_audit(db, actor, request, "settings", "leave_policy", "ariba_app_settings", POLICY_KEY,
                           summary="تحديث سياسة إلغاء وتعديل الإجازات", details=current)
    db.commit()
    return current


# ------------------------------------------------------------------------------------------ L5 escalation

@router.post("/requests/escalate")
def escalate_now(request: Request, actor: dict[str, Any] = Depends(canonical.current_actor),
                 db: Session = Depends(get_db)):
    canonical._perm(actor, "requests", "edit")
    moved = escalation.escalate(db, actor.get("account_id"))
    canonical._write_audit(db, actor, request, "requests", "escalation_run", "workflow_request", None,
                           summary=f"تشغيل التصعيد يدويًا: {moved} طلب انتقل للموارد البشرية", details={"moved": moved})
    db.commit()
    return {"escalated": moved}
