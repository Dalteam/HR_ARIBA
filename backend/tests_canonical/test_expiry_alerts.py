"""Expiry alerts (Stage 13): the settings shape, the dates, and the daily bell rules.

The settings and the date rules run without a database. The tests at the end need `CANONICAL_TEST_DATABASE_URL`
(a throwaway copy of `ariba_src` **with migration 005 applied**) and run inside a transaction that is rolled back.
"""

from __future__ import annotations

import os
from datetime import date, timedelta

import pytest

from app.services import expiry_alerts as ea

needs_db = pytest.mark.skipif(
    not os.environ.get("CANONICAL_TEST_DATABASE_URL"),
    reason="Requires a disposable restored canonical PostgreSQL database with migration 005",
)
NOV_4 = date(2026, 11, 4)


# ------------------------------------------------------------------------------------------- without a database

def test_the_defaults_are_the_clients_setting():
    cfg = ea.normalize(None)
    assert set(cfg) == set(ea.KINDS) | {"probation_default"}
    assert cfg["probation_default"] == 90
    assert {k: cfg[k]["before"] for k in ea.KINDS} == {"probation": 30, "contract": 60, "iqama": 60, "passport": 90,
                                                       "insurance": 90, "natAddr": 60, "gosiCert": 60}
    for kind in ea.KINDS:
        assert cfg[kind]["n"] == {"on": True, "before": 10, "ch": ["program", "app", "email"], "to": ["hr"]}


def test_normalize_keeps_the_lists_clean_and_numbers_bounded():
    cfg = ea.normalize({"iqama": {"before": "-5", "n": {"on": False, "before": 99999, "ch": ["app", "fax"], "to": ["employee", "x"]}},
                        "probation_default": "abc"})
    assert cfg["iqama"]["before"] == 0
    assert cfg["iqama"]["n"] == {"on": False, "before": 3650, "ch": ["app"], "to": ["employee"]}
    assert cfg["probation_default"] == 90
    assert ea.normalize({"passport": "nope"})["passport"] == ea.normalize(None)["passport"]


@pytest.mark.parametrize("data,expected", [
    ({"contractJoin": "2026-01-01", "probationDays": "60"}, date(2026, 3, 2)),
    ({"contractJoin": "2026-01-01", "probationDays": "custom", "probationEnd": "2026-02-15"}, date(2026, 2, 15)),
    ({"contractJoin": "2026-01-01"}, date(2026, 4, 1)),  # the 90-day default
    ({}, None),
])
def test_probation_ends_as_the_design_reads_it(data, expected):
    assert ea.expiry("probation", data, 90) == expected


def test_a_contract_ends_on_its_date_or_after_its_duration():
    assert ea.expiry("contract", {"contractEnd": "2027-06-30"}, 90) == date(2027, 6, 30)
    assert ea.expiry("contract", {"contractJoin": "2026-01-31", "contractDuration": "13"}, 90) == date(2027, 2, 28)
    assert ea.expiry("contract", {"contractJoin": "2026-01-31", "contractDuration": "12", "contractNature": "غير محدد المدة"}, 90) is None


def test_the_document_dates_come_from_their_fields():
    data = {"iqamaExpiry": "2026-12-01", "passportExpiry": "2027-01-01", "insuranceExpiry": "2026-11-20",
            "nationalAddressExpiry": "2026-11-10", "gosiCertExpiry": "bad"}
    assert [ea.expiry(k, data, 90) for k in ("iqama", "passport", "insurance", "natAddr", "gosiCert")] == \
        [date(2026, 12, 1), date(2027, 1, 1), date(2026, 11, 20), date(2026, 11, 10), None]


def test_routes_are_mounted():
    from app.main import create_app

    paths = {route.path for route in create_app().routes}
    for path in ("/api/v1/settings/alerts", "/api/v1/alerts/run", "/api/v1/alerts/status"):
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


