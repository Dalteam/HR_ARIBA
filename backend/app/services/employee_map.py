"""Two-way mapping between a canonical `employee_directory` row (+ its legacy `data` JSONB) and the HR site's
employee contract (EmployeeOut / EmployeeInput in frontend/hr-web/src/lib/api.ts).

The canonical data keeps the legacy vocabulary (gender «ذكر», currency «ريال سعودي», insSystem «old» …). Reading
translates it to the site's codes; writing translates back and only touches the keys the site sent, so every other
legacy key in `data` is preserved untouched.
"""

from __future__ import annotations

from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from app.enums import EmployeeCategory, GosiSystem, WpsType
from app.services import gosi
from app.services.end_of_service import service_years

CENT = Decimal("0.01")

GENDER = {"ذكر": "male", "أنثى": "female", "male": "male", "female": "female"}
RELIGION = {"مسلم": "muslim", "مسلمة": "muslim", "غير مسلم": "other", "غير مسلمة": "other", "muslim": "muslim", "other": "other"}
MARITAL = {"متزوج": "married", "متزوجة": "married", "أعزب": "single", "عازباء": "single", "عزباء": "single",
           "مطلق": "divorced", "مطلقة": "divorced", "أرمل": "widowed", "أرملة": "widowed",
           "married": "married", "single": "single", "divorced": "divorced", "widowed": "widowed"}
CURRENCY = {"ريال سعودي": "SAR", "دولار": "USD", "يورو": "EUR", "جنيه مصري": "EGP", "SAR": "SAR", "USD": "USD", "EUR": "EUR", "EGP": "EGP"}
PAY = {"مدد": "mudad", "تحويل بنكي": "bank_transfer", "تحويل دولي": "international_transfer", "نقدي": "cash", "كاش": "cash",
       "mudad": "mudad", "bank_transfer": "bank_transfer", "international_transfer": "international_transfer", "cash": "cash"}
INS = {"new": "matching", "old": "non_matching", "expat": "non_saudi", "matching": "matching", "non_matching": "non_matching", "non_saudi": "non_saudi"}
CATEGORIES = {c.value for c in EmployeeCategory}
WPS = {w.value for w in WpsType}

# Reverse (site code -> legacy word); feminine forms follow the employee's gender like the legacy forms.
_GENDER_AR = {"male": "ذكر", "female": "أنثى"}
_RELIGION_AR = {("muslim", False): "مسلم", ("muslim", True): "مسلمة", ("other", False): "غير مسلم", ("other", True): "غير مسلمة"}
_MARITAL_AR = {("married", False): "متزوج", ("married", True): "متزوجة", ("single", False): "أعزب", ("single", True): "عازباء",
               ("divorced", False): "مطلق", ("divorced", True): "مطلقة", ("widowed", False): "أرمل", ("widowed", True): "أرملة"}
_CURRENCY_AR = {"SAR": "ريال سعودي", "USD": "دولار", "EUR": "يورو", "EGP": "جنيه مصري"}
_PAY_AR = {"mudad": "مدد", "bank_transfer": "تحويل بنكي", "international_transfer": "تحويل دولي", "cash": "نقدي"}
_INS_LEGACY = {"matching": "new", "non_matching": "old", "non_saudi": "expat"}


def d(v: Any) -> date | None:
    if not v:
        return None
    if isinstance(v, date):
        return v
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        return None


def num(v: Any) -> Decimal:
    try:
        return Decimal(str(v if v not in (None, "") else 0))
    except Exception:  # noqa: BLE001 - legacy free text
        return Decimal(0)


def money(v: Any) -> str:
    return str(num(v).quantize(CENT, ROUND_HALF_UP))


def lookup(name: str | None, is_saudi: bool | None = None) -> dict[str, Any] | None:
    if not name:
        return None
    out = {"id": name, "code": name, "name_ar": name, "name_en": name}
    if is_saudi is not None:
        out["is_saudi"] = is_saudi
    return out


