"""Parity with the legacy system (the reference for every rule and figure).

Part 1 — golden values produced by the legacy HTML's own functions (tools/legacy-parity, `npm run fixtures`),
synthetic inputs only: contract end (addMonthsSafe) and the V130 GOSI exemption (kindOf).

Part 2 — the legacy Supabase SQL functions themselves (tools/legacy-parity/sql, schema + functions, no data) loaded
in a throw-away local database with synthetic rows, run side by side with ours: point in polygon, punch location /
remote rule, late and early minutes, the employee-app leave balance (ariba_leave_calc) and the notifications of a new
request (ariba_submit_request). Needs a local Postgres that may create databases:
    LEGACY_PARITY_PG='postgresql:///postgres?host=/tmp' .venv/bin/python -m pytest -q
"""
from __future__ import annotations

import json
import os
import random
import uuid
from datetime import date, time, timedelta
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.enums import WpsType
from app.routers import canonical as c
from app.services import canonical_data as cdata
from app.services.contracts import fixed_term_end
from app.services.gosi import exempt_kind

FIXTURES = Path(__file__).parent / "fixtures"
SQL = Path(__file__).resolve().parents[2] / "tools" / "legacy-parity" / "sql"


# --------------------------------------------------------------------------- part 1: legacy HTML golden values
def test_contract_end_matches_legacy_add_months_safe():
    rows = json.loads((FIXTURES / "legacy_add_months_safe.json").read_text(encoding="utf-8"))
    bad = [(s, n, want) for s, n, want in rows if fixed_term_end(date.fromisoformat(s), n).isoformat() != want]
    assert not bad, f"{len(bad)}/{len(rows)} differ, e.g. {bad[:3]}"


def test_contract_end_on_save_follows_sEmp():
    fixed = {"contractNature": "fixed", "contractJoin": "2025-03-10", "contractDuration": "24"}
    c._contract_end(fixed)
    assert fixed["contractEnd"] == fixed["ce"] == "2027-03-09"
    open_ended = {"contractNature": "indefinite", "contractJoin": "2025-03-10", "contractDuration": 24}
    c._contract_end(open_ended)
    assert open_ended["contractDuration"] == 0 and "contractEnd" not in open_ended


def test_gosi_exemption_matches_legacy_kind_of():
    rows = json.loads((FIXTURES / "legacy_ins_kind.json").read_text(encoding="utf-8"))
    bad = []
    for wps, job, dep, emp, typ, cat, want in rows:
        got = exempt_kind(wps_type=WpsType(wps), job_title=job, department=dep, workplace=emp, emp_type=typ, excel_category=cat)
        if got != want:
            bad.append((wps, job, dep, emp, typ, cat, want, got))
    assert not bad, f"{len(bad)}/{len(rows)} differ, e.g. {bad[:3]}"


def test_reactivate_if_renewed_only_after_automatic_end():
    future = (date.today() + timedelta(days=200)).isoformat()
    auto = {"isTerminated": True, "terminationReason": "انتهاء مدة العقد", "lastDay": "2026-01-31", "contractEnd": future}
    assert c._reactivate_if_renewed(auto, False) and auto["isTerminated"] is False and auto["lastDay"] == ""
    resigned = {"isTerminated": True, "terminationReason": "استقالة", "lastDay": "2026-01-31", "contractEnd": future}
    assert not c._reactivate_if_renewed(resigned, False) and resigned["isTerminated"] is True
    expired = {"isTerminated": True, "terminationReason": "انتهاء العقد", "lastDay": "2026-01-31", "contractEnd": "2026-01-31"}
    assert not c._reactivate_if_renewed(expired, False)


def test_round_half_up_is_postgres_numeric_rounding():
    assert [c._round_half_up(x) for x in (0.4, 0.5, 1.5, 2.5, 2.49, -0.5)] == [0, 1, 2, 3, 2, -1]


# --------------------------------------------------------------------------- part 2: legacy SQL functions
# This fixture is intentionally pre-normalization: its SQL routines reference old columns such as
# attendance.emp_id/location_name, workflow_requests manager/approver fields, and leave approval flags.
# parity_bridge.sql only *adds* the normalized references our code reads (employer/department/job title ids,
# attendance.employee_id, workflow_approvers, company_settings.shift_duration_minutes) and derives them from the
# legacy columns, so the legacy functions stay untouched and both implementations run side by side.
# Where the normalization replaced a column with a derivation (workflow_requests.status, the leave approval flags,
# is_read, the hr_override_* action labels, attendance.location_name) the comparisons read the normalized form.
_LEGACY_FUNCS = ("ariba_point_in_polygon", "ariba_employee_location_ids", "ariba_punch_late", "ariba_punch_early",
                 "ariba_attendance", "ariba_leave_calc", "ariba_submit_request", "ariba_apply_forgot_punch", "ariba_workflow_action",
                 "ariba_can", "ariba_hr_override_workflow", "ariba_hr_final_approve", "ariba_delete_request")


