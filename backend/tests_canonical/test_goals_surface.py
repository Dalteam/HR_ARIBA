"""The goals tab and the team-goals screen: who may see what, who may write, and who signs.

Every case here is a refusal the API has to keep making - docs/BUSINESS_RULES.md T1-T20 (the last one is the bell), plus the
rule the client asked for on top of them (an evaluator who also holds the approver's role still may
not sign their own evaluation) - alongside the positive paths, the two formulas and the contract the
app's own `src/lib/port.ts` pins.

No database is needed: the service and the router run against `ScriptedDB` (which answers each
statement by the SQL it recognises and records everything else), `team_scope` is replaced by the
permission set a test names, and `canonical`'s notification/audit helpers are recorded, so a test
asserts both the exact answer and that nothing was written when it should not have been.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import pytest

from app.core.errors import ApiError
from app.routers import goals as goals_api
from app.services import goals, team_scope

MGR = {"employee_id": "mgr", "account_id": uuid.uuid4(), "role": "employee", "name_ar": "مدير مباشر"}
MGR2 = {"employee_id": "mgr2", "account_id": uuid.uuid4(), "role": "employee", "name_ar": "مدير فريق آخر"}
EMP = {"employee_id": "emp1", "account_id": uuid.uuid4(), "role": "employee", "name_ar": "موظف أول"}
OUT = {"employee_id": "out", "account_id": uuid.uuid4(), "role": "employee", "name_ar": "موظف خارجي"}
HR = {"employee_id": "hr", "account_id": uuid.uuid4(), "role": "hr", "name_ar": "موارد بشرية", "username": "EMP040"}
CEO = {"employee_id": "ceo", "account_id": uuid.uuid4(), "role": "ceo", "name_ar": "الرئيس التنفيذي"}
ALL_PERMS = {key: True for key in team_scope.MANAGER_PERM_KEYS}
NO_PERMS = {key: False for key in team_scope.MANAGER_PERM_KEYS}
EVAL_ID = uuid.uuid4()
TARGET_ID = uuid.uuid4()
NOW = datetime(2026, 3, 1, 9, 0, tzinfo=timezone.utc)
REPORTS = ("emp1",)
#: The two SQL shapes a test distinguishes; the evaluation query contains the targets one, so the
#: needles name the table and never just the period columns.
SQL_EVALUATION = "FROM public.ariba_evaluations WHERE employee_id=:e AND period_type"
SQL_TARGETS_PERIOD = "FROM public.ariba_targets WHERE employee_id=:e AND period_type=:t"
#: The directory answers every write path asks for (does this employee exist, what is their name).
DIRECTORY = {"SELECT employee_id FROM public.employee_directory": {"employee_id": "emp1"},
             "SELECT name_ar FROM public.employee_directory": {"name_ar": "موظف أول"}}


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
    still shows it was attempted (which is how the delegation test proves a table is never read).
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


def target_row(**over):
    row = {"id": TARGET_ID, "employee_id": "emp1", "period_type": "annual", "period_key": "2026",
           "title": "زيادة المبيعات", "description": None, "unit": "ر.س",
           "target_value": Decimal("200"), "actual_value": Decimal("150"), "weight": Decimal("1"),
           "status": "active", "created_by": "mgr", "created_at": NOW, "updated_at": NOW}
    row.update(over)
    return row


def evaluation_row(**over):
    row = {"id": EVAL_ID, "employee_id": "emp1", "period_type": "annual", "period_key": "2026",
           "items": [{"target_id": str(TARGET_ID), "title": "زيادة المبيعات", "target": 200.0,
                      "unit": "ر.س", "actual": 150.0, "weight": 1.0, "score": 75.0,
                      "comment": "جيد", "manual": False}],
           "comments": "ملاحظات المدير", "overall": Decimal("75.0"), "rating": "جيد جداً",
           "status": "pending", "evaluator_id": "mgr", "submitted_at": NOW,
           "approved_by": None, "approved_at": None, "created_at": NOW, "updated_at": NOW}
    row.update(over)
    return row


def world(monkeypatch, *, reports=REPORTS, perms=None, stage="hr", people=("hr",)):
    """`team_scope`, the approver stage and the audit/notification helpers, without a database.

    `reports` is who `mgr` manages; `perms` is the effective permission set `mgr` holds (every other
    manager holds none, which is how the "another team's manager" cases stay refused); `people` is
    the approver stage after `exclude` (the evaluator) is taken off.
    """
    granted = {**NO_PERMS, **dict(ALL_PERMS if perms is None else perms)}
    seen = {"notifications": [], "audit": []}
    monkeypatch.setattr(team_scope, "is_manager_of",
                        lambda _db, manager_id, employee_id: manager_id == "mgr" and employee_id in reports)
    monkeypatch.setattr(team_scope, "effective_perms", lambda _db, _manager_id: dict(granted))
    monkeypatch.setattr(goals, "approver_stage", lambda _db: stage)
    monkeypatch.setattr(goals, "approvers_of",
                        lambda _db, _stage, exclude=None: [p for p in people if p != exclude])
    monkeypatch.setattr(goals_api.canonical, "_insert_notification",
                        lambda _db, who, rid, title, body, stage_, kind: seen["notifications"].append(
                            {"who": who, "title": title, "body": body, "stage": stage_, "kind": kind}))
    monkeypatch.setattr(goals_api.canonical, "_write_audit",
                        lambda _db, actor, request, module, action, *args, **kwargs: seen["audit"].append(
                            (module, action, args, kwargs)))
    return seen


# ---------------------------------------------------------------- the two formulas
def test_overall_is_the_weighted_mean_with_the_app_rounding():
    items = [{"score": 80, "weight": 2}, {"score": 90, "weight": 1}, {"score": 70, "weight": 1}]
    assert goals.overall_of(items) == 80.0                     # (160 + 90 + 70) / 4
    assert goals.overall_of([{"score": 82.25, "weight": 1}]) == 82.3   # Math.round, not Python round()
    assert goals.overall_of([{"score": 90, "weight": 0}]) == 90.0      # 0 weighs like 1
    assert goals.overall_of([{"score": 90, "weight": ""}]) == 90.0
    assert goals.overall_of([]) is None


def test_the_rating_bands_are_the_apps_five():
    assert [goals.rating_of(x) for x in (90, 89.9, 75, 74.9, 60, 59.9, 50, 49.9)] == [
        "ممتاز", "جيد جداً", "جيد جداً", "جيد", "جيد", "مقبول", "مقبول", "ضعيف"]
    assert goals.rating_of(None) is None


# ---------------------------------------------------------------- validation
@pytest.mark.parametrize("kind,key", [("annual", "2026"), ("quarterly", "2026-Q4"),
                                      ("monthly", "2026-12")])
def test_the_three_period_shapes_are_accepted(kind, key):
    assert goals.require_period(kind, key) == (kind, key)


@pytest.mark.parametrize("kind,key", [("annual", "2026-Q1"), ("quarterly", "2026-q1"),
                                      ("quarterly", "2026-01"), ("monthly", "2026-13"),
                                      ("weekly", "2026-W1"), ("annual", "")])
def test_a_key_that_does_not_match_its_period_is_refused(kind, key):
    with pytest.raises(ApiError) as exc:
        goals.require_period(kind, key)
    refused(exc, 422, "invalid_request")

def test_a_target_body_is_cleaned_and_defaulted():
    cleaned = goals.clean_target({"target": {
        "employee_id": "emp1", "period_type": "annual", "period_key": "2026",
        "title": "  زيادة المبيعات  ", "description": "  ", "unit": "ر.س",
        "target_value": "200", "actual_value": None}})
    assert cleaned == {"id": None, "employee_id": "emp1", "period_type": "annual",
                       "period_key": "2026", "title": "زيادة المبيعات", "description": None,
                       "unit": "ر.س", "target_value": 200.0, "actual_value": None,
                       "weight": 1.0, "status": "active"}


@pytest.mark.parametrize("body", [
    {"target": {"employee_id": "emp1", "period_type": "annual", "period_key": "2026", "title": " "}},
    {"target": {"employee_id": "", "period_type": "annual", "period_key": "2026", "title": "x"}},
    {"target": {"employee_id": "emp1", "period_type": "annual", "period_key": "2026", "title": "x",
                "target_value": -1}},
    {"target": {"employee_id": "emp1", "period_type": "annual", "period_key": "2026", "title": "x",
                "weight": 0}},
    {"target": {"employee_id": "emp1", "period_type": "annual", "period_key": "2026", "title": "x",
                "status": "archived"}},
    {"target": {"employee_id": "emp1", "period_type": "weekly", "period_key": "2026", "title": "x"}},
    {"target": {"employee_id": "emp1", "period_type": "annual", "period_key": "2026", "title": "x",
                "target_value": "كثير"}},
    {},
])
def test_a_target_body_that_breaks_a_rule_is_refused(body):
    with pytest.raises(ApiError) as exc:
        goals.clean_target(body)
    refused(exc, 422, "invalid_request")

def test_evaluation_items_are_stored_in_the_shape_the_app_sends():
    (item,) = goals.clean_items([{"target_id": str(TARGET_ID), "title": " زيادة المبيعات ",
                                  "target": "200", "unit": "ر.س", "actual": "150", "weight": "",
                                  "score": "75", "comment": " جيد ", "manual": None}])
    assert item == {"target_id": str(TARGET_ID), "title": "زيادة المبيعات", "target": 200.0,
                    "unit": "ر.س", "actual": 150.0, "weight": 1.0, "score": 75.0,
                    "comment": "جيد", "manual": False}


@pytest.mark.parametrize("items", [[], [{"title": "", "score": 10}], [{"title": "x", "score": 101}],
                                   [{"title": "x", "score": -1}], [{"title": "x"}],
                                   [{"title": "x", "score": "abc"}], "not a list"])
def test_an_item_outside_the_rules_is_refused(items):
    with pytest.raises(ApiError) as exc:
        goals.clean_items(items)
    refused(exc, 422, "invalid_request")


# ---------------------------------------------------------------- the shapes the app reads
def test_the_target_shape_is_exactly_the_apps_target_type():
    out = goals.target_out(target_row())
    assert set(out) == {"id", "employee_id", "period_type", "period_key", "title", "description",
                        "unit", "target_value", "actual_value", "weight", "status"}
    assert out["id"] == str(TARGET_ID) and isinstance(out["target_value"], float)
    assert out["target_value"] == 200.0 and out["actual_value"] == 150.0 and out["weight"] == 1.0

def test_the_evaluation_shape_carries_the_items_and_the_two_stamps():
    out = goals.evaluation_out(evaluation_row())
    assert out["id"] == str(EVAL_ID) and out["overall"] == 75.0 and out["rating"] == "جيد جداً"
    assert out["items"][0]["score"] == 75.0 and out["items"][0]["comment"] == "جيد"
    assert out["submitted_at"].startswith("2026-03-01") and out["approved_at"] is None
    assert {"id", "employee_id", "period_type", "period_key", "items", "comments", "overall",
            "rating", "status"} <= set(out)


def test_an_evaluations_items_come_back_even_when_the_driver_returns_text():
    out = goals.evaluation_out(evaluation_row(items='[{"title": "بند", "score": 60, "weight": 1}]'))
    assert out["items"] == [{"title": "بند", "score": 60, "weight": 1}]
    assert goals.evaluation_out(evaluation_row(items=None))["items"] == []


# ---------------------------------------------------------------- the approver is data
def test_the_approver_stage_comes_from_the_setting_and_ignores_a_typo():
    def stage(value):
        return goals.approver_stage(ScriptedDB({"FROM public.ariba_app_settings": value}))

    assert stage([]) == "hr"                     # no setting at all: HR, the documented default
    assert stage({"value": {"evaluation_approver": "ceo"}}) == "ceo"
    assert stage({"value": {"evaluation_approver": "manager"}}) == "hr"   # a typo invents nothing
    assert stage({"value": "ceo"}) == "hr"      # not an object: ignored, like final_by_type

def test_the_approvers_are_the_stage_rows_plus_the_roles_minus_the_evaluator():
    db = ScriptedDB({"FROM public.workflow_approvers": [{"employee_id": "hr"}],
                     "FROM public.ariba_auth_accounts": [{"employee_id": "admin1"},
                                                          {"employee_id": "hr"}]})
    assert goals.approvers_of(db, "hr") == ["admin1", "hr"]
    assert goals.approvers_of(db, "hr", exclude="hr") == ["admin1"]      # nobody signs their own work
    assert goals.approvers_of(ScriptedDB({"FROM public.workflow_approvers": []}), "ceo") == []


# ---------------------------------------------------------------- who may read and write
def test_a_direct_manager_needs_the_permission_that_matches_the_route(monkeypatch):
    world(monkeypatch, perms={"manage_targets": False, "evaluate_team": True})
    db = ScriptedDB()
    assert goals.can_read_targets(db, dict(MGR), "emp1") is True          # evaluate_team reads targets
    assert goals.can_write_targets(db, dict(MGR), "emp1") is False        # manage_targets writes them
    assert goals.can_write_evaluation(db, dict(MGR), "emp1") is True


def test_own_goals_are_read_only_even_for_a_manager(monkeypatch):
    world(monkeypatch)
    db = ScriptedDB()
    assert goals.can_read_targets(db, dict(MGR), "mgr") is True
    assert goals.can_write_targets(db, dict(MGR), "mgr") is False
    assert goals.evaluation_access(db, dict(MGR), "mgr") is None


def test_hr_administrates_targets_and_since_stage_15_writes_evaluations(monkeypatch):
    world(monkeypatch)
    db = ScriptedDB()
    assert goals.can_read_targets(db, dict(HR), "emp1") is True
    assert goals.can_write_targets(db, dict(HR), "emp1") is True
    assert goals.can_write_evaluation(db, dict(HR), "emp1") is True       # H1 (owner, 4 Nov 2026), replacing P7
    assert goals.can_write_evaluation(db, dict(HR), "hr") is False        # but never their own
    assert goals.evaluation_access(db, dict(HR), "emp1") == "approver"    # the stage is HR here


# ---------------------------------------------------------------- T1: the goals tab
def test_t1_my_goals_returns_own_targets_and_approved_evaluations_only(monkeypatch):
    world(monkeypatch)
    db = ScriptedDB({"FROM public.ariba_targets": [target_row()],
                     "AND status='approved'": [evaluation_row(status="approved", approved_at=NOW)]})
    answer = goals_api.my_goals(actor=dict(EMP), db=db)
    assert set(answer) == {"targets", "evaluations"}
    assert [row["id"] for row in answer["evaluations"]] == [str(EVAL_ID)]
    assert {row["employee_id"] for row in answer["targets"]} == {"emp1"}
    # a draft or a pending row can never appear: every evaluation query pins the status
    assert all("status='approved'" in sql for sql in db.sql_for("FROM public.ariba_evaluations"))
    assert all(params["e"] == "emp1" for sql, params in db.statements)


# ---------------------------------------------------------------- T2-T5: a colleague
def test_t2_an_employee_cannot_read_a_colleagues_targets(monkeypatch):
    world(monkeypatch)
    with pytest.raises(ApiError) as exc:
        goals_api.list_targets(employee_id="emp2", year="2026", actor=dict(EMP), db=ScriptedDB())
    refused(exc, 403, "forbidden")


def test_t3_an_employee_cannot_write_a_colleagues_target(monkeypatch):
    world(monkeypatch)
    body = {"target": {"employee_id": "emp2", "period_type": "annual", "period_key": "2026",
                       "title": "مستهدف زميل"}}
    with pytest.raises(ApiError) as exc:
        goals_api.save_target(body=body, request=None, actor=dict(EMP), db=ScriptedDB())
    refused(exc, 403, "forbidden")


def test_t4_an_employee_deleting_a_colleagues_target_learns_nothing(monkeypatch):
    world(monkeypatch)
    db = ScriptedDB({**DIRECTORY, "SELECT * FROM public.ariba_targets WHERE id=:id": target_row(employee_id="emp2")})
    with pytest.raises(ApiError) as exc:
        goals_api.delete_target(target_id=str(TARGET_ID), request=None, actor=dict(EMP), db=db)
    refused(exc, 404, "not_found")
    assert not db.sql_for("DELETE FROM public.ariba_targets")

def test_t5_an_employee_cannot_read_or_write_a_colleagues_evaluation(monkeypatch):
    world(monkeypatch)
    db = ScriptedDB({SQL_EVALUATION: evaluation_row(employee_id="emp2")})
    with pytest.raises(ApiError) as read:
        goals_api.read_evaluation(request=None, employee_id="emp2", period_type="annual", period_key="2026",
                                  actor=dict(EMP), db=db)
    refused(read, 403, "forbidden")
    with pytest.raises(ApiError) as write:
        goals_api.save_evaluation(employee_id="emp2", period_type="annual", period_key="2026",
                                  body={"items": [{"title": "بند", "score": 50}], "submit": True},
                                  request=None, actor=dict(EMP), db=db)
    refused(write, 403, "forbidden")
    assert not db.sql_for("INSERT INTO public.ariba_evaluations")


def test_t6_an_employee_cannot_approve_their_own_evaluation(monkeypatch):
    world(monkeypatch)
    db = ScriptedDB({"SELECT * FROM public.ariba_evaluations WHERE id=:id": evaluation_row(evaluator_id="mgr")})
    with pytest.raises(ApiError) as exc:
        goals_api.approve_evaluation(evaluation_id=str(EVAL_ID), request=None, actor=dict(EMP), db=db)
    refused(exc, 403, "forbidden")
    assert not db.sql_for("UPDATE public.ariba_evaluations")


def test_t7_own_evaluation_is_not_on_this_route_even_when_approved(monkeypatch):
    world(monkeypatch)
    db = ScriptedDB({SQL_EVALUATION:
                     evaluation_row(status="approved", approved_at=NOW)})
    with pytest.raises(ApiError) as exc:
        goals_api.read_evaluation(request=None, employee_id="emp1", period_type="annual", period_key="2026",
                                  actor=dict(EMP), db=db)
    refused(exc, 403, "forbidden")          # own data is /me/goals, and that is the only door


# ---------------------------------------------------------------- T8-T10: another team
def test_t8_t9_t10_another_teams_manager_is_refused_everywhere(monkeypatch):
    world(monkeypatch, reports=("emp1",))
    db = ScriptedDB({**DIRECTORY, "SELECT * FROM public.ariba_targets WHERE id=:id": target_row(),
                     "SELECT * FROM public.ariba_evaluations WHERE id=:id": evaluation_row()})
    with pytest.raises(ApiError) as read_targets:
        goals_api.list_targets(employee_id="emp1", year="2026", actor=dict(MGR2), db=db)
    refused(read_targets, 403, "forbidden")
    with pytest.raises(ApiError) as delete:
        goals_api.delete_target(target_id=str(TARGET_ID), request=None, actor=dict(MGR2), db=db)
    refused(delete, 404, "not_found")
    with pytest.raises(ApiError) as approve:
        goals_api.approve_evaluation(evaluation_id=str(EVAL_ID), request=None, actor=dict(MGR2), db=db)
    refused(approve, 404, "not_found")


# ---------------------------------------------------------------- T11-T12: no permission
def test_t11_a_manager_without_manage_targets_cannot_write_one(monkeypatch):
    world(monkeypatch, perms={"manage_targets": False})
    body = {"target": {"employee_id": "emp1", "period_type": "annual", "period_key": "2026",
                       "title": "مستهدف"}}
    db = ScriptedDB()
    with pytest.raises(ApiError) as exc:
        goals_api.save_target(body=body, request=None, actor=dict(MGR), db=db)
    refused(exc, 403, "forbidden")
    assert not db.sql_for("INSERT INTO public.ariba_targets")


def test_t12_a_manager_without_evaluate_team_cannot_write_an_evaluation(monkeypatch):
    world(monkeypatch, perms={"evaluate_team": False})
    db = ScriptedDB()
    with pytest.raises(ApiError) as exc:
        goals_api.save_evaluation(employee_id="emp1", period_type="annual", period_key="2026",
                                  body={"items": [{"title": "بند", "score": 40}]}, request=None,
                                  actor=dict(MGR), db=db)
    refused(exc, 403, "forbidden")
    assert not db.sql_for("INSERT INTO public.ariba_evaluations")

# ---------------------------------------------------------------- T13-T14: nothing else opens a door
def test_t13_delegation_is_not_a_key_and_the_table_is_never_read(monkeypatch):
    """A delegating report's manager gets exactly the same answers; no route touches the table."""
    world(monkeypatch, reports=("emp1",))
    db = ScriptedDB({**DIRECTORY, "SELECT * FROM public.ariba_targets WHERE id=:id": target_row(),
                     "SELECT * FROM public.ariba_evaluations WHERE id=:id": evaluation_row()})
    with pytest.raises(ApiError) as targets:
        goals_api.list_targets(employee_id="emp1", year=None, actor=dict(MGR2), db=db)
    refused(targets, 403, "forbidden")
    with pytest.raises(ApiError) as approve:
        goals_api.approve_evaluation(evaluation_id=str(EVAL_ID), request=None, actor=dict(MGR2), db=db)
    refused(approve, 404, "not_found")
    assert not any("ariba_delegations" in sql for sql, _params in db.statements)


