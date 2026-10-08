"""FastAPI routes backed directly by the canonical Supabase public tables.

No ORM-owned schema is declared. Tables are reflected from the restored database
and all writes target the source table and column names.
"""

from __future__ import annotations

import base64
import json
import math
import secrets
import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from urllib.parse import quote

import jwt
import bcrypt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import APIRouter, Depends, File, Form, Header, Request, UploadFile
from fastapi.responses import HTMLResponse, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.errors import ApiError
from app.core.scheduling import now_riyadh, today_riyadh
from app.database import get_db

router = APIRouter()
_hasher = PasswordHasher()
SESSION_HOURS = 8
SESSION_MAX_HOURS = 24
HR_ROLES = {"hr", "admin", "admin_manager"}
HR_READ_ROLES = HR_ROLES | {"ceo"}
PAYROLL_ROLES = HR_READ_ROLES | {"finance"}
SALARY_ROLES = {"finance", "hr", "admin"}


def _rows(db: Session, sql: str, **params: Any) -> list[dict[str, Any]]:
    return [dict(row) for row in db.execute(text(sql), params).mappings()]


def _row(db: Session, sql: str, **params: Any) -> dict[str, Any] | None:
    result = db.execute(text(sql), params).mappings().first()
    return dict(result) if result else None


def _write_audit(db: Session, actor: dict[str, Any] | None, request: Request | None, module: str, action: str,
                 entity: str | None = None, entity_id: Any = None, summary: str | None = None,
                 details: dict[str, Any] | None = None) -> None:
    db.execute(text("""INSERT INTO public.ariba_audit_log
        (actor_employee_id, actor_username, actor_name, actor_role, module, action, entity_type, entity_id, summary, details)
        VALUES (:employee_id, :username, :name, :role, :module, :action, :entity_type, :entity_id, :summary, CAST(:details AS jsonb))"""), {
        "employee_id": (actor or {}).get("employee_id"), "username": (actor or {}).get("username"),
        "name": (actor or {}).get("name_ar"), "role": (actor or {}).get("role"), "module": module,
        "action": action, "entity_type": entity, "entity_id": str(entity_id) if entity_id is not None else None,
        "summary": summary, "details": json.dumps(details) if details is not None else None,
    })


def _employee_dict(row: dict[str, Any]) -> dict[str, Any]:
    data = dict(row.get("data") or {})
    # Canonical top-level columns take precedence; legacy app fields remain in data JSONB.
    return {
        **data,
        "id": row["employee_id"], "employee_id": row["employee_id"],
        "emp_no": str(data.get("empNo") or row.get("username") or row["employee_id"]),
        "name_ar": row.get("name_ar") or data.get("name_ar") or data.get("nameAr") or "",
        "name_en": row.get("name_en") or data.get("name_en") or data.get("nameEn"),
        "username": row.get("username"), "employer": row.get("employer") or data.get("employer"),
        "department": row.get("department") or data.get("department") or data.get("dept"),
        "job_title": row.get("job_title") or data.get("job_title") or data.get("jobTitle"),
        "nationality": row.get("nationality") or data.get("nationality"),
        "dob": row.get("dob") or data.get("dob"), "join_date": row.get("join_date") or data.get("join_date") or data.get("contractJoin"),
        "manager_id": row.get("manager_id") or data.get("manager_id") or data.get("managerId"),
        "active": bool(row.get("active")), "data": data,
    }


def _public_employee(row: dict[str, Any], actor: dict[str, Any], list_view: bool = False) -> dict[str, Any]:
    e = _employee_dict(row)
    data = e["data"]
    employer, department, nationality = e["employer"], e["department"], e["nationality"]
    own = actor.get("employee_id") == e["employee_id"]
    may_view_salary = actor.get("role") in SALARY_ROLES or own
    may_view_ids = actor.get("role") in HR_ROLES or own
    national_id = data.get("iqamaNo") or data.get("iqama_no")
    masked_id = ("*" * max(0, len(str(national_id))-4) + str(national_id)[-4:]) if national_id and may_view_ids else ("******" + str(national_id)[-4:] if national_id else None)
    if list_view:
        return {"id": e["employee_id"], "emp_no": e["emp_no"], "name_ar": e["name_ar"], "name_en": e["name_en"],
                "job_title": e["job_title"], "category": data.get("empType", "active"),
                "nationality": ({"id": nationality, "code": nationality, "name_ar": nationality, "name_en": nationality,
                                  "is_saudi": bool(data.get("isSaudi"))} if nationality else None),
                "is_saudi": bool(data.get("isSaudi")),
                "workplace": ({"id": employer, "code": employer, "name_ar": employer, "name_en": employer} if employer else None),
                "department": ({"id": department, "code": department, "name_ar": department, "name_en": department} if department else None),
                "national_id_masked": masked_id, "join_date": e["join_date"], "contract_end_date": data.get("contractEnd"),
                "termination_date": data.get("terminationDate") or data.get("lastDay"), "is_terminated": not e["active"],
                "national_id_expiry": data.get("iqamaExpiry"), "years_of_service": data.get("yearsOfService"),
                "national_id_days_left": data.get("iqamaDaysLeft"), "contract_days_left": data.get("contractDaysLeft"),
                "total_salary": data.get("salaryTotal") if may_view_salary else None,
                "net_salary": data.get("netSalarySAR") if may_view_salary else None,
                "currency": data.get("currency") if may_view_salary else None, "has_photo": bool(data.get("photoUrl"))}
    safe_data = dict(data)
    salary = {
        "basic_salary": data.get("salary", 0), "housing_allowance": data.get("housingAllowance", 0),
        "transport_allowance": data.get("transportAllowance", 0), "project_allowance": data.get("projectAllowance", 0),
        "other_allowances": data.get("otherAllowance", 0), "extra_allowance": data.get("extraAllowance", 0),
        "other_deductions": data.get("otherDeductions", 0), "total_salary": data.get("salaryTotal", 0),
        "gosi_employee": data.get("insuranceSub", 0), "gosi_employer": data.get("insuranceComp", 0),
        "net_salary": data.get("netSalaryLocal", data.get("netSalary", 0)),
        "net_salary_sar": data.get("netSalarySAR", data.get("netSalary", 0)),
        "eos_award": data.get("eosLaborLaw"), "currency": data.get("currency", "SAR"),
        "exchange_rate": data.get("exchRate", 1), "gosi_system": data.get("insSystem"),
        "payment_method": data.get("payMethod"), "bank_name": data.get("bank"), "iban": data.get("iban"),
    }
    if not may_view_ids:
        for key in ("iqamaNo", "iqama_no", "passportNo", "iban", "bankAccountNo", "insuranceCard", "gosiNo"):
            if safe_data.get(key):
                value = str(safe_data[key])
                safe_data[key] = "******" + value[-4:]
    if not may_view_salary:
        for key in ("salary", "salaryTotal", "housingAllowance", "transportAllowance", "projectAllowance", "otherAllowance",
                    "extraAllowance", "otherDeductions", "insuranceSub", "insuranceComp", "netSalary", "netSalaryLocal", "netSalarySAR"):
            safe_data.pop(key, None)
        salary = None
    else:
        salary["iban"] = data.get("iban") if may_view_ids else None
        salary["bank_name"] = data.get("bank") if may_view_ids else None
    result = {
        **safe_data, "id": e["employee_id"], "emp_no": e["emp_no"], "name_ar": e["name_ar"], "name_en": e["name_en"],
        "job_title": e["job_title"], "category": data.get("empType", "active"), "is_active": e["active"],
        "is_terminated": not e["active"], "termination_date": data.get("terminationDate") or data.get("lastDay"),
        "national_id": data.get("iqamaNo") or data.get("iqama_no"), "national_id_expiry": data.get("iqamaExpiry"),
        "passport_no": data.get("passportNo"), "passport_expiry": data.get("passportExpiry"),
        "insurance_company": data.get("insuranceCo"), "insurance_class": data.get("insuranceClass"),
        "insurance_card_no": data.get("insuranceCard") if may_view_ids else ("******" + str(data["insuranceCard"])[-4:] if data.get("insuranceCard") else None),
        "join_date": e["join_date"], "contract_nature": data.get("contractNature", "indefinite"),
        "contract_duration_months": data.get("contractDuration"), "contract_end_date": data.get("contractEnd"),
        "annual_leave_days": data.get("leaveDaysContract", 21), "years_of_service": data.get("yearsOfService"),
        "workplace": ({"id": employer, "code": employer, "name_ar": employer, "name_en": employer} if employer else None),
        "department": ({"id": department, "code": department, "name_ar": department, "name_en": department} if department else None),
        "nationality": ({"id": nationality, "code": nationality, "name_ar": nationality, "name_en": nationality,
                         "is_saudi": bool(data.get("isSaudi"))} if nationality else None),
        "is_saudi": bool(data.get("isSaudi")), "salary": salary, "has_photo": bool(data.get("photoUrl")),
    }
    result["national_id"] = national_id if may_view_ids else ("******" + str(national_id)[-4:] if national_id else None)
    result["passport_no"] = data.get("passportNo") if may_view_ids else ("******" + str(data["passportNo"])[-4:] if data.get("passportNo") else None)
    return result


def _account_user(db: Session, account: dict[str, Any]) -> dict[str, Any]:
    emp = _row(db, "SELECT * FROM public.employee_directory WHERE employee_id=:eid", eid=account.get("employee_id")) if account.get("employee_id") else None
    e = _employee_dict(emp) if emp else None
    return {
        "id": str(account["id"]), "username": account["username"], "role": account["role"],
        "is_active": account["active"], "must_change_password": account["must_change"],
        "employee": ({"id": e["employee_id"], "emp_no": e["emp_no"], "name_ar": e["name_ar"], "name_en": e["name_en"]} if e else None),
    }


def _sign(kind: str, account: dict[str, Any], session_id: uuid.UUID, ttl: timedelta) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    return jwt.encode({
        "sub": str(account["id"]), "sid": str(session_id), "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience, "iat": int(now.timestamp()), "exp": int((now + ttl).timestamp()), "typ": kind,
    }, settings.jwt_secret, algorithm="HS256")


def _new_session(db: Session, account: dict[str, Any]) -> dict[str, Any]:
    now = datetime.now(UTC)
    session_id = uuid.uuid4()
    db.execute(text("DELETE FROM public.ariba_sessions WHERE expires_at<=:now"), {"now": now})
    db.execute(text("""INSERT INTO public.ariba_sessions(token,account_id,employee_id,role,expires_at)
        VALUES (:token,:account_id,:employee_id,:role,:expires_at)"""), {
        "token": session_id, "account_id": account["id"], "employee_id": account.get("employee_id"),
        "role": account["role"], "expires_at": now + timedelta(hours=SESSION_HOURS),
    })
    return {"access_token": _sign("access", account, session_id, timedelta(hours=1)),
            "refresh_token": _sign("refresh", account, session_id, timedelta(hours=SESSION_HOURS)),
            "expires_in": 3600, "user": _account_user(db, account)}


def _session_tokens(db: Session, account: dict[str, Any], session_id: uuid.UUID, expires_at: datetime) -> dict[str, Any]:
    now = datetime.now(UTC)
    remaining = max(0, int((expires_at-now).total_seconds()))
    access_ttl = min(3600, remaining)
    return {"access_token": _sign("access", account, session_id, timedelta(seconds=access_ttl)),
            "refresh_token": _sign("refresh", account, session_id, timedelta(seconds=remaining)),
            "expires_in": access_ttl, "user": _account_user(db, account)}


def _verify_password(db: Session, stored: str, password: str) -> tuple[bool, bool]:
    """Return (valid, was_bcrypt); bcrypt verification uses source pgcrypto."""
    if stored.startswith("$argon2"):
        try:
            return _hasher.verify(stored, password), False
        except (VerificationError, InvalidHashError):
            return False, False
    if stored.startswith(("$2a$", "$2b$", "$2y$")):
        try:
            valid = bcrypt.checkpw(password.encode("utf-8"), stored.encode("ascii"))
        except (ValueError, UnicodeError):
            valid = False
        return bool(valid), bool(valid)
    return False, False


def _authenticate(db: Session, authorization: str | None, allow_pending: bool = False) -> dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ApiError(401, "unauthorized", "Sign in required")
    settings = get_settings()
    try:
        claims = jwt.decode(authorization[7:].strip(), settings.jwt_secret, algorithms=["HS256"],
                            audience=settings.jwt_audience, issuer=settings.jwt_issuer,
                            options={"require": ["exp", "sub", "sid", "typ"]})
    except jwt.PyJWTError as exc:
        raise ApiError(401, "session_expired", "Your session has expired. Please sign in again.") from exc
    if claims.get("typ") != "access":
        raise ApiError(401, "unauthorized", "Sign in required")
    session = _row(db, """SELECT s.token,s.account_id,s.employee_id,s.role,s.expires_at,a.username,a.password_hash,a.active,a.must_change
        FROM public.ariba_sessions s JOIN public.ariba_auth_accounts a ON a.id=s.account_id
        WHERE s.token=:sid AND s.account_id=:aid AND s.expires_at>now() AND a.active""",
        sid=claims["sid"], aid=claims["sub"])
    if not session:
        raise ApiError(401, "session_expired", "Your session has expired. Please sign in again.")
    if session["must_change"] and not allow_pending:
        raise ApiError(403, "password_change_required", "You must change your temporary password first")
    emp = _row(db, "SELECT name_ar FROM public.employee_directory WHERE employee_id=:eid", eid=session.get("employee_id")) if session.get("employee_id") else None
    session["name_ar"] = (emp or {}).get("name_ar") or session["username"]
    return session


def current_actor(authorization: str | None = Header(None), db: Session = Depends(get_db)) -> dict[str, Any]:
    return _authenticate(db, authorization)


