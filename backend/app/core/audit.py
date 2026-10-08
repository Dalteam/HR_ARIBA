"""Audit log for sensitive reads and every write.

Callers add the entry to the same session as the change, so it commits (or rolls back) with it.
`details` holds context such as the names of changed fields, never the values of secrets or IDs.
"""

from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from app.core.security import client_ip
from app.models import AuditLog, User


def audit(
    db: Session,
    request: Request | None,
    actor: User | None,
    action: str,
    entity: str,
    entity_id: Any = None,
    details: dict | None = None,
) -> None:
    db.add(
        AuditLog(
            actor_user_id=actor.id if actor else None,
            action=action,
            entity=entity,
            entity_id=str(entity_id) if entity_id is not None else None,
            details=details,
            ip=client_ip(request) if request else None,
            request_id=getattr(request.state, "request_id", None) if request else None,
        )
    )
