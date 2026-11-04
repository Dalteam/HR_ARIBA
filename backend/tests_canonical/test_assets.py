"""Fixed assets and custody (Stage 10): the role gates, the form checks A1–A3, and the custody / delete paths.

The checks live in Python (`assets.asset_fields`), so most of this runs without a database. The tests at the end
need `CANONICAL_TEST_DATABASE_URL` (a throwaway copy of `ariba_src`) and run inside a transaction that is rolled
back: they add, edit, hand over, return and delete a real row, and prove the snapshot lands in the bin.
"""

from __future__ import annotations

import os
from datetime import date
from decimal import Decimal

import pytest

from app.core.errors import ApiError
from app.routers import assets

needs_db = pytest.mark.skipif(
    not os.environ.get("CANONICAL_TEST_DATABASE_URL"),
    reason="Requires a disposable restored canonical PostgreSQL database",
)

LAPTOP = {"name": "  حاسب محمول  ", "category": "computers", "acquisition_date": "2026-01-15", "cost": "4800",
          "salvage_value": 0, "useful_life_months": 48, "serial_no": "SN-1"}


def refused(exc_info, status: int, code: str) -> None:
    assert (exc_info.value.status, exc_info.value.code) == (status, code), exc_info.value.message


# ------------------------------------------------------------------------------------------------ role gates

@pytest.mark.parametrize("role", ["hr", "admin", "admin_manager", "finance"])
def test_the_four_editing_roles_may_read_and_write(role):
    assets._reader({"role": role})
    assets._editor({"role": role})


def test_the_ceo_reads_but_never_writes():
    """AS2 / AS3."""
    assets._reader({"role": "ceo"})
    with pytest.raises(ApiError) as exc:
        assets._editor({"role": "ceo"})
    refused(exc, 403, "forbidden")


@pytest.mark.parametrize("role", ["employee", "manager", "chairman", ""])
def test_everyone_else_is_refused(role):
    """AS1."""
    for gate in (assets._reader, assets._editor):
        with pytest.raises(ApiError) as exc:
            gate({"role": role})
        refused(exc, 403, "forbidden")


# ------------------------------------------------------------------------------------------- the form, A1–A3

def test_a_good_form_is_cleaned():
    fields = assets.asset_fields(LAPTOP)
    assert fields["name"] == "حاسب محمول"
    assert fields["acquisition_date"] == date(2026, 1, 15)
    assert fields["cost"] == Decimal("4800.00")
    assert fields["useful_life_months"] == 48
    assert (fields["status"], fields["disposal_date"], fields["disposal_value"]) == ("active", None, Decimal("0"))
    assert fields["capitalized"] is True
    assert (fields["serial_no"], fields["location"]) == ("SN-1", None)


def test_life_in_years_is_turned_into_months_and_defaults_to_five_years():
    assert assets.asset_fields({**LAPTOP, "useful_life_months": None, "useful_life_years": 2.5})["useful_life_months"] == 30
    assert assets.asset_fields({k: v for k, v in LAPTOP.items() if k != "useful_life_months"})["useful_life_months"] == 60


@pytest.mark.parametrize("change", [
    {"name": "   "}, {"name": None}, {"acquisition_date": ""}, {"acquisition_date": "15/01/2026"},
    {"cost": -1}, {"cost": "abc"}, {"cost": True}, {"cost": "NaN"}, {"salvage_value": 5000},
    {"useful_life_months": 0}, {"useful_life_months": 1201}, {"category": "jewels"}, {"status": "stolen"},
    {"capitalized": "yes"}, {"notes": "x" * 2001},
])
def test_bad_forms_are_refused(change):
    """AS4."""
    with pytest.raises(ApiError) as exc:
        assets.asset_fields({**LAPTOP, **change})
    refused(exc, 422, "validation_error")


@pytest.mark.parametrize("change", [{"status": "sold"}, {"status": "sold", "disposal_date": "2025-12-31"}])
def test_a_disposed_asset_needs_a_disposal_date_after_purchase(change):
    """AS5."""
    with pytest.raises(ApiError) as exc:
        assets.asset_fields({**LAPTOP, **change})
    refused(exc, 422, "validation_error")


def test_a_sold_asset_keeps_its_date_and_proceeds_and_going_back_to_active_clears_them():
    sold = assets.asset_fields({**LAPTOP, "status": "sold", "disposal_date": "2026-06-30", "disposal_value": "1500"})
    assert (sold["disposal_date"], sold["disposal_value"]) == (date(2026, 6, 30), Decimal("1500.00"))
    back = assets.asset_fields({"status": "active"}, existing=sold)
    assert (back["status"], back["disposal_date"], back["disposal_value"]) == ("active", None, Decimal("0"))


