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

# Every public table `configure_models()` may reflect. The fourteen `ariba_*` entries that follow come
# from `docs/db-migrations/001_react_port.sql` (delegation, manager perms, recruitment, goals, document
# signing, leave files, mail, tasks, WebAuthn, push) — they exist in every database created from
# `ariba_src`, so the allowlist has to cover them before those screens are ported.
CANONICAL_TABLE_NAMES = frozenset(
    {
        "ariba_app_settings",
        "ariba_asset_custody_log",
        "ariba_assets",
        "ariba_audit_log",
        "ariba_audit_purge_requests",
        "ariba_auth_accounts",
        "ariba_bootstrap_recovery",
        "ariba_candidate_files",
        "ariba_candidate_invites",
        "ariba_candidates",
        "ariba_delegations",
        "ariba_deleted_items",
        "ariba_doc_signing",
        "ariba_documents",
        "ariba_employee_master_state",
        "ariba_evaluations",
        "ariba_leave_files",
        "ariba_leave_tombstones",
        "ariba_login_attempts",
        "ariba_mail_accounts",
        "ariba_mail_log",
        "ariba_manager_perms",
        "ariba_notif_files",
        "ariba_password_resets",
        "ariba_preview_pages",
        "ariba_push_tokens",
        "ariba_role_perms",
        "ariba_security_flags",
        "ariba_sessions",
        "ariba_targets",
        "ariba_tasks",
        "ariba_webauthn_credentials",
        "attendance",
        "company_settings",
        "departments",
        "document_types",
        "employee_directory",
        "employee_payrolls",
        "employee_termination_archive",
        "employers",
        "job_titles",
        "leave_requests",
        "leave_types",
        "payroll_archives_v2",
        "payroll_components",
        "payroll_lines",
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
