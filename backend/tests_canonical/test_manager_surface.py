"""The direct manager's surface: who may see what, and what an on-behalf request may claim.

Every case here is a refusal the API has to keep making — an employee reaching the manager
endpoints, a manager reaching outside their team, a report who never delegated them, a body that
names somebody else — plus the positive paths and the salary contract (`/me/team` returns
`salary_total` only when HR turned the setting on *and* the manager holds `view_team_salary`).

No database is needed: `team_scope` is exercised against `FakeDB` (the rows each query asks for),
and the routers against the same recording session `test_new_ui_requests.py` uses. The app's own
field names (`frontend/employee-app/src/lib/port.ts`) are pinned by the last section, so a rename
on either side fails here without a device.
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import date
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.core.errors import ApiError
from app.routers import canonical, manager
from app.services import team_scope

EMP1 = {"employee_id": "emp1", "manager_id": "mgr", "name_ar": "موظف أول", "active": True,
        "name_en": "First Employee", "nationality": "سعودي", "join_date": date(2024, 1, 7),
        "data": {"empNo": "E001", "mobile": "0500000001", "email": "emp1@example.com",
                 "contractEnd": "2027-01-06", "iqamaExpiry": "2027-03-01",
                 "salaryTotal": 12000.5, "netSalary": 11000, "jobTitle": "محاسب"}}
EMP2 = {"employee_id": "emp2", "manager_id": "mgr", "name_ar": "موظف ثانٍ", "active": True,
        "name_en": None, "nationality": None, "join_date": None, "data": {"empNo": "E002"}}

MGR = {"employee_id": "mgr", "account_id": uuid.uuid4(), "role": "employee", "name_ar": "مدير مباشر"}
OTHER_EMP = {"employee_id": "emp9", "account_id": uuid.uuid4(), "role": "employee", "name_ar": "موظف آخر"}
HR = {"employee_id": "hr", "account_id": uuid.uuid4(), "role": "hr", "name_ar": "موارد بشرية", "username": "EMP040"}
ALL_PERMS = {key: True for key in team_scope.MANAGER_PERM_KEYS}
NO_PERMS = {key: False for key in team_scope.MANAGER_PERM_KEYS}


def refused(exc_info, status: int, code: str) -> None:
    """`ApiError(status, code)` — the shape `install_error_handlers` turns into the error body."""
    assert (exc_info.value.status, exc_info.value.code) == (status, code), exc_info.value.message


class FakeResult:
    def __init__(self, rows):
        self._rows = list(rows)
        self.rowcount = len(self._rows)

    def mappings(self):
        return self

    def all(self):
        return self._rows

    def first(self):
        return self._rows[0] if self._rows else None


class FakeDB:
    """The rows `team_scope` asks for, picked by what the statement mentions (no database)."""

    def __init__(self, *, team=(EMP1, EMP2), leaves=(), perms=None, setting=None,
                 delegation=None, manager_of=None):
        self.team = list(team)
        self.leaves = list(leaves)
        self.perms = perms
        self.setting = setting
        self.delegation = delegation
        self.manager_of = dict(manager_of or {})
        self.statements: list[tuple[str, dict]] = []

    def execute(self, statement, params=None):
        sql = " ".join(str(statement).split())
        params = params or {}
        self.statements.append((sql, params))
        return FakeResult(self._answer(sql, params))

    def written(self, needle: str) -> list[dict]:
        return [params for sql, params in self.statements if needle in sql]

    def _answer(self, sql: str, params: dict):
        if "SELECT perms FROM public.ariba_manager_perms" in sql:
            return [{"perms": self.perms}] if self.perms is not None else []
        if "SELECT value FROM public.ariba_app_settings" in sql:
            return [{"value": self.setting}] if self.setting is not None else []
        if "FROM public.ariba_delegations" in sql:
            if self.delegation is None:
                return []
            return [{"employee_id": params.get("e", "emp1"), "active": self.delegation}] if "SELECT active" in sql \
                else [{"employee_id": "emp1"}] if self.delegation else []
        if "SELECT manager_id FROM public.employee_directory" in sql:
            employee_id = params.get("e")
            return [{"manager_id": self.manager_of[employee_id]}] if employee_id in self.manager_of else []
        if "WHERE d.manager_id = :mid" in sql:
            return self.team
        if "SELECT employee_id FROM public.employee_directory WHERE manager_id=:m" in sql:
            return [{"employee_id": row["employee_id"]} for row in self.team]
        if "FROM public.leave_requests l" in sql:
            return self.leaves
        raise AssertionError(f"unexpected statement: {sql}")


def leave_book(**overrides):
    book = SimpleNamespace(count_workdays=lambda *_a: 2, current=lambda *_a: 30, annual=lambda *_a: 21,
                           summary=lambda _e: {"current": 12.5, "year_end": 9.0})
    for key, value in overrides.items():
        setattr(book, key, value)
    return book


def team_world(monkeypatch, db: FakeDB, *, views=None, book=None):
    """`team_scope` against `db`, with the leave engine faked (`cdata`) and a fixed \"today\"."""
    monkeypatch.setattr(team_scope, "cdata", SimpleNamespace(
        employees=lambda _db, employee_id=None: [views[employee_id]] if views and employee_id in views else [],
        leave_book=lambda *_a, **_k: book or leave_book()))
    monkeypatch.setattr(team_scope, "today_riyadh", lambda: date(2026, 11, 1))
    return db


