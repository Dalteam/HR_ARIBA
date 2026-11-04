"""Password recovery (Stage 8): the same answer for everybody, rate-limited, and nothing sent while delivery is off.

The login screen's «نسيت كلمة المرور؟» (`frontend/employee-app/app/login.tsx:141`) posts `{username}` or `{iqama}`
to `POST /auth/password-recovery` and shows the answer's `message`. The rules are `docs/BUSINESS_RULES.md`
§ Password recovery (R1–R8):

* **R1 — one answer.** `request()` does the same steps whether or not an account matched: one lookup, one
  rate-limit row, one audit row, and the route holds every answer to `MIN_SECONDS`. It never returns an
  e-mail, a username or a name. A disabled account, a former employee and an account without an e-mail on
  file are treated exactly like an unknown one.
* **R2 — one switch.** `delivery()` picks the class named by `settings.password_recovery_delivery`; `off` is
  the only one today. While it is off no token is created and nothing is sent. A sender is a new class with
  a `deliver(to_address, username, reset_link)` method, registered in `DELIVERIES`.
* **R3 — the token, when a sender exists.** `secrets.token_urlsafe(32)`, stored only as its SHA-256 in
  `ariba_password_resets.token_hash`, 15 minutes, once; a new request voids the older unused ones.
* **R4 — finishing.** `complete()` gives one `400 invalid_reset` for every kind of failure and, on success,
  stores the new hash, voids every other token, and deletes the account's sessions and push tokens.
* **R5 — rate limits**, kept in `ariba_login_attempts` (the database, so a restart does not reset them). The
  typed username or iqama number is never stored: the row's key is an HMAC of it under the server's
  `JWT_SECRET`, which cannot be reversed without that secret even for a 10-digit iqama number. Rows older
  than a day are swept on each request.
* **R6 — audit** says whether a request matched and how, never the typed value, a token or an e-mail.
"""

from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import time
from dataclasses import dataclass
from typing import Any, Mapping, Protocol

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.errors import ApiError
from app.services import notify_email
from app.services import push as push_tokens

#: Every answer of the two request routes takes at least this long, found or not (R1).
MIN_SECONDS = 0.4
TOKEN_MINUTES = 15
#: R5: requests per identifier and per address in an hour; failed finishes per username and per address in 15 min.
REQUESTS_PER_ID, REQUESTS_PER_IP, REQUEST_WINDOW = 3, 10, "1 hour"
FAILS_PER_USER, FAILS_PER_IP, FAIL_WINDOW = 5, 20, "15 minutes"
REQUEST_KEY, FAIL_KEY = "recovery:", "recovery-fail:"

OFF_MESSAGE = "لا يمكن إرسال رسائل الاسترجاع حاليًا. تواصل مع الموارد البشرية لتصدر لك كلمة مرور مؤقتة."
ON_MESSAGE = "إذا كانت البيانات صحيحة ولها بريد مسجّل، ستصلك رسالة خلال دقائق."
LIMIT_MESSAGE = "محاولات كثيرة. حاول لاحقًا أو تواصل مع الموارد البشرية."
INVALID_RESET = "Invalid or expired password reset"

CURRENT = ("d.active AND coalesce(d.data->>'isTerminated','false') <> 'true' "
           "AND coalesce(d.data->>'term','false') <> 'true'")


# ---------------------------------------------------------------------------------------- delivery (R2)

class Delivery(Protocol):
    enabled: bool

    def deliver(self, to_address: str, username: str, reset_link: str) -> bool: ...


class NoDelivery:
    """`off`: nothing leaves the server, so no token is worth creating."""

    enabled = False

    def deliver(self, to_address: str, username: str, reset_link: str) -> bool:  # pragma: no cover - never called
        return False


DELIVERIES: dict[str, type] = {"off": NoDelivery}


def delivery() -> Delivery:
    return DELIVERIES[get_settings().password_recovery_delivery]()


def message() -> str:
    return ON_MESSAGE if delivery().enabled else OFF_MESSAGE


# ---------------------------------------------------------------------------------------- helpers

def key(prefix: str, kind: str, value: str) -> str:
    """The rate-limit key: an HMAC of the typed value, never the value itself (R5)."""
    secret = (get_settings().jwt_secret or "dev-only-recovery-key").encode()
    return prefix + hmac.new(secret, f"{kind}:{value}".encode(), hashlib.sha256).hexdigest()[:40]


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def normalise(body: Mapping[str, Any]) -> tuple[str, str]:
    """`("username", value)` or `("iqama", digits)`; `422` only when both are empty (the same for any account)."""
    username = str(body.get("username") or "").strip().lower()
    iqama = re.sub(r"\D", "", str(body.get("iqama") or ""))
    if username:
        return "username", username[:150]
    if iqama:
        return "iqama", iqama[:20]
    raise ApiError(422, "validation_error", "Username or iqama number is required")


def clock() -> float:
    return time.monotonic()


def hold(started: float) -> None:
    """Keep every answer at least `MIN_SECONDS` long, so a fast "unknown" looks like a slow "found" (R1)."""
    left = MIN_SECONDS - (time.monotonic() - started)
    if left > 0:
        time.sleep(left)


def _count(db: Session, where: str, window: str, **params: Any) -> int:
    return int(db.execute(text(f"SELECT count(*) FROM public.ariba_login_attempts WHERE {where} "
                               f"AND at > now() - interval '{window}'"), params).scalar() or 0)


