"""Small settings saves (Stage 16): brand colours, the punch-button logo, the letterhead, the greeting texts, and the
mailboxes (details only).

    GET/PUT    /settings/brand-colors        S1  brand_colors {p, s, a} or {reset: true}
    GET/PUT    /settings/punch-logo          S2  punch_watermark {data}
    GET/PUT    /settings/letterhead          S3  letterhead {mode, page, head, foot, top, bottom, preset}
    GET/PUT    /settings/greeting-templates  S4  greeting_templates {birthday: {t, b}, anniversary: {t, b}}
    GET/PUT/DELETE /settings/mail/{scope}    S5  ariba_mail_accounts, scope `company` or `mine`
    GET/PUT    /settings/schedule            S6  attendance_schedule {enabled, official, ramadan, ...}
    GET/PUT    /settings/leave-rules         S7  leave_carry, leave_accrual_method, special_rights

The design stored each of these with a free-form `setSetting`; here every key has its own route and its own closed
field list, checked before it is written (BUSINESS_RULES § Small settings saves). `/public/brand` is unchanged: it still
reads the same five keys, two of which (S1, S2) are written here. Every save writes one audit row with field names only.
"""

from __future__ import annotations

import re
import time
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.database import get_db
from app.routers import canonical
from app.services import brand
from app.services import leave_rules
from app.services import schedule

router = APIRouter(tags=["settings-extra"])

HEX = brand.COLOUR
MAX_LETTERHEAD_CHARS = 1536 * 1024
LETTERHEAD_MODES = ("default", "page", "hf")
GREETING_KINDS = ("birthday", "anniversary")
TITLE_MAX, BODY_MAX = 200, 2000
MAIL_SCOPES = ("company", "mine")
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_HOST = re.compile(r"^[A-Za-z0-9.-]{1,253}$")


def _invalid(message: str) -> ApiError:
    return ApiError(422, "validation_error", message)


def _obj(body: Any) -> dict[str, Any]:
    if not isinstance(body, dict):
        raise _invalid("The body must be an object")
    return body


def _image(value: Any, field: str, cap: int) -> str:
    """'' (none) or a raster data: URI at or under `cap` characters."""
    if value in (None, ""):
        return ""
    if not isinstance(value, str) or len(value) > cap or not brand.IMAGE.match(value.strip()):
        raise _invalid(f"{field}: صورة غير صالحة (PNG / JPG / WEBP) أو أكبر من المسموح")
    return value.strip()


def _save(db: Session, actor: dict[str, Any], request: Request, key: str, value: Any, fields: list[str]) -> None:
    canonical._set_app_setting(db, key, value, actor)
    canonical._write_audit(db, actor, request, "settings", "update", "ariba_app_settings", key,
                           details={"fields": fields})
    db.commit()


# ------------------------------------------------------------------------------------------ S1 brand colours

def colours_in(body: Any) -> dict[str, Any]:
    body = _obj(body)
    if body.get("reset") is True:
        return {"reset": True}
    out = {}
    for key in ("p", "s", "a"):
        value = str(body.get(key) or "").strip()
        if key == "a" and not value:
            out[key] = ""
            continue
        if not HEX.match(value):
            raise _invalid(f"اللون {key} يجب أن يكون بصيغة #RRGGBB")
        out[key] = value.lower()
    return out