# ------------------------------------------------------------------ the team screen
def test_team_salary_needs_the_setting_even_when_the_permission_is_granted(monkeypatch):
    # HR granted view_team_salary; nobody turned the company-wide setting on → still hidden.
    db = FakeDB(perms={"view_team": True, "view_team_salary": True}, setting=None)
    team_world(monkeypatch, db)
    members = team_scope.team_members(db, "mgr")
    assert len(members) == 2
    assert all("salary_total" not in m and "net_salary" not in m for m in members)

    # …and once the setting says visible, the salary appears.
    db = FakeDB(perms={"view_team": True, "view_team_salary": True}, setting={"visible": True})
    team_world(monkeypatch, db)
    members = team_scope.team_members(db, "mgr")
    assert members[0]["salary_total"] == 12000.5 and members[0]["net_salary"] == 11000


def test_team_salary_stays_hidden_when_the_setting_is_on_but_the_permission_is_not(monkeypatch):
    db = FakeDB(perms={"view_team": True, "view_team_salary": False}, setting={"visible": True})
    team_world(monkeypatch, db)
    assert "salary_total" not in team_scope.team_members(db, "mgr")[0]


def test_team_identity_is_always_there_and_personal_data_needs_view_team_data(monkeypatch):
    db = FakeDB(perms={"view_team": True, "view_team_data": False})
    team_world(monkeypatch, db)
    member = team_scope.team_members(db, "mgr")[0]
    assert {"id", "emp_no", "name_ar", "name_en", "job_title", "department", "delegated"} <= set(member)
    assert member["emp_no"] == "E001" and member["name_ar"] == "موظف أول" and member["job_title"] == "محاسب"
    for hidden in ("mobile", "email", "contract_end", "iqama_expiry", "nationality", "join_date", "employer"):
        assert hidden not in member

    db = FakeDB(perms={"view_team": True, "view_team_data": True})
    team_world(monkeypatch, db)
    member = team_scope.team_members(db, "mgr")[0]
    assert member["mobile"] == "0500000001" and member["email"] == "emp1@example.com"
    assert member["contract_end"] == "2027-01-06" and member["iqama_expiry"] == "2027-03-01"
    assert member["join_date"] == "2024-01-07" and member["nationality"] == "سعودي"


def test_team_balance_and_leaves_need_view_team_leaves(monkeypatch):
    leaves = [{"employee_id": "emp1", "leave_type": "annual", "from_date": date(2026, 5, 3),
               "to_date": date(2026, 5, 7), "days": 5, "wid": uuid.uuid4(), "status": "approved"}]
    views = {"emp1": SimpleNamespace(id="emp1"), "emp2": SimpleNamespace(id="emp2")}
    db = FakeDB(perms={"view_team": True, "view_team_leaves": False}, leaves=leaves)
    team_world(monkeypatch, db, views=views)
    assert "leave_balance" not in team_scope.team_members(db, "mgr")[0]

    db = FakeDB(perms={"view_team": True, "view_team_leaves": True}, leaves=leaves)
    team_world(monkeypatch, db, views=views)
    first = team_scope.team_members(db, "mgr")[0]
    assert first["leave_balance"] == 12.5 and first["leave_year_end"] == 9.0
    assert first["leaves"] == [{"id": str(leaves[0]["wid"]), "type": "annual", "from": "2026-05-03",
                               "to": "2026-05-07", "days": 5.0, "status": "approved"}]
    assert team_scope.team_members(db, "mgr")[1]["leaves"] == []  # a member with no leave still lists


def test_team_member_is_marked_when_they_delegated_this_manager(monkeypatch):
    db = FakeDB(perms={"view_team": True}, delegation=True)
    team_world(monkeypatch, db)
    members = team_scope.team_members(db, "mgr")
    assert [m["delegated"] for m in members] == [True, False]

    db = FakeDB(perms={"view_team": True}, delegation=False)
    team_world(monkeypatch, db)
    assert all(m["delegated"] is False for m in team_scope.team_members(db, "mgr"))


