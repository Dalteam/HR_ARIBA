"""Tasks, meetings and the team's availability: who may see a team, write to whom, and answer what.

Every case here is a rule the API has to keep making - docs/BUSINESS_RULES.md T1-T8 - alongside the
positive journeys (send, answer, cancel), the two boxes, the validation the screen's form implies and
the shapes `src/lib/port.ts` pins.

No database is needed: the service and the router run against `ScriptedDB` (which answers each
statement by the SQL it recognises and records everything else), `team_scope` is replaced by the
permission set a test names, the Riyadh date is frozen, and `canonical`'s notification/audit helpers
are recorded, so a test asserts both the exact answer and that nothing was written when it should not
have been.
"""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.core.errors import ApiError
from app.routers import tasks as tasks_api
from app.services import tasks, team_scope

MGR = {"employee_id": "mgr", "account_id": uuid.uuid4(), "role": "employee", "name_ar": "مدير مباشر"}
EMP = {"employee_id": "emp1", "account_id": uuid.uuid4(), "role": "employee", "name_ar": "موظف أول"}
OUT = {"employee_id": "out", "account_id": uuid.uuid4(), "role": "employee", "name_ar": "موظف خارجي"}
HR = {"employee_id": "hr", "account_id": uuid.uuid4(), "role": "hr", "name_ar": "موارد بشرية"}
CEO = {"employee_id": "ceo", "account_id": uuid.uuid4(), "role": "ceo", "name_ar": "الرئيس التنفيذي"}
ALL_PERMS = {key: True for key in team_scope.MANAGER_PERM_KEYS}
NO_PERMS = {key: False for key in team_scope.MANAGER_PERM_KEYS}
REPORTS = ("emp1", "emp2")
TASK_ID = uuid.uuid4()
BATCH = uuid.uuid4()
NOW = datetime(2026, 11, 1, 9, 0, tzinfo=timezone.utc)
TODAY = date(2026, 11, 1)
#: The three SQL shapes a test distinguishes; each needle is a fragment only that query contains.
SQL_PEOPLE = "FROM public.employee_directory d LEFT JOIN public.departments"
SQL_LEAVES = "FROM public.leave_requests"
SQL_ACTIVE = "FROM public.employee_directory WHERE active"
SQL_REPORTS = "WHERE manager_id = :manager AND active"


def refused(exc_info, status: int, code: str) -> None:
    """`ApiError(status, code)` - the shape `install_error_handlers` turns into the error body."""
    assert (exc_info.value.status, exc_info.value.code) == (status, code), exc_info.value.message


class FakeResult:
    def __init__(self, rows):
        self._rows = list(rows)

    def mappings(self):
        return self

    def all(self):
        return list(self._rows)

    def first(self):
        return self._rows[0] if self._rows else None


class ScriptedDB:
    """A session that answers the first SQL fragment it recognises and records every statement.

    The answers are per fragment, in insertion order, so a test says exactly what each query of a
    journey returns; anything a journey should not reach answers with no rows, and `statements`
    still shows it was attempted (which is how a test proves no row was written).
    """

    def __init__(self, answers=None):
        self.answers = dict(answers or {})
        self.statements: list[tuple[str, dict]] = []
        self.commits = 0

    def execute(self, statement, params=None):
        sql = " ".join(str(statement).split())
        params = dict(params or {})
        self.statements.append((sql, params))
        for needle, rows in self.answers.items():
            if needle in sql:
                if callable(rows):
                    rows = rows(sql, params)
                return FakeResult(rows if isinstance(rows, list) else [rows])
        return FakeResult([])

    def commit(self):
        self.commits += 1

    def sql_for(self, needle: str) -> list[str]:
        return [sql for sql, _params in self.statements if needle in sql]


def task_row(**over):
    row = {"id": TASK_ID, "batch_id": BATCH, "kind": "task", "title": "تقرير شهري", "details": None,
           "due_date": date(2026, 11, 20), "start_at": None, "end_at": None, "location": None,
           "created_by": "mgr", "assignee_id": "emp1", "status": "open", "response_note": None,
           "created_at": NOW, "updated_at": NOW, "from_name": "مدير مباشر", "to_name": "موظف أول"}
    row.update(over)
    return row


