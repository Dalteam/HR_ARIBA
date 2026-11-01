"""Demo data for the direct manager's screen (Stage 2), on a throwaway copy of the database.

    backend\\.venv\\Scripts\\python.exe tools\\smoke\\manager_demo_seed.py
    ... --src ariba_src --dst ariba_manager_demo      (default: a fresh copy, then seed it)
    ... --dst ariba_manager_demo --no-copy            (seed that database as it is)

It creates a manager with three reports (one delegated to him, one not, one with nothing), a
report who belongs to somebody else, an HR login, the manager's permissions, the `manager_team_salary`
setting (off, so the salary is hidden until HR turns it on) and three team requests to look at.

**It is a sandbox tool, not a deployment step.** It refuses `ariba_src`, `postgres` and the
template databases, and it refuses any host that is not this machine: a Railway or Supabase
database is never a place to invent employees in. `docs/FOLLOW_UPS.md` #18 is the same rule for
every check in this repo.

The seeded password is printed once (and written to `_manager_demo_info.json` at the repo root,
which `.gitignore` keeps out of git).
"""

from __future__ import annotations

import argparse
import json
import uuid
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import psycopg
from argon2 import PasswordHasher

PASSWORD = "DemoManager!2026"
MANAGER = "DEMO-MGR"
REPORTS = ("DEMO-EMP1", "DEMO-EMP2", "DEMO-EMP3")
OUTSIDER = "DEMO-OUT"
HR_EMPLOYEE = "DEMO-HR"
DEMO_IDS = (MANAGER, *REPORTS, OUTSIDER, HR_EMPLOYEE)

#: Databases this script must never write to.
REFUSE_DATABASES = {"ariba_src", "postgres", "template0", "template1"}
#: Hosts that are always refused, even with --allow-remote, because they hold real data.
REFUSE_HOSTS = ("railway", "supabase", "rlwy.net", "render.com", "neon.tech")
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


def _with_database(url: str, dbname: str) -> str:
    """The same server and credentials, another database (for DROP/CREATE DATABASE)."""
    parts = urlsplit(url)
    return urlunsplit(parts._replace(path="/" + dbname))


def _guard(args: argparse.Namespace) -> str:
    """Refuse a target that is not a local sandbox; return the host the copy will be made on."""
    host = urlsplit(args.url).hostname if args.url else args.host
    if args.dst in REFUSE_DATABASES:
        raise SystemExit(f"refusing to write demo data into {args.dst!r}: that is not a sandbox")
    if host and any(bad in host for bad in REFUSE_HOSTS):
        raise SystemExit(f"refusing {host!r}: a Railway/Supabase database is not a sandbox")
    if host and host not in LOCAL_HOSTS and not args.allow_remote:
        raise SystemExit(f"refusing remote host {host!r}: run it on this machine, or pass --allow-remote")
    return host or args.host


def _copy(args: argparse.Namespace) -> None:
    """Drop and re-create `--dst` from `--src` (the same way smoke_setup.py does)."""
    admin_dsn = _with_database(args.url, "postgres") if args.url else \
        f"host={args.host} port={args.port} user={args.user} dbname=postgres"
    with psycopg.connect(admin_dsn, autocommit=True) as admin:
        admin.execute("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=%s AND pid<>pg_backend_pid()",
                      (args.dst,))
        admin.execute(f'DROP DATABASE IF EXISTS "{args.dst}" WITH (FORCE)')
        admin.execute(f'CREATE DATABASE "{args.dst}" TEMPLATE "{args.src}"')
    print(f"created {args.dst} from template {args.src}")


def _dsn(args: argparse.Namespace) -> str:
    return _with_database(args.url, args.dst) if args.url else \
        f"host={args.host} port={args.port} user={args.user} dbname={args.dst}"


DEPARTMENT = "إدارة تجريبية"
JOBS = {"manager": "مدير تجريبي", "employee": "موظف تجريبي"}
JOIN_DATE = date(2024, 2, 1)