def test_nobody_to_show_means_an_empty_list(monkeypatch):
    # no team at all
    db = FakeDB(team=[], perms=ALL_PERMS)
    team_world(monkeypatch, db)
    assert team_scope.team_members(db, "mgr") == []
    # a team but no view_team permission
    db = FakeDB(perms={"view_team": False})
    team_world(monkeypatch, db)
    assert team_scope.team_members(db, "mgr") == []
    # no employee at all (an account that is not linked to a directory row)
    assert team_scope.team_members(FakeDB(), None) == []


def test_permissions_are_sparse_and_the_defaults_fill_the_gaps():
    effective = team_scope.merge_perms({"view_team": True, "approve_requests": False})
    assert effective["view_team"] is True
    assert effective["approve_requests"] is False           # a stored false wins
    assert effective["manage_targets"] is True              # default on
    assert effective["view_team_salary"] is False           # default off
    assert set(effective) == set(team_scope.MANAGER_PERM_KEYS)


# ------------------------------------------------------------------ the routers
class RecordingDB:
    """A session that records, and answers the one write the router reads back."""

    def __init__(self, request_row=None):
        self.request_row = request_row or {}
        self.request_id = uuid.uuid4()
        self.statements: list[tuple[str, dict]] = []
        self.commits = 0

    def execute(self, statement, params=None):
        sql = " ".join(str(statement).split())
        params = dict(params or {})
        self.statements.append((sql, params))
        if "INSERT INTO public.workflow_requests" in sql and "RETURNING" in sql:
            row = {"id": self.request_id, "employee_id": params["eid"], "request_type": params["type"],
                   "current_stage": params["stage"], "payload": json.loads(params["payload"]),
                   "submitted_by_employee_id": params["by"], "status": "pending", "reject_reason": None}
            return FakeResult([{**row, **self.request_row}])
        return FakeResult([])

    def written(self, needle: str) -> list[dict]:
        return [params for sql, params in self.statements if needle in sql]

    def commit(self):
        self.commits += 1


def manager_world(monkeypatch, *, team=("emp1",), perms=None, delegated=False, is_report=True,
                  stages=("manager", "hr"), employee=None, book=None, rows=()):
    """The manager router with `team_scope`, `canonical` and `cdata` answering without a database.

    `perms` is the *effective* permission set (`GET /me/manager-perms` answers it), so a test names
    exactly the keys it cares about and every other key is off.
    """
    granted = {**NO_PERMS, **dict(perms or {})}
    employee = dict(EMP1 if employee is None else employee)
    seen: dict[str, list] = {"notifications": [], "audit": [], "stage_notices": [], "requests": []}

    monkeypatch.setattr(team_scope, "team_ids", lambda _db, _mid: list(team))
    monkeypatch.setattr(team_scope, "effective_perms", lambda _db, _mid: dict(granted))
    monkeypatch.setattr(team_scope, "is_manager_of", lambda _db, _mid, _eid: is_report)
    monkeypatch.setattr(team_scope, "delegation_active", lambda _db, _eid, _mid: delegated)
    monkeypatch.setattr(team_scope, "team_salary_visible", lambda _db: False)
    monkeypatch.setattr(team_scope, "set_team_salary_visible",
                        lambda _db, visible, _by=None: bool(visible))
    monkeypatch.setattr(team_scope, "save_perms",
                        lambda _db, _mid, updates, _by=None: team_scope.merge_perms(updates))

    real_row, real_rows = canonical._row, canonical._rows

    def fake_row(db, sql, **params):
        flat = " ".join(sql.split())
        if "WHERE d.employee_id=:e" in flat:
            return employee
        if "SELECT employee_id,name_ar FROM public.employee_directory" in flat:
            return {"employee_id": params.get("m"), "name_ar": "مدير مباشر"}
        if "SELECT employee_id FROM public.employee_directory WHERE employee_id=:m" in flat:
            return {"employee_id": params.get("m")}
        return real_row(db, sql, **params)  # the INSERT ... RETURNING * really runs

    def fake_rows(db, sql, **params):
        if rows:
            db.statements.append((" ".join(sql.split()), params))
            return list(rows)
        return real_rows(db, sql, **params)

    monkeypatch.setattr(canonical, "_row", fake_row)
    monkeypatch.setattr(canonical, "_rows", fake_rows)
    monkeypatch.setattr(canonical, "_require_lookup", lambda *_a, **_k: None)
    monkeypatch.setattr(canonical, "_stages", lambda _db, _t, _has=True: list(stages))
    monkeypatch.setattr(canonical, "_require_stage_approver", lambda *_a, **_k: ["hr"])
    monkeypatch.setattr(canonical, "_stage_people", lambda *_a, **_k: ["hr"])
    monkeypatch.setattr(canonical, "_insert_notification",
                        lambda _db, who, rid, title, body, stage, kind: seen["notifications"].append(
                            {"who": who, "title": title, "stage": stage, "kind": kind}))
    monkeypatch.setattr(canonical, "_notify_stage",
                        lambda _db, item, stage: seen["stage_notices"].append((stage, item["id"])))
    monkeypatch.setattr(canonical, "_write_audit",
                        lambda _db, _actor, _req, area, action, *a, **k: seen["audit"].append((area, action)))
    monkeypatch.setattr(canonical, "_workflow_out", lambda _db, row: {
        "id": str(row["id"]), "employee_id": row["employee_id"], "employee_name": "موظف أول",
        "type": row["request_type"], "status": "pending", "stage": row["current_stage"],
        "rejection_reason": None, "created_at": None, "payload": {}})
    monkeypatch.setattr(manager.cdata, "employees", lambda *_a, **_k: [SimpleNamespace(id=employee["employee_id"])])
    monkeypatch.setattr(manager.cdata, "leave_book", lambda *_a, **_k: book or leave_book())
    return seen


