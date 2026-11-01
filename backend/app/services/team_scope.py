"""The direct manager's scope: their permissions, their team and their delegations.

`/me/manager-perms`, `/me/team`, `/me/team/requests` and `/me/team/{id}/requests` all answer the
same three questions — *may this person manage anyone, what did HR allow, and has the report
delegated them* — so the SQL lives here once and the routers (`app.routers.manager` and
`canonical.my_team`) only shape responses.

Two rules this module owns:

* **`ariba_manager_perms.perms` is sparse.** A key that is not stored falls back to
  `MANAGER_PERMS_DEFAULT_ON` (their sql/16: a manager may approve, set targets and evaluate until
  HR says otherwise); a stored key always wins, including a stored `false`.
* **The team's salary is hidden by default.** `view_team_salary` only reaches `/me/team` when the
  `manager_team_salary` setting says so *and* the manager has the permission — a permission HR
  granted is not enough on its own (docs/FOLLOW_UPS.md #24). `perms()` reports what HR stored;
  `effective_perms()` is what a response may act on.

The shapes follow the reference router (`port_workflow.py` → `/me/team`, `port_common.py` →
`manager_perms`/`team_ids`), with the salary guard added on top.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.scheduling import today_riyadh
from app.services import canonical_data as cdata

#: The keys `ariba_manager_perms.perms` stores — theirs (sql/16), in their order.
MANAGER_PERM_KEYS = ("approve_requests", "view_team", "view_team_data", "view_team_leaves",
                     "view_team_requests", "view_team_attendance", "view_team_salary", "manage_targets",
                     "evaluate_team", "submit_for_team")
#: What a manager may do before HR stores anything for them (their `MGR_DEFAULT_ON`).
MANAGER_PERMS_DEFAULT_ON = frozenset({"approve_requests", "manage_targets", "evaluate_team"})
#: The setting that unlocks the team's salary (`{"visible": true}`), off unless HR turns it on.
TEAM_SALARY_SETTING = "manager_team_salary"

_TEAM_SQL = """
SELECT d.employee_id, d.name_ar, d.name_en, d.nationality, d.join_date, d.data,
       er.name AS employer, dp.name AS department, jt.name AS job_title
FROM public.employee_directory d
LEFT JOIN public.employers er ON er.id = d.employer_id
LEFT JOIN public.departments dp ON dp.id = d.department_id
LEFT JOIN public.job_titles jt ON jt.id = d.job_title_id
WHERE d.manager_id = :mid AND d.active
ORDER BY d.name_ar
"""

_LEAVES_SQL = """
SELECT l.employee_id, l.leave_type, l.from_date, l.to_date, l.days, w.id AS wid, w.status
FROM public.leave_requests l
JOIN public.workflow_requests w ON w.id = l.workflow_request_id
WHERE l.employee_id = ANY(:ids) AND l.to_date >= CURRENT_DATE - 365
ORDER BY l.from_date DESC
"""


def _rows(db: Session, sql: str, **params: Any) -> list[dict[str, Any]]:
    return [dict(row) for row in db.execute(text(sql), params).mappings().all()]


def _row(db: Session, sql: str, **params: Any) -> dict[str, Any] | None:
    row = db.execute(text(sql), params).mappings().first()
    return dict(row) if row else None


def _iso(value: Any) -> str | None:
    """A date/number/string as the JSON the app reads (dates as `YYYY-MM-DD`, never a datetime)."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


# ---------------------------------------------------------------- permissions
def merge_perms(stored: dict[str, Any] | None) -> dict[str, bool]:
    """The ten keys with the stored values on top of the defaults (`MANAGER_PERMS_DEFAULT_ON`)."""
    stored = stored if isinstance(stored, dict) else {}
    return {key: bool(stored[key]) if key in stored else key in MANAGER_PERMS_DEFAULT_ON
            for key in MANAGER_PERM_KEYS}


