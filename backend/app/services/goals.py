"""Goals, targets and evaluations (Stage 3 of the employee-app port).

Two screens: the **goals tab** (`GET /me/goals`) and **team-goals** (`/targets`, `/evaluations/...`).
The period keys, the progress bar and the rating bands are the app's own
(`frontend/employee-app/src/lib/goals.ts`), so this module stores exactly what those screens show
and recomputes the two numbers the client must not be trusted with.

Four rules this module owns (docs/BUSINESS_RULES.md, "Goals, targets and evaluations"):

* **The client's `overall`/`rating` are ignored.** `overall = sum(score_i * w_i) / sum(w_i)`, one
decimal, with an item weight of `0` or a blank counting as `1` (the app's own `|| 1`); `rating` is
the app's five bands over that number. Rounding is half-up, like `Math.round`, not Python's `round`
(which rounds halves to even and would show 82.2 where the screen shows 82.3).
* **A draft belongs to its evaluator.** Visibility is a ladder - the evaluator, then the configured
approver (pending + approved), then HR (approved only) - and the employee only ever reads their own
*approved* rows through `/me/goals`. A pending evaluation is not returned to the employee at all,
not even as a count (P1/P2).
* **Nobody signs their own evaluation.** The approver set is the stage's `workflow_approvers` rows
plus the holders of the stage's roles, minus the evaluator. A stage that resolves to nobody refuses
with `409 no_approver` instead of falling back to somebody.
* **Delegation is not a key here** (P4). No function in this module reads `ariba_delegations`:
`submit_for_team` and the goals rights are separate decisions, and a delegation row naming someone
who is not the direct manager opens nothing.

Refusals keep Stage 2's shape: naming a *person* the caller may not act for is `403 forbidden`
(`FORBIDDEN`, the same Arabic sentence the team screen shows); naming a *row* the caller may not see
- `DELETE /targets/{id}`, `POST /evaluations/{id}/approve` from someone who cannot see it, a draft
read by an approver - is `404 not_found`, the same answer as an id that does not exist (P5). The one
exception is an employee naming their *own* evaluation: the row is theirs, so the answer is `403`.
"""

from __future__ import annotations

import json
import math
import re
from datetime import date, datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.services import team_scope

