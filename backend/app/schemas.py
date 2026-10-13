"""Every request/response shape."""

import re
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_serializer, field_validator

from app.models import (
    ContractNature,
    Currency,
    DependentRelation,
    DocumentType,
    EmployeeCategory,
    AttendanceSource,
    AttendanceStatus,
    Gender,
    GosiSystem,
    LocationType,
    MaritalStatus,
    PaymentMethod,
    Religion,
    Role,
    TerminationArticle,
    WpsType,
)

Money = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]

_IBAN = re.compile(r"^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$")
_EMP_NO = re.compile(r"^[A-Za-z]{0,5}\d{1,10}$")


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------- auth


class LoginIn(BaseModel):
    username: Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=1, max_length=60)]
    password: Annotated[str, StringConstraints(min_length=1, max_length=200)]


class RefreshIn(BaseModel):
    refresh_token: Annotated[str, StringConstraints(min_length=1, max_length=4000)]


class ChangePasswordIn(BaseModel):
    old_password: Annotated[str, StringConstraints(min_length=1, max_length=200)]
    new_password: Annotated[str, StringConstraints(min_length=1, max_length=200)]


class EmployeeBrief(ORM):
    id: uuid.UUID
    emp_no: str
    name_ar: str
    name_en: str | None


class UserOut(ORM):
    id: uuid.UUID
    username: str
    role: Role
    is_active: bool
    must_change_password: bool
    employee: EmployeeBrief | None


class SessionOut(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int
    user: UserOut


class CreateAccountIn(BaseModel):
    employee_id: uuid.UUID
    role: Role = Role.employee


class UpdateAccountIn(BaseModel):
    role: Role | None = None
    is_active: bool | None = None


class TemporaryPasswordOut(BaseModel):
    user: UserOut
    temporary_password: str


# --------------------------------------------------------------------------- lookups


class LookupOut(ORM):
    id: uuid.UUID
    code: str
    name_ar: str
    name_en: str


class NationalityOut(LookupOut):
    is_saudi: bool


class LookupsOut(BaseModel):
    workplaces: list[LookupOut]
    departments: list[LookupOut]
    nationalities: list[NationalityOut]


# --------------------------------------------------------------------------- employees


class EmployeeBase(BaseModel):
    """Fields HR can set. All optional here; EmployeeCreate makes the essentials required."""

    name_ar: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=200)] | None = None
    name_en: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None = None
    birth_date: date | None = None
    gender: Gender | None = None
    religion: Religion | None = None
    marital_status: MaritalStatus | None = None
    mobile: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\+?[0-9 ]{7,20}$")] | None = None
    email: EmailStr | None = None
    national_address: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = None
    nationality_id: uuid.UUID | None = None

    workplace_id: uuid.UUID | None = None
    department_id: uuid.UUID | None = None
    job_title: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None = None
    manager_id: uuid.UUID | None = None
    sponsor: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] | None = None

    category: EmployeeCategory | None = None
    wps_type: WpsType | None = None

    bank_name: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None = None
    iban: Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, max_length=34)] | None = None

    national_id: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\d{10}$")] | None = None
    national_id_expiry: date | None = None
    passport_no: Annotated[str, StringConstraints(strip_whitespace=True, max_length=30)] | None = None
    passport_expiry: date | None = None
    insurance_company: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None = None
    insurance_class: Annotated[str, StringConstraints(strip_whitespace=True, max_length=30)] | None = None
    insurance_card_no: Annotated[str, StringConstraints(strip_whitespace=True, max_length=60)] | None = None
    insurance_expiry: date | None = None

    contract_nature: ContractNature | None = None
    contract_duration_months: Annotated[int, Field(ge=1, le=120)] | None = None
    join_date: date | None = None
    contract_end_date: date | None = None
    annual_leave_days: Annotated[int, Field(ge=0, le=60)] | None = None

    basic_salary: Money | None = None
    housing_allowance: Money | None = None
    transport_allowance: Money | None = None
    project_allowance: Money | None = None
    other_allowances: Money | None = None
    extra_allowance: Money | None = None
    other_deductions: Money | None = None
    currency: Currency | None = None
    exchange_rate: Annotated[Decimal, Field(gt=0, max_digits=10, decimal_places=4)] | None = None
    gosi_system: GosiSystem | None = None
    payment_method: PaymentMethod | None = None

    exclude_from_payroll: bool | None = None
    exclude_from_eos: bool | None = None
    notes: Annotated[str, StringConstraints(strip_whitespace=True, max_length=4000)] | None = None

    @field_validator("iban")
    @classmethod
    def _iban(cls, v: str | None) -> str | None:
        if v:
            v = v.replace(" ", "")
            if not _IBAN.match(v):
                raise ValueError("Invalid IBAN")
        return v or None


class EmployeeCreate(EmployeeBase):
    # Blank -> the server assigns the next free number (empNNN), as the prototype did.
    emp_no: Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, max_length=20)] | None = None
    name_ar: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=200)]
    workplace_id: uuid.UUID
    join_date: date

    @field_validator("emp_no")
    @classmethod
    def _emp_no(cls, v: str | None) -> str | None:
        if not v:
            return None
        if not _EMP_NO.match(v):
            raise ValueError("Employee number must look like emp084")
        return v