# ------------------------------------------------------------------ /me/manager-perms
def test_a_plain_employee_manages_nobody_and_gets_every_permission_false(monkeypatch):
    manager_world(monkeypatch, team=[], perms=ALL_PERMS)
    answer = manager.my_manager_perms(actor=dict(OTHER_EMP), db=RecordingDB())
    assert answer["is_manager"] is False and answer["team_count"] == 0
    assert answer["perms"] == NO_PERMS


def test_a_manager_sees_their_team_count_and_effective_permissions(monkeypatch):
    manager_world(monkeypatch, team=["emp1", "emp2"], perms={"view_team": True, "view_team_requests": True})
    answer = manager.my_manager_perms(actor=dict(MGR), db=RecordingDB())
    assert answer["is_manager"] is True and answer["team_count"] == 2
    assert answer["perms"]["view_team_requests"] is True
    assert answer["perms"]["view_team"] is True
    assert set(answer["perms"]) == set(team_scope.MANAGER_PERM_KEYS)  # the app renders all ten


# ------------------------------------------------------------------ /me/team/requests
def test_an_employee_cannot_read_the_teams_requests(monkeypatch):
    manager_world(monkeypatch, team=[], perms=ALL_PERMS)
    db = RecordingDB()
    with pytest.raises(ApiError) as exc:
        manager.my_team_requests(actor=dict(OTHER_EMP), db=db)
    refused(exc, 403, "forbidden")
    assert db.statements == []  # refused before a single query


def test_a_manager_without_view_team_requests_is_refused(monkeypatch):
    manager_world(monkeypatch, perms={"view_team": True, "view_team_requests": False})
    with pytest.raises(ApiError) as exc:
        manager.my_team_requests(actor=dict(MGR), db=RecordingDB())
    refused(exc, 403, "forbidden")


def test_a_manager_reads_only_their_team_and_gets_the_app_shape(monkeypatch):
    rows = [{"id": uuid.uuid4(), "employee_id": "emp1", "request_type": "annual", "current_stage": "hr",
             "status": "pending", "payload": {"from": "2026-11-02", "to": "2026-11-03", "days": 2},
             "reject_reason": None, "submitted_by_employee_id": None},
            {"id": uuid.uuid4(), "employee_id": "emp2", "request_type": "salary_advance",
             "current_stage": "rejected", "status": "rejected", "payload": {"amount": 2000},
             "reject_reason": None, "submitted_by_employee_id": None}]
    manager_world(monkeypatch, perms={"view_team": True, "view_team_requests": True}, rows=rows)
    db = RecordingDB()
    answer = manager.my_team_requests(actor=dict(MGR), db=db)
    assert [item["employee_id"] for item in answer] == ["emp1", "emp2"]
    (sql, params), = db.statements
    assert params["ids"] == ["emp1"] and "ANY(:ids)" in sql and "LIMIT 300" in sql
    assert "template:%" in sql  # a signed form is not a team request
    assert answer[0]["request_type"] == "annual" and answer[0]["payload"]["days"] == 2
    assert answer[0]["current_stage"] == "hr"
    assert {"reject_reason", "created_at", "status", "stage"} <= set(answer[0])