def is_saudi(data: dict, nationality: str | None) -> bool:
    if data.get("isSaudi") is not None:
        return bool(data["isSaudi"])
    return str(nationality or "").strip().lower() in {"سعودي", "سعودية", "saudi"}


def gosi_system(data: dict, saudi: bool) -> str:
    sysv = INS.get(str(data.get("insSystem") or ""))
    if sysv:
        return sysv
    return "non_matching" if saudi else "non_saudi"


def category(data: dict) -> str:
    c = str(data.get("empType") or "active")
    return c if c in CATEGORIES else "active"


def wps(data: dict) -> str:
    w = str(data.get("wpsType") or "wps")
    return w if w in WPS else "wps"


def termination_date(row: dict, data: dict) -> date | None:
    terminated = not row.get("active", True) or data.get("isTerminated") or data.get("term")
    return (d(data.get("terminationDate")) or d(data.get("lastDay"))) if terminated else None


def figures(data: dict, *, saudi: bool, rules: list, birth: date | None, on: date, job: str | None, dept: str | None, employer: str | None,
            override: dict | None = None) -> dict[str, Any]:
    """Monthly salary figures (prototype cSP/sEmp): total = basic+housing+transport+project+other+extra,
    net = total - GOSI(employee) - other deductions; `exempt` (V130) pays no GOSI."""
    v = {**data, **(override or {})}
    basic, housing = num(v.get("salary")), num(v.get("housingAllowance"))
    total = (basic + housing + num(v.get("transportAllowance")) + num(v.get("projectAllowance"))
             + num(v.get("otherAllowance")) + num(v.get("extraAllowance"))).quantize(CENT, ROUND_HALF_UP)
    system = GosiSystem(gosi_system(v, saudi))
    if str(v.get("insSystem")) == "exempt":
        g = gosi.GosiResult.zero()
    else:
        g = gosi.calculate(rules=rules, system=system, wps_type=WpsType(wps(v)), category=EmployeeCategory(category(v)),
                           basic=basic, housing=housing, birth_date=birth, on=on, job_title=job, department=dept, workplace=employer,
                           emp_type=str(v.get("empType") or ""), excel_category=str(v.get("excelCategory") or ""))
    net = (total - g.employee - num(v.get("otherDeductions"))).quantize(CENT, ROUND_HALF_UP)
    rate = Decimal(1) if CURRENCY.get(str(v.get("currency") or "ريال سعودي"), "SAR") == "SAR" else num(v.get("exchRate") or 1)
    return {"total": total, "gosi_employee": g.employee, "gosi_employer": g.employer, "net": net,
            "net_sar": (net * rate).quantize(CENT, ROUND_HALF_UP), "gosi_system": system.value}