def meeting_row(**over):
    return task_row(kind="meeting", due_date=None, start_at=NOW,
                    end_at=NOW + timedelta(hours=1), location="قاعة 2", **over)


def world(monkeypatch, *, perms=None):
    """`team_scope`, the Riyadh date and the audit/notification helpers, without a database.

    `perms` is the effective permission set the manager holds; every other caller holds none, which is
    how "a plain employee sees nothing" stays true without a second knob.
    """
    granted = {**NO_PERMS, **dict(ALL_PERMS if perms is None else perms)}
    seen = {"notifications": [], "audit": []}
    monkeypatch.setattr(team_scope, "effective_perms", lambda _db, _manager_id: dict(granted))
    monkeypatch.setattr(tasks, "today_riyadh", lambda: TODAY)
    monkeypatch.setattr(tasks_api.canonical, "_insert_notification",
                        lambda _db, who, rid, title, body, stage_, kind: seen["notifications"].append(
                            {"who": who, "title": title, "body": body, "kind": kind}))
    monkeypatch.setattr(tasks_api.canonical, "_write_audit",
                        lambda _db, actor, request, module, action, *args, **kwargs: seen["audit"].append(
                            (module, action, args, kwargs)))
    return seen



# ---------------------------------------------------------------- the shapes the app reads
def test_the_task_shape_is_exactly_the_apps_task_type():
    out = tasks.task_out(task_row())
    assert set(out) == {"id", "batch_id", "kind", "title", "details", "due_date", "start_at",
                        "end_at", "location", "status", "response_note", "from_id", "from_name",
                        "to_id", "to_name", "created_at"}
    assert out["id"] == str(TASK_ID) and out["batch_id"] == str(BATCH)
    assert out["from_id"] == "mgr" and out["to_id"] == "emp1"
    assert out["due_date"] == "2026-11-20"                  # a date, never a datetime


def test_a_meetings_instant_comes_back_as_an_iso_string():
    out = tasks.task_out(meeting_row())
    assert out["start_at"].startswith("2026-11-01T09:00") and out["end_at"] is not None
    assert out["due_date"] is None and out["location"] == "قاعة 2"


# ---------------------------------------------------------------- validation (the form's rules)
def body(**over):
    row = {"to": ["emp1"], "kind": "task", "title": "تقرير شهري", "details": "  ",
           "due": "2026-11-20"}
    row.update(over)
    return row


@pytest.mark.parametrize("changed", [
    {"to": []}, {"to": ["  "]}, {"kind": "reminder"}, {"title": "  "}, {"title": "x" * 201},
    {"due": "20/11/2026"}, {"kind": "meeting"}, {"kind": "meeting", "start": "not-a-time"},
    {"kind": "meeting", "start": "2026-11-05T12:00:00+03:00", "end": "2026-11-05T11:00:00+03:00"},
])
def test_a_send_body_that_breaks_a_rule_is_refused(changed):
    with pytest.raises(ApiError) as exc:
        tasks.clean_task(body(**changed))
    refused(exc, 422, "invalid_request")


def test_the_body_is_cleaned_and_duplicates_collapse():
    cleaned = tasks.clean_task(body(to=["emp2", "emp1", "emp2", " "], title="  متابعة  ",
                                    details="  التفاصيل  "))
    assert cleaned["to"] == ["emp2", "emp1"]          # the screen's order, one row per person
    assert cleaned["title"] == "متابعة" and cleaned["details"] == "التفاصيل"
    assert cleaned["due"] == date(2026, 11, 20)
    assert cleaned["start"] is None and cleaned["end"] is None and cleaned["location"] is None


def test_a_meeting_keeps_its_time_and_a_task_does_not():
    meeting = tasks.clean_task({"to": ["emp1"], "kind": "meeting", "title": "اجتماع",
                                "start": "2026-11-05T10:00:00+03:00",
                                "end": "2026-11-05T11:00:00+03:00", "location": " قاعة ",
                                "due": "2026-11-20"})
    assert meeting["start"].isoformat() == "2026-11-05T10:00:00+03:00"
    assert meeting["end"] is not None and meeting["location"] == "قاعة"
    assert meeting["due"] is None                      # a meeting has a time, not a deadline
    task = tasks.clean_task({"to": ["emp1"], "kind": "task", "title": "مهمة",
                             "start": "2026-11-05T10:00:00+03:00"})
    assert task["start"] is None and task["end"] is None


