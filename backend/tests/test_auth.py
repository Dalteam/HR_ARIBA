import uuid


from app.core.identity import hash_password, verify_password
from app.core.security import password_policy_errors
from app.models import Credential, Role
from tests.conftest import DEFAULT_PASSWORD, auth, make_token


def _login(client, username, password=DEFAULT_PASSWORD):
    return client.post("/api/v1/auth/login", json={"username": username, "password": password})


def test_login_success_returns_session_and_profile(client, make_user):
    user = make_user(Role.hr)
    r = _login(client, user.username.upper())
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["access_token"] and body["refresh_token"]
    assert body["user"]["role"] == "hr"
    assert body["user"]["employee"]["emp_no"] == user.username
    me = client.get("/api/v1/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200


def test_passwords_are_argon2_hashes(db, make_user):
    user = make_user()
    cred = db.get(Credential, user.id)
    assert cred.password_hash.startswith("$argon2id$") and DEFAULT_PASSWORD not in cred.password_hash
    assert verify_password(hash_password("abc12345"), "abc12345")
    assert not verify_password(hash_password("abc12345"), "abc12346")


def test_login_wrong_password_and_unknown_user(client, make_user):
    user = make_user()
    for name, pw in ((user.username, "nope"), ("emp99999", DEFAULT_PASSWORD)):
        r = _login(client, name, pw)
        assert r.status_code == 401
        err = r.json()["error"]
        assert err["code"] == "invalid_credentials" and err["request_id"]


def test_login_inactive_user_rejected(client, make_user):
    user = make_user(is_active=False)
    r = _login(client, user.username)
    assert r.status_code == 403 and r.json()["error"]["code"] == "account_inactive"


def test_login_rate_limited_after_five_attempts(client, make_user):
    user = make_user()
    for _ in range(5):
        assert _login(client, user.username, "bad").status_code == 401
    r = _login(client, user.username)
    assert r.status_code == 429 and r.json()["error"]["code"] == "rate_limited"


def test_refresh(client, make_user):
    user = make_user()
    rt = _login(client, user.username).json()["refresh_token"]
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": rt})
    assert r.status_code == 200 and r.json()["user"]["id"] == str(user.id)
    # an access token cannot be used as a refresh token
    at = _login(client, user.username).json()["access_token"]
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": at}).status_code == 401


def test_missing_bad_and_expired_tokens(client, make_user):
    user = make_user()
    assert client.get("/api/v1/me").status_code == 401
    bad = {"Authorization": f"Bearer {make_token(user.id, secret='wrong-secret-wrong-secret-wrong-secret')}"}
    assert client.get("/api/v1/me", headers=bad).status_code == 401
    r = client.get("/api/v1/me", headers={"Authorization": f"Bearer {make_token(user.id, exp_in=-10)}"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "session_expired"
    refresh_tok = {"Authorization": f"Bearer {make_token(user.id, typ='refresh')}"}
    assert client.get("/api/v1/me", headers=refresh_tok).status_code == 401


def test_token_for_unknown_or_inactive_user(client, make_user):
    assert client.get("/api/v1/me", headers={"Authorization": f"Bearer {make_token(uuid.uuid4())}"}).status_code == 401
    user = make_user(is_active=False)
    r = client.get("/api/v1/me", headers=auth(user))
    assert r.status_code == 403 and r.json()["error"]["code"] == "account_inactive"


def test_forced_password_change_and_old_tokens_revoked(client, make_user):
    user = make_user(Role.hr, must_change_password=True, password="temp1234x")
    old = {"Authorization": f"Bearer {_login(client, user.username, 'temp1234x').json()['access_token']}"}
    assert client.get("/api/v1/me", headers=old).status_code == 200
    r = client.get("/api/v1/employees", headers=old)
    assert r.status_code == 403 and r.json()["error"]["code"] == "password_change_required"

    r = client.post("/api/v1/auth/change-password", headers=old, json={"old_password": "temp1234x", "new_password": "newpass99"})
    assert r.status_code == 200, r.text
    new = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.get("/api/v1/employees", headers=new).status_code == 200
    # tokens issued before the change no longer work
    assert client.get("/api/v1/me", headers=old).json()["error"]["code"] == "session_expired"
    assert _login(client, user.username, "newpass99").status_code == 200


def test_change_password_rules(client, make_user):
    user = make_user(password="oldpass11")
    url, h = "/api/v1/auth/change-password", auth(user)
    r = client.post(url, headers=h, json={"old_password": "wrong", "new_password": "newpass99"})
    assert r.status_code == 422 and r.json()["error"]["details"][0]["field"] == "old_password"
    r = client.post(url, headers=h, json={"old_password": "oldpass11", "new_password": "oldpass11"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "weak_password"
    assert client.post(url, headers=h, json={"old_password": "oldpass11", "new_password": "short1"}).status_code == 422


def test_password_policy():
    assert password_policy_errors("abc12345") == []
    assert password_policy_errors("كلمةسر123") == []
    assert password_policy_errors("abc1234")
    assert password_policy_errors("abcdefgh")
    assert password_policy_errors("12345678")
    assert password_policy_errors("abc12345", old="abc12345")


def test_hr_creates_account_and_resets_password(client, db, make_user, make_employee):
    hr = make_user(Role.hr)
    emp = make_employee()
    r = client.post("/api/v1/auth/users", headers=auth(hr), json={"employee_id": str(emp.id)})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["user"]["username"] == emp.emp_no and body["user"]["must_change_password"] is True
    temp = body["temporary_password"]
    assert password_policy_errors(temp) == []
    assert _login(client, emp.emp_no, temp).status_code == 200
    assert client.post("/api/v1/auth/users", headers=auth(hr), json={"employee_id": str(emp.id)}).status_code == 409

    r = client.post(f"/api/v1/auth/users/{body['user']['id']}/temporary-password", headers=auth(hr))
    assert r.status_code == 200 and r.json()["temporary_password"] != temp
    assert _login(client, emp.emp_no, temp).status_code == 401  # old password no longer works


def test_only_admin_changes_roles(client, make_user):
    hr = make_user(Role.hr)
    admin = make_user(Role.admin)
    target = make_user(Role.employee)
    assert client.patch(f"/api/v1/auth/users/{target.id}", headers=auth(hr), json={"role": "manager"}).status_code == 403
    r = client.patch(f"/api/v1/auth/users/{target.id}", headers=auth(admin), json={"role": "manager"})
    assert r.status_code == 200 and r.json()["role"] == "manager"
    r = client.post("/api/v1/auth/users", headers=auth(hr), json={"employee_id": str(target.employee_id), "role": "admin"})
    assert r.status_code == 403


def test_production_config_requires_secret_and_postgres():
    import pytest

    from app.config import Settings

    with pytest.raises(ValueError):
        Settings(env="production", jwt_secret="short", database_url="postgresql://x/y")
    with pytest.raises(ValueError):
        Settings(env="production", jwt_secret="x" * 40, database_url="sqlite:///./x.db")
    assert Settings(env="production", jwt_secret="x" * 40, database_url="postgresql://x/y").env == "production"
