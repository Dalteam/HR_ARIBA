"""The employee's own leave actions (Stage 14): cancel or edit a pending leave, ask to cancel an approved one.

The tests at the end need `CANONICAL_TEST_DATABASE_URL` (a throwaway copy of `ariba_src` **with migration 006**)
and run inside a transaction that is rolled back; they create their own requests.
"""

from __future__ import annotations

import os
import uuid
from datetime import date, timedelta

import pytest

from app.core.errors import ApiError
from app.routers import canonical, leave_actions, me_leave

needs_db = pytest.mark.skipif(
    not os.environ.get("CANONICAL_TEST_DATABASE_URL"),
    reason="Requires a disposable restored canonical PostgreSQL database with migration 006",
)


def refused(exc_info, status: int, code: str) -> None:
    assert (exc_info.value.status, exc_info.value.code) == (status, code), exc_info.value.message


def test_a_cancel_request_ends_at_hr():
    assert canonical.DEFAULT_FINAL_BY_TYPE["leave_cancel"] == "hr"


def test_routes_are_mounted():
    from app.main import create_app

    paths = {route.path for route in create_app().routes}
    for path in ("/api/v1/me/requests/{request_id}/cancel", "/api/v1/me/requests/{request_id}/dates",
                 "/api/v1/me/requests/{request_id}/cancel-request", "/api/v1/me/leave-policy"):
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


def _employee(db) -> str:
    from sqlalchemy import text

    return db.scalar(text("""SELECT employee_id FROM public.employee_directory
        WHERE active AND manager_id IS NOT NULL AND manager_id<>employee_id ORDER BY employee_id LIMIT 1"""))


def _me(emp: str) -> dict:
    return {"account_id": None, "employee_id": emp, "role": "employee", "username": "u", "name_ar": "موظف"}


def _leave(db, emp: str, stage: str, leave_type: str = "unpaid", start: date | None = None) -> uuid.UUID:
    from sqlalchemy import text

    start = start or date.today() + timedelta(days=40)
    end = start + timedelta(days=2)
    rid = db.scalar(text("""INSERT INTO public.workflow_requests(employee_id, request_type, payload, current_stage)
        VALUES (:e, :t, CAST(:p AS jsonb), :s) RETURNING id"""),
        {"e": emp, "t": leave_type, "s": stage, "p": f'{{"from": "{start}", "to": "{end}", "days": 3}}'})
    db.execute(text("""INSERT INTO public.leave_requests(employee_id, leave_type, from_date, to_date, days, workflow_request_id)
        VALUES (:e, :t, :f, :to, 3, :r)"""), {"e": emp, "t": leave_type, "f": start, "to": end, "r": rid})
    return rid


def _status(db, rid) -> dict:
    from sqlalchemy import text

    return dict(db.execute(text("SELECT status, current_stage, payload FROM public.workflow_requests WHERE id=:r"),
                           {"r": rid}).mappings().one())


@needs_db
def test_an_employee_cancels_their_own_pending_leave_only(db):
    emp = _employee(db)
    rid = _leave(db, emp, "manager")
    done = me_leave.cancel_my_leave(rid, {"reason": "تغيرت الخطة"}, request=None, actor=_me(emp), db=db)
    assert done["cancelled"] is True
    row = _status(db, rid)
    assert row["status"] == "rejected" and row["payload"]["cancelled"]["kind"] == "employee"
    other = _leave(db, emp, "manager")
    with pytest.raises(ApiError) as exc:
        me_leave.cancel_my_leave(other, {}, request=None, actor=_me("no-such-employee"), db=db)
    refused(exc, 404, "not_found")  # someone else's request is never confirmed
    approved = _leave(db, emp, "completed")
    with pytest.raises(ApiError) as exc:
        me_leave.cancel_my_leave(approved, {}, request=None, actor=_me(emp), db=db)
    refused(exc, 409, "request_not_pending")
    leave_actions.put_leave_policy({"emp_cancel_pending": False}, request=None, actor=HR, db=db)
    with pytest.raises(ApiError) as exc:
        me_leave.cancel_my_leave(other, {}, request=None, actor=_me(emp), db=db)
    refused(exc, 403, "feature_disabled")