def test_a_time_without_an_offset_is_read_in_riyadh():
    cleaned = tasks.clean_task({"to": ["emp1"], "kind": "meeting", "title": "اجتماع",
                                "start": "2026-11-05T10:00:00"})
    assert cleaned["start"].utcoffset() == timedelta(hours=3)


def test_the_bell_body_shows_the_time_the_screen_would():
    meeting = tasks.clean_task({"to": ["emp1"], "kind": "meeting", "title": "اجتماع",
                                "start": "2026-11-05T10:00:00+03:00"})
    assert tasks.when_label(meeting) == "05/11/2026 10:00"
    assert tasks.when_label(tasks.clean_task(body())) == "20/11/2026"
    assert tasks.when_label(tasks.clean_task({"to": ["emp1"], "title": "بلا موعد"})) == ""


# ---------------------------------------------------------------- who may see a team
def test_a_plain_employee_is_told_nothing_about_anybody(monkeypatch):
    world(monkeypatch)
    db = ScriptedDB()
    assert tasks.availability(db, dict(EMP)) == {"items": [], "today": "2026-11-01", "allowed": False}
    assert db.sql_for(SQL_PEOPLE) == []          # not even a list of names
    assert db.sql_for(SQL_LEAVES) == []


def test_a_manager_needs_both_team_permissions(monkeypatch):
    world(monkeypatch, perms={"view_team": True})            # leaves not granted
    db = ScriptedDB()
    assert tasks.availability(db, dict(MGR))["allowed"] is False
    assert db.sql_for(SQL_REPORTS) == []
    world(monkeypatch, perms={"view_team": False, "view_team_leaves": True})
    assert tasks.availability(ScriptedDB(), dict(MGR))["allowed"] is False


def test_a_manager_sees_only_their_reports_and_only_approved_leaves(monkeypatch):
    world(monkeypatch)
    db = ScriptedDB({SQL_REPORTS: [{"employee_id": "emp1"}, {"employee_id": "emp2"}],
                     SQL_PEOPLE: [{"employee_id": "emp1", "name_ar": "موظف أول",
                                   "job_title": "محاسب", "department": "المالية"},
                                  {"employee_id": "emp2", "name_ar": "موظف ثان",
                                   "job_title": None, "department": None}],
                     SQL_LEAVES: [{"employee_id": "emp1", "leave_type": "annual",
                                   "from_date": TODAY, "to_date": TODAY + timedelta(days=4),
                                   "days": 5}]})
    answer = tasks.availability(db, dict(MGR))
    assert answer["allowed"] is True and answer["today"] == "2026-11-01"
    assert [item["name"] for item in answer["items"]] == ["موظف أول", "موظف ثان"]
    assert answer["items"][0] == {"id": "emp1", "name": "موظف أول", "job": "محاسب",
                                  "dept": "المالية",
                                  "leaves": [{"from": "2026-11-01", "to": "2026-11-05",
                                              "days": 5.0, "type": "annual"}]}
    assert answer["items"][1]["leaves"] == []                # nobody on leave, not a null
    leaves_sql, params = next((sql, p) for sql, p in db.statements if SQL_LEAVES in sql)
    assert "w.status = 'approved'" in leaves_sql             # pending and rejected never show
    assert params["since"] == TODAY - timedelta(days=60)     # the screen's −60 window
    assert params["ids"] == ["emp1", "emp2"]                 # my reports, nobody else


