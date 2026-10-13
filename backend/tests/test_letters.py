from app.models import Role
from tests.conftest import auth


def test_send_and_respond(client, make_user, make_employee):
    hr = make_user(Role.hr)
    emp = make_employee(name_ar="ريم")
    staff = make_user(Role.employee, employee=emp)
    r = client.post("/api/v1/letters", headers=auth(hr), json={"employee_id": str(emp.id), "type": "onboarding", "title": "مباشرة عمل", "html": "<p>x</p>"})
    assert r.status_code == 201
    lid = r.json()["id"]
    mine = client.get("/api/v1/me/letters", headers=auth(staff)).json()
    assert [m["id"] for m in mine] == [lid]
    assert client.get(f"/api/v1/letters/{lid}/html", headers=auth(staff)).text == "<p>x</p>"
    assert client.post(f"/api/v1/me/letters/{lid}/respond", headers=auth(staff), json={"action": "rejected", "reason": "x"}).status_code == 422
    r = client.post(f"/api/v1/me/letters/{lid}/respond", headers=auth(staff), json={"action": "rejected", "reason": "التاريخ غلط"})
    assert r.json()["status"] == "rejected"
    st = client.get("/api/v1/letters", headers=auth(hr)).json()
    assert st[0]["rejection_reason"] == "التاريخ غلط"