def _lookup(db, table: str, name: str) -> int:
    """A department / job-title id, created when the copy does not carry it yet."""
    row = db.execute(f"""INSERT INTO public.{table}(name) VALUES (%s)
        ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id""", (name,)).fetchone()
    return int(row[0])


def _clear_references(db, params: dict) -> None:
    """Delete whatever else points at the demo employees (attendance, targets, tasks, …).

    Discovered from the catalogue rather than hard-coded, so a table one of the tools created rows
    in cannot break the next run. Each delete is guarded: a statement that Postgres refuses (an
    order-of-deletion problem) rolls back on its own and the explicit deletes above have already
    taken the workflow graph apart.
    """
    rows = db.execute("""
        SELECT DISTINCT c.conrelid::regclass::text AS table_name, a.attname AS column_name
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.contype = 'f' AND c.confrelid = 'public.employee_directory'::regclass""").fetchall()
    for table_name, column_name in rows:
        if table_name.endswith("employee_directory"):
            continue
        db.execute("SAVEPOINT clear_reference")
        try:
            db.execute(f"DELETE FROM {table_name} WHERE {column_name} = ANY(%(ids)s)", params)
        except psycopg.errors.ForeignKeyViolation:
            db.execute("ROLLBACK TO SAVEPOINT clear_reference")
        finally:
            db.execute("RELEASE SAVEPOINT clear_reference")


def _clear(db) -> None:
    """Remove a previous run's demo rows, requests included, so the script can run again."""
    params = {"ids": list(DEMO_IDS)}
    requests = "SELECT id FROM public.workflow_requests WHERE employee_id = ANY(%(ids)s)"
    db.execute("DELETE FROM public.ariba_sessions WHERE account_id IN "
               "(SELECT id FROM public.ariba_auth_accounts WHERE employee_id = ANY(%(ids)s))", params)
    db.execute(f"DELETE FROM public.workflow_actions WHERE request_id IN ({requests})", params)
    db.execute(f"DELETE FROM public.workflow_notifications WHERE recipient_employee_id = ANY(%(ids)s) "
               f"OR request_id IN ({requests})", params)
    db.execute("DELETE FROM public.ariba_documents WHERE employee_id = ANY(%(ids)s)", params)
    db.execute(f"DELETE FROM public.leave_requests WHERE employee_id = ANY(%(ids)s) "
               f"OR workflow_request_id IN ({requests})", params)
    db.execute(f"DELETE FROM public.permissions WHERE workflow_request_id IN ({requests})", params)
    db.execute("DELETE FROM public.workflow_requests WHERE employee_id = ANY(%(ids)s)", params)
    db.execute("DELETE FROM public.ariba_delegations "
               "WHERE employee_id = ANY(%(ids)s) OR manager_id = ANY(%(ids)s)", params)
    db.execute("DELETE FROM public.ariba_manager_perms WHERE manager_id = ANY(%(ids)s)", params)
    _clear_references(db, params)  # attendance, targets, tasks, … whatever else names them
    db.execute("UPDATE public.employee_directory SET manager_id = NULL WHERE manager_id = ANY(%(ids)s)", params)
    db.execute("DELETE FROM public.ariba_auth_accounts WHERE employee_id = ANY(%(ids)s)", params)
    db.execute("DELETE FROM public.employee_directory WHERE employee_id = ANY(%(ids)s)", params)


def _employee(db, employee_id: str, name_ar: str, name_en: str, *, job: str, manager_id: str | None,
              salary: float, department_id: int, job_ids: dict[str, int]) -> None:
    """One directory row with the JSON the screens read (`salaryTotal`, contract dates, contact)."""
    data = {"empNo": employee_id, "u": employee_id, "nameAr": name_ar, "nameEn": name_en,
            "jobTitle": job, "department": DEPARTMENT, "employer": "أريبا",
            "salaryTotal": salary, "netSalary": round(salary * 0.9, 2),
            "mobile": "0550000000", "email": f"{employee_id.lower()}@example.com",
            "contractEnd": "2027-06-30", "iqamaExpiry": "2027-05-01",
            "leaveDaysContract": 21, "join_date": JOIN_DATE.isoformat(), "isTerminated": False}
    job_id = job_ids["manager" if employee_id == MANAGER else "employee"]
    db.execute("""INSERT INTO public.employee_directory
        (employee_id,name_ar,name_en,nationality,join_date,manager_id,active,data,department_id,job_title_id)
        VALUES (%s,%s,%s,%s,%s,%s,true,%s::jsonb,%s,%s)""",
               (employee_id, name_ar, name_en, "سعودي", JOIN_DATE, manager_id,
                json.dumps(data, ensure_ascii=False), department_id, job_id))


