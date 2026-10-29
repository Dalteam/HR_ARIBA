"""Prepare a disposable copy of the migrated database for API smoke tests.

Creates `ariba_api_smoke` from the template `ariba_src` (so the validated database is
never touched) and adds three throw-away accounts with known passwords:
  smoke_hr   role=hr       (linked to an employee)
  smoke_emp  role=employee (linked to an employee with a manager)
  smoke_mgr  role=manager  (linked to that employee's manager)

Usage: backend\\.venv\\Scripts\\python.exe tools\\smoke\\smoke_setup.py [--src ariba_src] [--dst ariba_api_smoke]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import psycopg
from argon2 import PasswordHasher

PASSWORD = "SmokeTest!2026"


def _with_database(url: str, dbname: str) -> str:
    """Same server and credentials, another database (used for DROP/CREATE DATABASE)."""
    parts = urlsplit(url)
    return urlunsplit(parts._replace(path="/" + dbname))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="ariba_src")
    ap.add_argument("--dst", default="ariba_api_smoke")
    ap.add_argument("--host", default="localhost")
    ap.add_argument("--port", default=5432, type=int)
    ap.add_argument("--user", default="postgres")
    ap.add_argument("--url", default="", help="full postgres URL of the server (Railway TCP URL); "
                                              "the database in it is ignored, --dst is created instead")
    ap.add_argument("--no-copy", action="store_true",
                    help="do not create --dst; only add the smoke accounts to that existing database "
                         "(used for a deployed environment, e.g. Railway)")
    args = ap.parse_args()

    admin_dsn = _with_database(args.url, "postgres") if args.url else \
        f"host={args.host} port={args.port} user={args.user} dbname=postgres"
    if args.no_copy:
        dsn = _with_database(args.url, args.dst) if args.url else \
            f"host={args.host} port={args.port} user={args.user} dbname={args.dst}"
        print(f"using the existing database {args.dst}")
    else:
        with psycopg.connect(admin_dsn, autocommit=True) as admin:
            admin.execute(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=%s AND pid<>pg_backend_pid()",
                (args.dst,),
            )
            admin.execute(f'DROP DATABASE IF EXISTS "{args.dst}" WITH (FORCE)')
            admin.execute(f'CREATE DATABASE "{args.dst}" TEMPLATE "{args.src}"')
        print(f"created {args.dst} from template {args.src}")
        dsn = _with_database(args.url, args.dst) if args.url else \
            f"host={args.host} port={args.port} user={args.user} dbname={args.dst}"

    hashed = PasswordHasher().hash(PASSWORD)
    info: dict[str, object] = {"password": PASSWORD, "database": args.dst}
    with psycopg.connect(dsn, autocommit=True) as db:
        rows = db.execute(
            """SELECT employee_id, manager_id, name_ar FROM public.employee_directory
               WHERE active ORDER BY employee_id"""
        ).fetchall()
        if not rows:
            raise SystemExit("no active employees found")
        emp = next((r for r in rows if r[1] and r[1] != r[0]), rows[0])
        employee_id, manager_id, name_ar = emp
        ids = [r[0] for r in rows]
        others = [i for i in ids if i not in {employee_id, manager_id}]
        if not others or manager_id is None:
            raise SystemExit("need an active employee with a manager plus one more employee")
        hr_employee = others[0]

        def take_account(label: str, where: str, params: tuple = ()):
            sql = f"""SELECT id, username, employee_id, role FROM public.ariba_auth_accounts
                      WHERE active AND employee_id IS NOT NULL AND {where}
                      ORDER BY username LIMIT 1"""
            found = db.execute(sql, params).fetchone()
            if found is None:
                raise SystemExit(f"no active account found for {label}")
            db.execute(
                """UPDATE public.ariba_auth_accounts
                   SET password_hash=%s, must_change=false, active=true WHERE id=%s""",
                (hashed, found[0]),
            )
            return {"label": label, "username": found[1], "employee_id": found[2], "role": found[3]}

        # The legacy export has no hr/manager roles: HR = admin/admin_manager, and a manager is
        # any employee whose manager_id points at them (workflow_requests current_stage='manager').
        accounts = [
            take_account("admin", "role IN ('hr','admin','admin_manager')"),
            take_account("plain_employee",
                         "role='employee' AND employee_id IN (SELECT employee_id FROM public.employee_directory "
                         "WHERE manager_id IS NULL)"),
            take_account("requester",
                         "role='employee' AND employee_id IN (SELECT d.employee_id FROM public.employee_directory d "
                         "JOIN public.ariba_auth_accounts m ON m.employee_id=d.manager_id AND m.active "
                         "WHERE d.manager_id IS NOT NULL AND d.manager_id<>d.employee_id)"),
            take_account("hr_approver",
                         "employee_id IN (SELECT employee_id FROM public.workflow_approvers WHERE stage='hr')"),
            take_account("ceo_approver",
                         "employee_id IN (SELECT employee_id FROM public.workflow_approvers WHERE stage='ceo')"),
        ]
        if len({a["employee_id"] for a in accounts}) != len(accounts):
            print("warning: smoke accounts share employees")
        db.execute("DELETE FROM public.ariba_sessions")
        by_label = {a["label"]: a for a in accounts}
        requester_emp = by_label["requester"]["employee_id"]

        emp = db.execute(
            """SELECT employee_id, manager_id, name_ar FROM public.employee_directory
               WHERE employee_id=%s""",
            (requester_emp,),
        ).fetchone()
        employee_id, manager_id, name_ar = emp if emp else (requester_emp, None, None)
        loc = db.execute(
            "SELECT id, name, latitude, longitude FROM public.work_locations WHERE active ORDER BY id LIMIT 1"
        ).fetchone()
        info.update({
            "accounts": accounts,
            "employee_with_manager": {"employee_id": employee_id, "manager_id": manager_id, "name_ar": name_ar},
            "work_location": {"id": loc[0], "name": loc[1], "lat": float(loc[2]), "lng": float(loc[3])} if loc else None,
        })
    out = Path(__file__).resolve().parents[2] / "_smoke_info.json"  # repository root, like api_smoke.py
    out.write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {out}")
    for a in info.get("accounts", []):  # type: ignore[union-attr]
        print(f"  {a['label']:<15} {a['username']:<12} employee={a['employee_id']:<18} role={a['role']}")
    print(f"  requester employee: {info['employee_with_manager']['employee_id']} "  # type: ignore[index]
          f"manager={info['employee_with_manager']['manager_id']}")  # type: ignore[index]
    print(f"  work location: {info['work_location']['id']} "  # type: ignore[index]
          f"({info['work_location']['lat']},{info['work_location']['lng']})")  # type: ignore[index]
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