def employee_out(row: dict, *, may_salary: bool, may_ids: bool, manager: dict | None, has_account: bool, rules: list, today: date) -> dict[str, Any]:
    data = dict(row.get("data") or {})
    nat = row.get("nationality") or data.get("nationality")
    saudi = is_saudi(data, nat)
    birth = d(row.get("dob")) or d(data.get("dob"))
    join = d(row.get("join_date")) or d(data.get("contractJoin")) or d(data.get("join_date"))
    end_date = termination_date(row, data)
    nid = row.get("iqama_no") or data.get("iqamaNo") or data.get("iqama_no")
    mask = lambda v: None if not v else (str(v) if may_ids else "******" + str(v)[-4:])  # noqa: E731
    left = lambda x: (x - today).days if x else None  # noqa: E731
    job, dept, employer = row.get("job_title") or data.get("jobTitle"), row.get("department") or data.get("dept"), row.get("employer") or data.get("employer")
    salary = None
    if may_salary:
        f = figures(data, saudi=saudi, rules=rules, birth=birth, on=today, job=job, dept=dept, employer=employer)
        salary = {
            "basic_salary": money(data.get("salary")), "housing_allowance": money(data.get("housingAllowance")),
            "transport_allowance": money(data.get("transportAllowance")), "project_allowance": money(data.get("projectAllowance")),
            "other_allowances": money(data.get("otherAllowance")), "extra_allowance": money(data.get("extraAllowance")),
            "other_deductions": money(data.get("otherDeductions")), "total_salary": str(f["total"]),
            "gosi_employee": str(f["gosi_employee"]), "gosi_employer": str(f["gosi_employer"]), "net_salary": str(f["net"]),
            "net_salary_sar": str(f["net_sar"]), "eos_award": money(data["eosLaborLaw"]) if data.get("eosLaborLaw") not in (None, "") else None,
            "currency": CURRENCY.get(str(data.get("currency") or "ريال سعودي"), "SAR"),
            "exchange_rate": str(num(data.get("exchRate") or 1).quantize(Decimal("0.0001"))),
            "gosi_system": f["gosi_system"], "payment_method": PAY.get(str(data.get("payMethod") or "مدد"), "mudad"),
            "bank_name": data.get("bank") if may_ids else None, "iban": data.get("iban") if may_ids else None,
        }
    return {
        "id": row["employee_id"], "emp_no": str(data.get("empNo") or row.get("username") or row["employee_id"]),
        "name_ar": row.get("name_ar") or data.get("nameAr") or "", "name_en": row.get("name_en") or data.get("nameEn"),
        "birth_date": birth, "gender": GENDER.get(str(data.get("gender") or data.get("gen") or "")),
        "religion": RELIGION.get(str(data.get("religion") or "")), "marital_status": MARITAL.get(str(data.get("maritalStatus") or "")),
        "mobile": data.get("mobile"), "email": data.get("email"), "national_address": data.get("nationalAddress") or data.get("address"),
        "nationality": lookup(nat, saudi), "is_saudi": saudi,
        "workplace": lookup(employer), "department": lookup(dept), "job_title": job, "manager": manager,
        "sponsor": data.get("sponsor"), "category": category(data), "wps_type": wps(data),
        "national_id": mask(nid), "national_id_expiry": d(data.get("iqamaExpiry")),
        "passport_no": mask(data.get("passportNo")), "passport_expiry": d(data.get("passportExpiry")),
        "insurance_company": data.get("insuranceCo"), "insurance_class": data.get("insuranceClass"),
        "insurance_card_no": mask(data.get("insuranceCard")), "insurance_expiry": d(data.get("insuranceExpiry")),
        "contract_nature": "fixed" if data.get("contractNature") == "fixed" else "indefinite",
        "contract_duration_months": int(data["contractDuration"]) if str(data.get("contractDuration") or "").isdigit() else None,
        "join_date": join, "contract_end_date": d(data.get("contractEnd")),
        "annual_leave_days": int(num(data.get("leaveDaysContract") or 21)),
        "exclude_from_payroll": bool(data.get("excludeFromPayroll") or data.get("notEmployed")),
        "exclude_from_eos": bool(data.get("excludeFromEos")),
        "termination_date": end_date, "termination_article": data.get("terminationArticle"),
        "termination_reason": data.get("terminationReason"), "is_terminated": end_date is not None, "notes": data.get("notes"),
        "salary": salary, "years_of_service": str(service_years(join, end_date or today)),
        "has_photo": bool(data.get("photoUrl")), "ids_masked": not may_ids,
        "expiry_days": {"national_id": left(d(data.get("iqamaExpiry"))), "passport": left(d(data.get("passportExpiry"))),
                        "insurance": left(d(data.get("insuranceExpiry"))), "contract": left(d(data.get("contractEnd")))},
        "has_account": has_account, "created_at": row.get("created_at"), "updated_at": row.get("updated_at"),
    }


