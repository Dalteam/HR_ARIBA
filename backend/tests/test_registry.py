from datetime import date, timedelta

from app.models import Role
from tests.conftest import auth


def test_documents_registry(client, make_user, make_employee):
    hr = make_user(Role.hr)
    make_employee(name_ar="خالد", national_id_expiry=date.today() + timedelta(days=20))
    rows = client.get("/api/v1/registry/documents", headers=auth(hr)).json()
    row = next(r for r in rows if r["name_ar"] == "خالد")
    assert row["national_id"] and row["national_id_days"] in (19, 20, 21)
    assert client.get("/api/v1/registry/documents", headers=auth(make_user(Role.employee))).status_code == 403
