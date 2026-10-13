"""seed reference data

Workplaces, departments, nationalities, default holidays, GOSI rules, company and attendance
settings, and the approval stages per request type.

Revision ID: 0002
Revises: 0001
"""

import uuid
from datetime import date, time
from decimal import Decimal

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

WORKPLACES = [
    ("ariba", "اريبا", "Ariba"),
    ("geomechanics", "الجيوميكانية", "Geomechanics"),
    ("optimum", "أوبتيموم", "Optimum"),
    ("dar_altamayoz", "دار التميز", "Dar Al-Tamayoz"),
    ("riyadh_municipality", "أمانة الرياض", "Riyadh Municipality"),
]

DEPARTMENTS = [
    ("operations", "التشغيل", "Operations"),
    ("consulting", "الاستشارات", "Consulting"),
    ("logistics", "الخدمات اللوجستية", "Logistics"),
    ("finance", "المالية", "Finance"),
    ("marketing", "التسويق", "Marketing"),
    ("hr", "الموارد البشرية", "Human Resources"),
    ("training", "تدريب", "Training"),
    ("other", "أخرى", "Other"),
]

# (code, ar, en, is_saudi)
NATIONALITIES = [
    ("saudi", "سعودي", "Saudi", True),
    ("egyptian", "مصري", "Egyptian", False),
    ("jordanian", "أردني", "Jordanian", False),
    ("yemeni", "يمني", "Yemeni", False),
    ("syrian", "سوري", "Syrian", False),
    ("tunisian", "تونسي", "Tunisian", False),
    ("pakistani", "باكستاني", "Pakistani", False),
    ("filipino", "فلبيني", "Filipino", False),
    ("sudanese", "سوداني", "Sudanese", False),
    ("other", "أخرى", "Other", False),
]

# Fixed Gregorian holidays recur yearly. The two Eids follow the Hijri calendar, so they are
# seeded per year with expected dates; HR confirms or edits them each year.
HOLIDAYS = [
    ("يوم التأسيس", "Founding Day", date(2026, 2, 22), 1, True),
    ("اليوم الوطني", "National Day", date(2026, 9, 23), 1, True),
    ("عيد الفطر", "Eid al-Fitr", date(2026, 3, 20), 4, False),
    ("عيد الأضحى", "Eid al-Adha", date(2026, 5, 26), 4, False),
    ("عيد الفطر", "Eid al-Fitr", date(2027, 3, 9), 4, False),
    ("عيد الأضحى", "Eid al-Adha", date(2027, 5, 16), 4, False),
]

# (effective_from, system, employee, employer, employee 55+, employer 55+)
GOSI = [
    (date(2026, 1, 1), "matching", "10.75", "12.75", "10.50", "12.50"),
    (date(2026, 1, 1), "non_matching", "9.75", "11.75", "9.00", "11.00"),
    (date(2026, 1, 1), "non_saudi", "0", "2", "0", "2"),
    (date(2027, 7, 1), "matching", "11.25", "13.25", "11.00", "13.00"),
    (date(2027, 7, 1), "non_matching", "10.25", "12.25", "9.50", "11.50"),
    (date(2027, 7, 1), "non_saudi", "0", "2", "0", "2"),
]

# (request_type, manager, hr, ceo) — confirmed with the business owner.
WORKFLOW = [
    *[(t, True, True, True) for t in (
        "annual", "sick", "emergency", "death", "marriage", "maternity", "paternity",
        "umrah", "hajj", "remote", "advance",
    )],
    *[(t, True, True, False) for t in (
        "permission", "maternity_permission", "early_leave", "overtime", "mission",
    )],
    ("forgot_punch", False, True, False),
]


def _t(name: str, *cols: sa.Column) -> sa.Table:
    return sa.table(name, sa.column("id", sa.Uuid), *cols)


