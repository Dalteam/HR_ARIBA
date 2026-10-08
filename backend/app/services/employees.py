"""Employee business logic: create/update/terminate, list tabs, and role-aware response building."""

import uuid
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal

from sqlalchemy import Select, false, func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import ApiError, not_found
from app.core.pagination import PageParams, apply_sort, paginate
from app.core.permissions import can_view_full_ids, can_view_salary, scope_employees
from app.core.scheduling import today_riyadh
from app.core.security import mask_id
from app.models import (
    ContractNature,
    Currency,
    Department,
    Employee,
    EmployeeCategory,
    GosiSystem,
    Nationality,
    PaymentMethod,
    TerminationArticle,
    User,
    Workplace,
    WpsType,
)
from app.schemas import (
    EmployeeBrief,
    EmployeeCounts,
    EmployeeCreate,
    EmployeeListItem,
    EmployeeOut,
    EmployeeUpdate,
    ExpiryOut,
    LookupOut,
    NationalityOut,
    SalaryOut,
    SalaryPreviewIn,
    SalaryPreviewOut,
    TerminateIn,
)
from app.services import gosi
from app.services.contracts import fixed_term_end
from app.services.end_of_service import eos_award, service_years
from app.services.saudization import saudization_pct

CENT = Decimal("0.01")

Tab = Literal["all", "active", "terminated", "tamheer", "training", "consultants", "saudi", "expat"]

_SORTABLE = {
    "emp_no": Employee.emp_no,
    "name_ar": Employee.name_ar,
    "name_en": Employee.name_en,
    "join_date": Employee.join_date,
    "contract_end_date": Employee.contract_end_date,
    "termination_date": Employee.termination_date,
}


# --------------------------------------------------------------------------- queries


def _base() -> Select:
    return select(Employee).where(Employee.deleted_at.is_(None))


def _saudi_ids() -> Select:
    return select(Nationality.id).where(Nationality.is_saudi.is_(True))


def _tab_filter(stmt: Select, tab: Tab) -> Select:
    current = Employee.termination_date.is_(None)
    match tab:
        case "all":
            return stmt
        case "active":
            return stmt.where(current, Employee.category == EmployeeCategory.active)
        case "terminated":
            return stmt.where(Employee.termination_date.is_not(None))
        case "tamheer":
            return stmt.where(current, Employee.category == EmployeeCategory.tamheer)
        case "training":
            return stmt.where(current, Employee.category == EmployeeCategory.training)
        case "consultants":
            return stmt.where(current, Employee.category == EmployeeCategory.consultant)
        case "saudi":
            return stmt.where(current, Employee.nationality_id.in_(_saudi_ids()))
        case "expat":
            return stmt.where(
                current, or_(Employee.nationality_id.is_(None), Employee.nationality_id.not_in(_saudi_ids()))
            )
    return stmt.where(false())


def list_employees(
    db: Session,
    user: User,
    params: PageParams,
    tab: Tab = "all",
    workplace_id: uuid.UUID | None = None,
    department_id: uuid.UUID | None = None,
) -> tuple[list[EmployeeListItem], int]:
    from app.services.contracts import apply_auto_terminations

    apply_auto_terminations(db, today_riyadh())
    stmt = scope_employees(_tab_filter(_base(), tab), user)
    if workplace_id:
        stmt = stmt.where(Employee.workplace_id == workplace_id)
    if department_id:
        stmt = stmt.where(Employee.department_id == department_id)
    if params.q:
        like = f"%{params.q.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Employee.emp_no).like(like),
                func.lower(Employee.name_ar).like(like),
                func.lower(Employee.name_en).like(like),
                func.lower(Employee.job_title).like(like),
            )
        )
    stmt = apply_sort(stmt, params.sort, _SORTABLE, default=(Employee.emp_no.asc(),))
    rows, total = paginate(db, stmt, params)
    rules, today = gosi.load_rules(db), today_riyadh()
    return [to_list_item(e, user, rules, today) for e in rows], total