def _require(actor: dict[str, Any], *roles: str) -> None:
    if actor.get("role") not in roles:
        raise ApiError(403, "forbidden", "Not authorized")


def _employee_scope(db: Session, actor: dict[str, Any], employee_id: str) -> dict[str, Any]:
    row = _row(db, "SELECT * FROM public.employee_directory WHERE employee_id=:eid", eid=employee_id)
    if not row:
        raise ApiError(404, "not_found", "Employee not found")
    role, own = actor.get("role"), actor.get("employee_id")
    if role in HR_READ_ROLES:
        return row
    if role == "manager" and (employee_id == own or row.get("manager_id") == own):
        return row
    if employee_id == own:
        return row
    raise ApiError(404, "not_found", "Employee not found")


def _insert_notification(db: Session, employee_id: str | None, request_id: uuid.UUID | None,
                         title: str, body: str, stage: str, kind: str) -> None:
    if employee_id:
        db.execute(text("""INSERT INTO public.workflow_notifications
            (recipient_employee_id,request_id,title,body,stage,kind,is_read)
            VALUES (:employee_id,:request_id,:title,:body,:stage,:kind,false)"""),
            {"employee_id": employee_id, "request_id": request_id, "title": title, "body": body, "stage": stage, "kind": kind})


def _session_response(db: Session, account: dict[str, Any]) -> dict[str, Any]:
    result = _new_session(db, account)
    db.commit()
    return result


@router.post("/auth/login")
def login(body: dict[str, Any], request: Request, db: Session = Depends(get_db)):
    username = str(body.get("username") or "").strip().lower()
    password = str(body.get("password") or "")
    if not username or not password:
        raise ApiError(422, "validation_error", "Username and password are required")
    ip = request.client.host if request.client else None
    cutoff = datetime.now(UTC) - timedelta(minutes=15)
    counts = _row(db, """SELECT count(*) FILTER (WHERE uname=:u) AS user_count,
        count(*) FILTER (WHERE ip=:ip AND :ip IS NOT NULL) AS ip_count FROM public.ariba_login_attempts WHERE at>:cutoff""",
        u=username, ip=ip, cutoff=cutoff) or {}
    if counts.get("user_count", 0) >= 25 or counts.get("ip_count", 0) >= 40:
        raise ApiError(429, "rate_limited", "Too many login attempts")
    account = _row(db, "SELECT * FROM public.ariba_auth_accounts WHERE lower(username)=:u", u=username)
    valid, was_bcrypt = _verify_password(db, account["password_hash"], password) if account and account["active"] else (False, False)
    if not valid:
        db.execute(text("INSERT INTO public.ariba_login_attempts(uname,ip) VALUES(:u,:ip)"), {"u": username, "ip": ip})
        _write_audit(db, None, request, "auth", "login_failed", "account", summary="Failed login", details={"username": username})
        db.commit()
        raise ApiError(401, "invalid_credentials", "Invalid username or password")
    if was_bcrypt:
        account["password_hash"] = _hasher.hash(password)
        db.execute(text("UPDATE public.ariba_auth_accounts SET password_hash=:hash,updated_at=now() WHERE id=:id"),
                   {"hash": account["password_hash"], "id": account["id"]})
    db.execute(text("DELETE FROM public.ariba_login_attempts WHERE uname=:u"), {"u": username})
    _write_audit(db, {**account, "name_ar": username}, request, "auth", "login", "account", account["id"])
    return _session_response(db, account)


@router.post("/auth/refresh")
def refresh(body: dict[str, Any], db: Session = Depends(get_db)):
    settings = get_settings()
    try:
        claims = jwt.decode(str(body.get("refresh_token") or ""), settings.jwt_secret, algorithms=["HS256"],
                            audience=settings.jwt_audience, issuer=settings.jwt_issuer,
                            options={"require": ["exp", "sub", "sid", "typ"]})
    except jwt.PyJWTError as exc:
        raise ApiError(401, "session_expired", "Your session has expired. Please sign in again.") from exc
    if claims.get("typ") != "refresh":
        raise ApiError(401, "unauthorized", "Invalid refresh token")
    account = _row(db, "SELECT * FROM public.ariba_auth_accounts WHERE id=:id AND active", id=claims["sub"])
    current = _row(db, "SELECT token,created_at,expires_at FROM public.ariba_sessions WHERE token=:sid AND account_id=:aid AND expires_at>now()",
                   sid=claims["sid"], aid=claims["sub"])
    if not account or not current:
        raise ApiError(401, "session_expired", "Your session has expired. Please sign in again.")
    now = datetime.now(UTC)
    maximum = current["created_at"] + timedelta(hours=SESSION_MAX_HOURS)
    expires_at = min(now + timedelta(hours=SESSION_HOURS), maximum)
    if expires_at <= current["expires_at"] + timedelta(minutes=1):
        raise ApiError(401, "session_expired", "Your session has reached its maximum lifetime")
    db.execute(text("UPDATE public.ariba_sessions SET expires_at=:expires WHERE token=:sid"),
               {"expires": expires_at, "sid": claims["sid"]})
    result = _session_tokens(db, account, uuid.UUID(str(claims["sid"])), expires_at)
    db.commit()
    return result


@router.post("/auth/logout", status_code=204)
def logout(request: Request, actor: dict[str, Any] = Depends(lambda authorization=Header(None), db=Depends(get_db): _authenticate(db, authorization, True)), db: Session = Depends(get_db)):
    db.execute(text("DELETE FROM public.ariba_sessions WHERE token=:token"), {"token": actor["token"]})
    _write_audit(db, actor, request, "auth", "logout", "account", actor["account_id"])
    db.commit()


@router.get("/me")
def me(actor: dict[str, Any] = Depends(lambda authorization=Header(None), db=Depends(get_db): _authenticate(db, authorization, True)), db: Session = Depends(get_db)):
    account = _row(db, "SELECT * FROM public.ariba_auth_accounts WHERE id=:id", id=actor["account_id"])
    return {"user": _account_user(db, account)} if account else {"user": None}


