"""The goals tab and the team-goals screen (Stage 3 of the employee-app port).

The seven calls `frontend/employee-app/src/lib/port.ts` makes, and who may make each:

    GET    /me/goals                                goals.mine()             anyone, own only
    GET    /targets?employee_id=&year=              goals.targets()          self, their manager, HR
    POST   /targets                                 goals.saveTarget()       their manager w/ manage_targets, HR
    DELETE /targets/{id}                            goals.deleteTarget()     the same two
    GET    /evaluations/{employee_id}/{type}/{key}  goals.evaluation()       the evaluator, the approver, HR
    PUT    /evaluations/{employee_id}/{type}/{key}  goals.saveEvaluation()   the evaluator only
    POST   /evaluations/{id}/approve                goals.approve()          the configured approver

The rules - periods, formulas, the privacy matrix, who signs - live in `app/services/goals.py`; this
module turns them into refusals and side effects. Three things are worth naming here:

* **The answer shapes are the app's**, not the table's: `{targets}`, `{target}`, `{evaluation}`,
  `{evaluation, targets, can_approve}`, `{ok}`. The screens read nothing else.
* **Every refusal is one of the documented two**: `403 FORBIDDEN` for a person the caller may not act
  for, `404` for a row (or a stage of a row) that is not theirs to see - so a `404` never confirms
  that the id exists (P5).
* **Every write is audited and notified** (P8): one `ariba_audit_log` row per write with the ids and
  the period, never the content, and a bell entry for whoever has to act next - never for the employee
  before a signature lands, since a "pending" entry would announce the row P1 hides.
"""

from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.database import get_db
from app.routers import canonical
from app.services import goals

router = APIRouter()

#: The app's `MONTHS` (`src/lib/goals.ts`), for the notification bodies.
MONTHS_AR = ("يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر",
             "أكتوبر", "نوفمبر", "ديسمبر")


def period_label(period_type: str, period_key: str) -> str:
    """The app's `keyLabel`: «سنة 2026», «الربع 2 / 2026», «مارس 2026» - a validated key only."""
    if period_type == "annual":
        return "سنة " + period_key
    if period_type == "quarterly":
        return "الربع " + period_key[-1] + " / " + period_key[:4]
    return MONTHS_AR[int(period_key[5:]) - 1] + " " + period_key[:4]


def _employee_id(actor: dict[str, Any]) -> str:
    employee_id = actor.get("employee_id")
    if not employee_id:
        raise ApiError(404, "not_found", "Employee not found")
    return str(employee_id)


