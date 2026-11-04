"""The direct manager's surface (Stage 2 of the employee-app port).

Five routes the new screens call, plus the HR settings that drive them:

    GET  /me/manager-perms                        port.ts manager.perms()
    GET  /me/team                                 port.ts manager.team()      (in canonical.py)
    GET  /me/team/requests                        port.ts manager.requests()
    POST /me/team/{employee_id}/requests          port.ts manager.submitFor()
    GET  /me/delegation                           port.ts delegation.get()
    PUT  /me/delegation                           port.ts delegation.set()
    GET  /settings/manager-perms                  hr-web: who may do what
    PUT  /settings/manager-perms/{manager_id}     hr-web: grant / revoke
    PUT  /settings/team-salary                    hr-web: may managers see salary

`/me/team` lives in `canonical.py` because it already did; its body now calls
`team_scope.team_members`, so the permission rules exist once. Everything else is here, in front of
the same helpers, so `canonical.py` keeps its responsibilities.

Two contracts worth naming:

* **On-behalf submission never trusts the body.** The request is written for the employee in the
  path, and `submitted_by_employee_id` is the signed-in manager from the auth context — the app
  re-adds `payload.type` to every body (`port.ts`), and that field is obsolete, not an identity.
  The report must be a *direct report*, HR must have granted `submit_for_team`, and the report must
  have delegated this manager; any of the three missing is refused before anything is written.
* **The manager's own submission is their approval.** A report's chain starts at `manager`, and
  the manager has just said yes by submitting, so the request is created at the next stage with an
  `approved` action for `manager` — the employee is not asked to approve their own request
  (their sql/16).
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.core.scheduling import today_riyadh
from app.database import get_db
from app.routers import canonical
from app.services import canonical_data as cdata
from app.services import team_scope
from app.services.request_envelope import RequestInput

router = APIRouter()

#: The types the on-behalf screen offers (`app/submit-for.tsx`): leave and the salary advance.
ON_BEHALF_TYPES = frozenset(canonical.LEAVE_FORM_TYPES) | {"salary_advance"}

#: Arabic names for the notification bodies (the reference's `TYPE_AR`, trimmed to these types).
TYPE_AR = {"annual": "إجازة سنوية", "sick": "إجازة مرضية", "unpaid": "إجازة بدون راتب",
           "mission": "مهمة عمل", "salary_advance": "راتب مقدم", "advance": "سلفة",
           "remote": "عمل عن بعد", "emergency": "إجازة اضطرارية"}


def request_out(db: Session, row: dict[str, Any]) -> dict[str, Any]:
    """A request in the shape `port.ts` `PortRequest` reads, on top of the canonical fields.

    `_workflow_out` already returns `id`, `status`, `stage`, `rejection_reason` and the flattened
    dates; the app additionally reads `request_type`, `payload`, `current_stage` and `reject_reason`
    (team.tsx shows the payload detail and the rejection note). The signed letter HTML is dropped:
    it is a document, not a request field, and `/letters/{id}/html` serves it.
    """
    out = canonical._workflow_out(db, row)
    payload = dict(row.get("payload") or {})
    payload.pop("letter_html", None)
    out.update({"request_type": row["request_type"], "payload": payload,
                "current_stage": row["current_stage"], "reject_reason": out.get("rejection_reason"),
                "submitted_by_employee_id": row.get("submitted_by_employee_id"),
                "escalated_from": row.get("escalated_from"), "returned_at": row.get("returned_at"),
                "return_note": row.get("return_note"), "updated_at": row.get("updated_at")})
    return out


@router.get("/me/manager-perms")
def my_manager_perms(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """Whether the signed-in employee manages anyone and what HR lets them do.

    `perms` is the effective set: stored values over the defaults, with `view_team_salary` off
    unless HR turned the team-salary setting on too. Someone who manages nobody gets every key
    `false` (their `ariba_mgr_my_perms`), so the app can render the screen without a second call.
    """
    me = actor.get("employee_id")
    team = team_scope.team_ids(db, me)
    return {"is_manager": bool(team), "team_count": len(team),
            "perms": team_scope.effective_perms(db, me) if team else {k: False for k in team_scope.MANAGER_PERM_KEYS}}


@router.get("/me/team/requests")
def my_team_requests(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """My team's requests and where each one stands (`view_team_requests`), newest first."""
    me = actor.get("employee_id")
    ids = team_scope.team_ids(db, me)
    if not ids or not team_scope.effective_perms(db, me)["view_team_requests"]:
        raise ApiError(403, "forbidden", "ليست لديك صلاحية رؤية طلبات الفريق")
    rows = canonical._rows(db, """SELECT * FROM public.workflow_requests
        WHERE employee_id = ANY(:ids) AND request_type NOT LIKE 'template:%'
        ORDER BY created_at DESC LIMIT 300""", ids=ids)
    return [request_out(db, row) for row in rows]


