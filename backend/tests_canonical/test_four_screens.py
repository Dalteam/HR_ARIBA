"""The four screens the design had and this API did not (Stage 9): audit log, recycle bin, candidates, cards.

Most of this runs without a database, because the rules that matter were kept out of SQL on purpose: the
30-day purge rule, the finance module lock, the role gates, the closed list of what a public application may
store, and the file rules the form enforces. The tests at the end need `CANONICAL_TEST_DATABASE_URL` (a
throwaway copy with migration 004) and run inside a transaction that is rolled back — they prove that the real
log answers with real rows and that `finance` cannot read a salary change out of it.
"""

from __future__ import annotations

import base64
import os
from datetime import UTC, datetime

import pytest

from app.core.errors import ApiError
from app.routers import apply as apply_router
from app.routers import audit_log, bizcards, candidates, recycle_bin

needs_db = pytest.mark.skipif(
    not os.environ.get("CANONICAL_TEST_DATABASE_URL"),
    reason="Requires a disposable restored canonical PostgreSQL database with migration 004",
)

NOV_3 = datetime(2026, 11, 3, 12, 0, tzinfo=UTC)


def refused(exc_info, status: int, code: str) -> None:
    assert (exc_info.value.status, exc_info.value.code) == (status, code), exc_info.value.message


# ------------------------------------------------------------------------------- audit log: the 30-day rule

@pytest.mark.parametrize(
    "month,expected",
    [("2026-09", True), ("2026-10", False), ("2026-11", False), ("2025-12", True), ("2026-9", False),
     ("", False), ("2026-13", False), ("202609", False)],
)
def test_month_eligible(month, expected):
    """`(first day of the next month) <= now - 30 days` — `ariba_audit_month_eligible`, in Python."""
    assert audit_log._month_eligible(month, NOV_3) is expected


def test_month_eligible_exact_boundary():
    """The rule is a boundary, not a month count: 01/10 IS the 30-day line on 31/10, one day short on 30/10."""
    assert audit_log._month_eligible("2026-09", datetime(2026, 10, 31, 12, tzinfo=UTC)) is True
    assert audit_log._month_eligible("2026-09", datetime(2026, 10, 30, 12, tzinfo=UTC)) is False


def test_the_list_limit_is_clamped_to_1_1000_with_300_by_default():
    assert (audit_log.DEFAULT_LIMIT, audit_log.MAX_LIMIT) == (300, 1000)


@pytest.mark.parametrize("role", ["hr", "admin", "admin_manager", "ceo", "finance"])
def test_every_audit_viewer_may_read(role):
    audit_log._viewer({"role": role})


@pytest.mark.parametrize("role", ["employee", "manager", "chairman", ""])
def test_others_cannot_read_the_log(role):
    with pytest.raises(ApiError) as exc:
        audit_log._viewer({"role": role})
    refused(exc, 403, "forbidden")


def test_finance_module_lock():
    """`finance` sees payroll, insurance, settlement and eos — and nothing else, whatever it asks for."""
    assert set(audit_log.FINANCE_MODULES) == {"payroll", "insurance", "settlement", "eos"}
    assert audit_log._allowed_modules({"role": "finance"}) == list(audit_log.FINANCE_MODULES)
    assert audit_log._allowed_modules({"role": "hr"}) == []


def test_module_filter_precedence():
    assert audit_log._module_filter(None, None) is None
    assert audit_log._module_filter([], "") is None
    assert audit_log._module_filter(["employees"], "payroll") == ["employees"]
    assert audit_log._module_filter(None, "payroll") == ["payroll"]
    assert audit_log._module_filter([" employees "], None) == ["employees"]


def test_dates_are_validated_before_the_query():
    assert audit_log._timestamp(None, "date_from") is None
    assert audit_log._timestamp("2026-10-01", "date_from") == "2026-10-01"
    assert audit_log._timestamp(" 2026-10-01T08:30:00+03:00 ", "date_from") == "2026-10-01T08:30:00+03:00"
    with pytest.raises(ApiError) as exc:
        audit_log._timestamp("01/10/2026", "date_from")
    refused(exc, 422, "invalid_date")


# ------------------------------------------------------------------------------------ recycle bin: the rules

@pytest.mark.parametrize("role", ["hr", "admin", "admin_manager"])
def test_bin_is_for_hr_only(role):
    recycle_bin._editor({"role": role})


@pytest.mark.parametrize("role", ["ceo", "finance", "employee", "manager"])
def test_ceo_and_finance_cannot_use_the_bin(role):
    with pytest.raises(ApiError) as exc:
        recycle_bin._editor({"role": role})
    refused(exc, 403, "forbidden")


@pytest.mark.parametrize(
    "kind,category",
    [("employee", "employee"), ("workflow_request", "workflow_request"), ("hr_leave", "hr_leave"),
     ("document", "other"), ("auth_account_duplicate", "other"), ("attendance_duplicate", "other")],
)
def test_categories(kind, category):
    assert recycle_bin._category(kind) == category