def upgrade() -> None:
    op.bulk_insert(
        _t("workplaces", sa.column("code"), sa.column("name_ar"), sa.column("name_en")),
        [{"id": uuid.uuid4(), "code": c, "name_ar": a, "name_en": e} for c, a, e in WORKPLACES],
    )
    op.bulk_insert(
        _t("departments", sa.column("code"), sa.column("name_ar"), sa.column("name_en")),
        [{"id": uuid.uuid4(), "code": c, "name_ar": a, "name_en": e} for c, a, e in DEPARTMENTS],
    )
    op.bulk_insert(
        _t(
            "nationalities",
            sa.column("code"),
            sa.column("name_ar"),
            sa.column("name_en"),
            sa.column("is_saudi", sa.Boolean),
            sa.column("sort_order", sa.Integer),
        ),
        [
            {"id": uuid.uuid4(), "code": c, "name_ar": a, "name_en": e, "is_saudi": s, "sort_order": i}
            for i, (c, a, e, s) in enumerate(NATIONALITIES)
        ],
    )
    op.bulk_insert(
        _t(
            "holidays",
            sa.column("name_ar"),
            sa.column("name_en"),
            sa.column("start_date", sa.Date),
            sa.column("days", sa.Integer),
            sa.column("is_recurring", sa.Boolean),
        ),
        [
            {"id": uuid.uuid4(), "name_ar": a, "name_en": e, "start_date": d, "days": n, "is_recurring": r}
            for a, e, d, n, r in HOLIDAYS
        ],
    )
    op.bulk_insert(
        _t(
            "gosi_rules",
            sa.column("effective_from", sa.Date),
            sa.column("system"),
            sa.column("employee_rate", sa.Numeric),
            sa.column("employer_rate", sa.Numeric),
            sa.column("employee_rate_senior", sa.Numeric),
            sa.column("employer_rate_senior", sa.Numeric),
            sa.column("senior_age", sa.Integer),
            sa.column("wage_cap", sa.Numeric),
        ),
        [
            {
                "id": uuid.uuid4(),
                "effective_from": d,
                "system": s,
                "employee_rate": Decimal(ee),
                "employer_rate": Decimal(er),
                "employee_rate_senior": Decimal(ee55),
                "employer_rate_senior": Decimal(er55),
                "senior_age": 55,
                "wage_cap": Decimal("45000"),
            }
            for d, s, ee, er, ee55, er55 in GOSI
        ],
    )
    op.bulk_insert(
        _t("company_settings", sa.column("company_name_ar"), sa.column("company_name_en"), sa.column("labour_law_country")),
        [{"id": uuid.uuid4(), "company_name_ar": "أريبا للاستشارات", "company_name_en": "Ariba for Consulting", "labour_law_country": "SA"}],
    )
    op.bulk_insert(
        _t(
            "attendance_settings",
            sa.column("work_start", sa.Time),
            sa.column("tolerance_minutes", sa.Integer),
            sa.column("flexible_enabled", sa.Boolean),
            sa.column("shift_hours", sa.Numeric),
            sa.column("window_start", sa.Time),
            sa.column("window_end", sa.Time),
            sa.column("remote_days_per_year", sa.Integer),
        ),
        [
            {
                "id": uuid.uuid4(),
                "work_start": time(8, 0),
                "tolerance_minutes": 15,
                "flexible_enabled": False,
                "shift_hours": Decimal("8"),
                "window_start": time(8, 0),
                "window_end": time(17, 0),
                "remote_days_per_year": 10,
            }
        ],
    )
    op.bulk_insert(
        _t(
            "workflow_rules",
            sa.column("request_type"),
            sa.column("requires_manager", sa.Boolean),
            sa.column("requires_hr", sa.Boolean),
            sa.column("requires_ceo", sa.Boolean),
        ),
        [
            {"id": uuid.uuid4(), "request_type": t, "requires_manager": m, "requires_hr": h, "requires_ceo": c}
            for t, m, h, c in WORKFLOW
        ],
    )


def downgrade() -> None:
    for table in (
        "workflow_rules",
        "attendance_settings",
        "company_settings",
        "gosi_rules",
        "holidays",
        "nationalities",
        "departments",
        "workplaces",
    ):
        op.execute(f"DELETE FROM {table}")
