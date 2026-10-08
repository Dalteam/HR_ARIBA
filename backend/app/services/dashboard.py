"""Dashboard figures (prototype `loadDash`), all computed from the database."""

from collections import Counter, defaultdict
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.permissions import SALARY_ROLES
from app.core.scheduling import today_riyadh
from app.models import Employee, EmployeeCategory, Gender, PayrollRun, Request, RequestStatus, User
from app.schemas import AlertOut, CountItem, DashboardOut, EmployeeBrief, PayrollSummary, WorkplaceItem
from app.services import alerts as alert_svc
from app.services.saudization import saudization_pct

CENT = Decimal("0.01")


def _total_sar(e: Employee) -> Decimal:
    total = (
        e.basic_salary + e.housing_allowance + e.transport_allowance
        + e.project_allowance + e.other_allowances + e.extra_allowance
    )
    return total * e.exchange_rate


# Legacy loadDash: female = gender field, or (when empty) a name starting with one of these first names.
_FEMALE_NAMES = ("منى", "زينب", "ريم", "بدريه", "ساره", "نوره", "كادي", "منيرة", "دعاء", "غدي", "لينا", "نهى", "سجى", "روان", "أثير", "هيا", "نورة", "فاطمة", "عائشة", "أفنان")


def _female(e: Employee) -> bool:
    if e.gender is not None:
        return e.gender == Gender.female
    return (e.name_ar or "").strip().startswith(_FEMALE_NAMES)


def build(db: Session, user: User) -> DashboardOut:
    from app.services.contracts import apply_auto_terminations

    apply_auto_terminations(db, today_riyadh())
    today = today_riyadh()
    all_emps = list(db.scalars(select(Employee).where(Employee.deleted_at.is_(None))).unique())
    current = [e for e in all_emps if e.termination_date is None]
    saudis = sum(1 for e in current if e.is_saudi)
    show_pay = user.role in SALARY_ROLES

    def counts(key) -> list[CountItem]:
        c: Counter = Counter()
        names: dict = {}
        for e in current:
            obj = key(e)
            k = obj.id if obj else None
            c[k] += 1
            names[k] = obj
        items = [
            CountItem(name_ar=names[k].name_ar if names[k] else "غير محدد", name_en=names[k].name_en if names[k] else "Unspecified", count=n)
            for k, n in c.items()
        ]
        return sorted(items, key=lambda i: -i.count)

    wp_count: Counter = Counter()
    wp_pay: dict = defaultdict(Decimal)
    wp_obj: dict = {}
    for e in current:
        k = e.workplace_id
        wp_obj[k] = e.workplace
        wp_count[k] += 1
        wp_pay[k] += _total_sar(e)
    workplaces = sorted(
        (
            WorkplaceItem(
                name_ar=wp_obj[k].name_ar if wp_obj[k] else "غير محدد",
                name_en=wp_obj[k].name_en if wp_obj[k] else "Unspecified",
                count=n,
                salary_total=wp_pay[k].quantize(CENT) if show_pay else None,
            )
            for k, n in wp_count.items()
        ),
        key=lambda i: -i.count,
    )

    alerts = alert_svc.collect(current, today)
    pending = db.scalar(select(func.count()).select_from(Request).where(Request.status == RequestStatus.pending)) or 0
    run = db.scalars(
        select(PayrollRun).where(PayrollRun.status == "approved").order_by(PayrollRun.year.desc(), PayrollRun.month.desc())
    ).first()

    return DashboardOut(
        current=len(current),
        saudi=saudis,
        expat=len(current) - saudis,
        saudization_pct=saudization_pct(saudis, len(current)),
        payroll_total=sum((_total_sar(e) for e in current), Decimal(0)).quantize(CENT) if show_pay else None,
        male=len(current) - sum(1 for e in current if _female(e)),
        female=sum(1 for e in current if _female(e)),
        gender_unspecified=0,
        terminated=len(all_emps) - len(current),
        tamheer=sum(1 for e in current if e.category == EmployeeCategory.tamheer),
        pending_requests=pending,
        departments=counts(lambda e: e.department),
        nationalities=counts(lambda e: e.nationality),
        workplaces=workplaces,
        alerts=[
            AlertOut(
                employee=EmployeeBrief.model_validate(a.employee),
                kind=a.kind,
                expires_on=a.expires_on,
                days_left=a.days_left,
                level=a.level,
            )
            for a in alerts
        ],
        payroll_summary=PayrollSummary(year=run.year, month=run.month) if (run and show_pay) else None,
    )