#: The three periods the screens offer, and the shape each `period_key` must have (the schema's own
#: `ariba_targets_period_key_check`, spelled per period so a monthly key cannot pass as a year).
PERIOD_TYPES = ("annual", "quarterly", "monthly")
PERIOD_SHAPE = {"annual": re.compile(r"^\d{4}$"),
                "quarterly": re.compile(r"^\d{4}-Q[1-4]$"),
                "monthly": re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")}
TARGET_STATUSES = ("active", "done")

#: `ariba_app_settings["goals_config"].evaluation_approver` - the Stage 3 twin of
#: `workflow_config.final_by_type`: the setting wins, an unknown value is ignored (so a typo cannot
#: invent a stage), and a missing setting means HR.
GOALS_SETTING = "goals_config"
APPROVER_KEY = "evaluation_approver"
APPROVER_STAGES = ("hr", "ceo")
DEFAULT_APPROVER = "hr"
#: The roles that hold each stage - the same resolution `routers/canonical.py` uses for an override.
STAGE_ROLES = {"hr": ("hr", "admin", "admin_manager"), "ceo": ("ceo",)}
#: The roles that administer targets (they may read and write targets, never write an evaluation).
HR_ROLES = ("hr", "admin", "admin_manager")

#: The app's `ratingOf`, in order.
RATINGS = ((90, "ممتاز"), (75, "جيد جداً"), (60, "جيد"), (50, "مقبول"))
LOWEST_RATING = "ضعيف"

#: The person-scoped refusal (`403`), word for word what the team screen already shows.
FORBIDDEN = "ليست لديك صلاحية على هذا الموظف"


# ---------------------------------------------------------------- rows
def _rows(db: Session, sql: str, **params: Any) -> list[dict[str, Any]]:
    return [dict(row) for row in db.execute(text(sql), params).mappings().all()]


def _row(db: Session, sql: str, **params: Any) -> dict[str, Any] | None:
    row = db.execute(text(sql), params).mappings().first()
    return dict(row) if row else None


def _invalid(message: str) -> ApiError:
    return ApiError(422, "invalid_request", message)


def _stamp(value: Any) -> str | None:
    return value.isoformat() if isinstance(value, (datetime, date)) else None


def _plain(value: Any) -> float | None:
    """A numeric column as a JSON number (`Decimal` is not what the app's types read)."""
    return None if value is None else float(value)


def _round_half_up(value: float, digits: int = 0) -> float:
    """`Math.round`'s half-up rounding (Python's `round` would round 82.25 down to 82.2)."""
    factor = 10 ** digits
    return math.floor(value * factor + 0.5) / factor

# ---------------------------------------------------------------- the shapes the app reads
def target_out(row: dict[str, Any]) -> dict[str, Any]:
    """One target in the shape `port.ts` `Target` declares - nothing more, nothing less."""
    return {"id": str(row["id"]), "employee_id": str(row["employee_id"]),
            "period_type": row["period_type"], "period_key": row["period_key"],
            "title": row["title"], "description": row.get("description"), "unit": row.get("unit"),
            "target_value": _plain(row.get("target_value")),
            "actual_value": _plain(row.get("actual_value")),
            "weight": _plain(row.get("weight")) or 1.0, "status": row["status"]}


def _items_of(row: dict[str, Any]) -> list[dict[str, Any]]:
    items = row.get("items")
    if isinstance(items, str):          # a driver that returns jsonb as text
        items = json.loads(items)
    return list(items) if isinstance(items, list) else []


def evaluation_out(row: dict[str, Any]) -> dict[str, Any]:
    """One evaluation in the shape `port.ts` `Evaluation` declares, plus the two stamps."""
    return {"id": str(row["id"]), "employee_id": str(row["employee_id"]),
            "period_type": row["period_type"], "period_key": row["period_key"],
            "items": _items_of(row), "comments": row.get("comments"),
            "overall": _plain(row.get("overall")), "rating": row.get("rating"),
            "status": row["status"], "submitted_at": _stamp(row.get("submitted_at")),
            "approved_at": _stamp(row.get("approved_at"))}

# ---------------------------------------------------------------- the two formulas
def overall_of(items: list[dict[str, Any]]) -> float | None:
    """`sum(score*weight) / sum(weight)` to one decimal - the app's `overallOf`."""
    total = sum(float(item.get("weight") or 1) for item in items)
    if not total:
        return None
    weighted = sum(float(item.get("score") or 0) * float(item.get("weight") or 1) for item in items)
    return _round_half_up(weighted / total, 1)


def rating_of(overall: float | None) -> str | None:
    """The app's five bands over the overall score."""
    if overall is None:
        return None
    for floor, label in RATINGS:
        if overall >= floor:
            return label
    return LOWEST_RATING


# ---------------------------------------------------------------- validation
def require_period(period_type: Any, period_key: Any) -> tuple[str, str]:
    """The period pair, or `422` - a type outside the three, or a key not shaped for it."""
    kind, key = str(period_type or ""), str(period_key or "")
    if kind not in PERIOD_TYPES:
        raise _invalid("نوع الفترة غير مدعوم")
    if not PERIOD_SHAPE[kind].match(key):
        raise _invalid("مفتاح الفترة لا يطابق نوعها")
    return kind, key

def _number(value: Any, message: str) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise _invalid(message)
    try:
        return float(value)
    except (TypeError, ValueError):
        raise _invalid(message) from None


def _text(value: Any) -> str | None:
    return (str(value).strip() or None) if value not in (None, "") else None


def clean_target(body: Any) -> dict[str, Any]:
    """A `POST /targets` body as the columns it writes, or `422`.

    The body the app sends is `{target: {...}}` (`port.ts` `saveTarget`); a flat body is accepted
    too, the way `PUT /settings/manager-perms` accepts one. An `id` means *edit that row* - the same
    call the screen makes from its edit button, with `employee_id` still naming whose row it is.
    """
    target = body.get("target") if isinstance(body, dict) and isinstance(body.get("target"), dict) else body
    if not isinstance(target, dict):
        raise _invalid("لا يوجد مستهدف في الطلب")
    employee_id = str(target.get("employee_id") or "").strip()
    if not employee_id:
        raise _invalid("الموظف مطلوب")
    period_type, period_key = require_period(target.get("period_type"), target.get("period_key"))
    title = str(target.get("title") or "").strip()
    if not title:
        raise _invalid("عنوان المستهدف مطلوب")
    target_value = _number(target.get("target_value"), "القيمة المستهدفة غير رقمية")
    if target_value is not None and target_value < 0:
        raise _invalid("القيمة المستهدفة لا تكون سالبة")
    weight = _number(target.get("weight"), "الوزن غير رقمي")
    weight = 1.0 if weight is None else weight      # blank -> 1, an explicit 0 is refused
    if weight <= 0:
        raise _invalid("الوزن يجب أن يكون أكبر من صفر")
    status = str(target.get("status") or "active")
    if status not in TARGET_STATUSES:
        raise _invalid("حالة المستهدف غير مدعومة")
    return {"id": str(target["id"]) if target.get("id") else None, "employee_id": employee_id,
            "period_type": period_type, "period_key": period_key, "title": title,
            "description": _text(target.get("description")), "unit": _text(target.get("unit")),
            "target_value": target_value,
            "actual_value": _number(target.get("actual_value"), "القيمة المنجزة غير رقمية"),
            "weight": weight, "status": status}

def clean_items(raw: Any) -> list[dict[str, Any]]:
    """The evaluation's items as they are stored, or `422`.

    An empty list is refused (an evaluation of nothing is not an evaluation), a blank title or a
    score outside 0-100 is refused, and an item weight of `0` or a blank becomes `1` - the app's own
    `Number(weight) || 1`, so both sides weigh an item the same way.
    """
    if not isinstance(raw, list) or not raw:
        raise _invalid("التقييم يحتاج بنداً واحداً على الأقل")
    items: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            raise _invalid("بند التقييم غير مقروء")
        title = str(item.get("title") or "").strip()
        if not title:
            raise _invalid("عنوان البند مطلوب")
        score = _number(item.get("score"), "درجة البند غير رقمية")
        if score is None:
            raise _invalid("درجة البند مطلوبة")
        if not 0 <= score <= 100:
            raise _invalid("درجة البند يجب أن تكون بين 0 و100")
        items.append({"target_id": str(item["target_id"]) if item.get("target_id") else None,
                      "title": title,
                      "target": _number(item.get("target"), "القيمة المستهدفة للبند غير رقمية"),
                      "unit": _text(item.get("unit")),
                      "actual": _number(item.get("actual"), "القيمة المنجزة للبند غير رقمية"),
                      "weight": _number(item.get("weight"), "وزن البند غير رقمي") or 1.0,
                      "score": score, "comment": str(item.get("comment") or "").strip(),
                      "manual": bool(item.get("manual"))})
    return items

# ---------------------------------------------------------------- who may do what
def is_hr(actor: dict[str, Any]) -> bool:
    """The Stage 2 administration set: HR, an admin, or an admin-manager."""
    return actor.get("role") in HR_ROLES


def _manages(db: Session, actor: dict[str, Any], employee_id: str) -> dict[str, bool] | None:
    """The actor's effective permissions when this employee reports to them, else `None`.

    Two guards matter here: `employee_id` can never be the actor (own goals are read-only - nobody
    writes their own targets or evaluation), and being somebody's manager is not enough on its own;
    the specific permission still has to be granted.
    """
    me = actor.get("employee_id")
    if not me or me == employee_id:
        return None
    if not team_scope.is_manager_of(db, me, employee_id):
        return None
    return team_scope.effective_perms(db, me)


def can_read_targets(db: Session, actor: dict[str, Any], employee_id: str) -> bool:
    """Self, a direct manager holding `manage_targets` **or** `evaluate_team`, or HR."""
    if actor.get("employee_id") == employee_id:
        return True
    allowed = _manages(db, actor, employee_id)
    if allowed is not None:
        return bool(allowed["manage_targets"] or allowed["evaluate_team"])
    return is_hr(actor)


def can_write_targets(db: Session, actor: dict[str, Any], employee_id: str) -> bool:
    """A direct manager holding `manage_targets`, or HR - never the employee themselves."""
    allowed = _manages(db, actor, employee_id)
    if allowed is not None:
        return bool(allowed["manage_targets"])
    return is_hr(actor) and actor.get("employee_id") != employee_id

def evaluation_access(db: Session, actor: dict[str, Any], employee_id: str) -> str | None:
    """How this caller may read that employee's evaluation: `manager`, `approver`, `hr` or `None`.

    The ladder is the privacy matrix, in order: the employee themselves is refused outright (their
    own rows reach them through `/me/goals`, approved only - T7), the evaluator sees everything, the
    configured approver sees a submitted or approved row, and HR - when it is not the approver - sees
    an approved one. `None` is the `403 forbidden` the router raises.
    """
    me = actor.get("employee_id")
    if not me or me == employee_id:
        return None
    allowed = _manages(db, actor, employee_id)
    if allowed is not None and allowed["evaluate_team"]:
        return "manager"
    if me in approvers_of(db, approver_stage(db)):
        return "approver"
    if is_hr(actor):
        return "hr"
    return None


def can_write_evaluation(db: Session, actor: dict[str, Any], employee_id: str) -> bool:
    """Only the evaluator writes `items`/`comments` - HR and the approver never do (P7)."""
    return evaluation_access(db, actor, employee_id) == "manager"


# ---------------------------------------------------------------- the approver (data, not code)
def approver_stage(db: Session) -> str:
    """`goals_config.evaluation_approver` when it names a real stage, else HR (the default)."""
    row = _row(db, "SELECT value FROM public.ariba_app_settings WHERE key=:k", k=GOALS_SETTING)
    value = (row or {}).get("value")
    stage = value.get(APPROVER_KEY) if isinstance(value, dict) else None
    return stage if stage in APPROVER_STAGES else DEFAULT_APPROVER

def approvers_of(db: Session, stage: str, exclude: str | None = None) -> list[str]:
    """The people who may sign at that stage, without the evaluator.

    The same two sources `routers/canonical.py` trusts for an override: the stage's
    `workflow_approvers` rows and the holders of the stage's roles. `exclude` is the evaluation's
    evaluator - nobody signs their own work - and an empty answer is the router's `409 no_approver`.
    """
    people = {str(row["employee_id"]) for row in
              _rows(db, "SELECT employee_id FROM public.workflow_approvers WHERE stage=:s", s=stage)}
    people |= {str(row["employee_id"]) for row in _rows(db, (
        "SELECT employee_id FROM public.ariba_auth_accounts "
        "WHERE active AND employee_id IS NOT NULL AND role = ANY(:roles)"),
        roles=list(STAGE_ROLES.get(stage, ())))}
    return sorted(people - {str(exclude)} if exclude else people)


def may_approve(db: Session, actor: dict[str, Any], row: dict[str, Any]) -> bool:
    """Whether this caller may sign *this* evaluation right now (`can_approve` in the answer).

    The two exclusions are the point of the rule: the employee the evaluation is about and the
    evaluator who wrote it are never approvers, even when they hold the approver's role. The app
    only draws its approve button when `ev.status === "pending" && d.can_approve`.
    """
    me = actor.get("employee_id")
    if not me or row.get("status") != "pending":
        return False
    if me == str(row.get("employee_id")) or me == str(row.get("evaluator_id") or ""):
        return False
    return me in approvers_of(db, approver_stage(db), exclude=row.get("evaluator_id"))

# ---------------------------------------------------------------- the rows
UUID_SHAPE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def _uuid(value: Any) -> str | None:
    """A path segment as a uuid, or `None` - so a made-up id is a plain `404`, never a 500."""
    candidate = str(value or "")
    return candidate if UUID_SHAPE.match(candidate) else None


def list_targets(db: Session, employee_id: str, year: str | None = None) -> list[dict[str, Any]]:
    """That employee's targets - every period, or only the year the screen asked for.

    The screen passes `keyv.slice(0, 4)` as `year` (`port.ts` `goals.targets`) and then filters the
    answer by the exact `period_type`/`period_key`, so the year is a prefix, not an equality.
    """
    sql = "SELECT * FROM public.ariba_targets WHERE employee_id=:e"
    params: dict[str, Any] = {"e": employee_id}
    if year:
        sql += " AND period_key LIKE :y"
        params["y"] = f"{year}%"
    return _rows(db, sql + " ORDER BY period_key DESC, created_at DESC, title", **params)


def get_target(db: Session, target_id: Any) -> dict[str, Any] | None:
    key = _uuid(target_id)
    return _row(db, "SELECT * FROM public.ariba_targets WHERE id=:id", id=key) if key else None


def period_targets(db: Session, employee_id: str, period_type: str, period_key: str) -> list[dict[str, Any]]:
    """The targets one evaluation scores - the manager's form pre-fills itself from them."""
    return _rows(db, """SELECT * FROM public.ariba_targets
        WHERE employee_id=:e AND period_type=:t AND period_key=:k
        ORDER BY created_at, title""", e=employee_id, t=period_type, k=period_key)

def get_evaluation(db: Session, employee_id: str, period_type: str, period_key: str) -> dict[str, Any] | None:
    """The one evaluation of that employee's period (the schema keeps it unique)."""
    return _row(db, ("SELECT * FROM public.ariba_evaluations "
                     "WHERE employee_id=:e AND period_type=:t AND period_key=:k"),
                e=employee_id, t=period_type, k=period_key)


def get_evaluation_by_id(db: Session, evaluation_id: Any) -> dict[str, Any] | None:
    key = _uuid(evaluation_id)
    return _row(db, "SELECT * FROM public.ariba_evaluations WHERE id=:id", id=key) if key else None


def employee_name(db: Session, employee_id: str) -> str | None:
    row = _row(db, "SELECT name_ar FROM public.employee_directory WHERE employee_id=:e", e=employee_id)
    return (row or {}).get("name_ar")


def employee_exists(db: Session, employee_id: str) -> bool:
    return _row(db, "SELECT employee_id FROM public.employee_directory WHERE employee_id=:e",
                e=employee_id) is not None

def save_target(db: Session, actor_id: str | None, target: dict[str, Any]) -> dict[str, Any]:
    """Insert a target, or update the one `target["id"]` names. The caller commits.

    An edit keeps the row's period: moving a target to another period would rewrite history the
    evaluation already snapshotted, so a body that disagrees with the stored row is `422`.
    """
    if target["id"]:
        row = get_target(db, target["id"])
        if not row or str(row["employee_id"]) != target["employee_id"]:
            raise ApiError(404, "not_found", "Target not found")
        if (row["period_type"], row["period_key"]) != (target["period_type"], target["period_key"]):
            raise _invalid("لا يمكن تغيير فترة المستهدف")
        return _row(db, """UPDATE public.ariba_targets SET title=:title,description=:description,
            unit=:unit,target_value=:target_value,actual_value=:actual_value,weight=:weight,
            status=:status,updated_at=now() WHERE id=:id RETURNING *""", **{
            "id": row["id"], "title": target["title"], "description": target["description"],
            "unit": target["unit"], "target_value": target["target_value"],
            "actual_value": target["actual_value"], "weight": target["weight"],
            "status": target["status"]})
    return _row(db, """INSERT INTO public.ariba_targets
        (employee_id,period_type,period_key,title,description,unit,target_value,actual_value,weight,status,created_by)
        VALUES (:employee_id,:period_type,:period_key,:title,:description,:unit,:target_value,
                :actual_value,:weight,:status,:created_by) RETURNING *""",
                employee_id=target["employee_id"], period_type=target["period_type"],
                period_key=target["period_key"], title=target["title"],
                description=target["description"], unit=target["unit"],
                target_value=target["target_value"], actual_value=target["actual_value"],
                weight=target["weight"], status=target["status"], created_by=actor_id)


def delete_target(db: Session, target: dict[str, Any]) -> None:
    db.execute(text("DELETE FROM public.ariba_targets WHERE id=:id"), {"id": target["id"]})

# ---------------------------------------------------------------- evaluations
def save_evaluation(db: Session, actor_id: str | None, employee_id: str, period_type: str,
                    period_key: str, items: list[dict[str, Any]], comments: str | None,
                    submit: bool) -> dict[str, Any]:
    """Store the evaluator's copy as a draft or as a submitted evaluation. The caller commits.

    `overall`/`rating` are computed here and the client's own numbers are never read. Submitting
    stamps `submitted_at`; saving a draft again clears it (the screen's save-as-draft on a submitted
    evaluation puts it back in the evaluator's hands). An approved evaluation is final: the write's
    own `WHERE` refuses it, so a manager saving while an approver signs cannot overwrite the result.
    """
    overall = overall_of(items)
    row = _row(db, """INSERT INTO public.ariba_evaluations
        (employee_id,period_type,period_key,items,comments,overall,rating,status,evaluator_id,
         submitted_at,updated_at)
        VALUES (:e,:t,:k,CAST(:items AS jsonb),:comments,:overall,:rating,:status,:by,
                CASE WHEN :status='pending' THEN now() END,now())
        ON CONFLICT (employee_id,period_type,period_key) DO UPDATE SET
            items=EXCLUDED.items,comments=EXCLUDED.comments,overall=EXCLUDED.overall,
            rating=EXCLUDED.rating,status=EXCLUDED.status,evaluator_id=EXCLUDED.evaluator_id,
            submitted_at=EXCLUDED.submitted_at,updated_at=now()
        WHERE public.ariba_evaluations.status <> 'approved'
        RETURNING *""", e=employee_id, t=period_type, k=period_key,
        items=json.dumps(items, ensure_ascii=False), comments=comments, overall=overall,
        rating=rating_of(overall), status="pending" if submit else "draft", by=actor_id)
    if row is None:
        raise ApiError(409, "locked", "اعتُمد هذا التقييم نهائياً ولا يمكن تعديله")
    return row


def approve_evaluation(db: Session, actor_id: str | None, row: dict[str, Any]) -> dict[str, Any] | None:
    """Sign a submitted evaluation. `None` means somebody else decided it first (`409`)."""
    return _row(db, """UPDATE public.ariba_evaluations
        SET status='approved',approved_by=:by,approved_at=now(),updated_at=now()
        WHERE id=:id AND status='pending' RETURNING *""", id=row["id"], by=actor_id)

# ---------------------------------------------------------------- the goals tab
def my_goals(db: Session, employee_id: str) -> dict[str, Any]:
    """`GET /me/goals`: own targets (every period) and own **approved** evaluations only.

    A draft or a pending evaluation is not returned at all - not the row, not a redacted copy, not a
    count (P1). The screen's list is headed «تقييماتي المعتمدة» for exactly that reason.
    """
    evaluations = _rows(db, """SELECT * FROM public.ariba_evaluations
        WHERE employee_id=:e AND status='approved'
        ORDER BY period_key DESC, period_type""", e=employee_id)
    return {"targets": [target_out(row) for row in list_targets(db, employee_id)],
            "evaluations": [evaluation_out(row) for row in evaluations]}