@pytest.fixture(scope="module")
def legacy_db():
    dsn = os.environ.get("LEGACY_PARITY_PG")
    if not dsn:
        pytest.skip("set LEGACY_PARITY_PG to a local Postgres that may create databases")
    name = f"ariba_parity_{uuid.uuid4().hex[:8]}"
    admin = create_engine(make_url(dsn).set(drivername="postgresql+psycopg"), isolation_level="AUTOCOMMIT")
    with admin.connect() as cx:
        cx.execute(text(f'CREATE DATABASE "{name}"'))
    eng = create_engine(make_url(dsn).set(drivername="postgresql+psycopg", database=name))
    try:
        with eng.begin() as cx:
            raw = cx.connection.dbapi_connection
            with raw.cursor() as cur:
                cur.execute((SQL / "schema.sql").read_text())
                # keys the schema-only dump leaves out and the code relies on
                cur.execute("CREATE UNIQUE INDEX ON public.leave_requests(workflow_request_id);"
                            "ALTER TABLE public.ariba_audit_log ALTER id ADD GENERATED BY DEFAULT AS IDENTITY;"
                            "CREATE TABLE public.parity_sessions(token uuid PRIMARY KEY, account_id uuid, employee_id text, role text);"
                            "CREATE FUNCTION public.ariba_session_row(p_token uuid) RETURNS TABLE(account_id uuid, employee_id text, role text)"
                            " LANGUAGE sql AS $$ SELECT account_id, employee_id, role FROM public.parity_sessions WHERE token=p_token $$;")
                # The bridge that lets our code (which reads the normalized references) run on this pre-normalization
                # fixture: the legacy text columns stay authoritative, the normalized ids/rows are derived from them.
                cur.execute((SQL / "parity_bridge.sql").read_text())
                for f in _LEGACY_FUNCS:
                    cur.execute((SQL / f"{f}.sql").read_text())
        yield eng
    finally:
        eng.dispose()
        with admin.connect() as cx:
            cx.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        admin.dispose()


@pytest.fixture
def db(legacy_db):
    """A session whose work (commits included) is rolled back after the test."""
    cx = legacy_db.connect()
    outer = cx.begin()
    s = Session(bind=cx, join_transaction_mode="create_savepoint")
    try:
        yield s
    finally:
        s.close()
        outer.rollback()
        cx.close()


def _exec(db: Session, sql: str, **kw: Any) -> None:
    db.execute(text(sql), kw)


def _employee(db: Session, eid: str, *, manager: str | None = None, join: date = date(2022, 1, 1), data: dict | None = None,
              employer: str = "اريبا") -> None:
    _exec(db, """INSERT INTO public.employee_directory(employee_id,username,name_ar,employer,join_date,manager_id,active,data)
        VALUES(:e,:u,:n,:er,:j,:m,true,CAST(:d AS jsonb))""", e=eid, u=f"EMP{eid}", n=f"موظف {eid}", er=employer, j=join, m=manager,
          d=json.dumps(data or {}, ensure_ascii=False))


def _session(db: Session, eid: str, role: str = "employee") -> uuid.UUID:
    tok = uuid.uuid4()
    _exec(db, "INSERT INTO public.parity_sessions VALUES(:t,:a,:e,:r)", t=tok, a=uuid.uuid4(), e=eid, r=role)
    return tok


def _account(db: Session, eid: str, role: str = "employee") -> str:
    """The employee's auth account id. The normalized workflow_actions keeps the actor *account* (actor_account_id,
    NOT NULL after the migration), so every actor our routes record needs one."""
    found = db.execute(text("SELECT id FROM public.ariba_auth_accounts WHERE employee_id=:e"), {"e": eid}).scalar()
    if found:
        return str(found)
    return str(db.execute(text("INSERT INTO public.ariba_auth_accounts(username,password_hash,role,employee_id) "
                               "VALUES(:u,'x',:r,:e) RETURNING id"),
                          {"u": f"acc{eid}", "r": role, "e": eid}).scalar())


def _legacy(db: Session, sql: str, **kw: Any) -> tuple[Any, str | None]:
    """Call a legacy function inside a savepoint; (result, None) or (None, the raised message)."""
    sp = db.begin_nested()
    try:
        out = db.execute(text(sql), kw).scalar()
        sp.rollback()
        return out, None
    except Exception as exc:  # noqa: BLE001 — the legacy function signals errors by raising
        sp.rollback()
        return None, str(getattr(exc, "orig", exc)).splitlines()[0]


def _ours(db: Session, fn) -> tuple[Any, str | None]:
    """Run one of our routes (it commits) on the same connection, then undo it: (result, None) or (None, error code)."""
    cx = db.connection()
    sp = cx.begin_nested()
    s = Session(bind=cx, join_transaction_mode="create_savepoint")
    try:
        return fn(s), None
    except c.ApiError as exc:
        return None, exc.code
    finally:
        s.close()
        sp.rollback()


# The normalized database does not store a status, a per-stage approval flag or an "is_read": workflow_requests.status is a
# generated column over current_stage, the leave approval flags come from the workflow_actions rows (see leave_requests_v in
# docs/db-normalization/ariba_normalization.sql), 'hr_override_<stage>' labels are rewritten to '<stage>', and unread means
# read_at IS NULL. The fixture is read the same way so both implementations are compared on the normalized shape.
_DERIVED_STATUS = ("case current_stage when 'completed' then 'approved' when 'rejected' then 'rejected' "
                   "else 'pending' end")