def _attempt(db: Session, uname: str, ip: str | None) -> None:
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext('ariba_login_attempts'))"))
    next_id = int(db.execute(text("SELECT coalesce(max(id),0)+1 FROM public.ariba_login_attempts")).scalar())
    db.execute(text("INSERT INTO public.ariba_login_attempts(id,uname,ip) OVERRIDING SYSTEM VALUE VALUES(:id,:u,:ip)"),
               {"id": next_id, "u": uname, "ip": ip})


def _find(db: Session, by: str, value: str) -> dict[str, Any] | None:
    """R7: an active account whose employee is current; exactly one, or nobody."""
    match = "lower(a.username)=:v" if by == "username" else (
        "regexp_replace(coalesce(d.iqama_no, d.data->>'iqamaNo', d.data->>'iqama_no', ''), '\\D', '', 'g')=:v")
    rows = db.execute(text(f"""SELECT a.id, a.username, d.data FROM public.ariba_auth_accounts a
        JOIN public.employee_directory d ON d.employee_id=a.employee_id
        WHERE a.active AND {CURRENT} AND {match} LIMIT 2"""), {"v": value}).mappings().all()
    return dict(rows[0]) if len(rows) == 1 else None


# ---------------------------------------------------------------------------------------- the request (R1–R3, R5, R6)

@dataclass
class Outcome:
    matched: bool
    delivered: bool
    account_id: Any = None
    send: tuple[str, str, str] | None = None  # (address, username, link) for the route to hand to delivery later


def request(db: Session, body: Mapping[str, Any], ip: str | None) -> Outcome:
    """Everything except the answer and the audit row, which the route writes the same way for every outcome."""
    by, value = normalise(body)
    db.execute(text("DELETE FROM public.ariba_login_attempts WHERE uname LIKE 'recovery%' AND at < now() - interval '1 day'"))
    id_key = key(REQUEST_KEY, by, value)
    if (_count(db, "uname=:u", REQUEST_WINDOW, u=id_key) >= REQUESTS_PER_ID
            or (ip and _count(db, "uname LIKE 'recovery:%' AND ip=:ip", REQUEST_WINDOW, ip=ip) >= REQUESTS_PER_IP)):
        raise ApiError(429, "rate_limited", LIMIT_MESSAGE)
    _attempt(db, id_key, ip)
    account = _find(db, by, value)
    sender = delivery()
    if not account:
        return Outcome(matched=False, delivered=False)
    address = notify_email.recipient_address(account.get("data") or {})
    if not sender.enabled or not address:
        return Outcome(matched=True, delivered=False, account_id=account["id"])
    raw = secrets.token_urlsafe(32)
    db.execute(text("UPDATE public.ariba_password_resets SET used_at=coalesce(used_at, now()) "
                    "WHERE account_id=:a AND used_at IS NULL"), {"a": account["id"]})
    db.execute(text(f"""INSERT INTO public.ariba_password_resets(account_id, token_hash, expires_at)
        VALUES (:a, :h, now() + interval '{TOKEN_MINUTES} minutes')"""), {"a": account["id"], "h": token_hash(raw)})
    link = get_settings().public_app_url.rstrip("/") + "/reset-password?token=" + raw
    return Outcome(matched=True, delivered=True, account_id=account["id"], send=(address, account["username"], link))


# ---------------------------------------------------------------------------------------- finishing (R4, R5)

def strong(password: str) -> bool:
    return len(password) >= 10 and any(c.isalpha() for c in password) and any(c.isdigit() for c in password)


def complete(db: Session, body: Mapping[str, Any], ip: str | None, password_hash) -> Any:
    """The account id on success; `400 invalid_reset` for every failure, `422 weak_password`, `429`."""
    username = str(body.get("username") or "").strip().lower()
    token = str(body.get("reset_token") or "")
    password = str(body.get("new_password") or "")
    fail_key = key(FAIL_KEY, "username", username)
    if (_count(db, "uname=:u", FAIL_WINDOW, u=fail_key) >= FAILS_PER_USER
            or (ip and _count(db, "uname LIKE 'recovery-fail:%' AND ip=:ip", FAIL_WINDOW, ip=ip) >= FAILS_PER_IP)):
        raise ApiError(429, "rate_limited", LIMIT_MESSAGE)
    if not strong(password):
        raise ApiError(422, "weak_password", "Password must have at least 10 characters, letters, and digits")
    row = db.execute(text(f"""SELECT a.id, r.id AS reset_id FROM public.ariba_auth_accounts a
        JOIN public.employee_directory d ON d.employee_id=a.employee_id
        JOIN public.ariba_password_resets r ON r.account_id=a.id
        WHERE lower(a.username)=:u AND a.active AND {CURRENT} AND r.token_hash=:h
          AND r.used_at IS NULL AND r.expires_at > now()
        LIMIT 1 FOR UPDATE OF r"""), {"u": username, "h": token_hash(token)}).mappings().first()
    if not row or not token:
        _attempt(db, fail_key, ip)
        return None
    account_id = row["id"]
    db.execute(text("UPDATE public.ariba_auth_accounts SET password_hash=:h, must_change=false, updated_at=now() WHERE id=:id"),
               {"h": password_hash(password), "id": account_id})
    db.execute(text("UPDATE public.ariba_password_resets SET used_at=now() WHERE account_id=:a AND used_at IS NULL"),
               {"a": account_id})
    db.execute(text("DELETE FROM public.ariba_sessions WHERE account_id=:a"), {"a": account_id})
    push_tokens.forget_account(db, account_id)
    db.execute(text("DELETE FROM public.ariba_login_attempts WHERE uname=:u"), {"u": fail_key})
    return account_id
