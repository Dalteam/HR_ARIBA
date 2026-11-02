"""Demo data for the direct manager's screen (Stage 2), on a throwaway copy of the database.

    backend\\.venv\\Scripts\\python.exe tools\\smoke\\manager_demo_seed.py
    ... --src ariba_src --dst ariba_manager_demo      (default: a fresh copy, then seed it)
    ... --dst ariba_manager_demo --no-copy            (seed that database as it is)

It creates a manager with three reports (one delegated to him, one not, one with nothing), a
report who belongs to somebody else, an HR login, the manager's permissions, the `manager_team_salary`
setting (off, so the salary is hidden until HR turns it on) and three team requests to look at.

For Stage 3 it also seeds a **goal cycle**: targets for two reports, one approved evaluation (the one
the employee sees), one pending (waiting for HR, hidden from the employee) and one draft (only the
manager sees it), plus a second manager with his own report so "another team's manager" can be tried.

For Stage 5 it seeds the **letter chain** — one letter waiting for EMP1's signature that will need
his manager, one that closes at his signature, one waiting for DEMO-MGR's signature, one waiting at
HR and one the manager refused — plus the `doc_sign_cfg` setting (`hr_closes` off, `onboarding`
needs a manager), a sick-leave PDF and an annual-leave PDF the manager may open, and an iqama scan he
may **not** open (S1's two doors and no third).

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
#: A second manager and his report: the "another team's manager" refusal needs a real second team.
MANAGER2 = "DEMO-MGR2"
REPORT4 = "DEMO-EMP4"
DEMO_IDS = (MANAGER, *REPORTS, OUTSIDER, HR_EMPLOYEE, MANAGER2, REPORT4)

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


def _lookup_row(db, table: str, code: str, name_ar: str) -> None:
    """Make sure one lookup code exists: the copy's lists may predate the letter types (they are FKs)."""
    db.execute(f"""INSERT INTO public.{table}(code,name_ar) VALUES (%s,%s)
        ON CONFLICT (code) DO UPDATE SET name_ar=EXCLUDED.name_ar""", (code, name_ar))


#: The letter types the demo sends (`workflow_requests.request_type` is an FK to this list).
LETTER_TYPES = {"onboarding": "خطاب تعريف بالعمل", "salary_cert": "شهادة راتب", "custom": "خطاب"}


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
    db.execute("DELETE FROM public.ariba_doc_signing WHERE employee_id = ANY(%(ids)s) "
               "OR request_id IN (SELECT id FROM public.workflow_requests "
               "WHERE employee_id = ANY(%(ids)s))", params)

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
    db.execute("DELETE FROM public.ariba_targets "
               "WHERE employee_id = ANY(%(ids)s) OR created_by = ANY(%(ids)s)", params)
    db.execute("DELETE FROM public.ariba_evaluations WHERE employee_id = ANY(%(ids)s) "
               "OR evaluator_id = ANY(%(ids)s) OR approved_by = ANY(%(ids)s)", params)
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
    job_id = job_ids["manager" if employee_id in (MANAGER, MANAGER2) else "employee"]
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


def _pdf(line: str) -> bytes:
    """A minimal one-page PDF: the bytes only have to be something a viewer opens."""
    stream = f"BT /F1 12 Tf 40 800 Td ({line}) Tj ET".encode("ascii", "replace")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> "
        b"/Contents 4 0 R >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % number + body + b"\nendobj\n"
    start = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    for offset in offsets:
        out += b"%010d 00000 n \n" % offset
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, start)
    return bytes(out)


#: 1×1 PNG: the "signature" the seeded letters carry, so the app's sheet shows an image.
_SIGNATURE = ("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/"
              "q842iQAAAABJRU5ErkJggg==")


def letter_html(title: str, *, signed: bool = False) -> str:
    """A bilingual sheet in the shape the app's two viewers read (marker included)."""
    signature = f"<p>التوقيع:</p><img src='data:image/png;base64,{_SIGNATURE}' alt='signature'>" if signed else ""
    return ("<html><head><meta charset='utf-8'></head><body dir='rtl'>"
            f"<h1>{title}</h1><p>نص الخطاب التجريبي.</p>{signature}<!--ARIBA_EN-->"
            f"<div dir='ltr'><h2>{title}</h2><p>Demo letter body.</p></div></body></html>")