def raw_perms(db: Session, manager_id: str | None) -> dict[str, Any]:
    """Only the keys HR explicitly stored for this manager (`{}` when they never did)."""
    if not manager_id:
        return {}
    row = _row(db, "SELECT perms FROM public.ariba_manager_perms WHERE manager_id=:m", m=manager_id)
    stored = (row or {}).get("perms")
    return dict(stored) if isinstance(stored, dict) else {}


def perms(db: Session, manager_id: str | None) -> dict[str, bool]:
    """What HR let this manager do, defaults included (`view_team_salary` as stored)."""
    return merge_perms(raw_perms(db, manager_id))


def save_perms(db: Session, manager_id: str, updates: dict[str, Any], updated_by: str | None = None) -> dict[str, bool]:
    """Store the keys the caller sent, keep the rest as they were, return the effective set.

    Only the sent keys are written, so a permission nobody configured keeps following the
    default even if the default changes later (their sql/16 `ON CONFLICT` upsert, narrowed).
    """
    changes = {key: bool(value) for key, value in updates.items() if key in MANAGER_PERM_KEYS}
    stored = {**raw_perms(db, manager_id), **changes}
    db.execute(text("""INSERT INTO public.ariba_manager_perms(manager_id,perms,updated_by,updated_at)
        VALUES(:m,CAST(:p AS jsonb),:by,now())
        ON CONFLICT(manager_id) DO UPDATE SET perms=EXCLUDED.perms,updated_by=EXCLUDED.updated_by,updated_at=now()"""),
               {"m": manager_id, "p": json.dumps(stored), "by": updated_by})
    return merge_perms(stored)


def team_salary_visible(db: Session) -> bool:
    """Whether HR let managers see the team's salary at all (`manager_team_salary`, default off)."""
    row = _row(db, "SELECT value FROM public.ariba_app_settings WHERE key=:k", k=TEAM_SALARY_SETTING)
    value = (row or {}).get("value")
    if isinstance(value, dict):
        value = value.get("visible")
    return value is True


def set_team_salary_visible(db: Session, visible: bool, updated_by: str | None = None) -> bool:
    """Store the team-salary setting; the caller commits."""
    db.execute(text("""INSERT INTO public.ariba_app_settings(key,value,updated_at,updated_by)
        VALUES(:k,CAST(:v AS jsonb),now(),:by)
        ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now(),updated_by=EXCLUDED.updated_by"""),
               {"k": TEAM_SALARY_SETTING, "v": json.dumps({"visible": bool(visible)}), "by": updated_by})
    return bool(visible)


def effective_perms(db: Session, manager_id: str | None) -> dict[str, bool]:
    """What a response may act on: the stored permissions, with the salary rule applied."""
    out = perms(db, manager_id)
    if out["view_team_salary"] and not team_salary_visible(db):
        out["view_team_salary"] = False
    return out


# ---------------------------------------------------------------- team and delegation
def team_ids(db: Session, manager_id: str | None) -> list[str]:
    """The active employees whose `manager_id` is this manager, by name."""
    if not manager_id:
        return []
    rows = _rows(db, "SELECT employee_id FROM public.employee_directory WHERE manager_id=:m AND active ORDER BY name_ar",
                 m=manager_id)
    return [str(r["employee_id"]) for r in rows]


def is_manager_of(db: Session, manager_id: str | None, employee_id: str) -> bool:
    if not manager_id or not employee_id:
        return False
    row = _row(db, "SELECT manager_id FROM public.employee_directory WHERE employee_id=:e", e=employee_id)
    return bool(row and row.get("manager_id") == manager_id)


def delegated_ids(db: Session, manager_id: str | None) -> set[str]:
    """The reports who switched their delegation on for this manager."""
    if not manager_id:
        return set()
    rows = _rows(db, "SELECT employee_id FROM public.ariba_delegations WHERE manager_id=:m AND active", m=manager_id)
    return {str(r["employee_id"]) for r in rows}


