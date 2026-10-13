from app.core.security import check_upload, mask_id
from tests.conftest import auth


def test_security_headers(client):
    r = client.get("/health")
    assert r.status_code == 200
    h = r.headers
    assert h["x-content-type-options"] == "nosniff"
    assert h["x-frame-options"] == "DENY"
    assert h["content-security-policy"].startswith("default-src 'none'")
    assert h["x-request-id"]


def test_cors_allowlist(client):
    ok = client.options(
        "/api/v1/employees",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
    )
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:3000"
    bad = client.options(
        "/api/v1/employees",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in bad.headers


def test_docs_disabled_outside_development(client):
    assert client.get("/docs").status_code == 404


def test_unknown_route_uses_error_format(client):
    r = client.get("/api/v1/nope")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


def test_mask_id():
    assert mask_id("1234567890") == "******7890"
    assert mask_id("123") == "***"
    assert mask_id(None) is None


def test_upload_checks():
    import pytest

    from app.core.errors import ApiError

    check_upload("application/pdf", b"%PDF-1.7 ...")
    with pytest.raises(ApiError):
        check_upload("application/pdf", b"MZ\x90\x00")  # an .exe renamed to .pdf
    with pytest.raises(ApiError):
        check_upload("text/html", b"<html>")
    with pytest.raises(ApiError):
        check_upload("image/png", b"\x89PNG\r\n\x1a\n" + b"0" * (12 * 1024 * 1024 + 1))


def test_audit_written_for_detail_read(client, db, make_user):
    from sqlalchemy import select

    from app.models import AuditLog

    user = make_user()
    client.get(f"/api/v1/employees/{user.employee_id}", headers=auth(user))
    log = db.scalar(select(AuditLog).where(AuditLog.action == "read"))
    assert log is not None and log.actor_user_id == user.id and log.request_id
