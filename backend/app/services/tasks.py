"""Tasks, meetings and the team's availability (Stage 4 of the employee-app port).

One screen (`app/tasks.tsx`, their `pages/team/index.jsx`) plus the badge on the team tab
(`app/(tabs)/team.tsx` counts the open rows of the inbox). Four calls, exactly the ones
`src/lib/port.ts` makes:

    GET  /team/availability        tasks.availability()   who is on leave, and back when
    GET  /tasks?box=inbox|sent     tasks.list()           what was sent to me / by me
    POST /tasks                    tasks.send()           one task or meeting to several people
    POST /tasks/{id}/update        tasks.update()         done / accepted / declined / cancelled

What this module owns (docs/BUSINESS_RULES.md, "Tasks, meetings and team availability"):

* **You can only write to people you can already see.** The availability list and the recipient
  list are one set: the HR roles (`hr`/`admin`/`admin_manager`) and the CEO see every active
  employee; a direct manager sees their own reports and needs `view_team` **and**
  `view_team_leaves`, which is the screen's `allowed` flag and the only list it can pick recipients
  from. A recipient outside that set refuses the whole request with `403` before a row is written.
* **One row per recipient.** `ariba_tasks` keeps an assignee per row, so a task sent to three
  people is three rows sharing one `batch_id`; each of them gets their own bell entry and the audit
  row records the batch, not one row per call.
* **The recipient answers, the sender cancels.** `done`/`accepted`/`declined` belong to the
  assignee and `cancelled` to the creator, and only while the row is still `open` (`409 not_open`
  afterwards). A row that is not the caller's is `404`, never a `403` that would confirm it exists.
* **`kind` decides which fields matter.** A meeting must carry `start` (and may carry `end` and
  `location`); a task carries `due`. The field that does not belong to the kind is dropped, because
  the screen never sends both — a task with a meeting time is not a thing the app can express.
* **A leave is "away", not "why".** The availability tab answers who is not at work and when they
  are back, so a leave reaches a manager as its dates and length plus a name only when the type is
  `annual` or `remote`; sickness, maternity, death, marriage and anything added later arrive as
  `private` («إجازة»), and the reason is never selected from the row at all. HR reads the real types
  through the leave screens, which is where a leave is a leave.

The screen also does arithmetic the server does not repeat: it merges consecutive leaves, treats
remote work as an absence that is not a leave, and calls a leave "soon" within 14 days. That is why
`availability` returns raw approved leaves per person and a `today` cut-off instead of a status.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.core.scheduling import RIYADH, today_riyadh
from app.services import team_scope

#: The two kinds the table stores (`ariba_tasks.kind`) and the two boxes the screen asks for.
TASK_KINDS = ("task", "meeting")
TASK_BOXES = ("inbox", "sent")
#: The only status a row can move out of, and who may move it where.
OPEN_STATUS = "open"
ASSIGNEE_STATUSES = ("done", "accepted", "declined")
CREATOR_STATUSES = ("cancelled",)
#: Their `ariba_send_task` truncates the title at this many characters; refusing is clearer.
TITLE_MAX = 200
#: How far back an approved leave still matters for "who is away / back soon" (their −60 days).
LEAVE_WINDOW_DAYS = 60
#: The only leave types a manager is told by name. Everything else — sickness above all, and any type
#: added later — reaches them as `PRIVATE_LEAVE` («إجازة») with no name and no reason, because the
#: availability tab answers "who is away", not "why". `remote` is named on purpose: the screen drops
#: it from the merge, since remote work is work, not an absence.
NAMED_LEAVE_TYPES = ("annual", "remote")
#: What a leave whose type is not named is called; `app/tasks.tsx` labels it «إجازة».
PRIVATE_LEAVE = "private"
#: Read access to everybody, like the other HR reads (`canonical.HR_READ_ROLES`).
HR_READ_ROLES = ("hr", "admin", "admin_manager", "ceo", "chairman")
#: The person-scoped refusal (`403`), the same sentence the team and goals screens show.
FORBIDDEN = "ليست لديك صلاحية على هذا الموظف"
#: A row that is not the caller's is not "forbidden": it does not exist for them.
NOT_FOUND = "المهمة غير موجودة"

_PEOPLE_SQL = """
SELECT d.employee_id, d.name_ar,
       coalesce(jt.name, d.data->>'job_title', d.data->>'jobTitle') AS job_title,
       coalesce(dp.name, d.data->>'department', d.data->>'dept') AS department
