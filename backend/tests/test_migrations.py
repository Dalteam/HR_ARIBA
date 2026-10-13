"""Migrations apply cleanly up and down, and models.py matches the migrated schema."""

import os

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from sqlalchemy import create_engine, inspect, text

from app.database import make_engine
from app.migrations import alembic_config
from app.models import Base


def _drift(engine) -> list:
    with engine.connect() as conn:
        ctx = MigrationContext.configure(conn, opts={"compare_type": True})
        return compare_metadata(ctx, Base.metadata)


def test_upgrade_downgrade_upgrade_sqlite(tmp_path):
    url = f"sqlite:///{tmp_path / 'm.db'}"
    cfg = alembic_config(url)
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "base")
    engine = create_engine(url)
    assert set(inspect(engine).get_table_names()) <= {"alembic_version"}
    command.upgrade(cfg, "head")
    assert "employees" in inspect(engine).get_table_names()


def test_no_model_drift_sqlite(template_db):
    engine = create_engine(f"sqlite:///{template_db}")
    assert _drift(engine) == []


PG_URL = os.environ.get("TEST_DATABASE_URL", "")


@pytest.mark.skipif(not PG_URL.startswith("postgres"), reason="TEST_DATABASE_URL (Supabase test project) not set")
def test_postgres_migrations_and_rls():
    engine = make_engine(PG_URL)
    cfg = alembic_config(PG_URL)
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    assert _drift(engine) == []
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'")
        ).all()
    without_rls = [name for name, rls in rows if not rls]
    assert without_rls == []