def test_a_leave_is_away_not_why(monkeypatch):
    """Only `annual` and `remote` are named to a manager; sickness and the rest are «إجازة»."""
    for kind, shown in (("annual", "annual"), ("remote", "remote"), ("sick", "private"),
                        ("maternity", "private"), ("death", "private"), ("marriage", "private"),
                        ("an_type_added_next_year", "private"), ("", "private")):
        assert tasks.leave_out({"leave_type": kind, "from_date": TODAY,
                                "to_date": TODAY, "days": 1})["type"] == shown, kind
    world(monkeypatch)
    db = ScriptedDB({SQL_REPORTS: [{"employee_id": "emp1"}, {"employee_id": "emp2"}],
                     SQL_PEOPLE: [{"employee_id": "emp1", "name_ar": "موظف أول", "job_title": None,
                                   "department": None},
                                  {"employee_id": "emp2", "name_ar": "موظف ثان", "job_title": None,
                                   "department": None}],
                     SQL_LEAVES: [{"employee_id": "emp1", "leave_type": "sick",
                                   "from_date": TODAY, "to_date": TODAY, "days": 1.0,
                                   "reason": "عملية جراحية", "notes": "تقرير طبي"},
                                  {"employee_id": "emp2", "leave_type": "remote",
                                   "from_date": TODAY, "to_date": TODAY, "days": 1.0}]})
    answer = tasks.availability(db, dict(MGR))
    sick = answer["items"][0]["leaves"][0]
    assert sick == {"from": "2026-11-01", "to": "2026-11-01", "days": 1.0, "type": "private"}
    assert "جراح" not in str(answer) and "طبي" not in str(answer)   # no reason, no diagnosis
    assert answer["items"][1]["leaves"][0]["type"] == "remote"      # remote stays named: not absence
    leaves_sql, _params = next((sql, p) for sql, p in db.statements if SQL_LEAVES in sql)
    assert "reason" not in leaves_sql and "notes" not in leaves_sql  # never even selected


def test_hr_and_the_ceo_see_every_active_employee(monkeypatch):
    world(monkeypatch)
    db = ScriptedDB({SQL_ACTIVE: [{"employee_id": "emp1"}, {"employee_id": "out"}],
                     SQL_PEOPLE: [{"employee_id": "emp1", "name_ar": "موظف أول", "job_title": None,
                                   "department": None},
                                  {"employee_id": "out", "name_ar": "موظف خارجي", "job_title": None,
                                   "department": None}]})
    for actor in (HR, CEO):
        answer = tasks.availability(db, dict(actor))
        assert answer["allowed"] is True and [i["id"] for i in answer["items"]] == ["emp1", "out"]
    assert db.sql_for(SQL_REPORTS) == []                     # never through a team


def test_an_account_without_an_employee_sees_nothing(monkeypatch):
    world(monkeypatch)
    assert tasks.availability(ScriptedDB(), {"employee_id": None,
                                             "role": "employee"})["allowed"] is False


# ---------------------------------------------------------------- sending
def test_a_task_is_one_row_per_recipient_in_one_batch(monkeypatch):
    world(monkeypatch)
    db = ScriptedDB({SQL_REPORTS: [{"employee_id": "emp1"}, {"employee_id": "emp2"}]})
    batch = tasks.send(db, dict(MGR), tasks.clean_task(body(to=["emp1", "emp2"])))
    written = [params for sql, params in db.statements if "INSERT INTO public.ariba_tasks" in sql]
    assert len(written) == 2
    assert {row["assignee"] for row in written} == {"emp1", "emp2"}
    assert {row["batch"] for row in written} == {batch}      # one batch, two rows
    assert all(row["me"] == "mgr" and row["kind"] == "task" for row in written)
    assert all(row["due"] == date(2026, 11, 20) for row in written)


def test_sending_to_somebody_outside_the_audience_writes_nothing(monkeypatch):
    world(monkeypatch)
    db = ScriptedDB({SQL_REPORTS: [{"employee_id": "emp1"}]})
    with pytest.raises(ApiError) as exc:
        tasks.send(db, dict(MGR), tasks.clean_task(body(to=["emp1", "out"])))
    refused(exc, 403, "forbidden")
    assert db.sql_for("INSERT INTO public.ariba_tasks") == []      # not even the valid half


def test_a_plain_employee_has_nobody_to_send_to(monkeypatch):
    world(monkeypatch)
    with pytest.raises(ApiError) as exc:
        tasks.send(ScriptedDB(), dict(EMP), tasks.clean_task(body()))
    refused(exc, 403, "forbidden")