def test_t14_an_outsider_reaches_nothing_and_writes_nothing(monkeypatch):
    world(monkeypatch, reports=("emp1",))
    db = ScriptedDB({**DIRECTORY, "SELECT * FROM public.ariba_targets WHERE id=:id": target_row(),
                     SQL_EVALUATION: evaluation_row(),
                     "SELECT * FROM public.ariba_evaluations WHERE id=:id": evaluation_row()})
    calls = (
        lambda: goals_api.list_targets(employee_id="emp1", year="2026", actor=dict(OUT), db=db),
        lambda: goals_api.save_target(body={"target": {"employee_id": "emp1", "period_type":
                                              "annual", "period_key": "2026", "title": "x"}},
                                      request=None, actor=dict(OUT), db=db),
        lambda: goals_api.delete_target(target_id=str(TARGET_ID), request=None, actor=dict(OUT), db=db),
        lambda: goals_api.read_evaluation(request=None, employee_id="emp1", period_type="annual",
                                          period_key="2026", actor=dict(OUT), db=db),
        lambda: goals_api.save_evaluation(employee_id="emp1", period_type="annual", period_key="2026",
                                          body={"items": [{"title": "بند", "score": 10}]},
                                          request=None, actor=dict(OUT), db=db),
        lambda: goals_api.approve_evaluation(evaluation_id=str(EVAL_ID), request=None,
                                             actor=dict(OUT), db=db),
    )
    for call in calls:
        with pytest.raises(ApiError) as exc:
            call()
        assert exc.value.status in (403, 404), exc.value.message
    assert not db.sql_for("INSERT INTO public.ariba_targets")
    assert not db.sql_for("DELETE FROM public.ariba_targets")
    assert not db.sql_for("INSERT INTO public.ariba_evaluations")
    assert not db.sql_for("UPDATE public.ariba_evaluations")


