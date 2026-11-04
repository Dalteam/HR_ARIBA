"""The recycle bin (سلة المهملات): what our own delete routes put aside, put back or dropped for good.

    GET  /recycle-bin                    the four categories, their counts and every snapshot
    POST /recycle-bin/{id}/restore       re-insert one snapshot from its JSON
    POST /recycle-bin/purge              drop by ids, by `before`, or by kind — never everything at once

`ariba_deleted_items` is written by our delete routes (`/me/requests/{id}`, duplicate accounts, duplicate
attendance), so this module is the read side plus a restore. `bin_list` / `bin_restore` / `bin_purge` in the
design's SQL are the specification:

* **Restore re-inserts from the snapshot**, never from a second copy: `workflow_request` and `hr_leave` rebuild
  `workflow_requests` + its `leave_requests` + the documents that hung off the request, and clear the
  `ariba_leave_tombstones` row of an HR-recorded leave. An employee restore rebuilds the directory row, its
  account, requests, leaves, actions, attendance, payroll rows and documents.
* **A restore never overwrites**: an existing request is `409 REQUEST_EXISTS`, an existing employee is
  `409 EMPLOYEE_EXISTS`, a missing employee is `409 EMPLOYEE_MISSING` («استرجع الموظف أولًا» in the screen).
* **Purging needs a filter.** No `ids`, no `before` → `422 PURGE_NEEDS_FILTER`, so a stray click can never
  empty the bin. Every restore and every purge writes one `ariba_audit_log` row (`module` `bin`).
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.database import get_db
from app.routers import canonical

router = APIRouter(tags=["bin"])

#: Who may see and use the bin: `employees_admin:edit` in `ariba_role_perms` (hr, admin_manager) plus `admin`.
BIN_ROLES = ("hr", "admin", "admin_manager")

#: The four buttons of the screen; every other kind lands in «أخرى (سجلات مكررة)».
CATEGORIES = ("employee", "workflow_request", "hr_leave", "other")

RESTORABLE = ("employee", "workflow_request", "hr_leave")


def _editor(actor: dict[str, Any]) -> None:
    canonical._perm(actor, "employees_admin", "edit")


def _uuid(value: Any, field: str) -> str:
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, AttributeError, TypeError) as exc:
        raise ApiError(422, "validation_error", f"{field} must be a uuid") from exc


def _category(kind: str) -> str:
    return kind if kind in ("employee", "workflow_request", "hr_leave") else "other"


@router.get("/recycle-bin")
def bin_list(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """Every snapshot, newest first, with the title and detail the screen prints."""
    _editor(actor)
    items = canonical._rows(db, """
        SELECT i.id, i.kind, i.ref_id, i.employee_id, i.deleted_at, i.deleted_by, i.deleted_by_role,
               coalesce((SELECT d.name_ar FROM public.employee_directory d WHERE d.employee_id=i.employee_id),
                        i.snapshot->'employee'->>'name_ar', i.employee_id) AS emp_name,
               CASE i.kind
                 WHEN 'employee' THEN coalesce(i.snapshot->'employee'->>'name_ar', i.ref_id)
                 WHEN 'workflow_request' THEN coalesce(i.snapshot->'request'->'payload'->>'title',
                                                       i.snapshot->'request'->>'request_type')
                 WHEN 'hr_leave' THEN coalesce(i.snapshot->'request'->>'request_type','إجازة') || ' ' ||
                                      coalesce(i.snapshot->'request'->'payload'->>'from','') || ' → ' ||
                                      coalesce(i.snapshot->'request'->'payload'->>'to','')
                 ELSE i.kind END AS title,
               CASE WHEN i.kind = 'employee'
                    THEN jsonb_array_length(coalesce(i.snapshot->'requests','[]')) || ' طلب · ' ||
                         jsonb_array_length(coalesce(i.snapshot->'attendance','[]')) || ' حضور · ' ||
                         jsonb_array_length(coalesce(i.snapshot->'documents','[]')) || ' مستند'
                    ELSE coalesce(i.snapshot->'request'->>'status','') END AS detail
        FROM public.ariba_deleted_items i ORDER BY i.deleted_at DESC""")
    counts = {key: 0 for key in CATEGORIES}
    for item in items:
        item["category"] = _category(item["kind"])
        item["restorable"] = item["kind"] in RESTORABLE
        counts[item["category"]] += 1
    return {"items": items, "counts": counts, "total": len(items)}


_STATE = {
    "BIN_ITEM_NOT_FOUND": (404, "عنصر غير موجود في السلة"),
    "REQUEST_EXISTS": (409, "الطلب موجود بالفعل — لا يمكن استرجاعه مرتين"),
    "EMPLOYEE_EXISTS": (409, "الموظف موجود بالفعل"),
    "EMPLOYEE_MISSING": (409, "استرجع الموظف أولًا ثم استرجع طلبه"),
    "KIND_NOT_RESTORABLE": (409, "هذا العنصر للأرشيف فقط — لا يمكن استرجاعه"),
    "SNAPSHOT_INCOMPLETE": (409, "نسخة العنصر ناقصة — تعذر الاسترجاع"),
}


def _refuse(code: str) -> ApiError:
    status, message = _STATE[code]
    return ApiError(status, code.lower(), message)


def _restore_documents(db: Session, documents: list[dict[str, Any]], employee_id: str | None,
                       request_id: str | None) -> None:
    """`ariba_documents` rows out of a snapshot; the file travels base64-encoded in the snapshot."""
    for doc in documents:
        # `ariba_documents.file_size` is generated from `file_data` in this schema — never inserted.
        db.execute(text("""INSERT INTO public.ariba_documents
            (id,employee_id,request_id,document_type,file_name,mime_type,file_data,uploaded_by,created_at)
            VALUES (CAST(:id AS uuid), :employee_id, CAST(:request_id AS uuid), coalesce(:document_type,'other'),
                    :file_name, :mime_type, decode(coalesce(:b64,''),'base64'),
                    :uploaded_by, coalesce(CAST(:created_at AS timestamptz), now()))
            ON CONFLICT DO NOTHING"""), {
            "id": doc.get("id"), "employee_id": doc.get("employee_id") or employee_id,
            "request_id": doc.get("request_id") or request_id, "document_type": doc.get("document_type"),
            "file_name": doc.get("file_name"), "mime_type": doc.get("mime_type"),
            "b64": doc.get("base64") or doc.get("b64"),
            "uploaded_by": doc.get("uploaded_by"), "created_at": doc.get("created_at")})



_COLUMNS: dict[str, list[str]] = {}


def _columns(db: Session, table_name: str) -> list[str]:
    """The columns a snapshot may write: everything except the generated ones.

    `workflow_requests.status` is generated from `current_stage` in this schema (the design's copy has it as a
    plain column), so `INSERT … SELECT *` fails with `GeneratedAlways`. Writing only the non-generated columns
    restores the same row, because the status is recomputed from the stage that is restored.
    """
    if table_name not in _COLUMNS:
        rows = canonical._rows(db, """SELECT column_name FROM information_schema.columns
            WHERE table_schema='public' AND table_name=:t AND is_generated='NEVER'
            ORDER BY ordinal_position""", t=table_name)
        _COLUMNS[table_name] = [r["column_name"] for r in rows]
    return _COLUMNS[table_name]


def _insert_snapshots(db: Session, table_name: str, rows: list[dict[str, Any]]) -> None:
    """Re-insert `rows` through the table's own row type; keys the table no longer has are ignored."""
    columns = ", ".join(_columns(db, table_name))
    db.execute(text(f"""INSERT INTO public.{table_name} ({columns})
        SELECT {columns} FROM jsonb_populate_recordset(null::public.{table_name}, CAST(:rows AS jsonb))
        ON CONFLICT DO NOTHING"""), {"rows": json.dumps(rows, default=str, ensure_ascii=False)})