class EmployeeUpdate(EmployeeBase):
    """PATCH: only fields present in the body are changed."""


class TerminateIn(BaseModel):
    termination_date: date
    article: TerminationArticle
    reason: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None = None


class EmployeeListItem(BaseModel):
    id: uuid.UUID
    emp_no: str
    name_ar: str
    name_en: str | None
    job_title: str | None
    category: EmployeeCategory
    nationality: LookupOut | None
    is_saudi: bool
    workplace: LookupOut | None
    department: LookupOut | None
    national_id_masked: str | None
    join_date: date | None
    contract_end_date: date | None
    termination_date: date | None
    is_terminated: bool
    national_id_expiry: date | None
    years_of_service: Decimal
    national_id_days_left: int | None
    contract_days_left: int | None
    # Only for roles that may see salaries (finance/hr/admin); null otherwise.
    total_salary: Decimal | None = None
    net_salary: Decimal | None = None
    currency: Currency | None = None
    has_photo: bool


class SalaryOut(BaseModel):
    """Money is always serialized with 2 decimals and the exchange rate with 4."""

    basic_salary: Decimal
    housing_allowance: Decimal
    transport_allowance: Decimal
    project_allowance: Decimal
    other_allowances: Decimal
    extra_allowance: Decimal
    other_deductions: Decimal
    total_salary: Decimal
    gosi_employee: Decimal
    gosi_employer: Decimal
    net_salary: Decimal
    net_salary_sar: Decimal
    eos_award: Decimal | None
    currency: Currency
    exchange_rate: Decimal
    gosi_system: GosiSystem
    payment_method: PaymentMethod
    bank_name: str | None
    iban: str | None

    @field_serializer(
        "basic_salary", "housing_allowance", "transport_allowance", "project_allowance",
        "other_allowances", "extra_allowance", "other_deductions", "total_salary",
        "gosi_employee", "gosi_employer", "net_salary", "net_salary_sar", "eos_award",
    )
    def _money(self, v: Decimal | None) -> str | None:
        return None if v is None else str(Decimal(v).quantize(Decimal("0.01")))

    @field_serializer("exchange_rate")
    def _rate(self, v: Decimal) -> str:
        return str(Decimal(v).quantize(Decimal("0.0001")))


class ExpiryOut(BaseModel):
    """Days left until each expiry (negative = already expired)."""

    national_id: int | None
    passport: int | None
    insurance: int | None
    contract: int | None


class EmployeeOut(BaseModel):
    id: uuid.UUID
    emp_no: str
    name_ar: str
    name_en: str | None
    birth_date: date | None
    gender: Gender | None
    religion: Religion | None
    marital_status: MaritalStatus | None
    mobile: str | None
    email: str | None
    national_address: str | None
    nationality: NationalityOut | None
    is_saudi: bool

    workplace: LookupOut | None
    department: LookupOut | None
    job_title: str | None
    manager: EmployeeBrief | None
    sponsor: str | None
    category: EmployeeCategory
    wps_type: WpsType

    national_id: str | None
    national_id_expiry: date | None
    passport_no: str | None
    passport_expiry: date | None
    insurance_company: str | None
    insurance_class: str | None
    insurance_card_no: str | None
    insurance_expiry: date | None

    contract_nature: ContractNature
    contract_duration_months: int | None
    join_date: date | None
    contract_end_date: date | None
    annual_leave_days: int

    exclude_from_payroll: bool
    exclude_from_eos: bool

    termination_date: date | None
    termination_article: TerminationArticle | None
    termination_reason: str | None
    is_terminated: bool
    notes: str | None

    salary: SalaryOut | None = Field(None, description="Only for finance/hr/admin, or the employee themselves")
    years_of_service: Decimal
    has_photo: bool
    ids_masked: bool
    expiry_days: ExpiryOut
    has_account: bool
    created_at: datetime
    updated_at: datetime


class EmployeeCounts(BaseModel):
    all: int
    active: int
    terminated: int
    tamheer: int
    training: int
    consultants: int
    saudi: int
    expat: int
    saudization_pct: Decimal


class SalaryPreviewIn(BaseModel):
    """Live salary preview while HR types (the prototype's salary box under the salary tab)."""

    basic_salary: Money = Decimal(0)
    housing_allowance: Money = Decimal(0)
    transport_allowance: Money = Decimal(0)
    project_allowance: Money = Decimal(0)
    other_allowances: Money = Decimal(0)
    extra_allowance: Money = Decimal(0)
    other_deductions: Money = Decimal(0)
    currency: Currency = Currency.SAR
    exchange_rate: Annotated[Decimal, Field(gt=0, max_digits=10, decimal_places=4)] = Decimal(1)
    gosi_system: GosiSystem = GosiSystem.matching
    nationality_id: uuid.UUID | None = None
    wps_type: WpsType = WpsType.wps
    category: EmployeeCategory = EmployeeCategory.active
    birth_date: date | None = None


