from app.models import Role
from tests.conftest import auth


def test_attendance_manual_crud_and_summary(client, make_user, make_employee):
    hr = make_user(Role.hr)
    staff = make_user(Role.employee)
    emp = make_employee(name_ar="موظف الحضور")

    assert client.post("/api/v1/attendance", json={"employee_id": str(emp.id), "work_date": "2026-10-05"}, headers=auth(staff)).status_code == 403

    r = client.post(
        "/api/v1/attendance",
        json={"employee_id": str(emp.id), "work_date": "2026-10-05", "time_in": "08:20", "time_out": "16:00", "status": "late"},
        headers=auth(hr),
    )
    assert r.status_code == 201
    rec = r.json()
    assert rec["late_minutes"] == 5
    assert rec["early_minutes"] == 0
    assert rec["employee_name"] == emp.name_ar
    rec_id = rec["id"]

    # upsert on the same employee+date updates the existing record
    r2 = client.post(
        "/api/v1/attendance",
        json={"employee_id": str(emp.id), "work_date": "2026-10-05", "time_in": "08:00", "time_out": "15:30", "status": "present"},
        headers=auth(hr),
    )
    assert r2.json()["id"] == rec_id
    assert r2.json()["early_minutes"] == 15  # end 16:00 - 15 tolerance = 15:45; 15:30 -> 15 min early

    listing = client.get("/api/v1/attendance", params={"date": "2026-10-05"}, headers=auth(hr)).json()
    assert len(listing) == 1

    summary = client.get("/api/v1/attendance/summary", params={"month": "2026-10"}, headers=auth(hr)).json()
    row = next(s for s in summary if s["employee_id"] == str(emp.id))
    assert row["present"] == 1

    assert client.delete(f"/api/v1/attendance/{rec_id}", headers=auth(hr)).status_code == 204
    assert client.get("/api/v1/attendance", params={"date": "2026-10-05"}, headers=auth(hr)).json() == []
