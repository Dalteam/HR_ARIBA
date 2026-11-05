"""Working-hours schedule: the official shift, the Ramadan shift and the flexible window, applied per day.

The design keeps one `ariba_app_settings` row (reference/hr-v1 `settings/ScheduleCard.jsx` + `lib/schedule.js`):

    {enabled, official: {start, end, hours, grace}, ramadan: {start, end, hours, grace},
     ramadan_auto, ramadan_from, ramadan_to}

`enabled` is the design's «تفعيل حساب الحضور على الجدول». While it is off - and in `ariba_src` no such row exists -
attendance keeps today's rule (company_settings `work_start` + `tolerance_minutes` + shift hours), so every stored
number stays exactly as it was. With it on, the day's row decides the start, the end, the shift length and the
grace (late tolerance) of the punches taken from then on; stored punches keep the values they were given (the
design keeps the same snapshots).

Ramadan is found by the Hijri month. Umm al-Qura is not in the standard library, so the arithmetic Islamic
calendar is used (`hijri_month`); it can be a day off, which is what the card's manual dates are for - when both
`ramadan_from` and `ramadan_to` are set they win over the calculation.
"""

from __future__ import annotations

import re
from datetime import date
from typing import Any

from app.core.errors import ApiError

SETTING_KEY = "attendance_schedule"

DEFAULT_SCHEDULE: dict[str, Any] = {
    "enabled": False,
    "official": {"start": "08:00", "end": "17:00", "hours": 8.0, "grace": 15},
    "ramadan": {"start": "09:00", "end": "15:00", "hours": 6.0, "grace": 15},
    "ramadan_auto": True,
    "ramadan_from": "",
    "ramadan_to": "",
}

ROWS = ("official", "ramadan")
_HHMM = re.compile(r"^([01]?[0-9]|2[0-3]):([0-5][0-9])(?::[0-5][0-9])?$")
_ISO = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
MAX_HOURS, MAX_GRACE = 16.0, 120


def _invalid(message: str) -> ApiError:
    return ApiError(422, "validation_error", message)


def _obj(body: Any) -> dict[str, Any]:
    if not isinstance(body, dict):
        raise _invalid("The body must be an object")
    return body


def hhmm(value: Any, field: str) -> str:
    """'HH:MM' from 'H:MM', 'HH:MM:SS', a `time` or `None` ('')."""
    if value in (None, ""):
        return ""
    text = value.strftime("%H:%M") if hasattr(value, "strftime") else str(value).strip()
    match = _HHMM.match(text)
    if not match:
        raise _invalid(f"{field}: الوقت يجب أن يكون بصيغة HH:MM")
    return f"{int(match.group(1)):02d}:{match.group(2)}"


def minutes(value: Any, field: str = "time") -> int:
    """Minutes after midnight of a saved 'HH:MM' (a missing time raises, callers check it first)."""
    text = hhmm(value, field)
    if not text:
        raise _invalid(f"{field}: الوقت مطلوب")
    return int(text[:2]) * 60 + int(text[3:])


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