# ---------------------------------------------------------------- T15-T18: the signature
def test_t15_hr_cannot_sign_when_the_stage_is_the_ceo(monkeypatch):
    world(monkeypatch, stage="ceo", people=("ceo",))
    db = ScriptedDB({"SELECT * FROM public.ariba_evaluations WHERE id=:id": evaluation_row()})
    with pytest.raises(ApiError) as exc:
        goals_api.approve_evaluation(evaluation_id=str(EVAL_ID), request=None, actor=dict(HR), db=db)
    refused(exc, 403, "forbidden")
    assert not db.sql_for("UPDATE public.ariba_evaluations")


def test_t16_an_approver_never_sees_a_draft(monkeypatch):
    world(monkeypatch, stage="ceo", people=("ceo",))
    db = ScriptedDB({SQL_EVALUATION: evaluation_row(status="draft",
                                                                            submitted_at=None)})
    with pytest.raises(ApiError) as exc:
        goals_api.read_evaluation(request=None, employee_id="emp1", period_type="annual", period_key="2026",
                                  actor=dict(CEO), db=db)
    refused(exc, 404, "not_found")


def test_h2_hr_reads_the_draft_of_the_period_it_may_write(monkeypatch):
    """Stage 15: HR writes evaluations, so it sees the period's draft or pending row before writing over it."""
    world(monkeypatch, stage="hr", people=("hr", "admin1"))
    db = ScriptedDB({SQL_EVALUATION: evaluation_row(status="draft", submitted_at=None)})
    answer = goals_api.read_evaluation(request=None, employee_id="emp1", period_type="annual", period_key="2026",
                                       actor={"employee_id": "admin1", "role": "admin"}, db=db)
    assert answer["evaluation"]["status"] == "draft" and answer["can_write"] is True


