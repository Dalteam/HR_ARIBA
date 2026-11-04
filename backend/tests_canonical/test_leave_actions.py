"""More HR leave actions (Stage 12): return to the manager, cancel, balance undo, the settings, escalation.

The bounds and defaults run without a database. The tests at the end need `CANONICAL_TEST_DATABASE_URL` (a
throwaway copy of `ariba_src`) and run inside a transaction that is rolled back: they create their own requests,
age them, and walk each action end to end.
"""

from __future__ import annotations

import os
from datetime import date, timedelta

import pytest

from app.core.errors import ApiError
from app.routers import leave_actions
from app.services import escalation

needs_db = pytest.mark.skipif(
    not os.environ.get("CANONICAL_TEST_DATABASE_URL"),
    reason="Requires a disposable restored canonical PostgreSQL database",
)


def refused(exc_info, status: int, code: str) -> None:
    assert (exc_info.value.status, exc_info.value.code) == (status, code), exc_info.value.message


# ------------------------------------------------------------------------------------------- without a database

def test_the_policy_defaults_are_the_designs():
    """Q2 (owner, 4 Nov 2026): HR may cancel an approved leave unless the switch is turned off."""
    assert leave_actions.POLICY_DEFAULTS == {"emp_cancel_pending": True, "emp_edit_pending": True,
                                             "emp_request_cancel_approved": True, "hr_cancel_approved": True,
                                             "allow_advance_balance": False}


@pytest.mark.parametrize("value,expected", [(3, 3), ("5", 5), (0, 0), (None, 0), (-4, 0), (99, 60), ("x", 0)])
def test_waiting_days_are_read_inside_0_to_60(value, expected):
    assert escalation._wait_days({"k": value}, "k") == expected


@pytest.mark.parametrize("body", [
    {"manager_wait_days": 61}, {"manager_wait_days": -1}, {"ceo_wait_days": "x"}, {"advance_max_percent": 0},
    {"advance_max_percent": 1001}, {"final_by_type": []}, {"extra_hr_emails": ["not-an-address"]},
    {"extra_hr_emails": "a@b.co"}, {"extra_hr_emails": [f"p{i}@ariba.sa" for i in range(21)]}, [],
])
def test_bad_workflow_settings_are_refused(body):
    with pytest.raises(ApiError) as exc:
        leave_actions.workflow_change(None, body, {})
    refused(exc, 422, "validation_error")


def test_a_workflow_change_keeps_what_it_does_not_name():
    current = {"manager_wait_days": 3, "ceo_wait_days": 3, "final_by_type": {"unpaid": "hr"}, "legacy": True}
    out = leave_actions.workflow_change(None, {"manager_wait_days": 2, "advance_max_percent": 150,
                                               "extra_hr_emails": [" hr@ariba.sa ", ""]}, current)
    assert out == {"manager_wait_days": 2, "ceo_wait_days": 3, "final_by_type": {"unpaid": "hr"}, "legacy": True,
                   "advance_max_percent": 150, "extra_hr_emails": ["hr@ariba.sa"]}


def test_routes_are_mounted():
    from app.main import create_app

    paths = {route.path for route in create_app().routes}
    for path in ("/api/v1/requests/{request_id}/return-to-manager", "/api/v1/requests/{request_id}/cancel",
                 "/api/v1/leave/employees/{employee_id}/history", "/api/v1/leave/employees/{employee_id}/undo",
                 "/api/v1/settings/workflow", "/api/v1/settings/leave-policy", "/api/v1/requests/escalate"):
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


def _employee_with_manager(db) -> str:
    from sqlalchemy import text

    return db.scalar(text("""SELECT employee_id FROM public.employee_directory
        WHERE active AND manager_id IS NOT NULL AND manager_id<>employee_id ORDER BY employee_id LIMIT 1"""))


def _request(db, employee_id: str, stage: str, age_days: int = 0, leave: bool = True) -> str:
    from sqlalchemy import text

    start = date.today() + timedelta(days=30)
    rid = db.scalar(text("""INSERT INTO public.workflow_requests(employee_id, request_type, payload, current_stage,
            created_at, updated_at)
        VALUES (:e, 'annual', CAST(:p AS jsonb), :s, now() - make_interval(days => :a), now() - make_interval(days => :a))
        RETURNING id::text"""), {"e": employee_id, "p": f'{{"from": "{start}", "to": "{start + timedelta(days=2)}"}}',
                                 "s": stage, "a": age_days})
    if leave:
        db.execute(text("""INSERT INTO public.leave_requests(employee_id, leave_type, from_date, to_date, days, workflow_request_id)
            VALUES (:e, 'annual', :f, :t, 3, CAST(:r AS uuid))"""),
            {"e": employee_id, "f": start, "t": start + timedelta(days=2), "r": rid})
    return rid


def _row(db, rid: str) -> dict:
    from sqlalchemy import text

    return dict(db.execute(text("SELECT * FROM public.workflow_requests WHERE id=CAST(:r AS uuid)"), {"r": rid}).mappings().one())


