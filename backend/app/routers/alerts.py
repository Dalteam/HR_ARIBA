"""Expiry alerts (Stage 13): the settings card, «تشغيل الآن» and the list of recent alerts.

    GET  /settings/alerts   the design's alerts_cfg, every kind filled in, plus the last daily pass
    PUT  /settings/alerts   save it (settings: edit)
    POST /alerts/run        HR's «تشغيل الآن» (settings: edit, the design's ariba_hr_alerts_run)
    GET  /alerts/status     the newest 200 alerts with the employee's name (the design's ariba_hr_alerts_status)

The daily pass itself runs from the app's loop (services/escalation.run_forever → services/expiry_alerts.run_due).
`run` and `status` need migration 005; without it they answer 503 migration_required and the API still starts.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.database import get_db
from app.routers import canonical
from app.services import expiry_alerts

router = APIRouter(tags=["alerts"])


def _needs_migration() -> ApiError:
    return ApiError(503, "migration_required", "جداول التنبيهات غير موجودة — شغّل docs/db-migrations/005_expiry_alerts.sql أولًا")


@router.get("/settings/alerts")
def get_alerts(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    canonical._perm(actor, "settings")
    last = canonical._app_setting(db, expiry_alerts.LAST_RUN_KEY)
    return {"cfg": expiry_alerts.config(db), "last_run": last if isinstance(last, dict) else None,
            "ready": expiry_alerts.tables_ready(db), "email_sending": False}


@router.put("/settings/alerts")
def put_alerts(body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(canonical.current_actor),
               db: Session = Depends(get_db)):
    canonical._perm(actor, "settings", "edit")
    if not isinstance(body, dict) or not isinstance(body.get("cfg"), dict):
        raise ApiError(422, "validation_error", "Send {cfg: {...}}")
    cfg = expiry_alerts.normalize(body["cfg"])
    canonical._set_app_setting(db, expiry_alerts.SETTING_KEY, cfg, actor)
    canonical._write_audit(db, actor, request, "settings", "alerts_cfg", "ariba_app_settings", expiry_alerts.SETTING_KEY,
                           summary="تحديث إعدادات تنبيهات الانتهاء", details=cfg)
    db.commit()
    return {"cfg": cfg}


@router.post("/alerts/run")
def run_now(request: Request, actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    canonical._perm(actor, "settings", "edit")
    if not expiry_alerts.tables_ready(db):
        raise _needs_migration()
    result = expiry_alerts.run(db)
    canonical._write_audit(db, actor, request, "settings", "alerts_run", "ariba_alert_log", None,
                           summary=f"تشغيل تنبيهات الانتهاء يدويًا: {result['sent']} تنبيه", details=result)
    db.commit()
    return result


@router.get("/alerts/status")
def status(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    canonical._perm(actor, "settings")
    if not expiry_alerts.tables_ready(db):
        return {"rows": [], "ready": False}
    rows = canonical._rows(db, """SELECT l.sent_at, l.kind, l.expiry, l.employee_id, d.name_ar AS employee_name,
               l.recipient, r.name_ar AS recipient_name
        FROM public.ariba_alert_log l
        LEFT JOIN public.employee_directory d ON d.employee_id = l.employee_id
        LEFT JOIN public.employee_directory r ON r.employee_id = l.recipient
        ORDER BY l.sent_at DESC LIMIT 200""")
    for row in rows:
        row["label"] = expiry_alerts.LABEL.get(row["kind"], row["kind"])
    return {"rows": rows, "ready": True}
