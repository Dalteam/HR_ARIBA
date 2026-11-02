"""The bell also goes out by e-mail.

`workflow_notifications` is the queue: every bell entry the API inserts is mailed once, `emailed_at`
being the sent stamp. The body carries the full details of the notification — request type, stage,
status, the employee and a button into the app — which is what the client's migration 39 asked for on
top of the one-line title the bell shows (client: supabase/functions/ariba-notify-email/index.ts).

Four safety rules, all of them enforced here rather than in the deployment notes:

* nothing is mailed unless NOTIFY_EMAIL_ENABLED=true *and* SMTP is configured. Two switches on
  purpose: a stray SMTP_HOST in a copied .env must not start mailing 106 real employees;
* nothing older than the cut-off is mailed. The migrated data ships 13 notifications with
  emailed_at IS NULL, so the first poll would otherwise blast months of history at real addresses.
  The cut-off is the stamp migration 002 wrote (ariba_app_settings['notify_email_since']), and
  NOTIFY_EMAIL_SINCE overrides it. No cut-off at all = send nothing (fail closed);
* outside production, mail only goes to NOTIFY_EMAIL_REDIRECT_TO (a sink) unless real recipients are
  explicitly allowed — a local run therefore cannot reach an employee's inbox;
* a success stamps `emailed_at`, so nothing is ever sent twice; a failure is recorded on the row
  (`email_error`, `email_tries`) and retried up to NOTIFY_EMAIL_MAX_TRIES.

Credentials stay in the environment (`SMTP_*`): the client's `ariba_mail_accounts` kept the mailbox
password in the database, where it ends up in every dump. We keep an eye on that table for the
*non-secret* half (host, port, secure, username, from_name, from_email) so Settings → Mail keeps
working, but the password and the "is it on" switch are ours.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import smtplib
import ssl
from dataclasses import dataclass
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid
from html import escape
from typing import Any, Mapping, Sequence

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.core.scheduling import RIYADH
from app.database import SessionLocal

log = logging.getLogger("ariba.notify_email")

# Same set the router uses to decide who sees the HR bell (backend/app/routers/canonical.py).
HR_ROLES = frozenset({"hr", "admin", "admin_manager"})
# The client's STAFF_ROLES (ariba-send-email): these recipients get the HR portal link, the rest the
# employee app. A notification whose stage is 'hr' counts as staff whatever the account's role is.
STAFF_ROLES = HR_ROLES | {"ceo", "chairman", "finance", "accountant", "manager"}

# Keys of ariba_app_settings['app_links'] — migration 39: {"hr": "…", "emp": "…"}.
APP_LINK_KEYS = ("hr", "emp")

# Where the HR portal's "open the request" screen lives, appended to the HR link (client's DEEP map).
DEEP_LINKS = {"request": "lv", "template": "lv", "decision": "lv", "template_decision": "lv",
              "alert": "dash", "task": "dash", "meeting": "dash"}

# The address fields the client tries, in its order (ariba-notify-email / ariba-send-email).
ADDRESS_FIELDS = ("email", "workEmail", "work_email", "emailAddress", "email_address",
                  "personalEmail", "personal_email", "mail", "ml")
EMAIL_RE = re.compile(r"^\S+@\S+\.\S+$")

# Attachment budget, from the client: 14 MiB in total, 6 MiB per request document.
MAX_TOTAL_ATTACHMENT_BYTES = 14 * 1024 * 1024
MAX_DOCUMENT_BYTES = 6 * 1024 * 1024
MAX_ATTACHMENTS = 5

STAGE_LABELS = {
    "manager": ("المدير المباشر", "Direct manager"),
    "hr": ("الموارد البشرية", "Human resources"),
    "ceo": ("الإدارة العليا", "Top management"),
    "employee": ("الموظف", "Employee"),
    "completed": ("مكتمل", "Completed"),
    "rejected": ("مرفوض", "Rejected"),
}

STATUS_LABELS = {
    "pending": ("قيد الاعتماد", "Pending"),
    "approved": ("معتمد", "Approved"),
    "rejected": ("مرفوض", "Rejected"),
    "cancelled": ("ملغي", "Cancelled"),
    "draft": ("مسودة", "Draft"),
}

# kinds the bell writes (client's KIND_EV, Arabic side).
KIND_LABELS = {
    "request": ("طلب جديد", "New request"),
    "decision": ("قرار على طلب", "Request decision"),
    "template": ("مستند للتوقيع", "Document to sign"),
    "template_decision": ("رد الموظف على المستند", "Employee reply"),
    "alert": ("تنبيه", "Alert"),
    "task": ("مهمة", "Task"),
    "meeting": ("اجتماع", "Meeting"),
    "greeting": ("تهنئة", "Greeting"),
    "message": ("رسالة", "Message"),
    "workflow": ("تحديث على الطلب", "Request updated"),
}

# Request types (client's LV map).
REQUEST_LABELS = {
    "annual": "إجازة سنوية", "sick": "إجازة مرضية", "emergency": "إجازة اضطرارية",
    "death": "إجازة وفاة", "marriage": "إجازة زواج", "paternity": "إجازة أبوة",
    "maternity": "إجازة أمومة", "umrah": "إجازة عمرة", "hajj": "إجازة حج",
    "remote": "عمل عن بعد", "mission": "مهمة خارجية", "perm": "استئذان",
    "perm_mat": "استئذان أمومة", "early_leave": "خروج مبكر", "unpaid": "إجازة بدون راتب",
    "salary_advance": "طلب راتب مقدم", "iban_change": "تغيير الآيبان", "profile_edit": "تعديل بيانات",
    "document": "رفع مستند", "leave_cancel": "طلب إلغاء إجازة", "advance": "سلفة",
    "overtime": "عمل إضافي", "forgot_punch": "نسيان بصمة",
}

# document types of a "template:<type>" request (client's TPL map).
TEMPLATE_LABELS = {
    "salary_cert": "تعريف بالراتب", "experience": "شهادة خبرة", "onboarding": "مباشرة عمل",
    "warning": "إنذار", "contract": "عقد", "letter": "خطاب",
}

DEFAULT_COMPANY = "Ariba HR"

# ---------------------------------------------------------------------------
# settings that live in the database
# ---------------------------------------------------------------------------
def _app_setting(db: Session, key: str) -> Any:
    row = db.execute(text("SELECT value FROM public.ariba_app_settings WHERE key=:k LIMIT 1"), {"k": key}).first()
    if not row:
        return None
    value = row[0]
    if isinstance(value, str):  # a driver that does not decode json for us
        try:
            return json.loads(value)
        except ValueError:
            return None
    return value


def app_links(db: Session, settings: Settings | None = None) -> dict[str, str]:
    """The links written by Settings → app links, PUBLIC_APP_URL standing in for any empty one."""
    settings = settings or get_settings()
    saved = _app_setting(db, "app_links")
    saved = saved if isinstance(saved, dict) else {}
    base = (settings.public_app_url or "").rstrip("/")
    return {key: str(saved.get(key) or base).rstrip("/") for key in APP_LINK_KEYS}


def company_name(db: Session) -> str:
    names = _app_setting(db, "company_names")
    if isinstance(names, dict):
        return str(names.get("coAr") or names.get("coEn") or DEFAULT_COMPANY)
    return DEFAULT_COMPANY


# ---------------------------------------------------------------------------
# the sender account
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class SmtpConfig:
    """Everything needed to hand a message to a server. `password` only ever comes from the env."""

    host: str
    port: int
    encryption: str
    username: str
    password: str
    from_email: str
    from_name: str

    @property
    def ready(self) -> bool:
        return bool(self.host.strip() and self.from_email.strip())


def mail_account(db: Session | None) -> dict[str, Any]:
    """The company mailbox row Settings → Mail writes (ariba_mail_accounts), non-secret columns only.

    The client stores the password there in clear text; our table keeps `password_enc` and no plaintext
    column at all, which is why only the routing half is read here. Any failure (table missing, no row,
    database not reachable) is not fatal: the environment is the source of truth.
    """
    if db is None:
        return {}
    try:
        row = db.execute(text("""
            SELECT host, port, secure, username, from_email, from_name
              FROM public.ariba_mail_accounts
             WHERE owner = 'company'
             ORDER BY updated_at DESC NULLS LAST
             LIMIT 1
        """)).mappings().first()
    except Exception:  # a fresh database without the table, or a locked one
        log.debug("ariba_mail_accounts is not readable", exc_info=True)
        return {}
    return dict(row) if row else {}


def smtp_config(settings: Settings | None = None, account: Mapping[str, Any] | None = None) -> SmtpConfig:
    """SMTP_* from the environment, with the mailbox row filling the gaps it leaves empty.

    The password is never taken from the database. A set SMTP_* value always wins over the row, so an
    operator can override what Settings → Mail saved without editing the UI.
    """
    settings = settings or get_settings()
    account = account or {}
    from_env = bool(settings.smtp_host.strip())
    port = int(settings.smtp_port or 0) if from_env else int(account.get("port") or settings.smtp_port or 587)
    encryption = settings.smtp_encryption
    if not from_env and account.get("secure") and port == 465:
        encryption = "ssl"
    return SmtpConfig(
        host=(settings.smtp_host or str(account.get("host") or "")).strip(),
        port=port,
        encryption=encryption,
        username=(settings.smtp_username or str(account.get("username") or "")).strip(),
        password=settings.smtp_password,
        from_email=(settings.smtp_from_email or str(account.get("from_email") or "")).strip(),
        from_name=(settings.smtp_from_name or str(account.get("from_name") or "")).strip() or DEFAULT_COMPANY,
    )


def smtp_configured(settings: Settings | None = None) -> bool:
    """Env-only check, used by app.main to decide whether to start the loop at all."""
    return smtp_config(settings).ready


def enabled(settings: Settings | None = None) -> bool:
    """Both switches: the explicit opt-in and a usable server."""
    settings = settings or get_settings()
    return bool(settings.notify_email_enabled) and smtp_configured(settings)


# ---------------------------------------------------------------------------
# the cut-off: nothing that came with the migrated data is ever mailed
# ---------------------------------------------------------------------------
def parse_since(value: Any) -> datetime | None:
    """An ISO timestamp (with or without a zone) → an aware datetime in UTC."""
    if isinstance(value, datetime):
        moment = value
    else:
        raw = str(value or "").strip()
        if not raw:
            return None
        try:
            moment = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            return None
    return moment.replace(tzinfo=timezone.utc) if moment.tzinfo is None else moment.astimezone(timezone.utc)


def cutoff(db: Session, settings: Settings | None = None) -> datetime | None:
    """The instant the queue starts: NOTIFY_EMAIL_SINCE, else the stamp migration 002 wrote, else None.

    None means "we cannot tell which rows are old", and flush() then refuses to send anything.
    """
    settings = settings or get_settings()
    explicit = parse_since(settings.notify_email_since)
    if explicit:
        return explicit
    saved = _app_setting(db, "notify_email_since")
    if isinstance(saved, Mapping):
        return parse_since(saved.get("at"))
    return parse_since(saved)


# ---------------------------------------------------------------------------
# the queue
# ---------------------------------------------------------------------------
# coalesce() over the client's address fields, first non-empty wins; the regex check happens in Python.
ADDRESS_SQL = "coalesce(" + ", ".join(
    f"nullif(btrim(d.data->>'{field}'), '')" for field in ADDRESS_FIELDS) + ", '')"

# Stage 7 (BUSINESS_RULES D5): a greeting is never mailed, and an announcement only while HR has switched
# ariba_app_settings['announcements_mail'].email on (it ships off). Every other kind is unchanged.
MAILABLE_KIND_SQL = """(coalesce(n.kind, '') <> 'greeting'
       AND (coalesce(n.kind, '') <> 'announcement'
            OR EXISTS (SELECT 1 FROM public.ariba_app_settings s
                        WHERE s.key = 'announcements_mail' AND s.value->>'email' = 'true')))"""

PENDING_SQL = text(f"""
    SELECT n.id, n.recipient_employee_id, n.request_id, n.title, n.body, n.stage, n.kind,
           n.created_at, n.email_tries,
           d.name_ar, d.name_en, d.data AS employee_data,
           (SELECT a.role FROM public.ariba_auth_accounts a
             WHERE a.employee_id = n.recipient_employee_id AND a.active
             ORDER BY a.created_at LIMIT 1) AS recipient_role,
           r.request_type, r.status AS request_status, r.current_stage,
           r.created_at AS request_created_at, r.payload AS request_payload,
           rd.name_ar AS requester_name
      FROM public.workflow_notifications n
      JOIN public.employee_directory d ON d.employee_id = n.recipient_employee_id
      LEFT JOIN public.workflow_requests r ON r.id = n.request_id
      LEFT JOIN public.employee_directory rd ON rd.employee_id = r.employee_id
     WHERE n.emailed_at IS NULL
       AND n.email_tries < :max_tries
       AND n.created_at >= :since
       AND {MAILABLE_KIND_SQL}
       AND {ADDRESS_SQL} <> ''
     ORDER BY n.created_at
     LIMIT :limit
