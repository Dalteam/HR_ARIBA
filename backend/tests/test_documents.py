from sqlalchemy import select

from app.models import AuditLog, Role
from tests.conftest import auth

PDF = b"%PDF-1.7\n%test\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32


def _upload(client, user, emp_id, data=PDF, ctype="application/pdf", doc_type="iqama", name="iqama.pdf"):
    return client.post(
        f"/api/v1/employees/{emp_id}/documents",
        headers=auth(user),
        data={"type": doc_type},
        files={"file": (name, data, ctype)},
    )


def test_upload_list_download_delete(client, db, make_user, make_employee):
    hr = make_user(Role.hr)
    emp = make_employee()
    r = _upload(client, hr, emp.id)
    assert r.status_code == 201, r.text
    doc = r.json()
    assert doc["file_name"] == "iqama.pdf" and doc["size_bytes"] == len(PDF)

    assert [d["id"] for d in client.get(f"/api/v1/employees/{emp.id}/documents", headers=auth(hr)).json()] == [doc["id"]]
    f = client.get(f"/api/v1/documents/{doc['id']}/file", headers=auth(hr))
    assert f.status_code == 200 and f.content == PDF and f.headers["content-type"] == "application/pdf"

    assert client.delete(f"/api/v1/documents/{doc['id']}", headers=auth(hr)).status_code == 204
    assert client.get(f"/api/v1/employees/{emp.id}/documents", headers=auth(hr)).json() == []
    assert client.get(f"/api/v1/documents/{doc['id']}/file", headers=auth(hr)).status_code == 404
    actions = {a.action for a in db.scalars(select(AuditLog).where(AuditLog.entity == "document"))}
    assert {"upload", "download", "delete"} <= actions


def test_upload_rejects_bad_files(client, make_user, make_employee):
    hr = make_user(Role.hr)
    emp = make_employee()
    assert _upload(client, hr, emp.id, data=b"MZ\x90\x00", name="x.pdf").status_code == 415  # exe renamed
    assert _upload(client, hr, emp.id, data=b"<html>", ctype="text/html", name="x.html").status_code == 415
    big = PDF + b"0" * (12 * 1024 * 1024)
    assert _upload(client, hr, emp.id, data=big).status_code == 413


def test_document_scope(client, make_user, make_employee):
    hr = make_user(Role.hr)
    me = make_user(Role.employee)
    other = make_employee()
    mine = _upload(client, hr, me.employee_id).json()
    theirs = _upload(client, hr, other.id).json()
    assert client.get(f"/api/v1/documents/{mine['id']}/file", headers=auth(me)).status_code == 200
    assert client.get(f"/api/v1/documents/{theirs['id']}/file", headers=auth(me)).status_code == 404
    assert _upload(client, me, me.employee_id).status_code == 403  # only HR uploads
    assert client.get(f"/api/v1/employees/{other.id}/documents", headers=auth(make_user(Role.finance))).status_code == 403


def test_photo(client, make_user, make_employee):
    hr = make_user(Role.hr)
    emp = make_employee()
    url = f"/api/v1/employees/{emp.id}/photo"
    assert client.get(url, headers=auth(hr)).status_code == 404
    r = client.put(url, headers=auth(hr), files={"file": ("p.png", PNG, "image/png")})
    assert r.status_code == 204, r.text
    got = client.get(url, headers=auth(hr))
    assert got.status_code == 200 and got.content == PNG
    assert client.get(f"/api/v1/employees/{emp.id}", headers=auth(hr)).json()["has_photo"] is True
    assert client.put(url, headers=auth(hr), files={"file": ("p.pdf", PDF, "application/pdf")}).status_code == 415
    assert client.delete(url, headers=auth(hr)).status_code == 204
    assert client.get(url, headers=auth(hr)).status_code == 404


def test_dependents_crud_and_scope(client, make_user, make_employee):
    hr = make_user(Role.hr)
    me = make_user(Role.employee)
    base = f"/api/v1/employees/{me.employee_id}/dependents"
    r = client.post(base, headers=auth(hr), json={"relation": "wife", "name_ar": "نورة", "national_id": "2123456789"})
    assert r.status_code == 201, r.text
    dep = r.json()
    r = client.patch(f"/api/v1/dependents/{dep['id']}", headers=auth(hr), json={"mobile": "0501234567"})
    assert r.json()["mobile"] == "0501234567"

    up = client.post(f"/api/v1/dependents/{dep['id']}/documents", headers=auth(hr), files={"file": ("id.pdf", PDF, "application/pdf")})
    assert up.status_code == 201
    listed = client.get(base, headers=auth(me)).json()
    assert listed[0]["national_id"] == "2123456789" and len(listed[0]["documents"]) == 1  # own record: full ID

    mgr = make_user(Role.manager)
    other = make_employee(manager_id=mgr.employee_id)
    client.post(f"/api/v1/employees/{other.id}/dependents", headers=auth(hr), json={"relation": "son", "name_ar": "سعد", "national_id": "2000000001"})
    seen = client.get(f"/api/v1/employees/{other.id}/dependents", headers=auth(mgr)).json()
    assert seen[0]["national_id"].startswith("******")  # manager sees masked IDs
    assert client.get(base, headers=auth(mgr)).status_code == 404  # not their report

    assert client.post(base, headers=auth(me), json={"relation": "son", "name_ar": "x y"}).status_code == 403
    assert client.delete(f"/api/v1/dependents/{dep['id']}", headers=auth(hr)).status_code == 204
    assert client.get(base, headers=auth(hr)).json() == []
