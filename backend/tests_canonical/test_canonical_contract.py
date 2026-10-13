from __future__ import annotations

import os
import uuid
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import bcrypt
import jwt
import pytest
from argon2 import PasswordHasher
from sqlalchemy import create_engine

from app.config import get_settings
from app.models import CANONICAL_TABLE_NAMES, configure_models, metadata, table
from app.main import app
from app.routers import canonical as canonical_router
from app.routers.canonical import _public_employee, _sign, _verify_password

EXPECTED_TABLES = {
    "ariba_app_settings", "ariba_asset_custody_log", "ariba_assets", "ariba_audit_log",
    "ariba_audit_purge_requests", "ariba_auth_accounts", "ariba_bootstrap_recovery", "ariba_deleted_items",
    "ariba_documents", "ariba_employee_master_state", "ariba_leave_tombstones", "ariba_login_attempts",
    "ariba_password_resets", "ariba_preview_pages", "ariba_role_perms", "ariba_security_flags",
    "ariba_sessions", "attendance", "company_settings", "departments", "document_types", "employee_directory",
    "employee_payrolls", "employee_termination_archive", "employers", "job_titles", "leave_requests",
    "leave_types", "payroll_archives_v2", "payroll_components", "payroll_lines", "payroll_periods", "permissions", "permission_types",
    "public_holidays", "roles", "work_locations", "workflow_actions", "workflow_approvers",
    "workflow_notifications", "workflow_request_types", "workflow_requests", "workflow_stages",
}

