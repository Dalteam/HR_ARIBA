from datetime import date

from app.models import Role
from tests.conftest import auth


def test_holidays_requests_balances(client, make_user, make_employee):
    hr = make_user(Role.hr)
    emp = make_employee(name_ar="سارة", join_date=date(2024, 1, 1), annual_leave_days=21)
    h = auth(hr)

    r = client.post("/api/v1/holidays", json={"name_ar": "عيد", "start_date": "2026-03-20", "days": 4}, headers=h)
    assert r.status_code == 201
    hid = r.json()["id"]
    assert any(x["id"] == hid for x in client.get("/api/v1/holidays", headers=h).json())

    # HR records an annual leave → starts at HR stage, days = workdays
    r = client.post("/api/v1/requests", json={"employee_id": str(emp.id), "type": "annual",
                                              "from_date": "2026-03-15", "to_date": "2026-03-26"}, headers=h)
    assert r.status_code == 201, r.text
    req = r.json()
    assert req["stage"] == "hr" and req["status"] == "pending"
    assert float(req["days"]) == 8  # 15–26 Mar 2026: 10 Sun–Thu days minus 22 and 23 Mar (holiday 20–23)

    before = next(b for b in client.get("/api/v1/leave/balances", headers=h).json() if b["employee_id"] == str(emp.id))
    r = client.post(f"/api/v1/requests/{req['id']}/approve", json={}, headers=h)
    assert r.json()["status"] == "pending" and r.json()["stage"] == "ceo"  # annual: manager → HR → CEO
    r = client.post(f"/api/v1/requests/{req['id']}/final-approve", json={}, headers=h)
    assert r.json()["status"] == "approved"
    after = next(b for b in client.get("/api/v1/leave/balances", headers=h).json() if b["employee_id"] == str(emp.id))
    assert round(before["current"] - after["current"], 2) == 8

    # reject needs a reason
    r = client.post("/api/v1/requests", json={"employee_id": str(emp.id), "type": "sick",
                                              "from_date": "2026-04-05", "to_date": "2026-04-06"}, headers=h)
    sick = r.json()
    assert float(sick["days"]) == 2
    assert client.post(f"/api/v1/requests/{sick['id']}/reject", json={}, headers=h).status_code == 422
    assert client.post(f"/api/v1/requests/{sick['id']}/reject", json={"reason": "لا"}, headers=h).json()["status"] == "rejected"

    # delete the approved leave → balance returns
    assert client.delete(f"/api/v1/requests/{req['id']}", headers=h).status_code == 204
    back = next(b for b in client.get("/api/v1/leave/balances", headers=h).json() if b["employee_id"] == str(emp.id))
    assert back["current"] == before["current"]

    # year-by-year editor
    r = client.put(f"/api/v1/leave/employees/{emp.id}", headers=h, json={
        "date": "2026-10-05", "note": "تصحيح", "years": [{"year": 2025, "carry": 0, "entitlement": 21, "used": 5, "adjustment": 0}]})
    assert r.status_code == 200, r.text
    y25 = next(y for y in r.json()["years"] if y["year"] == 2025)
    assert y25["close"] == 16 and y25["carry"] == 10 and y25["eos"] == 6
