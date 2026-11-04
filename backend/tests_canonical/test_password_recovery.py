"""Password recovery: R1–R8 and the negative tests P1–P11 of docs/BUSINESS_RULES.md § Password recovery.

The first half runs without a database: the input rules, the rate-limit key that never holds the typed
value, the one delivery that exists (`off`), the minimum answer time, and the routes' answers and audit
rows with the service replaced.

The second half needs `CANONICAL_TEST_DATABASE_URL` (a throwaway copy) and runs inside a transaction that is
rolled back. It calls the real routes on real accounts: an unknown username, an unknown iqama number, a
disabled account, a former employee and a real account all get byte-identical answers and no token; with a
fake delivery switched on, the stored hash matches what was delivered and the raw token is nowhere else;
expired, reused, guessed and wrong-user tokens are the same `400`; success ends every session and push
token; and the limits answer `429` for real and unknown accounts alike.
"""

from __future__ import annotations

import hashlib
import json
import os
import uuid
from types import SimpleNamespace

import pytest
from fastapi import BackgroundTasks

from app.config import Settings
from app.core.errors import ApiError
from app.routers import canonical
from app.services import password_recovery as recovery


def refused(exc_info, status: int, code: str) -> None:
    assert (exc_info.value.status, exc_info.value.code) == (status, code), exc_info.value.message


def req(ip: str = "10.9.9.9"):
    return SimpleNamespace(client=SimpleNamespace(host=ip), headers={})


@pytest.fixture(autouse=True)
def no_wait(monkeypatch):
    """The minimum answer time is pinned by its own test; everywhere else it would only slow the suite."""
    monkeypatch.setattr(recovery, "MIN_SECONDS", 0.0)


# ------------------------------------------------------------------------------------ without a database

def test_input_is_a_username_or_an_iqama_number_and_nothing_else():
    assert recovery.normalise({"username": "  Emp084 "}) == ("username", "emp084")
    assert recovery.normalise({"iqama": "2-123 456 789-0"}) == ("iqama", "21234567890")
    for empty in ({}, {"username": "  "}, {"iqama": "abc"}):
        with pytest.raises(ApiError) as e:
            recovery.normalise(empty)
        refused(e, 422, "validation_error")


def test_the_rate_limit_key_never_holds_the_typed_value():
    k1 = recovery.key(recovery.REQUEST_KEY, "iqama", "2123456789")
    assert "2123456789" not in k1 and k1.startswith(recovery.REQUEST_KEY)
    assert k1 != recovery.key(recovery.REQUEST_KEY, "username", "2123456789")
    assert k1 == recovery.key(recovery.REQUEST_KEY, "iqama", "2123456789")


def test_off_is_the_only_delivery_and_it_creates_nothing():
    assert recovery.delivery().enabled is False
    assert recovery.message() == recovery.OFF_MESSAGE
    with pytest.raises(ValueError):
        Settings(password_recovery_delivery="email")


def test_every_answer_waits_for_the_floor(monkeypatch):
    slept = []
    monkeypatch.setattr(recovery, "MIN_SECONDS", 0.4)
    monkeypatch.setattr(recovery.time, "sleep", slept.append)
    monkeypatch.setattr(recovery.time, "monotonic", lambda: 100.1)
    recovery.hold(100.0)
    assert slept and abs(slept[0] - 0.3) < 1e-9


class Recorder:
    def __init__(self):
        self.commits = 0

    def commit(self):
        self.commits += 1


def test_p1_found_and_not_found_give_the_same_answer_and_an_audit_row_without_the_value(monkeypatch):
    audits = []
    monkeypatch.setattr(canonical, "_write_audit", lambda *a, **k: audits.append((a, k)))
    answers = []
    for outcome in (recovery.Outcome(matched=False, delivered=False),
                    recovery.Outcome(matched=True, delivered=False, account_id=uuid.uuid4())):
        monkeypatch.setattr(recovery, "request", lambda db, body, ip, o=outcome: o)
        answers.append(json.dumps(canonical.password_recovery({"iqama": "2123456789"}, req(), BackgroundTasks(),
                                                              db=Recorder())))
    assert answers[0] == answers[1] and "sent_to" not in answers[0]
    assert [k["details"] for _, k in audits] == [{"by": "iqama", "matched": False, "delivered": False},
                                                  {"by": "iqama", "matched": True, "delivered": False}]
    assert "2123456789" not in repr(audits)


