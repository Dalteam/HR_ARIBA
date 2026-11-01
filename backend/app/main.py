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
from app.routers import canonical, goals, health, manager
from app.services import notify_email

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
    try:
        yield
    finally:
        if sender is not None:
            stop.set()
            with contextlib.suppress(asyncio.CancelledError):
                await sender



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
    return app


app = create_app()
