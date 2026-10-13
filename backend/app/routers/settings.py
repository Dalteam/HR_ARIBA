"""Reference data and company settings."""

from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.database import get_db
from app.models import Department, GosiRule, GosiSystem, Nationality, User, Workplace
from app.schemas import LookupOut, LookupsOut, NationalityOut

router = APIRouter(prefix="/settings", tags=["settings"])


class GosiRatesOut(BaseModel):
    """Effective GOSI rates for one date, as fractions (percentage / 100) in the shape the
    legacy payroll engine (frontend/legacy js/payroll/107-ariba-v119-payroll.js `rates`) expects."""

    match_emp: float
    match_emp_55: float
    match_er: float
    match_er_55: float
    no_match_emp: float
    no_match_emp_55: float
    no_match_er: float
    no_match_er_55: float
    non_saudi_er: float
    cap: float
    age_thr: int


@router.get("/lookups", response_model=LookupsOut)
def lookups(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return LookupsOut(
        workplaces=[LookupOut.model_validate(w) for w in db.scalars(select(Workplace).where(Workplace.is_active.is_(True)).order_by(Workplace.name_ar))],
        departments=[LookupOut.model_validate(d) for d in db.scalars(select(Department).where(Department.is_active.is_(True)).order_by(Department.name_ar))],
        nationalities=[NationalityOut.model_validate(n) for n in db.scalars(select(Nationality).order_by(Nationality.sort_order))],
    )


@router.get("/gosi-rates", response_model=GosiRatesOut)
def gosi_rates(on: date, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The GOSI rules in force on `on` (the latest effective_from <= on per system), as fractions."""
    rules = list(db.scalars(select(GosiRule)))

    def effective(system: GosiSystem) -> GosiRule | None:
        candidates = [r for r in rules if r.system == system and r.effective_from <= on]
        return max(candidates, key=lambda r: r.effective_from) if candidates else None

    def fraction(system: GosiSystem, field: str) -> float:
        rule = effective(system)
        return float(getattr(rule, field)) / 100 if rule else 0.0

    matching = effective(GosiSystem.matching)
    non_matching = effective(GosiSystem.non_matching)
    non_saudi = effective(GosiSystem.non_saudi)
    any_rule = matching or non_matching or non_saudi

    return GosiRatesOut(
        match_emp=fraction(GosiSystem.matching, "employee_rate"),
        match_emp_55=fraction(GosiSystem.matching, "employee_rate_senior"),
        match_er=fraction(GosiSystem.matching, "employer_rate"),
        match_er_55=fraction(GosiSystem.matching, "employer_rate_senior"),
        no_match_emp=fraction(GosiSystem.non_matching, "employee_rate"),
        no_match_emp_55=fraction(GosiSystem.non_matching, "employee_rate_senior"),
        no_match_er=fraction(GosiSystem.non_matching, "employer_rate"),
        no_match_er_55=fraction(GosiSystem.non_matching, "employer_rate_senior"),
        non_saudi_er=fraction(GosiSystem.non_saudi, "employer_rate"),
        cap=float(any_rule.wage_cap) if any_rule else 45000.0,
        age_thr=any_rule.senior_age if any_rule else 55,
    )


# --------------------------------------------------------------------------- settings page (#pg-set)
from datetime import time  # noqa: E402
from decimal import Decimal  # noqa: E402
import uuid  # noqa: E402

from fastapi import Request  # noqa: E402
from pydantic import Field  # noqa: E402

from app.core.audit import audit  # noqa: E402
from app.core.errors import ApiError, not_found  # noqa: E402
from app.core.permissions import HR_READ_ROLES, HR_ROLES, require_roles  # noqa: E402
from app.models import AttendanceSettings, CompanySettings, Employee  # noqa: E402

_HR = require_roles(*HR_ROLES)
_HR_READ = require_roles(*HR_READ_ROLES)


class CompanyIO(BaseModel):
    company_name_ar: str = Field(min_length=1, max_length=200)
    company_name_en: str = Field("", max_length=200)
    labour_law_country: str = Field("SA", min_length=2, max_length=2)


class AttendanceIO(BaseModel):
    work_start: time
    tolerance_minutes: int = Field(ge=0, le=240)
    remote_days_per_year: int = Field(ge=0, le=366)
    flexible_enabled: bool
    shift_hours: Decimal = Field(ge=1, le=16)
    window_start: time
    window_end: time


def _company(db: Session) -> CompanySettings:
    c = db.scalar(select(CompanySettings))
    if c is None:
        c = CompanySettings(company_name_ar="شركة اريبا لخدمات الأعمال", company_name_en="Ariba Business Solutions", labour_law_country="SA")
        db.add(c)
        db.flush()
    return c


def _att(db: Session) -> AttendanceSettings:
    a = db.scalar(select(AttendanceSettings))
    if a is None:
        a = AttendanceSettings(work_start=time(8, 0), tolerance_minutes=15, flexible_enabled=False, shift_hours=Decimal(8),
                               window_start=time(8, 0), window_end=time(17, 0), remote_days_per_year=10)
        db.add(a)
        db.flush()
    return a


@router.get("/company", response_model=CompanyIO)
def get_company(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _company(db)
    db.commit()
    return CompanyIO(company_name_ar=c.company_name_ar, company_name_en=c.company_name_en, labour_law_country=c.labour_law_country)


@router.put("/company", response_model=CompanyIO)
def put_company(body: CompanyIO, request: Request, user: User = Depends(_HR), db: Session = Depends(get_db)):
    c = _company(db)
    c.company_name_ar, c.company_name_en, c.labour_law_country = body.company_name_ar, body.company_name_en, body.labour_law_country
    audit(db, request, user, "update", "company_settings", c.id)
    db.commit()
    return body


def _att_out(a: AttendanceSettings) -> AttendanceIO:
    return AttendanceIO(work_start=a.work_start, tolerance_minutes=a.tolerance_minutes, remote_days_per_year=a.remote_days_per_year,
                        flexible_enabled=a.flexible_enabled, shift_hours=a.shift_hours, window_start=a.window_start, window_end=a.window_end)


@router.get("/attendance", response_model=AttendanceIO)
def get_attendance_settings(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = _att(db)
    db.commit()
    return _att_out(a)


@router.put("/attendance", response_model=AttendanceIO)
def put_attendance_settings(body: AttendanceIO, request: Request, user: User = Depends(_HR), db: Session = Depends(get_db)):
    if body.window_end <= body.window_start:
        raise ApiError(422, "invalid_window", "نهاية النطاق لازم تكون بعد بدايته")
    a = _att(db)
    for k, v in body.model_dump().items():
        setattr(a, k, v)
    audit(db, request, user, "update", "attendance_settings", a.id)
    db.commit()
    return _att_out(a)


# GOSI periods in the legacy shape (getInsSettings: wageCap, ageThreshold, effectiveRules[] in percent).
class GosiPeriod(BaseModel):
    date: date
    matchEmp: Decimal
    matchEmp55: Decimal
    matchEr: Decimal
    matchEr55: Decimal
    noMatchEmp: Decimal
    noMatchEmp55: Decimal
    noMatchEr: Decimal
    noMatchEr55: Decimal
    nonSaudiEr: Decimal


class GosiSettingsIO(BaseModel):
    wageCap: Decimal = Field(gt=0)
    ageThreshold: int = Field(ge=1, le=120)
    effectiveRules: list[GosiPeriod] = Field(min_length=1)


@router.get("/gosi", response_model=GosiSettingsIO)
def get_gosi(_: User = Depends(_HR_READ), db: Session = Depends(get_db)):
    rules = list(db.scalars(select(GosiRule).order_by(GosiRule.effective_from)))
    by_date: dict = {}
    for r in rules:
        by_date.setdefault(r.effective_from, {})[r.system] = r
    periods = []
    for d, m in sorted(by_date.items()):
        mt, nm, ns = m.get(GosiSystem.matching), m.get(GosiSystem.non_matching), m.get(GosiSystem.non_saudi)
        z = Decimal(0)
        periods.append(GosiPeriod(
            date=d,
            matchEmp=mt.employee_rate if mt else z, matchEmp55=mt.employee_rate_senior if mt else z,
            matchEr=mt.employer_rate if mt else z, matchEr55=mt.employer_rate_senior if mt else z,
            noMatchEmp=nm.employee_rate if nm else z, noMatchEmp55=nm.employee_rate_senior if nm else z,
            noMatchEr=nm.employer_rate if nm else z, noMatchEr55=nm.employer_rate_senior if nm else z,
            nonSaudiEr=ns.employer_rate if ns else z,
        ))
    any_rule = rules[-1] if rules else None
    return GosiSettingsIO(wageCap=any_rule.wage_cap if any_rule else Decimal(45000), ageThreshold=any_rule.senior_age if any_rule else 55,
                          effectiveRules=periods or [GosiPeriod(date=date(2026, 1, 1), **{k: Decimal(0) for k in GosiPeriod.model_fields if k != "date"})])


@router.put("/gosi", response_model=GosiSettingsIO)
def put_gosi(body: GosiSettingsIO, request: Request, user: User = Depends(_HR), db: Session = Depends(get_db)):
    """Legacy saveInsSettings: replace every period (sorted by date). Historical periods are kept as entered."""
    if len({p.date for p in body.effectiveRules}) != len(body.effectiveRules):
        raise ApiError(422, "duplicate_date", "تاريخ السريان مكرر")
    for r in list(db.scalars(select(GosiRule))):
        db.delete(r)
    db.flush()
    for p in sorted(body.effectiveRules, key=lambda x: x.date):
        common = {"effective_from": p.date, "senior_age": body.ageThreshold, "wage_cap": body.wageCap}
        db.add(GosiRule(system=GosiSystem.matching, employee_rate=p.matchEmp, employee_rate_senior=p.matchEmp55,
                        employer_rate=p.matchEr, employer_rate_senior=p.matchEr55, **common))
        db.add(GosiRule(system=GosiSystem.non_matching, employee_rate=p.noMatchEmp, employee_rate_senior=p.noMatchEmp55,
                        employer_rate=p.noMatchEr, employer_rate_senior=p.noMatchEr55, **common))
        db.add(GosiRule(system=GosiSystem.non_saudi, employee_rate=Decimal(0), employee_rate_senior=Decimal(0),
                        employer_rate=p.nonSaudiEr, employer_rate_senior=p.nonSaudiEr, **common))
    audit(db, request, user, "update", "gosi_rules", None, {"periods": len(body.effectiveRules)})
    db.commit()
    return get_gosi(user, db)


# Departments / workplaces (V60 "إدارة الأقسام وجهات العمل").
class LookupIn(BaseModel):
    name_ar: str = Field(min_length=1, max_length=120)
    name_en: str | None = None


def _code(name: str) -> str:
    return "c_" + uuid.uuid4().hex[:10]


@router.post("/lists/{kind}", response_model=LookupOut, status_code=201)
def add_lookup(kind: str, body: LookupIn, request: Request, user: User = Depends(_HR), db: Session = Depends(get_db)):
    model = {"workplaces": Workplace, "departments": Department}.get(kind)
    if model is None:
        raise not_found("Settings list")
    existing = db.scalar(select(model).where(model.name_ar == body.name_ar.strip()))
    if existing is not None:
        existing.is_active = True
        row = existing
    else:
        row = model(code=_code(body.name_ar), name_ar=body.name_ar.strip(), name_en=(body.name_en or body.name_ar).strip())
        db.add(row)
    db.flush()
    audit(db, request, user, "create", kind, row.id)
    db.commit()
    return LookupOut.model_validate(row)


@router.delete("/lists/{kind}/{item_id}", status_code=204)
def remove_lookup(kind: str, item_id: uuid.UUID, request: Request, user: User = Depends(_HR), db: Session = Depends(get_db)):
    model = {"workplaces": Workplace, "departments": Department}.get(kind)
    row = db.get(model, item_id) if model else None
    if row is None:
        raise not_found("Item")
    row.is_active = False  # employees keep their reference
    audit(db, request, user, "deactivate", kind, item_id)
    db.commit()


# Accounts & roles (V83) and payroll exclusion (V72).
class AccountRow(BaseModel):
    user_id: uuid.UUID
    employee_id: uuid.UUID | None
    name_ar: str
    username: str
    role: str
    is_active: bool
    must_change_password: bool


@router.get("/accounts", response_model=list[AccountRow])
def accounts(_: User = Depends(_HR), db: Session = Depends(get_db)):
    users = list(db.scalars(select(User).order_by(User.username)))
    names = {e.id: e.name_ar for e in db.scalars(select(Employee).where(Employee.id.in_([u.employee_id for u in users if u.employee_id])))}
    return [AccountRow(user_id=u.id, employee_id=u.employee_id, name_ar=names.get(u.employee_id, u.username), username=u.username,
                       role=u.role.value, is_active=u.is_active, must_change_password=u.must_change_password) for u in users]


class ExclusionIn(BaseModel):
    employee_id: uuid.UUID
    exclude: bool


@router.post("/payroll-exclusion", status_code=204)
def payroll_exclusion(body: ExclusionIn, request: Request, user: User = Depends(_HR), db: Session = Depends(get_db)):
    e = db.get(Employee, body.employee_id)
    if e is None or e.deleted_at is not None:
        raise not_found("Employee")
    e.exclude_from_payroll = body.exclude
    audit(db, request, user, "update", "employee", e.id, {"exclude_from_payroll": body.exclude})
    db.commit()
