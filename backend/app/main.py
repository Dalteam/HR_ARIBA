"""App setup: middleware, CORS, security headers, error handlers, routers, startup."""

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.core.errors import install_error_handlers
from app.core.security import SecurityHeadersMiddleware
from app.database import engine
from app.models import configure_models
from app.routers import alerts, announcements, apply, assets, audit_log, bizcards, candidates, canonical, goals
from app.routers import health, leave_actions, manager, permissions, public, push, recycle_bin, tasks
from app.services import escalation, notify_email

API_PREFIX = "/api/v1"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # The canonical database is restored independently. Startup only verifies and
    # reflects its public schema; it never runs Alembic or creates seed accounts.
    with engine.connect() as connection:
        if connection.dialect.name != "postgresql":
            raise RuntimeError("The canonical Supabase schema requires PostgreSQL")
        connection.exec_driver_sql("SELECT 1")
        bypass_rls = connection.exec_driver_sql(
            "SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user"
        ).scalar_one_or_none()
        if not bypass_rls:
            raise RuntimeError(
                "The imported canonical schema enforces Supabase RLS; use a test DB role with BYPASSRLS "
                "for this FastAPI-only test phase. Do not disable or rewrite production policies here."
            )
    configure_models(engine)
    # Notification e-mails: one pass now, then every NOTIFY_EMAIL_INTERVAL_SECONDS (0 = off). The sender
    # needs NOTIFY_EMAIL_ENABLED=true *and* SMTP configured; until then this task costs nothing.
    s = get_settings()
    stop = asyncio.Event()
    sender = None
    if s.notify_email_interval_seconds > 0 and notify_email.enabled(s):
        logging.getLogger("ariba.notify_email").info(
            "notification e-mails every %ss through %s", s.notify_email_interval_seconds, s.smtp_host)
        sender = asyncio.create_task(notify_email.run_forever(stop, s.notify_email_interval_seconds))
    # Escalation (Stage 12): checks every WORKFLOW_ESCALATION_CHECK_SECONDS whether today's pass is due.
    escalator = None
    if s.workflow_escalation_check_seconds > 0:
        escalator = asyncio.create_task(escalation.run_forever(stop, s.workflow_escalation_check_seconds))
    try:
        yield
    finally:
        stop.set()
        for task in (sender, escalator):
            if task is not None:
                with contextlib.suppress(asyncio.CancelledError):
                    await task



def create_app() -> FastAPI:
    s = get_settings()
    logging.basicConfig(level=logging.INFO)
    app = FastAPI(
        title="Ariba HR API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if s.is_dev else None,
        redoc_url=None,
        openapi_url="/openapi.json" if s.is_dev else None,
    )
    # Order matters: the last middleware added runs first. CORS must wrap everything so error
    # responses carry CORS headers too.
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "Accept-Language", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
        max_age=600,
    )
    install_error_handlers(app)

    app.include_router(health.router)
    app.include_router(canonical.router, prefix=API_PREFIX)
    # The direct manager's surface (Stage 2): /me/manager-perms, /me/team/requests,
    # /me/team/{id}/requests, /me/delegation and the HR settings behind them.
    app.include_router(manager.router, prefix=API_PREFIX)
    # Goals, targets and evaluations (Stage 3): the goals tab and the team-goals screen
    # (/me/goals, /targets, /evaluations/…), with the approver taken from goals_config.
    app.include_router(goals.router, prefix=API_PREFIX)
    # Tasks, meetings and the team's availability (Stage 4): /team/availability and /tasks
    # (/tasks, /tasks/{id}/update), scoped to the people the caller may already see.
    app.include_router(tasks.router, prefix=API_PREFIX)
    # The company's identity before sign-in and the devices behind push (Stage 6): /public/brand is
    # the one route without a token (cached, five named settings keys), /me/push-token stores the
    # phone's Expo token and /settings/push is the switch a later stage will read — off, and with no
    # sender anywhere: this stage stores tokens, it does not send.
    app.include_router(public.router, prefix=API_PREFIX)
    app.include_router(push.router, prefix=API_PREFIX)
    # Announcements and greetings (Stage 7): the home card (/me/announcements) and HR's side
    # (/announcements, /occasions, /settings/greetings, /settings/announcements), on migration 003.
    app.include_router(announcements.router, prefix=API_PREFIX)
    # The four screens the design had and we did not (Stage 9): the audit log and its two-person purge
    # (/audit-log), the recycle bin (/recycle-bin), the candidates list, invites and medical form
    # (/candidates), the public application form (/public/apply — the second token-free surface), and
    # business cards (/bizcards, /me/bizcard). One migration behind two of them: 004_four_screens.sql.
    app.include_router(audit_log.router, prefix=API_PREFIX)
    app.include_router(recycle_bin.router, prefix=API_PREFIX)
    app.include_router(candidates.router, prefix=API_PREFIX)
    app.include_router(apply.router, prefix=API_PREFIX)
    app.include_router(bizcards.router, prefix=API_PREFIX)
    # Fixed assets and custody (Stage 10): /assets and /assets/{id}/custody, on the design's two tables that
    # were already in the schema (no migration).
    app.include_router(assets.router, prefix=API_PREFIX)
    # Roles and permissions (Stage 11): the matrix (/permissions), the accounts' roles, and /me/permissions. Every
    # HR-side check reads the same matrix through canonical._perm (services/permissions.py); no migration.
    app.include_router(permissions.router, prefix=API_PREFIX)
    # More HR leave actions (Stage 12): return to manager, cancel a leave, balance undo, workflow and leave-policy
    # settings, and escalation (its daily pass is the lifespan loop above). No migration.
    app.include_router(leave_actions.router, prefix=API_PREFIX)
    # Expiry alerts (Stage 13): /settings/alerts, /alerts/run, /alerts/status; the daily pass runs in the same
    # loop as escalation. Needs migration 005 (005_expiry_alerts.sql); without it the routes answer 503.
    app.include_router(alerts.router, prefix=API_PREFIX)
    return app


app = create_app()