def _stage_status(s: Session, rid: Any) -> tuple[str, str, str]:
    """The per-stage approval (manager, hr, ceo) derived from the workflow_actions rows."""
    latest = dict(s.execute(text("SELECT replace(stage,'hr_override_',''),action FROM public.workflow_actions "
                                 "WHERE request_id=:r ORDER BY created_at"), {"r": rid}).all())
    return tuple(latest.get(st, "pending") for st in ("manager", "hr", "ceo"))


POLYGONS = [
    [[24.70, 46.60], [24.75, 46.62], [24.74, 46.70], [24.69, 46.68]],
    [[21.0, 39.0], [22.0, 39.2], [21.8, 40.1], [21.2, 39.9], [21.5, 39.5]],  # concave
    [[30.0, 31.0], [30.1, 31.0], [30.1, 31.1], [30.0, 31.1]],
]


def test_point_in_polygon_matches_legacy(db):
    rng = random.Random(5)
    bad = []
    for poly in POLYGONS:
        lats, lngs = [p[0] for p in poly], [p[1] for p in poly]
        for _ in range(700):
            lat, lng = rng.uniform(min(lats) - 0.05, max(lats) + 0.05), rng.uniform(min(lngs) - 0.05, max(lngs) + 0.05)
            want = db.execute(text("SELECT public.ariba_point_in_polygon(:a,:b,CAST(:p AS jsonb))"), {"a": lat, "b": lng, "p": json.dumps(poly)}).scalar()
            if c._point_in_polygon(lat, lng, poly) != want:
                bad.append((lat, lng))
    assert not bad, bad[:5]


_ERR = {"OUTSIDE_GEOFENCE": "outside_geofence", "REMOTE_NOT_APPROVED": "remote_not_approved"}


def test_punch_location_and_remote_rule_match_legacy_attendance(db):
    """Which location a check-in lands in (or why it is refused) — ariba_attendance V140 vs our /me/attendance/punch."""
    _exec(db, "INSERT INTO public.company_settings(id,work_start,tolerance_minutes,flexible_enabled) VALUES('default','00:00',1440,false)")
    locs = [("riyadh-hq", "project", 24.7136, 46.6753, 300, None), ("riyadh-big", "project", 24.7140, 46.6760, 2000, None),
            ("poly-1", "project", 0, 0, 200, POLYGONS[0]), ("poly-eg", "project", 0, 0, 200, POLYGONS[2]),
            ("remote", "remote", 0, 0, 200, None)]
    for lid, typ, la, ln, r, poly in locs:
        _exec(db, """INSERT INTO public.work_locations(id,name,employer,type,latitude,longitude,radius_m,active,polygon)
            VALUES(:i,:i,'all',:t,:la,:ln,:r,true,CAST(:p AS jsonb))""", i=lid, t=typ, la=la, ln=ln, r=r, p=json.dumps(poly) if poly else None)
    _employee(db, "501")
    _employee(db, "502", data={"workLocationIds": ["riyadh-hq"]})
    _employee(db, "503")
    today = c.today_riyadh().isoformat()
    _exec(db, """INSERT INTO public.workflow_requests(employee_id,request_type,payload,current_stage,status)
        VALUES('503','remote',CAST(:p AS jsonb),'completed','approved')""", p=json.dumps({"from": today, "to": today}))
    rng = random.Random(9)
    points = [(24.7136, 46.6753), (24.7200, 46.6800), (24.72, 46.65), (30.05, 31.05), (21.5, 39.2), (24.80, 46.90)]
    points += [(rng.uniform(24.65, 24.80), rng.uniform(46.55, 46.75)) for _ in range(120)]
    bad = []
    for eid in ("501", "502", "503"):
        tok = _session(db, eid)
        for lat, lng in points:
            out, err = _legacy(db, "SELECT public.ariba_attendance(:t,'in',:a,:b)", t=tok, a=lat, b=lng)
            want = (out or {}).get("location_id") if out else _ERR.get(err, err)
            res, code = _ours(db, lambda s: c.punch({"action": "in", "lat": lat, "lng": lng}, _Req(), {"employee_id": eid, "role": "employee"}, s))
            got = res["location_id"] if res else code
            if got != want:
                bad.append((eid, lat, lng, want, got))
    assert not bad, f"{len(bad)} differ, e.g. {bad[:5]}"


class _Req:
    """Enough of a Starlette Request for the audit log."""
    headers: dict[str, str] = {}
    client = None


