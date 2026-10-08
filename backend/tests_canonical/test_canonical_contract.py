from __future__ import annotations

import os
import uuid
from datetime import timedelta

import bcrypt
import jwt
import pytest
from argon2 import PasswordHasher
from sqlalchemy import create_engine

from app.config import get_settings
from app.models import CANONICAL_TABLE_NAMES, configure_models, metadata, table
from app.main import app
from app.routers.canonical import _public_employee, _sign, _verify_password

EXPECTED_TABLES = {
    "ariba_app_settings", "ariba_asset_custody_log", "ariba_assets", "ariba_audit_log",
    "ariba_audit_purge_requests", "ariba_auth_accounts", "ariba_backup_v106_duplicates",
    "ariba_backup_v116_cleanup", "ariba_bootstrap_recovery", "ariba_deleted_items",
    "ariba_documents", "ariba_employee_master_state", "ariba_function_backups",
    "ariba_leave_tombstones", "ariba_login_attempts", "ariba_password_resets",
    "ariba_payroll_status", "ariba_preview_pages", "ariba_role_perms", "ariba_security_flags",
    "ariba_sessions", "attendance", "company_settings", "employee_directory", "employee_payrolls",
    "employee_termination_archive", "leave_requests", "payroll_archives_v2", "permissions",
    "public_holidays", "work_locations", "workflow_actions", "workflow_notifications", "workflow_requests",
}

RETIRED_TABLES = {
    "employees", "users", "credentials", "dependents", "requests", "request_steps", "attendance_records",
    "payroll_runs", "payroll_rows", "leave_year_overrides", "leave_adjustments", "gosi_rules", "locations",
    "employee_locations", "sent_letters", "departments", "workplaces", "nationalities", "audit_logs", "sheets",
}


class NoSqlForBcrypt:
    def scalar(self, *_args, **_kwargs):
        raise AssertionError("bcrypt verification must not call SQL or Supabase Auth")


def test_canonical_allowlist_is_exact_and_has_no_retired_tables():
    assert CANONICAL_TABLE_NAMES == EXPECTED_TABLES
    assert not CANONICAL_TABLE_NAMES.intersection(RETIRED_TABLES)


def test_table_registry_rejects_retired_table_names():
    with pytest.raises(KeyError):
        table("employees")


def test_reflection_accepts_only_canonical_names_before_connecting():
    with pytest.raises(ValueError, match="Not a canonical public table"):
        configure_models(None, ["employees"])  # rejected before attempting reflection


def test_bcrypt_2a_existing_password_verifies_without_auth_service():
    hashed = bcrypt.hashpw(b"LegacyPass123", bcrypt.gensalt(prefix=b"2a")).decode("ascii")
    assert hashed.startswith("$2a$")
    assert _verify_password(NoSqlForBcrypt(), hashed, "LegacyPass123") == (True, True)
    assert _verify_password(NoSqlForBcrypt(), hashed, "wrong") == (False, False)


def test_argon2_hash_is_supported_during_transition():
    hashed = PasswordHasher().hash("ModernPass123")
    assert _verify_password(NoSqlForBcrypt(), hashed, "ModernPass123") == (True, False)
    assert _verify_password(NoSqlForBcrypt(), hashed, "wrong") == (False, False)


def test_bcrypt_upgrade_hash_is_argon2_and_keeps_password_valid():
    legacy = bcrypt.hashpw(b"LegacyPass123", bcrypt.gensalt(prefix=b"2a")).decode()
    assert _verify_password(NoSqlForBcrypt(), legacy, "LegacyPass123")[0]
    upgraded = PasswordHasher().hash("LegacyPass123")
    assert upgraded.startswith("$argon2id$")
    assert _verify_password(NoSqlForBcrypt(), upgraded, "LegacyPass123")[0]


def test_application_jwt_is_app_signed_and_bound_to_canonical_session_id():
    settings = get_settings()
    token = _sign("access", {"id": "account-id"}, uuid.UUID("bf8331bc-cf1e-4dae-9f98-1226d6d48231"), timedelta(minutes=5))
    claims = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"], audience=settings.jwt_audience, issuer=settings.jwt_issuer)
    assert claims["sub"] == "account-id"
    assert claims["sid"] == "bf8331bc-cf1e-4dae-9f98-1226d6d48231"
    assert claims["typ"] == "access"


def test_active_openapi_includes_canonical_core_routes_once():
    paths = app.openapi()["paths"]
    assert "/api/v1/auth/login" in paths
    assert "/api/v1/employees/{employee_id}" in paths
    assert "/api/v1/me/attendance/punch" in paths
    assert list(paths["/api/v1/me/attendance/punch"]) == ["post"]


def test_employee_serializer_masks_salary_and_identifiers_by_role():
    row = {
        "employee_id": "HR-EMP-1", "username": "EMP001", "name_ar": "Example", "name_en": "Example",
        "employer": "Ariba", "department": "HR", "job_title": "Manager", "nationality": "Saudi",
        "iqama_no": "1234567890", "active": True,
        "data": {"empNo": "1", "isSaudi": True, "iqamaNo": "1234567890", "passportNo": "A1234567",
                 "iban": "SA1234567890123456789012", "insuranceCard": "CARD1234", "salary": 1000,
                 "salaryTotal": 1500, "netSalary": 1400, "housingAllowance": 500},
    }
    manager = {"role": "manager", "employee_id": "HR-EMP-2"}
    result = _public_employee(row, manager)
    assert result["salary"] is None
    assert result["national_id"] == "******7890"
    assert result["passport_no"] == "******4567"
    assert result["iban"] == "******9012"
    assert result["insurance_card_no"] == "******1234"
    own = _public_employee(row, {"role": "employee", "employee_id": "HR-EMP-1"})
    assert own["salary"]["basic_salary"] == 1000
    assert own["national_id"] == "1234567890"


def test_employee_list_never_exposes_full_id_or_salary():
    row = {
        "employee_id": "HR-EMP-1", "username": "EMP001", "name_ar": "Example", "employer": "Ariba",
        "department": "HR", "nationality": "Saudi", "active": True,
        "data": {"empNo": "1", "isSaudi": True, "iqamaNo": "1234567890", "salaryTotal": 1500, "netSalarySAR": 1400},
    }
    item = _public_employee(row, {"role": "hr", "employee_id": None}, list_view=True)
    assert item["national_id_masked"] == "******7890"
    assert item["total_salary"] == 1500  # permitted for finance/HR list roles
    assert "national_id" not in item
    employee_item = _public_employee(row, {"role": "manager", "employee_id": "HR-EMP-2"}, list_view=True)
    assert employee_item["total_salary"] is None


@pytest.mark.skipif(not os.environ.get("CANONICAL_TEST_DATABASE_URL"), reason="Requires a disposable restored canonical PostgreSQL database")
def test_reflected_models_match_all_canonical_tables():
    engine = create_engine(os.environ["CANONICAL_TEST_DATABASE_URL"])
    try:
        configure_models(engine)
        names = {key.removeprefix("public.") for key in metadata.tables}
        assert names == EXPECTED_TABLES
        assert table("employee_directory").c.employee_id.type.python_type is str
        assert table("ariba_documents").c.file_data.type.python_type is bytes
        assert table("employee_payrolls").c.payload.type.__class__.__name__.lower().find("json") >= 0
    finally:
        engine.dispose()