# ------------------------------------------------------------------ on behalf
def submit_for(monkeypatch, body, *, target="emp1", actor=None, **world):
    """`POST /me/team/{employee_id}/requests` with the manager router faked (`manager_world`)."""
    seen = manager_world(monkeypatch, **world)
    db = RecordingDB()
    answer = manager.submit_for(target, body, request=None, actor=dict(actor or MGR), db=db)
    return answer, db, seen


ANNUAL = {"type": "annual", "payload": {"from": "2026-11-02", "to": "2026-11-03", "notes": "سفر عائلي"}}


def test_a_manager_cannot_submit_for_someone_who_does_not_report_to_them(monkeypatch):
    db = RecordingDB()
    manager_world(monkeypatch, is_report=False, perms=ALL_PERMS, delegated=True)
    with pytest.raises(ApiError) as exc:
        manager.submit_for("emp9", dict(ANNUAL), request=None, actor=dict(MGR), db=db)
    refused(exc, 403, "forbidden")
    assert db.statements == []


def test_a_report_whose_manager_lacks_submit_for_team_is_refused(monkeypatch):
    db = RecordingDB()
    manager_world(monkeypatch, perms={"submit_for_team": False}, delegated=True)
    with pytest.raises(ApiError) as exc:
        manager.submit_for("emp1", dict(ANNUAL), request=None, actor=dict(MGR), db=db)
    refused(exc, 403, "forbidden")
    assert db.statements == []


def test_a_report_who_did_not_delegate_is_refused(monkeypatch):
    db = RecordingDB()
    manager_world(monkeypatch, perms={"submit_for_team": True}, delegated=False)
    with pytest.raises(ApiError) as exc:
        manager.submit_for("emp1", dict(ANNUAL), request=None, actor=dict(MGR), db=db)
    refused(exc, 403, "not_delegated")
    assert db.statements == []


def test_on_behalf_leave_is_written_for_the_report_and_waits_at_hr(monkeypatch):
    answer, db, seen = submit_for(monkeypatch, dict(ANNUAL), perms={"submit_for_team": True},
                                  delegated=True)
    request_id = db.request_id
    (insert, params), = [(s, p) for s, p in db.statements if "INSERT INTO public.workflow_requests" in s]
    assert params["eid"] == "emp1"                      # the employee in the path, not the caller
    assert params["stage"] == "hr"                      # the manager's submission is their approval
    assert params["by"] == "mgr"                        # the real submitter, from the auth context
    payload = json.loads(params["payload"])
    assert payload["from"] == "2026-11-02" and payload["days"] == 2 and payload["notes"] == "سفر عائلي"
    assert payload["submitted_from"] == "manager_app"
    assert payload["submitted_by_manager"] == "mgr" and payload["submitted_by_name"] == "مدير مباشر"
    assert "type" not in payload                        # `payload.type` is obsolete, never copied

    actions = db.written("INSERT INTO public.workflow_actions")
    assert len(actions) == 2
    assert actions[0] == {"rid": request_id, "account": MGR["account_id"],
                          "comment": "قدّمه بالنيابة: مدير مباشر"}
    stages = [sql for sql, _ in db.statements if "INSERT INTO public.workflow_actions" in sql]
    assert "'employee','submitted'" in stages[0] and "'manager','approved'" in stages[1]
    (leave,) = db.written("INSERT INTO public.leave_requests")
    assert leave["eid"] == "emp1" and leave["type"] == "annual" and leave["days"] == 2

    assert {(n["who"], n["title"]) for n in seen["notifications"]} == {
        ("emp1", "قُدّم طلب بالنيابة عنك"), ("hr", "طلب مقدّم بالنيابة")}
    assert seen["stage_notices"] == [("hr", request_id)]
    assert seen["audit"] == [("workflow", "submit_for")]
    assert db.commits == 1
    assert answer["request_type"] == "annual" and answer["current_stage"] == "hr"
    assert answer["submitted_by_employee_id"] == "mgr"


def test_on_behalf_body_cannot_name_another_employee(monkeypatch):
    db = RecordingDB()
    manager_world(monkeypatch, perms={"submit_for_team": True}, delegated=True)
    body = {"type": "annual", "employee_id": "emp9",
            "payload": {"from": "2026-11-02", "to": "2026-11-03"}}
    with pytest.raises(ApiError) as exc:
        manager.submit_for("emp1", body, request=None, actor=dict(MGR), db=db)
    refused(exc, 403, "forbidden")
    assert db.statements == []


def test_on_behalf_does_not_trust_the_type_inside_the_payload(monkeypatch):
    # port.ts re-adds `type` to payload; the top-level type decides, and a mismatching payload.type
    # changes nothing.
    body = {"type": "unpaid", "payload": {"type": "annual", "from": "2026-11-02", "to": "2026-11-03",
                                          "notes": "سفر"}}
    answer, db, _seen = submit_for(monkeypatch, body, perms={"submit_for_team": True}, delegated=True)
    (insert, params), = [(s, p) for s, p in db.statements if "INSERT INTO public.workflow_requests" in s]
    assert params["type"] == "unpaid" and answer["request_type"] == "unpaid"
    assert "type" not in json.loads(params["payload"])


