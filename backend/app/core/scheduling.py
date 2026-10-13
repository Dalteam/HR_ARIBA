"""Calendar rules: Asia/Riyadh time, Sunday–Thursday workweek, official holidays."""

from collections.abc import Iterable
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

RIYADH = ZoneInfo("Asia/Riyadh")

# date.weekday(): Monday=0 ... Friday=4, Saturday=5, Sunday=6
WEEKEND = frozenset({4, 5})


def now_riyadh() -> datetime:
    return datetime.now(RIYADH)


def today_riyadh() -> date:
    return now_riyadh().date()


def is_workday(d: date, holidays: frozenset[date] | set[date] = frozenset()) -> bool:
    return d.weekday() not in WEEKEND and d not in holidays


def workdays_between(start: date, end: date, holidays: frozenset[date] | set[date] = frozenset()) -> int:
    """Workdays in [start, end], both inclusive. 0 if end < start."""
    if end < start:
        return 0
    n = 0
    d = start
    while d <= end:
        if is_workday(d, holidays):
            n += 1
        d += timedelta(days=1)
    return n


def expand_holidays(rows: Iterable[tuple[date, int, bool]], year: int) -> frozenset[date]:
    """(start_date, days, is_recurring) rows -> the set of holiday dates in `year`.
    Recurring holidays are moved to the same month/day of `year`."""
    out: set[date] = set()
    for start, days, recurring in rows:
        if recurring:
            try:
                start = start.replace(year=year)
            except ValueError:  # 29 Feb in a non-leap year
                start = date(year, 2, 28)
        for i in range(days):
            d = start + timedelta(days=i)
            if d.year == year:
                out.add(d)
    return frozenset(out)