def _file(db, employee_id: str, request_id, document_type: str, file_name: str, mime: str,
          data: bytes) -> str:
    """One file filed under an employee: a leave's paper, or an ID scan nothing should open."""
    row = db.execute("""INSERT INTO public.ariba_documents
        (employee_id,request_id,document_type,file_name,mime_type,file_data,uploaded_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                     (employee_id, request_id, document_type, file_name, mime, data,
                      employee_id)).fetchone()
    return str(row[0])


def _letter(db, employee_id: str, letter_type: str, title: str, stage: str, *, days_ago: int = 1,
            signing: str | None = None, needs_manager: bool = False,
            manager_id: str | None = None, reason: str | None = None) -> dict:
    """One sent letter: the request, the HTML HR sent, an optional signed copy and its chain row.

    `stage` is the request's `current_stage` (`employee`, `manager`, `hr`, `rejected`) and `signing`
    is the chain row's own `stage` — `None` while the employee has not acted yet."""
    sent = letter_html(title)
    row = db.execute("""INSERT INTO public.workflow_requests
        (employee_id,request_type,payload,current_stage,created_at,updated_at,completed_at)
        VALUES (%s,%s,%s::jsonb,%s, now() - make_interval(days => %s), now() - make_interval(days => %s),
                CASE WHEN %s = 'completed' THEN now() - make_interval(days => %s) END)
        RETURNING id""",
                     (employee_id, "template:" + letter_type,
                      json.dumps({"title": title, "template_type": letter_type, "sent_by": HR_EMPLOYEE},
                                 ensure_ascii=False),
                      stage, days_ago, days_ago, stage, days_ago)).fetchone()
    request_id = row[0]
    db.execute("""INSERT INTO public.workflow_actions(request_id,actor_account_id,stage,action,comment)
        VALUES (%s,NULL,'hr','submitted',%s)""", (request_id, title))
    letter_id = _file(db, employee_id, request_id, "letter", title + ".html", "text/html",
                      sent.encode("utf-8"))
    signed_id = None
    if signing:
        signed_id = _file(db, employee_id, request_id, "signed_document", title + "-signed.html",
                          "text/html", letter_html(title, signed=True).encode("utf-8"))
        db.execute("""INSERT INTO public.ariba_doc_signing
            (request_id,document_id,employee_id,needs_manager,manager_id,stage,emp_signed_at,
             mgr_signed_at,reject_reason,updated_at)
            VALUES (%s,%s,%s,%s,%s,%s, now() - make_interval(days => %s),
                    CASE WHEN %s IN ('hr','rejected') THEN now() - make_interval(days => %s) END, %s, now())""",
                   (request_id, signed_id, employee_id, needs_manager, manager_id, signing, days_ago,
                    signing, days_ago, reason))
        if signing == "rejected":
            db.execute("""INSERT INTO public.workflow_actions(request_id,actor_account_id,stage,action,comment)
                VALUES (%s,NULL,'manager','rejected',%s)""", (request_id, reason))
    return {"request_id": str(request_id), "letter_document_id": str(letter_id),
            "signed_document_id": str(signed_id) if signed_id else None}


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
    _employee(db, MANAGER2, "مدير فريق آخر", "Second Demo Manager", job=JOBS["manager"], manager_id=None,
              salary=21000, department_id=department_id, job_ids=job_ids)
    _employee(db, REPORT4, "موظف الفريق الآخر", "Other Team Employee", job=JOBS["employee"],
              manager_id=MANAGER2, salary=8800, department_id=department_id, job_ids=job_ids)

    accounts = [("demo_mgr", MANAGER, "employee"), ("demo_emp1", REPORTS[0], "employee"),
                ("demo_emp2", REPORTS[1], "employee"), ("demo_emp3", REPORTS[2], "employee"),
                ("demo_out", OUTSIDER, "employee"), ("demo_hr", HR_EMPLOYEE, "admin"),
                ("demo_mgr2", MANAGER2, "employee"), ("demo_emp4", REPORT4, "employee")]
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
    # A sick leave that is running now: the manager must see "away until", never "sick" and never this
    # note - the availability tab answers who is away, not why (BUSINESS_RULES P7).
    sick = _request(db, REPORTS[1], "sick",
                    {"from": (today - timedelta(days=1)).isoformat(),
                     "to": (today + timedelta(days=1)).isoformat(), "days": 3}, "completed", 2,
                    notes="تقرير طبي - عملية جراحية")
    rejected = _request(db, REPORTS[1], "salary_advance", {"amount": 3000, "notes": "ظرف طارئ"}, "rejected", 12,
                        notes="ظرف طارئ")

    # ---- Stage 5: the signing chain (S3–S12) -------------------------------------------------------
    # `hr_closes` off and `onboarding` needing the manager — the seeded defaults the business runs on.
    for code, name in LETTER_TYPES.items():
        _lookup_row(db, "workflow_request_types", "template:" + code, name)
    db.execute("""INSERT INTO public.ariba_app_settings(key,value,updated_by,updated_at)
        VALUES ('doc_sign_cfg','{"hr_closes": false, "manager_types": ["onboarding"]}'::jsonb,
                'manager_demo_seed',now())
        ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now()""")
    letters = {
        # waiting for DEMO-EMP1: signing it sends it to his manager (onboarding needs one)
        "to_sign_with_manager": _letter(db, REPORTS[0], "onboarding", "خطاب تعريف بالعمل", "employee"),
        # waiting for DEMO-EMP1: signing it closes it, because a salary certificate needs no manager
        "to_sign_alone": _letter(db, REPORTS[0], "salary_cert", "شهادة راتب", "employee", days_ago=2),
        # signed by DEMO-EMP2, waiting for DEMO-MGR — his queue, and the one document he may open
        "waiting_for_manager": _letter(db, REPORTS[1], "onboarding", "خطاب تعريف بالعمل", "manager",
                                       days_ago=3, signing="manager", needs_manager=True,
                                       manager_id=MANAGER),
        # signed by DEMO-EMP3 and his manager, waiting at HR (hr_closes is off: HR may not close it)
        "waiting_for_hr": _letter(db, REPORTS[2], "onboarding", "خطاب تعريف بالعمل", "hr", days_ago=4,
                                  signing="hr", needs_manager=True, manager_id=MANAGER),
        # refused by DEMO-MGR: closed for good, and DEMO-EMP3 sees the reason
        "rejected": _letter(db, REPORTS[2], "onboarding", "خطاب إنهاء", "rejected", days_ago=6,
                            signing="rejected", needs_manager=True, manager_id=MANAGER,
                            reason="البيانات غير مكتملة"),
    }
    # The paper behind two claims: DEMO-MGR may open both (leave attachments, all types), and the
    # iqama scan below is the one document he may not open at all (S1's two doors).
    files = {
        "sick_report": _file(db, REPORTS[1], sick, "employee_upload", "sick-report.pdf",
                             "application/pdf", _pdf("Demo sick leave report")),
        "annual_ticket": _file(db, REPORTS[0], pending, "employee_upload", "annual-ticket.pdf",
                               "application/pdf", _pdf("Demo annual leave ticket")),
        "iqama_scan": _file(db, REPORTS[0], None, "identity", "iqama-scan.pdf",
                            "application/pdf", _pdf("Demo iqama scan - HR only")),
    }

    return {"accounts": [{"username": u, "employee_id": e, "role": r} for u, e, r in accounts],

            "manager": {"employee_id": MANAGER, "reports": list(REPORTS), "outsider": OUTSIDER,
                        "hr": HR_EMPLOYEE},
            "second_manager": {"employee_id": MANAGER2, "report": REPORT4},
            "delegated": [REPORTS[0]], "not_delegated": [REPORTS[1]],
            "requests": {"approved_leave": str(approved), "pending_leave": str(pending),
                         "sick_leave": str(sick), "rejected_advance": str(rejected)},
            "letters": letters, "files": files,
            "goals": _goals(db), "tasks": _tasks(db)}



def _target(db, employee_id: str, period_type: str, period_key: str, title: str, *,
            target_value: float, actual_value: float, unit: str | None = None, weight: float = 1,
            status: str = "active", created_by: str = MANAGER) -> str:
    """One target row; `created_by` is the manager who set it."""
    row = db.execute(
        "INSERT INTO public.ariba_targets "
        "(employee_id,period_type,period_key,title,target_value,actual_value,weight,unit,status,created_by) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
        (employee_id, period_type, period_key, title, target_value, actual_value, weight, unit,
         status, created_by)).fetchone()
    return str(row[0])


def _item(target_id: str, title: str, target: float, actual: float, score: float, *,
          weight: float = 1, unit: str | None = None, comment: str = "",
          manual: bool = False) -> dict:
    """One evaluation item in the shape `port.ts` `EvalItem` declares."""
    return {"target_id": target_id, "title": title, "target": target, "unit": unit,
            "actual": actual, "weight": weight, "score": score, "comment": comment,
            "manual": manual}


def _evaluation(db, employee_id: str, period_type: str, period_key: str, items: list[dict],
                *, status: str, comments: str | None, overall: float, rating: str) -> str:
    """One evaluation in its state - `draft`, `pending` (waiting for HR) or `approved`."""
    row = db.execute(
        "INSERT INTO public.ariba_evaluations "
        "(employee_id,period_type,period_key,items,comments,overall,rating,status,evaluator_id,"
        " submitted_at,approved_by,approved_at) "
        "VALUES (%s,%s,%s,%s::jsonb,%s,%s,%s,%s,%s,"
        "        CASE WHEN %s <> 'draft' THEN now() END,"
        "        CASE WHEN %s = 'approved' THEN %s END,"
        "        CASE WHEN %s = 'approved' THEN now() END) RETURNING id",
        (employee_id, period_type, period_key, json.dumps(items, ensure_ascii=False), comments,
         overall, rating, status, MANAGER, status, status, HR_EMPLOYEE, status)).fetchone()
    return str(row[0])


def _goals(db) -> dict:
    """The Stage 3 demo: the goal cycle, three evaluation states and the approver setting.

    The monthly evaluation is **approved** (the employee sees it on their goals tab), the quarterly
    one is **pending** (the employee must not see it; HR signs it in the walk-through) and the annual
    one is a **draft** (only the manager sees it). The second manager gets one approved evaluation of
    his own report, so nothing of the first team is reachable from him.
    """
    year = str(date.today().year)
    month = f"{year}-{date.today().month:02d}"
    quarter = f"{year}-Q{(date.today().month - 1) // 3 + 1}"

    sales = _target(db, REPORTS[0], "annual", year, "زيادة المبيعات", target_value=200,
                    actual_value=150, unit="صفقة")
    satisfaction = _target(db, REPORTS[0], "annual", year, "رضا العملاء", target_value=90,
                           actual_value=82, unit="درجة")
    response = _target(db, REPORTS[0], "annual", year, "زمن الرد على الطلبات", target_value=24,
                       actual_value=20, unit="ساعة", status="done")
    project = _target(db, REPORTS[0], "quarterly", quarter, "مشروع الربع", target_value=100,
                      actual_value=40, unit="%")
    _target(db, REPORTS[1], "annual", year, "تقارير المشاريع", target_value=12, actual_value=7,
            unit="تقرير")
    other = _target(db, REPORT4, "annual", year, "مهام الفريق الآخر", target_value=50,
                    actual_value=25, unit="%", created_by=MANAGER2)

    approved = _evaluation(db, REPORTS[0], "monthly", month, [
        _item(sales, "زيادة المبيعات", 200, 150, 75, weight=2, unit="صفقة", comment="أداء ثابت"),
        _item(satisfaction, "رضا العملاء", 90, 82, 91, unit="درجة"),
        _item(response, "زمن الرد على الطلبات", 24, 20, 83, unit="ساعة")],
        status="approved", comments="شهر جيد، واصل بنفس الوتيرة.", overall=81.0, rating="جيد جداً")
    pending = _evaluation(db, REPORTS[0], "quarterly", quarter, [
        _item(project, "مشروع الربع", 100, 40, 70, unit="%",
              comment="التقدّم أبطأ من الخطة، لكن الجودة جيدة.")],
        status="pending", comments="بانتظار اعتماد الموارد البشرية.", overall=70.0, rating="جيد")
    draft = _evaluation(db, REPORTS[0], "annual", year, [
        _item(sales, "زيادة المبيعات", 200, 150, 75, unit="صفقة"),
        _item(satisfaction, "رضا العملاء", 90, 82, 90, unit="درجة"),
        _item(response, "زمن الرد على الطلبات", 24, 20, 85, unit="ساعة")],
        status="draft", comments=None, overall=83.3, rating="جيد جداً")
    _evaluation(db, REPORT4, "annual", year, [
        _item(other, "مهام الفريق الآخر", 50, 25, 50, unit="%")],
        status="approved", comments="يحتاج متابعة.", overall=50.0, rating="مقبول")

    # HR signs evaluations by default; the setting is explicit so the demo shows where it lives.
    db.execute("""INSERT INTO public.ariba_app_settings(key,value,updated_by,updated_at)
        VALUES ('goals_config','{"evaluation_approver": "hr"}'::jsonb,'manager_demo_seed',now())
        ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,
        updated_at=now()""")
    # The second manager may evaluate his own team - and still must not reach the first team.
    db.execute("""INSERT INTO public.ariba_manager_perms(manager_id,perms,updated_by,updated_at)
        VALUES (%s,%s::jsonb,'manager_demo_seed',now())""",
        (MANAGER2, json.dumps({"view_team": True, "view_team_data": True, "view_team_leaves": True,
                               "manage_targets": True, "evaluate_team": True})))
    return {"periods": {"year": year, "quarter": quarter, "month": month},
            "evaluations": {"approved_monthly": approved, "pending_quarterly": pending,
                            "draft_annual": draft},
            "targets": {"annual": 3, "quarterly": 1, "second_team": 1}}


def _task(db, batch_id: str, kind: str, title: str, *, to: str, details: str | None = None,
          due: str | None = None, start: str | None = None, end: str | None = None,
          location: str | None = None, status: str = "open", note: str | None = None,
          created_by: str = MANAGER) -> str:
    """One row of `ariba_tasks` - the table keeps an assignee per row, so a batch is several rows."""
    row = db.execute(
        "INSERT INTO public.ariba_tasks "
        "(batch_id,kind,title,details,due_date,start_at,end_at,location,created_by,assignee_id,"
        " status,response_note) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
        (batch_id, kind, title, details, due, start, end, location, created_by, to, status,
         note)).fetchone()
    return str(row[0])


def _tasks(db) -> dict:
    """The Stage 4 demo: one open task, one open meeting, one finished task, one cancelled meeting.

    The first demo employee's inbox therefore holds a task to finish *and* an invitation to accept or
    decline; the manager's sent box shows what he handed out. Every date is in the future, so the
    screen never has to explain a deadline that has already gone by.
    """
    today = date.today()
    task_batch = str(uuid.uuid4())
    open_task = _task(db, task_batch, "task", "إعداد تقرير الأداء الشهري", to=REPORTS[0],
                      details="الملف بصيغة PDF قبل نهاية الأسبوع.",
                      due=(today + timedelta(days=5)).isoformat())
    meeting_batch = str(uuid.uuid4())
    day = (today + timedelta(days=2)).isoformat()
    for report in (REPORTS[0], REPORTS[1]):
        _task(db, meeting_batch, "meeting", "اجتماع مراجعة الربع", to=report,
              details="مراجعة نتائج الربع وخطة الشهر القادم.", start=f"{day}T10:00:00+03:00",
              end=f"{day}T11:00:00+03:00", location="قاعة الاجتماعات 2")
    _task(db, str(uuid.uuid4()), "task", "تحديث بيانات العملاء", to=REPORTS[1],
          details="قائمة العملاء في الملف المشترك.", status="done",
          due=(today - timedelta(days=2)).isoformat())
    _task(db, str(uuid.uuid4()), "meeting", "ورشة داخلية", to=REPORTS[2],
          start=f"{(today + timedelta(days=4)).isoformat()}T09:00:00+03:00", status="cancelled")
    return {"open_task": open_task, "task_batch": task_batch, "meeting_batch": meeting_batch,
            "counts": {"sent": 5, "inbox_open_for_emp1": 2}}


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

    periods = info["goals"]["periods"]
    print("\n  goals and evaluations (Stage 3):")
    print("  demo_mgr  -> team tab -> the first demo employee -> goals: 4 targets for "
          + periods["year"])
    print("             -> evaluation: " + periods["month"] + " approved, " + periods["quarter"]
          + " awaiting approval, " + periods["year"] + " draft (manager only)")
    print("  demo_hr   -> signs the pending quarterly evaluation "
          "(POST /evaluations/{id}/approve)")
    print("  demo_emp1 -> goals tab: the " + periods["month"]
          + " result is there, the " + periods["quarter"] + " one is not")
    print("  demo_mgr2 -> team-goals for DEMO-EMP1 is refused (403 for targets, 404 for a row)")

    print("\n  tasks, meetings and availability (Stage 4):")
    print("  demo_mgr  -> team tab -> tasks: his three reports with their leaves, an open task and an")
    print("             invitation he sent (sent box: 5 rows, one finished and one cancelled)")
    print("             DEMO-EMP1 is away (annual), DEMO-EMP2 is away — «إجازة», no type, no reason")
    print("  demo_emp1 -> tasks: one open task to finish and one open invitation to accept or decline")
    print("  demo_hr   -> availability lists every active employee")
    print("  demo_mgr2 -> availability lists only DEMO-EMP4")

    print("\n  the letter chain and the viewer (Stage 5):")
    print("  demo_emp1 -> documents: two letters to sign — «خطاب تعريف بالعمل» (goes to his manager)")
    print("             and «شهادة راتب» (closes at his own signature)")
    print("  demo_mgr  -> documents: «مستندات بانتظار توقيعي كمدير» holds DEMO-EMP2's onboarding letter;")
    print("             the sick-leave report and the annual-leave ticket open for him, the iqama scan is 404")
    print("  demo_hr   -> /letters lists the letter waiting at HR; POST /letters/{id}/approve answers 409")
    print("             not_waiting_for_hr while hr_closes is off (S10)")
    print("  demo_emp3 -> documents: the refused letter, with the manager's reason")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
