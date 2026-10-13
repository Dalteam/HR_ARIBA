"""Security headers, request ids, login rate limiting, PII masking, password policy, upload checks."""

import re
import threading
import time
import uuid
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.config import get_settings
from app.core.errors import ApiError

# --------------------------------------------------------------------------- middleware

_DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request.state.request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
        response = await call_next(request)
        h = response.headers
        h["X-Request-ID"] = request.state.request_id
        h["X-Content-Type-Options"] = "nosniff"
        h["X-Frame-Options"] = "DENY"
        h["Referrer-Policy"] = "no-referrer"
        h["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"
        h["Cross-Origin-Opener-Policy"] = "same-origin"
        if not request.url.path.startswith(_DOCS_PATHS):
            # The API only ever returns JSON.
            h["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
            h["Cache-Control"] = "no-store"
        if get_settings().env == "production":
            h["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        return response


# --------------------------------------------------------------------------- rate limiting


class SlidingWindowLimiter:
    """In-memory, per-process limiter. Enough for a single backend instance; a shared store
    (e.g. Redis) is needed if the backend is ever scaled horizontally."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str, limit: int, window: int) -> bool:
        """Record an attempt. Returns False if the key is over the limit."""
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > window:
                q.popleft()
            if len(q) >= limit:
                return False
            q.append(now)
            return True

    def reset(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._hits.clear()


login_limiter = SlidingWindowLimiter()


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def check_login_rate(request: Request, username: str) -> None:
    s = get_settings()
    ip_ok = login_limiter.hit(f"ip:{client_ip(request)}", s.login_max_per_ip, s.login_window_seconds)
    user_ok = login_limiter.hit(f"user:{username}", s.login_max_per_username, s.login_window_seconds)
    if not (ip_ok and user_ok):
        raise ApiError(429, "rate_limited", "Too many login attempts. Try again in a few minutes.")


def reset_login_rate(username: str) -> None:
    login_limiter.reset(f"user:{username}")


# --------------------------------------------------------------------------- PII


def mask_id(value: str | None, visible: int = 4) -> str | None:
    """'1234567890' -> '******7890'."""
    if not value:
        return value
    if len(value) <= visible:
        return "*" * len(value)
    return "*" * (len(value) - visible) + value[-visible:]


# --------------------------------------------------------------------------- passwords

_LETTER = re.compile(r"[A-Za-z؀-ۿ]")
_DIGIT = re.compile(r"\d")


def password_policy_errors(new: str, old: str | None = None) -> list[str]:
    errors = []
    if len(new) < 8:
        errors.append("Password must be at least 8 characters")
    if not _LETTER.search(new) or not _DIGIT.search(new):
        errors.append("Password must contain both letters and digits")
    if old is not None and new == old:
        errors.append("New password must differ from the old one")
    return errors


# --------------------------------------------------------------------------- uploads

ALLOWED_UPLOADS: dict[str, tuple[bytes, ...]] = {
    "application/pdf": (b"%PDF",),
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "application/msword": (b"\xd0\xcf\x11\xe0",),
    # .docx is a zip container
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (b"PK\x03\x04",),
}


def check_upload(content_type: str, data: bytes) -> None:
    if len(data) > get_settings().max_upload_bytes:
        raise ApiError(413, "payload_too_large", "File is larger than 12 MB")
    magics = ALLOWED_UPLOADS.get(content_type)
    if magics is None:
        raise ApiError(415, "unsupported_media_type", "Only PDF, Word, JPG and PNG files are allowed")
    if not any(data.startswith(m) for m in magics):
        raise ApiError(415, "unsupported_media_type", "File content does not match its type")
