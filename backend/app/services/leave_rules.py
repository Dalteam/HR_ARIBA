"""Leave rules: the carry cap, the accrual method and the special-type entitlements.

Three `ariba_app_settings` rows hold the design's three cards (reference/hr-v1 `settings/CarryCard.jsx`,
`lib/leave.js` `accrualMethod`, `settings/RightsCard.jsx`):

    leave_carry           {enabled, days}                        ترحيل أرصدة الإجازات إلى السنة التالية
    leave_accrual_method  {method: calendar|workdays|monthly}     طريقة احتساب الاستحقاق السنوي
    special_rights        {tamheer|trainee|consultant: {leave, eos}}   استحقاقات التمهير والمتدرب والمستشار

Defaults, and why they are what they are:

- **carry** `{enabled: true, days: 10}` - the ledger's rule since the first port (`leave.CARRY_CAP`) and the row
  `ariba_src` already holds. `enabled: false` carries the whole balance: no cap and no end-of-service excess.
- **accrual** `workdays` - every balance in the file has been accrued on working days (`services/leave.py` and the
  legacy `ariba_leave_calc`, which the parity test pins). The design's own code defaults to `calendar`, which would
  move every figure the day it shipped, so a method is only used once HR chooses one in the card.
- **rights** nothing ticked - the design's own default. An employee of a type with `leave` unticked keeps no leave
  ledger at all (accrual 0, carry 0, balance 0, no end-of-service leave excess), and `eos` unticked zeroes the
  end-of-service figure the leave side computes.

The type is the legacy `kindOf`, already in the codebase as `services/gosi.py` `exempt_kind` (the WPS type, then words
in the job title / department / employer, the Excel category and the Arabic employment type) and already in the
database as `public.ariba_emp_kind` - `emp_kind` here is the same rule over `employee_directory`'s own columns, and
`exemptions` turns the three switches into the two sets the leave ledger takes.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text

from app.core.errors import ApiError
from app.enums import WpsType
from app.services import gosi

CARRY_KEY = "leave_carry"
ACCRUAL_KEY = "leave_accrual_method"
RIGHTS_KEY = "special_rights"

METHODS = ("calendar", "workdays", "monthly")
KINDS = ("tamheer", "trainee", "consultant")
MAX_CARRY_DAYS = 365
DEFAULT_CARRY: dict[str, Any] = {"enabled": True, "days": 10}
DEFAULT_ACCRUAL: dict[str, Any] = {"method": "workdays"}
DEFAULT_RIGHTS: dict[str, dict[str, bool]] = {k: {"leave": False, "eos": False} for k in KINDS}


def _invalid(message: str) -> ApiError:
    return ApiError(422, "validation_error", message)


def _obj(body: Any) -> dict[str, Any]:
    if not isinstance(body, dict):
        raise _invalid("The body must be an object")
    return body


def _flag(value: Any, field: str) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and value in (0, 1):
        return bool(value)
    if isinstance(value, str) and value.strip().lower() in ("true", "false"):
        return value.strip().lower() == "true"
    raise _invalid(f"{field}: يجب أن يكون صحيح/خطأ")


# ------------------------------------------------------------------------------------------------ the three rows

def carry_in(raw: Any) -> dict[str, Any]:
    """{enabled, days} from a saved row or a PUT body. `days` is 0..365 and is kept while `enabled` is off.

    An absent row (or an absent field) is the design's default - the cap is on at 10 days, exactly the engine's
    `CARRY_CAP` - so a database without the row keeps the figures it has today.
    """
    body = {} if raw is None else _obj(raw)
    try:
        days = float(body.get("days", DEFAULT_CARRY["days"]))
    except (TypeError, ValueError):
        raise _invalid("leave_carry.days: رقم غير صالح") from None
    if not 0 <= days <= MAX_CARRY_DAYS:
        raise _invalid(f"leave_carry.days: بين 0 و {MAX_CARRY_DAYS}")
    return {"enabled": _flag(body.get("enabled", DEFAULT_CARRY["enabled"]), "leave_carry.enabled"), "days": round(days, 2)}


def accrual_in(raw: Any) -> dict[str, Any]:
    body = {} if raw is None else _obj(raw)
    method = str(body.get("method") or DEFAULT_ACCRUAL["method"]).strip().lower()
    if method not in METHODS:
        raise _invalid("leave_accrual_method.method: calendar أو workdays أو monthly")
    return {"method": method}


def rights_in(raw: Any) -> dict[str, dict[str, bool]]:
    """All three types, so the stored row is always complete; a missing type keeps the design's default (off)."""
    body = {} if raw is None else _obj(raw)
    out: dict[str, dict[str, bool]] = {}
    for kind in KINDS:
        row = body.get(kind)
        row = {} if row is None else _obj(row)
        out[kind] = {"leave": _flag(row.get("leave"), f"special_rights.{kind}.leave"),
                     "eos": _flag(row.get("eos"), f"special_rights.{kind}.eos")}
    return out


def _safe(fn: Any, raw: Any, fallback: Any) -> Any:
    """A saved row that never raises: the ledger must not break on a hand-edited value."""
    try:
        return fn(raw)
    except ApiError:
        return fallback