# ---------------------------------------------------------------- the goals tab
@router.get("/me/goals")
def my_goals(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """My targets and my **approved** evaluations - no employee id, no other employee (P1)."""
    return goals.my_goals(db, _employee_id(actor))


# ---------------------------------------------------------------- targets
@router.get("/targets")
def list_targets(employee_id: str = Query(...), year: str | None = Query(None),
                 actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """One employee's targets for a year (`year` is a prefix: the screen filters by period)."""
    if year and not re.match(r"^\d{4}$", year):
        raise ApiError(422, "invalid_request", "السنة غير صحيحة")
    if not goals.can_read_targets(db, actor, employee_id):
        raise ApiError(403, "forbidden", goals.FORBIDDEN)
    return {"targets": [goals.target_out(row) for row in goals.list_targets(db, employee_id, year)]}


@router.post("/targets")
def save_target(body: dict[str, Any], request: Request,
                actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """Create a target, or edit the one the body's `id` names (`goals.saveTarget` does both)."""
    target = goals.clean_target(body)
    if not goals.can_write_targets(db, actor, target["employee_id"]):
        raise ApiError(403, "forbidden", goals.FORBIDDEN)
    if not goals.employee_exists(db, target["employee_id"]):
        raise ApiError(404, "not_found", "Employee not found")
    created = target["id"] is None
    row = goals.save_target(db, actor.get("employee_id"), target)
    if created:                      # an edit does not re-announce a target the employee has seen
        canonical._insert_notification(db, target["employee_id"], None, "أضاف مديرك مستهدفاً",
                                       f"{row['title']} - {period_label(row['period_type'], row['period_key'])}",
                                       "employee", "goals")
    canonical._write_audit(db, actor, request, "goals", "target_create" if created else "target_update",
                           "employee", target["employee_id"],
                           details={"target_id": str(row["id"]), "period_type": row["period_type"],
                                    "period_key": row["period_key"]})
    db.commit()
    return {"target": goals.target_out(row)}


@router.delete("/targets/{target_id}")
def delete_target(target_id: str, request: Request,
                  actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """Delete a target. Somebody who may not touch it gets the answer an unknown id gets (`404`)."""
    row = goals.get_target(db, target_id)
    if row is None:
        raise ApiError(404, "not_found", "Target not found")
    if not goals.can_write_targets(db, actor, str(row["employee_id"])):
        raise ApiError(404, "not_found", "Target not found")
    goals.delete_target(db, row)
    canonical._insert_notification(db, str(row["employee_id"]), None, "حذف مديرك مستهدفاً",
                                   f"{row['title']} - {period_label(row['period_type'], row['period_key'])}",
                                   "employee", "goals")
    canonical._write_audit(db, actor, request, "goals", "target_delete", "employee",
                           str(row["employee_id"]),
                           details={"target_id": str(row["id"]), "period_type": row["period_type"],
                                    "period_key": row["period_key"]})
    db.commit()
    return {"ok": True}

# ---------------------------------------------------------------- evaluations
@router.get("/evaluations/{employee_id}/{period_type}/{period_key}")
def read_evaluation(employee_id: str, period_type: str, period_key: str, request: Request,
                    actor: dict[str, Any] = Depends(canonical.current_actor),
                    db: Session = Depends(get_db)):
    """The evaluation of one period, with the targets it scores and whether I may sign it.

    The ladder is `goals.evaluation_access`: the evaluator sees their draft, the approver sees a
    submitted or approved row, HR sees an approved one - anything else is `404`, so the answer never
    confirms that a draft exists. `targets` is filled only for a caller who may read the employee's
    targets at all (the evaluator and HR; the approver gets `[]`, and `/targets` refuses them).
    """
    period_type, period_key = goals.require_period(period_type, period_key)
    access = goals.evaluation_access(db, actor, employee_id)
    if access is None:
        raise ApiError(403, "forbidden", goals.FORBIDDEN)
    row = goals.get_evaluation(db, employee_id, period_type, period_key)
    if access != "manager" and (row is None or row["status"] == "draft"
                                or (access == "hr" and row["status"] != "approved")):
        raise ApiError(404, "not_found", "Evaluation not found")
    targets = [goals.target_out(target) for target in
               goals.period_targets(db, employee_id, period_type, period_key)] \
        if goals.can_read_targets(db, actor, employee_id) else []
    answer = {"evaluation": goals.evaluation_out(row) if row else None, "targets": targets,
              "can_approve": bool(row and goals.may_approve(db, actor, row))}
    if row is not None and access in ("approver", "hr"):
        # A read is recorded too, not only a write: this is somebody opening an evaluation they did
        # not write, and a signature is worth nothing without knowing who looked at it first. The
        # audit row carries the ids and the period, never the items or the comments.
        canonical._write_audit(db, actor, request, "goals", "evaluation_read", "employee",
                               employee_id, details={"evaluation_id": str(row["id"]),
                                                     "period_type": period_type,
                                                     "period_key": period_key})
        db.commit()
    return answer


@router.put("/evaluations/{employee_id}/{period_type}/{period_key}")
def save_evaluation(employee_id: str, period_type: str, period_key: str, body: dict[str, Any],
                    request: Request, actor: dict[str, Any] = Depends(canonical.current_actor),
                    db: Session = Depends(get_db)):
    """Save the evaluator's draft, or submit it for the signature (`{items, comments, submit}`).

    `overall`/`rating` in the body are ignored - `goals.save_evaluation` computes them. Submitting
    tells the people who may sign and nobody else; saving a draft tells nobody. The employee's bell
    stays quiet until the signature lands, because a "pending" entry would announce a row that
    `/me/goals` hides (P1).
    """
    period_type, period_key = goals.require_period(period_type, period_key)
    if not goals.can_write_evaluation(db, actor, employee_id):
        raise ApiError(403, "forbidden", goals.FORBIDDEN)
    items = goals.clean_items(body.get("items"))
    comments = (str(body.get("comments")).strip() or None) if body.get("comments") else None
    submit = bool(body.get("submit"))
    existing = goals.get_evaluation(db, employee_id, period_type, period_key)
    if existing and existing["status"] == "approved":
        raise ApiError(409, "locked", "اعتُمد هذا التقييم نهائياً ولا يمكن تعديله")
    row = goals.save_evaluation(db, actor.get("employee_id"), employee_id, period_type, period_key,
                                items, comments, submit)
    label = period_label(period_type, period_key)
    if submit:
        # The employee is deliberately left out: a bell entry here would say that a pending evaluation
        # exists, which is exactly what P1 keeps off /me/goals. The row reaches the employee when it is
        # approved - the tab and the bell together (approve_evaluation, «اعتُمد تقييمك»).
        stage = goals.approver_stage(db)
        who = goals.employee_name(db, employee_id) or employee_id
        for approver in goals.approvers_of(db, stage, exclude=actor.get("employee_id")):
            canonical._insert_notification(db, approver, None, "تقييم بانتظار اعتمادك",
                                           f"{who} - {label}", stage, "goals")
    canonical._write_audit(db, actor, request, "goals",
                           "evaluation_submit" if submit else "evaluation_draft", "employee",
                           employee_id, details={"period_type": period_type, "period_key": period_key,
                                                 "evaluation_id": str(row["id"]), "items": len(items)})
    db.commit()
    return {"evaluation": goals.evaluation_out(row)}


@router.post("/evaluations/{evaluation_id}/approve")
def approve_evaluation(evaluation_id: str, request: Request,
                       actor: dict[str, Any] = Depends(canonical.current_actor),
                       db: Session = Depends(get_db)):
    """Sign a submitted evaluation (`goals.approve(id)` - the id is the evaluation's, not a person's).

    The refusals are the whole rule: the employee the evaluation is about and the evaluator who wrote
    it are `403` even when they hold the approver's role (nobody signs their own work), a caller who
    may not see the row gets the `404` an unknown id gets, HR gets `403` because it can see approved
    rows and therefore knows this one exists, and a stage that resolves to nobody is `409 no_approver`
    rather than a signature by whoever happens to be around.
    """
    row = goals.get_evaluation_by_id(db, evaluation_id)
    if row is None:
        raise ApiError(404, "not_found", "Evaluation not found")
    me = actor.get("employee_id")
    if me and (me == str(row["employee_id"]) or me == str(row.get("evaluator_id") or "")):
        raise ApiError(403, "forbidden", "لا يمكنك اعتماد تقييمك بنفسك")
    stage = goals.approver_stage(db)
    people = goals.approvers_of(db, stage, exclude=row.get("evaluator_id"))
    if not people:
        raise ApiError(409, "no_approver", "لا يوجد معتمد لهذه المرحلة")
    if not me or me not in people:
        if goals.is_hr(actor):
            raise ApiError(403, "forbidden", "لا تملك صلاحية اعتماد التقييمات")
        raise ApiError(404, "not_found", "Evaluation not found")
    if row["status"] == "approved":
        raise ApiError(409, "locked", "اعتُمد هذا التقييم نهائياً")
    if row["status"] != "pending":
        raise ApiError(409, "not_pending", "لم يُرسَل التقييم للاعتماد بعد")
    approved = goals.approve_evaluation(db, me, row)
    if approved is None:                      # somebody signed it between the read and the write
        raise ApiError(409, "locked", "اعتُمد هذا التقييم نهائياً")
    label = period_label(approved["period_type"], approved["period_key"])
    overall = approved.get("overall")
    result = f"{float(overall):g}% - {approved.get('rating')}" if overall is not None else "-"
    canonical._insert_notification(db, str(approved["employee_id"]), None, "اعتُمد تقييمك",
                                   f"{label}: {result}", "employee", "goals")
    evaluator = approved.get("evaluator_id")
    if evaluator and str(evaluator) != str(approved["employee_id"]):
        name = goals.employee_name(db, str(approved["employee_id"])) or approved["employee_id"]
        canonical._insert_notification(db, str(evaluator), None, "اعتُمد التقييم الذي أرسلته",
                                       f"{name} - {label}", "employee", "goals")
    canonical._write_audit(db, actor, request, "goals", "evaluation_approve", "employee",
                           str(approved["employee_id"]),
                           details={"evaluation_id": str(approved["id"]),
                                    "period_type": approved["period_type"],
                                    "period_key": approved["period_key"]})
    db.commit()
    return {"ok": True}