@router.post("/recycle-bin/{item_id}/restore")
def bin_restore(item_id: str, request: Request, actor: dict[str, Any] = Depends(canonical.current_actor),
                db: Session = Depends(get_db)):
    """Put one snapshot back, exactly as the reference body does, then drop it from the bin."""
    _editor(actor)
    item_id = _uuid(item_id, "item_id")
    item = canonical._row(db, "SELECT * FROM public.ariba_deleted_items WHERE id=CAST(:id AS uuid)", id=item_id)
    if not item:
        raise _refuse("BIN_ITEM_NOT_FOUND")
    kind, snap = item["kind"], item["snapshot"] or {}
    if kind in ("workflow_request", "hr_leave"):
        request_id = (snap.get("request") or {}).get("id")
        if not request_id:
            raise _refuse("SNAPSHOT_INCOMPLETE")
        if canonical._row(db, "SELECT 1 AS x FROM public.workflow_requests WHERE id=CAST(:r AS uuid)", r=request_id):
            raise _refuse("REQUEST_EXISTS")
        if not canonical._row(db, "SELECT 1 AS x FROM public.employee_directory WHERE employee_id=:e",
                              e=item["employee_id"]):
            raise _refuse("EMPLOYEE_MISSING")
        _insert_snapshots(db, "workflow_requests", [snap["request"]])
        _insert_snapshots(db, "leave_requests", snap.get("leave") or [])
        _restore_documents(db, snap.get("documents") or [], item["employee_id"], request_id)
        hr_leave_id = ((snap.get("request") or {}).get("payload") or {}).get("hr_leave_id")
        if hr_leave_id:
            db.execute(text("DELETE FROM public.ariba_leave_tombstones WHERE hr_leave_id=:h"), {"h": str(hr_leave_id)})
        canonical._insert_notification(db, item["employee_id"], None, "تم استرجاع طلبك",
                                       "أعادت الموارد البشرية طلبك المحذوف إلى سجلك.", "hr", "request")
    elif kind == "employee":
        employee_id = (snap.get("employee") or {}).get("employee_id") or item["ref_id"]
        if not employee_id:
            raise _refuse("SNAPSHOT_INCOMPLETE")
        if canonical._row(db, "SELECT 1 AS x FROM public.employee_directory WHERE employee_id=:e", e=employee_id):
            raise _refuse("EMPLOYEE_EXISTS")
        for table, key in (("employee_directory", "employee"), ("ariba_auth_accounts", "accounts"),
                           ("workflow_requests", "requests"), ("leave_requests", "leaves"),
                           ("workflow_actions", "actions"), ("attendance", "attendance"),
                           ("employee_payrolls", "payrolls")):
            rows = snap.get(key)
            if key == "employee":
                rows = [rows] if rows else []
            if not rows:
                continue
            _insert_snapshots(db, table, rows)
        _restore_documents(db, snap.get("documents") or [], employee_id, None)
    else:
        raise _refuse("KIND_NOT_RESTORABLE")

    db.execute(text("DELETE FROM public.ariba_deleted_items WHERE id=CAST(:id AS uuid)"), {"id": item_id})
    canonical._write_audit(db, actor, request, "bin", "restore", "ariba_deleted_items", item_id,
                           summary=f"استرجاع عنصر من السلة ({kind})",
                           details={"kind": kind, "ref": item["ref_id"], "employee": item["employee_id"]})
    db.commit()
    return {"id": item_id, "kind": kind, "ref_id": item["ref_id"], "restored": True}