def test_the_older_request_route_keeps_its_shape(monkeypatch):
    monkeypatch.setattr(canonical, "_write_audit", lambda *a, **k: None)
    monkeypatch.setattr(recovery, "request", lambda db, body, ip: recovery.Outcome(matched=False, delivered=False))
    assert canonical.request_password_reset({"username": "x"}, req(), BackgroundTasks(), db=Recorder()) == {"ok": True}


def test_a_failed_finish_is_one_400_and_an_audit_row_with_no_details(monkeypatch):
    audits = []
    monkeypatch.setattr(canonical, "_write_audit", lambda *a, **k: audits.append((a, k)))
    monkeypatch.setattr(recovery, "complete", lambda db, body, ip, h: None)
    with pytest.raises(ApiError) as e:
        canonical.complete_password_reset({"username": "u", "reset_token": "t", "new_password": "abcdefgh12"},
                                          req(), db=Recorder())
    refused(e, 400, "invalid_reset")
    assert audits[0][0][4] == "password_recovery_failed" and "details" not in audits[0][1]


# ------------------------------------------------------------------------------------ against a real copy

needs_db = pytest.mark.skipif(not os.environ.get("CANONICAL_TEST_DATABASE_URL"),
                              reason="Requires a disposable restored canonical PostgreSQL database")


@pytest.fixture
def db():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    engine = create_engine(os.environ["CANONICAL_TEST_DATABASE_URL"])
    connection = engine.connect()
    outer = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        outer.rollback()
        connection.close()
        engine.dispose()


def q(db, sql, **params):
    from sqlalchemy import text
    return db.execute(text(sql), params)


def accounts(db):
    """A real current account, a former employee's account and an account to disable, all with a username."""
    current = q(db, f"""SELECT a.id, a.username, d.employee_id FROM ariba_auth_accounts a
        JOIN employee_directory d ON d.employee_id=a.employee_id WHERE a.active AND {recovery.CURRENT}
        ORDER BY a.username LIMIT 2""").mappings().all()
    former = q(db, f"""SELECT a.id, a.username FROM ariba_auth_accounts a JOIN employee_directory d
        ON d.employee_id=a.employee_id WHERE NOT ({recovery.CURRENT}) ORDER BY a.username LIMIT 1""").mappings().first()
    assert len(current) == 2 and former, "the copy needs two current accounts and one former employee's account"
    return dict(current[0]), dict(current[1]), dict(former)


class FakeDelivery:
    enabled = True

    def __init__(self):
        self.sent = []

    def deliver(self, to_address, username, reset_link):
        self.sent.append((to_address, username, reset_link))
        return True


def ask(db, body, ip="10.1.1.1"):
    background = BackgroundTasks()
    answer = canonical.password_recovery(body, req(ip), background, db=db)
    for task in background.tasks:
        task.func(*task.args, **task.kwargs)
    return json.dumps(answer, ensure_ascii=False)


@needs_db
def test_p1_p2_identical_answers_and_no_token_while_delivery_is_off(db):
    real, other, former = accounts(db)
    q(db, "UPDATE ariba_auth_accounts SET active=false WHERE id=:i", i=other["id"])
    iqama = q(db, "SELECT coalesce(iqama_no, data->>'iqamaNo') FROM employee_directory WHERE employee_id=:e",
              e=real["employee_id"]).scalar()
    resets_before = q(db, "SELECT count(*) FROM ariba_password_resets").scalar()
    audit_before = q(db, "SELECT coalesce(max(id),0) FROM ariba_audit_log").scalar()
    bodies = [{"username": "no-such-user-zz"}, {"iqama": "1999999999"}, {"username": other["username"]},
              {"username": former["username"]}, {"username": real["username"]}]
    if iqama:
        bodies.append({"iqama": iqama})
    answers = {ask(db, b, ip=f"10.2.0.{n}") for n, b in enumerate(bodies)}
    assert len(answers) == 1 and "sent_to" not in answers.pop()
    assert q(db, "SELECT count(*) FROM ariba_password_resets").scalar() == resets_before
    rows = q(db, """SELECT action, coalesce(details::text,''), coalesce(summary,'') FROM ariba_audit_log
                    WHERE id > :i ORDER BY id""", i=audit_before).all()
    assert [r[0] for r in rows] == ["password_recovery_request"] * len(bodies)
    typed = [str(v) for b in bodies for v in b.values()]
    assert not any(t in r[1] + r[2] for r in rows for t in typed)
    keys = [r[0] for r in q(db, "SELECT uname FROM ariba_login_attempts WHERE uname LIKE 'recovery:%'").all()]
    assert len(keys) == len(bodies) and not any(t in k for k in keys for t in typed)