FROM public.employee_directory d
LEFT JOIN public.departments dp ON dp.id = d.department_id
LEFT JOIN public.job_titles jt ON jt.id = d.job_title_id
WHERE d.employee_id = ANY(:ids) AND d.active
ORDER BY d.name_ar
"""

_LEAVES_SQL = """
SELECT l.employee_id, l.leave_type, l.from_date, l.to_date, l.days
FROM public.leave_requests l
JOIN public.workflow_requests w ON w.id = l.workflow_request_id
WHERE l.employee_id = ANY(:ids) AND w.status = 'approved' AND l.to_date >= :since
ORDER BY l.from_date
"""

_ACTIVE_SQL = "SELECT employee_id FROM public.employee_directory WHERE active ORDER BY name_ar"
_REPORTS_SQL = ("SELECT employee_id FROM public.employee_directory "
                "WHERE manager_id = :manager AND active ORDER BY name_ar")

_INSERT_SQL = """
INSERT INTO public.ariba_tasks
    (batch_id, kind, title, details, due_date, start_at, end_at, location, created_by, assignee_id)
VALUES (:batch, :kind, :title, :details, :due, :start, :end, :location, :me, :assignee)
RETURNING id
"""

_UPDATE_SQL = """
UPDATE public.ariba_tasks SET status = :status, response_note = :note, updated_at = now()
WHERE id = :id
"""


def _rows(db: Session, sql: str, **params: Any) -> list[dict[str, Any]]:
    return [dict(row) for row in db.execute(text(sql), params).mappings().all()]


def _row(db: Session, sql: str, **params: Any) -> dict[str, Any] | None:
    row = db.execute(text(sql), params).mappings().first()
    return dict(row) if row else None


def _invalid(message: str) -> ApiError:
    return ApiError(422, "invalid_request", message)


def _text(value: Any) -> str | None:
    """A free-text field: blank counts as absent (the columns are nullable on purpose)."""
    text_value = str(value).strip() if value is not None else ""
    return text_value or None


def _day(value: Any) -> date | None:
    """`YYYY-MM-DD` as the date column stores it; anything else is a `422`, never a silent null."""
    if value in (None, ""):
        return None
    try:
        return date.fromisoformat(str(value).strip()[:10])
    except ValueError as exc:
        raise _invalid("التاريخ غير صحيح") from exc


def _moment(value: Any) -> datetime | None:
    """An ISO instant (`2026-11-05T10:00:00+03:00`, what the app sends); a bare time is Riyadh."""
    if value in (None, ""):
        return None
    raw = str(value).strip().replace("Z", "+00:00")
    try:
        moment = datetime.fromisoformat(raw)
    except ValueError as exc:
        raise _invalid("الوقت غير صحيح") from exc
    return moment if moment.tzinfo else moment.replace(tzinfo=RIYADH)


def _stamp(value: Any) -> str | None:
    return value.isoformat() if isinstance(value, (datetime, date)) else None


def _plain(value: Any) -> float | None:
    return None if value is None else float(value)


# ---------------------------------------------------------------- who the caller may see and write to
def audience(db: Session, actor: dict[str, Any]) -> list[str] | None:
    """The employees this caller may see in the availability tab and send a task to.

    `None` means "neither" - a plain employee, a manager without `view_team` or
    `view_team_leaves`, or an account with no employee row. HR roles and the CEO see every active
    employee; a manager sees their direct reports only (P1).
    """
    me = actor.get("employee_id")
    if actor.get("role") in HR_READ_ROLES:
        return [str(row["employee_id"]) for row in _rows(db, _ACTIVE_SQL)]
    if not me:
        return None
    allowed = team_scope.effective_perms(db, str(me))
    if not (allowed["view_team"] and allowed["view_team_leaves"]):
        return None
    reports = [str(row["employee_id"]) for row in _rows(db, _REPORTS_SQL, manager=str(me))]
    return reports or None


def availability(db: Session, actor: dict[str, Any]) -> dict[str, Any]:
    """`GET /team/availability`: the visible employees with their approved leaves, and `today`.

    `allowed: false` is not an error - the screen stops at «هذه الصفحة للمدراء والإدارة».
    """
    today = today_riyadh()
    ids = audience(db, actor)
    if not ids:
        return {"items": [], "today": today.isoformat(), "allowed": False}
    by_employee: dict[str, list[dict[str, Any]]] = {}
    for leave in _rows(db, _LEAVES_SQL, ids=ids, since=today - timedelta(days=LEAVE_WINDOW_DAYS)):
        by_employee.setdefault(str(leave["employee_id"]), []).append(leave_out(leave))
    items = [{"id": str(row["employee_id"]), "name": row.get("name_ar"),
              "job": row.get("job_title"), "dept": row.get("department"),
              "leaves": by_employee.get(str(row["employee_id"]), [])}
             for row in _rows(db, _PEOPLE_SQL, ids=ids)]
    return {"items": items, "today": today.isoformat(), "allowed": True}


# ---------------------------------------------------------------- the two shapes the app reads
def leave_out(row: dict[str, Any]) -> dict[str, Any]:
    """One leave as the availability tab may see it — dates and length, and a type only if it is one
    of `NAMED_LEAVE_TYPES`.

    `sick`, `maternity`, `death`, `marriage` and every type added later come back as
    `PRIVATE_LEAVE`: a manager learns that somebody is away until a date, not why. The reason is not
    in the query at all, so there is nothing to redact.
    """
    kind = str(row.get("leave_type") or "")
    return {"from": _stamp(row.get("from_date")), "to": _stamp(row.get("to_date")),
            "days": _plain(row.get("days")) or 0.0,
            "type": kind if kind in NAMED_LEAVE_TYPES else PRIVATE_LEAVE}


def task_out(row: dict[str, Any]) -> dict[str, Any]:
    """One row in the shape `port.ts` `Task` declares - the screen reads nothing else."""
    return {"id": str(row["id"]), "batch_id": str(row["batch_id"]), "kind": row["kind"],
            "title": row["title"], "details": row.get("details"),
            "due_date": _stamp(row.get("due_date")), "start_at": _stamp(row.get("start_at")),
            "end_at": _stamp(row.get("end_at")), "location": row.get("location"),
            "status": row["status"], "response_note": row.get("response_note"),
            "from_id": str(row["created_by"]), "from_name": row.get("from_name"),
            "to_id": str(row["assignee_id"]), "to_name": row.get("to_name"),
            "created_at": _stamp(row.get("created_at"))}


def for_box(db: Session, employee_id: str | None, box: str) -> list[dict[str, Any]]:
    """`GET /tasks?box=inbox|sent`: rows sent *to* me or *by* me, newest first, both names joined."""
    if box not in TASK_BOXES:
        raise _invalid("الصندوق غير معروف")
    if not employee_id:
        return []
    mine = "t.assignee_id" if box == "inbox" else "t.created_by"
    return _rows(db, f"""SELECT t.*, f.name_ar AS from_name, a.name_ar AS to_name
        FROM public.ariba_tasks t
        JOIN public.employee_directory f ON f.employee_id = t.created_by
        JOIN public.employee_directory a ON a.employee_id = t.assignee_id
        WHERE {mine} = :me
        ORDER BY t.created_at DESC""", me=str(employee_id))


def clean_task(body: dict[str, Any] | None) -> dict[str, Any]:
    """The send body, validated: `{to, kind, title, details, due, start, end, location}`.

    `to` keeps the screen's order and loses duplicates - one person, one row, one bell.
    """
    body = body or {}
    recipients = list(dict.fromkeys(str(one).strip() for one in (body.get("to") or [])
                                    if str(one or "").strip()))
    if not recipients:
        raise _invalid("اختر موظفاً على الأقل")
    kind = body.get("kind") or "task"
    if kind not in TASK_KINDS:
        raise _invalid("نوع غير معروف")
    title = str(body.get("title") or "").strip()
    if not title:
        raise _invalid("اكتب العنوان")
    if len(title) > TITLE_MAX:
        raise _invalid(f"العنوان أطول من {TITLE_MAX} حرف")
    details = _text(body.get("details"))
    start, end, due, location = None, None, None, None
    if kind == "meeting":
        start = _moment(body.get("start"))
        end = _moment(body.get("end"))
        if start is None:
            raise _invalid("حدد وقت الاجتماع")
        if end is not None and end < start:
            raise _invalid("نهاية الاجتماع قبل بدايته")
        location = _text(body.get("location"))
    else:
        due = _day(body.get("due"))
    return {"to": recipients, "kind": kind, "title": title, "details": details, "due": due,
            "start": start, "end": end, "location": location}


def when_label(task: dict[str, Any]) -> str:
    """The time a bell body shows: a meeting's instant, or a task's deadline (`dd/mm/yyyy`)."""
    if task["kind"] == "meeting" and task["start"]:
        return task["start"].astimezone(RIYADH).strftime("%d/%m/%Y %H:%M")
    if task["kind"] == "task" and task["due"]:
        return task["due"].strftime("%d/%m/%Y")
    return ""


# ---------------------------------------------------------------- the writes
def send(db: Session, actor: dict[str, Any], task: dict[str, Any]) -> uuid.UUID:
    """Their `ariba_send_task`: one row per recipient under one `batch_id`. Returns the batch."""
    allowed = set(audience(db, actor) or ())
    if any(recipient not in allowed for recipient in task["to"]):
        raise ApiError(403, "forbidden", FORBIDDEN)
    batch_id = uuid.uuid4()
    for recipient in task["to"]:
        db.execute(text(_INSERT_SQL), {"batch": batch_id, "kind": task["kind"],
                                       "title": task["title"], "details": task["details"],
                                       "due": task["due"], "start": task["start"],
                                       "end": task["end"], "location": task["location"],
                                       "me": actor.get("employee_id"), "assignee": recipient})
    return batch_id


def find_task(db: Session, task_id: str) -> dict[str, Any] | None:
    """One row by id; a made-up id answers `None` without reaching the database."""
    try:
        key = uuid.UUID(str(task_id))
    except (ValueError, AttributeError, TypeError):
        return None
    return _row(db, "SELECT * FROM public.ariba_tasks WHERE id = :id", id=key)


def statuses_for(row: dict[str, Any], me: str | None) -> tuple[str, ...]:
    """`done`/`accepted`/`declined` are the assignee's, `cancelled` is the creator's."""
    return ASSIGNEE_STATUSES if me == str(row["assignee_id"]) else CREATOR_STATUSES


def update_task(db: Session, row: dict[str, Any], me: str | None, status: Any,
                note: Any) -> str:
    """Their `ariba_task_update`: one move out of `open`, in the direction the caller owns."""
    if row["status"] != OPEN_STATUS:
        raise ApiError(409, "not_open", "لا يمكن تغيير حالة هذه المهمة")
    if status not in statuses_for(row, me):
        raise _invalid("حالة غير مسموحة لهذه المهمة")
    db.execute(text(_UPDATE_SQL), {"status": status, "note": _text(note), "id": row["id"]})
    return str(status)
