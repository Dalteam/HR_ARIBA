"""Expiry alerts (Stage 13): the design's daily bell for probation, contract, iqama, passport, insurance,
national address and GOSI certificate dates.

The design's `ariba_alerts_run` (sql/32 + sql/36), on our data:

* `ariba_app_settings['alerts_cfg']` per kind: `on` / `before` (the dashboard's «تنبيهات عاجلة» window) and
  `n = {on, before, ch, to}` — the bell from `n.before` days before the date, on the channels `ch`
  (program, app, email) to `to` (hr, employee). Missing keys fall back to DEFAULTS, the client's own setting
  of 27 Oct 2026 (FOLLOW_UPS #49: our 7 Oct copy does not carry it).
* Every day from 07:05 Riyadh (the same daily loop as escalation), one bell per (employee, kind, date,
  recipient) and day, until the date is renewed — a renewed document has a new date and starts again. A
  probation alert stops 15 days after the end. Former employees are skipped.
* HR's recipients are the people of the `hr` workflow stage (the HR bell pool of the requests). The employee
  gets their own alert only on the `app` channel.
* **E-mail stays off** (FOLLOW_UPS #7): the `email` channel is stored and the first alert is logged
  (`ariba_alert_log`), so the once-only rule is ready the day sending is switched on; nothing is sent here.
"""

from __future__ import annotations

import copy
import json
from datetime import date, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.scheduling import now_riyadh
from app.services import employee_map as emap

KINDS = ("probation", "contract", "iqama", "passport", "insurance", "natAddr", "gosiCert")
CHANNELS = ("program", "app", "email")
RECIPIENTS = ("hr", "employee")
SETTING_KEY = "alerts_cfg"
LAST_RUN_KEY = "alerts_last_run"
KEEP_DAILY_DAYS = 90
PROBATION_AFTER_DAYS = 15

LABEL = {"probation": "انتهاء فترة التجربة", "contract": "انتهاء العقد", "iqama": "انتهاء الهوية / الإقامة",
         "passport": "انتهاء جواز السفر", "insurance": "انتهاء التأمين الطبي", "natAddr": "انتهاء العنوان الوطني",
         "gosiCert": "انتهاء شهادة التأمينات الاجتماعية"}
DATE_FIELD = {"iqama": "iqamaExpiry", "passport": "passportExpiry", "insurance": "insuranceExpiry",
              "natAddr": "nationalAddressExpiry", "gosiCert": "gosiCertExpiry"}

_N = {"on": True, "before": 10, "ch": ["program", "app", "email"], "to": ["hr"]}
#: The client's alerts_cfg of 27 Oct 2026 (every kind on, the bell to HR from 10 days before).
DEFAULTS: dict[str, Any] = {
    "probation": {"on": True, "before": 30, "n": dict(_N)}, "contract": {"on": True, "before": 60, "n": dict(_N)},
    "iqama": {"on": True, "before": 60, "n": dict(_N)}, "passport": {"on": True, "before": 90, "n": dict(_N)},
    "insurance": {"on": True, "before": 90, "n": dict(_N)}, "natAddr": {"on": True, "before": 60, "n": dict(_N)},
    "gosiCert": {"on": True, "before": 60, "n": dict(_N)}, "probation_default": 90,
}


def tables_ready(db: Session) -> bool:
    return bool(db.scalar(text("SELECT to_regclass('public.ariba_alert_log') IS NOT NULL "
                               "AND to_regclass('public.ariba_alert_daily') IS NOT NULL")))


def _days(value: Any, default: int, high: int) -> int:
    try:
        return max(0, min(high, int(float(value))))
    except (TypeError, ValueError):
        return default


def normalize(raw: Any) -> dict[str, Any]:
    """The design's alertsCfg(): every kind present, numbers bounded, channels and recipients from the lists."""
    src = raw if isinstance(raw, dict) else {}
    out = copy.deepcopy(DEFAULTS)
    for kind in KINDS:
        given = src.get(kind) if isinstance(src.get(kind), dict) else {}
        base = out[kind]
        base["on"] = given.get("on", base["on"]) is not False
        base["before"] = _days(given.get("before", base["before"]), base["before"], 3650)
        n_given = given.get("n") if isinstance(given.get("n"), dict) else {}
        n = base["n"]
        n["on"] = n_given.get("on", n["on"]) is not False
        n["before"] = _days(n_given.get("before", n["before"]), n["before"], 3650)
        if isinstance(n_given.get("ch"), list):
            n["ch"] = [c for c in CHANNELS if c in n_given["ch"]]
        if isinstance(n_given.get("to"), list):
            n["to"] = [r for r in RECIPIENTS if r in n_given["to"]]
    pdef = src.get("probation_default", out["probation_default"])
    out["probation_default"] = _days(pdef, 90, 3650) or 90
    return out


def config(db: Session) -> dict[str, Any]:
    value = db.scalar(text("SELECT value FROM public.ariba_app_settings WHERE key=:k"), {"k": SETTING_KEY})
    return normalize(value)