def _num(value: Any, field: str, low: float, high: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise _invalid(f"{field}: رقم غير صالح") from None
    if not low <= number <= high:
        raise _invalid(f"{field}: يجب أن يكون بين {low:g} و {high:g}")
    return number


def _day(value: Any, field: str) -> str:
    if value in (None, ""):
        return ""
    text = value.isoformat()[:10] if hasattr(value, "isoformat") else str(value).strip()[:10]
    if not _ISO.match(text):
        raise _invalid(f"{field}: التاريخ يجب أن يكون بصيغة YYYY-MM-DD")
    try:
        date.fromisoformat(text)
    except ValueError:
        raise _invalid(f"{field}: تاريخ غير صالح") from None
    return text


def _row(value: Any, name: str, fallback: dict[str, Any]) -> dict[str, Any]:
    row = {} if value is None else _obj(value)
    start = hhmm(row.get("start", fallback["start"]), f"{name}.start")
    end = hhmm(row.get("end", fallback["end"]), f"{name}.end")
    if not start or not end:
        raise _invalid(f"{name}: وقت البداية والنهاية مطلوبان")
    if minutes(end) <= minutes(start):
        raise _invalid(f"{name}: وقت النهاية يجب أن يكون بعد البداية")
    hours = _num(row.get("hours", fallback["hours"]), f"{name}.hours", 1, MAX_HOURS)
    grace = _num(row.get("grace", fallback["grace"]), f"{name}.grace", 0, MAX_GRACE)
    return {"start": start, "end": end, "hours": hours, "grace": int(grace)}


def _safe_row(value: Any, fallback: dict[str, Any]) -> dict[str, Any]:
    """A saved row that never raises: a hand-edited row keeps its good fields and defaults the rest."""
    row = value if isinstance(value, dict) else {}
    out = dict(fallback)
    for key in ("start", "end"):
        try:
            out[key] = hhmm(row.get(key, fallback[key]), key) or fallback[key]
        except ApiError:
            out[key] = fallback[key]
    for key, low, high in (("hours", 1.0, MAX_HOURS), ("grace", 0.0, MAX_GRACE)):
        try:
            number = float(row.get(key, fallback[key]))
        except (TypeError, ValueError):
            continue
        if low <= number <= high:
            out[key] = float(number) if key == "hours" else int(number)
    if minutes(out["end"]) <= minutes(out["start"]):
        out["start"], out["end"] = fallback["start"], fallback["end"]
    return out


def norm(raw: Any) -> dict[str, Any]:
    """The saved setting (or nothing) as a complete one. Never raises: attendance must not break on a bad row."""
    body = raw if isinstance(raw, dict) else {}
    try:
        enabled = _flag(body.get("enabled"), "enabled")
    except ApiError:
        enabled = False
    try:
        start = _day(body.get("ramadan_from", body.get("ramadanFrom")), "ramadan_from")
        end = _day(body.get("ramadan_to", body.get("ramadanTo")), "ramadan_to")
    except ApiError:
        start = end = ""
    if bool(start) != bool(end) or (start and end < start):
        start = end = ""
    try:
        auto = _flag(body.get("ramadan_auto", body.get("ramadanAuto", True)), "ramadan_auto")
    except ApiError:
        auto = True
    return {
        "enabled": enabled,
        "official": _safe_row(body.get("official"), DEFAULT_SCHEDULE["official"]),
        "ramadan": _safe_row(body.get("ramadan"), DEFAULT_SCHEDULE["ramadan"]),
        "ramadan_auto": auto,
        "ramadan_from": start,
        "ramadan_to": end,
    }


def _julian(day: date) -> int:
    a = (14 - day.month) // 12
    year, month = day.year + 4800 - a, day.month + 12 * a - 3
    return day.day + (153 * month + 2) // 5 + 365 * year + year // 4 - year // 100 + year // 400 - 32045


def hijri_month(day: date) -> int:
    """The Islamic month 1..12 by the arithmetic calendar (9 = Ramadan)."""
    julian = _julian(day) - 1948440 + 10632
    cycles = (julian - 1) // 10631
    julian = julian - 10631 * cycles + 354
    j = ((10985 - julian) // 5316) * ((50 * julian) // 17719) + (julian // 5670) * ((43 * julian) // 15238)
    julian = julian - ((30 - j) // 15) * ((17719 * j) // 50) - (j // 16) * ((15238 * j) // 43) + 29
    return (24 * julian) // 709


def in_ramadan(day: date, cfg: dict[str, Any]) -> bool:
    """Manual dates win (both set); otherwise the Hijri month decides while the automatic switch is on."""
    if cfg["ramadan_from"] and cfg["ramadan_to"]:
        return cfg["ramadan_from"] <= day.isoformat() <= cfg["ramadan_to"]
    return bool(cfg["ramadan_auto"]) and hijri_month(day) == 9


def applied(day: date, cfg: dict[str, Any] | None) -> dict[str, Any] | None:
    """The shift a punch on `day` is measured against, or None while the schedule is not in use."""
    cfg = norm(cfg)
    if not cfg["enabled"]:
        return None
    kind = "ramadan" if in_ramadan(day, cfg) else "official"
    row = cfg[kind]
    return {"kind": kind, "start": row["start"], "end": row["end"], "hours": float(row["hours"]),
            "grace": int(row["grace"])}


def required_hours(day: date, cfg: dict[str, Any] | None) -> float | None:
    """The day's shift length while the schedule is in use (the attendance reports start from it)."""
    row = applied(day, cfg)
    return None if row is None else row["hours"]


def read(db: Any) -> dict[str, Any]:
    """The saved setting, complete (GET /settings/schedule)."""
    from sqlalchemy import text

    saved = db.execute(text("SELECT value FROM public.ariba_app_settings WHERE key=:k"), {"k": SETTING_KEY}).scalar()
    return norm(saved)


def payload(row: dict[str, Any], today: date) -> dict[str, Any]:
    """The GET answer: the setting plus the shift that applies today, so the screen can show it."""
    return {**row, "today": {"date": today.isoformat(), "shift": applied(today, row)}}


def schedule_in(body: Any) -> dict[str, Any]:
    """A whole saved setting from a PUT body, checked. The design's camelCase keys are read too."""
    body = _obj(body)
    start = _day(body.get("ramadan_from", body.get("ramadanFrom")), "ramadan_from")
    end = _day(body.get("ramadan_to", body.get("ramadanTo")), "ramadan_to")
    if bool(start) != bool(end):
        raise _invalid("ramadan_from / ramadan_to: التاريخان معًا أو لا شيء")
    if start and end < start:
        raise _invalid("ramadan_from / ramadan_to: النهاية قبل البداية")
    return {
        "enabled": _flag(body.get("enabled"), "enabled"),
        "official": _row(body.get("official"), "official", DEFAULT_SCHEDULE["official"]),
        "ramadan": _row(body.get("ramadan"), "ramadan", DEFAULT_SCHEDULE["ramadan"]),
        "ramadan_auto": _flag(body.get("ramadan_auto", body.get("ramadanAuto", True)), "ramadan_auto"),
        "ramadan_from": start,
        "ramadan_to": end,
    }
