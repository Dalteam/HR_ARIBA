"""The employee app's request envelope, next to the flat body it replaced.

`frontend/employee-app/src/lib/port.ts` submits every request as

    {"type": "unpaid", "payload": {"from": "2026-11-02", "to": "2026-11-03"},
     "attachment": {"name": "cert.pdf", "mime": "application/pdf", "data": "<base64>"}}

while the first screens (and `tools/smoke/api_smoke.py`) post the same fields flat:

    {"type": "unpaid", "from_date": "2026-11-02", "to_date": "2026-11-03"}

`RequestInput` reads both shapes, so `POST /me/requests` keeps its contract while the new screens
work. It also owns the attachment policy, so every request type applies the same three rules:

* **size** — `MAX_UPLOAD_BYTES` (12 MB by default), the same ceiling the app's picker uses
  (`MAX_ATT` in `src/lib/files.ts`) and the one `app.core.security.check_upload` enforces;
* **type** — the families the API already stores (`ALLOWED_UPLOADS`): PDF, Word (.doc/.docx),
  JPEG and PNG, checked against the file's magic bytes and not only the declared mime;
* **ownership** — a request belongs to the signed-in employee: a body that names anybody else in
  `employee_id` is refused before a single row is written, and the caller stores the attachment
  against the employee who owns the request row (`canonical._save_request_document`).

Checks that need the database (leave balance, lookups, duplicate pending requests) stay in the
router — this module only reads the body.
"""

from __future__ import annotations

import base64
import binascii
from dataclasses import dataclass
from pathlib import PurePath
from typing import Any, Mapping

from app.config import get_settings
from app.core.errors import ApiError
from app.core.security import ALLOWED_UPLOADS, check_upload

#: What an attachment may be: the API's own allowlist, so one place decides.
ALLOWED_MIME_TYPES = frozenset(ALLOWED_UPLOADS)

#: The picker's mime is sometimes generic; the file name then decides.
_MIME_BY_SUFFIX = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
}

_SUFFIX_BY_MIME = {mime: suffix for suffix, mime in _MIME_BY_SUFFIX.items()}

#: Keys that are read separately (or are not fields at all) and never land in the merged values.
_NOT_FIELDS = frozenset({"payload", "attachment", "file"})

MAX_ATTACHMENT_NAME = 200


@dataclass(frozen=True)
class Attachment:
    """One uploaded file, already decoded and validated."""

    name: str
    mime: str
    data: bytes

    @property
    def size(self) -> int:
        return len(self.data)


def attachment_limit() -> int:
    """The ceiling for one attachment, in bytes (`MAX_UPLOAD_BYTES`, 12 MB unless configured)."""
    return get_settings().max_upload_bytes


def _describe_bytes(limit: int) -> str:
    return f"{limit / (1024 * 1024):g} MB"


def _text(value: Any) -> str:
    """A stripped string for scalars; blank for None, lists and objects (forms send all three)."""
    if value is None or isinstance(value, (dict, list, tuple, set)):
        return ""
    return str(value).strip()


def _safe_name(value: Any) -> str:
    """The last path segment of a file name, trimmed to a length the columns accept."""
    name = _text(value).replace("\\", "/").split("/")[-1]
    return "".join(ch for ch in name if ch.isprintable())[:MAX_ATTACHMENT_NAME].strip()


class RequestInput:
    """One `POST /me/requests` body, envelope or flat, with its optional attachment.

    A flat key wins over the nested payload key of the same name (the old screens send flat, the new
    ones nested), and both spellings of the legacy aliases stay valid — the router asks for them by
    name: `from_date`/`from`, `to_date`/`to`, `on_date`/`date`, `time_from`/`time`, `time_to`/`time2`,
    `punch_kind`/`kind`, `hours`/`dur`.
    """

    def __init__(self, body: Mapping[str, Any] | None, *, owner: str | None = None) -> None:
        raw = dict(body or {})
        values: dict[str, Any] = {}
        nested = raw.get("payload")
        if isinstance(nested, Mapping):
            values.update({str(key): value for key, value in nested.items()})
        for key, value in raw.items():
            if key in _NOT_FIELDS:
                continue
            values[str(key)] = value
        self.values: dict[str, Any] = values
        self.type = _text(values.get("type") or values.get("request_type"))
        self.claimed_employee_id = _text(values.get("employee_id")) or None
        if owner and self.claimed_employee_id and self.claimed_employee_id != str(owner):
            raise ApiError(403, "forbidden", "A request can only be submitted for the signed-in employee")
        self.attachment = self._attachment(raw.get("attachment") or raw.get("file"))

    # ------------------------------------------------------------------ fields
    def get(self, *keys: str, default: Any = None) -> Any:
        """The first of `keys` that carries a value (blank strings count as absent)."""
        for key in keys:
            value = self.values.get(key)
            if value is not None and value != "":
                return value
        return default

    def text(self, *keys: str) -> str:
        return _text(self.get(*keys))

    def number(self, *keys: str) -> float:
        try:
            return float(self.get(*keys))
        except (TypeError, ValueError):
            return 0.0

    @property
    def notes(self) -> str:
        """The free-text reason: the new screens call it `notes`, the reference sent `reason`."""
        return self.text("notes", "reason", "comment")

    # ------------------------------------------------------------------ attachment
    def _attachment(self, raw: Any) -> Attachment | None:
        if raw is None or raw == "" or raw == {}:
            return None
        if not isinstance(raw, Mapping):
            raise ApiError(422, "invalid_attachment", "attachment must be {name, mime, data}")
        name = _safe_name(raw.get("name"))
        mime = _text(raw.get("mime")).split(";")[0].strip().lower()
        if mime in {"", "application/octet-stream"}:
            mime = _MIME_BY_SUFFIX.get(PurePath(name).suffix.lower(), "")
        if mime not in ALLOWED_MIME_TYPES:
            raise ApiError(415, "unsupported_media_type",
                           "Only PDF, Word, JPG and PNG attachments are allowed")
        encoded = "".join(_text(raw.get("data")).split())
        if not encoded:
            raise ApiError(422, "invalid_attachment", "The attachment carries no data")
        limit = attachment_limit()
        if len(encoded) > (limit // 3 + 1) * 4:  # base64 grows by ~4/3: refuse before decoding
            raise ApiError(413, "payload_too_large",
                           f"The attachment is larger than {_describe_bytes(limit)}")
        try:
            data = base64.b64decode(encoded, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ApiError(422, "invalid_attachment", "The attachment is not valid base64") from exc
        check_upload(mime, data)  # the size ceiling again, then the magic bytes
        return Attachment(name=name or f"attachment{_SUFFIX_BY_MIME.get(mime, '')}",
                          mime=mime, data=data)