@needs_db
def test_p3_with_a_sender_only_the_hash_is_stored_and_the_token_is_nowhere_else(db, monkeypatch):
    real, _, _ = accounts(db)
    q(db, """UPDATE employee_directory SET data = jsonb_set(coalesce(data,'{}'), '{email}', '"recovery-test@example.invalid"')
             WHERE employee_id=:e""", e=real["employee_id"])
    sender = FakeDelivery()
    monkeypatch.setattr(recovery, "delivery", lambda: sender)
    audit_before = q(db, "SELECT coalesce(max(id),0) FROM ariba_audit_log").scalar()
    answer = ask(db, {"username": real["username"]})
    assert len(sender.sent) == 1 and sender.sent[0][0] == "recovery-test@example.invalid"
    token = sender.sent[0][2].split("token=", 1)[1]
    stored = q(db, "SELECT token_hash FROM ariba_password_resets WHERE account_id=:a AND used_at IS NULL",
               a=real["id"]).scalars().all()
    assert stored == [hashlib.sha256(token.encode()).hexdigest()]
    audit = " ".join(str(r) for r in q(db, "SELECT details, summary FROM ariba_audit_log WHERE id > :i", i=audit_before).all())
    assert token not in answer and token not in audit and stored[0] not in audit
    assert json.loads(answer)["message"] == recovery.ON_MESSAGE
    # a second request voids the first token
    ask(db, {"username": real["username"]})
    assert q(db, "SELECT count(*) FROM ariba_password_resets WHERE account_id=:a AND used_at IS NULL",
             a=real["id"]).scalar() == 1


def issue(db, account_id, minutes=15):
    raw = "tok-" + uuid.uuid4().hex + uuid.uuid4().hex
    q(db, f"""INSERT INTO ariba_password_resets(account_id, token_hash, expires_at)
              VALUES (:a, :h, now() + interval '{minutes} minutes')""", a=account_id, h=hashlib.sha256(raw.encode()).hexdigest())
    return raw


def finish(db, username, token, password="NewPassw0rd99", ip="10.3.3.3"):
    return canonical.complete_password_reset({"username": username, "reset_token": token, "new_password": password},
                                             req(ip), db=db)


@needs_db
def test_p4_p5_p6_p7_every_bad_token_is_the_same_400(db):
    real, other, _ = accounts(db)
    before = q(db, "SELECT password_hash FROM ariba_auth_accounts WHERE id=:a", a=real["id"]).scalar()
    cases = [
        ("expired", real["username"], issue(db, real["id"], minutes=-1)),
        ("guessed", real["username"], "tok-" + "0" * 64),
        ("another user's token", other["username"], issue(db, real["id"])),
        ("unknown user", "no-such-user-zz", issue(db, real["id"])),
    ]
    for label, username, token in cases:
        with pytest.raises(ApiError) as e:
            finish(db, username, token, ip=f"10.4.0.{len(label)}")
        refused(e, 400, "invalid_reset")
    assert q(db, "SELECT password_hash FROM ariba_auth_accounts WHERE id=:a", a=real["id"]).scalar() == before
    # reused
    token = issue(db, other["id"])
    assert finish(db, other["username"], token) == {"ok": True}
    with pytest.raises(ApiError) as e:
        finish(db, other["username"], token)
    refused(e, 400, "invalid_reset")
    # disabled after the request
    token = issue(db, real["id"])
    q(db, "UPDATE ariba_auth_accounts SET active=false WHERE id=:a", a=real["id"])
    with pytest.raises(ApiError) as e:
        finish(db, real["username"], token, ip="10.4.9.9")
    refused(e, 400, "invalid_reset")