@pytest.mark.parametrize("cs", [
    {"work_start": time(8), "tolerance_minutes": 15, "flexible_enabled": False},
    {"work_start": time(7, 30), "tolerance_minutes": 0, "flexible_enabled": False},
    {"tolerance_minutes": 15, "flexible_enabled": True, "shift_hours": 8, "flex_window_start": time(7), "flex_window_end": time(17)},
    {"tolerance_minutes": 10, "flexible_enabled": True, "shift_hours": 7.5, "flex_window_start": time(8), "flex_window_end": time(16, 30)},
])
def test_late_and_early_minutes_match_legacy(db, cs):
    cols = ",".join(cs)
    _exec(db, f"INSERT INTO public.company_settings(id,{cols}) VALUES('default',{','.join(':' + k for k in cs)})", **cs)
    full = {"work_start": time(8), "tolerance_minutes": 15, "flexible_enabled": False, "shift_hours": 8,
            "flex_window_start": time(8), "flex_window_end": time(17)} | cs
    # the normalized settings row keeps the shift as minutes (shift_hours is the legacy form of the same length)
    full["shift_duration_minutes"] = round(float(full["shift_hours"]) * 60)
    rng = random.Random(3)
    times = [time(h, m, s) for h in range(6, 20) for m in (0, 14, 15, 16, 29, 30, 31, 59) for s in (0, 29, 30, 31)]
    bad = []
    for t in times:
        # late of the first check-in: flexible = ariba_punch_late; fixed = the inline formula of ariba_attendance
        if full["flexible_enabled"]:
            want = db.execute(text("SELECT public.ariba_punch_late(:t)"), {"t": t}).scalar()
        else:
            want = db.execute(text("SELECT greatest(0,extract(epoch from (CAST(:t AS time)-(CAST(:w AS time)+make_interval(mins=>:tol))))/60)::integer"),
                              {"t": t, "w": full["work_start"], "tol": full["tolerance_minutes"]}).scalar()
        if c._punch_late(full, t) != want:
            bad.append(("late", t, want, c._punch_late(full, t)))
        first_in, late = time(rng.randint(6, 12), rng.randint(0, 59), rng.randint(0, 59)), rng.choice([0, 0, 5])
        want = db.execute(text("SELECT public.ariba_punch_early(:i,:o,:l)"), {"i": first_in, "o": t, "l": late}).scalar()
        if c._punch_early(full, first_in, late, t) != want:
            bad.append(("early", first_in, t, late, want, c._punch_early(full, first_in, late, t)))
    assert not bad, f"{len(bad)} differ, e.g. {bad[:5]}"


def test_app_leave_balance_matches_legacy_leave_calc(db):
    """Employee-app balance (current / carried over / year end) vs ariba_leave_calc, on employees shaped like the imported
    data: every closed year has its imported override, the current year is imported (asOf snapshot), partly imported or
    plain, with approved annual leave before and after the snapshot, including future dates."""
    _exec(db, "INSERT INTO public.ariba_app_settings(key,value) VALUES('leave_carry',CAST(:v AS jsonb))", v=json.dumps({"enabled": True, "days": 10}))
    for hid, d, n in (("fitr", date(2026, 3, 19), 4), ("adha", date(2026, 5, 26), 4), ("national", date(2026, 9, 23), 1), ("founding", date(2026, 2, 22), 1)):
        _exec(db, "INSERT INTO public.public_holidays(id,name,holiday_date,days,recurring) VALUES(:i,:i,:d,:n,false)", i=hid, d=d, n=n)
    book0 = cdata.leave_book(db, date(2026, 10, 11), [])
    rng = random.Random(21)
    ids = []
    for k in range(60):
        eid = str(700 + k)
        join = rng.choice([date(2021, 4, 1), date(2023, 9, 10), date(2024, 12, 1), date(2025, 6, 15), date(2026, 2, 1)])
        ov: dict[str, dict] = {}
        carry = 0.0
        for y in range(join.year, 2026):  # imported ledger: consistent year by year, as in the real data
            ent = 21.0 if y > join.year else round(rng.uniform(1, 21), 2)
            used = rng.randint(0, 20)
            ye = round(max(0.0, carry + ent - used), 2)
            ov[str(y)] = {"entitlement": ent, "used": used, "yearEnd": ye, "carryNext": min(10.0, ye), "excess": max(0.0, ye - 10)}
            carry = min(10.0, ye)
        shape = rng.choice(["imported", "imported_carry", "entitlement", "plain"])
        cur: dict[str, Any] = {}
        if shape.startswith("imported") and join.year < 2026:
            used = rng.randint(0, 12)
            cur = {"asOf": "2026-09-22", "used": used, "yearEnd": round(max(0.0, carry + 21 - used), 2), "entitlement": 21}
            if shape == "imported_carry":
                cur["carry"] = carry
        elif shape == "entitlement":
            cur = {"entitlement": rng.choice([21, 30])}
        if cur:
            ov["2026"] = cur
        _employee(db, eid, join=join, data={"leaveYearOverrides": ov})
        for f in sorted({date(2026, rng.randint(1, 12), rng.randint(1, 28)) for _ in range(rng.randint(0, 3))}):
            if f < join or (cur.get("asOf") and f.isoformat() < cur["asOf"]):
                continue  # already inside the imported figures
            t = f + timedelta(days=rng.choice([0, 1, 4]))
            days = book0.count_workdays(f, t)
            if not days:
                continue
            rid = uuid.uuid4()
            _exec(db, """INSERT INTO public.workflow_requests(id,employee_id,request_type,payload,current_stage,status)
                VALUES(:r,:e,'annual',CAST(:p AS jsonb),'completed','approved')""", r=rid, e=eid, p=json.dumps({"from": f.isoformat(), "to": t.isoformat(), "days": days}))
            _exec(db, """INSERT INTO public.leave_requests(emp_id,type,from_date,to_date,days,status,workflow_request_id)
                VALUES(:e,'annual',:f,:t,:d,'approved',:r)""", e=eid, f=f, t=t, d=days, r=rid)
        ids.append(eid)
    emps = [e for e in cdata.employees(db) if e.id in ids]
    bad = []
    for asof in (date(2026, 1, 15), date(2026, 9, 22), date(2026, 10, 11), date(2026, 12, 31)):
        book = cdata.leave_book(db, asof, emps)
        for e in emps:
            s = book.summary(e)
            ours = {"leaveBalance": round(book.app_current(e), 2), "leaveCarryover": s["carry"], "leaveYearEnd": round(book.app_year_end(e), 2)}
            want = db.execute(text("SELECT public.ariba_leave_calc(:e,:d)"), {"e": e.id, "d": asof}).scalar()
            for k, v in ours.items():
                if abs(v - float(want[k])) > 0.011:
                    bad.append((asof.isoformat(), e.id, k, float(want[k]), v))
    assert not bad, f"{len(bad)} differ, e.g. {bad[:6]}"