@router.post("/me/team/{employee_id}/requests", status_code=201)
def submit_for(employee_id: str, body: dict[str, Any], request: Request,
               actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """Submit a request for a direct report who delegated me (`submit_for_team`).

    Three gates before a row is written, each a different reason HR would want to see: not my
    report, HR did not grant `submit_for_team`, or the report never switched the delegation on.
    `RequestInput` adds a fourth: a body that names another employee is refused too.
    """
    me = actor.get("employee_id")
    if not me:
        raise ApiError(404, "not_found", "Employee not found")
    if not team_scope.is_manager_of(db, me, employee_id):
        raise ApiError(403, "forbidden", "ليست لديك صلاحية على هذا الموظف")
    if not team_scope.effective_perms(db, me)["submit_for_team"]:
        raise ApiError(403, "forbidden", "لم تفعّل الموارد البشرية تقديم الطلبات بالنيابة عن فريقك")
    if not team_scope.delegation_active(db, employee_id, me):
        raise ApiError(403, "not_delegated", "الموظف لم يفعّل تفويضك لتقديم الطلبات بالنيابة عنه")
    emp = canonical._row(db, f"SELECT {canonical._EMPLOYEE_COLUMNS} FROM {canonical._EMPLOYEE_FROM} WHERE d.employee_id=:e",
                         e=employee_id)
    if not emp:
        raise ApiError(404, "not_found", "Employee not found")
    manager = canonical._row(db, "SELECT employee_id,name_ar FROM public.employee_directory WHERE employee_id=:m",
                             m=me) or {"employee_id": me, "name_ar": actor.get("name_ar")}
    row = _create_on_behalf(db, actor, employee_id, emp, body, manager)
    canonical._write_audit(db, actor, request, "workflow", "submit_for", "workflow_request", row["id"],
                           details={"type": row["request_type"], "employee_id": employee_id})
    db.commit()
    return request_out(db, row)


def _create_on_behalf(db: Session, actor: dict[str, Any], employee_id: str, emp: dict[str, Any],
                      body: dict[str, Any], manager: dict[str, Any]) -> dict[str, Any]:
    """Write the request for `employee_id` and move it past the manager stage.

    The payload is validated exactly as `POST /me/requests` validates it for the same type (same
    messages, same balance check), and it is stamped `submitted_from: manager_app` with the real
    manager — never with whatever the body claims.
    """
    form = RequestInput(body, owner=employee_id)  # a body naming another employee is refused here
    t = form.type
    canonical._require_lookup(db, "workflow_request_types", t, "request type")
    if t not in ON_BEHALF_TYPES:
        raise ApiError(422, "invalid_request", "لا يمكن تقديم هذا النوع بالنيابة عن الموظف")
    notes = form.notes
    bad = lambda message: ApiError(422, "invalid_request", message)  # noqa: E731
    payload: dict[str, Any] = {"notes": notes}
    if t in canonical.LEAVE_FORM_TYPES:
        canonical._require_lookup(db, "leave_types", t, "leave type")
        first, last = cdata._d(form.text("from_date", "from")), cdata._d(form.text("to_date", "to"))
        if not first or not last or last < first:
            raise bad("حدد الفترة بشكل صحيح")
        if t == "unpaid" and not notes:  # the composer marks the reason mandatory for unpaid leave
            raise bad("اكتب سبب الإجازة بدون راتب")
        views = cdata.employees(db, employee_id=employee_id)
        if not views:
            raise ApiError(404, "not_found", "Employee not found")
        book = cdata.leave_book(db, today_riyadh(), views)
        days = book.count_workdays(first, last) if t == "annual" else (last - first).days + 1
        if t == "annual" and days > book.current(views[0]):
            raise ApiError(422, "exceeds_balance", "يتجاوز الرصيد المتاح")
        payload.update({"from": first.isoformat(), "to": last.isoformat(), "days": days})
    else:  # salary_advance, the only non-leave type the on-behalf screen offers
        amount = form.number("amount")
        if amount <= 0:
            raise bad("أدخل مبلغ السلفة")
        if not notes:  # the composer marks the reason mandatory for a salary advance
            raise bad("اكتب سبب طلب الراتب المقدم")
        payload["amount"] = amount
        if form.number("days") > 0:
            payload["days"] = int(form.number("days"))
    payload.update({"submitted_from": "manager_app", "submitted_at": datetime.now(UTC).isoformat(),
                    "submitted_by_manager": manager.get("employee_id") or actor.get("employee_id"),
                    "submitted_by_name": manager.get("name_ar")})
    manager_id = emp.get("manager_id") or None
    stages = canonical._stages(db, t, bool(manager_id))
    for configured in stages:  # the request cannot land on a stage nobody can sign
        if configured in {"hr", "ceo"}:
            canonical._require_stage_approver(db, configured)
    stage = stages[0]
    covered = stage == "manager"  # the manager's own submission is their approval
    if covered:
        stage = stages[1] if len(stages) > 1 else "completed"
    row = canonical._row(db, """INSERT INTO public.workflow_requests(employee_id,request_type,payload,current_stage,submitted_by_employee_id)
        VALUES(:eid,:type,CAST(:payload AS jsonb),:stage,:by) RETURNING *""",
                         eid=employee_id, type=t, payload=json.dumps(payload, ensure_ascii=False),
                         stage=stage, by=actor.get("employee_id"))
    comment = f"قدّمه بالنيابة: {manager.get('name_ar') or manager.get('employee_id')}"
    db.execute(text("""INSERT INTO public.workflow_actions(request_id,actor_account_id,stage,action,comment)
        VALUES(:rid,:account,'employee','submitted',:comment)"""),
               {"rid": row["id"], "account": actor.get("account_id"), "comment": comment})
    if covered:
        db.execute(text("""INSERT INTO public.workflow_actions(request_id,actor_account_id,stage,action,comment)
            VALUES(:rid,:account,'manager','approved',:c)"""),
                   {"rid": row["id"], "account": actor.get("account_id"),
                    "c": "قدّمه المدير المباشر بالنيابة عن الموظف"})
    if stage == "completed":  # only when the chain is the manager stage alone
        db.execute(text("UPDATE public.workflow_requests SET completed_at=now(),updated_at=now() WHERE id=:r"),
                   {"r": row["id"]})
        row = dict(row, current_stage="completed")
    if t in canonical.LEAVE_FORM_TYPES:  # the leave screens and the balance read this table
        start = cdata._d(payload.get("from"))
        db.execute(text("""INSERT INTO public.leave_requests(employee_id,leave_type,from_date,to_date,days,notes,workflow_request_id)
            VALUES(:eid,:type,:f,:t,:days,:notes,:rid)"""),
                   {"eid": employee_id, "type": t, "f": start, "t": cdata._d(payload.get("to")) or start,
                    "days": max(1, int(payload.get("days") or 1)), "notes": notes, "rid": row["id"]})
    _notify_on_behalf(db, row, emp, stage, manager)
    return row


def _notify_on_behalf(db: Session, row: dict[str, Any], emp: dict[str, Any], stage: str,
                      manager: dict[str, Any]) -> None:
    """Who hears about a request submitted on someone's behalf, and what they are told."""
    eid, rid, t = row["employee_id"], row["id"], row["request_type"]
    who = manager.get("name_ar") or manager.get("employee_id")
    label = TYPE_AR.get(t, t)
    if stage == "completed":
        canonical._insert_notification(db, eid, rid, "تمت الموافقة النهائية",
                                       "تمت الموافقة على طلبك بالكامل", "employee", "decision")
    else:
        canonical._notify_stage(db, dict(row, current_stage=stage), stage)
    canonical._insert_notification(db, eid, rid, "قُدّم طلب بالنيابة عنك",
                                   f"قدّم {who} طلب {label} بالنيابة عنك", "employee", "workflow")
    for hr in canonical._stage_people(db, "hr"):
        canonical._insert_notification(db, hr, rid, "طلب مقدّم بالنيابة",
                                       f"قدّمه {who} بالنيابة عن {emp.get('name_ar') or eid}", "hr", "request")


# ---------------------------------------------------------------- delegation
@router.get("/me/delegation")
def my_delegation(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """My direct manager and whether I let them submit requests on my behalf."""
    eid = actor.get("employee_id")
    emp = canonical._row(db, "SELECT manager_id FROM public.employee_directory WHERE employee_id=:e", e=eid) or {}
    manager_id = emp.get("manager_id")
    if not manager_id:
        return {"manager_id": None, "manager_name": None, "active": False}
    manager = canonical._row(db, "SELECT name_ar FROM public.employee_directory WHERE employee_id=:m", m=manager_id) or {}
    return {"manager_id": manager_id, "manager_name": manager.get("name_ar"),
            "active": team_scope.delegation_active(db, eid, manager_id)}


@router.put("/me/delegation")
def set_delegation(body: dict[str, Any], request: Request,
                   actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """Switch my delegation on or off. It always points at my current direct manager."""
    eid = actor.get("employee_id")
    emp = canonical._row(db, "SELECT manager_id FROM public.employee_directory WHERE employee_id=:e", e=eid) or {}
    manager_id = emp.get("manager_id")
    if not manager_id:
        raise ApiError(409, "no_manager", "لا يوجد مدير مباشر")
    active = bool(body.get("active"))
    db.execute(text("""INSERT INTO public.ariba_delegations(employee_id,manager_id,active,updated_at)
        VALUES(:e,:m,:a,now())
        ON CONFLICT(employee_id) DO UPDATE SET manager_id=EXCLUDED.manager_id,active=EXCLUDED.active,updated_at=now()"""),
               {"e": eid, "m": manager_id, "a": active})
    canonical._insert_notification(db, manager_id, None, "تفويض من موظف" if active else "إلغاء تفويض",
                                   f"{actor.get('name_ar') or eid} "
                                   f"{'فوّضك بتقديم طلباته بالنيابة عنه' if active else 'ألغى تفويضك'}",
                                   "manager", "info")
    canonical._write_audit(db, actor, request, "workflow", "delegation", "employee", eid, details={"active": active})
    db.commit()
    return {"active": active}


# ---------------------------------------------------------------- HR: who may do what
@router.get("/settings/manager-perms")
def list_manager_perms(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """Every direct manager with their team size and effective permissions (`perms` per key).

    `team_salary_visible` is returned next to the per-manager flags because HR has to see both:
    a manager may hold `view_team_salary` while the company-wide setting still hides the salary.
    """
    canonical._perm(actor, ("settings", "permissions"))
    rows = canonical._rows(db, """SELECT m.employee_id,m.name_ar,jt.name AS job,count(t.employee_id) AS team,p.perms
        FROM public.employee_directory m
        JOIN public.employee_directory t ON t.manager_id=m.employee_id AND t.active
        LEFT JOIN public.job_titles jt ON jt.id=m.job_title_id
        LEFT JOIN public.ariba_manager_perms p ON p.manager_id=m.employee_id
        WHERE m.active
        GROUP BY m.employee_id,m.name_ar,jt.name,p.perms
        ORDER BY m.name_ar""")
    return {"managers": [{"manager_id": r["employee_id"], "name": r["name_ar"], "job": r["job"],
                          "team": int(r["team"] or 0), "perms": team_scope.merge_perms(r.get("perms"))}
                         for r in rows],
            "team_salary_visible": team_scope.team_salary_visible(db),
            "perm_keys": list(team_scope.MANAGER_PERM_KEYS),
            "default_on": sorted(team_scope.MANAGER_PERMS_DEFAULT_ON)}


@router.put("/settings/manager-perms/{manager_id}")
def set_manager_perms(manager_id: str, body: dict[str, Any], request: Request,
                      actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """Grant / revoke a manager's permissions. Only the keys in the body change."""
    canonical._perm(actor, "settings", "edit")
    if not canonical._row(db, "SELECT employee_id FROM public.employee_directory WHERE employee_id=:m", m=manager_id):
        raise ApiError(404, "not_found", "Employee not found")
    source = body.get("perms") if isinstance(body.get("perms"), dict) else body
    updates = {key: bool(value) for key, value in source.items() if key in team_scope.MANAGER_PERM_KEYS}
    if not updates:
        raise ApiError(422, "invalid_request", "لا توجد صلاحيات محددة")
    effective = team_scope.save_perms(db, manager_id, updates, actor.get("username"))
    canonical._write_audit(db, actor, request, "permissions", "manager_perms", "employee", manager_id, details=updates)
    db.commit()
    return {"manager_id": manager_id, "perms": effective}


@router.get("/settings/team-salary")
def get_team_salary(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """Whether managers may see the team's salary (`false` until HR turns it on)."""
    canonical._perm(actor, ("settings", "permissions"))
    return {"visible": team_scope.team_salary_visible(db)}


@router.put("/settings/team-salary")
def set_team_salary(body: dict[str, Any], request: Request,
                    actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """Turn the team's salary on or off for every manager whose `view_team_salary` is granted."""
    canonical._perm(actor, "settings", "edit")
    visible = team_scope.set_team_salary_visible(db, bool(body.get("visible")), actor.get("username"))
    canonical._write_audit(db, actor, request, "settings", "update", "ariba_app_settings",
                           team_scope.TEAM_SALARY_SETTING, details={"visible": visible})
    db.commit()
    return {"visible": visible}
