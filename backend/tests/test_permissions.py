"""Permission isolation for the employees module."""

from app.models import Role
from tests.conftest import auth


def test_employee_sees_only_self(client, make_user, make_employee):
    me = make_user(Role.employee)
    other = make_employee()
    r = client.get("/api/v1/employees", headers=auth(me))
    assert [i["id"] for i in r.json()["items"]] == [str(me.employee_id)]
    # another user's record is reported as not found, not forbidden
    r = client.get(f"/api/v1/employees/{other.id}", headers=auth(me))
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


def test_manager_sees_direct_reports_only(client, make_user, make_employee):
    mgr = make_user(Role.manager)
    report = make_employee(manager_id=mgr.employee_id)
    stranger = make_employee()
    ids = {i["id"] for i in client.get("/api/v1/employees", headers=auth(mgr)).json()["items"]}
    assert ids == {str(mgr.employee_id), str(report.id)}
    assert client.get(f"/api/v1/employees/{stranger.id}", headers=auth(mgr)).status_code == 404

    detail = client.get(f"/api/v1/employees/{report.id}", headers=auth(mgr)).json()
    assert detail["salary"] is None
    assert detail["ids_masked"] is True
    assert detail["national_id"].startswith("******")


def test_finance_has_no_employee_directory(client, make_user, make_employee):
    fin = make_user(Role.finance)
    emp = make_employee()
    assert client.get("/api/v1/employees", headers=auth(fin)).status_code == 403
    assert client.get(f"/api/v1/employees/{emp.id}", headers=auth(fin)).status_code == 403


def test_ceo_reads_all_without_salaries(client, make_user, make_employee):
    ceo = make_user(Role.ceo)
    emp = make_employee()
    r = client.get(f"/api/v1/employees/{emp.id}", headers=auth(ceo))
    assert r.status_code == 200
    assert r.json()["salary"] is None


def test_only_hr_and_admin_write(client, ref, make_user, make_employee):
    emp = make_employee()
    body = {"emp_no": "emp777", "name_ar": "اختبار", "workplace_id": str(ref.ariba.id), "join_date": "2026-01-01"}
    for role in (Role.employee, Role.manager, Role.finance, Role.ceo):
        u = make_user(role)
        assert client.post("/api/v1/employees", headers=auth(u), json=body).status_code == 403, role
        assert client.patch(f"/api/v1/employees/{emp.id}", headers=auth(u), json={"job_title": "x"}).status_code == 403
        assert client.post(f"/api/v1/employees/{emp.id}/terminate", headers=auth(u), json={"termination_date": "2026-01-01", "article": "art_84"}).status_code == 403
    for role in (Role.hr, Role.admin):
        u = make_user(role)
        body["emp_no"] = f"emp7{role.value[:2]}1".replace("hr", "11").replace("ad", "22")
        assert client.post("/api/v1/employees", headers=auth(u), json=body).status_code == 201


def test_list_masks_ids_for_everyone(client, make_user, make_employee):
    hr = make_user(Role.hr)
    make_employee(national_id="1098765432")
    items = client.get("/api/v1/employees", headers=auth(hr)).json()["items"]
    assert all(i["national_id_masked"] is None or i["national_id_masked"].startswith("******") for i in items)
    assert "basic_salary" not in items[0]


def test_salary_visible_to_finance_roles_only(client, make_user, make_employee):
    emp = make_employee()
    for role, visible in ((Role.hr, True), (Role.admin, True), (Role.ceo, False)):
        u = make_user(role)
        salary = client.get(f"/api/v1/employees/{emp.id}", headers=auth(u)).json()["salary"]
        assert (salary is not None) is visible, role
