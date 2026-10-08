from app.models import Role
from tests.conftest import auth


def test_settings_cards(client, make_user, make_employee):
    hr = make_user(Role.hr)
    h = auth(hr)
    r = client.put("/api/v1/settings/company", headers=h, json={"company_name_ar": "اريبا", "company_name_en": "Ariba", "labour_law_country": "SA"})
    assert r.status_code == 200 and client.get("/api/v1/settings/company", headers=h).json()["company_name_ar"] == "اريبا"

    a = client.get("/api/v1/settings/attendance", headers=h).json()
    a.update({"flexible_enabled": True, "shift_hours": 8, "window_start": "08:00:00", "window_end": "17:00:00", "tolerance_minutes": 10})
    assert client.put("/api/v1/settings/attendance", headers=h, json=a).json()["flexible_enabled"] is True

    g = client.get("/api/v1/settings/gosi", headers=h).json()
    assert len(g["effectiveRules"]) >= 1
    g["effectiveRules"].append({**g["effectiveRules"][-1], "date": "2028-01-01", "matchEmp": 12})
    g2 = client.put("/api/v1/settings/gosi", headers=h, json=g).json()
    assert g2["effectiveRules"][-1]["date"] == "2028-01-01" and float(g2["effectiveRules"][-1]["matchEmp"]) == 12
    rates = client.get("/api/v1/settings/gosi-rates?on=2028-02-01", headers=h).json()
    assert abs(rates["match_emp"] - 0.12) < 1e-9

    w = client.post("/api/v1/settings/lists/workplaces", headers=h, json={"name_ar": "جهة تجريبية"}).json()
    assert any(x["id"] == w["id"] for x in client.get("/api/v1/settings/lookups", headers=h).json()["workplaces"])
    assert client.delete(f"/api/v1/settings/lists/workplaces/{w['id']}", headers=h).status_code == 204

    emp = make_employee()
    assert client.post("/api/v1/settings/payroll-exclusion", headers=h, json={"employee_id": str(emp.id), "exclude": True}).status_code == 204
    assert any(r["username"] == hr.username for r in client.get("/api/v1/settings/accounts", headers=h).json())