@router.get("/me/employee")
def my_employee(actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    if not actor.get("employee_id"):
        raise ApiError(404, "not_found", "Employee not found")
    return _public_employee(_employee_scope(db, actor, actor["employee_id"]), actor)


@router.get("/employees")
def employees(tab: str = "all", q: str = "", page: int = 1, page_size: int = 100, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    if actor["role"] == "finance":
        raise ApiError(403, "forbidden", "Not authorized")
    rows = _rows(db, "SELECT * FROM public.employee_directory ORDER BY employee_id")
    role, own = actor["role"], actor.get("employee_id")
    if role not in HR_READ_ROLES:
        rows = [r for r in rows if r["employee_id"] == own or (role == "manager" and r.get("manager_id") == own)]
    items = [_employee_dict(r) for r in rows]
    needle = q.strip().lower()
    if needle:
        items = [e for e in items if needle in " ".join(str(e.get(k) or "") for k in ("emp_no", "name_ar", "name_en", "job_title")).lower()]
    if tab == "active":
        items = [e for e in items if e["active"]]
    elif tab == "terminated":
        items = [e for e in items if not e["active"]]
    size = max(1, min(page_size, 100))
    start = max(0, page - 1) * size
    return {"items": [_public_employee(e, actor, list_view=True) for e in items[start:start + size]], "total": len(items), "page": page, "page_size": size}


@router.get("/employees/counts")
def employee_counts(actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    rows = _rows(db, "SELECT * FROM public.employee_directory")
    visible = rows if actor["role"] in HR_READ_ROLES else [r for r in rows if r["employee_id"] == actor.get("employee_id") or (actor["role"] == "manager" and r.get("manager_id") == actor.get("employee_id"))]
    active = [r for r in visible if r.get("active")]
    saudis = sum(1 for r in active if str(r.get("nationality") or "").lower() in {"saudi", "saudi arabia", "سعودي", "سعودية"})
    return {"all": len(visible), "active": len(active), "terminated": len(visible)-len(active), "tamheer": 0, "training": 0, "consultants": 0, "saudi": saudis, "expat": len(active)-saudis, "saudization_pct": round(saudis*100/len(active),1) if active else 0}


@router.get("/employees/{employee_id}")
def employee_detail(employee_id: str, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    return _public_employee(_employee_scope(db, actor, employee_id), actor)


_EMPLOYEE_JSON_KEYS = {
    "birth_date": "dob", "gender": "gender", "religion": "religion", "marital_status": "maritalStatus",
    "mobile": "mobile", "email": "email", "national_address": "nationalAddress", "emp_no": "empNo",
    "sponsor": "sponsor", "bank_name": "bank", "iban": "iban", "national_id": "iqamaNo",
    "national_id_expiry": "iqamaExpiry", "passport_no": "passportNo", "passport_expiry": "passportExpiry",
    "insurance_company": "insuranceCo", "insurance_class": "insuranceClass", "insurance_card_no": "insuranceCard",
    "insurance_expiry": "insuranceExpiry", "contract_nature": "contractNature",
    "contract_duration_months": "contractDuration", "contract_end_date": "contractEnd",
    "annual_leave_days": "leaveDaysContract", "basic_salary": "salary", "housing_allowance": "housingAllowance",
    "transport_allowance": "transportAllowance", "project_allowance": "projectAllowance",
    "other_allowances": "otherAllowance", "extra_allowance": "extraAllowance", "other_deductions": "otherDeductions",
    "currency": "currency", "exchange_rate": "exchRate", "gosi_system": "insSystem",
    "payment_method": "payMethod", "exclude_from_payroll": "excludeFromPayroll", "exclude_from_eos": "excludeFromEos",
    "notes": "notes", "category": "empType", "wps_type": "wpsType",
    "workplace_id": "employer", "department_id": "department", "nationality_id": "nationality",
}


def _employee_data(body: dict[str, Any], employee_id: str, username: str, emp_no: str | None = None) -> dict[str, Any]:
    result: dict[str, Any] = {"id": employee_id, "employee_id": employee_id, "employeeId": employee_id,
                              "empNo": emp_no or body.get("emp_no") or body.get("empNo") or employee_id, "username": username}
    for key, value in body.items():
        if value is None or key in {"password", "password_hash", "passwordHash"}:
            continue
        result[_EMPLOYEE_JSON_KEYS.get(key, key)] = value
    return result


def _employee_top_fields(body: dict[str, Any], data: dict[str, Any], active: bool) -> dict[str, Any]:
    return {
        "username": str(data.get("username") or data.get("empNo") or ""),
        "name_ar": str(body.get("name_ar") or body.get("nameAr") or ""),
        "name_en": body.get("name_en", body.get("nameEn")),
        "employer": body.get("employer", body.get("workplace_id")),
        "department": body.get("department", body.get("department_id")),
        "job_title": body.get("job_title", body.get("jobTitle")), "nationality": body.get("nationality", body.get("nationality_id")),
        "iqama_no": data.get("iqamaNo") or data.get("iqama_no"), "dob": data.get("dob"),
        "join_date": data.get("contractJoin") or data.get("join_date"),
        "manager_id": data.get("manager_id") or data.get("managerId"), "active": active,
        "data": json.dumps(data, ensure_ascii=False),
    }


@router.post("/employees", status_code=201)
def create_employee(body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    employee_id = str(body.get("employee_id") or body.get("id") or ("APP-" + uuid.uuid4().hex[:12]))
    emp_no = str(body.get("emp_no") or body.get("empNo") or employee_id)
    username = str(body.get("username") or ("EMP" + emp_no.zfill(3)))
    data = _employee_data(body, employee_id, username, emp_no)
    fields = _employee_top_fields(body, data, True)
    row = _row(db, """INSERT INTO public.employee_directory
        (employee_id,username,name_ar,name_en,employer,department,job_title,nationality,iqama_no,dob,join_date,manager_id,active,data)
        VALUES (:employee_id,:username,:name_ar,:name_en,:employer,:department,:job_title,:nationality,:iqama_no,:dob,:join_date,:manager_id,:active,CAST(:data AS jsonb))
        RETURNING *""", employee_id=employee_id, **fields)
    _write_audit(db, actor, request, "employees", "create", "employee", employee_id)
    db.commit()
    return _public_employee(row, actor)


@router.patch("/employees/{employee_id}")
def update_employee(employee_id: str, body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    old = _employee_scope(db, actor, employee_id)
    data = dict(old.get("data") or {})
    top_map = {"name_ar": "name_ar", "name_en": "name_en", "employer": "employer", "department": "department",
               "nationality": "nationality", "job_title": "job_title", "dob": "dob", "join_date": "join_date", "manager_id": "manager_id", "iqama_no": "iqama_no"}
    values: dict[str, Any] = {"id": employee_id, "data": json.dumps(data, ensure_ascii=False)}
    setters = ["data=coalesce(data,'{}'::jsonb)||CAST(:data AS jsonb)", "updated_at=now()"]
    merged_data = {key: value for key, value in _employee_data(body, employee_id, str(body.get("username") or old["username"]), str(body.get("emp_no") or body.get("empNo") or (old.get("data") or {}).get("empNo") or "")).items()
                   if key not in {"id", "employee_id", "employeeId", "empNo", "username"}}
    values["data"] = json.dumps(merged_data, ensure_ascii=False)
    for key, column in top_map.items():
        if key in body:
            setters.append(f"{column}=:{column}")
            values[column] = body[key]
    if "username" in body:
        setters.append("username=:username")
        values["username"] = str(body["username"])
    row = _row(db, f"UPDATE public.employee_directory SET {','.join(setters)} WHERE employee_id=:id RETURNING *", **values)
    _write_audit(db, actor, request, "employees", "update", "employee", employee_id,
                 details={"changed_fields": sorted(body.keys())})
    db.commit()
    return _public_employee(row, actor)


@router.post("/employees/{employee_id}/terminate")
def terminate_employee(employee_id: str, body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    old = _employee_scope(db, actor, employee_id)
    data = dict(old.get("data") or {})
    data.update({"isTerminated": True, "term": True, "lastDay": body.get("termination_date"),
                 "terminationDate": body.get("termination_date"), "terminationArticle": body.get("article"),
                 "terminationReason": body.get("reason")})
    row = _row(db, "UPDATE public.employee_directory SET active=false,data=CAST(:data AS jsonb),updated_at=now() WHERE employee_id=:id RETURNING *",
               id=employee_id, data=json.dumps(data, ensure_ascii=False))
    _write_audit(db, actor, request, "employees", "terminate", "employee", employee_id)
    db.commit()
    return _public_employee(row, actor)


@router.post("/employees/{employee_id}/reactivate")
def reactivate_employee(employee_id: str, request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    old = _employee_scope(db, actor, employee_id)
    data = dict(old.get("data") or {})
    data.update({"isTerminated": False, "term": False, "notEmployed": False})
    row = _row(db, "UPDATE public.employee_directory SET active=true,data=CAST(:data AS jsonb),updated_at=now() WHERE employee_id=:id RETURNING *",
               id=employee_id, data=json.dumps(data, ensure_ascii=False))
    _write_audit(db, actor, request, "employees", "reactivate", "employee", employee_id)
    db.commit()
    return _public_employee(row)


@router.post("/employees/salary-preview")
def salary_preview(body: dict[str, Any], actor: dict[str, Any] = Depends(current_actor)):
    _require(actor, *SALARY_ROLES)
    raise ApiError(501, "feature_unavailable", "Live salary preview requires GOSI rates, which are not represented in the canonical schema")


@router.get("/employees/{employee_id}/dependents")
@router.post("/employees/{employee_id}/dependents")
@router.patch("/dependents/{dependent_id}")
@router.delete("/dependents/{dependent_id}")
def dependents_unavailable(*args: Any, **kwargs: Any):
    raise ApiError(501, "feature_unavailable", "Dependents are not represented in the canonical schema")


@router.get("/locations")
def locations(actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    rows = _rows(db, "SELECT * FROM public.work_locations WHERE active ORDER BY name")
    return [{**r, "workplace": r.get("employer"), "is_active": r.get("active")} for r in rows]


@router.post("/locations", status_code=201)
def create_location(body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    loc_id = str(body.get("id") or uuid.uuid4())
    row = _row(db, """INSERT INTO public.work_locations(id,name,name_en,employer,type,latitude,longitude,radius_m,active,polygon)
        VALUES(:id,:name,:name_en,:employer,:type,:lat,:lng,:radius,true,CAST(:polygon AS jsonb)) RETURNING *""",
        id=loc_id, name=body.get("name") or body.get("name_ar") or "", name_en=body.get("name_en"),
        employer=body.get("employer") or "all", type=body.get("type") or "project", lat=body.get("latitude"),
        lng=body.get("longitude"), radius=body.get("radius_m") or 200,
        polygon=json.dumps(body["polygon"]) if body.get("polygon") is not None else None)
    _write_audit(db, actor, request, "locations", "create", "work_location", loc_id)
    db.commit()
    return row


@router.patch("/locations/{location_id}")
def update_location(location_id: str, body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    row = _row(db, "SELECT * FROM public.work_locations WHERE id=:id", id=location_id)
    if not row:
        raise ApiError(404, "not_found", "Work location not found")
    fields = {"name": body.get("name", row["name"]), "name_en": body.get("name_en", row.get("name_en")),
              "employer": body.get("employer", row["employer"]), "type": body.get("type", row["type"]),
              "latitude": body.get("latitude", row["latitude"]), "longitude": body.get("longitude", row["longitude"]),
              "radius": body.get("radius_m", row["radius_m"]), "active": body.get("active", row["active"]),
              "polygon": json.dumps(body["polygon"]) if body.get("polygon") is not None else None, "id": location_id}
    updated = _row(db, """UPDATE public.work_locations SET name=:name,name_en=:name_en,employer=:employer,type=:type,
        latitude=:latitude,longitude=:longitude,radius_m=:radius,active=:active,
        polygon=coalesce(CAST(:polygon AS jsonb),polygon),updated_at=now() WHERE id=:id RETURNING *""", **fields)
    _write_audit(db, actor, request, "locations", "update", "work_location", location_id)
    db.commit()
    return updated


@router.delete("/locations/{location_id}", status_code=204)
def deactivate_location(location_id: str, request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    result = db.execute(text("UPDATE public.work_locations SET active=false,updated_at=now() WHERE id=:id"), {"id": location_id})
    if result.rowcount == 0:
        raise ApiError(404, "not_found", "Work location not found")
    _write_audit(db, actor, request, "locations", "deactivate", "work_location", location_id)
    db.commit()


@router.get("/locations/assignments")
def location_assignments(actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_READ_ROLES)
    rows = _rows(db, "SELECT employee_id,username,name_ar,name_en,data FROM public.employee_directory ORDER BY name_ar")
    return [{"employee_id": r["employee_id"], "name_ar": r["name_ar"], "work_locations": (r.get("data") or {}).get("workLocationIds") or []} for r in rows]


@router.put("/employees/{employee_id}/work-locations")
def set_employee_locations(employee_id: str, body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    row = _employee_scope(db, actor, employee_id)
    data = dict(row.get("data") or {})
    ids = body.get("location_ids") or body.get("work_location_ids") or []
    valid = {r["id"] for r in _rows(db, "SELECT id FROM public.work_locations WHERE active")}
    if any(str(value) not in valid for value in ids):
        raise ApiError(422, "invalid_location", "One or more work locations are unavailable")
    data["workLocationIds"] = [str(value) for value in ids]
    db.execute(text("UPDATE public.employee_directory SET data=CAST(:data AS jsonb),updated_at=now() WHERE employee_id=:eid"),
               {"data": json.dumps(data, ensure_ascii=False), "eid": employee_id})
    _write_audit(db, actor, request, "locations", "assign", "employee", employee_id)
    db.commit()
    return {"employee_id": employee_id, "work_locations": data["workLocationIds"]}


@router.get("/settings/lookups")
def lookups(actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    emps = _rows(db, "SELECT employer,department,nationality FROM public.employee_directory")
    def vals(k: str) -> list[dict[str, str]]:
        names = sorted({str(r[k]).strip() for r in emps if r.get(k) and str(r[k]).strip()})
        return [{"id": n, "code": n, "name_ar": n, "name_en": n, "is_saudi": n.lower() in {"saudi", "saudi arabia", "سعودي", "سعودية"}} for n in names]
    return {"workplaces": vals("employer"), "departments": vals("department"), "nationalities": vals("nationality")}


@router.get("/settings/company")
def company_settings(actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    row = _row(db, "SELECT * FROM public.company_settings WHERE id='default'") or {}
    names = _row(db, "SELECT value FROM public.ariba_app_settings WHERE key='company_names'")
    value = (names or {}).get("value") or {}
    return {"company_name_ar": value.get("coAr", ""), "company_name_en": value.get("coEn", ""), "labour_law_country": "SA", **row}


@router.put("/settings/company")
def update_company_settings(body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    setting = _row(db, "SELECT value FROM public.ariba_app_settings WHERE key='company_names'")
    value = dict((setting or {}).get("value") or {})
    value.update({"coAr": body.get("company_name_ar", value.get("coAr", "")),
                  "coEn": body.get("company_name_en", value.get("coEn", ""))})
    db.execute(text("""INSERT INTO public.ariba_app_settings(key,value,updated_at,updated_by)
        VALUES('company_names',CAST(:value AS jsonb),now(),:actor)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now(),updated_by=excluded.updated_by"""),
        {"value": json.dumps(value, ensure_ascii=False), "actor": actor.get("employee_id")})
    _write_audit(db, actor, request, "settings", "update", "ariba_app_settings", "company_names")
    db.commit()
    return {"company_name_ar": value["coAr"], "company_name_en": value["coEn"], "labour_law_country": "SA"}


@router.get("/settings/attendance")
def attendance_settings(actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    row = _row(db, "SELECT * FROM public.company_settings WHERE id='default'") or {}
    return {"work_start": row.get("work_start"), "tolerance_minutes": row.get("tolerance_minutes", 15), "remote_days_per_year": row.get("remote_days_per_year", 10), "flexible_enabled": row.get("flexible_enabled", False), "shift_hours": row.get("shift_hours", 8), "window_start": row.get("flex_window_start"), "window_end": row.get("flex_window_end")}


@router.put("/settings/attendance")
def update_attendance_settings(body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    row = _row(db, """UPDATE public.company_settings SET work_start=:work_start,tolerance_minutes=:tolerance,
        remote_days_per_year=:remote,flexible_enabled=:enabled,shift_hours=:hours,flex_window_start=:window_start,
        flex_window_end=:window_end,shift_duration_minutes=coalesce(:duration,shift_duration_minutes),updated_at=now()
        WHERE id='default' RETURNING *""", work_start=body.get("work_start"), tolerance=body.get("tolerance_minutes", 15),
        remote=body.get("remote_days_per_year", 10), enabled=body.get("flexible_enabled", False), hours=body.get("shift_hours", 8),
        window_start=body.get("window_start", "08:00"), window_end=body.get("window_end", "17:00"), duration=body.get("shift_duration_minutes"))
    if not row:
        raise ApiError(404, "not_found", "Canonical company_settings row is missing")
    _write_audit(db, actor, request, "settings", "update", "company_settings", "default")
    db.commit()
    return {"work_start": row["work_start"], "tolerance_minutes": row["tolerance_minutes"], "remote_days_per_year": row["remote_days_per_year"], "flexible_enabled": row["flexible_enabled"], "shift_hours": row["shift_hours"], "window_start": row["flex_window_start"], "window_end": row["flex_window_end"]}


@router.get("/settings/gosi")
def gosi_unavailable(actor: dict[str, Any] = Depends(current_actor)):
    raise ApiError(501, "feature_unavailable", "GOSI effective-rate history is not represented in the canonical schema")


@router.put("/settings/gosi")
def update_gosi_unavailable(body: dict[str, Any], actor: dict[str, Any] = Depends(current_actor)):
    raise ApiError(501, "feature_unavailable", "GOSI effective-rate history is not represented in the canonical schema")


@router.get("/settings/gosi-rates")
def gosi_rates_unavailable(on: date, actor: dict[str, Any] = Depends(current_actor)):
    raise ApiError(501, "feature_unavailable", "GOSI effective-rate history is not represented in the canonical schema")


@router.post("/settings/lists/{kind}")
def lookup_write_unavailable(kind: str, body: dict[str, Any], actor: dict[str, Any] = Depends(current_actor)):
    raise ApiError(501, "feature_unavailable", "Department/workplace catalogs are not represented in the canonical schema")


@router.delete("/settings/lists/{kind}/{item_id}")
def lookup_delete_unavailable(kind: str, item_id: str, actor: dict[str, Any] = Depends(current_actor)):
    raise ApiError(501, "feature_unavailable", "Department/workplace catalogs are not represented in the canonical schema")


@router.get("/settings/accounts")
def accounts(actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    rows = _rows(db, """SELECT a.id AS user_id,a.employee_id,d.name_ar,a.username,a.role,a.active AS is_active,a.must_change AS must_change_password
        FROM public.ariba_auth_accounts a LEFT JOIN public.employee_directory d ON d.employee_id=a.employee_id ORDER BY a.username""")
    return rows


@router.post("/settings/payroll-exclusion", status_code=204)
def payroll_exclusion(body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    eid = str(body.get("employee_id") or "")
    row = _employee_scope(db, actor, eid)
    data = dict(row.get("data") or {})
    data["excludeFromPayroll"] = bool(body.get("exclude"))
    db.execute(text("UPDATE public.employee_directory SET data=CAST(:data AS jsonb),updated_at=now() WHERE employee_id=:eid"),
               {"data": json.dumps(data, ensure_ascii=False), "eid": eid})
    _write_audit(db, actor, request, "settings", "payroll_exclusion", "employee", eid)
    db.commit()


@router.get("/dashboard")
def dashboard(actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    all_rows = _rows(db, "SELECT * FROM public.employee_directory")
    visible = all_rows if actor["role"] in HR_READ_ROLES else [r for r in all_rows if r["employee_id"] == actor.get("employee_id") or (actor["role"] == "manager" and r.get("manager_id") == actor.get("employee_id"))]
    active = [r for r in visible if r.get("active")]
    terminated = [r for r in visible if not r.get("active")]
    def group_count(rows: list[dict[str, Any]], field: str) -> list[dict[str, Any]]:
        grouped: dict[str, int] = {}
        for row in rows:
            name = str(row.get(field) or "غير محدد")
            grouped[name] = grouped.get(name, 0) + 1
        return [{"name_ar": name, "name_en": name, "count": count} for name, count in sorted(grouped.items(), key=lambda item: (-item[1], item[0]))]
    saudi = sum(1 for row in active if bool((row.get("data") or {}).get("isSaudi")) or str(row.get("nationality") or "").lower() in {"saudi", "saudi arabia", "سعودي", "سعودية"})
    gender_counts = {"male": 0, "female": 0, "unknown": 0}
    for row in active:
        gender = str((row.get("data") or {}).get("gender") or (row.get("data") or {}).get("gen") or "").lower()
        key = "male" if gender in {"male", "m", "ذكر"} else "female" if gender in {"female", "f", "أنثى", "انثى"} else "unknown"
        gender_counts[key] += 1
    pending = db.scalar(text("SELECT count(*) FROM public.workflow_requests WHERE status='pending'")) or 0
    payroll_allowed = actor["role"] in SALARY_ROLES
    payroll_total = sum(float((r.get("data") or {}).get("salaryTotal") or 0) for r in active) if payroll_allowed else None
    summary_row = _row(db, "SELECT pay_year,pay_month FROM public.payroll_archives_v2 WHERE approved ORDER BY pay_year DESC,pay_month DESC LIMIT 1")
    alerts = []
    today = today_riyadh()
    for row in active:
        data = row.get("data") or {}
        brief = {"id": row["employee_id"], "emp_no": str(data.get("empNo") or row.get("username") or row["employee_id"]),
                 "name_ar": row.get("name_ar"), "name_en": row.get("name_en")}
        for kind, field in (("iqama", "iqamaExpiry"), ("passport", "passportExpiry"), ("insurance", "insuranceExpiry"), ("contract", "contractEnd")):
            raw = data.get(field)
            if not raw:
                continue
            try:
                expires = date.fromisoformat(str(raw)[:10])
            except ValueError:
                continue
            days_left = (expires-today).days
            if days_left <= 90:
                alerts.append({"employee": brief, "kind": kind, "expires_on": expires, "days_left": days_left,
                               "level": "expired" if days_left < 0 else "urgent" if days_left <= 30 else "soon"})
    workplaces = group_count(active, "employer")
    for item in workplaces:
        if payroll_allowed:
            item["salary_total"] = sum(float((r.get("data") or {}).get("salaryTotal") or 0) for r in active if (r.get("employer") or "غير محدد") == item["name_ar"])
        else:
            item["salary_total"] = None
    return {"current": len(active), "saudi": saudi, "expat": len(active)-saudi,
            "saudization_pct": round(saudi*100/len(active), 1) if active else 0, "payroll_total": payroll_total,
            "male": gender_counts["male"], "female": gender_counts["female"], "gender_unspecified": gender_counts["unknown"],
            "terminated": len(terminated), "tamheer": sum(1 for r in active if (r.get("data") or {}).get("empType") == "tamheer"),
            "pending_requests": pending, "departments": group_count(active, "department"),
            "nationalities": group_count(active, "nationality"), "workplaces": workplaces, "alerts": alerts,
            "payroll_summary": ({"year": summary_row["pay_year"], "month": summary_row["pay_month"]} if summary_row else None)}


def _attendance_row(db: Session, row: dict[str, Any]) -> dict[str, Any]:
    employee = _row(db, "SELECT name_ar,employer FROM public.employee_directory WHERE employee_id=:id", id=row["emp_id"])
    return {"id": str(row["id"]), "employee_id": row["emp_id"], "employee_name": (employee or {}).get("name_ar", ""),
            "workplace": (employee or {}).get("employer"), "work_date": row["date"],
            "time_in": str(row["time_in"]) if row.get("time_in") else None,
            "time_out": str(row["time_out"]) if row.get("time_out") else None,
            "location_id": row.get("location_id"), "location_name": row.get("location_name"),
            "status": row.get("status") or "present", "late_minutes": row.get("late_minutes") or 0,
            "early_minutes": row.get("early_minutes") or 0,
            "source": "app" if row.get("lat") is not None or "GPS" in str(row.get("notes") or "") else "manual",
            "notes": row.get("notes")}


@router.get("/attendance")
def hr_attendance(day: date, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_READ_ROLES)
    rows = _rows(db, "SELECT * FROM public.attendance WHERE date=:day ORDER BY emp_id,time_in", day=day)
    return [_attendance_row(db, row) for row in rows]


@router.get("/attendance/range")
def hr_attendance_range(date_from: date, date_to: date, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_READ_ROLES)
    rows = _rows(db, "SELECT * FROM public.attendance WHERE date BETWEEN :start AND :end ORDER BY date,emp_id,time_in", start=date_from, end=date_to)
    return [_attendance_row(db, row) for row in rows]


@router.get("/attendance/summary")
def hr_attendance_summary(month: str, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_READ_ROLES)
    try:
        year, number = (int(part) for part in month.split("-", 1))
        start, end = date(year, number, 1), date(year + (number == 12), 1 if number == 12 else number + 1, 1)
    except (ValueError, TypeError):
        raise ApiError(422, "invalid_month", "Month must be YYYY-MM")
    rows = _rows(db, "SELECT emp_id,status,late_minutes FROM public.attendance WHERE date>=:start AND date<:end", start=start, end=end)
    result: dict[str, dict[str, Any]] = {}
    for row in rows:
        item = result.setdefault(row["emp_id"], {"employee_id": row["emp_id"], "present": 0, "late": 0, "absent": 0, "leave": 0, "remote": 0})
        status = row.get("status") or "present"
        if status in item:
            item[status] += 1
        if status == "late":
            item["present"] += 1
    names = {r["employee_id"]: r["name_ar"] for r in _rows(db, "SELECT employee_id,name_ar FROM public.employee_directory")}
    return [{**v, "employee_name": names.get(k, "")} for k, v in result.items()]


@router.post("/attendance", status_code=201)
def create_attendance(body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    eid = str(body.get("employee_id") or "")
    _employee_scope(db, actor, eid)
    row = _row(db, """INSERT INTO public.attendance(emp_id,date,time_in,time_out,location_id,location_name,status,notes,late_minutes,early_minutes)
        VALUES(:eid,:day,:time_in,:time_out,:location_id,:location_name,:status,:notes,:late,:early) RETURNING *""",
        eid=eid, day=body.get("work_date"), time_in=body.get("time_in"), time_out=body.get("time_out"),
        location_id=body.get("location_id"), location_name=body.get("location_name"), status=body.get("status") or "present",
        notes=body.get("notes"), late=body.get("late_minutes") or 0, early=body.get("early_minutes") or 0)
    _write_audit(db, actor, request, "attendance", "manual_entry", "attendance", row["id"], details={"employee_id": eid})
    db.commit()
    return _attendance_row(db, row)


@router.patch("/attendance/{record_id}")
def update_attendance(record_id: uuid.UUID, body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    allowed = {"date": "work_date", "time_in": "time_in", "time_out": "time_out", "location_id": "location_id",
               "location_name": "location_name", "status": "status", "notes": "notes", "late_minutes": "late_minutes", "early_minutes": "early_minutes"}
    changes = {column: body[key] for key, column in allowed.items() if key in body}
    if not changes:
        raise ApiError(422, "empty_update", "No attendance fields were supplied")
    names = {"work_date": "date"}
    set_sql = ",".join(f"{names.get(k,k)}=:{k}" for k in changes)
    changes["id"] = record_id
    row = _row(db, f"UPDATE public.attendance SET {set_sql} WHERE id=:id RETURNING *", **changes)
    if not row:
        raise ApiError(404, "not_found", "Attendance record not found")
    _write_audit(db, actor, request, "attendance", "update", "attendance", record_id, details={"changed_fields": list(body)})
    db.commit()
    return _attendance_row(db, row)


@router.delete("/attendance/{record_id}", status_code=204)
def delete_attendance(record_id: uuid.UUID, request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    result = db.execute(text("DELETE FROM public.attendance WHERE id=:id"), {"id": record_id})
    if not result.rowcount:
        raise ApiError(404, "not_found", "Attendance record not found")
    _write_audit(db, actor, request, "attendance", "delete", "attendance", record_id)
    db.commit()


@router.get("/me/attendance")
def my_attendance(actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    eid = actor.get("employee_id")
    if not eid:
        raise ApiError(404, "not_found", "Employee not found")
    emp = _employee_scope(db, actor, eid)
    today = today_riyadh()
    sessions = _rows(db, "SELECT * FROM public.attendance WHERE emp_id=:eid AND date=:day ORDER BY time_in,created_at", eid=eid, day=today)
    history = _rows(db, "SELECT * FROM public.attendance WHERE emp_id=:eid AND date>=:since ORDER BY date DESC,time_in", eid=eid, since=today-timedelta(days=30))
    locs = _rows(db, "SELECT * FROM public.work_locations WHERE active AND (employer='all' OR employer=:employer)", employer=emp.get("employer"))
    settings = attendance_settings(actor, db)
    remote_used = db.scalar(text("SELECT count(DISTINCT date) FROM public.attendance WHERE emp_id=:eid AND status='remote' AND date>=:year_start AND date<=:day"),
                            {"eid": eid, "year_start": date(today.year, 1, 1), "day": today}) or 0
    return {"today": [_attendance_row(db, row) for row in sessions], "history": [_attendance_row(db, row) for row in history],
            "locations": locs, "flexible_enabled": settings["flexible_enabled"], "shift_hours": settings["shift_hours"],
            "window_start": str(settings["window_start"] or "08:00")[:5], "window_end": str(settings["window_end"] or "17:00")[:5],
            "work_start": str(settings["work_start"] or "08:00")[:5], "tolerance_minutes": settings["tolerance_minutes"],
            "expected_checkout": None, "remote_limit": settings["remote_days_per_year"], "remote_used": remote_used}


def _distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2-lat1), math.radians(lng2-lng1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return radius * 2 * math.asin(min(1, math.sqrt(a)))


@router.post("/me/attendance/punch")
def punch(body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    eid = actor.get("employee_id")
    action = body.get("action")
    if not eid or action not in {"in", "out"}:
        raise ApiError(422, "invalid_request", "Employee and punch action are required")
    emp = _employee_scope(db, actor, eid)
    lat, lng = float(body.get("lat")), float(body.get("lng"))
    allowed_ids = emp.get("data", {}).get("workLocationIds") or []
    locs = _rows(db, "SELECT * FROM public.work_locations WHERE active AND (employer='all' OR employer=:employer)", employer=emp.get("employer"))
    if allowed_ids:
        locs = [l for l in locs if l["id"] in allowed_ids]
    def inside(location: dict[str, Any]) -> bool:
        polygon = location.get("polygon")
        if polygon is not None:
            return bool(db.scalar(text("SELECT public.ariba_point_in_polygon(:lat,:lng,CAST(:polygon AS jsonb))"),
                                  {"lat": lat, "lng": lng, "polygon": json.dumps(polygon)}))
        return _distance_m(lat, lng, float(location["latitude"]), float(location["longitude"])) <= int(location.get("radius_m") or 200)
    loc = next((l for l in sorted(locs, key=lambda x: x.get("radius_m") or 200) if l.get("type") != "remote" and inside(l)), None)
    today = today_riyadh()
    if loc is None:
        remote = next((l for l in locs if l.get("type") == "remote"), None)
        approved = _row(db, """SELECT id FROM public.workflow_requests WHERE employee_id=:eid AND request_type='remote' AND status='approved'
            AND nullif(payload->>'from','')::date<=:day AND coalesce(nullif(payload->>'to','')::date,nullif(payload->>'from','')::date)>=:day LIMIT 1""", eid=eid, day=today)
        if not remote or not approved:
            raise ApiError(403, "outside_geofence", "Outside an approved work location")
        loc = remote
        remote_count = db.scalar(text("SELECT count(DISTINCT date) FROM public.attendance WHERE emp_id=:eid AND status='remote' AND date>=:year_start AND date<=:day"),
                                 {"eid": eid, "year_start": date(today.year, 1, 1), "day": today}) or 0
        if remote_count >= int((_row(db, "SELECT remote_days_per_year FROM public.company_settings WHERE id='default'") or {}).get("remote_days_per_year") or 10):
            raise ApiError(409, "remote_limit_reached", "Remote-work allowance is exhausted")
    now_local = now_riyadh().time().replace(tzinfo=None, microsecond=0)
    db.execute(text("UPDATE public.attendance SET time_out='23:59:00',early_minutes=0,notes=coalesce(notes,'')||' | auto-close 23:59' WHERE emp_id=:eid AND date<:day AND time_in IS NOT NULL AND time_out IS NULL"), {"eid": eid, "day": today})
    opened = _row(db, "SELECT * FROM public.attendance WHERE emp_id=:eid AND date=:day AND time_in IS NOT NULL AND time_out IS NULL ORDER BY created_at DESC LIMIT 1", eid=eid, day=today)
    settings = _row(db, "SELECT * FROM public.company_settings WHERE id='default'") or {}
    if action == "in":
        if opened:
            raise ApiError(409, "already_checked_in", "Already checked in")
        first = not bool(_row(db, "SELECT id FROM public.attendance WHERE emp_id=:eid AND date=:day LIMIT 1", eid=eid, day=today))
        work_start = settings.get("work_start") or time(8)
        tolerance = int(settings.get("tolerance_minutes") or 15)
        if first and settings.get("flexible_enabled"):
            start_window = settings.get("flex_window_start") or time(8)
            end_window = settings.get("flex_window_end") or time(17)
            if now_local < start_window:
                raise ApiError(409, "too_early_for_flexible_window", "Punch is before the flexible-hours window")
            late = int(db.scalar(text("SELECT public.ariba_punch_late(:punch_time)"), {"punch_time": now_local}) or 0)
            expected = end_window if late else (datetime.combine(today, now_local)+timedelta(hours=float(settings.get("shift_hours") or 8))).time()
            if expected > end_window:
                raise ApiError(409, "too_late_for_flexible_window", "Punch would extend past the flexible-hours window")
        else:
            late = int(db.scalar(text("SELECT greatest(0,round(extract(epoch from (:punch_time-(:start_time + make_interval(mins=>:tolerance))))/60)::integer)"),
                                 {"punch_time": now_local, "start_time": work_start, "tolerance": tolerance}) or 0) if first else 0
        row = _row(db, """INSERT INTO public.attendance(emp_id,date,time_in,location_id,location_name,lat,lng,status,notes,late_minutes,early_minutes)
            VALUES(:eid,:day,:now,:loc,:name,:lat,:lng,:status,:notes,:late,0) RETURNING *""", eid=eid, day=today, now=now_local, loc=loc["id"], name=loc["name"], lat=lat, lng=lng, status="remote" if loc.get("type")=="remote" else ("late" if late else "present"), notes="GPS punch", late=late)
    else:
        if not opened:
            raise ApiError(409, "not_checked_in", "Not checked in")
        if settings.get("flexible_enabled"):
            first_row = _row(db, "SELECT time_in,late_minutes FROM public.attendance WHERE emp_id=:eid AND date=:day ORDER BY time_in LIMIT 1", eid=eid, day=today)
            early = int(db.scalar(text("SELECT public.ariba_punch_early(:punch_in,:punch_out,:late)"),
                                  {"punch_in": first_row["time_in"], "punch_out": now_local, "late": first_row.get("late_minutes") or 0}) or 0)
        else:
            early = 0
        row = _row(db, "UPDATE public.attendance SET time_out=:now,lat=:lat,lng=:lng,early_minutes=:early WHERE id=:id RETURNING *", now=now_local, lat=lat, lng=lng, early=early, id=opened["id"])
    _write_audit(db, actor, request, "attendance", "punch_"+action, "attendance", row["id"])
    db.commit()
    return _attendance_row(db, row)


@router.get("/me/leave")
def my_leave(actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    eid = actor.get("employee_id")
    if not eid:
        raise ApiError(404, "not_found", "Employee not found")
    result = db.execute(text("SELECT public.ariba_leave_calc(:eid,:asof)"), {"eid": eid, "asof": today_riyadh()}).scalar_one()
    return result


@router.get("/me/requests")
def my_requests(actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    eid = actor.get("employee_id")
    if not eid:
        raise ApiError(404, "not_found", "Employee not found")
    return _rows(db, "SELECT * FROM public.workflow_requests WHERE employee_id=:eid ORDER BY created_at DESC", eid=eid)


@router.get("/me/team")
def my_team(actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    return _rows(db, "SELECT employee_id AS id,username,name_ar,name_en,job_title,department FROM public.employee_directory WHERE manager_id=:eid AND active ORDER BY name_ar", eid=actor.get("employee_id"))


@router.get("/me/approvals")
def approvals(actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    role, eid = actor.get("role"), actor.get("employee_id")
    if role in HR_ROLES | {"ceo"}:
        return _rows(db, "SELECT * FROM public.workflow_requests WHERE status='pending' ORDER BY created_at")
    return _rows(db, "SELECT * FROM public.workflow_requests WHERE status='pending' AND manager_id=:eid ORDER BY created_at", eid=eid)


@router.post("/me/requests")
def submit_request(body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    eid = actor.get("employee_id")
    if not eid:
        raise ApiError(404, "not_found", "Employee not found")
    emp = _employee_scope(db, actor, eid)
    req_type = str(body.get("type") or "")
    if not req_type:
        raise ApiError(422, "invalid_request", "Request type is required")
    payload = {**body, "submitted_from": "employee_app", "submitted_at": datetime.now(UTC).isoformat()}
    if req_type == "forgot_punch":
        if payload.get("kind") not in {"in", "out", "both"} or not payload.get("date") or not payload.get("time") or not payload.get("notes"):
            raise ApiError(422, "invalid_request", "Forgot-punch request fields are required")
    stage = "hr" if req_type == "forgot_punch" or not emp.get("manager_id") else "manager"
    result = _row(db, """INSERT INTO public.workflow_requests(employee_id,request_type,payload,manager_id,hr_id,current_stage,status)
        VALUES(:eid,:type,CAST(:payload AS jsonb),:manager,:hr,:stage,'pending') RETURNING *""", eid=eid, type=req_type, payload=json.dumps(payload), manager=emp.get("manager_id"), hr="40", stage=stage)
    if req_type in {"annual","sick","emergency","death","marriage","maternity","paternity","umrah","hajj","remote"}:
        start, end = date.fromisoformat(str(payload.get("from"))), date.fromisoformat(str(payload.get("to")))
        days = max(1, int(payload.get("days") or (end-start).days+1))
        db.execute(text("""INSERT INTO public.leave_requests(emp_id,type,from_date,to_date,days,notes,status,mgr_status,hr_status,ceo_status,manager_id,workflow_request_id)
            VALUES(:eid,:type,:start,:end,:days,:notes,'pending','pending','pending','pending',:manager,:rid)"""), {"eid": eid, "type": req_type, "start": start, "end": end, "days": days, "notes": payload.get("notes", ""), "manager": emp.get("manager_id"), "rid": result["id"]})
    _insert_notification(db, emp.get("manager_id") if stage == "manager" else "40", result["id"], "New request", req_type, stage, "request")
    _write_audit(db, actor, request, "workflow", "submit", "workflow_request", result["id"], details={"type": req_type})
    db.commit()
    return result


@router.post("/me/approvals/{request_id}")
def decide_request(request_id: uuid.UUID, body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    item = _row(db, "SELECT * FROM public.workflow_requests WHERE id=:id", id=request_id)
    if not item or item["status"] != "pending":
        raise ApiError(404, "not_found", "Pending request not found")
    action = body.get("action")
    role, eid = actor["role"], actor.get("employee_id")
    stage = item["current_stage"]
    allowed = (stage == "manager" and (item.get("manager_id") == eid or role == "admin")) or (stage == "hr" and role in HR_ROLES) or (stage == "ceo" and role in {"ceo", "admin"})
    if not allowed or action not in {"approve", "reject"}:
        raise ApiError(403, "forbidden", "Not authorized to decide this request")
    if action == "reject" and not str(body.get("reason") or "").strip():
        raise ApiError(422, "reason_required", "A rejection reason is required")
    if action == "approve" and stage == "manager":
        next_stage, status = "hr", "pending"
    elif action == "approve" and stage == "hr" and item["request_type"] != "forgot_punch":
        next_stage, status = "ceo", "pending"
    else:
        next_stage, status = ("completed", "approved") if action == "approve" else ("rejected", "rejected")
    db.execute(text("INSERT INTO public.workflow_actions(request_id,actor_employee_id,actor_account_id,stage,action,comment) VALUES(:rid,:eid,:aid,:stage,:action,:comment)"), {"rid": request_id, "eid": eid, "aid": actor["account_id"], "stage": stage, "action": "approved" if action == "approve" else "rejected", "comment": body.get("reason")})
    db.execute(text("UPDATE public.workflow_requests SET status=:status,current_stage=:stage,rejection_reason=:reason,updated_at=now(),completed_at=CASE WHEN :done THEN now() ELSE completed_at END WHERE id=:id"), {"status": status, "stage": next_stage, "reason": body.get("reason"), "done": status != "pending", "id": request_id})
    db.execute(text("UPDATE public.leave_requests SET status=:status,updated_at=now() WHERE workflow_request_id=:id"), {"status": status, "id": request_id})
    _insert_notification(db, item["employee_id"], request_id, "Request decision", str(body.get("reason") or status), "employee", "decision")
    _write_audit(db, actor, request, "workflow", action, "workflow_request", request_id, details={"stage": stage})
    db.commit()
    return _row(db, "SELECT * FROM public.workflow_requests WHERE id=:id", id=request_id)


@router.get("/me/payslips")
def payslips(actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    return _rows(db, "SELECT pay_year AS year,pay_month AS month,payload AS data FROM public.employee_payrolls WHERE employee_id=:eid AND approved ORDER BY pay_year DESC,pay_month DESC", eid=actor.get("employee_id"))


@router.get("/me/notifications")
def notifications(actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    return _rows(db, "SELECT * FROM public.workflow_notifications WHERE recipient_employee_id=:eid ORDER BY created_at DESC LIMIT 50", eid=actor.get("employee_id"))


@router.get("/me/letters")
def my_letters(actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    return _rows(db, """SELECT r.id,r.request_type AS type,r.payload->>'title' AS title,r.status,r.rejection_reason,r.created_at,r.completed_at
        FROM public.workflow_requests r WHERE r.employee_id=:eid AND r.request_type LIKE 'template:%' ORDER BY r.created_at DESC""", eid=actor.get("employee_id"))


@router.post("/me/letters/{letter_id}/respond")
def respond_letter(letter_id: uuid.UUID, body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    row = _row(db, "SELECT * FROM public.workflow_requests WHERE id=:id AND employee_id=:eid AND request_type LIKE 'template:%' AND current_stage='employee' AND status='pending'", id=letter_id, eid=actor.get("employee_id"))
    if not row:
        raise ApiError(404, "not_found", "Pending letter not found")
    action = body.get("action")
    if action not in {"approved", "rejected"} or (action == "rejected" and len(str(body.get("reason") or "").strip()) < 3):
        raise ApiError(422, "invalid_request", "Invalid letter response")
    status = "approved" if action == "approved" else "rejected"
    db.execute(text("INSERT INTO public.workflow_actions(request_id,actor_employee_id,actor_account_id,stage,action,comment) VALUES(:id,:eid,:aid,'employee',:action,:reason)"), {"id": letter_id, "eid": actor.get("employee_id"), "aid": actor["account_id"], "action": action, "reason": body.get("reason")})
    db.execute(text("UPDATE public.workflow_requests SET status=:status,current_stage=:stage,rejection_reason=:reason,updated_at=now() WHERE id=:id"), {"status": status, "stage": "completed" if status == "approved" else "rejected", "reason": body.get("reason"), "id": letter_id})
    _write_audit(db, actor, request, "letters", "respond", "workflow_request", letter_id, details={"action": action})
    db.commit()
    return _row(db, "SELECT id,request_type AS type,payload->>'title' AS title,status,rejection_reason,created_at,completed_at AS responded_at FROM public.workflow_requests WHERE id=:id", id=letter_id)


@router.get("/letters/{letter_id}/html", response_class=HTMLResponse)
def letter_html(letter_id: uuid.UUID, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    row = _row(db, "SELECT d.file_data,d.mime_type,d.file_name FROM public.ariba_documents d JOIN public.workflow_requests r ON d.request_id=r.id WHERE r.id=:id AND (r.employee_id=:eid OR :role=ANY(:roles)) LIMIT 1", id=letter_id, eid=actor.get("employee_id"), role=actor["role"], roles=list(HR_READ_ROLES))
    if not row:
        raise ApiError(404, "not_found", "Letter not found")
    return HTMLResponse(bytes(row["file_data"]).decode("utf-8", errors="replace"))


@router.get("/employees/{employee_id}/documents")
def list_documents(employee_id: str, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _employee_scope(db, actor, employee_id)
    return _rows(db, "SELECT id,employee_id,request_id,document_type AS type,file_name,mime_type,file_size AS size_bytes,uploaded_by,created_at FROM public.ariba_documents WHERE employee_id=:eid ORDER BY created_at DESC", eid=employee_id)


@router.post("/employees/{employee_id}/documents")
async def upload_document(employee_id: str, request: Request, file: UploadFile = File(...), type: str = Form("other"), actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    _employee_scope(db, actor, employee_id)
    data = await file.read(get_settings().max_upload_bytes + 1)
    if len(data) > get_settings().max_upload_bytes:
        raise ApiError(413, "file_too_large", "File exceeds the upload limit")
    row = _row(db, """INSERT INTO public.ariba_documents(employee_id,document_type,file_name,mime_type,file_size,file_data,uploaded_by)
        VALUES(:eid,:type,:name,:mime,:size,:data,:actor) RETURNING id,employee_id,document_type AS type,file_name,mime_type,file_size AS size_bytes,uploaded_by,created_at""", eid=employee_id, type=type, name=file.filename or "upload", mime=file.content_type or "application/octet-stream", size=len(data), data=data, actor=actor.get("employee_id"))
    _write_audit(db, actor, request, "documents", "upload", "document", row["id"], details={"employee_id": employee_id})
    db.commit()
    return row


@router.get("/documents/{document_id}/file")
def download_document(document_id: uuid.UUID, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    row = _row(db, "SELECT * FROM public.ariba_documents WHERE id=:id", id=document_id)
    if not row:
        raise ApiError(404, "not_found", "Document not found")
    _employee_scope(db, actor, row["employee_id"])
    return Response(content=bytes(row["file_data"]), media_type=row["mime_type"], headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(row['file_name'])}", "Cache-Control": "private, no-store"})


@router.delete("/documents/{document_id}", status_code=204)
def delete_document(document_id: uuid.UUID, request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    document = _row(db, "SELECT * FROM public.ariba_documents WHERE id=:id", id=document_id)
    if not document:
        raise ApiError(404, "not_found", "Document not found")
    _employee_scope(db, actor, document["employee_id"])
    if actor["role"] not in HR_ROLES and document.get("uploaded_by") != actor.get("employee_id"):
        raise ApiError(403, "forbidden", "Not authorized to delete this document")
    snapshot = {k: v for k, v in document.items() if k != "file_data"}
    snapshot["file_data_base64"] = base64.b64encode(bytes(document["file_data"])).decode("ascii")
    db.execute(text("INSERT INTO public.ariba_deleted_items(kind,ref_id,employee_id,snapshot,deleted_by,deleted_by_role) VALUES('document',:id,:eid,CAST(:snapshot AS jsonb),:actor,:role)"),
               {"id": str(document_id), "eid": document["employee_id"], "snapshot": json.dumps(snapshot, default=str), "actor": actor.get("employee_id"), "role": actor["role"]})
    db.execute(text("DELETE FROM public.ariba_documents WHERE id=:id"), {"id": document_id})
    _write_audit(db, actor, request, "documents", "delete", "document", document_id)
    db.commit()


@router.put("/employees/{employee_id}/photo", status_code=204)
async def upload_photo(employee_id: str, request: Request, file: UploadFile = File(...), actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    row = _employee_scope(db, actor, employee_id)
    content = await file.read(get_settings().max_upload_bytes + 1)
    if len(content) > get_settings().max_upload_bytes:
        raise ApiError(413, "file_too_large", "File exceeds the upload limit")
    db.execute(text("DELETE FROM public.ariba_documents WHERE employee_id=:eid AND document_type='photo'"), {"eid": employee_id})
    db.execute(text("INSERT INTO public.ariba_documents(employee_id,document_type,file_name,mime_type,file_size,file_data,uploaded_by) VALUES(:eid,'photo',:name,:mime,:size,:data,:actor)"),
               {"eid": employee_id, "name": file.filename or "photo", "mime": file.content_type or "application/octet-stream", "size": len(content), "data": content, "actor": actor.get("employee_id")})
    data = dict(row.get("data") or {})
    data["photoUrl"] = f"/api/v1/employees/{employee_id}/photo"
    db.execute(text("UPDATE public.employee_directory SET data=CAST(:data AS jsonb),updated_at=now() WHERE employee_id=:eid"), {"data": json.dumps(data, ensure_ascii=False), "eid": employee_id})
    _write_audit(db, actor, request, "documents", "upload_photo", "employee", employee_id)
    db.commit()


@router.get("/employees/{employee_id}/photo")
def get_photo(employee_id: str, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _employee_scope(db, actor, employee_id)
    photo = _row(db, "SELECT file_data,mime_type,file_name FROM public.ariba_documents WHERE employee_id=:eid AND document_type='photo' ORDER BY created_at DESC LIMIT 1", eid=employee_id)
    if not photo:
        raise ApiError(404, "not_found", "Photo not found")
    return Response(content=bytes(photo["file_data"]), media_type=photo["mime_type"], headers={"Cache-Control": "private, no-store"})


@router.delete("/employees/{employee_id}/photo", status_code=204)
def delete_photo(employee_id: str, request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    row = _employee_scope(db, actor, employee_id)
    db.execute(text("DELETE FROM public.ariba_documents WHERE employee_id=:eid AND document_type='photo'"), {"eid": employee_id})
    data = dict(row.get("data") or {})
    data.pop("photoUrl", None)
    db.execute(text("UPDATE public.employee_directory SET data=CAST(:data AS jsonb),updated_at=now() WHERE employee_id=:eid"), {"data": json.dumps(data, ensure_ascii=False), "eid": employee_id})
    _write_audit(db, actor, request, "documents", "delete_photo", "employee", employee_id)
    db.commit()


@router.post("/dependents/{dependent_id}/documents")
async def dependent_document_unavailable(dependent_id: str, file: UploadFile = File(...), actor: dict[str, Any] = Depends(current_actor)):
    raise ApiError(501, "feature_unavailable", "Dependents and dependent documents are not represented in the canonical schema")


@router.get("/sheets")
def list_sheets(prefix: str = "pay_", actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *PAYROLL_ROLES)
    rows = _rows(db, "SELECT pay_year,pay_month,approved,approved_at,updated_at FROM public.payroll_archives_v2 ORDER BY pay_year DESC,pay_month DESC")
    return [{"key": f"pay_{r['pay_year']}_{r['pay_month']:02d}", "approved": r["approved"], "approved_at": r["approved_at"], "updated_at": r["updated_at"]} for r in rows]


@router.get("/sheets/{key}")
def get_sheet(key: str, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *PAYROLL_ROLES)
    try:
        _, year, month = key.split("_")
        year, month = int(year), int(month)
    except (ValueError, TypeError):
        raise ApiError(422, "invalid_key", "Invalid payroll sheet key")
    row = _row(db, "SELECT pay_year,pay_month,approved,approved_at,rows AS data,saved_at AS updated_at FROM public.payroll_archives_v2 WHERE pay_year=:year AND pay_month=:month", year=year, month=month)
    return {"key": key, "data": row.get("data") if row else [], "approved": row.get("approved", False), "approved_at": row.get("approved_at") if row else None, "updated_at": row.get("updated_at") if row else None}


@router.put("/sheets/{key}")
def put_sheet(key: str, body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *PAYROLL_ROLES)
    try:
        _, year, month = key.split("_")
        year, month = int(year), int(month)
    except (ValueError, TypeError):
        raise ApiError(422, "invalid_key", "Invalid payroll sheet key")
    rows = body.get("data") or []
    if _row(db, "SELECT id FROM public.payroll_archives_v2 WHERE pay_year=:year AND pay_month=:month AND approved", year=year, month=month):
        raise ApiError(409, "approved", "Approved payroll cannot be edited")
    archive = _row(db, """INSERT INTO public.payroll_archives_v2(pay_year,pay_month,approved,rows,saved_at,updated_at)
        VALUES(:year,:month,false,CAST(:rows AS jsonb),now(),now()) ON CONFLICT(pay_year,pay_month) DO UPDATE SET rows=excluded.rows,updated_at=now()
        RETURNING id""", year=year, month=month, rows=json.dumps(rows))
    db.execute(text("DELETE FROM public.employee_payrolls WHERE pay_year=:year AND pay_month=:month AND NOT approved"), {"year": year, "month": month})
    for item in rows:
        if not isinstance(item, dict):
            continue
        emp_id = item.get("employee_id") or item.get("emp_id") or item.get("id")
        if not emp_id:
            continue
        db.execute(text("""INSERT INTO public.employee_payrolls(employee_id,pay_year,pay_month,approved,payload,updated_at)
            VALUES(:eid,:year,:month,false,CAST(:payload AS jsonb),now()) ON CONFLICT(employee_id,pay_year,pay_month) DO UPDATE SET payload=excluded.payload,updated_at=now()"""), {"eid": str(emp_id), "year": year, "month": month, "payload": json.dumps(item)})
    db.execute(text("INSERT INTO public.ariba_payroll_status(pay_year,pay_month,status,updated_at) VALUES(:year,:month,'draft',now()) ON CONFLICT(pay_year,pay_month) DO UPDATE SET status=CASE WHEN ariba_payroll_status.status='approved' THEN 'approved' ELSE 'draft' END,updated_at=now()"), {"year": year, "month": month})
    _write_audit(db, actor, request, "payroll", "save", "payroll_archive", archive["id"], details={"year": year, "month": month})
    db.commit()
    return {"key": key, "data": rows, "approved": False}


@router.post("/sheets/{key}/approve")
def approve_sheet(key: str, request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *PAYROLL_ROLES)
    if actor["role"] == "finance":
        status = _row(db, "SELECT status FROM public.ariba_payroll_status WHERE pay_year=:year AND pay_month=:month", year=int(key.split("_")[1]), month=int(key.split("_")[2]))
        if (status or {}).get("status") != "prepared":
            raise ApiError(409, "payroll_not_prepared", "Payroll must be prepared before finance approval")
    try:
        _, year, month = key.split("_")
        year, month = int(year), int(month)
    except (ValueError, TypeError):
        raise ApiError(422, "invalid_key", "Invalid payroll sheet key")
    row = _row(db, "UPDATE public.payroll_archives_v2 SET approved=true,approved_at=now()::text,updated_at=now() WHERE pay_year=:year AND pay_month=:month RETURNING id,rows", year=year, month=month)
    if not row:
        raise ApiError(404, "not_found", "Payroll not found")
    db.execute(text("UPDATE public.employee_payrolls SET approved=true,approved_at=now(),updated_at=now() WHERE pay_year=:year AND pay_month=:month"), {"year": year, "month": month})
    db.execute(text("INSERT INTO public.ariba_payroll_status(pay_year,pay_month,status,approved_by,approved_by_name,approved_at,updated_at) VALUES(:year,:month,'approved',:eid,:name,now(),now()) ON CONFLICT(pay_year,pay_month) DO UPDATE SET status='approved',approved_by=excluded.approved_by,approved_by_name=excluded.approved_by_name,approved_at=now(),updated_at=now()"), {"year": year, "month": month, "eid": actor.get("employee_id"), "name": actor["name_ar"]})
    _write_audit(db, actor, request, "payroll", "approve", "payroll_archive", row["id"])
    db.commit()
    return {"key": key, "data": row["rows"], "approved": True}


@router.post("/sheets/{key}/unapprove")
def reopen_payroll(key: str, body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *PAYROLL_ROLES)
    try:
        _, year, month = key.split("_")
        year, month = int(year), int(month)
    except (ValueError, TypeError):
        raise ApiError(422, "invalid_key", "Invalid payroll sheet key")
    reason = str(body.get("reason") or "Reopened for correction").strip()
    archive = _row(db, "UPDATE public.payroll_archives_v2 SET approved=false,approved_at=NULL,updated_at=now() WHERE pay_year=:year AND pay_month=:month RETURNING id,rows", year=year, month=month)
    if not archive:
        raise ApiError(404, "not_found", "Payroll not found")
    db.execute(text("UPDATE public.employee_payrolls SET approved=false,approved_at=NULL,updated_at=now() WHERE pay_year=:year AND pay_month=:month"), {"year": year, "month": month})
    db.execute(text("""INSERT INTO public.ariba_payroll_status(pay_year,pay_month,status,reopened_by,reopened_by_name,reopened_at,reopen_reason,updated_at)
        VALUES(:year,:month,'reopened',:eid,:name,now(),:reason,now()) ON CONFLICT(pay_year,pay_month) DO UPDATE SET
        status='reopened',reopened_by=excluded.reopened_by,reopened_by_name=excluded.reopened_by_name,reopened_at=now(),reopen_reason=excluded.reopen_reason,updated_at=now()"""),
        {"year": year, "month": month, "eid": actor.get("employee_id"), "name": actor.get("name_ar"), "reason": reason})
    _write_audit(db, actor, request, "payroll", "reopen", "payroll_archive", archive["id"], details={"reason": reason})
    db.commit()
    return {"key": key, "data": archive["rows"], "approved": False}


@router.get("/payroll-archive")
def payroll_archive(actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *PAYROLL_ROLES)
    return _rows(db, """SELECT pay_year AS year,pay_month AS month,approved_at,jsonb_array_length(rows) AS employees,
        coalesce((SELECT sum((item->>'totalDue')::numeric) FROM jsonb_array_elements(rows) item),0) AS total,
        coalesce((SELECT sum((item->>'netSAR')::numeric) FROM jsonb_array_elements(rows) item),0) AS net_sar
        FROM public.payroll_archives_v2 WHERE approved ORDER BY pay_year DESC,pay_month DESC""")


@router.get("/salary/basis")
def salary_basis(actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *SALARY_ROLES)
    rows = _rows(db, "SELECT * FROM public.employee_directory ORDER BY name_ar")
    result = []
    for row in rows:
        emp = _employee_dict(row)
        data = emp["data"]
        basic = float(data.get("salary") or 0)
        housing = float(data.get("housingAllowance") or 0)
        joined = emp.get("join_date")
        ended = data.get("lastDay") or today_riyadh().isoformat()
        try:
            years = max(0.0, (date.fromisoformat(str(ended)[:10])-date.fromisoformat(str(joined)[:10])).days/365.0) if joined else 0.0
        except ValueError:
            years = 0.0
        eos_base = basic + housing
        eos = eos_base/2*min(years,5)+eos_base*max(0,years-5)
        result.append({"id": emp["employee_id"], "emp_no": emp["emp_no"], "name_ar": emp["name_ar"],
                       "workplace": emp["employer"], "department": emp["department"], "job_title": emp["job_title"],
                       "nationality": emp["nationality"], "is_saudi": bool(data.get("isSaudi")), "birth_date": emp["dob"],
                       "category": data.get("empType", "active"), "wps_type": data.get("wpsType", "wps"),
                       "gosi_system": data.get("insSystem"), "join_date": emp["join_date"],
                       "contract_duration_months": data.get("contractDuration"), "contract_end_date": data.get("contractEnd"),
                       "annual_leave_days": data.get("leaveDaysContract", 21), "basic_salary": basic, "housing_allowance": housing,
                       "transport_allowance": data.get("transportAllowance", 0), "project_allowance": data.get("projectAllowance", 0),
                       "other_allowances": data.get("otherAllowance", 0), "extra_allowance": data.get("extraAllowance", 0),
                       "other_deductions": data.get("otherDeductions", 0), "currency": data.get("currency", "SAR"),
                       "exchange_rate": data.get("exchRate", 1), "payment_method": data.get("payMethod"),
                       "bank_name": data.get("bank"), "iban": data.get("iban"),
                       "exclude_from_payroll": bool(data.get("excludeFromPayroll")), "exclude_from_eos": bool(data.get("excludeFromEos")),
                       "is_terminated": not emp["active"], "termination_date": data.get("terminationDate") or data.get("lastDay"),
                       "termination_article": data.get("terminationArticle"), "termination_reason": data.get("terminationReason"),
                       "total_salary": data.get("salaryTotal", basic+housing), "gosi_employee": data.get("insuranceSub", 0),
                       "net_salary": data.get("netSalaryLocal", data.get("netSalary", 0)), "years_of_service": years, "eos_basic": round(eos,2)})
    return result


@router.get("/registry/documents")
def document_registry(actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_READ_ROLES)
    rows = _rows(db, "SELECT * FROM public.employee_directory WHERE active ORDER BY employee_id")
    today = today_riyadh()
    out = []
    for row in rows:
        e = _employee_dict(row)
        d = e["data"]
        def days(key: str):
            raw = d.get(key)
            try:
                return (date.fromisoformat(str(raw)[:10])-today).days if raw else None
            except ValueError:
                return None
        out.append({"id": e["employee_id"], "emp_no": e["emp_no"], "name_ar": e["name_ar"], "workplace": e["employer"], "nationality": e["nationality"], "national_id": d.get("iqamaNo"), "national_id_expiry": d.get("iqamaExpiry"), "national_id_days": days("iqamaExpiry"), "passport_no": d.get("passportNo"), "passport_expiry": d.get("passportExpiry"), "passport_days": days("passportExpiry"), "insurance_company": d.get("insuranceCo"), "insurance_class": d.get("insuranceClass"), "insurance_card_no": d.get("insuranceCard"), "insurance_expiry": d.get("insuranceExpiry"), "insurance_days": days("insuranceExpiry"), "contract_type": d.get("contractNature"), "join_date": d.get("contractJoin"), "contract_end_date": d.get("contractEnd"), "contract_days": days("contractEnd")})
    return out


@router.get("/leave/requests")
def hr_leave_requests(actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_READ_ROLES)
    return _rows(db, "SELECT * FROM public.workflow_requests WHERE request_type NOT LIKE 'template:%' ORDER BY created_at DESC")


def _workflow_out(db: Session, row: dict[str, Any]) -> dict[str, Any]:
    payload = row.get("payload") or {}
    leave = _row(db, "SELECT * FROM public.leave_requests WHERE workflow_request_id=:id", id=row["id"])
    employee = _row(db, "SELECT name_ar FROM public.employee_directory WHERE employee_id=:id", id=row["employee_id"])
    return {"id": str(row["id"]), "employee_id": row["employee_id"], "employee_name": (employee or {}).get("name_ar", ""),
            "type": row["request_type"], "status": row["status"], "stage": row["current_stage"],
            "from_date": (leave or {}).get("from_date") or payload.get("from"), "to_date": (leave or {}).get("to_date") or payload.get("to"),
            "days": (leave or {}).get("days") or payload.get("days"), "on_date": payload.get("date"),
            "time_from": payload.get("time"), "hours": payload.get("hours"), "amount": payload.get("amount"),
            "punch_kind": payload.get("kind"), "notes": (leave or {}).get("notes") or payload.get("notes"),
            "rejection_reason": row.get("rejection_reason"), "attachment_id": None, "created_at": row["created_at"]}


@router.get("/requests")
def list_hr_requests(status: str | None = None, type: str | None = None, employee_id: str | None = None,
                     pending_now: bool = False, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_READ_ROLES)
    sql = "SELECT * FROM public.workflow_requests WHERE request_type NOT LIKE 'template:%'"
    params: dict[str, Any] = {}
    if pending_now or status == "pending":
        sql += " AND status='pending'"
    elif status:
        sql += " AND status=:status"
        params["status"] = status
    if type:
        sql += " AND request_type=:type"
        params["type"] = type
    if employee_id:
        sql += " AND employee_id=:employee_id"
        params["employee_id"] = employee_id
    sql += " ORDER BY created_at DESC"
    return [_workflow_out(db, row) for row in _rows(db, sql, **params)]


@router.post("/requests", status_code=201)
def create_hr_request(body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    employee_id = str(body.get("employee_id") or "")
    employee = _employee_scope(db, actor, employee_id)
    req_type = str(body.get("type") or "")
    if req_type not in {"annual", "sick", "emergency", "death", "marriage", "maternity", "paternity", "umrah", "hajj", "remote"}:
        raise ApiError(422, "invalid_request", "Unsupported HR leave type")
    start = date.fromisoformat(str(body.get("from_date")))
    end = date.fromisoformat(str(body.get("to_date")))
    if end < start:
        raise ApiError(422, "invalid_request", "End date must not precede start date")
    status = body.get("status") if body.get("status") in {"approved", "rejected", "pending"} else "pending"
    stage = "completed" if status == "approved" else ("rejected" if status == "rejected" else "hr")
    payload = {"from": start.isoformat(), "to": end.isoformat(), "days": body.get("days") or (end-start).days+1,
               "notes": body.get("notes") or "", "submitted_from": "hr_main", "submitted_at": datetime.now(UTC).isoformat()}
    row = _row(db, """INSERT INTO public.workflow_requests(employee_id,request_type,payload,manager_id,current_stage,status)
        VALUES(:eid,:type,CAST(:payload AS jsonb),:manager,:stage,:status) RETURNING *""", eid=employee_id, type=req_type,
        payload=json.dumps(payload), manager=employee.get("manager_id"), stage=stage, status=status)
    db.execute(text("""INSERT INTO public.leave_requests(emp_id,type,from_date,to_date,days,notes,status,mgr_status,hr_status,ceo_status,manager_id,workflow_request_id)
        VALUES(:eid,:type,:start,:end,:days,:notes,:status,:mgr,:status,:ceo,:manager,:rid)"""),
        {"eid": employee_id, "type": req_type, "start": start, "end": end, "days": payload["days"], "notes": payload["notes"],
         "status": status, "mgr": "skipped" if status == "pending" else status, "ceo": "pending" if status == "pending" else status,
         "manager": employee.get("manager_id"), "rid": row["id"]})
    _insert_notification(db, employee_id, row["id"], "Leave recorded by HR", f"{start} - {end}", "hr", "request")
    _write_audit(db, actor, request, "leave", "hr_create", "workflow_request", row["id"], details={"type": req_type})
    db.commit()
    return _workflow_out(db, row)


def _hr_decide(db: Session, actor: dict[str, Any], request: Request, request_id: uuid.UUID,
               action: str, reason: str | None, allow_override: bool = False) -> dict[str, Any]:
    item = _row(db, "SELECT * FROM public.workflow_requests WHERE id=:id", id=request_id)
    if not item or item["status"] != "pending":
        raise ApiError(404, "not_found", "Pending request not found")
    stage = item["current_stage"]
    if action not in {"approve", "reject"}:
        raise ApiError(422, "invalid_action", "Action must be approve or reject")
    if action == "reject" and not str(reason or "").strip():
        raise ApiError(422, "reason_required", "A rejection reason is required")
    if not allow_override and stage != "hr":
        raise ApiError(403, "forbidden", "This request is not at the HR stage")
    if actor["role"] not in HR_ROLES:
        raise ApiError(403, "forbidden", "Not authorized")
    next_stage = stage
    status = "pending"
    if action == "reject":
        next_stage, status = "rejected", "rejected"
    elif item["request_type"] == "forgot_punch" or stage == "ceo" or (stage == "hr" and allow_override):
        next_stage, status = "completed", "approved"
    elif stage == "manager":
        next_stage = "hr"
    elif stage == "hr":
        next_stage = "ceo"
    db.execute(text("INSERT INTO public.workflow_actions(request_id,actor_employee_id,actor_account_id,stage,action,comment) VALUES(:rid,:eid,:aid,:stage,:action,:reason)"),
               {"rid": request_id, "eid": actor.get("employee_id"), "aid": actor["account_id"], "stage": stage,
                "action": "approved" if action == "approve" else "rejected", "reason": reason})
    db.execute(text("""UPDATE public.workflow_requests SET status=:status,current_stage=:stage,rejection_reason=:reason,
        updated_at=now(),completed_at=CASE WHEN :done THEN now() ELSE completed_at END,
        rejected_at=CASE WHEN :rejected THEN now() ELSE rejected_at END WHERE id=:id"""),
        {"status": status, "stage": next_stage, "reason": reason, "done": status == "approved", "rejected": status == "rejected", "id": request_id})
    leave_status_column = {"manager": "mgr_status", "hr": "hr_status", "ceo": "ceo_status"}.get(stage)
    if leave_status_column:
        db.execute(text(f"UPDATE public.leave_requests SET {leave_status_column}=:stage_status,updated_at=now() WHERE workflow_request_id=:id"),
                   {"stage_status": status if status != "pending" else "approved", "id": request_id})
    if status in {"approved", "rejected"}:
        db.execute(text("UPDATE public.leave_requests SET status=:status,rejected_by=:actor,rejected_reason=:reason,updated_at=now() WHERE workflow_request_id=:id"),
                   {"status": status, "actor": actor.get("employee_id"), "reason": reason, "id": request_id})
        if item["request_type"] == "forgot_punch" and status == "approved":
            db.execute(text("SELECT public.ariba_apply_forgot_punch(:id)"), {"id": request_id})
        _insert_notification(db, item["employee_id"], request_id, "Request decision", str(reason or status), "employee", "decision")
    else:
        target = item.get("hr_id") if next_stage == "hr" else item.get("ceo_id")
        _insert_notification(db, target, request_id, "Request awaiting approval", item["request_type"], next_stage, "request")
    _write_audit(db, actor, request, "workflow", action, "workflow_request", request_id, details={"stage": stage, "override": allow_override})
    return _workflow_out(db, _row(db, "SELECT * FROM public.workflow_requests WHERE id=:id", id=request_id))


@router.post("/requests/{request_id}/approve")
def hr_approve_request(request_id: uuid.UUID, body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    result = _hr_decide(db, actor, request, request_id, "approve", body.get("reason"))
    db.commit()
    return result


@router.post("/requests/{request_id}/override")
def hr_override_request(request_id: uuid.UUID, body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    result = _hr_decide(db, actor, request, request_id, "approve", body.get("reason"), True)
    db.commit()
    return result


@router.post("/requests/{request_id}/final-approve")
def hr_final_approve(request_id: uuid.UUID, body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    item = _row(db, "SELECT current_stage,status FROM public.workflow_requests WHERE id=:id", id=request_id)
    if not item or item["status"] != "pending":
        raise ApiError(404, "not_found", "Pending request not found")
    result = None
    for _ in range(4):
        item = _row(db, "SELECT current_stage FROM public.workflow_requests WHERE id=:id", id=request_id)
        result = _hr_decide(db, actor, request, request_id, "approve", body.get("reason"), True)
        if result["status"] != "pending":
            break
    db.commit()
    return result


@router.post("/requests/{request_id}/reject")
def hr_reject_request(request_id: uuid.UUID, body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    result = _hr_decide(db, actor, request, request_id, "reject", body.get("reason"), True)
    db.commit()
    return result


@router.delete("/requests/{request_id}", status_code=204)
def hr_delete_request(request_id: uuid.UUID, request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    row = _row(db, "SELECT * FROM public.workflow_requests WHERE id=:id", id=request_id)
    if not row:
        raise ApiError(404, "not_found", "Request not found")
    snapshot = _row(db, """SELECT jsonb_build_object('request',to_jsonb(r),'leave',coalesce((SELECT jsonb_agg(to_jsonb(l)) FROM public.leave_requests l WHERE l.workflow_request_id=r.id),'[]'::jsonb),
        'documents',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'document_type',d.document_type,'file_name',d.file_name,'mime_type',d.mime_type,'file_size',d.file_size,'file_data',encode(d.file_data,'base64')) FROM public.ariba_documents d WHERE d.request_id=r.id),'[]'::jsonb)) AS snapshot
        FROM public.workflow_requests r WHERE r.id=:id""", id=request_id)
    db.execute(text("INSERT INTO public.ariba_deleted_items(kind,ref_id,employee_id,snapshot,deleted_by,deleted_by_role) VALUES('workflow_request',:id,:eid,CAST(:snapshot AS jsonb),:actor,:role)"),
               {"id": str(request_id), "eid": row["employee_id"], "snapshot": json.dumps(snapshot["snapshot"], default=str), "actor": actor.get("employee_id"), "role": actor["role"]})
    db.execute(text("DELETE FROM public.ariba_documents WHERE request_id=:id"), {"id": request_id})
    db.execute(text("DELETE FROM public.leave_requests WHERE workflow_request_id=:id"), {"id": request_id})
    db.execute(text("DELETE FROM public.workflow_notifications WHERE request_id=:id"), {"id": request_id})
    db.execute(text("DELETE FROM public.workflow_requests WHERE id=:id"), {"id": request_id})
    _write_audit(db, actor, request, "workflow", "delete", "workflow_request", request_id)
    db.commit()


@router.get("/holidays")
def list_holidays(actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    return holidays(actor, db)


@router.post("/holidays", status_code=201)
def create_holiday(body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    row = _row(db, "INSERT INTO public.public_holidays(id,name,name_en,holiday_date,days,recurring) VALUES(:id,:name,:name_en,:day,:days,:recurring) RETURNING id,name AS name_ar,name_en,holiday_date AS start_date,days,recurring AS is_recurring,updated_at",
               id=str(body.get("id") or uuid.uuid4()), name=body.get("name_ar") or body.get("name") or "", name_en=body.get("name_en"),
               day=body.get("start_date"), days=body.get("days") or 1, recurring=bool(body.get("is_recurring")))
    _write_audit(db, actor, request, "settings", "holiday_create", "public_holiday", row["id"])
    db.commit()
    return row


@router.delete("/holidays/{holiday_id}", status_code=204)
def delete_holiday(holiday_id: str, request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    result = db.execute(text("DELETE FROM public.public_holidays WHERE id=:id"), {"id": holiday_id})
    if not result.rowcount:
        raise ApiError(404, "not_found", "Holiday not found")
    _write_audit(db, actor, request, "settings", "holiday_delete", "public_holiday", holiday_id)
    db.commit()


@router.get("/leave/balances")
def leave_balances(actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_READ_ROLES)
    rows = _rows(db, "SELECT employee_id,data FROM public.employee_directory WHERE active ORDER BY employee_id")
    result = []
    for row in rows:
        data = row.get("data") or {}
        balance = db.execute(text("SELECT public.ariba_leave_calc(:eid,:day)"), {"eid": row["employee_id"], "day": today_riyadh()}).scalar_one()
        result.append({"employee_id": row["employee_id"], "name_ar": data.get("nameAr") or data.get("name_ar") or row["employee_id"],
                       "carry": balance.get("leaveCarryover", data.get("leaveCarryover", 0)),
                       "current": balance.get("leaveBalance", data.get("leaveBalance", 0)),
                       "year_end": balance.get("leaveYearEnd", data.get("leaveYearEnd", 0)),
                       "accrued_since_join": balance.get("leaveTotalSinceStart", 0),
                       "used_since_join": balance.get("leaveUsedSinceStart", 0),
                       "remaining_since_join": balance.get("leaveAvailableSinceStart", 0),
                       "eos": balance.get("leaveEosExcess", data.get("leaveEosExcess", 0)),
                       "annual": data.get("leaveDaysContract", 21),
                       "override_used": data.get("leaveHistoryByYear", {})})
    return result


def _leave_detail(row: dict[str, Any], balance: dict[str, Any]) -> dict[str, Any]:
    data = row.get("data") or {}
    annual = data.get("leaveDaysContract", 21)
    overrides = data.get("leaveYearOverrides") or {}
    summary = {"employee_id": row["employee_id"], "name_ar": data.get("nameAr") or data.get("name_ar") or row["employee_id"],
               "carry": balance.get("leaveCarryover", data.get("leaveCarryover", 0)),
               "current": balance.get("leaveBalance", data.get("leaveBalance", 0)),
               "year_end": balance.get("leaveYearEnd", data.get("leaveYearEnd", 0)),
               "accrued_since_join": balance.get("leaveTotalSinceStart", 0), "used_since_join": balance.get("leaveUsedSinceStart", 0),
               "remaining_since_join": balance.get("leaveAvailableSinceStart", 0), "eos": balance.get("leaveEosExcess", data.get("leaveEosExcess", 0)),
               "annual": annual, "override_used": data.get("leaveHistoryByYear", {})}
    years = []
    for year in sorted(overrides, key=lambda value: int(value)):
        value = overrides[year] or {}
        years.append({"year": int(year), "opening": value.get("carry", 0), "entitlement": value.get("entitlement", 0),
                      "used": value.get("used", 0), "adjustment": value.get("adjustment", 0),
                      "close": value.get("yearEnd", 0), "carry": value.get("carryNext", 0),
                      "eos": value.get("excess", value.get("eos", 0)), "current": value.get("current")})
    return {"summary": summary, "accumulated_eos": summary["eos"], "years": years}


@router.get("/leave/employees/{employee_id}")
def leave_balance_detail(employee_id: str, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_READ_ROLES)
    row = _row(db, "SELECT employee_id,data FROM public.employee_directory WHERE employee_id=:id", id=employee_id)
    if not row:
        raise ApiError(404, "not_found", "Employee not found")
    balance = db.execute(text("SELECT public.ariba_leave_calc(:eid,:day)"), {"eid": employee_id, "day": today_riyadh()}).scalar_one()
    return _leave_detail(row, balance)


@router.put("/leave/employees/{employee_id}")
def update_leave_balance(employee_id: str, body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    row = _row(db, "SELECT employee_id,data FROM public.employee_directory WHERE employee_id=:id", id=employee_id)
    if not row:
        raise ApiError(404, "not_found", "Employee not found")
    data = dict(row.get("data") or {})
    overrides = dict(data.get("leaveYearOverrides") or {})
    for entry in body.get("years", []):
        year = str(entry.get("year"))
        overrides[year] = {"carry": entry.get("opening"), "entitlement": entry.get("entitlement"),
                           "used": entry.get("used"), "adjustment": entry.get("adjustment"),
                           "yearEnd": entry.get("close"), "carryNext": entry.get("carry"),
                           "excess": entry.get("eos"), "current": entry.get("current"),
                           "asOf": body.get("date"), "note": body.get("note")}
    data["leaveYearOverrides"] = overrides
    db.execute(text("UPDATE public.employee_directory SET data=CAST(:data AS jsonb),updated_at=now() WHERE employee_id=:id"),
               {"data": json.dumps(data, ensure_ascii=False), "id": employee_id})
    _write_audit(db, actor, request, "leave", "balance_override", "employee", employee_id,
                 details={"years": sorted(overrides.keys())})
    db.commit()
    updated = _row(db, "SELECT employee_id,data FROM public.employee_directory WHERE employee_id=:id", id=employee_id)
    balance = db.execute(text("SELECT public.ariba_leave_calc(:eid,:day)"), {"eid": employee_id, "day": today_riyadh()}).scalar_one()
    return _leave_detail(updated, balance)


@router.get("/leave/holidays")
def holidays(actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    return _rows(db, "SELECT id,name AS name_ar,name_en,holiday_date AS start_date,days,recurring AS is_recurring,updated_at FROM public.public_holidays ORDER BY holiday_date")


@router.get("/letters")
def letter_status(actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_READ_ROLES)
    return _rows(db, "SELECT r.id,r.employee_id,r.request_type AS type,r.payload->>'title' AS title,r.status,r.rejection_reason,r.created_at,r.completed_at AS responded_at,d.name_ar AS employee_name FROM public.workflow_requests r LEFT JOIN public.employee_directory d ON d.employee_id=r.employee_id WHERE r.request_type LIKE 'template:%' ORDER BY r.created_at DESC")


@router.post("/letters")
def send_letter(body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    employee_id = str(body.get("employee_id") or "")
    _employee_scope(db, actor, employee_id)
    title = str(body.get("title") or "").strip()
    content = str(body.get("html") or "")
    if not title or not content:
        raise ApiError(422, "invalid_request", "Letter title and HTML are required")
    rid = uuid.uuid4()
    req = _row(db, "INSERT INTO public.workflow_requests(employee_id,request_type,payload,current_stage,status) VALUES(:eid,:type,CAST(:payload AS jsonb),'employee','pending') RETURNING id,employee_id,request_type,status,created_at", eid=employee_id, type="template:"+str(body.get("type") or "custom"), payload=json.dumps({"title": title, "template_type": body.get("type"), "sent_by": actor.get("employee_id")}))
    raw = content.encode("utf-8")
    doc = _row(db, "INSERT INTO public.ariba_documents(employee_id,request_id,document_type,file_name,mime_type,file_size,file_data,uploaded_by) VALUES(:eid,:rid,:type,:name,'text/html',:size,:data,:uploader) RETURNING id", eid=employee_id, rid=req["id"], type="letter", name=title+".html", size=len(raw), data=raw, uploader=actor.get("employee_id"))
    _insert_notification(db, employee_id, req["id"], "A letter is waiting for your response", title, "employee", "template")
    _write_audit(db, actor, request, "letters", "send", "workflow_request", req["id"])
    db.commit()
    emp = _row(db, "SELECT name_ar FROM public.employee_directory WHERE employee_id=:eid", eid=employee_id)
    return {"id": req["id"], "employee_id": employee_id, "employee_name": (emp or {}).get("name_ar", ""), "type": body.get("type", "custom"), "title": title, "status": "pending", "rejection_reason": None, "created_at": req["created_at"], "responded_at": None, "document_id": doc["id"]}


@router.delete("/letters/{letter_id}", status_code=204)
def delete_letter(letter_id: uuid.UUID, request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    db.execute(text("DELETE FROM public.ariba_documents WHERE request_id=:id"), {"id": letter_id})
    result = db.execute(text("DELETE FROM public.workflow_requests WHERE id=:id AND request_type LIKE 'template:%'"), {"id": letter_id})
    if result.rowcount == 0:
        raise ApiError(404, "not_found", "Letter not found")
    _write_audit(db, actor, request, "letters", "delete", "workflow_request", letter_id)
    db.commit()


@router.post("/auth/change-password")
def change_password(body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(lambda authorization=Header(None), db=Depends(get_db): _authenticate(db, authorization, True)), db: Session = Depends(get_db)):
    valid, _ = _verify_password(db, actor["password_hash"], str(body.get("old_password") or ""))
    new = str(body.get("new_password") or "")
    if not valid or len(new) < 8 or not any(c.isalpha() for c in new) or not any(c.isdigit() for c in new):
        raise ApiError(422, "validation_error", "Current password or new password is invalid")
    db.execute(text("UPDATE public.ariba_auth_accounts SET password_hash=:hash,must_change=false,updated_at=now() WHERE id=:id"), {"hash": _hasher.hash(new), "id": actor["account_id"]})
    db.execute(text("DELETE FROM public.ariba_sessions WHERE account_id=:id"), {"id": actor["account_id"]})
    account = _row(db, "SELECT * FROM public.ariba_auth_accounts WHERE id=:id", id=actor["account_id"])
    result = _new_session(db, account)
    _write_audit(db, actor, request, "auth", "change_password", "account", actor["account_id"])
    db.commit()
    return result


@router.post("/auth/users")
def create_account(body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    employee_id = str(body.get("employee_id") or "")
    emp = _employee_scope(db, actor, employee_id)
    role = str(body.get("role") or "employee")
    if role == "admin" and actor["role"] != "admin":
        raise ApiError(403, "forbidden", "Only admin can create admin accounts")
    username = str(emp.get("username") or emp.get("data", {}).get("empNo") or employee_id).lower()
    password = "".join(secrets.choice("abcdefghjkmnpqrstuvwxyz23456789") for _ in range(8))
    password += secrets.choice("abcdefghjkmnpqrstuvwxyz") + secrets.choice("23456789")
    account = _row(db, "INSERT INTO public.ariba_auth_accounts(username,password_hash,role,employee_id,active,must_change) VALUES(:username,:hash,:role,:eid,true,true) RETURNING *", username=username, hash=_hasher.hash(password), role=role, eid=employee_id)
    _write_audit(db, actor, request, "accounts", "create", "account", account["id"], details={"role": role})
    db.commit()
    return {"user": _account_user(db, account), "temporary_password": password}


@router.patch("/auth/users/{user_id}")
def update_account(user_id: uuid.UUID, body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    target = _row(db, "SELECT * FROM public.ariba_auth_accounts WHERE id=:id", id=user_id)
    if not target:
        raise ApiError(404, "not_found", "Account not found")
    role = body.get("role", target["role"])
    active = body.get("is_active", target["active"])
    if role != target["role"] and actor["role"] != "admin":
        raise ApiError(403, "forbidden", "Only admin can change roles")
    db.execute(text("UPDATE public.ariba_auth_accounts SET role=:role,active=:active,updated_at=now() WHERE id=:id"), {"role": role, "active": active, "id": user_id})
    if not active:
        db.execute(text("DELETE FROM public.ariba_sessions WHERE account_id=:id"), {"id": user_id})
    _write_audit(db, actor, request, "accounts", "update", "account", user_id, details={"role": role, "active": active})
    db.commit()
    target.update({"role": role, "active": active})
    return _account_user(db, target)


@router.post("/auth/users/{user_id}/temporary-password")
def temporary_password(user_id: uuid.UUID, request: Request, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    account = _row(db, "SELECT * FROM public.ariba_auth_accounts WHERE id=:id", id=user_id)
    if not account:
        raise ApiError(404, "not_found", "Account not found")
    password = "".join(secrets.choice("abcdefghjkmnpqrstuvwxyz23456789") for _ in range(8)) + secrets.choice("abcdefghjkmnpqrstuvwxyz") + secrets.choice("23456789")
    db.execute(text("UPDATE public.ariba_auth_accounts SET password_hash=:hash,must_change=true,updated_at=now() WHERE id=:id"), {"hash": _hasher.hash(password), "id": user_id})
    db.execute(text("DELETE FROM public.ariba_sessions WHERE account_id=:id"), {"id": user_id})
    account["password_hash"], account["must_change"] = _hasher.hash(password), True
    _write_audit(db, actor, request, "accounts", "reset_password", "account", user_id)
    db.commit()
    return {"user": _account_user(db, account), "temporary_password": password}


@router.get("/auth/users/by-employee/{employee_id}")
def account_by_employee(employee_id: str, actor: dict[str, Any] = Depends(current_actor), db: Session = Depends(get_db)):
    _require(actor, *HR_ROLES)
    account = _row(db, "SELECT * FROM public.ariba_auth_accounts WHERE employee_id=:eid", eid=employee_id)
    if not account:
        raise ApiError(404, "not_found", "Account not found")
    return _account_user(db, account)


@router.post("/auth/password-reset")
def request_password_reset(body: dict[str, Any], db: Session = Depends(get_db)):
    username = str(body.get("username") or "").strip().lower()
    account = _row(db, "SELECT id FROM public.ariba_auth_accounts WHERE lower(username)=:username AND active", username=username)
    if account:
        raw = secrets.token_urlsafe(32)
        digest = __import__("hashlib").sha256(raw.encode()).hexdigest()
        db.execute(text("UPDATE public.ariba_password_resets SET used_at=coalesce(used_at,now()) WHERE account_id=:id AND used_at IS NULL"), {"id": account["id"]})
        db.execute(text("INSERT INTO public.ariba_password_resets(account_id,token_hash,expires_at) VALUES(:id,:hash,now()+interval '15 minutes')"),
                   {"id": account["id"], "hash": digest})
        db.commit()
        # This API has no delivery provider configured; return only the generic response.
    return {"ok": True}


@router.post("/auth/password-reset/complete")
def complete_password_reset(body: dict[str, Any], db: Session = Depends(get_db)):
    username = str(body.get("username") or "").strip().lower()
    token = str(body.get("reset_token") or "")
    password = str(body.get("new_password") or "")
    if len(password) < 10 or not any(char.isalpha() for char in password) or not any(char.isdigit() for char in password):
        raise ApiError(422, "weak_password", "Password must have at least 10 characters, letters, and digits")
    digest = __import__("hashlib").sha256(token.encode()).hexdigest()
    account = _row(db, """SELECT a.* FROM public.ariba_auth_accounts a JOIN public.ariba_password_resets r ON r.account_id=a.id
        WHERE lower(a.username)=:username AND a.active AND r.token_hash=:hash AND r.used_at IS NULL AND r.expires_at>now()
        ORDER BY r.created_at DESC LIMIT 1 FOR UPDATE""", username=username, hash=digest)
    if not account:
        raise ApiError(400, "invalid_reset", "Invalid or expired password reset")
    db.execute(text("UPDATE public.ariba_auth_accounts SET password_hash=:hash,must_change=false,updated_at=now() WHERE id=:id"),
               {"hash": _hasher.hash(password), "id": account["id"]})
    db.execute(text("UPDATE public.ariba_password_resets SET used_at=now() WHERE account_id=:id AND token_hash=:hash"),
               {"id": account["id"], "hash": digest})
    db.execute(text("DELETE FROM public.ariba_sessions WHERE account_id=:id"), {"id": account["id"]})
    db.commit()
    return {"ok": True}