RETIRED_TABLES = {
    "employees", "users", "credentials", "dependents", "requests", "request_steps", "attendance_records",
    "payroll_runs", "payroll_rows", "leave_year_overrides", "leave_adjustments", "gosi_rules", "locations",
    "employee_locations", "sent_letters", "workplaces", "nationalities", "audit_logs", "sheets",
    "ariba_backup_v106_duplicates", "ariba_backup_v116_cleanup", "ariba_function_backups", "ariba_payroll_status",
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


class RecordingDB:
    def __init__(self):
        self.statements = []
        self.scalar_statements = []
        self.commits = 0

    def execute(self, statement, params=None):
        self.statements.append((str(statement), params or {}))
        return SimpleNamespace(rowcount=0)

    def scalar(self, statement, params=None):
        sql = str(statement)
        self.scalar_statements.append((sql, params or {}))
        if "public.employers" in sql:
            return 11
        if "public.departments" in sql:
            return 22
        if "public.job_titles" in sql:
            return 33
        return 1

    def commit(self):
        self.commits += 1


def test_workflow_approver_is_read_from_workflow_approvers(monkeypatch):
    monkeypatch.setattr(canonical_router, "_rows", lambda *_args, **_kwargs: [{"employee_id": "hr-7"}])
    actor = {"role": "hr", "employee_id": "hr-7"}
    item = {"status": "pending", "request_type": "annual", "current_stage": "hr"}
    assert canonical_router._stage_people(object(), "hr") == ["hr-7"]
    assert canonical_router._can_act(object(), actor, item)


def test_rejection_is_recorded_in_workflow_action(monkeypatch):
    db = RecordingDB()
    monkeypatch.setattr(canonical_router, "_insert_notification", lambda *_args, **_kwargs: None)
    actor = {"account_id": uuid.uuid4(), "employee_id": "hr-7"}
    item = {"id": uuid.uuid4(), "employee_id": "emp-1", "request_type": "annual", "current_stage": "manager"}
    canonical_router._advance(db, actor, item, "reject", "Dates need correction")
    action = next((sql, params) for sql, params in db.statements if "INSERT INTO public.workflow_actions" in sql)
    assert "actor_account_id" in action[0]
    assert action[1]["c"] == "Dates need correction"
    assert not any("actor_employee_id" in sql for sql, _ in db.statements)
    assert any("SET current_stage='rejected'" in sql and "status=" not in sql for sql, _ in db.statements)


def test_mark_notifications_read_sets_read_at_for_the_actor():
    db = RecordingDB()
    canonical_router.mark_notifications_read(actor={"employee_id": "emp-1"}, db=db)
    sql, params = db.statements[0]
    assert "SET read_at=now()" in sql
    assert "recipient_employee_id=:e" in sql
    assert params["e"] == "emp-1"


def test_employee_create_resolves_lookup_names_to_ids(monkeypatch):
    db = RecordingDB()
    employee = {"employee_id": "900", "name_ar": "Example", "active": True, "data": {"empNo": "900"}}

    def fake_row(_db, sql, **params):
        if "employee_id=:e OR data->>'empNo'" in sql:
            return None
        if "INSERT INTO public.employee_directory" in sql:
            assert params["employer_id"] == 11
            assert params["department_id"] == 22
            assert params["job_title_id"] == 33
            return {"employee_id": "900"}
        return employee

    monkeypatch.setattr(canonical_router, "_rows", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(canonical_router, "_row", fake_row)
    monkeypatch.setattr(canonical_router, "_store_figures", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(canonical_router, "_write_audit", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(canonical_router, "_employee_detail", lambda _db, row, _actor: row)
    result = canonical_router.create_employee(
        {"emp_no": "900", "name_ar": "Example", "workplace_id": "Ariba", "department_id": "HR",
         "job_title": "Analyst", "join_date": "2026-01-01"},
        request=None, actor={"role": "hr"}, db=db,
    )
    assert result["employee_id"] == "900"
    assert [params["name"] for _, params in db.scalar_statements] == ["Ariba", "HR", "Analyst"]


def test_employee_update_resolves_changed_lookup_names(monkeypatch):
    db = RecordingDB()
    old = {"employee_id": "900", "active": True, "manager_id": None, "data": {"empNo": "900"}}
    returned = {"employee_id": "900", "active": True, "data": {"empNo": "900"}}
    monkeypatch.setattr(canonical_router, "_employee_scope", lambda *_args, **_kwargs: old)
    monkeypatch.setattr(canonical_router, "_row", lambda *_args, **_kwargs: returned)
    monkeypatch.setattr(canonical_router, "_store_figures", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(canonical_router, "_reactivate_if_renewed", lambda *_args, **_kwargs: False)
    monkeypatch.setattr(canonical_router, "_write_audit", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(canonical_router, "_employee_detail", lambda _db, row, _actor: row)
    canonical_router.update_employee("900", {"workplace_id": "New", "department_id": "Ops", "job_title": "Lead"},
                                     request=None, actor={"role": "hr"}, db=db)
    update = next(sql for sql, _ in db.statements if "UPDATE public.employee_directory" in sql)
    assert "employer_id=:employer_id" in update
    assert "department_id=:department_id" in update
    assert "job_title_id=:job_title_id" in update
    assert not any(column in update for column in ("employer=:", "department=:", "job_title=:"))


def test_payroll_approval_state_comes_from_payroll_periods(monkeypatch):
    approved_at = datetime(2026, 3, 1, tzinfo=timezone.utc)

    def fake_row(_db, sql, **_kwargs):
        if "FROM public.payroll_periods" in sql:
            return {"approved": True, "approved_at": approved_at}
        return {"rows": [{"id": "900", "net": 100}], "updated_at": approved_at}

    monkeypatch.setattr(canonical_router, "_row", fake_row)
    monkeypatch.setattr(canonical_router, "_rows", lambda *_args, **_kwargs: [])
    rows, approved, approved_on, updated = canonical_router._month_rows(object(), 2026, 3)
    assert approved is True
    assert approved_on == approved_at
    assert updated == approved_at
    assert rows[0]["id"] == "900"


def test_payroll_approve_flow_upserts_payroll_period(monkeypatch):
    db = RecordingDB()
    now = datetime.now(timezone.utc)
    calls = 0

    def month_rows(*_args, **_kwargs):
        nonlocal calls
        calls += 1
        return ([{"id": "900", "net": 100}], calls > 1, now if calls > 1 else None, now)

    monkeypatch.setattr(canonical_router, "_month_rows", month_rows)
    monkeypatch.setattr(canonical_router, "_require", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(canonical_router, "_write_audit", lambda *_args, **_kwargs: None)
    response = canonical_router.approve_sheet("pay_2026_03", request=None,
                                              actor={"role": "finance", "employee_id": "finance-1"}, db=db)
    assert response["approved"] is True
    assert any("INSERT INTO public.payroll_periods" in sql and "ON CONFLICT(pay_year,pay_month)" in sql
               for sql, _ in db.statements)
    assert not any("UPDATE public.employee_payrolls SET approved" in sql for sql, _ in db.statements)


def test_leave_submission_links_leave_row_to_new_workflow_request(monkeypatch):
    db = RecordingDB()
    request_id = uuid.uuid4()
    employee = {"employee_id": "emp-1", "manager_id": None, "name_ar": "Example", "data": {}}
    workflow = {"id": request_id, "employee_id": "emp-1", "request_type": "annual", "current_stage": "hr",
                "status": "pending", "created_at": datetime.now(timezone.utc),
                "payload": {"from": "2026-04-01", "to": "2026-04-02", "days": 2, "notes": ""}}

    def fake_row(_db, sql, **_params):
        if "INSERT INTO public.workflow_requests" in sql:
            return workflow
        if "FROM public.leave_requests" in sql:
            return {"from_date": date(2026, 4, 1), "to_date": date(2026, 4, 2), "days": 2, "notes": ""}
        if "SELECT name_ar FROM public.employee_directory" in sql:
            return {"name_ar": "Example"}
        return None

    book = SimpleNamespace(count_workdays=lambda *_args: 2, current=lambda *_args: 10)
    monkeypatch.setattr(canonical_router, "_employee_scope", lambda *_args, **_kwargs: employee)
    monkeypatch.setattr(canonical_router, "_require_lookup", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(canonical_router, "_require_stage_approver", lambda _db, _stage: ["hr-7"])
    monkeypatch.setattr(canonical_router, "_row", fake_row)
    monkeypatch.setattr(canonical_router, "_rows", lambda *_args, **_kwargs: [{"employee_id": "hr-7"}])
    monkeypatch.setattr(canonical_router, "_insert_notification", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(canonical_router, "_write_audit", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(canonical_router.cdata, "employees", lambda *_args, **_kwargs: [SimpleNamespace(id="emp-1")])
    monkeypatch.setattr(canonical_router.cdata, "leave_book", lambda *_args, **_kwargs: book)
    response = canonical_router.submit_request(
        {"type": "annual", "from_date": "2026-04-01", "to_date": "2026-04-02"},
        request=None, actor={"employee_id": "emp-1", "account_id": uuid.uuid4()}, db=db,
    )
    insert = next((sql, params) for sql, params in db.statements if "INSERT INTO public.leave_requests" in sql)
    assert response["id"] == str(request_id)
    assert "workflow_request_id" in insert[0]
    assert insert[1]["rid"] == request_id
    assert "emp_id" not in insert[0] and "mgr_status" not in insert[0]


def test_monthly_attendance_summary_counts_a_day_once_with_multiple_sessions(monkeypatch):
    def fake_rows(_db, sql, **_kwargs):
        if "FROM public.attendance" in sql:
            return [
                {"employee_id": "emp-1", "date": date(2026, 4, 2), "status": "late", "late_minutes": 12},
                {"employee_id": "emp-1", "date": date(2026, 4, 2), "status": "present", "late_minutes": 0},
            ]
        return [{"employee_id": "emp-1", "name_ar": "Example"}]

    monkeypatch.setattr(canonical_router, "_rows", fake_rows)
    result = canonical_router.hr_attendance_summary("2026-04", actor={"role": "hr"}, db=object())
    assert len(result) == 1
    assert result[0]["late"] == 1
    assert result[0]["present"] == 1


def test_punching_in_with_an_open_session_returns_conflict(monkeypatch):
    db = RecordingDB()
    open_session = {"id": uuid.uuid4(), "time_in": datetime.now().time(), "time_out": None, "late_minutes": 0}

    def fake_row(_db, sql, **_kwargs):
        if "FROM public.employee_directory d" in sql:
            return {"employee_id": "emp-1", "active": True, "employer_id": None, "data": {}}
        if "FROM public.company_settings" in sql:
            return {"flexible_enabled": False, "work_start": datetime.strptime("08:00", "%H:%M").time(),
                    "tolerance_minutes": 15, "shift_duration_minutes": 480}
        if "FROM public.attendance" in sql:
            return open_session
        return None

    monkeypatch.setattr(canonical_router, "_row", fake_row)
    monkeypatch.setattr(canonical_router, "_rows", lambda *_args, **_kwargs: [{"id": "loc-1", "type": "project", "polygon": None,
                                                                              "latitude": 0, "longitude": 0, "radius_m": 200}])
    with pytest.raises(canonical_router.ApiError) as error:
        canonical_router.punch({"action": "in", "lat": 0, "lng": 0}, request=None,
                               actor={"employee_id": "emp-1"}, db=db)
    assert error.value.status == 409
    assert error.value.code == "already_checked_in"


def test_forgot_punch_checkin_updates_open_session_without_insert(monkeypatch):
    db = RecordingDB()
    opened = {"id": uuid.uuid4(), "time_in": datetime.strptime("08:00", "%H:%M").time(), "time_out": None,
              "late_minutes": 0, "early_minutes": 0, "notes": ""}
    settings = {"work_start": datetime.strptime("08:00", "%H:%M").time(), "tolerance_minutes": 15,
                "flexible_enabled": False, "shift_duration_minutes": 480}

    def fake_row(_db, sql, **_kwargs):
        if "FROM public.company_settings" in sql:
            return settings
        if "FROM public.attendance" in sql:
            return opened
        return None

    monkeypatch.setattr(canonical_router, "_row", fake_row)
    canonical_router._apply_forgot_punch(db, {"employee_id": "emp-1", "request_type": "forgot_punch",
                                                "payload": {"kind": "in", "date": "2026-04-02", "time": "07:55"}})
    assert not any("INSERT INTO public.attendance" in sql for sql, _ in db.statements)
    assert any("UPDATE public.attendance SET time_in" in sql for sql, _ in db.statements)


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