@needs_db
def test_p8_success_ends_every_session_and_push_token_and_voids_other_tokens(db):
    real, _, _ = accounts(db)
    q(db, "INSERT INTO ariba_sessions(account_id) VALUES (:a), (:a)", a=real["id"])
    q(db, """INSERT INTO ariba_push_tokens(token, account_id, platform) VALUES ('ExponentPushToken[recov-test-1]', :a, 'ios')""",
      a=real["id"])
    spare = issue(db, real["id"])
    token = issue(db, real["id"])
    audit_before = q(db, "SELECT coalesce(max(id),0) FROM ariba_audit_log").scalar()
    assert finish(db, real["username"], token, password="Brand-New-Pass-42") == {"ok": True}
    assert q(db, "SELECT count(*) FROM ariba_sessions WHERE account_id=:a", a=real["id"]).scalar() == 0
    assert q(db, "SELECT count(*) FROM ariba_push_tokens WHERE account_id=:a", a=real["id"]).scalar() == 0
    assert q(db, "SELECT count(*) FROM ariba_password_resets WHERE account_id=:a AND used_at IS NULL",
             a=real["id"]).scalar() == 0
    row = q(db, "SELECT password_hash, must_change FROM ariba_auth_accounts WHERE id=:a", a=real["id"]).one()
    assert canonical._hasher.verify(row[0], "Brand-New-Pass-42") and row[1] is False
    audit = q(db, "SELECT action, coalesce(details::text,''), coalesce(summary,'') FROM ariba_audit_log WHERE id > :i",
              i=audit_before).all()
    assert [a[0] for a in audit] == ["password_recovery_complete"]
    assert not any(s in " ".join(audit[0][1:]) for s in (token, spare, "Brand-New-Pass-42"))


@needs_db
def test_p9_a_weak_password_is_422_and_the_token_stays_unused(db):
    real, _, _ = accounts(db)
    token = issue(db, real["id"])
    with pytest.raises(ApiError) as e:
        finish(db, real["username"], token, password="short1")
    refused(e, 422, "weak_password")
    assert q(db, "SELECT count(*) FROM ariba_password_resets WHERE account_id=:a AND used_at IS NULL",
             a=real["id"]).scalar() == 1


@needs_db
def test_p10_the_limits_answer_429_for_real_and_unknown_accounts_alike(db):
    real, _, _ = accounts(db)
    for name in (real["username"], "no-such-user-limit"):
        for n in range(recovery.REQUESTS_PER_ID):
            ask(db, {"username": name}, ip=f"10.5.{n}.{len(name)}")
        with pytest.raises(ApiError) as e:
            ask(db, {"username": name}, ip="10.5.99.99")
        refused(e, 429, "rate_limited")
    for n in range(recovery.REQUESTS_PER_IP):
        ask(db, {"username": f"spray-{n}"}, ip="10.6.6.6")
    with pytest.raises(ApiError) as e:
        ask(db, {"username": "spray-last"}, ip="10.6.6.6")
    refused(e, 429, "rate_limited")
    for n in range(recovery.FAILS_PER_USER):
        with pytest.raises(ApiError):
            finish(db, real["username"], "tok-guess", ip=f"10.7.0.{n}")
    with pytest.raises(ApiError) as e:
        finish(db, real["username"], issue(db, real["id"]), ip="10.7.9.9")
    refused(e, 429, "rate_limited")


@needs_db
def test_p11_found_and_not_found_both_take_the_floor(db, monkeypatch):
    import time as clock

    real, _, _ = accounts(db)
    monkeypatch.setattr(recovery, "MIN_SECONDS", 0.25)
    for body in ({"username": real["username"]}, {"username": "no-such-user-time"}):
        started = clock.monotonic()
        ask(db, body, ip="10.8.8.8")
        assert clock.monotonic() - started >= 0.25