def test_the_router_rings_each_recipient_and_audits_the_batch(monkeypatch):
    seen = world(monkeypatch)
    db = ScriptedDB({SQL_REPORTS: [{"employee_id": "emp1"}, {"employee_id": "emp2"}]})
    answer = tasks_api.send_tasks(body=body(to=["emp1", "emp2"]), request=None,
                                  actor=dict(MGR), db=db)
    assert answer["sent"] == 2 and str(uuid.UUID(answer["batch_id"])) == answer["batch_id"]
    assert [(n["who"], n["title"]) for n in seen["notifications"]] == [
        ("emp1", "مهمة جديدة: تقرير شهري"), ("emp2", "مهمة جديدة: تقرير شهري")]
    assert seen["notifications"][0]["body"] == "من مدير مباشر — 20/11/2026"
    assert seen["notifications"][0]["kind"] == "task"
    module, action, args, kwargs = seen["audit"][0]
    assert (module, action) == ("tasks", "task_create")
    assert args[0] == "task" and str(args[1]) == answer["batch_id"]
    assert kwargs["details"] == {"kind": "task", "to": ["emp1", "emp2"]}
    assert db.commits == 1


def test_an_invitation_says_so_and_carries_its_time(monkeypatch):
    seen = world(monkeypatch)
    db = ScriptedDB({SQL_REPORTS: [{"employee_id": "emp1"}]})
    tasks_api.send_tasks(body={"to": ["emp1"], "kind": "meeting", "title": "اجتماع الفريق",
                               "start": "2026-11-05T10:00:00+03:00", "location": "قاعة 2"},
                         request=None, actor=dict(MGR), db=db)
    assert seen["notifications"][0]["title"] == "دعوة اجتماع: اجتماع الفريق"
    assert seen["notifications"][0]["body"] == "من مدير مباشر — 05/11/2026 10:00"
    written = next(params for sql, params in db.statements if "INSERT INTO public.ariba_tasks" in sql)
    assert written["start"].isoformat() == "2026-11-05T10:00:00+03:00"
    assert written["location"] == "قاعة 2" and written["due"] is None


def test_a_batch_a_recipient_cannot_receive_writes_no_rows_and_rings_no_bell(monkeypatch):
    seen = world(monkeypatch)
    db = ScriptedDB({SQL_REPORTS: [{"employee_id": "emp1"}]})
    with pytest.raises(ApiError) as exc:
        tasks_api.send_tasks(body=body(to=["emp1", "out"]), request=None, actor=dict(MGR), db=db)
    refused(exc, 403, "forbidden")
    assert db.sql_for("INSERT INTO public.ariba_tasks") == []
    assert seen["notifications"] == [] and seen["audit"] == [] and db.commits == 0


# ---------------------------------------------------------------- the two boxes
def test_the_inbox_is_what_was_sent_to_me_and_sent_is_what_i_sent(monkeypatch):
    world(monkeypatch)
    db = ScriptedDB({"FROM public.ariba_tasks t": [task_row()]})
    inbox = tasks_api.list_tasks(box="inbox", actor=dict(EMP), db=db)
    assert inbox["items"][0]["from_name"] == "مدير مباشر"
    assert "WHERE t.assignee_id = :me" in db.sql_for("FROM public.ariba_tasks")[0]
    tasks_api.list_tasks(box="sent", actor=dict(EMP), db=db)
    assert "WHERE t.created_by = :me" in db.sql_for("FROM public.ariba_tasks")[1]
    assert all(params["me"] == "emp1" for _sql, params in db.statements)


def test_a_box_the_app_does_not_offer_is_refused(monkeypatch):
    world(monkeypatch)
    db = ScriptedDB()
    with pytest.raises(ApiError) as exc:
        tasks.for_box(db, "emp1", "archive")
    refused(exc, 422, "invalid_request")
    assert db.statements == []


def test_an_empty_inbox_is_an_empty_list(monkeypatch):
    world(monkeypatch)
    assert tasks_api.list_tasks(box="inbox", actor={"employee_id": None, "role": "employee"},
                                db=ScriptedDB()) == {"items": []}