def test_on_behalf_refuses_a_type_the_screen_does_not_offer(monkeypatch):
    db = RecordingDB()
    manager_world(monkeypatch, perms={"submit_for_team": True}, delegated=True)
    body = {"type": "document", "payload": {"doc_type": "other", "doc_label": "خطاب"}}
    with pytest.raises(ApiError) as exc:
        manager.submit_for("emp1", body, request=None, actor=dict(MGR), db=db)
    refused(exc, 422, "invalid_request")
    assert db.statements == []


def test_on_behalf_salary_advance_needs_an_amount_and_a_reason(monkeypatch):
    manager_world(monkeypatch, perms={"submit_for_team": True}, delegated=True)
    for body in ({"type": "salary_advance", "payload": {}},
                 {"type": "salary_advance", "payload": {"amount": 2000}}):
        with pytest.raises(ApiError) as exc:
            manager.submit_for("emp1", body, request=None, actor=dict(MGR), db=RecordingDB())
        refused(exc, 422, "invalid_request")

    answer, db, _seen = submit_for(
        monkeypatch, {"type": "salary_advance", "payload": {"amount": 2000, "days": 10, "notes": "ظرف طارئ"}},
        perms={"submit_for_team": True}, delegated=True)
    (insert, params), = [(s, p) for s, p in db.statements if "INSERT INTO public.workflow_requests" in s]
    payload = json.loads(params["payload"])
    assert payload["amount"] == 2000.0 and payload["days"] == 10 and payload["notes"] == "ظرف طارئ"
    assert db.written("INSERT INTO public.leave_requests") == []  # an advance is not a leave
    assert answer["request_type"] == "salary_advance"


def test_on_behalf_for_a_report_without_a_direct_manager_starts_at_hr(monkeypatch):
    employee = {"employee_id": "emp1", "manager_id": None, "name_ar": "موظف أول", "data": {}}
    answer, db, _seen = submit_for(monkeypatch, dict(ANNUAL), employee=employee, stages=("hr",),
                                         perms={"submit_for_team": True}, delegated=True)
    (insert, params), = [(s, p) for s, p in db.statements if "INSERT INTO public.workflow_requests" in s]
    assert params["stage"] == "hr"
    assert len(db.written("INSERT INTO public.workflow_actions")) == 1  # nothing to approve at `manager`
    assert answer["current_stage"] == "hr"


def test_on_behalf_annual_leave_over_the_balance_is_refused(monkeypatch):
    db = RecordingDB()
    manager_world(monkeypatch, perms={"submit_for_team": True}, delegated=True,
                  book=leave_book(count_workdays=lambda *_a: 40, current=lambda *_a: 30))
    with pytest.raises(ApiError) as exc:
        manager.submit_for("emp1", dict(ANNUAL), request=None, actor=dict(MGR), db=db)
    refused(exc, 422, "exceeds_balance")
    assert db.written("INSERT INTO public.workflow_requests") == []


# ------------------------------------------------------------------ delegation
REAL_SAVE_PERMS = team_scope.save_perms
REAL_SET_SALARY = team_scope.set_team_salary_visible


def directory(monkeypatch, *, manager_id="mgr", name="مدير مباشر"):
    """The directory rows `/me/delegation` reads (who reports to whom)."""
    current_row = canonical._row

    def fake_row(db, sql, **params):
        flat = " ".join(sql.split())
        if "SELECT manager_id FROM public.employee_directory WHERE employee_id=:e" in flat:
            return {"manager_id": manager_id} if manager_id else {}
        if "SELECT name_ar FROM public.employee_directory WHERE employee_id=:m" in flat:
            return {"name_ar": name}
        return current_row(db, sql, **params)

    monkeypatch.setattr(canonical, "_row", fake_row)


def test_delegation_without_a_direct_manager_is_a_conflict(monkeypatch):
    manager_world(monkeypatch)
    directory(monkeypatch, manager_id=None)
    db = RecordingDB()
    with pytest.raises(ApiError) as exc:
        manager.set_delegation({"active": True}, request=None, actor=dict(OTHER_EMP), db=db)
    refused(exc, 409, "no_manager")
    assert db.statements == []


