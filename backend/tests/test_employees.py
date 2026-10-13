from datetime import date

from sqlalchemy import select

from app.models import AuditLog, Role
from tests.conftest import auth


def _payload(ref, **kw):
    body = {
        "emp_no": "EMP501",
        "name_ar": "سارة أحمد",
        "name_en": "Sara Ahmed",
        "workplace_id": str(ref.ariba.id),
        "nationality_id": str(ref.saudi.id),
        "join_date": "2026-01-31",
        "national_id": "1012345678",
        "basic_salary": "12000",
        "housing_allowance": "3000",
        "transport_allowance": "1000",
    }
    body.update(kw)
    return body


def test_create_get_update(client, db, ref, make_user):
    hr = make_user(Role.hr)
    r = client.post("/api/v1/employees", headers=auth(hr), json=_payload(ref))
    assert r.status_code == 201, r.text
    emp = r.json()
    assert emp["emp_no"] == "emp501"  # usernames are lower-case
    assert emp["is_saudi"] is True
    assert emp["salary"]["total_salary"] == "16000.00"
    assert emp["salary"]["gosi_system"] == "matching"  # Saudi default
    assert emp["annual_leave_days"] == 21
    assert emp["ids_masked"] is False and emp["national_id"] == "1012345678"

    r = client.patch(f"/api/v1/employees/{emp['id']}", headers=auth(hr), json={"job_title": "محاسبة", "basic_salary": "13000"})
    assert r.status_code == 200
    assert r.json()["job_title"] == "محاسبة"
    assert r.json()["salary"]["basic_salary"] == "13000.00"

    r = client.get(f"/api/v1/employees/{emp['id']}", headers=auth(hr))
    assert r.status_code == 200

    actions = [a.action for a in db.scalars(select(AuditLog).where(AuditLog.entity == "employee"))]
    assert {"create", "update", "read"} <= set(actions)
    update_log = db.scalar(select(AuditLog).where(AuditLog.action == "update"))
    assert set(update_log.details["changed"]) == {"job_title", "basic_salary"}


def test_fixed_term_contract_end_is_calculated(client, ref, make_user):
    hr = make_user(Role.hr)
    body = _payload(ref, contract_nature="fixed", contract_duration_months=12)
    r = client.post("/api/v1/employees", headers=auth(hr), json=body)
    assert r.status_code == 201, r.text
    # 31 Jan 2026 + 12 months = 31 Jan 2027
    assert r.json()["contract_end_date"] == "2027-01-31"

    r = client.patch(f"/api/v1/employees/{r.json()['id']}", headers=auth(hr), json={"contract_duration_months": 1})
    # 31 Jan 2026 + 1 month is clamped to the end of February
    assert r.json()["contract_end_date"] == "2026-02-28"

    r = client.post("/api/v1/employees", headers=auth(hr), json=_payload(ref, emp_no="emp502", national_id="1099999999", contract_nature="fixed"))
    assert r.status_code == 422
    assert r.json()["error"]["details"][0]["field"] == "contract_duration_months"


def test_non_saudi_forced_to_non_saudi_gosi(client, ref, make_user):
    hr = make_user(Role.hr)
    r = client.post(
        "/api/v1/employees",
        headers=auth(hr),
        json=_payload(ref, nationality_id=str(ref.egyptian.id), gosi_system="matching", currency="USD", exchange_rate="3.75"),
    )
    assert r.status_code == 201
    assert r.json()["salary"]["gosi_system"] == "non_saudi"
    assert r.json()["salary"]["exchange_rate"] == "3.7500"


def test_validation_errors_use_error_format(client, ref, make_user):
    hr = make_user(Role.hr)
    r = client.post("/api/v1/employees", headers=auth(hr), json=_payload(ref, national_id="12", iban="XX"))
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["code"] == "validation_error"
    fields = {d["field"] for d in err["details"]}
    assert {"national_id", "iban"} <= fields

    client.post("/api/v1/employees", headers=auth(hr), json=_payload(ref))
    r = client.post("/api/v1/employees", headers=auth(hr), json=_payload(ref))
    assert r.status_code == 409


def test_tabs_and_counts(client, ref, make_user, make_employee):
    hr = make_user(Role.hr)  # creates one Egyptian active employee
    make_employee(nationality_id=ref.saudi.id)
    make_employee(category="tamheer", nationality_id=ref.saudi.id)
    make_employee(category="training")
    make_employee(category="consultant")
    make_employee(termination_date=date(2025, 6, 30), termination_article="art_85")

    def emp_nos(tab):
        r = client.get(f"/api/v1/employees?tab={tab}", headers=auth(hr))
        assert r.status_code == 200, r.text
        return r.json()["total"]

    assert emp_nos("all") == 6
    assert emp_nos("active") == 2
    assert emp_nos("terminated") == 1
    assert emp_nos("tamheer") == 1
    assert emp_nos("training") == 1
    assert emp_nos("consultants") == 1
    assert emp_nos("saudi") == 2
    assert emp_nos("expat") == 3

    counts = client.get("/api/v1/employees/counts", headers=auth(hr)).json()
    assert counts == {"all": 6, "active": 2, "terminated": 1, "tamheer": 1, "training": 1, "consultants": 1, "saudi": 2, "expat": 3, "saudization_pct": "40.0"}


