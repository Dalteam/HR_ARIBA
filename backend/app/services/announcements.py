"""Announcements and greetings (Stage 7 of the employee-app port).

The home card «الإعلانات والتهاني» (`frontend/employee-app/src/components/announcements.tsx`) reads
`GET /me/announcements`; HR writes through `/announcements`, `/occasions` and two settings. The rules are
`docs/BUSINESS_RULES.md` § Announcements and greetings (A1–A12) and the tables are migration
`003_announcements.sql`. What this module owns:

* **A1 — recipients are today's employees.** `recipients()` resolves the audience when a row is sent:
  active and not terminated, then the employer or the listed ids. A listed id that cannot receive makes
  the whole request `422 invalid_recipients` before anything is written.
* **A3/A4 — the card.** `visible()` is plain Python over the candidate rows, so the windows are testable
  without a database: an announcement while pinned or younger than 14 days, a greeting younger than
  24 hours, both measured from now in Riyadh time (`core.scheduling.now_riyadh`), an `expires_on` on or
  after today in Riyadh, and an audience that matches the caller **now**. It returns the seven keys the
  app reads and nothing else: never the audience, the recipients or the author.
* **A5/D4 — the bell.** Sending writes one `workflow_notifications` row per recipient and links it in
  `ariba_announcement_notifs`; hiding the row deletes those bell entries again.
* **A8/A11 — text.** Plain text only: control characters are dropped, the title is required and
  ≤ 200 characters, the body ≤ 2000; anything longer is refused, never cut. Nothing here renders HTML,
  and a `<script>` in a title is stored and answered as the literal characters it is.
* **A9 — automatic greetings** are off (`occasions_auto`), run only when HR asks, and each one goes to
  the one person it is about; `auto_key` makes a second run on the same day send nothing.
* **D5 — e-mail.** `announcements_mail` ships off; `services/notify_email.py` never mails a greeting and
  mails an announcement only while that switch is on.
"""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.core.scheduling import now_riyadh

KINDS = ("announcement", "greeting")
AUDIENCES = ("all", "employer", "employees")
#: A8. `recovery` (الشفاء) is health information and stays off the list until HR confirms it (D2).
OCCASIONS = ("birthday", "anniversary", "graduation", "wedding", "newborn", "promotion", "achievement", "other")
OCCASION_AR = {"graduation": "التخرج", "wedding": "الزواج", "newborn": "المولود الجديد", "promotion": "الترقية",
               "achievement": "الإنجاز", "other": "المناسبة"}
TITLE_MAX = 200
BODY_MAX = 2000
NOTE_MAX = 500
ANNOUNCEMENT_DAYS = 14
GREETING_HOURS = 24
CARD_LIMIT = 10
#: The seven keys `GET /me/announcements` answers with (the app's `Announcement` type), and only those.
CARD_KEYS = ("id", "kind", "occasion", "title", "body", "pinned", "created_at")
#: Fields a `PATCH` may change (A6); the others are fixed once the bell has rung.
EDITABLE = ("title", "body", "pinned", "expires_on")
FIXED = ("kind", "occasion", "audience", "employer_id", "employee_ids")

AUTO_KEY = "occasions_auto"
AUTO_DEFAULT: dict[str, bool] = {"enabled": False, "birthday": False, "anniversary": False, "custom": False}
MAIL_KEY = "announcements_mail"
MAIL_DEFAULT: dict[str, bool] = {"email": False}

#: Who may receive: an employee who is active and not terminated (the same test `employee_map` uses).
CURRENT = ("d.active AND coalesce(d.data->>'isTerminated','false') <> 'true' "
           "AND coalesce(d.data->>'term','false') <> 'true'")
#: C0/C1 control characters except tab and newline: they have no business in a notice and some of them
#: (NUL, ESC) break the places a notice ends up in (a log line, an e-mail subject).
_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f-\x9f]")


def invalid(message: str, details: Any = None) -> ApiError:
    return ApiError(422, "invalid_request", message, details)


def clean_text(value: Any, limit: int, field: str, required: bool = False) -> str:
    """Plain text: a string, control characters dropped, CRLF folded, trimmed, refused above `limit` (A11)."""
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise invalid(f"{field} must be text")
    out = _CONTROL.sub("", value.replace("\r\n", "\n").replace("\r", "\n")).strip()
    if required and not out:
        raise invalid(f"{field} is required")
    if len(out) > limit:
        raise invalid(f"{field} is longer than {limit} characters")
    return out