def counts(db: Session, user: User) -> EmployeeCounts:
    def n(tab: Tab) -> int:
        stmt = scope_employees(_tab_filter(_base(), tab), user)
        return db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    saudi, expat = n("saudi"), n("expat")
    return EmployeeCounts(
        all=n("all"),
        active=n("active"),
        terminated=n("terminated"),
        tamheer=n("tamheer"),
        training=n("training"),
        consultants=n("consultants"),
        saudi=saudi,
        expat=expat,
        saudization_pct=saudization_pct(saudi, saudi + expat),
    )


def get_employee(db: Session, user: User, employee_id: uuid.UUID) -> Employee:
    """Scoped lookup: records outside the caller's scope are reported as not found."""
    emp = db.scalars(scope_employees(_base().where(Employee.id == employee_id), user)).unique().first()
    if emp is None:
        raise not_found("Employee")
    return emp


# --------------------------------------------------------------------------- writes


def _check_refs(db: Session, data: dict, employee_id: uuid.UUID | None = None) -> None:
    for field, model, label in (
        ("workplace_id", Workplace, "Workplace"),
        ("department_id", Department, "Department"),
        ("nationality_id", Nationality, "Nationality"),
    ):
        if data.get(field) and db.get(model, data[field]) is None:
            raise ApiError(422, "validation_error", f"{label} does not exist", [{"field": field, "message": "Unknown value"}])
    manager_id = data.get("manager_id")
    if manager_id:
        if employee_id and manager_id == employee_id:
            raise ApiError(422, "validation_error", "An employee cannot be their own manager", [{"field": "manager_id", "message": "Invalid"}])
        mgr = db.get(Employee, manager_id)
        if mgr is None or mgr.deleted_at is not None:
            raise ApiError(422, "validation_error", "Manager does not exist", [{"field": "manager_id", "message": "Unknown value"}])


def _apply_contract_rules(emp: Employee) -> None:
    if emp.contract_nature == ContractNature.fixed:
        if emp.join_date and emp.contract_duration_months:
            emp.contract_end_date = fixed_term_end(emp.join_date, emp.contract_duration_months)
        elif emp.contract_end_date is None:
            raise ApiError(
                422,
                "validation_error",
                "A fixed-term contract needs a duration in months",
                [{"field": "contract_duration_months", "message": "Required for fixed-term contracts"}],
            )
    else:
        emp.contract_duration_months = None
        emp.contract_end_date = None


def _apply_gosi_default(db: Session, emp: Employee, explicit: bool) -> None:
    """Non-Saudis are always on the non-Saudi GOSI system; Saudis default to the matching system."""
    nat = db.get(Nationality, emp.nationality_id) if emp.nationality_id else None
    is_saudi = bool(nat and nat.is_saudi)
    if not is_saudi:
        emp.gosi_system = GosiSystem.non_saudi
    elif not explicit and emp.gosi_system == GosiSystem.non_saudi:
        emp.gosi_system = GosiSystem.matching
    elif emp.gosi_system == GosiSystem.non_saudi:
        raise ApiError(
            422,
            "validation_error",
            "A Saudi employee must be on the matching or non-matching GOSI system",
            [{"field": "gosi_system", "message": "Invalid for a Saudi employee"}],
        )


def _apply_currency_rules(emp: Employee) -> None:
    if emp.currency == Currency.SAR:
        emp.exchange_rate = Decimal("1")


_DUPLICATE_MSG = "An employee with the same employee number, email, or ID already exists."


def _check_unique(db: Session, values: dict, employee_id: uuid.UUID | None = None) -> None:
    """Employee number, email and national ID must each be unique (as in the prototype)."""
    for field, column in (("emp_no", Employee.emp_no), ("email", Employee.email), ("national_id", Employee.national_id)):
        value = values.get(field)
        if not value:
            continue
        stmt = select(Employee.id).where(func.lower(column) == str(value).lower())
        if employee_id:
            stmt = stmt.where(Employee.id != employee_id)
        if db.scalar(stmt):
            raise ApiError(409, "conflict", _DUPLICATE_MSG, [{"field": field, "message": "Already used"}])


