"""Stage 20 settings: the working-hours schedule, the leave carry cap, the accrual method and the special types' rights.

The field checks and the ledger checks run without a database: both services are pure and the ledger is the same
in-memory `LeaveBook` the parity tests drive from PostgreSQL. The tests at the end save the two cards and need
`CANONICAL_TEST_DATABASE_URL` (a throwaway copy of `ariba_src`); they run inside a transaction that is rolled back.
"""

from __future__ import annotations

import os
from datetime import date, time
from types import SimpleNamespace

import pytest

from app.core.errors import ApiError
from app.routers import canonical as canonical_router
from app.services import leave_rules, schedule
from app.services.leave import HolidayCalendar, LeaveBook

needs_db = pytest.mark.skipif(
    not os.environ.get("CANONICAL_TEST_DATABASE_URL"),
    reason="Requires a disposable restored canonical PostgreSQL database",
)

# company_settings today: 08:00 start, 15 minutes' tolerance, 8 hours, fixed hours (no flexible window).
FIXED = {"flexible_enabled": False, "work_start": time(8), "tolerance_minutes": 15, "shift_duration_minutes": 480}
RAMADAN_2026 = {"ramadan_from": "2026-02-18", "ramadan_to": "2026-03-19"}


def refused(exc_info, status: int, code: str) -> None:
    assert (exc_info.value.status, exc_info.value.code) == (status, code), exc_info.value.message


def emp(eid: str = "emp-1", join: date = date(2025, 1, 1), annual: float = 21.0) -> SimpleNamespace:
    """What the ledger reads off an employee row (the same shape tests_canonical/test_legacy_parity.py uses)."""
    return SimpleNamespace(id=eid, join_date=join, annual_leave_days=annual, termination_date=None, is_terminated=False)


def view(eid: str, *, data: dict | None = None, job: str = "", department: str = "", employer: str = "") -> SimpleNamespace:
    """What `leave_rules.exemptions` reads off an `EmpView`."""
    return SimpleNamespace(id=eid, data=data or {}, job_title=job, department=department, employer=employer)


def book(**kw) -> LeaveBook:
    base = dict(holidays=HolidayCalendar([]), data={}, adjustments=[], approved_annual={}, today=date(2025, 7, 1))
    return LeaveBook(**{**base, **kw})


# --------------------------------------------------------------------------------- S6 the working-hours schedule

def test_the_schedule_is_off_until_it_is_turned_on():
    cfg = schedule.norm(None)
    assert cfg == schedule.DEFAULT_SCHEDULE
    # off: attendance keeps company_settings, so no day has a shift of its own
    assert schedule.applied(date(2026, 3, 1), cfg) is None
    assert schedule.required_hours(date(2026, 3, 1), cfg) is None
    assert schedule.applied(date(2026, 3, 1), {**cfg, "enabled": True})["kind"] == "ramadan"


def test_the_card_is_checked_before_it_is_saved():
    value = schedule.schedule_in({"enabled": True, "official": {"start": "8:00", "end": "17:00", "hours": 8, "grace": 20},
                                 "ramadan": {"start": "09:00", "end": "15:00", "hours": 6, "grace": 10}})
    assert value["enabled"] is True
    assert value["official"] == {"start": "08:00", "end": "17:00", "hours": 8.0, "grace": 20}
    assert value["ramadan"] == {"start": "09:00", "end": "15:00", "hours": 6.0, "grace": 10}
    assert value["ramadan_auto"] is True and value["ramadan_from"] == "" and value["ramadan_to"] == ""

    for bad in ({"enabled": "maybe"}, {"official": {"start": "25:00"}}, {"official": {"start": "17:00", "end": "08:00"}},
                {"ramadan": {"hours": 20}}, {"ramadan": {"grace": 500}}, {"ramadan_from": "2026-02-18"},
                {"ramadan_from": "2026-03-19", "ramadan_to": "2026-02-18"}, {"ramadan_to": "لاحقًا"}, []):
        with pytest.raises(ApiError) as exc:
            schedule.schedule_in(bad)
        refused(exc, 422, "validation_error")


def test_a_hand_edited_row_never_breaks_attendance():
    cfg = schedule.norm({"enabled": True, "official": {"start": "25:00", "hours": 99},
                         "ramadan": {"start": "10:00", "end": "16:00"}, "ramadan_from": "later", "ramadan_auto": "no"})
    assert cfg["official"] == schedule.DEFAULT_SCHEDULE["official"]          # both bad fields fell back
    assert cfg["ramadan"]["start"] == "10:00" and cfg["ramadan"]["hours"] == 6.0  # the good fields stayed
    assert cfg["ramadan_auto"] is True and cfg["ramadan_from"] == ""        # an unreadable date/flag is ignored


