"""Request approval chain (legacy secure workflow: employee → manager → HR → CEO → employee).

Stages per request type come from `workflow_rules` (seeded as in the legacy app: leaves/remote/advance go through
manager, HR and CEO; permissions/early leave/overtime/mission through manager and HR; forgot-punch to HR only).

HR actions as in the legacy HR portal:
- approve / reject at the `hr` stage (reject needs a reason),
- "اعتماد نيابة عن المدير" at any other pending stage (override, with a reason) → moves to the next stage,
- "اعتماد نهائي" (V116) → approves every remaining stage at once,
- delete (V124): an approved annual leave returns its days to the balance (the ledger recomputes from requests).
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models import (
    Request,
    RequestStatus,
    RequestStep,
    RequestType,
    StepAction,
    User,
    WorkflowRule,
    WorkflowStage,
)

_ORDER = (WorkflowStage.manager, WorkflowStage.hr, WorkflowStage.ceo)


def stages_for(db: Session, request_type) -> list[WorkflowStage]:
    rule = db.scalar(select(WorkflowRule).where(WorkflowRule.request_type == request_type))
    if rule is None:
        return [WorkflowStage.hr]
    flags = {WorkflowStage.manager: rule.requires_manager, WorkflowStage.hr: rule.requires_hr, WorkflowStage.ceo: rule.requires_ceo}
    out = [s for s in _ORDER if flags[s]]
    return out or [WorkflowStage.hr]


def first_stage(db: Session, request_type, *, has_manager: bool, submitted_by_hr: bool) -> WorkflowStage:
    """Requests recorded by HR start at HR; a request with no direct manager skips the manager stage."""
    stages = stages_for(db, request_type)
    if submitted_by_hr or not has_manager:
        stages = [s for s in stages if s != WorkflowStage.manager] or [WorkflowStage.hr]
    return stages[0]


def _next(db: Session, req: Request) -> WorkflowStage:
    stages = stages_for(db, req.type)
    if req.current_stage in stages:
        i = stages.index(req.current_stage)
        if i + 1 < len(stages):
            return stages[i + 1]
    return WorkflowStage.completed


def _step(db: Session, req: Request, action: StepAction, user: User, reason: str | None = None) -> None:
    db.add(RequestStep(request_id=req.id, stage=req.current_stage, action=action, actor_user_id=user.id, reason=reason))


def _pending(req: Request) -> None:
    if req.status != RequestStatus.pending:
        raise ApiError(409, "not_pending", "This request is no longer pending")


def _finish_or_advance(db: Session, req: Request) -> None:
    nxt = _next(db, req)
    req.current_stage = nxt
    if nxt == WorkflowStage.completed:
        req.status = RequestStatus.approved
        req.decided_at = datetime.now(timezone.utc)
        if req.type == RequestType.forgot_punch:
            from app.services.punch import record_forgot_punch

            record_forgot_punch(db, req)


def approve(db: Session, req: Request, user: User, note: str | None = None) -> None:
    _pending(req)
    _step(db, req, StepAction.approved, user, note)
    _finish_or_advance(db, req)


def override(db: Session, req: Request, user: User, reason: str) -> None:
    """اعتماد نيابة: HR approves the current (non-HR) stage on behalf of its owner."""
    _pending(req)
    if not (reason or "").strip():
        raise ApiError(422, "reason_required", "A reason is required")
    _step(db, req, StepAction.override_approved, user, reason.strip())
    _finish_or_advance(db, req)


def final_approve(db: Session, req: Request, user: User, reason: str | None = None) -> None:
    _pending(req)
    while req.status == RequestStatus.pending:
        _step(db, req, StepAction.override_approved, user, reason or "اعتماد نهائي")
        _finish_or_advance(db, req)


def reject(db: Session, req: Request, user: User, reason: str) -> None:
    _pending(req)
    if not (reason or "").strip():
        raise ApiError(422, "reason_required", "A rejection reason is required")
    _step(db, req, StepAction.rejected, user, reason.strip())
    req.status = RequestStatus.rejected
    req.rejection_reason = reason.strip()
    req.decided_at = datetime.now(timezone.utc)


def submitted(db: Session, req: Request, user: User) -> None:
    _step(db, req, StepAction.submitted, user)