def next_emp_no(db: Session) -> str:
    """Highest numeric suffix + 1, formatted like the existing numbers (emp085)."""
    highest = 0
    for (no,) in db.execute(select(Employee.emp_no)):
        digits = "".join(ch for ch in no if ch.isdigit())
        if digits:
            highest = max(highest, int(digits))
    return f"emp{highest + 1:03d}"


def create_employee(db: Session, data: EmployeeCreate) -> Employee:
    values = data.model_dump(exclude_unset=True)
    if not values.get("emp_no"):
        values["emp_no"] = next_emp_no(db)
    _check_unique(db, values)
    _check_refs(db, values)
    emp = Employee(**values)
    return _finish(db, emp, values)


def _finish(db: Session, emp: Employee, values: dict) -> Employee:
    """Fill defaults and derived fields, then validate cross-field rules."""
    emp.category = emp.category or EmployeeCategory.active
    emp.contract_nature = emp.contract_nature or ContractNature.indefinite
    emp.currency = emp.currency or Currency.SAR
    emp.wps_type = emp.wps_type or WpsType.wps
    emp.payment_method = emp.payment_method or PaymentMethod.mudad
    emp.gosi_system = emp.gosi_system or GosiSystem.non_saudi
    if emp.exchange_rate is None:
        emp.exchange_rate = Decimal("1")
    if emp.annual_leave_days is None:
        emp.annual_leave_days = 21
    _apply_contract_rules(emp)
    _apply_gosi_default(db, emp, explicit="gosi_system" in values)
    _apply_currency_rules(emp)
    db.add(emp)
    db.flush()
    return emp


def update_employee(db: Session, emp: Employee, data: EmployeeUpdate) -> list[str]:
    """Apply a PATCH. Returns the names of changed fields (for the audit log)."""
    values = data.model_dump(exclude_unset=True)
    for required in ("name_ar", "workplace_id", "join_date", "category", "contract_nature", "currency", "wps_type", "gosi_system", "payment_method", "annual_leave_days", "exchange_rate", "exclude_from_payroll", "exclude_from_eos"):
        if required in values and values[required] is None:
            raise ApiError(422, "validation_error", "Some fields are invalid", [{"field": required, "message": "Cannot be empty"}])
    _check_unique(db, values, employee_id=emp.id)
    _check_refs(db, values, employee_id=emp.id)
    changed = [k for k, v in values.items() if getattr(emp, k) != v]
    for k, v in values.items():
        setattr(emp, k, v)
    _finish(db, emp, values)
    return changed


def terminate(db: Session, emp: Employee, data: TerminateIn) -> None:
    if emp.termination_date is not None:
        raise ApiError(409, "conflict", "Employee is already terminated")
    if emp.join_date and data.termination_date < emp.join_date:
        raise ApiError(422, "validation_error", "Termination date is before the join date", [{"field": "termination_date", "message": "Too early"}])
    emp.termination_date = data.termination_date
    emp.termination_article = data.article
    emp.termination_reason = data.reason
    db.flush()


def reactivate(db: Session, emp: Employee) -> None:
    if emp.termination_date is None:
        raise ApiError(409, "conflict", "Employee is not terminated")
    emp.termination_date = None
    emp.termination_article = None
    emp.termination_reason = None
    db.flush()


# --------------------------------------------------------------------------- salary figures


@dataclass(frozen=True)
class SalaryFigures:
    total: Decimal
    gosi_employee: Decimal
    gosi_employer: Decimal
    net: Decimal
    net_sar: Decimal


def _q(v: Decimal) -> Decimal:
    return Decimal(v).quantize(CENT, ROUND_HALF_UP)


