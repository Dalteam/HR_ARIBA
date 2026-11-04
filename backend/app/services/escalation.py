"""Escalation (L5): a request left waiting at the manager or the CEO longer than its waiting time goes to HR.

The design's `ariba_workflow_escalate` (sql/10_phase1_workflow_upgrade.sql), on our columns:

* `workflow_config.manager_wait_days` / `ceo_wait_days` (0 = never). The client's values are 3 and 3.
* A pending request at `manager` (or `ceo`) whose `updated_at` is older than that moves to `hr`, keeps
  `escalated_from` / `escalated_at`, gets one `workflow_actions` row (`escalated`), and rings HR (the stage's
  people), the employee and, for a manager's wait, the manager. The manager's / CEO's own bell items for it are
  marked read. A request moved once sits at `hr` and is never picked again for the same wait.
* `run_due()` is what the app's daily loop calls: it runs once per Riyadh day, from 07:05 (the design's
  pg_cron time), and records the day in `ariba_app_settings['escalation_last_run']` so a restart does not run
  it twice. HR's «تشغيل الآن» calls `escalate()` directly.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import time
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.scheduling import now_riyadh

log = logging.getLogger("ariba.escalation")

LAST_RUN_KEY = "escalation_last_run"
RUN_FROM = time(7, 5)
WHO = {"manager": "المدير المباشر", "ceo": "الرئيس التنفيذي"}


def _wait_days(config: dict[str, Any], key: str) -> int:
    try:
        return max(0, min(60, int(config.get(key) or 0)))
    except (TypeError, ValueError):
        return 0


def request_label(db: Session, code: str) -> str:
    """The request type's Arabic name (`workflow_request_types`), the code when it has none (the design's ariba_req_label)."""
    name = db.scalar(text("SELECT name_ar FROM public.workflow_request_types WHERE code=:c"), {"c": code})
    return str(name or code)


def escalate(db: Session, actor_account_id: Any = None) -> int:
    """Move every overdue request to HR; returns how many moved. The caller commits."""
    from app.routers import canonical  # the helpers live there; imported late to avoid a cycle

    config = canonical._workflow_config(db)
    waits = {"manager": _wait_days(config, "manager_wait_days"), "ceo": _wait_days(config, "ceo_wait_days")}
    stages = [stage for stage, days in waits.items() if days > 0]
    if not stages:
        return 0
    rows = canonical._rows(db, """SELECT r.*, d.name_ar, d.manager_id
        FROM public.workflow_requests r LEFT JOIN public.employee_directory d ON d.employee_id = r.employee_id
        WHERE r.status='pending' AND r.current_stage = ANY(:stages)
          AND r.updated_at < now() - make_interval(days => CASE r.current_stage WHEN 'manager' THEN :mw ELSE :cw END)
        ORDER BY r.updated_at FOR UPDATE OF r""", stages=stages, mw=waits["manager"], cw=waits["ceo"])
    hr_people = canonical._stage_people(db, "hr")
    for row in rows:
        stage, days, name = row["current_stage"], waits[row["current_stage"]], row.get("name_ar") or row["employee_id"]
        label = request_label(db, row["request_type"])
        db.execute(text("""UPDATE public.workflow_requests SET current_stage='hr', escalated_from=:s, escalated_at=now(),
            updated_at=now() WHERE id=:id"""), {"s": stage, "id": row["id"]})
        db.execute(text("""INSERT INTO public.workflow_actions(request_id, actor_account_id, stage, action, comment)
            VALUES (:r, :a, :s, 'escalated', :c)"""),
            {"r": row["id"], "a": actor_account_id, "s": stage, "c": f"لم يرد {WHO[stage]} خلال {days} أيام"})
        db.execute(text("""UPDATE public.workflow_notifications SET read_at=now()
            WHERE request_id=:r AND stage=:s AND read_at IS NULL AND recipient_employee_id IS DISTINCT FROM :e"""),
            {"r": row["id"], "s": stage, "e": row["employee_id"]})
        for person in hr_people:
            canonical._insert_notification(db, person, row["id"], f"طلب تجاوز مهلة {WHO[stage]} — قرارك الرسمي",
                                           f"{name} — {label} — لم يرد {WHO[stage]} خلال {days} أيام، والقرار الآن "
                                           "للموارد البشرية (موافقة أو رفض أو إرجاع)", "hr", "request")
        canonical._insert_notification(db, row["employee_id"], row["id"], "انتقل طلبك للموارد البشرية",
                                       f"لم يصل رد {WHO[stage]} خلال {days} أيام، فانتقل طلبك ({label}) للموارد "
                                       "البشرية للقرار الرسمي", "employee", "workflow")
        if stage == "manager" and row.get("manager_id"):
            canonical._insert_notification(db, row["manager_id"], row["id"], f"انتهت مهلتك على طلب {name}",
                                           f"انتقل {label} للموارد البشرية لعدم الرد خلال {days} أيام", "manager",
                                           "info")
    return len(rows)


def run_due(db: Session) -> int | None:
    """The daily pass: runs once per Riyadh day from 07:05; None when it is not due."""
    now = now_riyadh()
    if now.time() < RUN_FROM:
        return None
    last = db.scalar(text("SELECT value FROM public.ariba_app_settings WHERE key=:k"), {"k": LAST_RUN_KEY})
    if isinstance(last, dict) and last.get("date") == now.date().isoformat():
        return None
    moved = escalate(db)
    value = json.dumps({"date": now.date().isoformat(), "moved": moved, "at": now.isoformat()})
    db.execute(text("""INSERT INTO public.ariba_app_settings(key, value, updated_at) VALUES (:k, CAST(:v AS jsonb), now())
        ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()"""), {"k": LAST_RUN_KEY, "v": value})
    db.commit()
    return moved


async def run_forever(stop: asyncio.Event, interval_seconds: int) -> None:
    """Started by app.main: check every `interval_seconds` whether today's passes are due — escalation (Stage 12)
    and the expiry alerts (Stage 13), each once per Riyadh day from 07:05, each recorded on its own."""
    from app.database import SessionLocal
    from app.services import expiry_alerts

    def one_pass() -> tuple[int | None, dict[str, int] | None]:
        with SessionLocal() as db:
            moved = run_due(db)
        with SessionLocal() as db:
            return moved, expiry_alerts.run_due(db)

    while not stop.is_set():
        try:
            moved, alerts = await asyncio.to_thread(one_pass)
            if moved:
                log.info("escalation: %s request(s) moved to HR", moved)
            if alerts and alerts.get("sent"):
                log.info("expiry alerts: %s", alerts)
        except Exception:  # the loop must survive a database hiccup
            log.exception("daily pass failed")
        try:
            await asyncio.wait_for(stop.wait(), timeout=max(60, interval_seconds))
        except (TimeoutError, asyncio.TimeoutError):
            continue