def parse_day(value: Any, field: str, today: date, allow_past: bool = False) -> date | None:
    """`YYYY-MM-DD` or nothing; an expiry in the past is refused (A11)."""
    if value in (None, ""):
        return None
    try:
        day = date.fromisoformat(str(value)[:10]) if isinstance(value, str) and len(value) == 10 else None
    except ValueError:
        day = None
    if day is None:
        raise invalid(f"{field} must be YYYY-MM-DD")
    if not allow_past and day < today:
        raise invalid(f"{field} is in the past")
    return day


def _flag(value: Any, field: str) -> bool:
    if value is None:
        return False
    if not isinstance(value, bool):
        raise invalid(f"{field} must be true or false")
    return value


def validate_new(body: dict[str, Any], today: date) -> dict[str, Any]:
    """The create body, checked and normalised before anything is read or written."""
    kind = body.get("kind") or "announcement"
    if kind not in KINDS:
        raise invalid("kind must be announcement or greeting")
    occasion = body.get("occasion")
    if kind == "greeting":
        occasion = occasion or "other"
        if occasion not in OCCASIONS:
            raise invalid("occasion is not one of the allowed values", list(OCCASIONS))
    else:
        occasion = None  # an announcement has no occasion
    audience = body.get("audience") or "all"
    if audience not in AUDIENCES:
        raise invalid("audience must be all, employer or employees")
    employer_id = None
    ids: list[str] = []
    if audience == "employer":
        raw = body.get("employer_id")
        if isinstance(raw, bool) or not isinstance(raw, int) or raw <= 0:
            raise invalid("employer_id is required for audience=employer")
        employer_id = raw
    if audience == "employees":
        raw_ids = body.get("employee_ids")
        if not isinstance(raw_ids, list):
            raise invalid("employee_ids must be a list for audience=employees")
        ids = sorted({str(i).strip() for i in raw_ids if isinstance(i, (str, int)) and str(i).strip()})
        if not ids:
            raise invalid("choose at least one employee")
    return {
        "kind": kind, "occasion": occasion, "audience": audience, "employer_id": employer_id, "employee_ids": ids,
        "title": clean_text(body.get("title"), TITLE_MAX, "title", required=True),
        "body": clean_text(body.get("body"), BODY_MAX, "body"),
        "pinned": _flag(body.get("pinned"), "pinned"),
        "expires_on": parse_day(body.get("expires_on"), "expires_on", today),
    }


def validate_edit(body: dict[str, Any], today: date) -> dict[str, Any]:
    """A6: only the wording, the pin and the expiry; the audience is fixed once the bell has rung."""
    fixed = [k for k in FIXED if k in body]
    if fixed:
        raise invalid("these fields cannot change after sending: " + ", ".join(fixed), fixed)
    changes: dict[str, Any] = {}
    if "title" in body:
        changes["title"] = clean_text(body["title"], TITLE_MAX, "title", required=True)
    if "body" in body:
        changes["body"] = clean_text(body["body"], BODY_MAX, "body")
    if "pinned" in body:
        changes["pinned"] = _flag(body["pinned"], "pinned")
    if "expires_on" in body:
        changes["expires_on"] = parse_day(body["expires_on"], "expires_on", today)
    if not changes:
        raise invalid("nothing to change: send title, body, pinned or expires_on")
    return changes


# ---------------------------------------------------------------------------------------- the card (A3/A4)

CANDIDATE_SQL = """SELECT id, kind, occasion, title, body, pinned, created_at, audience, employer_id, employee_ids,
        expires_on FROM public.ariba_announcements
    WHERE NOT hidden AND (pinned OR created_at > :since) ORDER BY created_at DESC LIMIT 500"""


def visible(rows: list[dict[str, Any]], me: str | None, my_employer: int | None, now: datetime) -> list[dict[str, Any]]:
    """The card's items: current, addressed to me, pinned first then newest, at most ten, seven keys each."""
    today = now.date()
    week2 = now - timedelta(days=ANNOUNCEMENT_DAYS)
    day1 = now - timedelta(hours=GREETING_HOURS)
    out = []
    for r in rows:
        if r.get("expires_on") is not None and r["expires_on"] < today:
            continue
        created = r["created_at"]
        if r["kind"] == "greeting":
            if created <= day1:
                continue
        elif not (r.get("pinned") or created > week2):
            continue
        audience = r.get("audience")
        if not (audience == "all"
                or (audience == "employer" and my_employer is not None and r.get("employer_id") == my_employer)
                or (audience == "employees" and me is not None and me in (r.get("employee_ids") or []))):
            continue
        out.append(r)
    out.sort(key=lambda r: (not r.get("pinned"), -r["created_at"].timestamp()))
    return [{**{k: r.get(k) for k in CARD_KEYS}, "id": str(r["id"]), "body": r.get("body") or "",
             "pinned": bool(r.get("pinned"))} for r in out[:CARD_LIMIT]]


