"""SQLAlchemy mappings reflected from the canonical Supabase public schema.

This module intentionally declares no tables or columns. The restored PostgreSQL
schema is authoritative; reflection prevents application code from creating a
second, drifted schema.
"""

from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import MetaData, Table
from sqlalchemy.engine import Engine
from sqlalchemy.ext.automap import automap_base

CANONICAL_TABLE_NAMES = frozenset(
    {
        "ariba_app_settings",
        "ariba_asset_custody_log",
        "ariba_assets",
        "ariba_audit_log",
        "ariba_audit_purge_requests",
        "ariba_auth_accounts",
        "ariba_bootstrap_recovery",
        "ariba_deleted_items",
        "ariba_documents",
        "departments",
        "document_types",
        "employers",
        "ariba_employee_master_state",
        "ariba_leave_tombstones",
        "ariba_login_attempts",
        "ariba_password_resets",
        "ariba_preview_pages",
        "ariba_role_perms",
        "ariba_security_flags",
        "ariba_sessions",
        "attendance",
        "company_settings",
        "employee_directory",
        "employee_payrolls",
        "employee_termination_archive",
        "job_titles",
        "leave_types",
        "leave_requests",
        "payroll_components",
        "payroll_lines",
        "payroll_archives_v2",
        "payroll_periods",
        "permission_types",
        "permissions",
        "public_holidays",
        "roles",
        "work_locations",
        "workflow_actions",
        "workflow_approvers",
        "workflow_notifications",
        "workflow_request_types",
        "workflow_requests",
        "workflow_stages",
    }
)

metadata = MetaData()
Base = automap_base(metadata=metadata)
_configured = False


def configure_models(engine: Engine, table_names: Iterable[str] = CANONICAL_TABLE_NAMES) -> None:
    """Reflect existing canonical tables without creating or altering database objects."""
    global _configured
    requested = frozenset(table_names)
    if not requested <= CANONICAL_TABLE_NAMES:
        unexpected = sorted(requested - CANONICAL_TABLE_NAMES)
        raise ValueError(f"Not a canonical public table: {', '.join(unexpected)}")

    metadata.clear()
    metadata.reflect(bind=engine, schema="public", only=sorted(requested), views=False)
    reflected = frozenset(table.name for table in metadata.tables.values())
    missing = sorted(requested - reflected)
    if missing:
        raise RuntimeError(f"Canonical public tables missing from database: {', '.join(missing)}")

    Base.prepare()
    _configured = True


def is_configured() -> bool:
    return _configured


def table(name: str) -> Table:
    """Return a reflected table by its canonical public name."""
    if name not in CANONICAL_TABLE_NAMES:
        raise KeyError(f"Not a canonical public table: {name}")
    if not _configured:
        raise RuntimeError("Canonical schema has not been reflected; configure_models() first")
    return metadata.tables[f"public.{name}"]


def model(name: str) -> type:
    """Return an automapped class whose name is the canonical public table name."""
    if name not in CANONICAL_TABLE_NAMES:
        raise KeyError(f"Not a canonical public table: {name}")
    if not _configured:
        raise RuntimeError("Canonical schema has not been reflected; configure_models() first")
    return getattr(Base.classes, name)
