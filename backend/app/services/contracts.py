"""Contract dates."""

import calendar
from datetime import date, timedelta


def add_months(d: date, months: int) -> date:
    """Same day `months` later, clamped to the last day of the target month
    (31 Jan + 1 month -> 28/29 Feb)."""
    m = d.month - 1 + months
    year, month = d.year + m // 12, m % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def fixed_term_end(join_date: date, duration_months: int) -> date:
    """End date of a fixed-term contract = join date + duration in months − 1 day
    (legacy addMonthsSafe: 2025-03-10 + 24 months → 2027-03-09)."""
    return add_months(join_date, duration_months) - timedelta(days=1)


AUTO_REASONS = ("انتهاء مدة العقد", "انتهاء العقد")


def apply_auto_terminations(db, today: date) -> None:
    """Legacy V42/V89 + V101: a fixed-term contract whose end date passed ends automatically
    (last day = contract end, reason «انتهاء مدة العقد»); if it is renewed later (new end ≥ today and after the
    last day) or made indefinite, the employee comes back. Manual terminations are never touched."""
    from sqlalchemy import select

    from app.models import ContractNature, Employee

    changed = False
    for e in db.scalars(select(Employee).where(Employee.deleted_at.is_(None))).unique():
        auto = (e.termination_reason or "") in AUTO_REASONS
        if e.termination_date is None:
            if e.contract_nature == ContractNature.fixed and e.contract_end_date and e.contract_end_date < today:
                e.termination_date, e.termination_reason, changed = e.contract_end_date, AUTO_REASONS[0], True
        elif auto and (
            e.contract_nature == ContractNature.indefinite
            or (e.contract_end_date and e.contract_end_date >= today and e.contract_end_date > e.termination_date)
        ):
            e.termination_date, e.termination_reason, e.termination_article, changed = None, None, None, True
    if changed:
        db.commit()