def mine(db: Session, me: str | None, now: datetime | None = None) -> list[dict[str, Any]]:
    now = now or now_riyadh()
    employer = db.execute(text("SELECT employer_id FROM public.employee_directory WHERE employee_id=:e"),
                          {"e": me}).scalar() if me else None
    rows = [dict(r) for r in db.execute(text(CANDIDATE_SQL),
                                        {"since": now - timedelta(days=ANNOUNCEMENT_DAYS)}).mappings()]
    return visible(rows, me, employer, now)


# ---------------------------------------------------------------------------------------- HR's side

def recipients(db: Session, audience: str, employer_id: int | None, ids: list[str]) -> list[str]:
    """A1: today's employees in the audience. A listed id that cannot receive refuses the whole send."""
    rows = db.execute(text(f"""SELECT d.employee_id FROM public.employee_directory d
        WHERE {CURRENT} AND (:a='all' OR (:a='employer' AND d.employer_id=:emp)
                             OR (:a='employees' AND d.employee_id = ANY(:ids)))
        ORDER BY d.employee_id"""), {"a": audience, "emp": employer_id, "ids": ids}).all()
    found = [r[0] for r in rows]
    if audience == "employees":
        missing = sorted(set(ids) - set(found))
        if missing:
            raise ApiError(422, "invalid_recipients", "Some employees cannot receive (not current employees)", missing)
    if audience == "employer" and not db.execute(text("SELECT 1 FROM public.employers WHERE id=:e"),
                                                 {"e": employer_id}).first():
        raise invalid("employer_id does not exist")
    return found


def deliver(db: Session, announcement_id: Any, to: list[str], title: str, body: str, kind: str) -> int:
    """One bell entry per recipient, each linked to the row so hiding it can take them back (D4)."""
    for eid in to:
        nid = db.execute(text("""INSERT INTO public.workflow_notifications
            (recipient_employee_id, request_id, title, body, stage, kind)
            VALUES (:e, NULL, :t, :b, 'message', :k) RETURNING id"""),
            {"e": eid, "t": title, "b": body or title, "k": kind}).scalar()
        db.execute(text("""INSERT INTO public.ariba_announcement_notifs(announcement_id, notification_id)
            VALUES (:a, :n) ON CONFLICT DO NOTHING"""), {"a": announcement_id, "n": nid})
    return len(to)


def create(db: Session, actor: dict[str, Any], data: dict[str, Any]) -> tuple[str, int]:
    to = recipients(db, data["audience"], data["employer_id"], data["employee_ids"])
    aid = db.execute(text("""INSERT INTO public.ariba_announcements
        (kind, occasion, title, body, audience, employer_id, employee_ids, pinned, expires_on, source, created_by, sent_count)
        VALUES (:kind, :occasion, :title, :body, :audience, :employer_id, :employee_ids, :pinned, :expires_on, 'manual', :by, :n)
        RETURNING id"""), {**data, "by": actor.get("employee_id") or actor.get("username"), "n": len(to)}).scalar()
    deliver(db, aid, to, data["title"], data["body"], data["kind"])
    return str(aid), len(to)


def _uuid(value: str) -> str:
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        raise ApiError(404, "not_found", "Announcement not found")


def get_live(db: Session, announcement_id: str) -> dict[str, Any]:
    """A row that exists and is not hidden; anything else is the same 404 (A7)."""
    row = db.execute(text("""SELECT id, kind, audience, sent_count FROM public.ariba_announcements
        WHERE id=CAST(:i AS uuid) AND NOT hidden"""), {"i": _uuid(announcement_id)}).mappings().first()
    if not row:
        raise ApiError(404, "not_found", "Announcement not found")
    return dict(row)


def edit(db: Session, actor: dict[str, Any], announcement_id: str, changes: dict[str, Any]) -> dict[str, Any]:
    row = get_live(db, announcement_id)
    sets = ", ".join(f"{k}=:{k}" for k in changes)
    db.execute(text(f"""UPDATE public.ariba_announcements SET {sets}, updated_by=:by, updated_at=now()
        WHERE id=:id"""), {**changes, "by": actor.get("employee_id") or actor.get("username"), "id": row["id"]})
    return row