def figures(
    *,
    rules: list,
    basic: Decimal,
    housing: Decimal,
    transport: Decimal,
    project: Decimal,
    other: Decimal,
    extra: Decimal,
    deductions: Decimal,
    exchange_rate: Decimal,
    gosi_system: GosiSystem,
    wps_type: WpsType,
    category: EmployeeCategory,
    birth_date: date | None,
    on: date,
    job_title: str | None = None,
    department: str | None = None,
    workplace: str | None = None,
) -> SalaryFigures:
    """Monthly figures shown on the employee record (prototype `cSP` / `sEmp`):
    total = basic + housing + transport + project + other + extra; net = total - GOSI(employee) - other deductions."""
    total = _q(basic + housing + transport + project + other + extra)
    g = gosi.calculate(
        rules=rules, system=gosi_system, wps_type=wps_type, category=category,
        basic=basic, housing=housing, birth_date=birth_date, on=on,
        job_title=job_title, department=department, workplace=workplace,
    )
    net = _q(total - g.employee - deductions)
    return SalaryFigures(total, g.employee, g.employer, net, _q(net * exchange_rate))


def employee_figures(emp: Employee, rules: list, on: date) -> SalaryFigures:
    return figures(
        rules=rules,
        basic=emp.basic_salary, housing=emp.housing_allowance, transport=emp.transport_allowance,
        project=emp.project_allowance, other=emp.other_allowances, extra=emp.extra_allowance,
        deductions=emp.other_deductions, exchange_rate=emp.exchange_rate, gosi_system=emp.gosi_system,
        wps_type=emp.wps_type, category=emp.category, birth_date=emp.birth_date, on=on,
        job_title=emp.job_title,
        department=emp.department.name_ar if emp.department else None,
        workplace=emp.workplace.name_ar if emp.workplace else None,
    )


def preview(db: Session, data: SalaryPreviewIn) -> SalaryPreviewOut:
    nat = db.get(Nationality, data.nationality_id) if data.nationality_id else None
    system = data.gosi_system if nat and nat.is_saudi else GosiSystem.non_saudi
    if system == GosiSystem.non_saudi and nat and nat.is_saudi:
        system = GosiSystem.matching
    rate = Decimal(1) if data.currency == Currency.SAR else data.exchange_rate
    f = figures(
        rules=gosi.load_rules(db),
        basic=data.basic_salary, housing=data.housing_allowance, transport=data.transport_allowance,
        project=data.project_allowance, other=data.other_allowances, extra=data.extra_allowance,
        deductions=data.other_deductions, exchange_rate=rate, gosi_system=system,
        wps_type=data.wps_type, category=data.category, birth_date=data.birth_date, on=today_riyadh(),
    )
    return SalaryPreviewOut(
        total_salary=f.total, gosi_employee=f.gosi_employee, gosi_employer=f.gosi_employer,
        net_salary=f.net, net_salary_sar=f.net_sar, gosi_system=system,
    )


def years_of_service(emp: Employee, today: date) -> Decimal:
    return service_years(emp.join_date, emp.termination_date or today)


def eos_for(emp: Employee, today: date) -> Decimal | None:
    """End-of-service award as of today (or the termination date). Base = basic + housing."""
    if emp.exclude_from_eos:
        return None
    article = emp.termination_article or TerminationArticle.art_84
    return eos_award(emp.basic_salary + emp.housing_allowance, years_of_service(emp, today), article)


# --------------------------------------------------------------------------- responses


def _lookup(obj) -> LookupOut | None:
    return LookupOut.model_validate(obj) if obj else None


def _days_left(d: date | None, today: date) -> int | None:
    return (d - today).days if d else None


def to_list_item(emp: Employee, user: User, rules: list, today: date) -> EmployeeListItem:
    salary_visible = can_view_salary(user, emp)
    f = employee_figures(emp, rules, today) if salary_visible else None
    return EmployeeListItem(
        id=emp.id,
        emp_no=emp.emp_no,
        name_ar=emp.name_ar,
        name_en=emp.name_en,
        job_title=emp.job_title,
        category=emp.category,
        nationality=_lookup(emp.nationality),
        is_saudi=emp.is_saudi,
        workplace=_lookup(emp.workplace),
        department=_lookup(emp.department),
        national_id_masked=mask_id(emp.national_id),
        join_date=emp.join_date,
        contract_end_date=emp.contract_end_date,
        termination_date=emp.termination_date,
        is_terminated=emp.is_terminated,
        national_id_expiry=emp.national_id_expiry,
        years_of_service=years_of_service(emp, today),
        national_id_days_left=_days_left(emp.national_id_expiry, today),
        contract_days_left=_days_left(emp.contract_end_date, today),
        total_salary=f.total if f else None,
        net_salary=f.net_sar if f else None,
        currency=emp.currency if f else None,
        has_photo=emp.photo_path is not None,
    )