def test_delegation_always_points_at_the_directory_manager(monkeypatch):
    seen = manager_world(monkeypatch)
    directory(monkeypatch, manager_id="mgr", name="مدير مباشر")
    db = RecordingDB()
    answer = manager.set_delegation({"active": True, "manager_id": "emp9"}, request=None,
                                    actor=dict(OTHER_EMP), db=db)
    (upsert,) = db.written("INSERT INTO public.ariba_delegations")
    assert upsert["m"] == "mgr"  # the body cannot choose who receives the delegation
    assert answer == {"active": True}
    assert [(n["who"], n["title"]) for n in seen["notifications"]] == [("mgr", "تفويض من موظف")]
    assert seen["audit"] == [("workflow", "delegation")]
    assert db.commits == 1


def test_delegation_can_be_switched_off(monkeypatch):
    seen = manager_world(monkeypatch)
    directory(monkeypatch)
    db = RecordingDB()
    manager.set_delegation({"active": False}, request=None, actor=dict(MGR), db=db)
    (upsert,) = db.written("INSERT INTO public.ariba_delegations")
    assert upsert["a"] is False and upsert["m"] == "mgr"
    assert [n["title"] for n in seen["notifications"]] == ["إلغاء تفويض"]


def test_delegation_reads_the_manager_and_the_state(monkeypatch):
    manager_world(monkeypatch, delegated=True)
    directory(monkeypatch, manager_id="mgr", name="مدير مباشر")
    answer = manager.my_delegation(actor=dict(EMP1 | {"account_id": uuid.uuid4()}), db=RecordingDB())
    assert answer == {"manager_id": "mgr", "manager_name": "مدير مباشر", "active": True}

    manager_world(monkeypatch)  # nobody delegated anybody
    directory(monkeypatch, manager_id=None)
    assert manager.my_delegation(actor=dict(MGR), db=RecordingDB()) == {
        "manager_id": None, "manager_name": None, "active": False}


# ------------------------------------------------------------------ HR settings
def test_an_employee_cannot_read_or_change_manager_permissions(monkeypatch):
    manager_world(monkeypatch)
    for function in (manager.list_manager_perms, manager.get_team_salary):
        with pytest.raises(ApiError) as exc:
            function(actor=dict(OTHER_EMP), db=RecordingDB())
        refused(exc, 403, "forbidden")
    with pytest.raises(ApiError) as exc:
        manager.set_manager_perms("mgr", {"perms": {"view_team": True}}, request=None,
                                  actor=dict(OTHER_EMP), db=RecordingDB())
    refused(exc, 403, "forbidden")
    with pytest.raises(ApiError) as exc:
        manager.set_team_salary({"visible": True}, request=None, actor=dict(OTHER_EMP), db=RecordingDB())
    refused(exc, 403, "forbidden")


def test_hr_grants_a_single_permission(monkeypatch):
    manager_world(monkeypatch)
    monkeypatch.setattr(team_scope, "save_perms", REAL_SAVE_PERMS)
    db = RecordingDB()
    answer = manager.set_manager_perms("mgr", {"perms": {"view_team_salary": True, "nonsense": True}},
                                       request=None, actor=dict(HR), db=db)
    (upsert,) = db.written("INSERT INTO public.ariba_manager_perms")
    assert upsert["m"] == "mgr" and json.loads(upsert["p"]) == {"view_team_salary": True}
    assert answer["perms"]["view_team_salary"] is True
    assert answer["perms"]["manage_targets"] is True  # untouched keys keep the default
    assert db.commits == 1


def test_hr_put_without_a_known_permission_key_is_refused(monkeypatch):
    manager_world(monkeypatch)
    db = RecordingDB()
    with pytest.raises(ApiError) as exc:
        manager.set_manager_perms("mgr", {"perms": {"anything_else": True}}, request=None,
                                  actor=dict(HR), db=db)
    refused(exc, 422, "invalid_request")
    assert db.statements == []


def test_hr_turns_the_team_salary_on(monkeypatch):
    manager_world(monkeypatch)
    monkeypatch.setattr(team_scope, "set_team_salary_visible", REAL_SET_SALARY)
    db = RecordingDB()
    answer = manager.set_team_salary({"visible": True}, request=None, actor=dict(HR), db=db)
    (upsert,) = db.written("INSERT INTO public.ariba_app_settings")
    assert upsert["k"] == "manager_team_salary" and json.loads(upsert["v"]) == {"visible": True}
    assert answer == {"visible": True} and db.commits == 1