def test_t17_a_stage_that_resolves_to_nobody_refuses_instead_of_guessing(monkeypatch):
    world(monkeypatch, stage="hr", people=())
    db = ScriptedDB({"SELECT * FROM public.ariba_evaluations WHERE id=:id": evaluation_row()})
    with pytest.raises(ApiError) as exc:
        goals_api.approve_evaluation(evaluation_id=str(EVAL_ID), request=None, actor=dict(HR), db=db)
    refused(exc, 409, "no_approver")


def test_t18_an_approved_evaluation_is_final(monkeypatch):
    world(monkeypatch)
    db = ScriptedDB({SQL_EVALUATION: evaluation_row(status="approved",
                                                                           approved_at=NOW)})
    with pytest.raises(ApiError) as exc:
        goals_api.save_evaluation(employee_id="emp1", period_type="annual", period_key="2026",
                                  body={"items": [{"title": "بند", "score": 40}]}, request=None,
                                  actor=dict(MGR), db=db)
    refused(exc, 409, "locked")
    assert not db.sql_for("INSERT INTO public.ariba_evaluations")


# ---------------------------------------------------------------- T19: nobody signs their own work
def test_t19_the_evaluator_is_not_an_approver_of_their_own_evaluation():
    db = ScriptedDB({"FROM public.workflow_approvers": [{"employee_id": "hr"},
                                                        {"employee_id": "mgr"}],
                     "FROM public.ariba_auth_accounts": [],
                     "FROM public.ariba_app_settings": {"value": {"evaluation_approver": "hr"}}})
    manager_with_the_hr_role = {"employee_id": "mgr", "role": "hr"}
    row = evaluation_row(evaluator_id="mgr")
    assert goals.approvers_of(db, "hr", exclude="mgr") == ["hr"]        # the evaluator is taken off
    assert goals.may_approve(db, manager_with_the_hr_role, row) is False
    assert goals.may_approve(db, {"employee_id": "hr", "role": "hr"}, row) is True