def test_ramadan_and_the_official_shift_apply_by_day():
    cfg = schedule.schedule_in({"enabled": True, **RAMADAN_2026})
    ramadan = schedule.applied(date(2026, 3, 1), cfg)
    assert ramadan == {"kind": "ramadan", "start": "09:00", "end": "15:00", "hours": 6.0, "grace": 15}
    assert schedule.required_hours(date(2026, 3, 1), cfg) == 6.0
    assert schedule.applied(date(2026, 3, 19), cfg)["kind"] == "ramadan"      # last day in
    assert schedule.applied(date(2026, 3, 20), cfg)["kind"] == "official"     # first day out
    assert schedule.required_hours(date(2026, 4, 1), cfg) == 8.0


def test_ramadan_is_found_by_the_hijri_month_and_the_dates_win():
    automatic = schedule.schedule_in({"enabled": True})
    assert schedule.applied(date(2026, 3, 1), automatic)["kind"] == "ramadan"   # 9 Ramadan 1447 (arithmetic calendar)
    assert schedule.applied(date(2026, 4, 1), automatic)["kind"] == "official"  # 10 Shawwal
    manual = schedule.schedule_in({"enabled": True, "ramadan_from": "2026-02-18", "ramadan_to": "2026-02-25"})
    assert schedule.applied(date(2026, 3, 1), manual)["kind"] == "official"     # the card's dates win
    off = schedule.schedule_in({"enabled": True, "ramadan_auto": False})
    assert schedule.applied(date(2026, 3, 1), off)["kind"] == "official"        # switched off by hand


def test_punches_are_measured_against_the_day_s_shift_once_it_is_in_use():
    shift = schedule.applied(date(2026, 3, 1), schedule.schedule_in({"enabled": True, **RAMADAN_2026}))
    # Ramadan: in by 09:00 + 15 = 09:15; the same punch is 65 late against company_settings' 08:00 + 15
    assert canonical_router._punch_late(FIXED, time(9, 10), shift) == 0
    assert canonical_router._punch_late(FIXED, time(9, 20), shift) == 5
    assert canonical_router._punch_late(FIXED, time(9, 20)) == 65
    # the shift has an end, so leaving before it is early leave (fixed hours, without the schedule, is 0)
    assert canonical_router._punch_early(FIXED, time(9), 0, time(14, 30), shift) == 30
    assert canonical_router._punch_early(FIXED, time(9), 0, time(15, 5), shift) == 0
    assert canonical_router._punch_early(FIXED, time(9), 0, time(14, 30)) == 0


# --------------------------------------------------------------------------------- S7 the leave rules' three rows

def test_the_rules_read_back_with_the_designs_defaults():
    assert leave_rules.carry_in(None) == {"enabled": True, "days": 10}    # on, at the engine's CARRY_CAP
    assert leave_rules.accrual_in(None) == {"method": "workdays"}
    assert leave_rules.rights_in(None) == {k: {"leave": False, "eos": False} for k in ("tamheer", "trainee", "consultant")}
    assert leave_rules.from_rows({}) == {"carry": {"enabled": True, "days": 10}, "accrual": {"method": "workdays"},
                                      "rights": leave_rules.DEFAULT_RIGHTS}


def test_the_three_rows_are_checked_before_they_are_saved():
    assert leave_rules.carry_in({"enabled": False, "days": 15}) == {"enabled": False, "days": 15}
    assert leave_rules.carry_in({"enabled": False, "days": "12.5"}) == {"enabled": False, "days": 12.5}
    assert leave_rules.carry_in({"days": 12.5}) == {"enabled": True, "days": 12.5}  # the switch defaults to on
    assert leave_rules.accrual_in({"method": " Monthly "}) == {"method": "monthly"}
    rights = leave_rules.rights_in({"trainee": {"leave": True, "eos": "true"}})
    assert rights["trainee"] == {"leave": True, "eos": True} and rights["tamheer"] == {"leave": False, "eos": False}

    for bad in ({"days": -1}, {"days": 366}, {"days": "ten"}):
        with pytest.raises(ApiError) as exc:
            leave_rules.carry_in(bad)
        refused(exc, 422, "validation_error")
    with pytest.raises(ApiError) as exc:
        leave_rules.accrual_in({"method": "weekly"})
    refused(exc, 422, "validation_error")
    assert leave_rules.accrual_in({"method": ""}) == {"method": "workdays"}
    with pytest.raises(ApiError) as exc:
        leave_rules.rights_in({"trainee": {"leave": "yes"}})
    refused(exc, 422, "validation_error")