def _only(db, employee_id: str, **fields) -> None:
    """Clear every alert date in the copy, then give one employee the dates of the test."""
    import json

    from sqlalchemy import text

    db.execute(text("""UPDATE public.employee_directory SET data = data - 'iqamaExpiry' - 'passportExpiry' - 'insuranceExpiry'
        - 'nationalAddressExpiry' - 'gosiCertExpiry' - 'contractEnd' - 'contractJoin' - 'contractDuration' - 'probationDays'
        - 'probationEnd'"""))
    db.execute(text("UPDATE public.employee_directory SET data = data || CAST(:d AS jsonb) WHERE employee_id=:e"),
               {"d": json.dumps(fields), "e": employee_id})


def _someone(db) -> str:
    from sqlalchemy import text

    return db.scalar(text("SELECT employee_id FROM public.employee_directory WHERE active ORDER BY employee_id LIMIT 1"))


@needs_db
def test_one_bell_a_day_to_hr_until_the_date_is_renewed(db):
    from sqlalchemy import text

    assert ea.tables_ready(db)
    hr = db.scalars(text("SELECT employee_id FROM public.workflow_approvers WHERE stage='hr'")).all()
    assert hr, "the copy needs an HR approver"
    emp = _someone(db)
    _only(db, emp, iqamaExpiry=(NOV_4 + timedelta(days=5)).isoformat())
    first = ea.run(db, NOV_4)
    assert first == {"sent": len(set(hr)), "duplicates": 0}
    assert ea.run(db, NOV_4) == {"sent": 0, "duplicates": len(set(hr))}  # same day: nothing new
    assert ea.run(db, NOV_4 + timedelta(days=1))["sent"] == len(set(hr))  # next day: rung again
    bell = db.execute(text("""SELECT title, body, stage, kind FROM public.workflow_notifications
        WHERE kind='alert' AND recipient_employee_id=:r ORDER BY created_at DESC LIMIT 1"""), {"r": hr[0]}).mappings().first()
    assert bell["stage"] == "hr" and "الإقامة" in bell["title"]
    _only(db, emp, iqamaExpiry=(NOV_4 + timedelta(days=400)).isoformat())  # renewed
    assert ea.run(db, NOV_4 + timedelta(days=1))["sent"] == 0


@needs_db
def test_outside_the_window_or_email_only_rings_nothing(db):
    import json

    from sqlalchemy import text

    emp = _someone(db)
    _only(db, emp, passportExpiry=(NOV_4 + timedelta(days=11)).isoformat())
    assert ea.run(db, NOV_4)["sent"] == 0  # 11 days away, the bell starts at 10
    _only(db, emp, passportExpiry=(NOV_4 + timedelta(days=3)).isoformat())
    cfg = ea.normalize(None)
    cfg["passport"]["n"]["ch"] = ["email"]
    db.execute(text("""INSERT INTO public.ariba_app_settings(key, value) VALUES ('alerts_cfg', CAST(:v AS jsonb))
        ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value"""), {"v": json.dumps(cfg)})
    assert ea.run(db, NOV_4)["sent"] == 0  # e-mail only, and e-mail is off


@needs_db
def test_the_employee_gets_their_own_alert_on_the_app_channel(db):
    import json

    from sqlalchemy import text

    emp = _someone(db)
    _only(db, emp, insuranceExpiry=(NOV_4 - timedelta(days=2)).isoformat())
    cfg = ea.normalize(None)
    cfg["insurance"]["n"]["to"] = ["employee"]
    db.execute(text("""INSERT INTO public.ariba_app_settings(key, value) VALUES ('alerts_cfg', CAST(:v AS jsonb))
        ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value"""), {"v": json.dumps(cfg)})
    assert ea.run(db, NOV_4)["sent"] == 1
    body = db.scalar(text("""SELECT body FROM public.workflow_notifications WHERE kind='alert' AND recipient_employee_id=:e
        ORDER BY created_at DESC LIMIT 1"""), {"e": emp})
    assert "منتهٍ منذ 2 يوم" in body and "الخاص بك" in body
