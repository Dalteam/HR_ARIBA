"""Bearer access token -> current `User` row.

Tokens are verified with JWT_SECRET (see core/identity.py). The role always comes from the
`users` table, never from the token, and a token stops working as soon as the user's password
changes (token_version) or the account is disabled.
"""

import uuid

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.core.identity import SESSION_EXPIRED, decode
from app.database import get_db
from app.models import Credential, User

_bearer = HTTPBearer(auto_error=False)
_UNAUTHORIZED = ApiError(401, "unauthorized", "Sign in required")


def _load_user(request: Request, creds: HTTPAuthorizationCredentials | None, db: Session) -> User:
    if creds is None or creds.scheme.lower() != "bearer":
        raise _UNAUTHORIZED
    claims = decode(creds.credentials, "access")
    try:
        user_id = uuid.UUID(claims["sub"])
    except ValueError:
        raise _UNAUTHORIZED
    user = db.get(User, user_id)
    if user is None:
        raise _UNAUTHORIZED
    cred = db.get(Credential, user.id)
    if cred is None or cred.token_version != claims["ver"]:
        raise SESSION_EXPIRED
    if not user.is_active:
        raise ApiError(403, "account_inactive", "This account is disabled")
    request.state.user = user
    return user


def get_current_user_allow_pending(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    """Any signed-in, active user, including one who still has to change a temporary password.
    Only /me and /auth/change-password use this."""
    return _load_user(request, creds, db)


def get_current_user(user: User = Depends(get_current_user_allow_pending)) -> User:
    if user.must_change_password:
        raise ApiError(403, "password_change_required", "You must change your temporary password first")
    return user