def test_a_put_body_may_carry_one_of_the_three_rows():
    assert list(leave_rules.rules_in({"carry": {"days": 5}})) == ["carry"]
    assert list(leave_rules.rules_in({"accrual": {"method": "monthly"}})) == ["accrual"]
    assert list(leave_rules.rules_in({"rights": {}})) == ["rights"]
    with pytest.raises(ApiError) as exc:
        leave_rules.rules_in({})
    refused(exc, 422, "validation_error")
    with pytest.raises(ApiError):
        leave_rules.rules_in({"accrual": {"method": "weekly"}})


def test_a_hand_edited_row_keeps_the_default_it_cannot_replace():
    rules = leave_rules.from_rows({"leave_carry": {"days": 9000}, "leave_accrual_method": {"method": "weekly"},
                                   "special_rights": {"tamheer": {"leave": "yes"}}})
    assert rules == {"carry": leave_rules.DEFAULT_CARRY, "accrual": leave_rules.DEFAULT_ACCRUAL,
                     "rights": leave_rules.DEFAULT_RIGHTS}


def test_the_special_types_are_the_legacy_kinds():
    assert leave_rules.emp_kind(None) == ""
    assert leave_rules.emp_kind({"wpsType": "tamheer"}) == "tamheer"        # an explicit WPS type comes first
    assert leave_rules.emp_kind({"wpsType": "external"}) == "external"      # a kind outside the three cards
    assert leave_rules.emp_kind({}, "مستشار قانوني") == "consultant"        # a word in the job title
    assert leave_rules.emp_kind({"excelCategory": "consultant"}) == "consultant"
    assert leave_rules.emp_kind({}, "", "تدريب") == "trainee"               # the training department, exactly
    assert leave_rules.emp_kind({"empType": "متدرب"}) == "trainee"
    assert leave_rules.emp_kind({}, "", "", "شركة تمهير") == "tamheer"


def test_the_switches_read_differently_per_type_and_per_right():
    rights = {**leave_rules.DEFAULT_RIGHTS, "tamheer": {"leave": False, "eos": False},
              "consultant": {"leave": True, "eos": False}}
    assert leave_rules.has_leave("", rights) and leave_rules.has_eos("", rights)      # ordinary: always
    assert leave_rules.no_leave("tamheer", rights) and leave_rules.no_eos("tamheer", rights)
    assert leave_rules.has_leave("consultant", rights) and leave_rules.no_eos("consultant", rights)
    # external/no_wps/remote have no card, so they keep nothing
    assert leave_rules.no_leave("external", rights) and leave_rules.no_eos("external", rights)


def test_the_exemptions_and_the_counts_come_from_the_same_rule():
    rules = leave_rules.from_rows({"special_rights": {"consultant": {"leave": True, "eos": False}}})
    emps = [view("ordinary"), view("tam", data={"wpsType": "tamheer"}), view("con", job="استشارية موارد بشرية"),
            view("ext", data={"wpsType": "external"})]
    assert leave_rules.exemptions(emps, rules) == ({"tam", "ext"}, {"tam", "con", "ext"})
    assert leave_rules.kind_counts(emps) == {"tamheer": 1, "trainee": 0, "consultant": 1, "other": 1}


# --------------------------------------------------------------------------------- the ledger behind the settings

def test_the_carry_cap_caps_and_its_switch_lets_everything_carry():
    # imported 2024 close of 40: 10 carries into 2025 and the other 30 is the end-of-service excess
    e = emp(join=date(2023, 1, 1))
    data = {"emp-1": {"years": {"2024": {"entitlement": 21, "used": 0, "yearEnd": 40}}}}
    capped = book(data=data, carry_days=10)
    assert capped.carry_cap == 10 and capped.exceeds(12) == 2 and capped.exceeds(6) == 0
    assert capped.carry_forward(e, 2025) == 10 and capped.year_excess(e, 2024) == 30

    uncapped = book(data=data, carry_enabled=False)
    assert uncapped.carry_cap is None and uncapped.exceeds(12) == 0
    assert uncapped.carry_forward(e, 2025) == 40 and uncapped.year_excess(e, 2024) == 0
    assert uncapped.accumulated_eos(e) == 0 and capped.accumulated_eos(e) == 30
    # a join year never carries anything: the balance starts there
    assert capped.carry_forward(emp(), 2025) == 0


def test_the_cap_itself_is_kept_while_it_is_switched_off():
    off = book(carry_enabled=False, carry_days=12)
    assert off.carry_days == 12 and off.carry_cap is None      # the number stays for when it is switched back on
    assert book(carry_days="ten").carry_days == 10             # an unreadable number is the default


