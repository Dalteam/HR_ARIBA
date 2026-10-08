from app.models import Role
from tests.conftest import auth


def test_salary_basis_for_finance_only(client, make_user, make_employee):
    make_employee(name_ar="أحمد", basic_salary=8000, housing_allowance=2000)
    finance = make_user(Role.finance)
    staff = make_user(Role.employee)

    r = client.get("/api/v1/salary/basis", headers=auth(finance))
    assert r.status_code == 200
    row = next(x for x in r.json() if x["name_ar"] == "أحمد")
    assert row["basic_salary"] == "8000.00" or float(row["basic_salary"]) == 8000
    assert float(row["housing_allowance"]) == 2000
    assert row["is_terminated"] is False

    assert client.get("/api/v1/salary/basis", headers=auth(staff)).status_code == 403