def test_new_request_notifications_match_legacy_submit_request(db):
    """Who is notified of a new request (V115: HR hears of every request, even while it waits for the manager)."""
    _employee(db, "40")  # HR (the legacy server hard-codes 40)
    _exec(db, "INSERT INTO public.ariba_auth_accounts(username,password_hash,role,employee_id) VALUES('hr40','x','hr','40')")
    _employee(db, "86")
    _employee(db, "601", manager="86")
    _employee(db, "602", manager="40")  # HR is the manager: notified once, as manager
    _employee(db, "603")  # no manager: straight to HR
    accounts = {eid: _account(db, eid) for eid in ("601", "602", "603")}
    cases = [("sick", {"from": "2026-11-01", "to": "2026-11-02", "notes": "x"}), ("advance", {"amount": 500, "notes": "x"}),
             ("forgot_punch", {"kind": "in", "date": "2026-10-08", "time": "08:00", "notes": "x"})]
    body = lambda t, p: {"type": t, **p, "from_date": p.get("from"), "to_date": p.get("to")}  # noqa: E731
    notes = lambda rid: sorted((r[0], r[1]) for r in db.execute(  # noqa: E731
        text("SELECT recipient_employee_id,stage FROM public.workflow_notifications WHERE request_id=:r"), {"r": rid}))
    bad = []
    for eid in ("601", "602", "603"):
        tok = _session(db, eid)
        for t, p in cases:
            sp = db.begin_nested()
            out = db.execute(text("SELECT public.ariba_submit_request(:k,:t,CAST(:p AS jsonb))"), {"k": tok, "t": t, "p": json.dumps(p)}).scalar()
            want = (out["current_stage"], notes(out["request_id"]))
            sp.rollback()
            def submit(s: Session, t=t, p=p, eid=eid):
                actor = {"employee_id": eid, "role": "employee", "account_id": accounts[eid]}
                res = c.submit_request(body(t, p), _Req(), actor, s)
                stage = s.execute(text("SELECT current_stage FROM public.workflow_requests WHERE id=:r"), {"r": res["id"]}).scalar()
                return stage, sorted((r[0], r[1]) for r in s.execute(
                    text("SELECT recipient_employee_id,stage FROM public.workflow_notifications WHERE request_id=:r"), {"r": res["id"]}))
            got, err = _ours(db, submit)
            if got != want:
                bad.append((eid, t, want, got, err))
    assert not bad, bad


