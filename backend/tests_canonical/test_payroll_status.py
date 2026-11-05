"""Payroll «prepare for finance» (Stage 19): prepare, the finance approval rule, reopen with a reason, the status.

Needs `CANONICAL_TEST_DATABASE_URL` (a throwaway copy of `ariba_src`) for the walk; it runs inside a transaction that is
rolled back, on a month far in the future so nothing real is touched.
"""

from __future__ import annotations

import json
import os

import pytest

from app.core.errors import ApiError
from app.routers import canonical, payroll_status

needs_db = pytest.mark.skipif(
    not os.environ.get("CANONICAL_TEST_DATABASE_URL"),
    reason="Requires a disposable restored canonical PostgreSQL database",
)

KEY, YEAR, MONTH = "pay_2098_04", 2098, 4


def test_a_short_reason_is_refused_and_no_reason_keeps_the_old_default():
    payroll_status.check_reason(None)
    payroll_status.check_reason({})
    payroll_status.check_reason({"reason": "خطأ في البدل"})
    with pytest.raises(ApiError) as exc:
        payroll_status.check_reason({"reason": " خطأ "})
    assert (exc.value.status, exc.value.code) == (422, "reason_required")


def test_only_finance_needs_a_prepared_month():
    payroll_status.before_approve(None, {"role": "admin"}, YEAR, MONTH)  # never reads the database
    payroll_status.before_approve(None, {"role": "chairman"}, YEAR, MONTH)


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
EMP = {"account_id": None, "employee_id": "2", "role": "employee", "username": "EMP002", "name_ar": "موظف"}


@needs_db
def test_draft_prepared_approved_reopened(db):
    from sqlalchemy import text

    with pytest.raises(ApiError) as exc:  # nothing saved yet
        payroll_status.prepare(KEY, request=None, body={}, actor=HR, db=db)
    assert exc.value.status == 404
    rows = [{"id": "2", "employee_id": "2", "net": 1000}]
    db.execute(text("""INSERT INTO public.payroll_archives_v2(pay_year, pay_month, approved, rows, saved_at, updated_at)
        VALUES (:y, :m, false, CAST(:r AS jsonb), now(), now())"""), {"y": YEAR, "m": MONTH, "r": json.dumps(rows)})
    assert payroll_status.get_status(KEY, actor=FINANCE, db=db)["status"] == "draft"

    with pytest.raises(ApiError) as exc:  # finance cannot approve a month HR has not prepared
        canonical.approve_sheet(KEY, request=None, actor=FINANCE, db=db)
    assert (exc.value.status, exc.value.code) == (409, "payroll_not_prepared")
    with pytest.raises(ApiError) as exc:  # an employee cannot prepare
        payroll_status.prepare(KEY, request=None, body={}, actor=EMP, db=db)
    assert exc.value.status == 403

    done = payroll_status.prepare(KEY, request=None, body={"note": "جاهز"}, actor=HR, db=db)
    assert (done["status"], done["prepare_note"]) == ("prepared", "جاهز")
    canonical.approve_sheet(KEY, request=None, actor=FINANCE, db=db)
    after = payroll_status.get_status(KEY, actor=HR, db=db)
    assert after["status"] == "approved" and after["approved_by"]
    with pytest.raises(ApiError) as exc:
        payroll_status.prepare(KEY, request=None, body={}, actor=HR, db=db)
    assert exc.value.status == 409

    with pytest.raises(ApiError) as exc:
        canonical.reopen_payroll(KEY, request=None, body={"reason": "x"}, actor=FINANCE, db=db)
    assert exc.value.code == "reason_required"
    canonical.reopen_payroll(KEY, request=None, body={"reason": "خطأ في بدل السكن"}, actor=FINANCE, db=db)
    final = payroll_status.get_status(KEY, actor=HR, db=db)
    assert (final["status"], final["reopen_reason"]) == ("reopened", "خطأ في بدل السكن")