@needs_db
def test_escalation_moves_only_the_overdue_requests_to_hr_once(db):
    from sqlalchemy import text

    emp = _employee_with_manager(db)
    db.execute(text("""UPDATE public.ariba_app_settings SET value = value || '{"manager_wait_days": 3, "ceo_wait_days": 3}'::jsonb
        WHERE key='workflow_config'"""))
    late, fresh = _request(db, emp, "manager", age_days=5), _request(db, emp, "manager", age_days=1)
    moved = escalation.escalate(db)
    assert moved >= 1
    late_row, fresh_row = _row(db, late), _row(db, fresh)
    assert (late_row["current_stage"], late_row["escalated_from"]) == ("hr", "manager")
    assert fresh_row["current_stage"] == "manager"
    bells = db.scalar(text("SELECT count(*) FROM public.workflow_notifications WHERE request_id=CAST(:r AS uuid)"), {"r": late})
    assert bells >= 2  # the employee, the manager, and HR's people when configured
    assert escalation.escalate(db) == 0 or _row(db, late)["escalated_at"] == late_row["escalated_at"]


@needs_db
def test_return_to_manager_needs_a_note_and_a_pending_request(db):
    emp = _employee_with_manager(db)
    rid = _request(db, emp, "hr")
    import uuid

    with pytest.raises(ApiError) as exc:
        leave_actions.return_to_manager(uuid.UUID(rid), {"note": " "}, request=None, actor=HR, db=db)
    refused(exc, 422, "reason_required")
    done = leave_actions.return_to_manager(uuid.UUID(rid), {"note": "يرجى الإفادة"}, request=None, actor=HR, db=db)
    assert done["current_stage"] == "manager"
    row = _row(db, rid)
    assert (row["current_stage"], row["return_note"]) == ("manager", "يرجى الإفادة")
    assert row["payload"]["returned"][-1]["note"] == "يرجى الإفادة"
    closed = _request(db, emp, "completed")
    with pytest.raises(ApiError) as exc:
        leave_actions.return_to_manager(uuid.UUID(closed), {"note": "x"}, request=None, actor=HR, db=db)
    refused(exc, 409, "request_not_pending")
    with pytest.raises(ApiError) as exc:
        leave_actions.return_to_manager(uuid.UUID(rid), {"note": "x"}, request=None,
                                        actor={**FINANCE, "role": "employee"}, db=db)
    refused(exc, 403, "forbidden")


@needs_db
def test_cancelling_an_approved_leave_returns_it_and_respects_the_switch(db):
    import uuid

    from sqlalchemy import text

    emp = _employee_with_manager(db)
    rid = _request(db, emp, "completed")
    assert _row(db, rid)["status"] == "approved"
    done = leave_actions.cancel_leave(uuid.UUID(rid), {"reason": "خطأ في التاريخ"}, request=None, actor=HR, db=db)
    assert done == {"id": rid, "status": "rejected", "cancelled": True, "was": "approved"}
    row = _row(db, rid)
    assert row["status"] == "rejected" and row["payload"]["cancelled"]["was"] == "approved"
    with pytest.raises(ApiError) as exc:
        leave_actions.cancel_leave(uuid.UUID(rid), {}, request=None, actor=HR, db=db)
    refused(exc, 409, "already_closed")
    not_leave = _request(db, emp, "completed", leave=False)
    with pytest.raises(ApiError) as exc:
        leave_actions.cancel_leave(uuid.UUID(not_leave), {}, request=None, actor=HR, db=db)
    refused(exc, 409, "not_a_leave")
    with pytest.raises(ApiError) as exc:
        leave_actions.cancel_leave(uuid.UUID(not_leave), {}, request=None, actor=FINANCE, db=db)
    refused(exc, 403, "forbidden")  # finance reads leaves, it does not edit them
    leave_actions.put_leave_policy({"hr_cancel_approved": False}, request=None, actor=HR, db=db)
    other = _request(db, emp, "completed")
    with pytest.raises(ApiError) as exc:
        leave_actions.cancel_leave(uuid.UUID(other), {}, request=None, actor=HR, db=db)
    refused(exc, 403, "feature_disabled")
    assert db.scalar(text("SELECT count(*) FROM public.ariba_audit_log WHERE module='settings' AND action='leave_policy'")) >= 1


@needs_db
def test_a_balance_save_can_be_undone(db):
    from app.routers import canonical

    emp = _employee_with_manager(db)
    before = canonical._balance_detail(db, emp)
    year = date.today().year
    canonical.update_leave_balance(emp, {"years": [{"year": year, "carry": 7, "entitlement": 21, "used": 1}], "note": "t"},
                                   request=None, actor=HR, db=db)
    assert leave_actions.balance_history(emp, actor=HR, db=db)["can_undo"] is True
    restored = leave_actions.undo_balance(emp, request=None, actor=HR, db=db)
    assert restored == before
    with pytest.raises(ApiError) as exc:
        while True:  # every kept save can be undone, then there is nothing left
            leave_actions.undo_balance(emp, request=None, actor=HR, db=db)
    refused(exc, 409, "nothing_to_undo")


@needs_db
def test_the_workflow_settings_round_trip(db):
    out = leave_actions.put_workflow({"manager_wait_days": 2, "final_by_type": {"unpaid": "ceo"}}, request=None,
                                     actor=HR, db=db)
    assert out["manager_wait_days"] == 2 and out["final_by_type"] == {"unpaid": "ceo"} and out["email_sending"] is False
    read = leave_actions.get_workflow(actor=FINANCE, db=db)  # finance reads it through `requests: view`
    assert read["manager_wait_days"] == 2 and read["types"]
    with pytest.raises(ApiError) as exc:
        leave_actions.put_workflow({"final_by_type": {"no_such_type": "hr"}}, request=None, actor=HR, db=db)
    refused(exc, 422, "validation_error")
    with pytest.raises(ApiError) as exc:
        leave_actions.put_workflow({"manager_wait_days": 1}, request=None, actor=FINANCE, db=db)
    refused(exc, 403, "forbidden")