def test_t19_an_evaluator_holding_the_approver_role_cannot_approve_on_the_route(monkeypatch):
    world(monkeypatch, stage="hr", people=("hr", "mgr"))
    db = ScriptedDB({"SELECT * FROM public.ariba_evaluations WHERE id=:id": evaluation_row(evaluator_id="mgr")})
    with pytest.raises(ApiError) as exc:
        goals_api.approve_evaluation(evaluation_id=str(EVAL_ID), request=None, actor=dict(MGR), db=db)
    refused(exc, 403, "forbidden")
    assert not db.sql_for("UPDATE public.ariba_evaluations")


def test_t19_the_app_is_told_can_approve_is_false_for_the_evaluator(monkeypatch):
    world(monkeypatch, stage="hr", people=("hr", "mgr"))
    # the period query is the more specific needle, so it is answered first
    db = ScriptedDB({SQL_TARGETS_PERIOD: [target_row()],
                     SQL_EVALUATION: evaluation_row(evaluator_id="mgr")})
    answer = goals_api.read_evaluation(request=None, employee_id="emp1", period_type="annual", period_key="2026",
                                       actor=dict(MGR), db=db)
    assert answer["evaluation"]["status"] == "pending"
    assert answer["can_approve"] is False      # the screen would hide its approve button