class SalaryPreviewOut(BaseModel):
    total_salary: Decimal
    gosi_employee: Decimal
    gosi_employer: Decimal
    net_salary: Decimal
    net_salary_sar: Decimal
    gosi_system: GosiSystem


# --------------------------------------------------------------------------- dashboard


class CountItem(BaseModel):
    name_ar: str
    name_en: str
    count: int


class WorkplaceItem(CountItem):
    salary_total: Decimal | None = Field(None, description="SAR per month; finance/hr/admin only")


class AlertOut(BaseModel):
    employee: EmployeeBrief
    kind: str  # iqama | passport | insurance | contract
    expires_on: date
    days_left: int
    level: str  # expired | urgent | soon


class PayrollSummary(BaseModel):
    year: int
    month: int


class DashboardOut(BaseModel):
    current: int
    saudi: int
    expat: int
    saudization_pct: Decimal
    payroll_total: Decimal | None = Field(None, description="SAR per month; finance/hr/admin only")
    male: int
    female: int
    gender_unspecified: int
    terminated: int
    tamheer: int
    pending_requests: int
    departments: list[CountItem]
    nationalities: list[CountItem]
    workplaces: list[WorkplaceItem]
    alerts: list[AlertOut]
    payroll_summary: PayrollSummary | None


# --------------------------------------------------------------------------- documents & dependents


class DocumentOut(ORM):
    id: uuid.UUID
    employee_id: uuid.UUID | None
    dependent_id: uuid.UUID | None
    type: DocumentType
    title: str | None
    file_name: str
    mime_type: str
    size_bytes: int
    created_at: datetime


_Text = lambda n: Annotated[str, StringConstraints(strip_whitespace=True, max_length=n)] | None  # noqa: E731


class DependentIn(BaseModel):
    relation: DependentRelation | None = None
    name_ar: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=200)] | None = None
    name_en: _Text(200) = None
    birth_date: date | None = None
    national_id: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\d{10}$")] | None = None
    national_id_expiry: date | None = None
    passport_no: _Text(30) = None
    passport_expiry: date | None = None
    insurance_company: _Text(120) = None
    insurance_card_no: _Text(60) = None
    insurance_expiry: date | None = None
    mobile: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\+?[0-9 ]{7,20}$")] | None = None


class DependentCreate(DependentIn):
    relation: DependentRelation
    name_ar: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=200)]


class DependentOut(BaseModel):
    id: uuid.UUID
    employee_id: uuid.UUID
    relation: DependentRelation
    name_ar: str
    name_en: str | None
    birth_date: date | None
    national_id: str | None
    national_id_expiry: date | None
    passport_no: str | None
    passport_expiry: date | None
    insurance_company: str | None
    insurance_card_no: str | None
    insurance_expiry: date | None
    mobile: str | None
    documents: list[DocumentOut]


# --------------------------------------------------------------------------- locations


class LocationCreate(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=200)]
    name_en: str | None = None
    workplace_id: uuid.UUID | None = None
    type: LocationType = LocationType.hq
    radius_m: int = Field(default=200, ge=50, le=5000)
    latitude: Decimal = Decimal("0")
    longitude: Decimal = Decimal("0")


class LocationUpdate(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=200)] | None = None
    name_en: str | None = None
    workplace_id: uuid.UUID | None = None
    type: LocationType | None = None
    radius_m: int | None = Field(default=None, ge=50, le=5000)
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    is_active: bool | None = None


class LocationOut(BaseModel):
    id: uuid.UUID
    name: str
    name_en: str | None
    workplace_id: uuid.UUID | None
    workplace: str | None
    type: LocationType
    radius_m: int
    latitude: Decimal
    longitude: Decimal
    is_active: bool


# --------------------------------------------------------------------------- attendance


class AttendanceCreate(BaseModel):
    employee_id: uuid.UUID
    work_date: date
    time_in: Annotated[str, StringConstraints(pattern=r"^\d{1,2}:\d{2}$")] | None = None
    time_out: Annotated[str, StringConstraints(pattern=r"^\d{1,2}:\d{2}$")] | None = None
    location_id: uuid.UUID | None = None
    status: AttendanceStatus = AttendanceStatus.present
    notes: str | None = None


class AttendanceUpdate(BaseModel):
    time_in: Annotated[str, StringConstraints(pattern=r"^\d{1,2}:\d{2}$")] | None = None
    time_out: Annotated[str, StringConstraints(pattern=r"^\d{1,2}:\d{2}$")] | None = None
    location_id: uuid.UUID | None = None
    status: AttendanceStatus | None = None
    notes: str | None = None


class AttendanceOut(BaseModel):
    id: uuid.UUID
    employee_id: uuid.UUID
    employee_name: str
    workplace: str | None
    work_date: date
    time_in: str | None
    time_out: str | None
    location_id: uuid.UUID | None
    location_name: str | None
    status: AttendanceStatus
    late_minutes: int
    early_minutes: int
    source: AttendanceSource
    notes: str | None


class AttendanceSummaryOut(BaseModel):
    employee_id: uuid.UUID
    employee_name: str
    present: int
    late: int
    absent: int
    leave: int
    remote: int