def test_approval_flow_matches_legacy_workflow_action(db):
    """Every type goes manager → HR → CEO (forgot-punch: HR only), step by step as ariba_workflow_action moves it:
    stage, status, the leave_requests copy and who is told what."""
    for eid, role in (("40", "hr"), ("86", "ceo"), ("87", "manager")):
        _employee(db, eid)
        _exec(db, "INSERT INTO public.ariba_auth_accounts(username,password_hash,role,employee_id) VALUES(:u,'x',:r,:e)", u=f"u{eid}", r=role, e=eid)
    _employee(db, "610", manager="87")
    _exec(db, "INSERT INTO public.company_settings(id) VALUES('default')")
    accounts = {eid: _account(db, eid, role) for eid, role in (("40", "hr"), ("86", "ceo"), ("87", "manager"), ("610", "employee"))}
    payloads = {"annual": {"from": "2026-11-01", "to": "2026-11-02"}, "sick": {"from": "2026-11-01", "to": "2026-11-02"},
                "permission": {"date": "2026-11-03", "time": "10:00", "dur": 2}, "early_leave": {"date": "2026-11-03", "time": "14:00", "dur": 1},
                "overtime": {"date": "2026-11-03", "hours": 2}, "mission": {"from": "2026-11-04", "to": "2026-11-05"},
                "advance": {"amount": 1000}, "forgot_punch": {"kind": "in", "date": "2026-10-08", "time": "08:00"}}
    approvers = {"manager": ("87", "manager"), "hr": ("40", "hr"), "ceo": ("86", "ceo")}

    def state(s: Session, rid: Any) -> tuple:
        r = s.execute(text(f"SELECT current_stage,{_DERIVED_STATUS} AS status FROM public.workflow_requests WHERE id=:r"), {"r": rid}).one()
        n = sorted((x[0], x[1]) for x in s.execute(text("SELECT recipient_employee_id,title FROM public.workflow_notifications WHERE request_id=:r"), {"r": rid}))
        return tuple(r), _stage_status(s, rid), n

    bad = []
    for t, p in payloads.items():
        p = {**p, "notes": "x"}
        # legacy: submit, then approve at each stage until done
        sp = db.begin_nested()
        rid = db.execute(text("SELECT public.ariba_submit_request(:k,:t,CAST(:p AS jsonb))"), {"k": _session(db, "610"), "t": t, "p": json.dumps(p)}).scalar()["request_id"]
        _exec(db, "INSERT INTO public.leave_requests(emp_id,type,from_date,to_date,days,status,workflow_request_id) SELECT '610',:t,'2026-11-01','2026-11-01',1,'pending',:r WHERE :t<>'forgot_punch' AND NOT EXISTS (SELECT 1 FROM public.leave_requests WHERE workflow_request_id=:r)", t=t, r=rid)
        legacy = []
        for _ in range(4):
            stage = db.execute(text("SELECT current_stage FROM public.workflow_requests WHERE id=:r"), {"r": rid}).scalar()
            if stage not in approvers:
                break
            who, role = approvers[stage]
            db.execute(text("SELECT public.ariba_workflow_action(:k,:r,'approved',NULL)"), {"k": _session(db, who, role), "r": rid})
            legacy.append((stage,) + state(db, rid)[:2])
        legacy_notes = state(db, rid)[2]
        sp.rollback()

        def ours(s: Session, t=t, p=p):
            res = c.submit_request({"type": t, **p, "from_date": p.get("from"), "to_date": p.get("to"), "on_date": p.get("date")}, _Req(),
                                   {"employee_id": "610", "role": "employee", "account_id": accounts["610"]}, s)
            rid = res["id"]
            s.execute(text("INSERT INTO public.leave_requests(emp_id,type,from_date,to_date,days,status,workflow_request_id) SELECT '610',:t,'2026-11-01','2026-11-01',1,'pending',:r WHERE :t<>'forgot_punch' AND NOT EXISTS (SELECT 1 FROM public.leave_requests WHERE workflow_request_id=:r)"), {"t": t, "r": rid})
            steps = []
            for _ in range(4):
                stage = s.execute(text("SELECT current_stage FROM public.workflow_requests WHERE id=:r"), {"r": rid}).scalar()
                if stage not in approvers:
                    break
                who, role = approvers[stage]
                c.decide_request(rid, {"action": "approve"}, _Req(), {"employee_id": who, "role": role, "account_id": accounts[who]}, s)
                steps.append((stage,) + state(s, rid)[:2])
            return steps, state(s, rid)[2]

        (steps, notes), err = _ours(db, ours)
        if err or steps != legacy:
            bad.append((t, "steps", legacy, steps, err))
        elif notes != legacy_notes:
            bad.append((t, "notifications", legacy_notes, notes))
    assert not bad, "\n".join(map(str, bad))


def _staff(db: Session) -> None:
    for eid, role in (("40", "hr"), ("86", "ceo"), ("87", "manager")):
        _employee(db, eid)
        _exec(db, "INSERT INTO public.ariba_auth_accounts(username,password_hash,role,employee_id) VALUES(:u,'x',:r,:e)", u=f"u{eid}", r=role, e=eid)
    _exec(db, "INSERT INTO public.ariba_role_perms(role,module,level) VALUES('hr','requests','edit')")
    _employee(db, "610", manager="87")


def _wf_state(s: Session, rid: Any) -> tuple:
    r = s.execute(text(f"SELECT current_stage,{_DERIVED_STATUS} AS status FROM public.workflow_requests WHERE id=:r"), {"r": rid}).one()
    n = sorted(tuple(x) for x in s.execute(text("SELECT recipient_employee_id,title,body,read_at IS NOT NULL "
                                               "FROM public.workflow_notifications WHERE request_id=:r"), {"r": rid}))
    a = sorted((x[0], x[1]) for x in s.execute(text("SELECT replace(stage,'hr_override_',''),action "
                                                  "FROM public.workflow_actions WHERE request_id=:r"), {"r": rid}))
    return tuple(r), _stage_status(s, rid), n, a


_FP = {"kind": "in", "date": "2026-10-08", "time": "08:00", "notes": "x"}