def from_rows(rows: dict[str, Any]) -> dict[str, Any]:
    """The three rows, complete, from {key: saved jsonb value} — a saved row that cannot be read keeps the default."""
    return {
        "carry": _safe(carry_in, rows.get(CARRY_KEY), dict(DEFAULT_CARRY)),
        "accrual": _safe(accrual_in, rows.get(ACCRUAL_KEY), dict(DEFAULT_ACCRUAL)),
        "rights": _safe(rights_in, rows.get(RIGHTS_KEY), {k: dict(v) for k, v in DEFAULT_RIGHTS.items()}),
    }


def read(db: Any) -> dict[str, Any]:
    """The three saved rows, complete. Which employees they exempt is the caller's business (see emp_kind)."""
    rows = {k: v for k, v in db.execute(
        text("SELECT key,value FROM public.ariba_app_settings WHERE key IN (:a,:b,:c)"),
        {"a": CARRY_KEY, "b": ACCRUAL_KEY, "c": RIGHTS_KEY}).all()}
    return from_rows(rows)


def rules_in(body: Any) -> dict[str, Any]:
    """A PUT body: any of carry / accrual / rights; what is missing keeps its saved value."""
    body = _obj(body)
    out: dict[str, Any] = {}
    if "carry" in body:
        out["carry"] = carry_in(body["carry"])
    if "accrual" in body:
        out["accrual"] = accrual_in(body["accrual"])
    if "rights" in body:
        out["rights"] = rights_in(body["rights"])
    if not out:
        raise _invalid("لا يوجد ما يُحفظ: carry أو accrual أو rights")
    return out


# ---------------------------------------------------------------------------------------- the employee's type

def _wps(value: Any) -> WpsType:
    try:
        return WpsType(str(value or "wps").strip().lower())
    except ValueError:
        return WpsType.wps


def emp_kind(data: dict[str, Any] | None, job: str = "", department: str = "", employer: str = "") -> str:
    """'' for an ordinary employee, else the special type - the legacy `kindOf`.

    Not a rewrite: the backend already carries that rule for GOSI (`services/gosi.py` `exempt_kind`, pinned by
    tests_canonical/test_legacy_parity.py against the legacy fixtures) and so does the deployed database
    (`public.ariba_emp_kind`, used by `ariba_noleave` and the snapshot guard). This is the same rule, read from
    `employee_directory`'s own columns: the WPS type first, then words in the job title / department / employer, the
    Excel category «consultant» and the Arabic employment type («مهمة محددة» / «متدرب»).

    A WPS type other than `wps` (external, no_wps, remote) is a kind of its own; the three cards cannot grant it
    anything, which is the design's rule (`engines/empkind.js`: a kind outside KINDS has no rights).
    """
    data = data or {}
    return gosi.exempt_kind(
        wps_type=_wps(data.get("wpsType") or data.get("wps")),
        job_title=job,
        department=department,
        workplace=employer,
        emp_type=data.get("empType"),
        excel_category=data.get("excelCategory"),
    )


def has_leave(kind: str, rights: dict[str, dict[str, bool]]) -> bool:
    """An ordinary employee always has one; a special type only when its `leave` is ticked."""
    return not kind or kind in rights and bool(rights[kind].get("leave"))


def has_eos(kind: str, rights: dict[str, dict[str, bool]]) -> bool:
    return not kind or kind in rights and bool(rights[kind].get("eos"))


def no_leave(kind: str, rights: dict[str, dict[str, bool]]) -> bool:
    return not has_leave(kind, rights)


def no_eos(kind: str, rights: dict[str, dict[str, bool]]) -> bool:
    return not has_eos(kind, rights)


def exemptions(emps: Any, rules: dict[str, Any]) -> tuple[set[str], set[str]]:
    """(employees with no leave ledger, employees with no end-of-service leave excess) from their type.

    `emps` are the employee rows the ledger is about (`canonical_data.EmpView`: id, data, job_title, department,
    employer). An ordinary employee is never in either set.
    """
    rights = rules["rights"]
    no_lv: set[str] = set()
    no_eo: set[str] = set()
    for e in emps:
        kind = emp_kind(getattr(e, "data", None), getattr(e, "job_title", "") or "",
                        getattr(e, "department", "") or "", getattr(e, "employer", "") or "")
        if not kind:
            continue
        if no_leave(kind, rights):
            no_lv.add(str(e.id))
        if no_eos(kind, rights):
            no_eo.add(str(e.id))
    return no_lv, no_eo


def kind_counts(emps: Any) -> dict[str, int]:
    """How many employees each kind holds - what the rights card shows beside its three switches."""
    out: dict[str, int] = {k: 0 for k in KINDS}
    out["other"] = 0
    for e in emps:
        kind = emp_kind(getattr(e, "data", None), getattr(e, "job_title", "") or "",
                        getattr(e, "department", "") or "", getattr(e, "employer", "") or "")
        if kind in out:
            out[kind] += 1
        elif kind:
            out["other"] += 1
    return out


def counts(db: Any) -> dict[str, int]:
    """kind_counts over the active employees, with only the four columns the rule reads."""
    rows = db.execute(text("""SELECT d.data, er.name AS employer, dp.name AS department, jt.name AS job_title
        FROM public.employee_directory d
        LEFT JOIN public.employers er ON er.id=d.employer_id
        LEFT JOIN public.departments dp ON dp.id=d.department_id
        LEFT JOIN public.job_titles jt ON jt.id=d.job_title_id
        WHERE d.active""")).mappings()
    return kind_counts(rows)


