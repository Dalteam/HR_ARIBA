"""GOSI (التأمينات الاجتماعية) contributions from effective-dated rules.

    base     = min(wage_cap / month_days x work_days, basic + housing)
    employee = base x employee_rate%   (55+ uses the senior rate)
    employer = base x employer_rate%

Exempt (V130, see `exempt_kind`): consultants, tamheer, trainees (by WPS type, category, or words in the
job title / department / workplace) and anyone not on WPS pay no GOSI.
"""

import re
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import EmployeeCategory, GosiRule, GosiSystem, WpsType

CENT = Decimal("0.01")
DEFAULT_AGE = 30  # prototype default when the birth date is missing


@dataclass(frozen=True)
class GosiResult:
    base: Decimal
    employee: Decimal
    employer: Decimal
    employee_rate: Decimal
    employer_rate: Decimal

    @classmethod
    def zero(cls) -> "GosiResult":
        z = Decimal("0.00")
        return cls(z, z, z, Decimal("0"), Decimal("0"))


def age_on(birth_date: date | None, on: date) -> int:
    if birth_date is None:
        return DEFAULT_AGE
    years = on.year - birth_date.year
    if (on.month, on.day) < (birth_date.month, birth_date.day):
        years -= 1
    return years


def rule_for(rules: list[GosiRule], system: GosiSystem, on: date) -> GosiRule | None:
    """The rule in force on `on`: the latest effective_from <= on for the system."""
    candidates = [r for r in rules if r.system == system and r.effective_from <= on]
    return max(candidates, key=lambda r: r.effective_from) if candidates else None


_EXEMPT_WPS = {WpsType.consultant: "consultant", WpsType.tamheer: "tamheer", WpsType.trainee: "trainee"}


def exempt_kind(
    *,
    wps_type: WpsType,
    category: EmployeeCategory,
    job_title: str | None = None,
    department: str | None = None,
    workplace: str | None = None,
) -> str:
    """V130 (legacy js/payroll/114-ariba-v130-insurance-exempt.js `kindOf`): '' when the employee pays GOSI,
    otherwise why not. Explicit WPS type first, then words in the job title / department / workplace."""
    if wps_type in _EXEMPT_WPS:
        return _EXEMPT_WPS[wps_type]
    if wps_type != WpsType.wps:
        return wps_type.value  # external / no_wps / remote: not subject either (prototype rule)
    if category == EmployeeCategory.consultant:
        return "consultant"
    if category == EmployeeCategory.tamheer:
        return "tamheer"
    if category == EmployeeCategory.training:
        return "trainee"
    job, dep, emp = job_title or "", department or "", workplace or ""
    if "تمهير" in emp or "تمهير" in job or "تمهير" in dep:
        return "tamheer"
    if re.search("استشاري|مستشار|استشاريه|استشارية", job):
        return "consultant"
    if re.search("متدرب|تدريب|trainee|intern", job, re.I) or dep.strip() == "تدريب" or "تدريب" in emp:
        return "trainee"
    return ""


def calculate(
    *,
    rules: list[GosiRule],
    system: GosiSystem,
    wps_type: WpsType,
    category: EmployeeCategory,
    basic: Decimal,
    housing: Decimal,
    birth_date: date | None,
    on: date,
    month_days: int = 30,
    work_days: Decimal | int = 30,
    job_title: str | None = None,
    department: str | None = None,
    workplace: str | None = None,
) -> GosiResult:
    if exempt_kind(wps_type=wps_type, category=category, job_title=job_title, department=department, workplace=workplace):
        return GosiResult.zero()
    rule = rule_for(rules, system, on)
    if rule is None:
        return GosiResult.zero()
    senior = age_on(birth_date, on) >= rule.senior_age
    ee_rate = rule.employee_rate_senior if senior else rule.employee_rate
    er_rate = rule.employer_rate_senior if senior else rule.employer_rate
    cap = Decimal(rule.wage_cap) / Decimal(month_days) * Decimal(work_days)
    base = min(cap, Decimal(basic) + Decimal(housing)).quantize(CENT, ROUND_HALF_UP)
    return GosiResult(
        base=base,
        employee=(base * Decimal(ee_rate) / 100).quantize(CENT, ROUND_HALF_UP),
        employer=(base * Decimal(er_rate) / 100).quantize(CENT, ROUND_HALF_UP),
        employee_rate=Decimal(ee_rate),
        employer_rate=Decimal(er_rate),
    )


def load_rules(db: Session) -> list[GosiRule]:
    return list(db.scalars(select(GosiRule)))