@pytest.mark.parametrize("final", [False, True])
def test_hr_override_and_final_approve_match_legacy(db, final):
    """HR «اعتماد نيابة» (ariba_hr_override_workflow) and «اعتماد نهائي» (ariba_hr_final_approve) from every stage."""
    _staff(db)
    _exec(db, "INSERT INTO public.company_settings(id) VALUES('default')")
    hr_tok = _session(db, "40", "hr")
    hr_acc = _account(db, "40", "hr")
    bad = []
    for t, p in (("annual", {"from": "2026-11-01", "to": "2026-11-02"}), ("permission", {"date": "2026-11-03", "time": "10:00", "dur": 2}),
                 ("advance", {"amount": 1000}), ("forgot_punch", _FP)):
        for start in (("hr",) if t == "forgot_punch" else ("manager", "hr", "ceo")):
            rid = uuid.uuid4()
            _exec(db, """INSERT INTO public.workflow_requests(id,employee_id,request_type,payload,manager_id,current_stage,status)
                VALUES(:r,'610',:t,CAST(:p AS jsonb),'87',:s,'pending')""", r=rid, t=t, p=json.dumps({**p, "notes": "x"}), s=start)
            if t != "forgot_punch":
                _exec(db, "INSERT INTO public.leave_requests(emp_id,type,from_date,to_date,days,status,workflow_request_id) VALUES('610',:t,'2026-11-01','2026-11-01',1,'pending',:r)", t=t, r=rid)
            _exec(db, "INSERT INTO public.workflow_notifications(recipient_employee_id,request_id,title,body,stage,kind) VALUES('87',:r,'old','old',:s,'request')", r=rid, s=start)
            fn = "ariba_hr_final_approve" if final else "ariba_hr_override_workflow"
            sp = db.begin_nested()
            db.execute(text(f"SELECT public.{fn}(:k,:r,NULL)"), {"k": hr_tok, "r": rid})
            want = _wf_state(db, rid)
            want_att = db.execute(text("SELECT time_in,late_minutes,status FROM public.attendance WHERE emp_id='610'")).all()
            sp.rollback()
            route = c.hr_final_approve if final else c.hr_override_request

            def ours(s: Session, rid=rid, route=route):
                route(rid, {}, _Req(), {"employee_id": "40", "role": "hr", "account_id": hr_acc}, s)
                return _wf_state(s, rid), s.execute(text("SELECT time_in,late_minutes,status FROM public.attendance WHERE emp_id='610'")).all()

            got, err = _ours(db, ours)
            if err or got != (want, want_att):
                bad.append((t, start, want, want_att, got, err))
    assert not bad, "\n".join(map(str, bad))


_DAY = date(2026, 10, 8)


@pytest.mark.parametrize("flex", [False, True])
def test_forgot_punch_is_applied_like_legacy(db, flex):
    """Approved «نسيان بصمة» merged into that day's attendance (ariba_apply_forgot_punch) for every kind, against no record,
    an open session, a closed one, an auto-closed one and two sessions."""
    _exec(db, "INSERT INTO public.company_settings(id,work_start,tolerance_minutes,flexible_enabled,shift_hours,flex_window_start,flex_window_end) VALUES('default','08:00',15,:f,8,'07:00','17:00')", f=flex)
    _employee(db, "620")
    existing = {
        "none": [],
        "open": [("08:40", None, 25, "late", "")],
        "closed": [("07:50", "16:10", 0, "present", "")],
        "auto": [("09:05", "23:59", 50, "late", " | إغلاق تلقائي 23:59 (نسي بصمة الخروج)")],
        "two": [("07:55", "12:00", 0, "present", ""), ("13:00", None, 0, "present", " (دخول إضافي في نفس اليوم)")],
    }
    asks = [("in", "07:30", None), ("in", "08:20", None), ("in", "09:10", None), ("out", "15:00", None), ("out", "17:30", None),
            ("both", "07:40", "16:00"), ("both", "08:50", "17:10")]
    cols = "time_in,time_out,status,late_minutes,early_minutes,notes"  # no location_name: dropped by the normalization (the marker is in notes)
    bad = []
    for name, rows in existing.items():
        for kind, t1, t2 in asks:
            sp0 = db.begin_nested()
            for i, (a, b, late, st, note) in enumerate(rows):
                _exec(db, """INSERT INTO public.attendance(emp_id,date,time_in,time_out,status,notes,late_minutes,early_minutes,created_at)
                    VALUES('620',:d,:a,:b,:st,:n,:l,0,now()+make_interval(secs=>:i))""", d=_DAY, a=a, b=b, st=st, n="GPS" + note, l=late, i=i)
            rid = uuid.uuid4()
            payload = {"kind": kind, "date": _DAY.isoformat(), "time": t1, "notes": "x"} | ({"time2": t2} if t2 else {})
            _exec(db, "INSERT INTO public.workflow_requests(id,employee_id,request_type,payload,current_stage,status) VALUES(:r,'620','forgot_punch',CAST(:p AS jsonb),'hr','pending')",
                  r=rid, p=json.dumps(payload))
            sp = db.begin_nested()
            db.execute(text("SELECT public.ariba_apply_forgot_punch(:r)"), {"r": rid})
            want = sorted(map(tuple, db.execute(text(f"SELECT {cols} FROM public.attendance WHERE emp_id='620'")).all()), key=str)
            sp.rollback()
            item = dict(db.execute(text("SELECT * FROM public.workflow_requests WHERE id=:r"), {"r": rid}).mappings().one())
            c._apply_forgot_punch(db, item)
            got = sorted(map(tuple, db.execute(text(f"SELECT {cols} FROM public.attendance WHERE emp_id='620'")).all()), key=str)
            sp0.rollback()
            if got != want:
                bad.append((name, kind, t1, t2, want, got))
    assert not bad, "\n".join(map(str, bad[:6]))