def hide(db: Session, actor: dict[str, Any], announcement_id: str) -> tuple[dict[str, Any], int]:
    """A7 + D4: the row leaves the card and the HR list, and its bell entries leave every bell."""
    row = get_live(db, announcement_id)
    removed = db.execute(text("""DELETE FROM public.workflow_notifications WHERE id IN
        (SELECT notification_id FROM public.ariba_announcement_notifs WHERE announcement_id=:id)"""),
        {"id": row["id"]}).rowcount or 0
    db.execute(text("""UPDATE public.ariba_announcements SET hidden=true, updated_by=:by, updated_at=now()
        WHERE id=:id"""), {"by": actor.get("employee_id") or actor.get("username"), "id": row["id"]})
    return row, int(removed)


def hr_list(db: Session, limit: int = 100) -> list[dict[str, Any]]:
    """A2: every live row with a recipient count, never the recipients' names."""
    rows = db.execute(text("""SELECT id, kind, occasion, title, body, audience, employer_id, pinned, expires_on,
            source, sent_count, created_at, updated_at FROM public.ariba_announcements
        WHERE NOT hidden ORDER BY created_at DESC LIMIT :n"""), {"n": max(1, min(int(limit), 300))}).mappings()
    return [{**dict(r), "id": str(r["id"]), "recipients": r["sent_count"]} for r in rows]


# ---------------------------------------------------------------------------------------- occasions (A10)

def validate_occasion(body: dict[str, Any]) -> dict[str, Any]:
    eid = str(body.get("employee_id") or "").strip()
    if not eid:
        raise invalid("employee_id is required")
    occasion = body.get("occasion")
    if occasion not in OCCASIONS or occasion in ("birthday", "anniversary"):
        # birthday and anniversary come from the employee record itself, not from a note
        raise invalid("occasion is not one of the allowed values",
                      [o for o in OCCASIONS if o not in ("birthday", "anniversary")])
    day = parse_day(body.get("occ_date"), "occ_date", date.min, allow_past=True)
    if day is None:
        raise invalid("occ_date is required")
    return {"employee_id": eid, "occasion": occasion, "occ_date": day,
            "yearly": _flag(body.get("yearly"), "yearly"),
            "note": clean_text(body.get("note"), NOTE_MAX, "note") or None}


def occasions(db: Session) -> list[dict[str, Any]]:
    rows = db.execute(text("""SELECT o.id, o.employee_id, COALESCE(d.name_ar, d.name_en, o.employee_id) AS name,
            o.occasion, o.occ_date, o.yearly, o.note FROM public.ariba_emp_occasions o
        LEFT JOIN public.employee_directory d ON d.employee_id=o.employee_id
        WHERE NOT o.hidden ORDER BY o.occ_date DESC""")).mappings()
    return [{**dict(r), "id": str(r["id"])} for r in rows]


def save_occasion(db: Session, actor: dict[str, Any], data: dict[str, Any]) -> str:
    if not db.execute(text(f"SELECT 1 FROM public.employee_directory d WHERE d.employee_id=:e AND {CURRENT}"),
                      {"e": data["employee_id"]}).first():
        raise ApiError(422, "invalid_recipients", "Not a current employee", [data["employee_id"]])
    return str(db.execute(text("""INSERT INTO public.ariba_emp_occasions(employee_id, occasion, occ_date, yearly, note, created_by)
        VALUES (:employee_id, :occasion, :occ_date, :yearly, :note, :by) RETURNING id"""),
        {**data, "by": actor.get("employee_id") or actor.get("username")}).scalar())


def hide_occasion(db: Session, occasion_id: str) -> None:
    try:
        oid = str(uuid.UUID(str(occasion_id)))
    except (ValueError, TypeError, AttributeError):
        raise ApiError(404, "not_found", "Occasion not found")
    done = db.execute(text("UPDATE public.ariba_emp_occasions SET hidden=true WHERE id=CAST(:i AS uuid) AND NOT hidden"),
                      {"i": oid}).rowcount
    if not done:
        raise ApiError(404, "not_found", "Occasion not found")


# ---------------------------------------------------------------------------------------- switches (A9, D5)

def _setting(db: Session, key: str) -> Any:
    row = db.execute(text("SELECT value FROM public.ariba_app_settings WHERE key=:k ORDER BY updated_at DESC LIMIT 1"),
                     {"k": key}).first()
    return row[0] if row else None


def _switches(saved: Any, default: dict[str, bool]) -> dict[str, bool]:
    """Only the known keys, and only a literal `true` turns one on."""
    saved = saved if isinstance(saved, dict) else {}
    return {k: saved.get(k) is True for k in default}