# site field -> (legacy data key, converter). Converters get (value, female) and return the legacy value.
_IN: dict[str, tuple[str, Any]] = {
    "name_ar": ("nameAr", None), "name_en": ("nameEn", None), "birth_date": ("dob", None),
    "gender": ("gender", lambda v, f: _GENDER_AR.get(v, v)),
    "religion": ("religion", lambda v, f: _RELIGION_AR.get((v, f), v)),
    "marital_status": ("maritalStatus", lambda v, f: _MARITAL_AR.get((v, f), v)),
    "mobile": ("mobile", None), "email": ("email", None), "national_address": ("nationalAddress", None),
    "nationality_id": ("nationality", None), "workplace_id": ("employer", None), "department_id": ("dept", None),
    "job_title": ("jobTitle", None), "manager_id": ("managerId", None), "sponsor": ("sponsor", None),
    "category": ("empType", None), "wps_type": ("wpsType", None), "bank_name": ("bank", None), "iban": ("iban", None),
    "national_id": ("iqamaNo", None), "national_id_expiry": ("iqamaExpiry", None), "passport_no": ("passportNo", None),
    "passport_expiry": ("passportExpiry", None), "insurance_company": ("insuranceCo", None), "insurance_class": ("insuranceClass", None),
    "insurance_card_no": ("insuranceCard", None), "insurance_expiry": ("insuranceExpiry", None),
    "contract_nature": ("contractNature", None), "contract_duration_months": ("contractDuration", None),
    "join_date": ("contractJoin", None), "contract_end_date": ("contractEnd", None), "annual_leave_days": ("leaveDaysContract", None),
    "basic_salary": ("salary", lambda v, f: float(num(v))), "housing_allowance": ("housingAllowance", lambda v, f: float(num(v))),
    "transport_allowance": ("transportAllowance", lambda v, f: float(num(v))), "project_allowance": ("projectAllowance", lambda v, f: float(num(v))),
    "other_allowances": ("otherAllowance", lambda v, f: float(num(v))), "extra_allowance": ("extraAllowance", lambda v, f: float(num(v))),
    "other_deductions": ("otherDeductions", lambda v, f: float(num(v))),
    "currency": ("currency", lambda v, f: _CURRENCY_AR.get(v, v)), "exchange_rate": ("exchRate", lambda v, f: float(num(v))),
    "gosi_system": ("insSystem", lambda v, f: _INS_LEGACY.get(v, v)), "payment_method": ("payMethod", lambda v, f: _PAY_AR.get(v, v)),
    "exclude_from_payroll": ("excludeFromPayroll", None), "exclude_from_eos": ("excludeFromEos", None), "notes": ("notes", None),
}

# Top-level employee_directory columns kept in step with data.
TOP = {"name_ar": "name_ar", "name_en": "name_en", "workplace_id": "employer", "department_id": "department",
       "job_title": "job_title", "nationality_id": "nationality", "national_id": "iqama_no", "birth_date": "dob",
       "join_date": "join_date", "manager_id": "manager_id"}


def apply_input(data: dict, body: dict) -> tuple[dict, dict]:
    """Merge the site's fields into legacy `data`; returns (data, top-level column values)."""
    data = dict(data)
    gender = body.get("gender") or GENDER.get(str(data.get("gender") or ""))
    female = gender == "female"
    top: dict[str, Any] = {}
    for key, value in body.items():
        if key not in _IN:
            continue
        legacy, conv = _IN[key]
        if hasattr(value, "isoformat"):
            value = value.isoformat()
        stored = conv(value, female) if conv and value is not None else value
        data[legacy] = stored
        if key in ("name_ar", "name_en", "job_title"):
            data[{"name_ar": "name_ar", "name_en": "name_en", "job_title": "job_title"}[key]] = stored
        if key == "department_id":
            data["department"] = stored
        if key == "join_date":
            data["join_date"] = stored
        if key == "nationality_id" and value:
            data["isSaudi"] = str(value).strip() in {"سعودي", "سعودية", "Saudi", "saudi"}
        if key in TOP:
            top[TOP[key]] = value
    if "gender" in body:
        data["gen"] = data.get("gender")
    for k in ("salary", "housingAllowance", "transportAllowance", "projectAllowance", "otherAllowance", "extraAllowance"):
        data.setdefault(k, 0)
    data["salaryTotal"] = float(sum(num(data.get(k)) for k in ("salary", "housingAllowance", "transportAllowance",
                                                              "projectAllowance", "otherAllowance", "extraAllowance")))
    return data, top
