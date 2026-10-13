"""Leave ledger vs the legacy JS engine (frontend/legacy/hr-portal/js/calculations/02 + 03).

Expected numbers were produced by running the legacy JS files themselves in Node with the same data and the clock
fixed at 2026-10-05 (Asia/Riyadh)."""

from datetime import date
from types import SimpleNamespace

import pytest

from app.services.leave import HolidayCalendar, LeaveBook


def emp(id_, join, days):
    return SimpleNamespace(id=id_, join_date=date.fromisoformat(join), annual_leave_days=days, is_terminated=False,
                           termination_date=None)


@pytest.fixture
def book():
    hol = HolidayCalendar([(date(2026, 3, 20), 4, False), (date(2025, 9, 23), 1, True), (date(2024, 6, 15), 5, False)])
    return LeaveBook(
        holidays=hol,
        data={
            "E2": {"years": {"2025": {"used": 3, "asOf": "2025-06-01"}}, "used_history": {"2025": 1}},
            "E3": {"years": {"2023": {"yearEnd": 40}, "2025": {"carryNext": 7}}, "eos_excess": 5},
        },
        adjustments=[{"employee_id": "E1", "date": "2026-05-01", "delta": 2}, {"employee_id": "E2", "date": "2025-03-01", "delta": -1.5}],
        approved_annual={
            "E1": [(date(2026, 2, 1), date(2026, 2, 12)), (date(2025, 7, 6), date(2025, 7, 20))],
            "E2": [(date(2026, 8, 2), date(2026, 8, 6))],
        },
        today=date(2026, 10, 5),
    )


EXPECTED = {
    # id: (current, close2026, accumulated eos, cumulative accrued, cumulative used, cumulative manual, ledger 2024, ledger 2026)
    "E1": (17.8721, 23, 42, 158.9952, 21, 2, [21, 21, 0, 0, 42, 10, 32], [10, 21, 10, 2, 23, 10, 13]),
    "E2": (27.6744, 35, 6.9615, 44.136, 8, -1.5, [0, 0, 0, 0, 0, 0, 0], [10, 30, 5, 0, 35, 10, 25]),
    "E3": (22.8721, 28, 67, 120.8721, 0, 0, [30, 21, 0, 0, 51, 10, 41], [7, 21, 0, 0, 28, 10, 18]),
}
EMPS = {"E1": emp("E1", "2019-03-10", 21), "E2": emp("E2", "2025-04-15", 30), "E3": emp("E3", "2021-01-01", 21)}


@pytest.mark.parametrize("eid", list(EXPECTED))
def test_matches_legacy_engine(book, eid):
    e = EMPS[eid]
    cur, close, eos, acc, used, man, l24, l26 = EXPECTED[eid]
    assert round(book.current(e), 4) == cur
    assert round(book.year_closing(e, 2026), 4) == close
    assert round(book.accumulated_eos(e, 2026), 4) == eos
    assert round(book.cumulative_accrued(e), 4) == acc
    assert round(book.cumulative_used(e), 4) == used
    assert round(book.cumulative_manual(e), 4) == man
    for y, exp in ((2024, l24), (2026, l26)):
        led = book.ledger(e, y)
        got = [led[k] for k in ("opening", "entitlement", "used", "adjustment", "close", "carry", "eos")]
        assert [round(x, 4) for x in got] == exp