def auto_cfg(db: Session) -> dict[str, bool]:
    return _switches(_setting(db, AUTO_KEY), AUTO_DEFAULT)


def mail_cfg(db: Session) -> dict[str, bool]:
    return _switches(_setting(db, MAIL_KEY), MAIL_DEFAULT)


def validate_switches(body: dict[str, Any], default: dict[str, bool]) -> dict[str, bool]:
    unknown = [k for k in body if k not in default]
    if unknown:
        raise invalid("unknown setting: " + ", ".join(unknown))
    if not body:
        raise invalid("nothing to change")
    for k, v in body.items():
        if not isinstance(v, bool):
            raise invalid(f"{k} must be true or false")
    return dict(body)


# ---------------------------------------------------------------------------------------- automatic greetings (A9)

def _first(name: Any) -> str:
    return str(name or "").split(" ")[0]


def run_auto(db: Session, today: date | None = None) -> int:
    """Today's birthday, anniversary and registered-occasion greetings, each only to its own person, once."""
    cfg = auto_cfg(db)
    if not cfg["enabled"]:
        return 0
    today = today or now_riyadh().date()
    sent = 0

    def once(eid: str, occasion: str, key: str, title: str, body: str) -> None:
        nonlocal sent
        aid = db.execute(text("""INSERT INTO public.ariba_announcements
            (kind, occasion, title, body, audience, employee_ids, source, auto_key, sent_count)
            VALUES ('greeting', :o, :t, :b, 'employees', ARRAY[CAST(:e AS text)], 'auto', :k, 1)
            ON CONFLICT (auto_key) DO NOTHING RETURNING id"""),
            {"o": occasion, "t": title[:TITLE_MAX], "b": body[:BODY_MAX], "e": eid, "k": key}).scalar()
        if aid:
            deliver(db, aid, [eid], title[:TITLE_MAX], body[:BODY_MAX], "greeting")
            sent += 1

    if cfg["birthday"]:
        for eid, name in db.execute(text(f"""SELECT d.employee_id, COALESCE(d.name_ar, d.name_en, d.employee_id)
                FROM public.employee_directory d WHERE {CURRENT} AND d.dob IS NOT NULL
                AND EXTRACT(month FROM d.dob)=:m AND EXTRACT(day FROM d.dob)=:d"""),
                {"m": today.month, "d": today.day}).all():
            once(eid, "birthday", f"birthday:{eid}:{today.year}", f"كل عام وأنت بخير يا {_first(name)}",
                 "تتمنى لك إدارة الموارد البشرية عامًا مليئًا بالصحة والنجاح والسعادة.")
    if cfg["anniversary"]:
        for eid, name, years in db.execute(text(f"""SELECT d.employee_id, COALESCE(d.name_ar, d.name_en, d.employee_id),
                CAST(:y - EXTRACT(year FROM d.join_date) AS int) FROM public.employee_directory d
                WHERE {CURRENT} AND d.join_date IS NOT NULL AND EXTRACT(year FROM d.join_date) < :y
                AND EXTRACT(month FROM d.join_date)=:m AND EXTRACT(day FROM d.join_date)=:d"""),
                {"y": today.year, "m": today.month, "d": today.day}).all():
            once(eid, "anniversary", f"anniversary:{eid}:{today.year}", f"{years} سنة معنا يا {_first(name)}",
                 "نشكرك على جهودك وإخلاصك، ونتمنى لك دوام التوفيق في مسيرتك معنا.")
    if cfg["custom"]:
        for oid, eid, occasion, name in db.execute(text(f"""SELECT o.id, o.employee_id, o.occasion,
                COALESCE(d.name_ar, d.name_en, o.employee_id) FROM public.ariba_emp_occasions o
                JOIN public.employee_directory d ON d.employee_id=o.employee_id
                WHERE NOT o.hidden AND {CURRENT} AND o.occasion = ANY(:allowed)
                AND ((o.yearly AND EXTRACT(month FROM o.occ_date)=:m AND EXTRACT(day FROM o.occ_date)=:d)
                     OR (NOT o.yearly AND o.occ_date=:t))"""),
                {"m": today.month, "d": today.day, "t": today, "allowed": list(OCCASION_AR)}).all():
            once(eid, occasion, f"occ:{oid}:{today.year}",
                 f"تهنئة بمناسبة {OCCASION_AR.get(occasion, 'المناسبة')} يا {_first(name)}",
                 "تهنئة من إدارة الموارد البشرية، ونتمنى لك دوام التوفيق والسعادة.")
    return sent