def test_pagination_search_and_sort(client, make_user, make_employee):
    hr = make_user(Role.hr)
    for i in range(30):
        make_employee(name_en=f"Person {i:02d}")
    r = client.get("/api/v1/employees?page=2&page_size=10&sort=-emp_no", headers=auth(hr))
    body = r.json()
    assert body["total"] == 31 and body["page"] == 2 and len(body["items"]) == 10
    nos = [i["emp_no"] for i in body["items"]]
    assert nos == sorted(nos, reverse=True)

    r = client.get("/api/v1/employees?q=person 07", headers=auth(hr))
    assert r.json()["total"] == 1

    r = client.get("/api/v1/employees?sort=basic_salary", headers=auth(hr))
    assert r.status_code == 400


def test_terminate_and_reactivate(client, make_user, make_employee):
    hr = make_user(Role.hr)
    emp = make_employee()
    url = f"/api/v1/employees/{emp.id}"
    r = client.post(f"{url}/terminate", headers=auth(hr), json={"termination_date": "2026-09-30", "article": "art_77"})
    assert r.status_code == 200
    assert r.json()["is_terminated"] is True and r.json()["termination_article"] == "art_77"
    assert client.post(f"{url}/terminate", headers=auth(hr), json={"termination_date": "2026-09-30", "article": "art_77"}).status_code == 409
    r = client.post(f"{url}/terminate", headers=auth(hr), json={"termination_date": "2026-09-30", "article": "art_99"})
    assert r.status_code == 422
    r = client.post(f"{url}/reactivate", headers=auth(hr))
    assert r.status_code == 200 and r.json()["is_terminated"] is False


def test_me_employee(client, make_user):
    user = make_user()
    r = client.get("/api/v1/me/employee", headers=auth(user))
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == str(user.employee_id)
    assert body["salary"] is not None  # employees see their own salary
    assert body["ids_masked"] is False


def test_lookups(client, make_user):
    user = make_user()
    r = client.get("/api/v1/settings/lookups", headers=auth(user))
    body = r.json()
    assert len(body["workplaces"]) == 5 and len(body["departments"]) == 8 and len(body["nationalities"]) == 10
    assert [n["is_saudi"] for n in body["nationalities"]].count(True) == 1


def test_saudization_pct_hand_computed():
    from decimal import Decimal

    from app.services.saudization import saudization_pct

    assert saudization_pct(2, 5) == Decimal("40.0")
    assert saudization_pct(1, 3) == Decimal("33.3")
    assert saudization_pct(2, 3) == Decimal("66.7")
    assert saudization_pct(0, 0) == Decimal("0.0")


def test_duplicates_rejected_and_auto_number(client, ref, make_user):
    hr = make_user(Role.hr)
    first = client.post("/api/v1/employees", headers=auth(hr), json=_payload(ref, email="a@ariba.sa"))
    assert first.status_code == 201
    for dup in ({"national_id": "1012345678"}, {"email": "A@ariba.sa", "national_id": "1000000001"}):
        r = client.post("/api/v1/employees", headers=auth(hr), json=_payload(ref, emp_no="emp777", **dup))
        assert r.status_code == 409, dup
    body = _payload(ref, national_id="1000000002")
    body.pop("emp_no")
    r = client.post("/api/v1/employees", headers=auth(hr), json=body)
    assert r.status_code == 201
    # existing numbers: emp501 and the HR user's emp9xx -> next is one above the highest
    assert r.json()["emp_no"].startswith("emp") and r.json()["emp_no"] != "emp501"


def test_salary_figures_on_record(client, ref, make_user):
    hr = make_user(Role.hr)
    body = _payload(ref, birth_date="1986-01-01", other_deductions="100", extra_allowance="500")
    emp = client.post("/api/v1/employees", headers=auth(hr), json=body).json()
    s = emp["salary"]
    # total = 12,000 + 3,000 + 1,000 + 500 extra; GOSI matching 10.75% of 15,000; net = total - GOSI - 100
    assert s["total_salary"] == "16500.00"
    assert (s["gosi_employee"], s["gosi_employer"]) == ("1612.50", "1912.50")
    assert s["net_salary"] == "14787.50"
    assert s["eos_award"] is not None

    r = client.post(
        "/api/v1/employees/salary-preview",
        headers=auth(hr),
        json={"basic_salary": "12000", "housing_allowance": "3000", "transport_allowance": "1000",
              "nationality_id": str(ref.egyptian.id), "gosi_system": "matching"},
    )
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["gosi_system"] == "non_saudi" and p["gosi_employee"] == "0.00" and p["gosi_employer"] == "300.00"
    assert p["net_salary"] == "16000.00"