def test_only_three_kinds_can_be_restored():
    assert set(recycle_bin.RESTORABLE) == {"employee", "workflow_request", "hr_leave"}
    assert set(recycle_bin.CATEGORIES) == {"employee", "workflow_request", "hr_leave", "other"}


def test_ids_must_be_uuids():
    assert recycle_bin._uuid("1b4e28ba-2fa1-11d2-883f-0016d3cca427", "ids").startswith("1b4e28ba")
    with pytest.raises(ApiError) as exc:
        recycle_bin._uuid("not-a-uuid", "ids")
    refused(exc, 422, "validation_error")


def test_a_restore_refusal_carries_its_sentence():
    for code in recycle_bin._STATE:
        error = recycle_bin._refuse(code)
        assert error.code == code.lower()
        assert error.status in (404, 409)
        assert error.message


# --------------------------------------------------------------------------------- business cards: the design

def test_design_must_be_an_object():
    with pytest.raises(ApiError) as exc:
        bizcards._design("nope", "design")
    refused(exc, 422, "validation_error")
    with pytest.raises(ApiError) as exc:
        bizcards._design([], "cfg")
    refused(exc, 422, "validation_error")


def test_design_is_size_limited():
    too_big = {"card": "x" * (bizcards.MAX_DESIGN_BYTES + 10)}
    with pytest.raises(ApiError) as exc:
        bizcards._design(too_big, "design")
    refused(exc, 413, "value_too_large")


def test_a_design_is_returned_untouched():
    design = {"card": {"front": {"bg": "@W", "els": []}}, "badge": {"front": {"bg": "@A", "els": []}}}
    assert bizcards._design(design, "design") is design


# ------------------------------------------------------------------- candidates: the closed lists and the ref

@pytest.mark.parametrize("value,expected", [("1", True), ("true", True), ("TRUE", True), ("on", True),
                                            ("0", False), ("false", False), ("", False), (None, False)])
def test_flag_spellings(value, expected):
    """The design stores `'1'`, this copy stores `'true'`; both mean on."""
    assert candidates._truthy(value) is expected


def test_every_file_type_maps_to_a_document_type_code():
    """`ariba_documents.document_type` has a foreign key here, so a moved file must become a code."""
    assert set(candidates.FILE_TYPES) == set(candidates.DOC_TYPE_CODE)
    for code in candidates.DOC_TYPE_CODE.values():
        assert code.isascii() and code.islower()


def test_candidate_reference_is_24_hex_characters():
    assert candidates._REF.match("0123456789abcdef01234567")
    assert not candidates._REF.match("0123456789ABCDEF01234567")
    assert not candidates._REF.match("0123")
    assert len(candidates._new_ref()) == 24 and candidates._REF.match(candidates._new_ref())



# ------------------------------------------------------------------------ the public form: what it may store

def test_clean_data_keeps_only_the_closed_list():
    body = {"nameAr": "أحمد", "email": "a@b.co", "mobile": "0500000000", "hacked": "x", "salary": 999,
            "notes": "y" * 400}
    clean = apply_router._clean_data(body)
    assert set(clean) <= set(candidates.DATA_FIELDS)
    assert "hacked" not in clean
    assert len(clean["notes"]) == 300


def test_clean_data_drops_objects_and_booleans():
    clean = apply_router._clean_data({"nameAr": {"x": 1}, "mobile": True, "email": "a@b.co"})
    assert clean == {"email": "a@b.co"}


def test_validation_names_the_missing_field():
    with pytest.raises(ApiError) as exc:
        apply_router._validate({"nameAr": "أح", "email": "a@b.co", "mobile": "1"})
    refused(exc, 422, "name_required")
    with pytest.raises(ApiError) as exc:
        apply_router._validate({"nameAr": "أحمد", "email": "not-an-email", "mobile": "1"})
    refused(exc, 422, "invalid_email")
    with pytest.raises(ApiError) as exc:
        apply_router._validate({"nameAr": "أحمد", "email": "a@b.co", "mobile": ""})
    refused(exc, 422, "mobile_required")
    assert apply_router._validate({"nameAr": "أحمد", "email": " A@B.co ", "mobile": "0500000000"}) == (
        "أحمد", "a@b.co")


def _file(mime="application/pdf", doc_type="cv", size=8):
    return {"type": doc_type, "mime": mime, "name": "cv.pdf", "base64": base64.b64encode(b"x" * size).decode()}


def test_files_are_checked_one_by_one():
    ok = apply_router._files_payload([_file()])
    assert ok[0]["size"] == 8 and ok[0]["name"] == "cv.pdf"
    with pytest.raises(ApiError) as exc:
        apply_router._files_payload([_file()] * (candidates.MAX_FILES + 1))
    refused(exc, 422, "too_many_files")
    with pytest.raises(ApiError) as exc:
        apply_router._files_payload([_file(mime="application/zip")])
    refused(exc, 422, "unsupported_type")
    with pytest.raises(ApiError) as exc:
        apply_router._files_payload([_file(doc_type="passport_photo")])
    refused(exc, 422, "unknown_doc_type")
    with pytest.raises(ApiError) as exc:
        apply_router._files_payload([{**_file(), "base64": "%%%not-base64%%%"}])
    refused(exc, 422, "invalid_file")