@router.get("/settings/brand-colors")
def get_colours(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    canonical._perm(actor, "settings")
    saved = brand._settings(db, "brand_colors")
    custom = bool(saved.get("p")) and not saved.get("reset")
    return {"custom": custom, "p": saved.get("p") if custom else None, "s": saved.get("s") if custom else None,
            "a": (saved.get("a") or "") if custom else ""}


@router.put("/settings/brand-colors")
def put_colours(body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(canonical.current_actor),
                db: Session = Depends(get_db)):
    canonical._perm(actor, "settings", "edit")
    value = colours_in(body)
    old = brand._settings(db, "brand_colors")
    legacy = brand._image(old.get("punch"))
    if legacy and not brand._image(brand._settings(db, "punch_watermark").get("data")):
        # the design once kept the punch picture inside the colour row: move it to its own key before it is dropped
        canonical._set_app_setting(db, "punch_watermark", {"data": legacy, "updated": int(time.time() * 1000)}, actor)
    value["updated"] = int(time.time() * 1000)
    _save(db, actor, request, "brand_colors", value, sorted(value))
    return get_colours(actor=actor, db=db)


# ------------------------------------------------------------------------------------------ S2 punch logo

@router.get("/settings/punch-logo")
def get_punch(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    canonical._perm(actor, "settings")
    colours = brand._settings(db, "brand_colors")
    return {"data": brand._image(colours.get("punch")) or brand._image(brand._settings(db, "punch_watermark").get("data")) or ""}


@router.put("/settings/punch-logo")
def put_punch(body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(canonical.current_actor),
              db: Session = Depends(get_db)):
    canonical._perm(actor, "settings", "edit")
    data = _image(_obj(body).get("data"), "الشعار", brand.MAX_IMAGE_CHARS)
    colours = brand._settings(db, "brand_colors")
    if "punch" in colours:  # an older copy in the colour row would win over the new one (brand.payload)
        colours.pop("punch")
        canonical._set_app_setting(db, "brand_colors", colours, actor)
    _save(db, actor, request, "punch_watermark", {"data": data, "updated": int(time.time() * 1000)}, ["data"])
    return {"data": data}


# ------------------------------------------------------------------------------------------ S3 letterhead

def _mm(value: Any, default: int) -> int:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if not 0 <= number <= 120:
        raise _invalid("الهوامش بين 0 و120 ملم")
    return round(number)


def letterhead_in(body: Any) -> dict[str, Any]:
    body = _obj(body)
    mode = str(body.get("mode") or "").strip()
    if mode not in LETTERHEAD_MODES:
        raise _invalid("نوع الورق الرسمي غير معروف")
    value: dict[str, Any] = {"mode": mode, "updated": int(time.time() * 1000)}
    if mode == "page":
        value.update(page=_image(body.get("page"), "صورة الورقة", MAX_LETTERHEAD_CHARS), head="", foot="",
                     top=_mm(body.get("top"), 42), bottom=_mm(body.get("bottom"), 30))
    elif mode == "hf":
        preset = "ariba" if body.get("preset") == "ariba" else None
        value.update(page="", head="" if preset else _image(body.get("head"), "الهيدر", MAX_LETTERHEAD_CHARS),
                     foot="" if preset else _image(body.get("foot"), "الفوتر", MAX_LETTERHEAD_CHARS),
                     top=_mm(body.get("top"), 42), bottom=_mm(body.get("bottom"), 30))
        if preset:
            value["preset"] = preset
    return value


def _stored_image(value: Any) -> str:
    """A saved letterhead image as it may be printed: a raster data: URI within the cap, else nothing."""
    value = str(value or "").strip()
    return value if value and len(value) <= MAX_LETTERHEAD_CHARS and brand.IMAGE.match(value) else ""


@router.get("/settings/letterhead")
def get_letterhead(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    canonical._perm(actor, ("staff", "settings"))
    saved = brand._settings(db, "letterhead")
    if not saved:
        return {"mode": None}  # nothing saved: the prints keep the Ariba header and footer
    return {"mode": saved.get("mode") if saved.get("mode") in LETTERHEAD_MODES else None,
            "page": _stored_image(saved.get("page")), "head": _stored_image(saved.get("head")),
            "foot": _stored_image(saved.get("foot")),
            "top": _mm(saved.get("top"), 42) if saved.get("top") is not None else 42,
            "bottom": _mm(saved.get("bottom"), 30) if saved.get("bottom") is not None else 30,
            "preset": saved.get("preset") if saved.get("preset") == "ariba" else None}


@router.put("/settings/letterhead")
def put_letterhead(body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(canonical.current_actor),
                   db: Session = Depends(get_db)):
    canonical._perm(actor, "settings", "edit")
    value = letterhead_in(body)
    _save(db, actor, request, "letterhead", value, sorted(k for k, v in value.items() if v not in ("", None)))
    return get_letterhead(actor=actor, db=db)


# ------------------------------------------------------------------------------------------ S4 greeting texts

def templates_in(body: Any) -> dict[str, dict[str, str]]:
    body = _obj(body)
    out: dict[str, dict[str, str]] = {}
    for kind in GREETING_KINDS:
        given = body.get(kind) or {}
        if not isinstance(given, dict):
            raise _invalid(f"{kind} must be an object")
        title, text_ = str(given.get("t") or "").strip(), str(given.get("b") or "").strip()
        if len(title) > TITLE_MAX or len(text_) > BODY_MAX:
            raise _invalid("نص التهنئة أطول من المسموح")
        out[kind] = {"t": title, "b": text_}
    return out


@router.get("/settings/greeting-templates")
def get_templates(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    canonical._require(actor, *canonical.HR_ROLES, "chairman")
    saved = canonical._app_setting(db, "greeting_templates")
    return templates_in(saved if isinstance(saved, dict) else {})


@router.put("/settings/greeting-templates")
def put_templates(body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(canonical.current_actor),
                  db: Session = Depends(get_db)):
    canonical._require(actor, *canonical.HR_ROLES, "chairman")
    value = templates_in(body)
    _save(db, actor, request, "greeting_templates", value, sorted(k for k, v in value.items() if v["t"] or v["b"]))
    return value


# ------------------------------------------------------------------------------------------ S5 mailboxes

def _owner(actor: dict[str, Any], scope: str, write: bool) -> str:
    if scope not in MAIL_SCOPES:
        raise ApiError(404, "not_found", "Mailbox not found")
    if scope == "company":
        canonical._perm(actor, "settings", "edit" if write else "view")
        return "company"
    canonical._perm(actor, "staff")
    if not actor.get("employee_id"):
        raise ApiError(404, "not_found", "Mailbox not found")
    return str(actor["employee_id"])


def mail_in(body: Any) -> dict[str, Any]:
    body = _obj(body)
    if "password" in body or "password_enc" in body:
        raise _invalid("كلمة مرور البريد لا تُحفظ في البرنامج — تُضبط في إعدادات الخادم")
    host = str(body.get("host") or "").strip()
    if not _HOST.match(host):
        raise _invalid("خادم SMTP غير صحيح")
    try:
        port = int(body.get("port") or 0)
    except (TypeError, ValueError) as exc:
        raise _invalid("المنفذ رقم بين 1 و65535") from exc
    if not 1 <= port <= 65535:
        raise _invalid("المنفذ رقم بين 1 و65535")
    from_email = str(body.get("from_email") or "").strip()
    if not _EMAIL.match(from_email):
        raise _invalid("عنوان المرسل غير صحيح")
    username = str(body.get("username") or "").strip()[:254]
    return {"host": host, "port": port, "secure": body.get("secure") is True, "username": username or None,
            "from_name": str(body.get("from_name") or "").strip()[:120] or None, "from_email": from_email}


@router.get("/settings/mail/{scope}")
def get_mail(scope: str, actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    owner = _owner(actor, scope, write=False)
    row = canonical._row(db, """SELECT host, port, secure, username, from_name, from_email, updated_at
        FROM public.ariba_mail_accounts WHERE owner=:o""", o=owner)
    return {"configured": bool(row), **(row or {}), "sending": False}


@router.put("/settings/mail/{scope}")
def put_mail(scope: str, body: dict[str, Any], request: Request,
             actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    owner = _owner(actor, scope, write=True)
    value = mail_in(body)
    db.execute(text("""INSERT INTO public.ariba_mail_accounts
            (owner, provider, host, port, secure, username, from_name, from_email, updated_by, updated_at)
        VALUES (:o, 'smtp', :host, :port, :secure, :username, :from_name, :from_email, :by, now())
        ON CONFLICT (owner) DO UPDATE SET provider='smtp', host=EXCLUDED.host, port=EXCLUDED.port,
            secure=EXCLUDED.secure, username=EXCLUDED.username, from_name=EXCLUDED.from_name,
            from_email=EXCLUDED.from_email, updated_by=EXCLUDED.updated_by, updated_at=now()"""),
        {"o": owner, **value, "by": actor.get("employee_id")})
    canonical._write_audit(db, actor, request, "settings", "mail_set", "ariba_mail_accounts", scope,
                           details={"fields": sorted(k for k, v in value.items() if v not in (None, ""))})
    db.commit()
    return get_mail(scope, actor=actor, db=db)


@router.delete("/settings/mail/{scope}")
def delete_mail(scope: str, request: Request, actor: dict[str, Any] = Depends(canonical.current_actor),
                db: Session = Depends(get_db)):
    owner = _owner(actor, scope, write=True)
    db.execute(text("DELETE FROM public.ariba_mail_accounts WHERE owner=:o"), {"o": owner})
    canonical._write_audit(db, actor, request, "settings", "mail_delete", "ariba_mail_accounts", scope)
    db.commit()
    return {"configured": False}


# ------------------------------------------------------------------------------------------ S6 working hours
@router.get("/settings/schedule")
def get_schedule(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """The working-hours card: the saved shifts and the one that applies today."""
    canonical._perm(actor, "settings")
    return schedule.payload(schedule.read(db), canonical.today_riyadh())


@router.put("/settings/schedule")
def put_schedule(body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(canonical.current_actor),
                 db: Session = Depends(get_db)):
    canonical._perm(actor, "settings", "edit")
    value = schedule.schedule_in(body)
    _save(db, actor, request, schedule.SETTING_KEY, value,
          ["enabled", "official", "ramadan", "ramadan_auto", "ramadan_from", "ramadan_to"])
    return schedule.payload(value, canonical.today_riyadh())


# --------------------------------------------------------------------------------------- S7 leave rules
def _rules_payload(db: Session) -> dict[str, Any]:
    rules = leave_rules.read(db)
    return {**rules, "employees": leave_rules.counts(db), "methods": list(leave_rules.METHODS),
            "max_carry_days": leave_rules.MAX_CARRY_DAYS, "kinds": list(leave_rules.KINDS)}


@router.get("/settings/leave-rules")
def get_leave_rules(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """The leave card: the carry cap, the accrual method and the special types' rights, with how many employees
    each type holds (the count is what the switches act on)."""
    canonical._perm(actor, "settings")
    return _rules_payload(db)


@router.put("/settings/leave-rules")
def put_leave_rules(body: dict[str, Any], request: Request, actor: dict[str, Any] = Depends(canonical.current_actor),
                    db: Session = Depends(get_db)):
    """Any of carry / accrual / rights; what the body leaves out keeps its saved row."""
    canonical._perm(actor, "settings", "edit")
    value = leave_rules.rules_in(body)
    for name, key in (("carry", leave_rules.CARRY_KEY), ("accrual", leave_rules.ACCRUAL_KEY),
                      ("rights", leave_rules.RIGHTS_KEY)):
        if name in value:
            canonical._set_app_setting(db, key, value[name], actor)
    canonical._write_audit(db, actor, request, "settings", "update", "ariba_app_settings", "leave_rules",
                           details={"fields": sorted(value)})
    db.commit()
    return _rules_payload(db)