def test_an_edit_keeps_what_the_body_leaves_out():
    existing = assets.asset_fields(LAPTOP)
    edited = assets.asset_fields({"location": "المستودع"}, existing=existing)
    assert edited["location"] == "المستودع"
    assert (edited["name"], edited["cost"], edited["serial_no"]) == ("حاسب محمول", Decimal("4800.00"), "SN-1")


def test_a_non_uuid_id_is_422():
    """AS6 (the malformed half)."""
    with pytest.raises(ApiError) as exc:
        assets._uuid("AST-0001")
    refused(exc, 422, "validation_error")


def test_routes_are_mounted():
    from app.main import create_app

    paths = {route.path for route in create_app().routes}
    for path in ("/api/v1/assets", "/api/v1/assets/{asset_id}", "/api/v1/assets/{asset_id}/custody"):
        assert path in paths, path


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


HR = {"account_id": None, "employee_id": "40", "role": "hr", "username": "EMP040", "name_ar": "موارد"}
FINANCE = {"account_id": None, "employee_id": "15", "role": "finance", "username": "EMP015", "name_ar": "مالية"}
CEO = {"account_id": None, "employee_id": "86", "role": "ceo", "username": "EMP086", "name_ar": "تنفيذي"}


def _someone(db) -> str:
    from sqlalchemy import text

    return db.scalar(text("SELECT employee_id FROM public.employee_directory WHERE active ORDER BY employee_id LIMIT 1"))


@needs_db
def test_add_hand_over_return_and_delete(db):
    from sqlalchemy import text

    added = assets.create_asset(dict(LAPTOP), request=None, actor=FINANCE, db=db)
    assert added["asset_no"].startswith("AST-") and added["name"] == "حاسب محمول"
    asset_id = str(added["id"])

    holder = _someone(db)
    given = assets.move_custody(asset_id, {"employee_id": holder, "date": "2026-02-01"}, request=None, actor=HR, db=db)
    assert (given["custodian_employee_id"], given["custody_date"]) == (holder, date(2026, 2, 1))
    returned = assets.move_custody(asset_id, {"employee_id": None}, request=None, actor=HR, db=db)
    assert returned["custodian_employee_id"] is None and returned["custody_date"] is None

    moves = [r["action"] for r in assets.list_assets(actor=CEO, db=db)["log"] if str(r["asset_id"]) == asset_id]
    assert moves == ["return", "assign"]  # newest first

    edited = assets.update_asset(asset_id, {"status": "lost", "disposal_date": "2026-03-01"}, request=None, actor=HR, db=db)
    assert edited["status"] == "lost" and edited["name"] == "حاسب محمول"

    assets.delete_asset(asset_id, request=None, actor=HR, db=db)
    snap = db.execute(text("""SELECT snapshot FROM public.ariba_deleted_items
        WHERE kind='asset' AND ref_id=:r"""), {"r": asset_id}).scalar_one()
    assert snap["asset_no"] == added["asset_no"] and len(snap["custody_log"]) == 2
    audit = db.scalar(text("SELECT count(*) FROM public.ariba_audit_log WHERE module='assets' AND entity_id=:r"),
                      {"r": asset_id})
    assert audit == 5  # add, hand over, return, edit, delete


@needs_db
def test_the_ceo_list_says_read_only_and_carries_no_people(db):
    listing = assets.list_assets(actor=CEO, db=db)
    assert listing["can_edit"] is False and listing["people"] == []


@needs_db
def test_finance_gets_the_custody_picker_with_names_only(db):
    people = assets.list_assets(actor=FINANCE, db=db)["people"]
    assert people
    for person in people:
        assert set(person) == {"employee_id", "name_ar", "name_en", "emp_no"}


@needs_db
def test_unknown_assets_and_employees_are_404(db):
    """AS6 / AS7."""
    missing = "00000000-0000-0000-0000-000000000000"
    for call in (lambda: assets.update_asset(missing, {}, request=None, actor=HR, db=db),
                 lambda: assets.delete_asset(missing, request=None, actor=HR, db=db),
                 lambda: assets.move_custody(missing, {}, request=None, actor=HR, db=db)):
        with pytest.raises(ApiError) as exc:
            call()
        refused(exc, 404, "not_found")
    added = assets.create_asset(dict(LAPTOP), request=None, actor=HR, db=db)
    with pytest.raises(ApiError) as exc:
        assets.move_custody(str(added["id"]), {"employee_id": "no-such-person"}, request=None, actor=HR, db=db)
    refused(exc, 404, "employee_not_found")
