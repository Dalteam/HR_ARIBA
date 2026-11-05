"""Employee record extras (Stage 17): probation, national address, GOSI certificate, allowances as a % of basic,
certificate details and the certificates report.

The field checks run without a database. The tests at the end need `CANONICAL_TEST_DATABASE_URL` (a throwaway copy of
`ariba_src` with migration 007) and run inside a transaction that is rolled back.
"""

from __future__ import annotations

import os
import uuid

import pytest

from app.core.errors import ApiError
from app.routers import documents_meta
from app.services import employee_map as emap

needs_db = pytest.mark.skipif(
    not os.environ.get("CANONICAL_TEST_DATABASE_URL"),
    reason="Requires a disposable restored canonical PostgreSQL database with migration 007",
)


# ------------------------------------------------------------------------------------------- without a database

@pytest.mark.parametrize("body", [
    {"probation_days": "45"}, {"probation_days": "custom"}, {"probation_end": "31/12/2026"},
    {"national_address_expiry": "soon"}, {"gosi_no": "1" * 31}, {"allow_modes": {"bonus": {"pct": 5}}},
    {"allow_modes": {"housing_allowance": {"pct": 1001}}}, {"allow_modes": {"housing_allowance": {"pct": True}}},
    {"allow_modes": []},
])
def test_bad_extras_are_named(body):
    assert emap.check_extras(body)


def test_good_extras_pass():
    assert emap.check_extras({"probation_days": "custom", "probation_end": "2026-12-31", "gosi_no": "12345",
                              "national_address_expiry": "2027-01-01", "allow_modes": {"housing_allowance": {"pct": 25}}}) is None


def test_an_allowance_kept_as_a_percent_is_stored_as_its_amount_and_follows_the_basic():
    data, _ = emap.apply_input({}, {"basic_salary": 10000, "allow_modes": {"housing_allowance": {"pct": 25}}})
    assert data["housingAllowance"] == 2500 and data["allowModes"] == {"housingAllowance": {"m": "pct", "p": 25.0}}
    data, _ = emap.apply_input(data, {"basic_salary": 12000})
    assert data["housingAllowance"] == 3000 and data["salaryTotal"] == 15000
    data, _ = emap.apply_input(data, {"allow_modes": {}})
    assert data["allowModes"] == {} and data["housingAllowance"] == 3000  # back to a fixed amount, the amount kept


def test_the_extras_read_back_and_the_percent_is_hidden_without_salary_rights():
    row = {"employee_id": "7", "data": {"probationDays": "60", "gosiNo": "99", "gosiCertExpiry": "2027-02-01",
                                         "allowModes": {"housingAllowance": {"m": "pct", "p": 25}}}}
    from datetime import date

    out = emap.employee_out(row, may_salary=False, may_ids=False, manager=None, has_account=False, rules=[], today=date(2026, 11, 5))
    assert (out["probation_days"], out["gosi_no"], out["gosi_cert_expiry"]) == ("60", "99", date(2027, 2, 1))
    assert out["allow_modes"] == {}
    out = emap.employee_out(row, may_salary=True, may_ids=True, manager=None, has_account=False, rules=[], today=date(2026, 11, 5))
    assert out["allow_modes"] == {"housing_allowance": {"pct": 25.0}}


def test_certificate_details_are_checked():
    assert documents_meta.meta_in({"title": " PMP ", "issue_date": "2025-01-01"})["title"] == "PMP"
    for bad in ({"issue_date": "x"}, {"title": "x" * 201}, {"issue_date": "2026-01-01", "expiry_date": "2025-01-01"}):
        with pytest.raises(ApiError) as exc:
            documents_meta.meta_in(bad)
        assert exc.value.status == 422


# ------------------------------------------------------------------------------------------ with a database

@pytest.fixture
def db():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    engine = create_engine(os.environ["CANONICAL_TEST_DATABASE_URL"])
    connection = engine.connect()
    outer = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        outer.rollback()
        connection.close()
        engine.dispose()


ADMIN = {"account_id": None, "employee_id": "10", "role": "admin", "username": "EMP010", "name_ar": "مدير"}
EMP = {"account_id": None, "employee_id": "2", "role": "employee", "username": "EMP002", "name_ar": "موظف"}


@needs_db
def test_the_extras_save_reach_the_register_and_the_alerts(db):
    from app.routers import canonical
    from app.services import expiry_alerts

    emp = db.scalar(canonical.text("SELECT employee_id FROM public.employee_directory WHERE active ORDER BY employee_id LIMIT 1"))
    out = canonical.update_employee(emp, {"national_address_expiry": "2026-11-10", "gosi_no": "555", "gosi_cert_expiry": "2026-11-12",
                                          "probation_days": "custom", "probation_end": "2026-11-20"}, request=None, actor=ADMIN, db=db)
    assert (out["gosi_no"], str(out["probation_end"])) == ("555", "2026-11-20")
    row = next(r for r in canonical.document_registry(actor=ADMIN, db=db) if r["id"] == emp)
    assert (row["national_address_expiry"], row["gosi_cert_expiry"], row["gosi_no"]) == ("2026-11-10", "2026-11-12", "555")
    data = canonical._row(db, "SELECT data FROM public.employee_directory WHERE employee_id=:e", e=emp)["data"]
    assert str(expiry_alerts.expiry("natAddr", data, 90)) == "2026-11-10"
    with pytest.raises(ApiError) as exc:
        canonical.update_employee(emp, {"probation_days": "45"}, request=None, actor=ADMIN, db=db)
    assert exc.value.status == 422


@needs_db
def test_certificate_details_and_the_report(db):
    from app.routers import canonical

    emp = db.scalar(canonical.text("SELECT employee_id FROM public.employee_directory WHERE active ORDER BY employee_id LIMIT 1"))
    doc = db.scalar(canonical.text("""INSERT INTO public.ariba_documents(employee_id, document_type, file_name, mime_type, file_data)
        VALUES (:e, 'professional', 'pmp.pdf', 'application/pdf', 'x') RETURNING id"""), {"e": emp})
    documents_meta.set_meta(doc, {"title": "PMP", "issuer": "PMI", "issue_date": "2025-03-01", "expiry_date": "2028-03-01"},
                            request=None, actor=ADMIN, db=db)
    report = documents_meta.all_attachments(types="professional", actor=ADMIN, db=db)
    mine = next(r for r in report if r["id"] == doc)
    assert (mine["title"], mine["issuer"], str(mine["expiry_date"])) == ("PMP", "PMI", "2028-03-01")
    assert "file_data" not in mine
    listed = next(r for r in canonical.list_documents(emp, actor=ADMIN, db=db) if r["id"] == doc)
    assert listed["title"] == "PMP"
    with pytest.raises(ApiError) as exc:
        documents_meta.set_meta(doc, {"title": "x"}, request=None, actor=EMP, db=db)
    assert exc.value.status == 403
    with pytest.raises(ApiError) as exc:
        documents_meta.set_meta(uuid.uuid4(), {"title": "x"}, request=None, actor=ADMIN, db=db)
    assert exc.value.status == 404