# ---------------------------------------------------------------- the positive paths
def test_the_evaluator_reads_their_draft_with_the_targets_the_form_scores(monkeypatch):
    world(monkeypatch)
    db = ScriptedDB({SQL_TARGETS_PERIOD: [target_row()],
                     SQL_EVALUATION: evaluation_row()})
    answer = goals_api.read_evaluation(request=None, employee_id="emp1", period_type="annual", period_key="2026",
                                       actor=dict(MGR), db=db)
    assert set(answer) == {"evaluation", "targets", "can_approve", "can_write"}
    assert answer["targets"][0]["id"] == str(TARGET_ID)      # the form seeds its items from these
    assert answer["evaluation"]["id"] == str(EVAL_ID)
    assert answer["can_approve"] is False                    # the evaluator is not the approver


def test_reading_someone_elses_evaluation_is_audited_without_its_content(monkeypatch):
    seen = world(monkeypatch, stage="ceo", people=("ceo",))
    db = ScriptedDB({SQL_TARGETS_PERIOD: [target_row()], SQL_EVALUATION: evaluation_row()})
    goals_api.read_evaluation(request=None, employee_id="emp1", period_type="annual",
                              period_key="2026", actor=dict(CEO), db=db)
    (module, action, args, kwargs) = seen["audit"][0]
    assert (module, action) == ("goals", "evaluation_read")
    assert args == ("employee", "emp1")                     # who wrote it, about whom
    assert kwargs["details"] == {"evaluation_id": str(EVAL_ID), "period_type": "annual",
                                 "period_key": "2026"}      # the ids, never the content
    assert db.commits == 1


def test_the_evaluators_own_read_is_not_logged_again(monkeypatch):
    seen = world(monkeypatch)
    db = ScriptedDB({SQL_TARGETS_PERIOD: [target_row()], SQL_EVALUATION: evaluation_row()})
    goals_api.read_evaluation(request=None, employee_id="emp1", period_type="annual",
                              period_key="2026", actor=dict(MGR), db=db)
    assert seen["audit"] == [] and db.commits == 0

def test_an_approver_outside_hr_gets_the_evaluation_without_the_targets(monkeypatch):
    world(monkeypatch, stage="ceo", people=("ceo",))
    db = ScriptedDB({SQL_TARGETS_PERIOD: [target_row()], SQL_EVALUATION: evaluation_row()})
    answer = goals_api.read_evaluation(request=None, employee_id="emp1", period_type="annual", period_key="2026",
                                       actor=dict(CEO), db=db)
    assert answer["targets"] == []          # a report's targets stay the manager's business
    assert answer["can_approve"] is True


# ---------------------------------------------------------------- targets: the writes
def target_body(**over):
    body = {"target": {"employee_id": "emp1", "period_type": "annual", "period_key": "2026",
                       "title": "زيادة المبيعات", "unit": "ر.س", "target_value": 200,
                       "actual_value": 0, "weight": 1, "status": "active"}}
    body["target"].update(over)
    return body


def test_a_manager_adds_a_target_and_the_employee_hears_about_it(monkeypatch):
    seen = world(monkeypatch)
    db = ScriptedDB({"SELECT employee_id FROM public.employee_directory": {"employee_id": "emp1"},
                     "INSERT INTO public.ariba_targets": target_row()})
    answer = goals_api.save_target(body=target_body(), request=None, actor=dict(MGR), db=db)
    assert set(answer) == {"target"} and answer["target"]["id"] == str(TARGET_ID)
    assert [(n["who"], n["title"]) for n in seen["notifications"]] == [
        ("emp1", "أضاف مديرك مستهدفاً")]
    assert [entry[1] for entry in seen["audit"]] == ["target_create"]
    assert db.commits == 1
    insert = db.sql_for("INSERT INTO public.ariba_targets")[0]
    assert "created_by" in insert          # who wrote it is kept


def test_editing_a_target_is_audited_but_does_not_ring_the_bell_again(monkeypatch):
    seen = world(monkeypatch)
    db = ScriptedDB({**DIRECTORY, "SELECT * FROM public.ariba_targets WHERE id=:id": target_row(),
                     "UPDATE public.ariba_targets": target_row(actual_value=Decimal("180"))})
    answer = goals_api.save_target(body=target_body(id=str(TARGET_ID), actual_value=180),
                                   request=None, actor=dict(MGR), db=db)
    assert answer["target"]["actual_value"] == 180.0
    assert seen["notifications"] == []
    assert [entry[1] for entry in seen["audit"]] == ["target_update"]


def test_a_target_cannot_be_moved_to_another_period(monkeypatch):
    world(monkeypatch)
    db = ScriptedDB({**DIRECTORY, "SELECT * FROM public.ariba_targets WHERE id=:id": target_row()})
    with pytest.raises(ApiError) as exc:
        goals_api.save_target(body=target_body(id=str(TARGET_ID), period_type="monthly",
                                               period_key="2026-03"),
                              request=None, actor=dict(MGR), db=db)
    refused(exc, 422, "invalid_request")
    assert not db.sql_for("UPDATE public.ariba_targets")

