"""Device push tokens, and the switch a later stage will read (Stage 6 of the employee-app port).

`src/lib/push.ts` asks Expo for the device's token and posts it here once the user is signed in
(`port.ts`'s `push.register`), then deletes it on sign-out (`push.unregister`). **Nothing is sent in
this stage** (class C): there is no sender, no queue and no outbound call anywhere in the codebase —
only the storage below and `push_config.enabled`, which ships **off**. The rules are
`docs/BUSINESS_RULES.md` § Public brand and push tokens (T1–T4):

* **T1 — a token belongs to the account that registers it.** The primary key is the token itself, so
  `register` is an upsert: the same phone signing in as somebody else moves the row to that account
  (the device is the same device — Expo hands out one token per install), and one account may hold
  several tokens (a phone and a tablet). The format is checked first: `ExponentPushToken[…]` /
  `ExpoPushToken[…]`, at most `TOKEN_MAX_CHARS`, `platform` in `PLATFORMS` — anything else is `422`
  and **nothing is written**, because a token that cannot be delivered to is a row that fails on
  every send.
* **T2 — nobody lists anybody's tokens, and no route ever returns one.** `own()` reads the caller's
  rows and drops the token text: the device list the app (or a human) sees is `platform` +
  `created_at` + `last_seen_at`. Deleting a token that is not the caller's is `404 not_found`, the
  same answer as a token that does not exist — and it removes nothing.
* **T3 — tokens die with the session.** `logout`, disabling an account (`PATCH /auth/users/{id}` with
  `is_active:false`) and a temporary password (which already kills the sessions) delete them through
  `forget_account`, and every read joins `ariba_auth_accounts` on `active`, so a row that survives a
  path nobody thought of still cannot reach a disabled account.
* **T4 — sending stays off.** `cfg()` answers `{"enabled": False}` until HR saves the switch
  (`GET`/`PUT /settings/push`); with it off, registering stores the token and **nothing else
  happens** — no bell row, no e-mail, no request to Expo — which the tests pin by counting the rows
  a registration writes.
"""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.errors import ApiError

#: The settings row behind `GET`/`PUT /settings/push` (the switch a sender will read).
CFG_KEY = "push_config"
#: Off until somebody turns it on, deliberately: this stage stores tokens, it never sends.
DEFAULT_CFG: dict[str, Any] = {"enabled": False}
#: Expo hands out one of these two prefixes; `push.ts` posts whatever `getExpoPushTokenAsync` returns.
TOKEN = re.compile(r"^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{8,200}\]$")
#: Bounded before it reaches the primary key: 210 is what a real token needs, with room to spare.
TOKEN_MAX_CHARS = 210
#: `Platform.OS` on the two platforms that can receive a push. A browser (`web`) never registers.
PLATFORMS = ("android", "ios")
#: The refusals — the token one is `invalid_token`, not the generic `invalid_request`, because the app
#: retries on nothing and a wrong platform is a code defect worth naming.
INVALID_TOKEN = "The push token is not an Expo token"
INVALID_PLATFORM = "platform must be android or ios"
NOT_FOUND = "Push token not found"

SETTING_SQL = "SELECT value FROM public.ariba_app_settings WHERE key=:key"
#: The read of the caller's own devices: no `token` column, and only a live account's rows (T2).
OWN_SQL = """SELECT t.platform, t.created_at, t.last_seen_at
    FROM public.ariba_push_tokens t
    JOIN public.ariba_auth_accounts a ON a.id=t.account_id AND a.active
    WHERE t.account_id=:account_id ORDER BY t.created_at DESC"""
#: The same join, counted for the switch screen: a number, never a token.
DEVICES_SQL = """SELECT count(*) FROM public.ariba_push_tokens t
    JOIN public.ariba_auth_accounts a ON a.id=t.account_id AND a.active"""


def cfg(db: Session) -> dict[str, Any]:
    """`{enabled}` from `push_config`, off when the row is missing or malformed (T4)."""
    row = db.execute(text(SETTING_SQL), {"key": CFG_KEY}).mappings().first()
    value = dict(row).get("value") if row else None
    return {"enabled": value.get("enabled") is True} if isinstance(value, dict) else dict(DEFAULT_CFG)


def enabled(db: Session) -> bool:
    return bool(cfg(db)["enabled"])


def settings(db: Session) -> dict[str, Any]:
    """What `GET /settings/push` answers: the switch, and how many devices are registered."""
    return {**cfg(db), "devices": int(db.scalar(text(DEVICES_SQL)) or 0)}


def token(value: Any) -> str:
    """The token, or `422` before anything is written (T1)."""
    text_value = value.strip() if isinstance(value, str) else ""
    if len(text_value) > TOKEN_MAX_CHARS or not TOKEN.match(text_value):
        raise ApiError(422, "invalid_token", INVALID_TOKEN)
    return text_value


def platform(value: Any) -> str:
    text_value = value.strip().lower() if isinstance(value, str) else ""
    if text_value not in PLATFORMS:
        raise ApiError(422, "invalid_platform", INVALID_PLATFORM)
    return text_value


def register(db: Session, account_id: Any, value: str, device: str) -> None:
    """Store one token for this account, or move an existing one to it (T1)."""
    db.execute(text("""INSERT INTO public.ariba_push_tokens(token,account_id,platform,created_at,last_seen_at)
        VALUES(:token,:account_id,:platform,now(),now())
        ON CONFLICT (token) DO UPDATE SET account_id=EXCLUDED.account_id,platform=EXCLUDED.platform,
            last_seen_at=now()"""), {"token": value, "account_id": account_id, "platform": device})


def own(db: Session, account_id: Any) -> list[dict[str, Any]]:
    """The caller's devices, **without the token text** (T2)."""
    return [dict(row) for row in db.execute(text(OWN_SQL), {"account_id": account_id}).mappings()]


def forget(db: Session, account_id: Any, value: str) -> int:
    """Delete one of the caller's own tokens; somebody else's is `404` and removes nothing (T2)."""
    owner = db.execute(text("SELECT account_id FROM public.ariba_push_tokens WHERE token=:token"),
                       {"token": value}).mappings().first()
    if not owner or str(dict(owner)["account_id"]) != str(account_id):
        raise ApiError(404, "not_found", NOT_FOUND)
    db.execute(text("DELETE FROM public.ariba_push_tokens WHERE token=:token AND account_id=:account_id"),
               {"token": value, "account_id": account_id})
    return 1


def forget_all(db: Session, account_id: Any) -> int:
    """Delete every token of the caller (the sign-out the app sends when it lost its token)."""
    result = db.execute(text("DELETE FROM public.ariba_push_tokens WHERE account_id=:account_id"),
                        {"account_id": account_id})
    return int(getattr(result, "rowcount", 0) or 0)


def forget_account(db: Session, account_id: Any) -> None:
    """Delete every token of **an account**, whoever is calling: logout, disable, temporary password (T3)."""
    db.execute(text("DELETE FROM public.ariba_push_tokens WHERE account_id=:account_id"),
               {"account_id": account_id})