@needs_db
def test_an_employee_changes_the_dates_of_a_pending_leave(db):
    from sqlalchemy import text

    emp = _employee(db)
    rid = _leave(db, emp, "manager")
    start = date.today() + timedelta(days=60)
    done = me_leave.edit_my_leave(rid, {"from": start.isoformat(), "to": (start + timedelta(days=4)).isoformat()},
                                  request=None, actor=_me(emp), db=db)
    assert done["days"] == 5  # unpaid leave counts calendar days
    row = _status(db, rid)
    assert row["payload"]["from"] == start.isoformat() and row["payload"]["edited"][-1]["old_days"] == 3
    assert db.scalar(text("SELECT days FROM public.leave_requests WHERE workflow_request_id=:r"), {"r": rid}) == 5
    with pytest.raises(ApiError) as exc:
        me_leave.edit_my_leave(rid, {"from": "2026-12-10", "to": "2026-12-01"}, request=None, actor=_me(emp), db=db)
    refused(exc, 422, "validation_error")
    annual = _leave(db, emp, "manager", leave_type="annual")
    with pytest.raises(ApiError) as exc:  # far more working days than any balance
        me_leave.edit_my_leave(annual, {"from": "2027-01-03", "to": "2027-12-28"}, request=None, actor=_me(emp), db=db)
    refused(exc, 422, "exceeds_balance")


@needs_db
def test_a_cancel_request_once_approved_cancels_the_leave(db):
    emp = _employee(db)
    target = _leave(db, emp, "completed", leave_type="annual")
    sent = me_leave.request_cancel(target, {"reason": "ظرف طارئ"}, request=None, actor=_me(emp), db=db)
    assert sent["current_stage"] == "manager"
    with pytest.raises(ApiError) as exc:
        me_leave.request_cancel(target, {}, request=None, actor=_me(emp), db=db)
    refused(exc, 409, "cancel_pending")
    pending = _leave(db, emp, "manager")
    with pytest.raises(ApiError) as exc:
        me_leave.request_cancel(pending, {}, request=None, actor=_me(emp), db=db)
    refused(exc, 409, "only_approved_leave")
    canonical.hr_final_approve(uuid.UUID(sent["id"]), {}, request=None, actor=HR, db=db)
    assert _status(db, uuid.UUID(sent["id"]))["status"] == "approved"
    row = _status(db, target)
    assert row["status"] == "rejected" and row["payload"]["cancelled"]["kind"] == "request"


@needs_db
def test_my_list_says_a_cancel_request_is_waiting_and_shows_only_whitelisted_details(db):
    """Group 1 fix (owner's test, 5 Nov 2026): the screens hide a second «طلب إلغاء» and say the leave was cancelled."""
    emp = _employee(db)
    target = _leave(db, emp, "completed", leave_type="annual")
    db.execute(canonical.text("UPDATE public.workflow_requests SET payload = payload || '{\"iban\": \"SA00\"}'::jsonb WHERE id=:r"),
               {"r": target})
    me_leave.request_cancel(target, {}, request=None, actor=_me(emp), db=db)
    listed = {str(r["id"]): r for r in canonical.my_requests(actor=_me(emp), db=db)}
    row = listed[str(target)]
    assert row["cancel_pending"] is True
    assert "iban" not in row["payload"] and set(row["payload"]) <= set(canonical.ME_PAYLOAD_KEYS) | {"escalated_from", "return_note"}
    other = _leave(db, emp, "manager")
    me_leave.cancel_my_leave(other, {"reason": "تغيّر الموعد"}, request=None, actor=_me(emp), db=db)
    cancelled = {str(r["id"]): r for r in canonical.my_requests(actor=_me(emp), db=db)}[str(other)]
    assert cancelled["payload"]["cancelled"]["reason"] == "تغيّر الموعد" and cancelled["cancel_pending"] is False


@needs_db
def test_the_employee_reads_only_their_four_switches(db):
    emp = _employee(db)
    assert me_leave.my_leave_policy(actor=_me(emp), db=db) == {
        "emp_cancel_pending": True, "emp_edit_pending": True, "emp_request_cancel_approved": True,
        "allow_advance_balance": False}


@needs_db
def test_using_leave_before_it_is_earned_raises_what_is_available(db):
    emp = _employee(db)
    today = date(date.today().year, 3, 1)
    before = me_leave.available_days(db, emp, today)
    leave_actions.put_leave_policy({"allow_advance_balance": True}, request=None, actor=HR, db=db)
    assert me_leave.available_days(db, emp, today) >= before