@router.post("/recycle-bin/purge")
def bin_purge(body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(canonical.current_actor),
              db: Session = Depends(get_db)):
    """Delete snapshots for good: by ids, by `before`, by kind — and never without one of the three."""
    _editor(actor)
    ids = body.get("ids")
    before = body.get("before")
    if before is not None and str(before).strip():
        try:
            datetime.fromisoformat(str(before).strip().replace("Z", "+00:00"))
        except ValueError as exc:
            raise ApiError(422, "invalid_date", "before must be an ISO date or date-time") from exc
        before = str(before).strip()
    else:
        before = None
    kind = str(body.get("kind") or "").strip() or None
    if not ids and not before and not kind:
        raise ApiError(422, "purge_needs_filter", "حدد العناصر أو فترة أو تصنيفًا قبل الحذف النهائي")
    where, params = ["1=1"], {}
    if ids:
        if not isinstance(ids, list) or len(ids) > 500:
            raise ApiError(422, "validation_error", "ids must be a list of at most 500 uuids")
        names = []
        for index, value in enumerate(ids):
            params[f"id{index}"] = _uuid(value, "ids")
            names.append(f"CAST(:id{index} AS uuid)")
        where.append("id IN (" + ",".join(names) + ")")
    if before:
        where.append("deleted_at < CAST(:before AS timestamptz)")
        params["before"] = before
    if kind:
        where.append("kind = :kind")
        params["kind"] = kind
    purged = db.execute(text(f"DELETE FROM public.ariba_deleted_items WHERE {' AND '.join(where)}"), params).rowcount
    canonical._write_audit(db, actor, request, "bin", "purge", "ariba_deleted_items", None,
                           summary=f"حذف نهائي من السلة: {purged} عنصر",
                           details={"purged": purged, "kind": kind, "before": before,
                                    "ids": len(ids) if isinstance(ids, list) else 0})
    db.commit()
    return {"purged": purged}

