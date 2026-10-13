"""Salary basis for finance/HR screens (end-of-service page, payroll, payslips, reports).

One row per employee with the raw salary fields, so those screens can apply the same formulas as the
V114 HTML (frontend/legacy) without opening every employee record.
"""

import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.permissions import SALARY_ROLES, require_roles
from app.database import get_db
from app.core.scheduling import today_riyadh
from app.models import Employee, User
from app.services import employees as emp_svc
from app.services import gosi

router = APIRouter(prefix="/salary", tags=["salary"])


class SalaryBasisRow(BaseModel):
    id: uuid.UUID
    emp_no: str
    name_ar: str
    workplace: str | None
    department: str | None
    job_title: str | None
    nationality: str | None
    is_saudi: bool
    birth_date: date | None
    category: str
    wps_type: str
    gosi_system: str
    join_date: date | None
    contract_duration_months: int | None
    contract_end_date: date | None
    annual_leave_days: int
    basic_salary: Decimal
    housing_allowance: Decimal
    transport_allowance: Decimal
    project_allowance: Decimal
    other_allowances: Decimal
    extra_allowance: Decimal
    other_deductions: Decimal
    currency: str
    exchange_rate: Decimal
    payment_method: str
    bank_name: str | None
    iban: str | None
    exclude_from_payroll: bool
    exclude_from_eos: bool
    is_terminated: bool
    termination_date: date | None
    termination_article: str | None
    termination_reason: str | None
    # Figures used by the reports (legacy rptPay / rptEOS): calcIns(e,31,31) and calcEOS(basic, years, housing).
    total_salary: Decimal
    gosi_employee: Decimal
    net_salary: Decimal
    years_of_service: Decimal
    eos_basic: Decimal


@router.get("/basis", response_model=list[SalaryBasisRow])
def salary_basis(_: User = Depends(require_roles(*SALARY_ROLES)), db: Session = Depends(get_db)):
    from app.services.contracts import apply_auto_terminations

    apply_auto_terminations(db, today_riyadh())
    emps = db.scalars(select(Employee).where(Employee.deleted_at.is_(None)).order_by(Employee.name_ar)).unique()
    today, rules = today_riyadh(), gosi.load_rules(db)

    def extra(e: Employee) -> dict:
        f = emp_svc.employee_figures(e, rules, today)
        y = emp_svc.years_of_service(e, today)
        base = e.basic_salary + e.housing_allowance
        eos = (base / 2 * min(y, Decimal(5)) + base * max(Decimal(0), y - 5)).quantize(Decimal("0.01"))
        return {"total_salary": f.total, "gosi_employee": f.gosi_employee, "net_salary": f.net, "years_of_service": y, "eos_basic": eos}

    return [
        SalaryBasisRow(
            id=e.id,
            emp_no=e.emp_no,
            name_ar=e.name_ar,
            workplace=e.workplace.name_ar if e.workplace else None,
            department=e.department.name_ar if e.department else None,
            job_title=e.job_title,
            nationality=e.nationality.name_ar if e.nationality else None,
            is_saudi=bool(e.nationality and e.nationality.is_saudi),
            birth_date=e.birth_date,
            category=e.category.value,
            wps_type=e.wps_type.value,
            gosi_system=e.gosi_system.value,
            join_date=e.join_date,
            contract_duration_months=e.contract_duration_months,
            contract_end_date=e.contract_end_date,
            annual_leave_days=e.annual_leave_days,
            basic_salary=e.basic_salary,
            housing_allowance=e.housing_allowance,
            transport_allowance=e.transport_allowance,
            project_allowance=e.project_allowance,
            other_allowances=e.other_allowances,
            extra_allowance=e.extra_allowance,
            other_deductions=e.other_deductions,
            currency=e.currency.value,
            exchange_rate=e.exchange_rate,
            payment_method=e.payment_method.value,
            bank_name=e.bank_name,
            iban=e.iban,
            exclude_from_payroll=e.exclude_from_payroll,
            exclude_from_eos=e.exclude_from_eos,
            is_terminated=e.is_terminated,
            termination_date=e.termination_date,
            termination_article=e.termination_article.value if e.termination_article else None,
            termination_reason=e.termination_reason,
            **extra(e),
        )
        for e in emps
    ]