# ---------------------------------------------------------------- answering
def test_the_recipient_marks_a_task_done(monkeypatch):
    seen = world(monkeypatch)
    db = ScriptedDB({"SELECT * FROM public.ariba_tasks WHERE id": task_row()})
    answer = tasks_api.update_task(task_id=str(TASK_ID), body={"status": "done"}, request=None,
                                   actor=dict(EMP), db=db)
    assert answer == {"ok": True, "status": "done"}
    assert "status = :status" in db.sql_for("UPDATE public.ariba_tasks")[0]
    assert [(n["who"], n["title"]) for n in seen["notifications"]] == [
        ("mgr", "أُنجزت المهمة: تقرير شهري")]
    assert [entry[1] for entry in seen["audit"]] == ["task_done"]
    assert db.commits == 1


def test_a_meeting_is_declined_with_a_reason(monkeypatch):
    seen = world(monkeypatch)
    db = ScriptedDB({"SELECT * FROM public.ariba_tasks WHERE id": meeting_row(assignee_id="emp1")})
    tasks_api.update_task(task_id=str(TASK_ID), body={"status": "declined", "note": "عندي اجتماع"},
                          request=None, actor=dict(EMP), db=db)
    written = next(params for sql, params in db.statements if "UPDATE public.ariba_tasks" in sql)
    assert written["status"] == "declined" and written["note"] == "عندي اجتماع"
    assert seen["notifications"][0]["title"] == "اعتذار عن الاجتماع: تقرير شهري"
    assert seen["notifications"][0]["body"] == "عندي اجتماع — موظف أول"


def test_only_the_sender_cancels(monkeypatch):
    world(monkeypatch)
    db = ScriptedDB({"SELECT * FROM public.ariba_tasks WHERE id": task_row()})
    assert tasks_api.update_task(task_id=str(TASK_ID), body={"status": "cancelled"}, request=None,
                                 actor=dict(MGR), db=db)["status"] == "cancelled"
    with pytest.raises(ApiError) as exc:            # the recipient cannot cancel
        tasks_api.update_task(task_id=str(TASK_ID), body={"status": "cancelled"}, request=None,
                              actor=dict(EMP), db=db)
    refused(exc, 422, "invalid_request")


def test_the_sender_cannot_call_it_done(monkeypatch):
    world(monkeypatch)
    db = ScriptedDB({"SELECT * FROM public.ariba_tasks WHERE id": task_row()})
    with pytest.raises(ApiError) as exc:
        tasks_api.update_task(task_id=str(TASK_ID), body={"status": "done"}, request=None,
                              actor=dict(MGR), db=db)
    refused(exc, 422, "invalid_request")
    assert db.sql_for("UPDATE public.ariba_tasks") == []


def test_a_row_that_is_no_longer_open_refuses_every_answer(monkeypatch):
    world(monkeypatch)
    db = ScriptedDB({"SELECT * FROM public.ariba_tasks WHERE id": task_row(status="done")})
    with pytest.raises(ApiError) as exc:
        tasks_api.update_task(task_id=str(TASK_ID), body={"status": "done"}, request=None,
                              actor=dict(EMP), db=db)
    refused(exc, 409, "not_open")
    assert db.sql_for("UPDATE public.ariba_tasks") == []


def test_a_task_that_is_not_mine_does_not_exist(monkeypatch):
    seen = world(monkeypatch)
    db = ScriptedDB({"SELECT * FROM public.ariba_tasks WHERE id": task_row()})
    with pytest.raises(ApiError) as exc:
        tasks_api.update_task(task_id=str(TASK_ID), body={"status": "done"}, request=None,
                              actor=dict(OUT), db=db)
    refused(exc, 404, "not_found")
    assert db.sql_for("UPDATE public.ariba_tasks") == []
    assert seen["audit"] == [] and seen["notifications"] == []


def test_a_made_up_id_is_a_plain_404(monkeypatch):
    seen = world(monkeypatch)
    db = ScriptedDB()
    with pytest.raises(ApiError) as exc:
        tasks_api.update_task(task_id="not-a-uuid", body={"status": "done"}, request=None,
                              actor=dict(EMP), db=db)
    refused(exc, 404, "not_found")
    assert db.statements == []                      # a made-up id never reaches the database
    assert seen["audit"] == []

    assert db.statements == []


