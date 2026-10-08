from app.models import Role
from tests.conftest import auth


def test_payroll_sheet_save_approve(client, make_user):
    fin, hr, staff = make_user(Role.finance), make_user(Role.hr), make_user(Role.employee)
    url = "/api/v1/sheets/pay_2026_09"
    assert client.get(url, headers=auth(fin)).json()["data"] is None
    r = client.put(url, json={"data": [{"id": "1", "sal": 10000}]}, headers=auth(fin))
    assert r.status_code == 200 and r.json()["data"][0]["sal"] == 10000
    assert client.get(url, headers=auth(staff)).status_code == 403
    assert client.post(url + "/approve", headers=auth(fin)).json()["approved"] is True
    assert client.put(url, json={"data": []}, headers=auth(fin)).status_code == 409
    assert client.post(url + "/unapprove", headers=auth(fin)).status_code == 403
    assert client.post(url + "/unapprove", headers=auth(hr)).json()["approved"] is False
    assert [s["key"] for s in client.get("/api/v1/sheets?prefix=pay_", headers=auth(fin)).json()] == ["pay_2026_09"]
