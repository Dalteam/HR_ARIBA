from datetime import date

from app.core.scheduling import expand_holidays, is_workday, workdays_between


def test_weekend_is_friday_and_saturday():
    assert is_workday(date(2026, 10, 4))  # Sunday
    assert is_workday(date(2026, 10, 8))  # Thursday
    assert not is_workday(date(2026, 10, 9))  # Friday
    assert not is_workday(date(2026, 10, 10))  # Saturday


def test_workdays_between_hand_computed():
    # Sun 4 Oct – Sat 17 Oct 2026: two full weeks = 10 workdays
    assert workdays_between(date(2026, 10, 4), date(2026, 10, 17)) == 10
    # Same range with Thu 8 Oct as a holiday = 9
    assert workdays_between(date(2026, 10, 4), date(2026, 10, 17), {date(2026, 10, 8)}) == 9
    # Single Friday = 0; reversed range = 0
    assert workdays_between(date(2026, 10, 9), date(2026, 10, 9)) == 0
    assert workdays_between(date(2026, 10, 9), date(2026, 10, 1)) == 0


def test_workdays_in_2026():
    # 2026 has 365 days, starts Thursday. Fridays: 52, Saturdays: 52 -> 261 workdays.
    assert workdays_between(date(2026, 1, 1), date(2026, 12, 31)) == 261


def test_expand_holidays():
    rows = [
        (date(2025, 9, 23), 1, True),  # National Day, recurring
        (date(2026, 3, 20), 4, False),  # Eid al-Fitr 2026, 4 days
        (date(2027, 3, 9), 4, False),  # another year: ignored
    ]
    hol = expand_holidays(rows, 2026)
    assert hol == {date(2026, 9, 23), date(2026, 3, 20), date(2026, 3, 21), date(2026, 3, 22), date(2026, 3, 23)}
