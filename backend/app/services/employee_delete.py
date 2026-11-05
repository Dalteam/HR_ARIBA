"""Delete an employee into the recycle bin (Stage 18) — the design's `ariba_hr_delete_employee` (sql/27_recycle_bin.sql),
on our normalized schema, and the list of tables the bin's restore puts back.

* **Refused while other people's data points at them** (`blockers`): someone's direct manager, a workflow approver, a
  delegation manager, the manager on someone's letter, the creator of someone's task, the one who submitted or approved
  someone else's request. Deleting would break those rows (the foreign keys refuse it) or rewrite other people's
  history, so HR reassigns first, or terminates instead (a termination keeps everything).
* **Otherwise every row of their own is snapshotted, then deleted**: the directory row, accounts, requests with their
  actions, leaves, documents (file included, base64), attendance, payroll rows, and the tables in `EXTRAS`. The
  snapshot is one `ariba_deleted_items` row of kind `employee`; `routers/recycle_bin.py` restores it, parents first,
  using the same lists. Notifications and sessions are not kept (the design does not restore them either).
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

#: The employee's own rows in the other tables, in restore order (a parent before what points at it). Tables a
#: migration adds may be missing on an older database; they are skipped.
EXTRAS: tuple[tuple[str, str], ...] = (
    ("permissions", "employee_id"), ("employee_termination_archive", "employee_id"), ("ariba_targets", "employee_id"),
    ("ariba_evaluations", "employee_id"), ("ariba_leave_files", "employee_id"), ("ariba_emp_occasions", "employee_id"),
    ("ariba_delegations", "employee_id"), ("ariba_manager_perms", "manager_id"), ("ariba_tasks", "assignee_id"),
    ("ariba_doc_signing", "employee_id"), ("ariba_bizcards", "employee_id"), ("ariba_alert_log", "employee_id"),
    ("ariba_alert_daily", "employee_id"),
)

#: What still points at the employee from someone else's rows: (SQL counting them, the reason HR reads).
_BLOCKERS: tuple[tuple[str, str], ...] = (
    ("SELECT count(*) FROM public.employee_directory WHERE manager_id=:e AND employee_id<>:e",
     "مدير مباشر لموظفين آخرين — انقلهم لمدير آخر أولًا"),
    ("SELECT count(*) FROM public.workflow_approvers WHERE employee_id=:e", "معتمد في مسار الطلبات — أزله من المعتمدين أولًا"),
    ("SELECT count(*) FROM public.ariba_delegations WHERE manager_id=:e", "عنده تفويض صلاحيات لموظفين"),
    ("SELECT count(*) FROM public.ariba_doc_signing WHERE manager_id=:e AND employee_id<>:e", "مدير موقّع على خطابات موظفين آخرين"),
    ("SELECT count(*) FROM public.ariba_tasks WHERE created_by=:e AND assignee_id<>:e", "أنشأ مهامًا لموظفين آخرين"),
    ("SELECT count(*) FROM public.workflow_requests WHERE submitted_by_employee_id=:e AND employee_id<>:e",
     "قدّم طلبات نيابة عن موظفين آخرين"),
    ("""SELECT count(*) FROM public.workflow_actions x JOIN public.workflow_requests r ON r.id=x.request_id
        WHERE r.employee_id<>:e AND x.actor_account_id IN (SELECT id FROM public.ariba_auth_accounts WHERE employee_id=:e)""",
     "اعتمد أو رفض طلبات موظفين آخرين (سجل الموافقات)"),
)


def exists(db: Session, table: str) -> bool:
    return bool(db.scalar(text("SELECT to_regclass(:t) IS NOT NULL"), {"t": f"public.{table}"}))


def blockers(db: Session, employee_id: str) -> list[str]:
    return [reason for sql, reason in _BLOCKERS if db.scalar(text(sql), {"e": employee_id})]


def _rows(db: Session, sql: str, employee_id: str) -> list[dict[str, Any]]:
    return db.scalar(text(f"SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM ({sql}) t"), {"e": employee_id}) or []


def snapshot(db: Session, employee_id: str) -> dict[str, Any]:
    own = "SELECT id FROM public.workflow_requests WHERE employee_id=:e"
    snap: dict[str, Any] = {
        "employee": db.scalar(text("SELECT to_jsonb(d) FROM public.employee_directory d WHERE employee_id=:e"), {"e": employee_id}),
        "accounts": _rows(db, "SELECT * FROM public.ariba_auth_accounts WHERE employee_id=:e", employee_id),
        "requests": _rows(db, "SELECT * FROM public.workflow_requests WHERE employee_id=:e", employee_id),
        "actions": _rows(db, f"SELECT * FROM public.workflow_actions WHERE request_id IN ({own})", employee_id),
        "leaves": _rows(db, "SELECT * FROM public.leave_requests WHERE employee_id=:e", employee_id),
        "attendance": _rows(db, "SELECT * FROM public.attendance WHERE employee_id=:e", employee_id),
        "payrolls": _rows(db, "SELECT * FROM public.employee_payrolls WHERE employee_id=:e", employee_id),
        "documents": db.scalar(text("""SELECT coalesce(jsonb_agg((to_jsonb(d) - 'file_data') ||
                jsonb_build_object('b64', encode(d.file_data, 'base64'))), '[]'::jsonb)
            FROM public.ariba_documents d WHERE d.employee_id=:e"""), {"e": employee_id}) or [],
        "extras": {},
    }
    for table, column in EXTRAS:
        if exists(db, table):
            rows = _rows(db, f"SELECT * FROM public.{table} WHERE {column}=:e", employee_id)
            if rows:
                snap["extras"][table] = rows
    return snap


def delete(db: Session, employee_id: str, actor: dict[str, Any]) -> dict[str, Any]:
    """Snapshot to the bin, then delete, children first. The caller has checked `blockers` and commits."""
    snap = snapshot(db, employee_id)
    db.execute(text("""INSERT INTO public.ariba_deleted_items (kind, ref_id, employee_id, snapshot, deleted_by, deleted_by_role)
        VALUES ('employee', :e, :e, CAST(:s AS jsonb), :by, :role)"""),
        {"e": employee_id, "s": json.dumps(snap, ensure_ascii=False, default=str), "by": actor.get("employee_id"),
         "role": actor.get("role")})
    for table, column in reversed(EXTRAS):
        if exists(db, table):
            db.execute(text(f"DELETE FROM public.{table} WHERE {column}=:e"), {"e": employee_id})
    own = "SELECT id FROM public.workflow_requests WHERE employee_id=:e"
    for sql in ("DELETE FROM public.workflow_notifications WHERE recipient_employee_id=:e",
                f"DELETE FROM public.workflow_notifications WHERE request_id IN ({own})",
                f"DELETE FROM public.workflow_actions WHERE request_id IN ({own})",
                "DELETE FROM public.leave_requests WHERE employee_id=:e",
                "DELETE FROM public.ariba_documents WHERE employee_id=:e",
                "DELETE FROM public.attendance WHERE employee_id=:e",
                "DELETE FROM public.employee_payrolls WHERE employee_id=:e",
                "DELETE FROM public.workflow_requests WHERE employee_id=:e",
                "DELETE FROM public.ariba_auth_accounts WHERE employee_id=:e",
                "DELETE FROM public.employee_directory WHERE employee_id=:e"):
        db.execute(text(sql), {"e": employee_id})
    return {"requests": len(snap["requests"]), "attendance": len(snap["attendance"]), "documents": len(snap["documents"])}