def to_detail(db: Session, emp: Employee, user: User) -> EmployeeOut:
    today = today_riyadh()
    full_ids = can_view_full_ids(user, emp)
    salary = None
    if can_view_salary(user, emp):
        f = employee_figures(emp, gosi.load_rules(db), today)
        salary = SalaryOut(
            basic_salary=emp.basic_salary,
            housing_allowance=emp.housing_allowance,
            transport_allowance=emp.transport_allowance,
            project_allowance=emp.project_allowance,
            other_allowances=emp.other_allowances,
            extra_allowance=emp.extra_allowance,
            other_deductions=emp.other_deductions,
            total_salary=f.total,
            gosi_employee=f.gosi_employee,
            gosi_employer=f.gosi_employer,
            net_salary=f.net,
            net_salary_sar=f.net_sar,
            eos_award=eos_for(emp, today),
            currency=emp.currency,
            exchange_rate=emp.exchange_rate,
            gosi_system=emp.gosi_system,
            payment_method=emp.payment_method,
            bank_name=emp.bank_name,
            iban=emp.iban if full_ids else mask_id(emp.iban),
        )
    has_account = db.scalar(select(User.id).where(User.employee_id == emp.id)) is not None
    ident = (lambda v: v) if full_ids else mask_id
    return EmployeeOut(
        id=emp.id,
        emp_no=emp.emp_no,
        name_ar=emp.name_ar,
        name_en=emp.name_en,
        birth_date=emp.birth_date,
        gender=emp.gender,
        religion=emp.religion,
        marital_status=emp.marital_status,
        mobile=emp.mobile,
        email=emp.email,
        national_address=emp.national_address,
        nationality=NationalityOut.model_validate(emp.nationality) if emp.nationality else None,
        is_saudi=emp.is_saudi,
        workplace=_lookup(emp.workplace),
        department=_lookup(emp.department),
        job_title=emp.job_title,
        manager=EmployeeBrief.model_validate(emp.manager) if emp.manager else None,
        sponsor=emp.sponsor,
        category=emp.category,
        wps_type=emp.wps_type,
        national_id=ident(emp.national_id),
        national_id_expiry=emp.national_id_expiry,
        passport_no=ident(emp.passport_no),
        passport_expiry=emp.passport_expiry,
        insurance_company=emp.insurance_company,
        insurance_class=emp.insurance_class,
        insurance_card_no=ident(emp.insurance_card_no),
        insurance_expiry=emp.insurance_expiry,
        contract_nature=emp.contract_nature,
        contract_duration_months=emp.contract_duration_months,
        join_date=emp.join_date,
        contract_end_date=emp.contract_end_date,
        annual_leave_days=emp.annual_leave_days,
        exclude_from_payroll=emp.exclude_from_payroll,
        exclude_from_eos=emp.exclude_from_eos,
        termination_date=emp.termination_date,
        termination_article=emp.termination_article,
        termination_reason=emp.termination_reason,
        is_terminated=emp.is_terminated,
        notes=emp.notes if full_ids else None,
        salary=salary,
        years_of_service=years_of_service(emp, today),
        has_photo=emp.photo_path is not None,
        ids_masked=not full_ids,
        expiry_days=ExpiryOut(
            national_id=_days_left(emp.national_id_expiry, today),
            passport=_days_left(emp.passport_expiry, today),
            insurance=_days_left(emp.insurance_expiry, today),
            contract=_days_left(emp.contract_end_date, today),
        ),
        has_account=has_account,
        created_at=emp.created_at,
        updated_at=emp.updated_at,
    )
