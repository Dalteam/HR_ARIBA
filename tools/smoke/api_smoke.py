"""End-to-end smoke test of the canonical API against a running backend.

Drives the real HTTP surface (login → employee app → requests → manager/HR/CEO approvals →
payroll sheets → documents → HR administration) on the disposable database prepared by
`tools/smoke/smoke_setup.py`, and records every call in a readable table:

    PASS  the call returned 2xx
    RULE  the call returned a documented business rule (4xx with an error code)
    STUB  the call returned 501 feature_unavailable (documented: not in the canonical schema)
    FAIL  the call returned 5xx or never reached the server  ← what must be zero

Usage:
    backend\\.venv\\Scripts\\python.exe tools\\smoke\\api_smoke.py [--base http://127.0.0.1:8000]

Against a deployed backend add `--url <DATABASE_PUBLIC_URL>`; the cleanup step then deletes the
throw-away rows it created in that database instead of the local one.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]  # repository root (this file lives in tools/smoke)
RESULTS: list[dict[str, Any]] = []


class Api:
    def __init__(self, base: str) -> None:
        self.base = base.rstrip("/")
        self.api = self.base + "/api/v1"
        self.tokens: dict[str, str] = {}
        self.refresh_tokens: dict[str, str] = {}

    # ------------------------------------------------------------------ transport
    def call(self, method: str, path: str, body: Any = None, token: str | None = None,
             raw: bytes | None = None, content_type: str | None = None) -> tuple[int, Any, bytes]:
        url = path if path.startswith("http") else self.api + path
        data: bytes | None = None
        headers: dict[str, str] = {"Accept": "application/json"}
        if raw is not None:
            data = raw
            headers["Content-Type"] = content_type or "application/octet-stream"
        elif body is not None:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if token:
            headers["Authorization"] = "Bearer " + token
        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        started = time.perf_counter()
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                payload = response.read()
                status = response.status
        except urllib.error.HTTPError as exc:
            payload = exc.read()
            status = exc.code
        except Exception as exc:  # connection refused, timeout, DNS …
            RESULTS.append({"method": method, "path": path, "status": 0, "verdict": "FAIL",
                            "ms": int((time.perf_counter() - started) * 1000), "detail": f"{type(exc).__name__}: {exc}"})
            return 0, None, b""
        parsed: Any = None
        if payload:
            try:
                parsed = json.loads(payload.decode("utf-8"))
            except (ValueError, UnicodeDecodeError):
                parsed = None
        RESULTS.append({"method": method, "path": path, "status": status, "verdict": "",
                        "ms": int((time.perf_counter() - started) * 1000), "detail": "", "data": parsed,
                        "bytes": len(payload)})
        return status, parsed, payload

    @staticmethod
    def code(data: Any) -> str | None:
        if isinstance(data, dict):
            if isinstance(data.get("error"), dict):
                return data["error"].get("code")
            if isinstance(data.get("detail"), dict):
                return data["detail"].get("code")
            for key in ("code", "error_code"):
                if isinstance(data.get(key), str):
                    return data[key]
        return None

    def check(self, expect: int | tuple[int, ...], method: str, path: str, body: Any = None,
              token: str | None = None, raw: bytes | None = None, content_type: str | None = None,
              allow: set[int] | None = None) -> tuple[int, Any]:
        """Call and grade the result. `allow` lists extra statuses that are legitimate here."""
        status, data, _ = self.call(method, path, body, token, raw, content_type)
        expected = (expect,) if isinstance(expect, int) else expect
        entry = RESULTS[-1]
        if status in expected:
            entry["verdict"] = "PASS"
        elif status == 501 and self.code(data) == "feature_unavailable":
            entry["verdict"] = "STUB"
        elif allow and status in allow:
            entry["verdict"] = "RULE"
        elif 400 <= status < 500 and self.code(data):
            entry["verdict"] = "RULE"
        elif status == 0:
            entry["verdict"] = "FAIL"
        else:
            entry["verdict"] = "FAIL"
        if entry["verdict"] in {"RULE", "FAIL"}:
            entry["detail"] = f"code={self.code(data)} {json.dumps(data, ensure_ascii=False)[:220] if data is not None else ''}"
        return status, data

    # ------------------------------------------------------------------ auth
    def login(self, label: str, username: str, password: str) -> dict[str, Any]:
        status, data = self.check(200, "POST", "/auth/login", {"username": username, "password": password})
        if status != 200 or not isinstance(data, dict) or not data.get("access_token"):
            raise SystemExit(f"login failed for {label}: {status} {data}")
        self.tokens[label] = data["access_token"]
        self.refresh_tokens[label] = str(data.get("refresh_token") or "")
        return data
def _png() -> bytes:
    """Smallest valid 1x1 PNG, used to post a photo through the documents API."""
    import base64
    return base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")


def _multipart(field: str, filename: str, payload: bytes, mime: str = "image/png") -> tuple[bytes, str]:
    boundary = "----smoke" + uuid.uuid4().hex
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"{field}\"; filename=\"{filename}\"\r\n"
        f"Content-Type: {mime}\r\n\r\n"
    ).encode("utf-8") + payload + f"\r\n--{boundary}--\r\n".encode("utf-8")
    return body, f"multipart/form-data; boundary={boundary}"


def _multipart_form(fields: dict[str, str], file_field: str, filename: str, payload: bytes,
                    mime: str = "application/octet-stream") -> tuple[bytes, str]:
    """Multipart body with text fields plus one file part (documents/photos upload)."""
    boundary = "----smoke" + uuid.uuid4().hex
    parts = [
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode("utf-8")
        for name, value in fields.items()
    ]
    parts.append(
        (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{file_field}\"; filename=\"{filename}\"\r\n"
         f"Content-Type: {mime}\r\n\r\n").encode("utf-8") + payload + b"\r\n"
    )
    parts.append(f"--{boundary}--\r\n".encode("utf-8"))
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def _resolve(template: str, values: dict[str, str]) -> str:
    out = template
    for key, value in values.items():
        out = out.replace("{" + key + "}", value)
    return out


def _query_value(name: str, day: date, employee_id: str) -> str | None:
    """A plausible value for a required query parameter, so the generic GET sweep can probe it."""
    return {"date": day.isoformat(), "day": day.isoformat(), "on": day.isoformat(),
            "month": day.strftime("%Y-%m"), "year": str(day.year),
            "date_from": (day - timedelta(days=30)).isoformat(), "from": (day - timedelta(days=30)).isoformat(),
            "date_to": day.isoformat(), "to": day.isoformat(), "employee_id": employee_id,
            "prefix": "pay_", "tab": "all", "q": "", "status": "pending", "type": "overtime"}.get(name)


def _cleanup(database: str, employee_id: str, account_id: str, host: str, port: int, user: str,
             url: str = "") -> str:
    """Delete the throw-away employee/account the write journey created (the API exposes no delete routes)."""
    try:
        import psycopg
    except ImportError:  # pragma: no cover - psycopg ships with the backend requirements
        return f"psycopg missing, employee {employee_id or '-'} left in {database}"
    statements: list[tuple[str, tuple]] = []
    if account_id:
        statements.append(("DELETE FROM public.ariba_sessions WHERE account_id=%s::uuid", (account_id,)))
        statements.append(("DELETE FROM public.ariba_auth_accounts WHERE id=%s::uuid", (account_id,)))
    if employee_id:
        statements += [
            ("DELETE FROM public.ariba_auth_accounts WHERE employee_id=%s", (employee_id,)),
            ("DELETE FROM public.employee_payrolls WHERE employee_id=%s", (employee_id,)),
            ("DELETE FROM public.attendance WHERE employee_id=%s", (employee_id,)),
            ("DELETE FROM public.employee_directory WHERE employee_id=%s", (employee_id,)),
        ]
    # the sheet block writes a synthetic payroll month (pay_2099_01) so it can be approved and unapproved
    statements += [
        ("DELETE FROM public.employee_payrolls WHERE pay_year=2099 AND pay_month=1", ()),
        ("DELETE FROM public.payroll_archives_v2 WHERE pay_year=2099 AND pay_month=1", ()),
    ]
    problems = []
    dsn = url or f"host={host} port={port} user={user} dbname={database}"
    try:
        with psycopg.connect(dsn, autocommit=True) as db:
            for sql, params in statements:
                try:
                    db.execute(sql, params)
                except Exception as exc:  # a table that does not exist in this schema is not a failure
                    problems.append(f"{sql.split()[2]}: {type(exc).__name__}")
    except Exception as exc:  # pragma: no cover - the smoke database may already be gone
        return f"cleanup connection failed ({type(exc).__name__}: {exc}), employee {employee_id or '-'} left in {database}"
    removed = ", ".join(x for x in (f"employee {employee_id}" if employee_id else "",
                                    f"account {account_id}" if account_id else "", "pay_2099_01") if x)
    return f"removed {removed}" + (f" (skipped: {', '.join(problems)})" if problems else "")


def _report(results: list[dict[str, Any]], api: Api, database: str, out: str,
            notes: list[str] | None = None) -> int:
    counts: dict[str, int] = {}
    for r in results:
        counts[r["verdict"]] = counts.get(r["verdict"], 0) + 1
    width = max((len(f"{r['method']} {r['path']}") for r in results), default=10)
    lines = ["api smoke test", f"base: {api.base}", f"database: {database}", ""]
    for r in results:
        label = f"{r['method']} {r['path']}"
        line = f"{r['verdict']:<5} {r['status']:>3} {r['ms']:>6}ms  {label:<{width}}"
        if r["detail"]:
            line += "  " + r["detail"]
        lines.append(line)
    for verdict, title in (("FAIL", "FAILURES (must be zero)"),
                           ("RULE", "business rules encountered (expected refusals, review them)"),
                           ("STUB", "documented 501 gaps (not in the canonical schema)")):
        group = [r for r in results if r["verdict"] == verdict]
        if group:
            lines += ["", f"{title}: {len(group)}"]
            for r in group:
                lines.append(f"  {r['status']:>3} {r['method']} {r['path']}  {r['detail'][:180]}")
    lines += [""]
    if notes:
        lines += ["notes:"] + [f"  {note}" for note in notes]
    lines.append("summary: " + "  ".join(f"{k}={v}" for k, v in sorted(counts.items())))
    failures = [r for r in results if r["verdict"] == "FAIL"]
    lines.append("RESULT: " + ("FAIL" if failures else "OK"))
    text = "\n".join(lines)
    Path(out).write_text(text, encoding="utf-8")
    print(text)
    return 1 if failures else 0

def main() -> int:
    ap = argparse.ArgumentParser(description="Smoke-test a running canonical API against a disposable database copy.")
    ap.add_argument("--base", default="http://127.0.0.1:8000")
    ap.add_argument("--info", default=str(ROOT / "_smoke_info.json"),
                    help="accounts written by _tools/smoke_setup.py")
    ap.add_argument("--out", default=str(ROOT / "_api_smoke.txt"))
    ap.add_argument("--host", default="localhost")
    ap.add_argument("--port", default=5432, type=int)
    ap.add_argument("--user", default="postgres")
    ap.add_argument("--url", default="", help="full postgres URL for --cleanup (Railway: the public TCP URL)")
    args = ap.parse_args()

    info = json.loads(Path(args.info).read_text(encoding="utf-8"))
    accounts = {a["label"]: a for a in info["accounts"]}
    password = str(info["password"])
    database = str(info.get("database", "?"))
    today = date.today()
    api = Api(args.base)
    notes: list[str] = []

    def call(expect, method: str, path: str, who: str | None = None, body: Any = None,
             allow: set[int] | None = None, raw: bytes | None = None,
             content_type: str | None = None) -> tuple[int, Any]:
        return api.check(expect, method, path, body, api.tokens.get(who) if who else None,
                         raw, content_type, allow)

    # ------------------------------------------------------------------ reachability and sign-in
    call((200,), "GET", api.base + "/health")
    spec_status, spec = call((200,), "GET", api.base + "/openapi.json", allow={404})
    if spec_status != 200:
        spec = None                     # production hides the schema, so the generic sweep below is skipped
        notes.append("openapi.json is disabled on this environment: the generic GET sweep was skipped")
    for label in ("requester", "admin", "hr_approver", "ceo_approver", "plain_employee"):
        api.login(label, accounts[label]["username"], password)

    emp_id = accounts["requester"]["employee_id"]            # employee with a manager and work locations
    mgr_id = info["employee_with_manager"]["manager_id"]     # that employee's manager (also the CEO approver)
    plain_id = accounts["plain_employee"]["employee_id"]     # employee with no manager

    for label in ("admin", "ceo_approver", "plain_employee"):
        call((200,), "GET", "/me", label)
    call((200,), "POST", "/auth/refresh", body={"refresh_token": api.refresh_tokens["requester"]})
    api.check((401,), "GET", "/me")                          # no bearer token at all
    api.check((401,), "GET", "/me", token="not-a-jwt")       # tampered token
    call((401,), "POST", "/auth/login",
         body={"username": accounts["plain_employee"]["username"], "password": "definitely-wrong"})

    # ------------------------------------------------------------------ lookups the write journeys need
    _, lookups = call((200,), "GET", "/settings/lookups", "requester")
    workplaces = (lookups or {}).get("workplaces") if isinstance(lookups, dict) else []
    workplace_id = str(((workplaces or [{}])[0] or {}).get("id") or "")

    # ------------------------------------------------------------------ employee app reads
    for path in ("/me/employee", "/me/attendance", "/me/leave", "/me/requests", "/me/approvals",
                 "/me/team", "/me/payslips", "/me/notifications", "/me/letters", "/holidays",
                 "/locations", "/settings/company", "/settings/attendance"):
        call((200,), "GET", path, "requester")
    call((200,), "GET", f"/me/attendance/range?date_from={today - timedelta(days=30)}&date_to={today}", "requester")

    # ------------------------------------------------------------------ HR reads
    hr_reads = ("/employees", "/employees/counts", f"/employees/{emp_id}", "/dashboard", "/requests",
                "/requests?pending_now=true", f"/attendance?date={today}",
                "/attendance/summary?month=" + today.strftime("%Y-%m"),
                f"/attendance/range?date_from={today - timedelta(days=7)}&date_to={today}",
                "/leave/requests", "/leave/balances", f"/leave/employees/{emp_id}", "/settings/accounts",
                "/settings/gosi", f"/settings/gosi-rates?on={today}", "/registry/documents", "/sheets",
                "/payroll-archive", "/salary/basis", "/locations/assignments", "/letters", "/leave/holidays")
    for path in hr_reads:
        call((200,), "GET", path, "hr_approver")
    call((200,), "GET", "/employees?tab=active&q=&page=1&page_size=10", "hr_approver")

    # ------------------------------------------------------------------ authorization boundaries
    for path in ("/settings/accounts", "/sheets", "/salary/basis"):
        call((403,), "GET", path, "requester", allow={403})
    _, directory = call((200,), "GET", "/employees", "requester")   # the staff directory is scoped, not forbidden
    leaked = [str(item.get("id")) for item in ((directory or {}).get("items") or []) if str(item.get("id")) != emp_id]
    RESULTS.append({"method": "GET", "path": "/employees (scope check)", "status": 200,
                    "verdict": "PASS" if not leaked else "FAIL", "ms": 0,
                    "detail": "" if not leaked else f"an employee can see other employees: {leaked[:5]}"})
    call((200,), "GET", "/employees", "ceo_approver")
    call((200,), "GET", f"/employees/{emp_id}", "ceo_approver")

    # ------------------------------------------------------------------ punch journey (employee app, then HR cleanup)
    _, attendance = call((200,), "GET", "/me/attendance", "requester")
    before_ids = {str(row.get("id")) for row in ((attendance or {}).get("today") or [])}
    lat, lng = float(info["work_location"]["lat"]), float(info["work_location"]["lng"])
    for loc in ((attendance or {}).get("locations") or []):
        if loc.get("latitude") is not None and loc.get("longitude") is not None:
            lat, lng = float(loc["latitude"]), float(loc["longitude"])
            break
    punch_in = {"action": "in", "lat": lat, "lng": lng}
    punch_out = {"action": "out", "lat": lat, "lng": lng}
    status, _ = call((200, 409), "POST", "/me/attendance/punch", "requester", punch_in, allow={409})
    if status != 200:                      # already open from an earlier run: close it, then punch in again
        call((200, 409), "POST", "/me/attendance/punch", "requester", punch_out, allow={409})
        call((200, 409), "POST", "/me/attendance/punch", "requester", punch_in, allow={409})
    call((200, 409), "POST", "/me/attendance/punch", "requester", punch_out, allow={409})
    call((422,), "POST", "/me/attendance/punch", "requester", {"action": "lunch", "lat": lat, "lng": lng})
    call((422,), "POST", "/me/attendance/punch", "requester", {"action": "in"})
    _, after = call((200,), "GET", "/me/attendance", "requester")
    for row in ((after or {}).get("today") or []):   # keep the disposable copy tidy for the next run
        if str(row.get("id")) not in before_ids:
            call((204, 404), "DELETE", f"/attendance/{row['id']}", "hr_approver", allow={404})

    # ------------------------------------------------------------------ request + approval chain
    _, created = call((201,), "POST", "/me/requests", "requester",
                      {"type": "overtime", "on_date": (today - timedelta(days=1)).isoformat(),
                       "hours": 1, "notes": "smoke overtime"})
    req_id = str((created or {}).get("id") or "")
    if req_id:
        call((200,), "GET", "/me/requests", "requester")
        call((200,), "GET", "/me/approvals", "ceo_approver")
        call((200, 403), "POST", f"/me/approvals/{req_id}", "ceo_approver", {"action": "approve"}, allow={403})
        call((200, 403), "POST", f"/me/approvals/{req_id}", "requester", {"action": "approve"}, allow={403})
        call((200,), "POST", f"/requests/{req_id}/final-approve", "hr_approver", {"reason": "smoke final"})
        call((404,), "POST", f"/requests/{req_id}/final-approve", "hr_approver",
             {"reason": "already decided"}, allow={404})
        call((200,), "GET", "/requests", "hr_approver")
        call((204,), "DELETE", f"/requests/{req_id}", "hr_approver")

    _, second = call((201,), "POST", "/me/requests", "requester",
                     {"type": "overtime", "on_date": (today - timedelta(days=2)).isoformat(),
                      "hours": 2, "notes": "smoke negative path"})
    second_id = str((second or {}).get("id") or "")
    if second_id:
        call((422,), "POST", f"/me/approvals/{second_id}", "ceo_approver", {"action": "bogus"})
        call((422,), "POST", f"/me/approvals/{second_id}", "ceo_approver", {"action": "reject"})
        call((422,), "POST", "/me/requests", "requester",
             {"type": "overtime", "on_date": (today - timedelta(days=2)).isoformat(), "hours": 0})
        call((204,), "DELETE", f"/me/requests/{second_id}", "requester")
    call((422,), "POST", "/me/requests", "requester", {"type": "unheard_of"})

    # ------------------------------------------------------------------ forgot punch: submit, HR approve, HR clean up
    fp_day = today - timedelta(days=3)
    _, fp = call((201,), "POST", "/me/requests", "requester",
                 {"type": "forgot_punch", "punch_kind": "in", "on_date": fp_day.isoformat(),
                  "time_from": "08:00", "notes": "smoke forgot punch"})
    fp_id = str((fp or {}).get("id") or "")
    if fp_id:
        call((200,), "POST", f"/requests/{fp_id}/final-approve", "hr_approver", {"reason": "smoke approval"})
        call((200,), "GET", f"/me/attendance/range?date_from={fp_day}&date_to={fp_day}", "requester")
        _, fp_rows = call((200,), "GET", f"/attendance?date={fp_day}", "hr_approver")
        call((204,), "DELETE", f"/requests/{fp_id}", "hr_approver")
        for row in (fp_rows if isinstance(fp_rows, list) else []):
            if str(row.get("employee_id")) == emp_id and str(row.get("date"))[:10] == fp_day.isoformat():
                call((204, 404), "DELETE", f"/attendance/{row['id']}", "hr_approver", allow={404})

    # ------------------------------------------------------------------ attendance administration
    manual_day = today - timedelta(days=5)
    _, manual = call((201,), "POST", "/attendance", "hr_approver",
                     {"employee_id": emp_id, "work_date": manual_day.isoformat(), "time_in": "09:00",
                      "time_out": "17:00", "status": "present", "notes": "smoke manual"})
    rec_id = str((manual or {}).get("id") or "")
    if rec_id:
        call((200,), "PATCH", f"/attendance/{rec_id}", "hr_approver", {"notes": "smoke manual updated"})
        call((422,), "PATCH", f"/attendance/{rec_id}", "hr_approver", {})
        call((204,), "DELETE", f"/attendance/{rec_id}", "hr_approver")
        call((404,), "DELETE", f"/attendance/{rec_id}", "hr_approver", allow={404})
    open_day = today - timedelta(days=6)
    _, open_rec = call((201,), "POST", "/attendance", "hr_approver",
                       {"employee_id": emp_id, "work_date": open_day.isoformat(), "time_in": "09:00"})
    open_id = str((open_rec or {}).get("id") or "")
    if open_id:
        call((409,), "POST", "/attendance", "hr_approver",
             {"employee_id": emp_id, "work_date": open_day.isoformat(), "time_in": "10:00"}, allow={409})
        call((204,), "DELETE", f"/attendance/{open_id}", "hr_approver")
    call((403,), "POST", "/attendance", "requester",
         {"employee_id": emp_id, "work_date": manual_day.isoformat(), "time_in": "09:00"}, allow={403})

    # ------------------------------------------------------------------ payroll sheets (a far-future month keeps real data untouched)
    month_key = "pay_2099_01"
    sheet_row = {"id": emp_id, "empNo": "", "net": 100, "netSAR": 100}
    call((200,), "GET", f"/sheets/{month_key}", "admin")
    call((200,), "PUT", f"/sheets/{month_key}", "hr_approver", {"data": [sheet_row]})
    call((403,), "GET", f"/sheets/{month_key}", "requester", allow={403})
    call((200,), "POST", f"/sheets/{month_key}/approve", "hr_approver")
    call((409,), "PUT", f"/sheets/{month_key}", "hr_approver", {"data": [sheet_row]}, allow={409})
    call((200,), "POST", f"/sheets/{month_key}/unapprove", "hr_approver", {"reason": "smoke reopen"})
    call((200,), "PUT", f"/sheets/{month_key}", "hr_approver", {"data": []})
    call((404,), "POST", f"/sheets/{month_key}/approve", "hr_approver", allow={404})
    call((422,), "GET", "/sheets/not_a_payroll_key", "hr_approver")

    # ------------------------------------------------------------------ settings round trips (values read back, written unchanged)
    _, company = call((200,), "GET", "/settings/company", "hr_approver")
    call((200,), "PUT", "/settings/company", "hr_approver",
         {"company_name_ar": (company or {}).get("company_name_ar") or "",
          "company_name_en": (company or {}).get("company_name_en") or ""})
    _, attend_setting = call((200,), "GET", "/settings/attendance", "hr_approver")
    call((200,), "PUT", "/settings/attendance", "hr_approver",
         {key: (attend_setting or {}).get(key) for key in
          ("work_start", "tolerance_minutes", "remote_days_per_year", "flexible_enabled",
           "shift_hours", "window_start", "window_end")})
    _, gosi = call((200,), "GET", "/settings/gosi", "hr_approver")
    call((200,), "PUT", "/settings/gosi", "hr_approver", gosi or {})
    call((204,), "POST", "/settings/payroll-exclusion", "hr_approver", {"employee_id": emp_id, "exclude": False})
    call((501,), "POST", "/settings/lists/departments", "hr_approver", {"name": "smoke"})
    # ------------------------------------------------------------------ employee lifecycle + account administration
    new_emp, user_id = "", ""
    if workplace_id:
        _, new_employee = call((201,), "POST", "/employees", "hr_approver",
                               {"name_ar": "موظف اختبار الدخان", "name_en": "Smoke Test Employee",
                                "workplace_id": workplace_id, "join_date": today.isoformat(),
                                "nationality": "Saudi"})
        new_emp = str((new_employee or {}).get("id") or (new_employee or {}).get("employee_id") or "")
    call((422,), "POST", "/employees", "hr_approver", {"name_ar": "بلا جهة عمل"})
    if new_emp:
        call((200,), "GET", f"/employees/{new_emp}", "hr_approver")
        call((200,), "PATCH", f"/employees/{new_emp}", "hr_approver", {"name_en": "Smoke Test Updated"})
        call((501,), "GET", f"/employees/{new_emp}/dependents", "hr_approver")
        call((200,), "POST", f"/employees/{new_emp}/terminate", "hr_approver",
             {"termination_date": today.isoformat(), "article": "85", "reason": "smoke termination"})
        call((200,), "POST", f"/employees/{new_emp}/reactivate", "hr_approver")
        call((200,), "POST", "/employees/salary-preview", "hr_approver",
             {"nationality_id": "Saudi", "basic_salary": 5000, "housing_allowance": 1250})
        _, account = call((200,), "POST", "/auth/users", "hr_approver",
                          {"employee_id": new_emp, "role": "employee"})
        user_id = str(((account or {}).get("user") or {}).get("id") or "")
        if user_id:
            call((200,), "GET", f"/auth/users/by-employee/{new_emp}", "hr_approver")
            call((200,), "PATCH", f"/auth/users/{user_id}", "hr_approver",
                 {"role": "employee", "is_active": True})
            call((200,), "POST", f"/auth/users/{user_id}/temporary-password", "hr_approver")
        call((409,), "POST", "/auth/users", "hr_approver",
             {"employee_id": new_emp, "role": "employee"}, allow={409})
        call((200,), "PATCH", f"/employees/{new_emp}", "hr_approver", {"manager_id": ""})

    # ------------------------------------------------------------------ letters (HR sends, employee answers)
    _, letter = call((200,), "POST", "/letters", "hr_approver",
                     {"employee_id": emp_id, "title": "خطاب اختبار الدخان",
                      "html": "<p>smoke letter</p>", "type": "custom"})
    letter_id = str((letter or {}).get("id") or "")
    if letter_id:
        call((200,), "GET", "/letters", "hr_approver")
        call((200,), "GET", "/me/letters", "requester")
        call((200,), "GET", f"/letters/{letter_id}/html", "requester")
        call((422,), "POST", f"/me/letters/{letter_id}/respond", "requester",
             {"action": "rejected", "reason": "no"})
        call((200,), "POST", f"/me/letters/{letter_id}/respond", "requester", {"action": "rejected",
                                                                             "reason": "smoke rejection"})
        call((404,), "POST", f"/me/letters/{letter_id}/respond", "requester",
             {"action": "approved"}, allow={404})
        call((204,), "DELETE", f"/letters/{letter_id}", "hr_approver")
        call((404,), "DELETE", f"/letters/{letter_id}", "hr_approver", allow={404})
        call((404,), "GET", f"/letters/{letter_id}/html", "requester", allow={404})

    # ------------------------------------------------------------------ public holidays
    _, holiday = call((201,), "POST", "/holidays", "hr_approver",
                      {"name_ar": "عطلة اختبار الدخان", "name_en": "Smoke Holiday",
                       "start_date": "2099-01-05", "days": 1, "is_recurring": False})
    holiday_id = str((holiday or {}).get("id") or "")
    if holiday_id:
        call((200,), "GET", "/leave/holidays", "requester")
        call((204,), "DELETE", f"/holidays/{holiday_id}", "hr_approver")
    # ------------------------------------------------------------------ documents (multipart upload → download → delete)
    raw_body, ctype = _multipart_form({"type": "other"}, "file", "smoke.png", _png(), "image/png")
    _, doc = call((200,), "POST", f"/employees/{emp_id}/documents", "hr_approver",
                  raw=raw_body, content_type=ctype, allow={422})
    doc_id = str((doc or {}).get("id") or "")
    if doc_id:
        call((200,), "GET", f"/employees/{emp_id}/documents", "hr_approver")
        call((200,), "GET", f"/documents/{doc_id}/file", "hr_approver")
        call((200,), "GET", f"/employees/{emp_id}/documents", "requester")
        call((204,), "DELETE", f"/documents/{doc_id}", "hr_approver")

    # ------------------------------------------------------------------ notifications and password validation
    _, notifications = call((200,), "GET", "/me/notifications", "requester")
    note_ids = [str(note.get("id")) for note in (notifications or [])
                if isinstance(note, dict) and not str(note.get("id") or "").startswith("l:")]
    call((204,), "POST", "/me/notifications/read", "requester", {"ids": note_ids[:5]})
    call((422,), "POST", "/me/notifications/read", "requester", {"ids": "not-a-list"})
    call((422,), "POST", "/auth/change-password", "plain_employee",
         {"old_password": "wrong-password", "new_password": "AnotherPass123"})

    # ------------------------------------------------------------------ every remaining GET in the OpenAPI document
    zero = "00000000-0000-0000-0000-000000000000"
    values = {"employee_id": emp_id, "employeeId": emp_id, "request_id": req_id or zero,
              "letter_id": zero, "document_id": zero, "dependent_id": zero, "user_id": zero,
              "record_id": zero, "holiday_id": zero, "location_id": zero, "key": month_key,
              "kind": "departments", "item_id": "smoke"}
    if isinstance(spec, dict):
        seen = {str(row["path"]).split("?")[0] for row in RESULTS}
        for template, operations in sorted((spec.get("paths") or {}).items()):
            if "get" not in operations or not template.startswith("/api/v1/"):
                continue
            probe = _resolve(template[len("/api/v1"):], values)
            if "{" in probe or probe.split("?")[0] in seen:
                continue
            query = "&".join(f"{name}={value}" for name in
                             (p.get("name") for p in (operations["get"].get("parameters") or [])
                              if p.get("in") == "query" and p.get("required"))
                             if (value := _query_value(str(name), today, emp_id)))
            target = probe + ("?" + query if query else "")
            call((200, 204), "GET", target, "hr_approver", allow={403, 404, 409, 422})
            seen.add(target.split("?")[0])

    # ------------------------------------------------------------------ sign out everywhere
    for label in ("requester", "admin", "hr_approver", "ceo_approver", "plain_employee"):
        call((204,), "POST", "/auth/logout", label)
    api.check((401,), "GET", "/me", token=api.tokens["requester"])   # the revoked token must be refused

    cleanup = _cleanup(database, new_emp, user_id, args.host, args.port, args.user, args.url)
    notes.append("cleanup: " + cleanup)
    return _report(RESULTS, api, database, args.out, notes)


if __name__ == "__main__":
    sys.exit(main())