""")

ATTACHMENT_SQL = text("""
    SELECT file_name, mime_type, file_data
      FROM public.ariba_notif_files
     WHERE notification_id = :id
     ORDER BY created_at DESC
     LIMIT 5
""")

# The client's fallback: when the notification carries no file of its own, the request's documents go
# along (a document upload, a template sent without the PDF argument…).
DOCUMENT_SQL = text("""
    SELECT file_name, mime_type, file_data, file_size
      FROM public.ariba_documents
     WHERE request_id = :id AND file_data IS NOT NULL
     ORDER BY created_at ASC
     LIMIT 5
""")


def recipient_address(data: Mapping[str, Any] | None) -> str:
    """The first usable e-mail address of an employee_directory row, '' when there is none."""
    if not isinstance(data, Mapping):
        return ""
    for field in ADDRESS_FIELDS:
        value = str(data.get(field) or "").strip()
        if value and EMAIL_RE.match(value):
            return value
    return ""


def fetch_pending(db: Session, since: datetime, limit: int = 25, max_tries: int = 5) -> list[dict[str, Any]]:
    rows = db.execute(PENDING_SQL, {"limit": limit, "max_tries": max_tries, "since": since}).mappings().all()
    return [dict(row) for row in rows]


def pending_count(db: Session, since: datetime, max_tries: int = 5) -> dict[str, int]:
    """What is waiting: rows that can be mailed, rows without an address, rows that gave up."""
    row = db.execute(text(f"""
        SELECT count(*) FILTER (WHERE {ADDRESS_SQL} <> ''
                                  AND n.email_tries < :max_tries) AS ready,
               count(*) FILTER (WHERE {ADDRESS_SQL} = '') AS no_address,
               count(*) FILTER (WHERE n.email_tries >= :max_tries) AS gave_up
          FROM public.workflow_notifications n
          JOIN public.employee_directory d ON d.employee_id = n.recipient_employee_id
         WHERE n.emailed_at IS NULL
           AND n.created_at >= :since
           AND {MAILABLE_KIND_SQL}
    """), {"max_tries": max_tries, "since": since}).mappings().one()
    return {key: int(row[key] or 0) for key in ("ready", "no_address", "gave_up")}


def attachments(db: Session, row: Mapping[str, Any]) -> list[tuple[str, str, bytes]]:
    """The files of one notification: its own PDF first, the request's documents as a fallback.

    A broken/absent ariba_notif_files must never stop the e-mail — the table only arrives with
    migration 002 — so a failed query is a rollback and an empty list.
    """
    found: list[tuple[str, str, bytes]] = []
    total = 0
    try:
        for name, mime, data in db.execute(ATTACHMENT_SQL, {"id": row["id"]}).all():
            payload = bytes(data or b"")
            if not payload or total + len(payload) > MAX_TOTAL_ATTACHMENT_BYTES:
                continue
            total += len(payload)
            found.append((str(name or "document.pdf"), str(mime or "application/pdf"), payload))
            if len(found) >= MAX_ATTACHMENTS:
                break
    except Exception:
        db.rollback()
        log.warning("ariba_notif_files is not readable; trying the request's own documents", exc_info=True)
        found = []
        total = 0
    if found or not row.get("request_id"):
        return found
    try:
        rows = db.execute(DOCUMENT_SQL, {"id": row["request_id"]}).all()
    except Exception:
        db.rollback()
        log.warning("ariba_documents is not readable; sending without attachments", exc_info=True)
        return []
    for name, mime, data, size in rows:
        if int(size or len(bytes(data or b""))) > MAX_DOCUMENT_BYTES:
            continue
        payload = bytes(data or b"")
        if not payload or total + len(payload) > MAX_TOTAL_ATTACHMENT_BYTES:
            continue
        total += len(payload)
        found.append((str(name or "attachment"), str(mime or "application/octet-stream"), payload))
    return found


# ---------------------------------------------------------------------------
# the message
# ---------------------------------------------------------------------------
# Payload keys printed as "تفاصيل الطلب", taken from the client's LBL map.
FIELD_LABELS = {
    "from": "من تاريخ", "to": "إلى تاريخ", "days": "عدد الأيام", "notes": "ملاحظات", "reason": "السبب",
    "amount": "المبلغ", "months": "عدد الأشهر", "iban": "الآيبان", "bank": "البنك",
    "account_no": "رقم الحساب", "hours": "عدد الساعات", "date": "التاريخ", "time": "الوقت",
    "start": "من الساعة", "end": "إلى الساعة", "destination": "الوجهة", "purpose": "الغرض",
    "place": "المكان", "title": "العنوان", "rejection_reason": "سبب الرفض",
}
SKIP_FIELDS = frozenset({"hr_leave_id", "submitted_from", "letter_html", "doc_type", "template_type",
                         "sent_by", "old", "changes", "attachments", "html", "body", "signature",
                         "sig", "target", "type", "title", "sent_at", "pdf", "patched"})


def _label(labels: dict[str, tuple[str, str]], key: str | None) -> str:
    if not key:
        return "—"
    arabic, english = labels.get(key, (key, key))
    return f"{arabic} / {english}"


def _when(value: Any) -> str:
    if not isinstance(value, datetime):
        return ""
    moment = value if value.tzinfo else value.replace(tzinfo=RIYADH)
    return moment.astimezone(RIYADH).strftime("%Y-%m-%d %H:%M")


def _is_staff(row: Mapping[str, Any]) -> bool:
    role = str(row.get("recipient_role") or "")
    return role in STAFF_ROLES or str(row.get("stage") or "") == "hr"


def link_for(row: Mapping[str, Any], links: Mapping[str, str]) -> str:
    """Staff point at the HR portal, everyone else at the employee app (client's openUrl logic).

    The client deep-links the HR portal for request/template/alert kinds ("#/lv", "#/dash"); we do the
    same so the button lands on the right screen instead of the dashboard.
    """
    staff = _is_staff(row)
    base = links.get("hr" if staff else "emp") or links.get("emp") or ""
    if not base:
        return ""
    base = base.split("#")[0].rstrip("/")
    deep = DEEP_LINKS.get(str(row.get("kind") or "")) if staff else None
    return f"{base}#/{deep}" if deep else base


def payload(row: Mapping[str, Any]) -> dict[str, Any]:
    value = row.get("request_payload")
    return dict(value) if isinstance(value, Mapping) else {}


def type_label(row: Mapping[str, Any]) -> str:
    """«إجازة سنوية», the template's own title, or the bell title when there is no request."""
    request_type = str(row.get("request_type") or "")
    if request_type.startswith("template:"):
        return str(payload(row).get("title") or TEMPLATE_LABELS.get(request_type.split(":", 1)[1])
                   or row.get("title") or "مستند للتوقيع")
    return str(REQUEST_LABELS.get(request_type) or row.get("title") or request_type)


def event_label(row: Mapping[str, Any]) -> str:
    """The bracketed word of the subject: الطلب/القرار/التنبيه…"""
    kind = str(row.get("kind") or "")
    if kind == "decision" and row.get("request_id"):
        status = STATUS_LABELS.get(str(row.get("request_status") or ""))
        return "قرار: " + (status[0] if status else str(row.get("request_status") or ""))
    return KIND_LABELS.get(kind, ("إشعار", "Notice"))[0]


def subject(row: Mapping[str, Any]) -> str:
    """`[الحدث] نوع الطلب — الموظف`, exactly the shape the client's function builds."""
    event = event_label(row)
    if row.get("request_id"):
        who = str(row.get("requester_name") or row.get("name_ar") or row.get("name_en") or "")
        return f"[{event}] {type_label(row)}" + (f" — {who}" if who else "")
    return f"[{event}] {row.get('title') or 'إشعار'}"


def details(row: Mapping[str, Any], link: str) -> list[tuple[str, str]]:
    """(label, value) pairs, in the order they are printed."""
    employee = str(row.get("name_ar") or row.get("name_en") or row.get("recipient_employee_id") or "")
    who = f"{employee} ({row.get('recipient_employee_id')})" if employee else ""
    out = [
        ("النوع / Kind", _label(KIND_LABELS, row.get("kind"))),
        ("نوع الطلب / Request type", type_label(row)),
        ("الحالة / Status", _label(STATUS_LABELS, row.get("request_status"))),
        ("المرحلة / Stage", _label(STAGE_LABELS, row.get("current_stage") or row.get("stage"))),
        ("تاريخ الطلب / Requested at", _when(row.get("request_created_at") or row.get("created_at"))),
        ("الموظف / Employee", who),
    ]
    requester = str(row.get("requester_name") or "")
    if requester and requester != employee:
        out.append(("مقدّم الطلب / Requested by", requester))
    for key, value in payload(row).items():
        if key in SKIP_FIELDS or isinstance(value, (dict, list)):
            continue
        shown = str(value or "").strip()
        if not shown:
            continue
        out.append((f"{FIELD_LABELS.get(key, key)} / {key}", shown))
    if row.get("request_id"):
        out.append(("رقم الطلب / Request id", str(row["request_id"])))
    if link:
        out.append(("الرابط / Link", link))
    return [(label, value) for label, value in out if value]


def action_hint(row: Mapping[str, Any]) -> str:
    """The client's yellow box: what the recipient is expected to do."""
    if str(row.get("request_status") or "") != "pending":
        return ""
    if str(row.get("request_type") or "").startswith("template:"):
        if _is_staff(row):
            return "الإجراء المطلوب: متابعة المستند المرسل إلى الموظف."
        return "الإجراء المطلوب: راجع المستند المرفق ثم وافق/وقّع عليه أو اعترض مع بيان السبب."
    if _is_staff(row):
        return "الإجراء المطلوب: مراجعة الطلب ثم الاعتماد أو الرفض أو الإعادة للتعديل مع بيان السبب."
    return ""


def _text_body(row: Mapping[str, Any], lines: list[tuple[str, str]], company: str, hint: str) -> str:
    name = str(row.get("name_ar") or row.get("name_en") or "")
    body = [f"مرحباً {name}،", "", str(row.get("title") or ""), str(row.get("body") or ""), ""]
    if hint:
        body += [hint, ""]
    body.append("التفاصيل / Details")
    body += [f"- {label}: {value}" for label, value in lines]
    body += ["", f"هذه رسالة تلقائية من {company} — لا ترد على هذا البريد.",
             f"This is an automatic message from {company} — please do not reply."]
    return "\n".join(body)


def _html_body(row: Mapping[str, Any], lines: list[tuple[str, str]], company: str, hint: str) -> str:
    name = escape(str(row.get("name_ar") or row.get("name_en") or ""))
    link = next((value for label, value in lines if label.startswith("الرابط")), "")
    rows = "".join(
        f'<tr><th align="right" style="padding:4px 8px;color:#004d3d;white-space:nowrap">{escape(label)}</th>'
        f'<td style="padding:4px 8px">{escape(value)}</td></tr>'
        for label, value in lines if not label.startswith("الرابط")
    )
    button = (f'<p style="margin:20px 0"><a href="{escape(link)}" '
              f'style="background:#004d3d;color:#fff;padding:10px 18px;border-radius:6px;'
              f'text-decoration:none">فتح النظام / Open the app</a></p>') if link else ""
    box = (f'<p style="background:#fff8e6;border-right:4px solid #b8975a;padding:10px 14px;'
           f'color:#5c4300">{escape(hint)}</p>') if hint else ""
    return (
        '<div dir="rtl" style="font-family:Segoe UI,Tahoma,Arial,sans-serif;color:#1f2937">'
        f"<p>مرحباً {name}،</p>"
        f'<h2 style="color:#004d3d;margin:12px 0">{escape(str(row.get("title") or ""))}</h2>'
        f"<p>{escape(str(row.get('body') or ''))}</p>"
        f"{box}"
        f'<table style="border-collapse:collapse;border:1px solid #e5e7eb">{rows}</table>'
        f"{button}"
        f'<p style="color:#6b7280;font-size:12px">هذه رسالة تلقائية من {escape(company)} — لا ترد على هذا البريد.'
        f"<br>This is an automatic message from {escape(company)} — please do not reply.</p>"
        "</div>"
    )


def build_message(row: Mapping[str, Any], *, links: Mapping[str, str], company: str, settings: Settings,
                  to: str | None = None, intended: str | None = None,
                  attachments: Sequence[tuple[str, str, bytes]] = ()) -> EmailMessage:
    """The full-detail mail for one workflow_notifications row, files attached when it has any."""
    link = link_for(row, links)
    lines = details(row, link)
    files = list(attachments)
    for name, _mime, data in files:
        lines.append(("مرفق / Attachment", f"{name} ({len(data):,} bytes)"))
    hint = action_hint(row)
    message = EmailMessage()
    headline = subject(row)
    recipient = to or recipient_address(row.get("employee_data")) or str(row.get("email") or "")
    if intended and intended != recipient:
        # the sink kept the real address: the operator can still tell who it was for
        headline = "[test] " + headline
    message["Subject"] = headline
    message["From"] = formataddr((settings.smtp_from_name or DEFAULT_COMPANY, settings.smtp_from_email))
    message["To"] = formataddr((str(row.get("name_ar") or row.get("name_en") or ""), recipient))
    message["Date"] = formatdate(localtime=True)
    if "@" in settings.smtp_from_email:
        message["Message-ID"] = make_msgid(domain=settings.smtp_from_email.split("@")[-1])
    message["X-Ariba-Notification"] = str(row.get("id") or "")
    if intended and intended != recipient:
        message["X-Ariba-Intended-To"] = intended
    message.set_content(_text_body(row, lines, company, hint))
    message.add_alternative(_html_body(row, lines, company, hint), subtype="html")
    for name, mime_type, data in files:
        maintype, _, subtype = (mime_type or "application/pdf").partition("/")
        message.add_attachment(data, maintype=maintype or "application", subtype=subtype or "pdf",
                               filename=name or "document.pdf")
    return message


def _deliver(message: EmailMessage, config: SmtpConfig) -> None:
    """Hand the message to the SMTP server in `config`; raises on any SMTP failure."""
    context = ssl.create_default_context()
    if config.encryption == "ssl":
        with smtplib.SMTP_SSL(config.host, config.port, timeout=20, context=context) as server:
            if config.username:
                server.login(config.username, config.password)
            server.send_message(message)
        return
    with smtplib.SMTP(config.host, config.port, timeout=20) as server:
        server.ehlo()
        if config.encryption == "starttls":
            server.starttls(context=context)
            server.ehlo()
        if config.username:
            server.login(config.username, config.password)
        server.send_message(message)


# ---------------------------------------------------------------------------
# the send loop
# ---------------------------------------------------------------------------
SENT_SQL = text("""UPDATE public.workflow_notifications
                      SET emailed_at=now(), email_error=NULL, email_tries=email_tries+1
                    WHERE id=:id""")

FAILED_SQL = text("""UPDATE public.workflow_notifications
                       SET email_error=:error, email_tries=email_tries+1
                     WHERE id=:id""")

# A row we refuse to send keeps counting its tries, so it stops being retried instead of blocking the
# queue forever, and email_error says exactly why it was never sent.
BLOCKED_SQL = FAILED_SQL

BLOCKED_REASON = ("blocked: NOTIFY_EMAIL_REDIRECT_TO is empty and this is not production — "
                  "refusing to mail a real employee address")


def targets_for(row: Mapping[str, Any], settings: Settings) -> tuple[list[str], str]:
    """Who this message is actually addressed to, and the employee it was meant for.

    A redirect list always wins, so a local/test run reaches the sink and never an employee. In
    production (or when explicitly allowed) the employee's own address is used.
    """
    real = recipient_address(row.get("employee_data")) or str(row.get("email") or "")
    redirect = settings.notify_email_redirect_list
    if redirect:
        return redirect, real
    if settings.env == "production" or settings.notify_email_allow_real_recipients:
        return ([real] if real else []), real
    return [], real


def flush(settings: Settings | None = None, db: Session | None = None,
          limit: int | None = None) -> dict[str, Any]:
    """Send everything that is waiting. Returns counts plus the reason nothing was sent.

    Reasons, in the order they are checked: "disabled" (NOTIFY_EMAIL_ENABLED is false),
    "smtp-not-configured", "no-cutoff". With any of them the bell keeps working and nothing is
    stamped, so the queue simply starts sending the day the switches are set.
    """
    settings = settings or get_settings()
    result: dict[str, Any] = {"enabled": bool(settings.notify_email_enabled),
                              "sent": 0, "failed": 0, "blocked": 0, "skipped": 0}
    session = db or SessionLocal()
    try:
        if not settings.notify_email_enabled:
            result["reason"] = "disabled"
            return result
        config = smtp_config(settings, mail_account(session))
        if not config.ready:
            result["reason"] = "smtp-not-configured"
            return result
        since = cutoff(session, settings)
        if since is None:
            result["reason"] = "no-cutoff"
            return result
        result["since"] = since.isoformat()
        max_tries = settings.notify_email_max_tries
        result["pending"] = pending_count(session, since, max_tries)
        rows = fetch_pending(session, since, limit or settings.notify_email_batch, max_tries)
        if not rows:
            return result
        links = app_links(session, settings)
        company = company_name(session)
        for row in rows:
            targets, intended = targets_for(row, settings)
            if not targets:
                result["blocked"] += 1
                log.warning("notification %s not mailed: %s", row["id"], BLOCKED_REASON)
                session.execute(BLOCKED_SQL, {"id": row["id"], "error": BLOCKED_REASON})
                session.commit()
                continue
            try:
                message = build_message(row, links=links, company=company, settings=settings,
                                        to=", ".join(targets), intended=intended,
                                        attachments=attachments(session, row))
                _deliver(message, config)
            except Exception as exc:  # SMTP down, wrong password, refused recipient…
                result["failed"] += 1
                log.warning("notification %s was not mailed: %s", row["id"], exc)
                session.execute(FAILED_SQL, {"id": row["id"], "error": f"{type(exc).__name__}: {exc}"[:500]})
            else:
                result["sent"] += 1
                session.execute(SENT_SQL, {"id": row["id"]})
            session.commit()
        return result
    finally:
        if db is None:
            session.close()


async def run_forever(stop: asyncio.Event, interval_seconds: int) -> None:
    """The loop started by app.main: one pass, then sleep, until the app shuts down."""
    while not stop.is_set():
        try:
            result = await asyncio.to_thread(flush)
            if result.get("sent") or result.get("failed") or result.get("blocked"):
                log.info("notification e-mails: %s", result)
        except Exception:  # the loop must survive a database hiccup
            log.exception("notification e-mail pass failed")
        try:
            await asyncio.wait_for(stop.wait(), timeout=max(5, interval_seconds))
        except (TimeoutError, asyncio.TimeoutError):
            continue


def main() -> int:
    """python -m app.services.notify_email — one pass, for a manual run or a cron job."""
    logging.basicConfig(level=logging.INFO)
    result = flush()
    print(json.dumps(result, ensure_ascii=False))
    return 1 if result.get("failed") else 0