def test_employee_delete_matches_legacy_delete_request(db):
    """An employee withdraws a request: archived, removed with its rows, and HR told when it was still pending."""
    _staff(db)
    tok = _session(db, "610")
    bad = []
    for status in ("pending", "rejected", "approved"):
        rid = uuid.uuid4()
        _exec(db, "INSERT INTO public.workflow_requests(id,employee_id,request_type,payload,manager_id,current_stage,status) VALUES(:r,'610','sick','{}','87','manager',:s)", r=rid, s=status)
        _exec(db, "INSERT INTO public.leave_requests(emp_id,type,from_date,to_date,days,status,workflow_request_id) VALUES('610','sick','2026-11-01','2026-11-01',1,:s,:r)", s=status, r=rid)
        _exec(db, "INSERT INTO public.ariba_documents(employee_id,request_id,document_type,file_name,file_data) VALUES('610',:r,'Leave Attachment','a.pdf','x')", r=rid)

        def snap(s: Session, rid=rid) -> tuple:
            left = [s.execute(text(q), {"r": rid}).scalar() for q in (
                "SELECT count(*) FROM public.workflow_requests WHERE id=:r", "SELECT count(*) FROM public.leave_requests WHERE workflow_request_id=:r",
                "SELECT count(*) FROM public.ariba_documents WHERE request_id=:r",
                "SELECT count(*) FROM public.ariba_deleted_items WHERE ref_id=CAST(:r AS text) AND snapshot ? 'documents' AND snapshot ? 'leave'")]
            told = sorted((x[0], x[1].replace("🗑 ", "")) for x in s.execute(text("SELECT recipient_employee_id,title FROM public.workflow_notifications WHERE request_id IS NULL")))
            return tuple(left), told

        out, err = _legacy(db, "SELECT public.ariba_delete_request(:k,:r)", k=tok, r=rid)
        if err:
            want = ("error", "approved" if "CANNOT_DELETE_APPROVED" in err else err)
        else:
            sp = db.begin_nested()
            db.execute(text("SELECT public.ariba_delete_request(:k,:r)"), {"k": tok, "r": rid})
            want = snap(db)
            sp.rollback()
        got, code = _ours(db, lambda s, rid=rid: (c.delete_my_request(rid, _Req(), {"employee_id": "610", "role": "employee"}, s), snap(s))[1])
        if code:
            got = ("error", code)
        if got != want:
            bad.append((status, want, got))
    assert not bad, bad


# --------------------------------------------------------------------------- labour-law corrections (LOGIC_AUDIT section 4)
def test_resignation_tiers_follow_article_85():
    from decimal import Decimal

    from app.enums import TerminationArticle as A
    from app.services.end_of_service import eos_award
    base = Decimal(9000)
    e84 = lambda y: base / 2 * min(y, 5) + base * max(0, y - 5)  # noqa: E731
    assert eos_award(base, Decimal("1.99"), A.art_85) == 0
    assert eos_award(base, Decimal(5), A.art_85) == (e84(5) / 3).quantize(Decimal("0.01"))  # 5 years exactly: one third
    assert eos_award(base, Decimal("5.01"), A.art_85) == (e84(Decimal("5.01")) * 2 / 3).quantize(Decimal("0.01"))
    assert eos_award(base, Decimal(10), A.art_85) == e84(10)  # 10 years: full


def test_law_note_on_pending_leave(db):
    _employee(db, "630", join=date(2025, 6, 1))
    def req(t: str, f: str, days: int, status: str = "pending") -> dict:
        rid = uuid.uuid4()
        _exec(db, "INSERT INTO public.workflow_requests(id,employee_id,request_type,payload,current_stage,status) VALUES(:r,'630',:t,CAST(:p AS jsonb),:s,:st)",
              r=rid, t=t, p=json.dumps({"from": f, "days": days}), s="hr" if status == "pending" else "completed", st=status)
        return dict(db.execute(text("SELECT * FROM public.workflow_requests WHERE id=:r"), {"r": rid}).mappings().one())
    note = lambda r: c._law_note(db, r, date.fromisoformat(r["payload"]["from"]), r["payload"]["days"])  # noqa: E731
    assert note(req("marriage", "2026-11-01", 5)) is None
    assert "5 يوم" in note(req("marriage", "2026-11-01", 7))
    assert note(req("paternity", "2026-11-01", 4)).startswith("المدة النظامية 3")
    assert note(req("sick", "2026-03-01", 20)) is None
    req("sick", "2026-01-10", 25, "approved")
    n = note(req("sick", "2026-03-01", 20))  # 25 before + 20 = 45: 15 days at three quarters
    assert "45 يوم" in n and "15 يوم بثلاثة أرباع الأجر" in n
    h = note(req("hajj", "2026-05-20", 16))  # under two years of service, and over 15 days
    assert "أقل من سنتين" in h and "16" in h
    assert note(req("marriage", "2026-11-01", 9, "approved")) is None  # decided requests carry no note
