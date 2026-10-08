"""Expiry alerts: Iqama/ID, passport, medical insurance and fixed-term contracts.

Within 90 days -> alert; 30 days or less -> urgent; past the date -> expired ("منتهي").
Only current (non-terminated) employees are checked.
"""

from dataclasses import dataclass
from datetime import date
from typing import Literal

from app.models import ContractNature, Employee

WINDOW_DAYS = 90
URGENT_DAYS = 30

AlertKind = Literal["iqama", "passport", "insurance", "contract"]
Level = Literal["expired", "urgent", "soon"]


@dataclass(frozen=True)
class Alert:
    employee: Employee
    kind: AlertKind
    expires_on: date
    days_left: int

    @property
    def level(self) -> Level:
        if self.days_left <= 0:
            return "expired"
        return "urgent" if self.days_left <= URGENT_DAYS else "soon"



def collect(employees: list[Employee], today: date) -> list[Alert]:
    out: list[Alert] = []
    for e in employees:
        if e.termination_date is not None:
            continue
        dates: list[tuple[AlertKind, date | None]] = [
            ("iqama", e.national_id_expiry),
            ("passport", e.passport_expiry),
            ("insurance", e.insurance_expiry),
        ]
        if e.contract_nature == ContractNature.fixed:
            dates.append(("contract", e.contract_end_date))
        for kind, d in dates:
            if d is None:
                continue
            days = (d - today).days
            if days <= WINDOW_DAYS:
                out.append(Alert(e, kind, d, days))
    return sorted(out, key=lambda a: a.days_left)