def _request(db, employee_id: str, request_type: str, payload: dict, stage: str, days_ago: int,
             *, notes: str = "") -> uuid.UUID:
    """One request for the team list, with the action rows `/me/team/requests` reads back."""
    row = db.execute("""INSERT INTO public.workflow_requests
        (employee_id,request_type,payload,current_stage,created_at,updated_at)
        VALUES (%s,%s,%s::jsonb,%s, now() - make_interval(days => %s), now() - make_interval(days => %s))
        RETURNING id""",
                     (employee_id, request_type, json.dumps(payload, ensure_ascii=False), stage, days_ago, days_ago)
                     ).fetchone()
    request_id = row[0]
    db.execute("""INSERT INTO public.workflow_actions(request_id,actor_account_id,stage,action,comment)
        VALUES (%s,NULL,'employee','submitted',%s)""", (request_id, notes or None))
    if stage == "rejected":
        db.execute("""INSERT INTO public.workflow_actions(request_id,actor_account_id,stage,action,comment)
            VALUES (%s,NULL,'hr','rejected',%s)""", (request_id, "الراتب المقدم غير متاح هذا الشهر"))
    if request_type in {"annual", "sick", "unpaid", "mission"}:
        db.execute("""INSERT INTO public.leave_requests
            (employee_id,leave_type,from_date,to_date,days,notes,workflow_request_id)
            VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                   (employee_id, request_type, payload["from"], payload["to"], payload["days"],
                    notes or None, request_id))
    return request_id


def seed(db) -> dict:
    """The demo team, its accounts, permissions, delegation and three requests."""
    hashed = PasswordHasher().hash(PASSWORD)
    department_id = _lookup(db, "departments", DEPARTMENT)
    job_ids = {key: _lookup(db, "job_titles", name) for key, name in JOBS.items()}
    _clear(db)

    _employee(db, MANAGER, "مدير تجريبي", "Demo Manager", job=JOBS["manager"], manager_id=None, salary=22000,
              department_id=department_id, job_ids=job_ids)
    for index, employee_id in enumerate(REPORTS, start=1):
        _employee(db, employee_id, f"موظف تجريبي {index}", f"Demo Employee {index}", job=JOBS["employee"],
                  manager_id=MANAGER, salary=9000 + 500 * index, department_id=department_id, job_ids=job_ids)
    _employee(db, OUTSIDER, "موظف خارج الفريق", "Outside Employee", job=JOBS["employee"], manager_id=None,
              salary=9500, department_id=department_id, job_ids=job_ids)
    _employee(db, HR_EMPLOYEE, "موارد بشرية (تجريبي)", "Demo HR", job=JOBS["employee"], manager_id=None,
              salary=15000, department_id=department_id, job_ids=job_ids)

    accounts = [("demo_mgr", MANAGER, "employee"), ("demo_emp1", REPORTS[0], "employee"),
                ("demo_emp2", REPORTS[1], "employee"), ("demo_emp3", REPORTS[2], "employee"),
                ("demo_out", OUTSIDER, "employee"), ("demo_hr", HR_EMPLOYEE, "admin")]
    for username, employee_id, role in accounts:
        db.execute("""INSERT INTO public.ariba_auth_accounts(username,password_hash,role,employee_id,active,must_change)
            VALUES (%s,%s,%s,%s,true,false)""", (username, hashed, role, employee_id))

    # HR granted everything except the salary — and the salary also needs the setting below.
    db.execute("""INSERT INTO public.ariba_manager_perms(manager_id,perms,updated_by,updated_at)
        VALUES (%s,%s::jsonb,'manager_demo_seed',now())""",
               (MANAGER, json.dumps({"view_team": True, "view_team_data": True, "view_team_leaves": True,
                                     "view_team_requests": True, "submit_for_team": True,
                                     "view_team_salary": False, "approve_requests": True,
                                     "manage_targets": True, "evaluate_team": True})))
    # One report delegated the manager, one did not, one has no row at all.
    db.execute("INSERT INTO public.ariba_delegations(employee_id,manager_id,active,updated_at) "
               "VALUES (%s,%s,true,now())", (REPORTS[0], MANAGER))
    db.execute("INSERT INTO public.ariba_delegations(employee_id,manager_id,active,updated_at) "
               "VALUES (%s,%s,false,now())", (REPORTS[1], MANAGER))
    # The company-wide switch is off: `salary_total` must not appear in /me/team until HR flips it.
    db.execute("""INSERT INTO public.ariba_app_settings(key,value,updated_by,updated_at)
        VALUES ('manager_team_salary','{"visible": false}'::jsonb,'manager_demo_seed',now())
        ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now()""")

    today = date.today()
    approved = _request(db, REPORTS[0], "annual",
                        {"from": (today - timedelta(days=40)).isoformat(),
                         "to": (today - timedelta(days=36)).isoformat(), "days": 5}, "completed", 45,
                        notes="إجازة سنوية")
    pending = _request(db, REPORTS[0], "annual",
                       {"from": (today + timedelta(days=3)).isoformat(),
                        "to": (today + timedelta(days=4)).isoformat(), "days": 2}, "hr", 1, notes="سفر")
    rejected = _request(db, REPORTS[1], "salary_advance", {"amount": 3000, "notes": "ظرف طارئ"}, "rejected", 12,
                        notes="ظرف طارئ")
    return {"accounts": [{"username": u, "employee_id": e, "role": r} for u, e, r in accounts],
            "manager": {"employee_id": MANAGER, "reports": list(REPORTS), "outsider": OUTSIDER,
                        "hr": HR_EMPLOYEE},
            "delegated": [REPORTS[0]], "not_delegated": [REPORTS[1]],
            "requests": {"approved_leave": str(approved), "pending_leave": str(pending),
                         "rejected_advance": str(rejected)}}


def main() -> int:
    parser = argparse.ArgumentParser(prog="manager_demo_seed")
    parser.add_argument("--src", default="ariba_src", help="template database (read-only)")
    parser.add_argument("--dst", default="ariba_manager_demo", help="the database to seed")
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--port", default=5432, type=int)
    parser.add_argument("--user", default="postgres")
    parser.add_argument("--url", default="", help="full postgres URL of this machine's server (its database is ignored)")
    parser.add_argument("--no-copy", action="store_true", help="seed --dst as it is, do not recreate it")
    parser.add_argument("--allow-remote", action="store_true",
                        help="allow a non-local host (never a Railway/Supabase one)")
    args = parser.parse_args()

    host = _guard(args)
    if args.src in REFUSE_DATABASES and args.src != "ariba_src":
        raise SystemExit(f"refusing to copy from {args.src!r}")
    if not args.no_copy:
        _copy(args)
    with psycopg.connect(_dsn(args)) as db:
        info = seed(db)
    info.update({"database": args.dst, "host": host, "password": PASSWORD})
    out = Path(__file__).resolve().parents[2] / "_manager_demo_info.json"  # repo root, git-ignored
    out.write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nwrote {out}\n")
    print(f"  login (all accounts): password {PASSWORD}")
    for account in info["accounts"]:
        print(f"  {account['username']:<10} employee={account['employee_id']:<10} role={account['role']}")
    print("\n  manager screen: sign in as demo_mgr, open the team tab")
    print("  salary is hidden ({'visible': false}) until PUT /settings/team-salary turns it on")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
