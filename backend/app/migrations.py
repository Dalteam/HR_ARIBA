"""Runs Alembic migrations (on startup when RUN_MIGRATIONS_ON_STARTUP=true, and in tests)."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy.engine import Connection

BACKEND_DIR = Path(__file__).resolve().parent.parent


def alembic_config(url: str | None = None, connection: Connection | None = None) -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    if url:
        cfg.attributes["url"] = url
    if connection is not None:
        cfg.attributes["connection"] = connection
    return cfg


def run_migrations(url: str | None = None) -> None:
    command.upgrade(alembic_config(url), "head")