def delegation_active(db: Session, employee_id: str, manager_id: str | None) -> bool:
    """Whether this employee delegated *this* manager (the row also has to point at them)."""
    if not manager_id:
        return False
    row = _row(db, "SELECT active FROM public.ariba_delegations WHERE employee_id=:e AND manager_id=:m",
               e=employee_id, m=manager_id)
    return bool((row or {}).get("active"))


# ---------------------------------------------------------------- the team screen
def _member(row: dict[str, Any]) -> dict[str, Any]:
    """One `/me/team` member before the permission filter — the fields the app's `TeamMember` names."""
    data = dict(row.get("data") or {})
    return {
        "id": str(row["employee_id"]),
        "emp_no": str(data.get("empNo") or data.get("u") or row["employee_id"]),
        "name_ar": row.get("name_ar") or data.get("nameAr") or data.get("name_ar") or "",
        "name_en": row.get("name_en") or data.get("nameEn") or data.get("name_en"),
        "job_title": row.get("job_title") or data.get("jobTitle") or data.get("job_title"),
        "department": row.get("department") or data.get("dept") or data.get("department"),
        "employer": row.get("employer") or data.get("employer"),
        "join_date": _iso(row.get("join_date") or data.get("contractJoin") or data.get("join_date")),
        "nationality": row.get("nationality") or data.get("nationality"),
        "mobile": data.get("mobile"),
        "email": data.get("email"),
        "contract_end": _iso(data.get("contractEnd")),
        "iqama_expiry": _iso(data.get("iqamaExpiry")),
        "salary_total": data.get("salaryTotal"),
        "net_salary": data.get("netSalary"),
    }


def _leaves(db: Session, ids: list[str]) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {}
    if not ids:
        return out
    for leave in _rows(db, _LEAVES_SQL, ids=list(ids)):
        out.setdefault(str(leave["employee_id"]), []).append({
            "id": str(leave["wid"]),
            "type": leave["leave_type"],
            "from": _iso(leave["from_date"]),
            "to": _iso(leave["to_date"]),
            "days": float(leave["days"] or 0),
            "status": leave["status"],
        })
    return out


def team_members(db: Session, manager_id: str | None) -> list[dict[str, Any]]:
    """`GET /me/team`: the direct reports with only what the manager's permissions allow.

    Always there: identity (`id`, `emp_no`, `name_ar`, `name_en`, `job_title`, `department`) and
    `delegated`. `view_team_data` adds the personal/contract fields, `view_team_leaves` the balance
    and the last 12 months of leave, and `view_team_salary` — only with the setting on as well —
    the salary. No permission, or no team: `[]` (their sql/16 behaviour).
    """
    if not manager_id:
        return []
    rows = _rows(db, _TEAM_SQL, mid=manager_id)
    if not rows:
        return []
    allowed = effective_perms(db, manager_id)
    if not allowed["view_team"]:
        return []
    delegated = delegated_ids(db, manager_id)
    leaves = _leaves(db, [str(r["employee_id"]) for r in rows]) if allowed["view_team_leaves"] else {}
    book = None
    views: dict[str, Any] = {}
    if allowed["view_team_leaves"]:  # the balance is computed here, like `/me/leave` (no snapshots)
        for row in rows:
            for view in cdata.employees(db, employee_id=str(row["employee_id"])):
                views[view.id] = view
        book = cdata.leave_book(db, today_riyadh(), list(views.values()))
    out: list[dict[str, Any]] = []
    for row in rows:
        member = _member(row)
        if not allowed["view_team_data"]:
            for field in ("employer", "join_date", "nationality", "mobile", "email", "contract_end", "iqama_expiry"):
                member.pop(field, None)
        if not allowed["view_team_salary"]:
            member.pop("salary_total", None)
            member.pop("net_salary", None)
        view = views.get(member["id"])
        if book is not None and view is not None:
            summary = book.summary(view)
            member.update({"leave_balance": summary["current"], "leave_year_end": summary["year_end"]})
            member["leaves"] = leaves.get(member["id"], [])
        member["delegated"] = member["id"] in delegated
        out.append(member)
    return out

