"""HR writes evaluations (Stage 15, owner 4 Nov 2026): HR's submitted evaluation is final at once.

Needs `CANONICAL_TEST_DATABASE_URL` (a throwaway copy of `ariba_src`); runs inside a transaction that is rolled back.
"""

from __future__ import annotations

import os

import pytest

from app.core.errors import ApiError
from app.routers import goals as goals_api

needs_db = pytest.mark.skipif(
    not os.environ.get("CANONICAL_TEST_DATABASE_URL"),
    reason="Requires a disposable restored canonical PostgreSQL database",
)


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
ITEMS = [{"title": "الحضور", "target": 100, "actual": 90, "weight": 50, "score": 90},
         {"title": "الجودة", "target": 100, "actual": 80, "weight": 50, "score": 80}]


def _someone(db) -> str:
    from sqlalchemy import text

    return db.scalar(text("SELECT employee_id FROM public.employee_directory WHERE active AND employee_id<>'40' ORDER BY employee_id LIMIT 1"))


@needs_db
def test_hr_draft_then_submit_is_final_and_reaches_the_employee(db):
    from sqlalchemy import text

    emp = _someone(db)
    draft = goals_api.save_evaluation(emp, "annual", "2026", {"items": ITEMS, "submit": False}, request=None, actor=HR, db=db)
    assert draft["evaluation"]["status"] == "draft"
    seen = goals_api.read_evaluation(request=None, employee_id=emp, period_type="annual", period_key="2026", actor=HR, db=db)
    assert seen["evaluation"]["status"] == "draft" and seen["can_write"] is True
    final = goals_api.save_evaluation(emp, "annual", "2026", {"items": ITEMS, "submit": True}, request=None, actor=HR, db=db)
    assert final["evaluation"]["status"] == "approved"            # no approval after HR (H1)
    bell = db.scalar(text("""SELECT title FROM public.workflow_notifications WHERE recipient_employee_id=:e AND kind='goals'
        ORDER BY created_at DESC LIMIT 1"""), {"e": emp})
    assert bell == "اعتُمد تقييمك"
    with pytest.raises(ApiError) as exc:                           # final means final, for HR too
        goals_api.save_evaluation(emp, "annual", "2026", {"items": ITEMS, "submit": False}, request=None, actor=HR, db=db)
    assert exc.value.status == 409


@needs_db
def test_hr_never_writes_its_own_evaluation(db):
    with pytest.raises(ApiError) as exc:
        goals_api.save_evaluation("40", "annual", "2026", {"items": ITEMS, "submit": True}, request=None, actor=HR, db=db)
    assert exc.value.status == 403