def test_a_file_name_is_reduced_to_word_characters():
    payload = apply_router._files_payload([{**_file(), "name": "../../etc/pass<w>d;.pdf"}])
    assert payload[0]["name"] == ".._.._etc_pass_w_d_.pdf"


@pytest.mark.parametrize(
    "row,state",
    [(None, "invalid"), ({"revoked_at": datetime.now(UTC)}, "revoked"),
     ({"used_at": datetime.now(UTC)}, "used"),
     ({"expires_at": datetime(2020, 1, 1, tzinfo=UTC)}, "expired"),
     ({"expires_at": datetime(2099, 1, 1, tzinfo=UTC)}, "ok")],
)
def test_invite_states(row, state):
    assert apply_router._invite_state(row) is state


# ------------------------------------------------------------------------------ the routes are really mounted

def test_the_new_routes_are_mounted():
    from app.main import app

    paths = {route.path for route in app.routes}
    for path in ("/api/v1/audit-log", "/api/v1/audit-log/modules", "/api/v1/audit-log/purge",
                 "/api/v1/audit-log/purge/{request_id}/decide", "/api/v1/recycle-bin",
                 "/api/v1/recycle-bin/{item_id}/restore", "/api/v1/recycle-bin/purge", "/api/v1/candidates",
                 "/api/v1/candidates/invites", "/api/v1/candidates/files/{file_id}",
                 "/api/v1/candidates/{candidate_id}/accept", "/api/v1/candidates/{candidate_id}/reject",
                 "/api/v1/bizcards", "/api/v1/bizcards/{employee_id}", "/api/v1/me/bizcard",
                 "/api/v1/public/apply/{form_key}", "/api/v1/public/apply/invite/{token}"):
        assert path in paths, path



# ------------------------------------------------------------------------------------------ with a database

@pytest.fixture
def db():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    engine = create_engine(os.environ["CANONICAL_TEST_DATABASE_URL"])
    connection = engine.connect()
    outer = connection.begin()
    session = Session(bind=connection)
    try:
        yield session
    finally:
        outer.rollback()
        connection.close()
        engine.dispose()


HR = {"account_id": None, "employee_id": "40", "role": "hr", "username": "EMP040", "name_ar": "موارد"}
FINANCE = {"account_id": None, "employee_id": "15", "role": "finance", "username": "EMP015", "name_ar": "مالية"}


def _audit(**over):
    args = {"modules": None, "module": None, "actor_username": None, "q": None, "date_from": None,
            "date_to": None, "limit": 300, "offset": 0}
    args.update(over)
    return args


@needs_db
def test_the_log_answers_with_real_rows_newest_first(db):
    page = audit_log.audit_list(**_audit(limit=5), actor=HR, db=db)
    assert page["total"] > 0
    assert len(page["items"]) <= 5
    dates = [row["at"] for row in page["items"]]
    assert dates == sorted(dates, reverse=True)


@needs_db
def test_finance_cannot_read_a_salary_change(db):
    """The lock is in the query, not the screen: asked for `employees`, finance is answered with nothing."""
    page = audit_log.audit_list(**_audit(module="employees", limit=5), actor=FINANCE, db=db)
    assert page == {"items": [], "total": 0, "limit": 5, "offset": 0}


@needs_db
def test_finance_only_ever_reads_its_four_modules(db):
    page = audit_log.audit_list(**_audit(limit=50), actor=FINANCE, db=db)
    assert {row["module"] for row in page["items"]} <= set(audit_log.FINANCE_MODULES)


@needs_db
def test_only_old_months_are_offered_for_purging(db):
    info = audit_log.audit_purge_info(actor=HR, db=db)
    assert info["is_finance"] is False
    for month in info["months"]:
        assert audit_log._month_eligible(month["month"], datetime.now(UTC))
        assert month["count"] > 0


@needs_db
def test_the_bin_lists_the_four_categories(db):
    listing = recycle_bin.bin_list(actor=HR, db=db)
    assert listing["total"] == sum(listing["counts"].values())
    assert set(listing["counts"]) == {"employee", "workflow_request", "hr_leave", "other"}
    for item in listing["items"]:
        assert item["restorable"] is (item["kind"] in recycle_bin.RESTORABLE)


@needs_db
def test_bizcards_answer_even_before_any_design_is_saved(db):
    payload = bizcards.list_bizcards(actor=HR, db=db)
    assert payload["can_edit"] is True
    assert isinstance(payload["employees"], list)
    for employee in payload["employees"]:
        assert {"id", "emp_no", "name_ar", "job_title", "department", "mobile", "email"} <= set(employee)