def test_deleting_a_target_tells_the_employee_and_is_audited(monkeypatch):
    seen = world(monkeypatch)
    db = ScriptedDB({**DIRECTORY, "SELECT * FROM public.ariba_targets WHERE id=:id": target_row(),
                     "DELETE FROM public.ariba_targets": []})
    answer = goals_api.delete_target(target_id=str(TARGET_ID), request=None, actor=dict(MGR), db=db)
    assert answer == {"ok": True}
    assert [(n["who"], n["title"]) for n in seen["notifications"]] == [
        ("emp1", "حذف مديرك مستهدفاً")]
    assert [entry[1] for entry in seen["audit"]] == ["target_delete"]
    assert db.commits == 1


def test_deleting_something_that_does_not_exist_is_a_plain_404(monkeypatch):
    seen = world(monkeypatch)
    db = ScriptedDB()
    with pytest.raises(ApiError) as exc:
        goals_api.delete_target(target_id="not-a-uuid", request=None, actor=dict(MGR), db=db)
    refused(exc, 404, "not_found")
    assert db.statements == []          # a made-up id never reaches the database
    assert seen["audit"] == []


# ---------------------------------------------------------------- evaluations: the writes
def item(**over):
    row = {"target_id": str(TARGET_ID), "title": "زيادة المبيعات", "target": 200, "unit": "ر.س",
           "actual": 150, "weight": 1, "score": 75, "comment": "جيد"}
    row.update(over)
    return row

def test_submitting_an_evaluation_tells_the_approvers_and_never_the_employee(monkeypatch):
    seen = world(monkeypatch, stage="hr", people=("hr", "admin1"))
    db = ScriptedDB({**DIRECTORY, SQL_EVALUATION: evaluation_row(status="draft", submitted_at=None),
                     "INSERT INTO public.ariba_evaluations": evaluation_row()})
    answer = goals_api.save_evaluation(employee_id="emp1", period_type="annual", period_key="2026",
                                       body={"items": [item()], "comments": "ملاحظات",
                                             "submit": True},
                                       request=None, actor=dict(MGR), db=db)
    assert answer["evaluation"]["status"] == "pending"
    assert answer["evaluation"]["overall"] == 75.0 and answer["evaluation"]["rating"] == "جيد جداً"
    # P1: a bell entry for the employee here would announce a pending evaluation that /me/goals
    # hides, so a submit tells the people who may sign and nobody else.
    assert [(n["who"], n["title"]) for n in seen["notifications"]] == [
        ("hr", "تقييم بانتظار اعتمادك"), ("admin1", "تقييم بانتظار اعتمادك")]
    assert "emp1" not in {n["who"] for n in seen["notifications"]}
    assert [entry[1] for entry in seen["audit"]] == ["evaluation_submit"]
    written = next(params for sql, params in db.statements
                   if "INSERT INTO public.ariba_evaluations" in sql)
    assert written["status"] == "pending" and written["by"] == "mgr"
    assert written["overall"] == 75.0 and written["rating"] == "جيد جداً"
    assert "زيادة المبيعات" in written["items"]         # the items are stored as the app sent them


def test_a_pending_evaluation_is_absent_from_the_employees_bell_and_goals_tab(monkeypatch):
    """P1 end to end: the manager submits, and nothing on the employee's side says the row exists."""
    seen = world(monkeypatch, stage="hr", people=("hr",))
    db = ScriptedDB({**DIRECTORY, SQL_EVALUATION: evaluation_row(status="draft", submitted_at=None),
                     "INSERT INTO public.ariba_evaluations": evaluation_row(),
                     "FROM public.ariba_targets": [target_row()],
                     "AND status='approved'": []})
    goals_api.save_evaluation(employee_id="emp1", period_type="annual", period_key="2026",
                              body={"items": [item()], "submit": True},
                              request=None, actor=dict(MGR), db=db)
    written = next(params for sql, params in db.statements
                   if "INSERT INTO public.ariba_evaluations" in sql)
    assert written["status"] == "pending"            # the row is really there, waiting
    assert [n["who"] for n in seen["notifications"]] == ["hr"]   # the approver, never the employee
    answer = goals_api.my_goals(actor=dict(EMP), db=db)
    assert answer["evaluations"] == []               # ... and the tab shows nothing of it
    assert [row["title"] for row in answer["targets"]] == ["زيادة المبيعات"]
    # not a filter in Python: the query my_goals just ran can only ever return an approved row
    # (the evaluator's own lookup above is a different statement, keyed by the period)
    assert "status='approved'" in db.sql_for("FROM public.ariba_evaluations")[-1]


def test_saving_a_draft_tells_nobody_and_stays_mine(monkeypatch):
    seen = world(monkeypatch)
    db = ScriptedDB({**DIRECTORY, SQL_EVALUATION: [],
                     "INSERT INTO public.ariba_evaluations": evaluation_row(status="draft",
                                                                           submitted_at=None)})
    answer = goals_api.save_evaluation(employee_id="emp1", period_type="annual", period_key="2026",
                                       body={"items": [item(score=60)], "submit": False},
                                       request=None, actor=dict(MGR), db=db)
    assert answer["evaluation"]["status"] == "draft"
    assert seen["notifications"] == []
    assert [entry[1] for entry in seen["audit"]] == ["evaluation_draft"]