def test_hr_sees_every_manager_with_their_team_and_the_salary_setting(monkeypatch):
    rows = [{"employee_id": "mgr", "name_ar": "مدير مباشر", "job": "مدير إدارة", "team": 3,
             "perms": {"view_team": True, "view_team_requests": False}}]
    manager_world(monkeypatch, rows=rows)
    answer = manager.list_manager_perms(actor=dict(HR), db=RecordingDB())
    (listed,) = answer["managers"]
    assert listed["manager_id"] == "mgr" and listed["team"] == 3 and listed["job"] == "مدير إدارة"
    assert listed["perms"]["view_team"] is True and listed["perms"]["view_team_requests"] is False
    assert listed["perms"]["approve_requests"] is True  # defaults shown to HR too
    assert answer["team_salary_visible"] is False
    assert set(answer["perm_keys"]) == set(team_scope.MANAGER_PERM_KEYS)
    assert answer["default_on"] == sorted(team_scope.MANAGER_PERMS_DEFAULT_ON)


# ------------------------------------------------------------------ the app's own contract
PORT_TS = Path(__file__).resolve().parents[2] / "frontend" / "employee-app" / "src" / "lib" / "port.ts"
CALL = re.compile(r"\b(api|post|put)(?:<[^()]*?>)?\(\s*([\"`])([^\"`]+)\2")
METHOD = {"api": "GET", "post": "POST", "put": "PUT"}
STAGE_PATHS = ("/me/team", "/me/manager-perms", "/me/delegation", "/settings/manager-perms", "/settings/team-salary")


def port_calls() -> set[tuple[str, str]]:
    """The manager/delegation calls `port.ts` makes, `${…}` templates as `{param}`."""
    calls: set[tuple[str, str]] = set()
    for helper, _quote, path in CALL.findall(PORT_TS.read_text(encoding="utf-8")):
        if path.startswith(STAGE_PATHS):
            calls.add((METHOD[helper], re.sub(r"\$\{[^}]*\}", "{param}", path)))
    return calls


def served_calls() -> set[tuple[str, str]]:
    calls: set[tuple[str, str]] = set()
    for route in (*manager.router.routes, *canonical.router.routes):
        path = re.sub(r"\{[^}]*\}", "{param}", route.path)
        if path.startswith(STAGE_PATHS):
            calls |= {(method, path) for method in route.methods}
    return calls


def ts_block(name: str) -> str:
    """The `export type <name> = { … }` body from `port.ts`, braces matched."""
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
    """The field names declared at the top level of a TS object type (nested objects skipped)."""
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


def test_the_manager_routes_the_app_calls_are_the_routes_we_serve():
    expected = {("GET", "/me/manager-perms"), ("GET", "/me/team"), ("GET", "/me/team/requests"),
                ("POST", "/me/team/{param}/requests"), ("GET", "/me/delegation"), ("PUT", "/me/delegation")}
    assert port_calls() == expected          # the app's calls, exactly as port.ts writes them
    assert expected <= served_calls()        # …and every one of them has a route


def test_every_field_the_app_reads_from_a_team_member_is_returned(monkeypatch):
    views = {"emp1": SimpleNamespace(id="emp1"), "emp2": SimpleNamespace(id="emp2")}
    db = FakeDB(perms=ALL_PERMS, setting={"visible": True}, delegation=True)
    team_world(monkeypatch, db, views=views)
    member = team_scope.team_members(db, "mgr")[0]
    fields = set(ts_fields(ts_block("TeamMember")))
    assert fields <= set(member), sorted(fields - set(member))
    assert {"salary_total", "leave_balance", "delegated"} <= fields  # the permission-gated ones too


def test_the_permission_names_the_app_renders_are_the_ones_we_answer(monkeypatch):
    block = ts_block("ManagerPerms")
    assert set(ts_fields(block)) == {"is_manager", "team_count", "perms"}
    named = set(re.findall(r"\"(\w+)\"", block))   # the Record<...> union the screen toggles
    assert named and named <= set(team_scope.MANAGER_PERM_KEYS)
    manager_world(monkeypatch, team=["emp1"], perms=ALL_PERMS)
    answer = manager.my_manager_perms(actor=dict(MGR), db=RecordingDB())
    assert named <= set(answer["perms"])


def test_the_delegation_and_request_fields_the_app_reads_are_returned(monkeypatch):
    manager_world(monkeypatch, delegated=True)
    directory(monkeypatch)
    assert set(ts_fields(ts_block("Delegation"))) <= set(manager.my_delegation(actor=dict(MGR), db=RecordingDB()))

    rows = [{"id": uuid.uuid4(), "employee_id": "emp1", "request_type": "annual", "current_stage": "hr",
             "status": "pending", "payload": {}, "reject_reason": None}]
    manager_world(monkeypatch, perms={"view_team_requests": True}, rows=rows)
    (request,) = manager.my_team_requests(actor=dict(MGR), db=RecordingDB())
    assert set(ts_fields(ts_block("PortRequest"))) <= set(request)