# ---------------------------------------------------------------- the app's own contract
PORT_TS = Path(__file__).resolve().parents[2] / "frontend" / "employee-app" / "src" / "lib" / "port.ts"
QUOTE_CHARS = "\"'" + chr(96)          # the two delimiters a port.ts path can sit between
CALL = re.compile(r"\b(api|post|put)(?:<[^>]*>)?\(\s*[" + QUOTE_CHARS + r"]?(/[^" + QUOTE_CHARS + r"]*)")
METHOD = {"api": "GET", "post": "POST", "put": "PUT"}
TASK_PATHS = ("/tasks", "/team/availability")


def port_calls() -> set[tuple[str, str]]:
    """The task calls port.ts makes, with the `${…}` templates as `{param}` and the query dropped."""
    source = PORT_TS.read_text(encoding="utf-8")
    calls: set[tuple[str, str]] = set()
    for match in CALL.finditer(source):
        helper, path = match.group(1), match.group(2)
        if not path.startswith(TASK_PATHS):
            continue
        calls.add((METHOD[helper], re.sub(r"\$\{[^}]*\}", "{param}", path.split("?")[0])))
    return calls


def served_calls() -> set[tuple[str, str]]:
    calls: set[tuple[str, str]] = set()
    for route in tasks_api.router.routes:
        path = re.sub(r"\{[^}]*\}", "{param}", route.path)
        if path.startswith(TASK_PATHS):
            calls |= {(method, path) for method in route.methods}
    return calls


def ts_block(name: str) -> str:
    """The export-type body from port.ts, braces matched."""
    source = PORT_TS.read_text(encoding="utf-8")
    marker = f"export type {name} = "
    start = source.index(marker) + len(marker)
    start = source.index("{", start)
    depth = 0
    for index in range(start, len(source)):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                return source[start:index + 1]
    raise AssertionError(f"{name} is not closed in port.ts")


def ts_fields(block: str) -> list[str]:
    """The field names at the top level of a TS object type (nested objects skipped)."""
    body = block[1:-1]
    parts, depth, current = [], 0, ""
    for char in body:
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
        if char == ";" and depth == 0:
            parts.append(current)
            current = ""
        else:
            current += char
    fields = []
    for part in parts:
        match = re.match(r"\s*(\w+)\??\s*:", part)
        if match:
            fields.append(match.group(1))
    return fields


def test_the_task_routes_the_app_calls_are_the_routes_we_serve():
    expected = {("GET", "/team/availability"), ("GET", "/tasks"), ("POST", "/tasks"),
                ("POST", "/tasks/{param}/update")}
    assert port_calls() == expected          # the calls the app makes, exactly as port.ts writes them
    assert expected <= served_calls()        # ...and every one of them has a route


def test_every_field_the_app_reads_from_a_task_and_from_availability_is_returned():
    task_fields = set(ts_fields(ts_block("Task")))
    returned_task = set(tasks.task_out(task_row()))
    assert task_fields <= returned_task, sorted(task_fields - returned_task)
    availability_fields = set(ts_fields(ts_block("Availability")))
    returned_availability = set(tasks.availability(
        ScriptedDB({SQL_REPORTS: [{"employee_id": "emp1"}],
                    SQL_PEOPLE: [{"employee_id": "emp1", "name_ar": "موظف أول",
                                  "job_title": None, "department": None}]}),
        dict(MGR)))
    assert availability_fields == {"items", "today", "allowed"} <= returned_availability
    assert set(ts_fields(ts_block("Availability"))) == returned_availability


def test_the_fields_the_screen_sends_are_the_ones_we_store():
    sent = {"to": ["emp1"], "kind": "meeting", "title": "اجتماع", "details": None,
            "start": "2026-11-05T10:00:00+03:00", "end": "2026-11-05T11:00:00+03:00",
            "location": "قاعة", "due": None}
    assert set(sent) <= set(tasks.clean_task(sent))