def test_the_approver_signs_and_both_people_hear_the_result(monkeypatch):
    seen = world(monkeypatch, stage="hr", people=("hr",))
    db = ScriptedDB({**DIRECTORY,
                     "SELECT * FROM public.ariba_evaluations WHERE id=:id": evaluation_row(),
                     "UPDATE public.ariba_evaluations": evaluation_row(status="approved",
                                                                      approved_by="hr",
                                                                      approved_at=NOW)})
    answer = goals_api.approve_evaluation(evaluation_id=str(EVAL_ID), request=None, actor=dict(HR), db=db)
    assert answer == {"ok": True}
    assert [n["title"] for n in seen["notifications"]] == ["اعتُمد تقييمك",
                                                           "اعتُمد التقييم الذي أرسلته"]
    assert seen["notifications"][0]["body"] == "سنة 2026: 75% - جيد جداً"
    assert seen["notifications"][0]["kind"] == "goals"
    assert [entry[1] for entry in seen["audit"]] == ["evaluation_approve"]
    assert db.commits == 1
    assert "status='pending'" in db.sql_for("UPDATE public.ariba_evaluations")[0]   # race-safe


def test_approving_a_draft_is_refused_before_anything_is_written(monkeypatch):
    world(monkeypatch, stage="hr", people=("hr",))
    db = ScriptedDB({"SELECT * FROM public.ariba_evaluations WHERE id=:id":
                     evaluation_row(status="draft", submitted_at=None)})
    with pytest.raises(ApiError) as exc:
        goals_api.approve_evaluation(evaluation_id=str(EVAL_ID), request=None, actor=dict(HR), db=db)
    refused(exc, 409, "not_pending")
    assert not db.sql_for("UPDATE public.ariba_evaluations")


def test_approving_twice_is_a_locked_refusal(monkeypatch):
    world(monkeypatch, stage="hr", people=("hr",))
    db = ScriptedDB({"SELECT * FROM public.ariba_evaluations WHERE id=:id":
                     evaluation_row(status="approved", approved_at=NOW)})
    with pytest.raises(ApiError) as exc:
        goals_api.approve_evaluation(evaluation_id=str(EVAL_ID), request=None, actor=dict(HR), db=db)
    refused(exc, 409, "locked")


# ---------------------------------------------------------------- the app's own contract
PORT_TS = Path(__file__).resolve().parents[2] / "frontend" / "employee-app" / "src" / "lib" / "port.ts"
QUOTE_CHARS = "\"'" + chr(96)          # the two delimiters a port.ts path can sit between
CALL = re.compile(r"\b(api|post|put)(?:<[^>]*>)?\(\s*[" + QUOTE_CHARS + r"]?(/[^" + QUOTE_CHARS + r"]*)")
METHOD = {"api": "GET", "post": "POST", "put": "PUT"}
GOALS_PATHS = ("/me/goals", "/targets", "/evaluations")


def port_calls() -> set[tuple[str, str]]:
    """The goals calls port.ts makes, with the ${...} templates as {param}.

    Two things a plain helper->verb mapping would miss: `deleteTarget` is a DELETE written through
    the `api()` helper with a `method` option, and `goals.targets()` carries its query string in the
    template, so the query is dropped before the comparably-shaped route is looked up.
    """
    source = PORT_TS.read_text(encoding="utf-8")
    calls: set[tuple[str, str]] = set()
    for match in CALL.finditer(source):
        helper, path = match.group(1), match.group(2)
        if not path.startswith(GOALS_PATHS):
            continue
        method = METHOD[helper]
        if method == "GET" and re.search(r'method:\s*"DELETE"', source[match.end():match.end() + 120]):
            method = "DELETE"
        plain = path.split("?")[0]
        calls.add((method, re.sub(r"\$\{[^}]*\}", "{param}", plain)))
    return calls


def served_calls() -> set[tuple[str, str]]:
    calls: set[tuple[str, str]] = set()
    for route in goals_api.router.routes:
        path = re.sub(r"\{[^}]*\}", "{param}", route.path)
        if path.startswith(GOALS_PATHS):
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


def test_the_goals_routes_the_app_calls_are_the_routes_we_serve():
    expected = {("GET", "/me/goals"), ("GET", "/targets"), ("POST", "/targets"),
                ("DELETE", "/targets/{param}"),
                ("GET", "/evaluations/{param}/{param}/{param}"),
                ("PUT", "/evaluations/{param}/{param}/{param}"),
                ("POST", "/evaluations/{param}/approve")}
    assert port_calls() == expected          # the calls the app makes, exactly as port.ts writes them
    assert expected <= served_calls()        # ...and every one of them has a route


def test_every_field_the_app_reads_from_a_target_and_an_evaluation_is_returned():
    target_fields = set(ts_fields(ts_block("Target")))
    returned_target = set(goals.target_out(target_row()))
    assert target_fields <= returned_target, sorted(target_fields - returned_target)
    evaluation_fields = set(ts_fields(ts_block("Evaluation")))
    returned_evaluation = set(goals.evaluation_out(evaluation_row()))
    assert evaluation_fields <= returned_evaluation, sorted(evaluation_fields - returned_evaluation)
    assert {"items", "overall", "rating", "status"} <= evaluation_fields


def test_the_item_fields_the_screen_sends_are_the_ones_we_store():
    sent = {"target_id": str(TARGET_ID), "title": "بند", "target": 200, "unit": "ر.س",
            "actual": 150, "weight": 1, "score": 50, "comment": "", "manual": True}
    stored = goals.clean_items([sent])[0]
    assert set(ts_fields(ts_block("EvalItem"))) <= set(stored)