def _add_months(day: date, months: int) -> date:
    month = day.month - 1 + months
    year, month = day.year + month // 12, month % 12 + 1
    for d in (day.day, 30, 29, 28):
        try:
            return date(year, month, d)
        except ValueError:
            continue
    return date(year, month, 28)


def expiry(kind: str, data: dict[str, Any], probation_default: int) -> date | None:
    """The date a kind expires on, read exactly as the design reads it."""
    if kind in DATE_FIELD:
        return emap.d(data.get(DATE_FIELD[kind]))
    join = emap.d(data.get("contractJoin"))
    if kind == "contract":
        end = emap.d(data.get("contractEnd"))
        if end is None and join is not None and "غير محدد" not in str(data.get("contractNature") or ""):
            try:
                months = int(float(data.get("contractDuration") or 0))
            except (TypeError, ValueError):
                months = 0
            if months > 0:
                end = _add_months(join, months)
        return end
    days = str(data.get("probationDays") or "").strip()
    if days.isdigit() and int(days) > 0:
        return join + timedelta(days=int(days)) if join else None
    if days in ("", "custom") and emap.d(data.get("probationEnd")) is not None:
        return emap.d(data.get("probationEnd"))
    return join + timedelta(days=probation_default) if join else None


def run(db: Session, today: date | None = None) -> dict[str, int]:
    """One pass: ring today's bells. Returns {sent, duplicates}. The caller commits."""
    from app.routers import canonical  # imported late to avoid a cycle

    today = today or now_riyadh().date()
    cfg = config(db)
    db.execute(text("DELETE FROM public.ariba_alert_daily WHERE day < :d"), {"d": today - timedelta(days=KEEP_DAILY_DAYS)})
    hr_people = canonical._stage_people(db, "hr")
    people = canonical._rows(db, """SELECT employee_id, name_ar, data FROM public.employee_directory
        WHERE active AND coalesce(data->>'isTerminated','false')<>'true' AND coalesce(data->>'notEmployed','false')<>'true'""")
    sent = duplicates = 0
    for kind in KINDS:
        n = cfg[kind]["n"]
        if not n["on"] or not n["ch"] or not n["to"]:
            continue
        for person in people:
            data = dict(person.get("data") or {})
            ends = expiry(kind, data, cfg["probation_default"])
            if ends is None:
                continue
            left = (ends - today).days
            if left > n["before"] or (kind == "probation" and left < -PROBATION_AFTER_DAYS):
                continue
            name = person.get("name_ar") or person["employee_id"]
            targets = (list(hr_people) if "hr" in n["to"] else []) + ([person["employee_id"]] if "employee" in n["to"] else [])
            for recipient in dict.fromkeys(targets):
                is_hr = recipient in hr_people and "hr" in n["to"]
                in_app = (is_hr and ("app" in n["ch"] or "program" in n["ch"])) or \
                         (recipient == person["employee_id"] and "employee" in n["to"] and "app" in n["ch"])
                if not in_app:
                    continue  # e-mail only: nothing to ring while e-mail is off
                key = {"e": person["employee_id"], "k": kind, "x": ends, "r": recipient}
                db.execute(text("""INSERT INTO public.ariba_alert_log(employee_id, kind, expiry, recipient)
                    VALUES (:e, :k, :x, :r) ON CONFLICT DO NOTHING"""), key)
                new_today = db.execute(text("""INSERT INTO public.ariba_alert_daily(employee_id, kind, expiry, recipient, day)
                    VALUES (:e, :k, :x, :r, :d) ON CONFLICT DO NOTHING"""), {**key, "d": today}).rowcount
                if not new_today:
                    duplicates += 1
                    continue
                when = ends.strftime("%d/%m/%Y")
                tail = f" (متبقي {left} يوم)" if left >= 0 else f" (منتهٍ منذ {-left} يوم)"
                if is_hr:
                    title, body, stage = f"تنبيه: {LABEL[kind]} — {name}", f"{name} — {LABEL[kind]} بتاريخ {when}{tail}", "hr"
                else:
                    title = f"تنبيه: {LABEL[kind]}"
                    body = f"{LABEL[kind]} الخاص بك بتاريخ {when}{tail}. يرجى تجديده/تحديث بياناتك."
                    stage = "employee"
                canonical._insert_notification(db, recipient, None, title, body, stage, "alert")
                sent += 1
    return {"sent": sent, "duplicates": duplicates}


def run_due(db: Session) -> dict[str, int] | None:
    """The daily pass, once per Riyadh day from 07:05; None when not due or before migration 005."""
    from app.services.escalation import RUN_FROM

    now = now_riyadh()
    if now.time() < RUN_FROM or not tables_ready(db):
        return None
    last = db.scalar(text("SELECT value FROM public.ariba_app_settings WHERE key=:k"), {"k": LAST_RUN_KEY})
    if isinstance(last, dict) and last.get("date") == now.date().isoformat():
        return None
    result = run(db, now.date())
    value = json.dumps({"date": now.date().isoformat(), "at": now.isoformat(), **result})
    db.execute(text("""INSERT INTO public.ariba_app_settings(key, value, updated_at) VALUES (:k, CAST(:v AS jsonb), now())
        ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()"""), {"k": LAST_RUN_KEY, "v": value})
    db.commit()
    return result
