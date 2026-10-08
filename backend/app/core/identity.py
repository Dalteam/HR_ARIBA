"""Sign-in: Argon2 password hashes in the database and signed session tokens.

- Passwords are stored only as Argon2id hashes (`credentials` table).
- Sessions are HS256 JWTs signed with JWT_SECRET: a short-lived access token and a refresh token.
- Every credential has a `token_version`. Changing or resetting a password bumps it, which
  invalidates every token issued before (all devices are signed out).
"""

import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.errors import ApiError
from app.models import Credential, User

_hasher = PasswordHasher()  # Argon2id with the library's current recommended parameters

INVALID_CREDENTIALS = ApiError(401, "invalid_credentials", "Invalid username or password")
SESSION_EXPIRED = ApiError(401, "session_expired", "Your session has expired. Please sign in again.")

# Verifying against this hash when the user doesn't exist keeps timing similar either way.
_DUMMY_HASH = _hasher.hash("not-a-real-password")


@dataclass
class AuthSession:
    access_token: str
    refresh_token: str
    expires_in: int


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def _token(user: User, version: int, kind: str, ttl: timedelta) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    claims = {
        "sub": str(user.id),
        "iss": s.jwt_issuer,
        "aud": s.jwt_audience,
        "iat": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
        "typ": kind,
        "ver": version,
        # Copied into the token only so the frontend's proxy can mirror routing. The backend
        # never trusts it: it reads the role from the users table on every request.
        "app_metadata": {"role": user.role.value},
    }
    return jwt.encode(claims, s.jwt_secret, algorithm="HS256")


def issue_session(user: User, credential: Credential) -> AuthSession:
    s = get_settings()
    access_ttl = timedelta(minutes=s.access_token_minutes)
    return AuthSession(
        access_token=_token(user, credential.token_version, "access", access_ttl),
        refresh_token=_token(user, credential.token_version, "refresh", timedelta(days=s.refresh_token_days)),
        expires_in=int(access_ttl.total_seconds()),
    )


def decode(token: str, kind: str) -> dict:
    s = get_settings()
    try:
        claims = jwt.decode(
            token,
            s.jwt_secret,
            algorithms=["HS256"],
            audience=s.jwt_audience,
            issuer=s.jwt_issuer,
            options={"require": ["exp", "sub", "typ", "ver"]},
        )
    except jwt.ExpiredSignatureError:
        raise SESSION_EXPIRED
    except jwt.PyJWTError:
        raise ApiError(401, "unauthorized", "Sign in required")
    if claims.get("typ") != kind:
        raise ApiError(401, "unauthorized", "Sign in required")
    return claims


def check_password(db: Session, user: User | None, password: str) -> Credential:
    cred = db.get(Credential, user.id) if user else None
    if cred is None:
        verify_password(_DUMMY_HASH, password)
        raise INVALID_CREDENTIALS
    if not verify_password(cred.password_hash, password):
        raise INVALID_CREDENTIALS
    if _hasher.check_needs_rehash(cred.password_hash):
        cred.password_hash = hash_password(password)
    return cred


def refresh(db: Session, refresh_token: str) -> tuple[AuthSession, User]:
    claims = decode(refresh_token, "refresh")
    user = db.get(User, uuid.UUID(claims["sub"]))
    cred = db.get(Credential, user.id) if user else None
    if user is None or cred is None or not user.is_active or cred.token_version != claims["ver"]:
        raise SESSION_EXPIRED
    return issue_session(user, cred), user


def set_password(db: Session, user: User, password: str) -> None:
    """Create or replace the user's password; signs the user out everywhere."""
    cred = db.get(Credential, user.id)
    if cred is None:
        db.add(Credential(user_id=user.id, password_hash=hash_password(password), token_version=0))
    else:
        cred.password_hash = hash_password(password)
        cred.token_version += 1
    db.flush()


def generate_temporary_password() -> str:
    # 10 chars, guaranteed letters + digits, no look-alike characters.
    letters = "abcdefghjkmnpqrstuvwxyz"
    digits = "23456789"
    body = [secrets.choice(letters + digits) for _ in range(8)]
    return "".join(body) + secrets.choice(letters) + secrets.choice(digits)