def test_the_three_accrual_methods_accrue_differently():
    e, end = emp(join=date(2025, 1, 1)), date(2025, 3, 31)
    assert round(book().accrued(e, 2025, end), 2) == 5.15                  # workdays: 64 of 261
    assert round(book(accrual="calendar").accrued(e, 2025, end), 2) == 5.18  # 90 of 365 days
    assert round(book(accrual="monthly").accrued(e, 2025, end), 2) == 5.25   # 3 of 12 months
    assert book(accrual="weekly").accrual == "workdays"                     # an unknown method reads as workdays


def test_a_type_with_no_leave_keeps_no_ledger_at_all():
    e = emp()
    b = book(no_leave={"emp-1"})
    assert (b.annual(e), b.accrued(e, 2025), b.carry_forward(e, 2025)) == (0, 0, 0)
    assert (b.current(e), b.app_current(e), b.app_year_end(e), b.year_closing(e, 2025)) == (0, 0, 0, 0)
    assert b.ledger(e, 2025)["close"] == 0 and b.summary(e)["current"] == 0
    assert book().accrued(e, 2025) > 0                    # an ordinary employee is untouched


def test_no_end_of_service_right_zeroes_only_the_excess():
    e = emp(join=date(2023, 1, 1))
    data = {"emp-1": {"eos_excess": 4.0, "years": {"2024": {"entitlement": 21, "used": 0, "yearEnd": 40}}}}
    with_eos, without = book(data=data, carry_days=10), book(data=data, carry_days=10, no_eos={"emp-1"})
    # 4 imported + 30 over the 2024 cap; the summary adds this year's own excess (31 − 10 = 21)
    assert with_eos.accumulated_eos(e) == 34 and with_eos.summary(e)["eos"] == 55
    assert without.accumulated_eos(e) == 0 and without.summary(e)["eos"] == 0   # the right is off, so nothing at all
    assert without.current(e) == with_eos.current(e)       # the balance itself is untouched


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


@needs_db
def test_the_working_hours_card_saves_and_decides_the_day(db):
    from sqlalchemy import text

    from app.routers import settings_extra as se

    se.put_schedule({"enabled": True, "official": {"start": "07:30", "end": "16:30", "hours": 8, "grace": 10},
                     "ramadan": {"start": "09:00", "end": "15:00", "hours": 6}, "ramadan_auto": False},
                    request=None, actor=ADMIN, db=db)
    saved = db.execute(text("SELECT value FROM public.ariba_app_settings WHERE key=:k"),
                       {"k": schedule.SETTING_KEY}).scalar()
    assert saved["official"]["start"] == "07:30" and saved["ramadan_auto"] is False
    card = se.get_schedule(actor=ADMIN, db=db)
    assert card["enabled"] is True and card["official"]["end"] == "16:30"
    assert card["ramadan"]["hours"] == 6.0 and card["today"]["shift"]["kind"] == "official"
    assert canonical_router._shift(date(2026, 11, 5), db)["start"] == "07:30"


@needs_db
def test_the_leave_card_saves_and_reaches_the_ledger(db):
    from sqlalchemy import text

    from app.routers import settings_extra as se
    from app.services import canonical_data

    se.put_leave_rules({"carry": {"enabled": True, "days": 7}, "accrual": {"method": "calendar"},
                        "rights": {"tamheer": {"leave": True, "eos": False}}},
                       request=None, actor=ADMIN, db=db)
    card = se.get_leave_rules(actor=ADMIN, db=db)
    assert card["carry"] == {"enabled": True, "days": 7} and card["accrual"] == {"method": "calendar"}
    assert card["rights"]["tamheer"] == {"leave": True, "eos": False}
    assert set(card["employees"]) == {"tamheer", "trainee", "consultant", "other"}    # the counts the card shows
    assert card["max_carry_days"] == leave_rules.MAX_CARRY_DAYS and "monthly" in card["methods"]
    # the one reader every ledger goes through answers with the saved rows
    ledger = canonical_data.leave_book(db, date(2026, 11, 5))
    assert ledger.carry_cap == 7 and ledger.accrual == "calendar"
    assert db.execute(text("SELECT count(*) FROM public.ariba_app_settings WHERE key IN (:a,:b,:c)"),
                      {"a": leave_rules.CARRY_KEY, "b": leave_rules.ACCRUAL_KEY,
                       "c": leave_rules.RIGHTS_KEY}).scalar() == 3
    se.put_leave_rules({"carry": {"enabled": False, "days": 7}}, request=None, actor=ADMIN, db=db)
    assert se.get_leave_rules(actor=ADMIN, db=db)["accrual"] == {"method": "calendar"}   # the rest kept
    assert canonical_data.leave_book(db, date(2026, 11, 5)).carry_cap is None
