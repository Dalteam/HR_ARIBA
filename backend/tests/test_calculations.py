"""Hand-computed expected values for GOSI and end of service (see docs/BUSINESS_RULES.md)."""

from datetime import date
from decimal import Decimal as D

from sqlalchemy import select

from app.models import EmployeeCategory, GosiRule, GosiSystem, TerminationArticle as A, WpsType
from app.services import gosi
from app.services.end_of_service import eos_award, service_years
from tests.conftest import auth


def _rules(db):
    return list(db.scalars(select(GosiRule)))


def _calc(db, **kw):
    args = dict(
        rules=_rules(db),
        system=GosiSystem.matching,
        wps_type=WpsType.wps,
        category=EmployeeCategory.active,
        basic=D("12000"),
        housing=D("3000"),
        birth_date=date(1986, 1, 1),
        on=date(2026, 10, 1),
    )
    args.update(kw)
    return gosi.calculate(**args)


def test_gosi_matching_2026(db):
    r = _calc(db)
    assert (r.base, r.employee, r.employer) == (D("15000.00"), D("1612.50"), D("1912.50"))


def test_gosi_non_matching_and_senior(db):
    r = _calc(db, system=GosiSystem.non_matching)
    assert (r.employee, r.employer) == (D("1462.50"), D("1762.50"))  # 9.75% / 11.75%
    r = _calc(db, birth_date=date(1960, 1, 1))  # age 66 -> 10.50% / 12.50%
    assert (r.employee, r.employer) == (D("1575.00"), D("1875.00"))


def test_gosi_2027_rates_switch_on_effective_date(db):
    assert _calc(db, on=date(2027, 6, 30)).employee == D("1612.50")
    assert _calc(db, on=date(2027, 7, 1)).employee == D("1687.50")  # 11.25%


def test_gosi_wage_cap_and_partial_month(db):
    r = _calc(db, basic=D("40000"), housing=D("10000"))
    assert r.base == D("45000.00") and r.employee == D("4837.50")
    r = _calc(db, basic=D("40000"), housing=D("10000"), work_days=15)
    assert r.base == D("22500.00")


def test_gosi_non_saudi_and_exclusions(db):
    r = _calc(db, system=GosiSystem.non_saudi)
    assert (r.employee, r.employer) == (D("0.00"), D("300.00"))  # 0% / 2%
    assert _calc(db, wps_type=WpsType.no_wps).employer == D("0.00")
    assert _calc(db, category=EmployeeCategory.consultant).employee == D("0.00")


def test_age():
    assert gosi.age_on(date(1971, 10, 2), date(2026, 10, 1)) == 54
    assert gosi.age_on(date(1971, 10, 1), date(2026, 10, 1)) == 55
    assert gosi.age_on(None, date(2026, 10, 1)) == 30


def test_service_years():
    assert service_years(date(2019, 1, 1), date(2026, 7, 1)) == D("7.50")  # 2,738 days / 365.25, rounded to 2 places (legacy rEOS)
    assert service_years(None, date(2026, 1, 1)) == D("0")


def test_eos_by_article():
    base, y = D("15000"), D("7.50")
    assert eos_award(base, y, A.art_84) == D("75000.00")
    assert eos_award(base, y, A.art_85) == D("50000.00")
    assert eos_award(base, y, A.art_77) == D("131250.00")  # 75,000 + round(500 x 15 x 7.5)
    assert eos_award(base, y, A.art_80) == D("0.00")
    assert eos_award(base, D("1.9"), A.art_75) == D("0.00")
    assert eos_award(base, D("3"), A.art_85) == D("7500.00")  # 1/3 of 22,500
    assert eos_award(base, D("12"), A.art_85) == D("142500.00")  # full: 37,500 + 105,000


def test_gosi_v130_exemption_by_words():
    from app.models import EmployeeCategory, WpsType
    from app.services.gosi import exempt_kind

    k = lambda **kw: exempt_kind(wps_type=WpsType.wps, category=EmployeeCategory.active, **kw)
    assert k(job_title="محاسب") == ""
    assert k(job_title="مستشار قانوني") == "consultant"
    assert k(job_title="متدرب مبيعات") == "trainee"
    assert k(department="تدريب") == "trainee"
    assert k(department="إدارة التدريب") == ""
    assert k(workplace="برنامج تمهير") == "tamheer"
    assert exempt_kind(wps_type=WpsType.no_wps, category=EmployeeCategory.active) == "no_wps"
    assert exempt_kind(wps_type=WpsType.wps, category=EmployeeCategory.tamheer) == "tamheer"


def test_gosi_rates_endpoint(client, make_user):
    from app.models import Role

    fin = make_user(Role.finance)
    r = client.get("/api/v1/settings/gosi-rates", params={"on": "2026-10-01"}, headers=auth(fin))
    assert r.status_code == 200
    body = r.json()
    assert body["match_emp"] == 0.1075
    assert body["match_er"] == 0.1275
    assert body["no_match_emp"] == 0.0975
    assert body["non_saudi_er"] == 0.02
    assert body["cap"] == 45000
    assert body["age_thr"] == 55

    r = client.get("/api/v1/settings/gosi-rates", params={"on": "2027-07-01"}, headers=auth(fin))
    assert r.json()["match_emp"] == 0.1125
