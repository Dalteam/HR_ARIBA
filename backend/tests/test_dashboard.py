from datetime import date, timedelta

from app.core.scheduling import today_riyadh
from app.models import Role
from tests.conftest import auth


def test_dashboard_figures(client, ref, make_user, make_employee):
    today = today_riyadh()
    hr = make_user(Role.hr)  # Egyptian, no gender, Ariba, 10,000 + 2,500
    make_employee(nationality_id=ref.saudi.id, gender="female", workplace_id=ref.optimum.id,
                  national_id_expiry=today + timedelta(days=10))
    make_employee(gender="male", category="tamheer", passport_expiry=today - timedelta(days=3))
    make_employee(termination_date=date(2025, 1, 1), termination_article="art_85",
                  national_id_expiry=today + timedelta(days=5))  # terminated: no alert, not counted
    make_employee(insurance_expiry=today + timedelta(days=200))  # outside the 90-day window

    r = client.get("/api/v1/dashboard", headers=auth(hr))
    assert r.status_code == 200, r.text
    d = r.json()
    assert (d["current"], d["saudi"], d["expat"], d["saudization_pct"]) == (4, 1, 3, "25.0")
    assert (d["male"], d["female"], d["gender_unspecified"]) == (1, 1, 2)
    assert (d["terminated"], d["tamheer"], d["pending_requests"]) == (1, 1, 0)
    assert d["payroll_total"] == "50000.00"  # 4 x 12,500
    assert {w["name_en"]: w["count"] for w in d["workplaces"]} == {"Ariba": 3, "Optimum": 1}
    assert [(a["kind"], a["level"]) for a in d["alerts"]] == [("passport", "expired"), ("iqama", "urgent")]
    assert d["payroll_summary"] is None


def test_dashboard_permissions(client, make_user):
    ceo = make_user(Role.ceo)
    r = client.get("/api/v1/dashboard", headers=auth(ceo))
    assert r.status_code == 200
    assert r.json()["payroll_total"] is None
    assert all(w["salary_total"] is None for w in r.json()["workplaces"])
    for role in (Role.employee, Role.manager, Role.finance):
        assert client.get("/api/v1/dashboard", headers=auth(make_user(role))).status_code == 403
