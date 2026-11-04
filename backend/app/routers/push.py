"""Device push tokens, and the switch behind them (Stage 6 of the employee-app port).

The five calls `frontend/employee-app/src/lib/port.ts` and `src/lib/push.ts` make, and who may make
each:

    POST   /me/push-token      push.register()     this device, for me
    GET    /me/push-token      (no screen yet)     my own devices, never a token
    DELETE /me/push-token      push.unregister()   one of mine, or all of mine
    GET    /settings/push      (HR)                the switch and a device count
    PUT    /settings/push      (HR)                the switch itself

The rules live in `app/services/push.py` (T1–T4); this module only turns them into answers, audit
rows and refusals:

* **Registering is audited with the platform, never the token.** The row is the evidence (S9's
  principle applied to a device): `push_token_register {platform}` and
  `push_token_delete {all|count}` say what happened without putting a delivery credential into a log
  that HR can read.
* **Nothing else happens.** No bell entry, no e-mail, no outbound call — with `push_config.enabled`
  off (its default) a registration writes one row and that is the whole effect (T4).
* **The switch is a setting in the same shape as the others**: HR writes it (`PUT /settings/push`,
  audited), HR reads it, everybody else gets `403` from the same role gate as `/settings/doc-sign`.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.database import get_db
from app.routers import canonical
from app.services import push

router = APIRouter(tags=["push"])


@router.post("/me/push-token")
def register_push_token(body: dict[str, Any], request: Request,
                        actor: dict[str, Any] = Depends(canonical.current_actor),
                        db: Session = Depends(get_db)):
    """`{ok: true}` — body `{token, platform}`; the format is checked before anything is written (T1)."""
    value = push.token(body.get("token"))
    device = push.platform(body.get("platform"))
    push.register(db, actor["account_id"], value, device)
    canonical._write_audit(db, actor, request, "push", "push_token_register", "account",
                           actor["account_id"], details={"platform": device})
    db.commit()
    return {"ok": True}


@router.get("/me/push-token")
def list_push_tokens(actor: dict[str, Any] = Depends(canonical.current_actor),
                     db: Session = Depends(get_db)):
    """`{ok, enabled, items: [{platform, created_at, last_seen_at}]}` — my own devices, no token (T2).

    `enabled` is the switch, so a screen can say «الإشعارات غير مفعّلة» without asking HR's route.
    """
    return {"ok": True, "enabled": push.enabled(db), "items": push.own(db, actor["account_id"])}


@router.delete("/me/push-token")
def delete_push_token(request: Request, body: dict[str, Any] | None = None,
                      actor: dict[str, Any] = Depends(canonical.current_actor),
                      db: Session = Depends(get_db)):
    """`{ok, removed}` — body `{token?}`: one token of mine, or every token of mine (T2).

    The app sends `{}` when it has lost its token (`push.unregister(undefined)`), and that is the
    sign-out «this phone stops receiving my notifications». A token that belongs to somebody else is
    `404 not_found`, the same answer as one that does not exist, and removes nothing.
    """
    data = body or {}
    raw = data.get("token")
    if isinstance(raw, str) and raw.strip():
        removed = push.forget(db, actor["account_id"], push.token(raw))
        details: dict[str, Any] = {"all": False, "count": removed}
    else:
        removed = push.forget_all(db, actor["account_id"])
        details = {"all": True, "count": removed}
    canonical._write_audit(db, actor, request, "push", "push_token_delete", "account",
                           actor["account_id"], details=details)
    db.commit()
    return {"ok": True, "removed": removed}


@router.get("/settings/push")
def get_push_settings(actor: dict[str, Any] = Depends(canonical.current_actor),
                      db: Session = Depends(get_db)):
    """`{enabled, devices}` — the switch and how many live devices are registered (T4)."""
    canonical._perm(actor, "settings")
    return push.settings(db)


@router.put("/settings/push")
def update_push_settings(body: dict[str, Any], request: Request,
                         actor: dict[str, Any] = Depends(canonical.current_actor),
                         db: Session = Depends(get_db)):
    """Save the switch; a body that is not a boolean is refused rather than read as `false` (T4)."""
    canonical._perm(actor, "settings", "edit")
    if not isinstance(body.get("enabled"), bool):
        raise ApiError(422, "invalid_request", "enabled must be true or false")
    canonical._set_app_setting(db, push.CFG_KEY, {"enabled": body["enabled"]}, actor)
    canonical._write_audit(db, actor, request, "settings", "update", "ariba_app_settings", push.CFG_KEY,
                           details={"enabled": body["enabled"]})
    db.commit()
    return push.settings(db)
