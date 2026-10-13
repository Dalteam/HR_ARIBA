"""Sign-in, session refresh, passwords, and login accounts."""

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.auth import get_current_user_allow_pending
from app.core.errors import ApiError, not_found
from app.core import identity
from app.core.permissions import HR_ROLES, require_roles
from app.core.security import check_login_rate, reset_login_rate
from app.database import get_db
from app.models import User
from app.schemas import (
    ChangePasswordIn,
    CreateAccountIn,
    LoginIn,
    RefreshIn,
    SessionOut,
    TemporaryPasswordOut,
    UpdateAccountIn,
    UserOut,
)
from app.services import accounts

router = APIRouter(prefix="/auth", tags=["auth"])


def _session_out(session, user: User) -> SessionOut:
    return SessionOut(
        access_token=session.access_token,
        refresh_token=session.refresh_token,
        expires_in=session.expires_in,
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=SessionOut)
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    check_login_rate(request, body.username)
    try:
        session, user = accounts.sign_in(db, body.username, body.password)
    except ApiError:
        audit(db, request, None, "login_failed", "user", details={"username": body.username})
        db.commit()
        raise
    reset_login_rate(body.username)
    audit(db, request, user, "login", "user", user.id)
    db.commit()
    return _session_out(session, user)


@router.post("/refresh", response_model=SessionOut)
def refresh(body: RefreshIn, db: Session = Depends(get_db)):
    session, user = identity.refresh(db, body.refresh_token)
    return _session_out(session, user)


@router.post("/logout", status_code=204)
def logout(request: Request, user: User = Depends(get_current_user_allow_pending), db: Session = Depends(get_db)):
    # Tokens are short-lived and the browser drops them; this records the event.
    audit(db, request, user, "logout", "user", user.id)
    db.commit()


@router.post("/change-password", response_model=SessionOut)
def change_password(
    body: ChangePasswordIn,
    request: Request,
    user: User = Depends(get_current_user_allow_pending),
    db: Session = Depends(get_db),
):
    """Changing the password signs out every other device; the response is a new session."""
    check_login_rate(request, user.username)
    session = accounts.change_password(db, user, body.old_password, body.new_password)
    audit(db, request, user, "change_password", "user", user.id)
    db.commit()
    return _session_out(session, user)


@router.post("/users", response_model=TemporaryPasswordOut, status_code=201)
def create_account(
    body: CreateAccountIn,
    request: Request,
    actor: User = Depends(require_roles(*HR_ROLES)),
    db: Session = Depends(get_db),
):
    user, temp = accounts.create_account(db, body.employee_id, body.role, actor)
    audit(db, request, actor, "create_account", "user", user.id, {"role": user.role.value})
    db.commit()
    return TemporaryPasswordOut(user=UserOut.model_validate(user), temporary_password=temp)


def _get_user(db: Session, user_id: uuid.UUID) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise not_found("User")
    return user


@router.patch("/users/{user_id}", response_model=UserOut)
def update_account(
    user_id: uuid.UUID,
    body: UpdateAccountIn,
    request: Request,
    actor: User = Depends(require_roles(*HR_ROLES)),
    db: Session = Depends(get_db),
):
    target = _get_user(db, user_id)
    changed = accounts.update_account(db, target, actor, body.role, body.is_active)
    if changed:
        audit(db, request, actor, "update_account", "user", target.id, {"changed": changed})
    db.commit()
    return UserOut.model_validate(target)


@router.post("/users/{user_id}/temporary-password", response_model=TemporaryPasswordOut)
def temporary_password(
    user_id: uuid.UUID,
    request: Request,
    actor: User = Depends(require_roles(*HR_ROLES)),
    db: Session = Depends(get_db),
):
    target = _get_user(db, user_id)
    temp = accounts.issue_temporary_password(db, target, actor)
    audit(db, request, actor, "issue_temporary_password", "user", target.id)
    db.commit()
    return TemporaryPasswordOut(user=UserOut.model_validate(target), temporary_password=temp)


@router.get("/users/by-employee/{employee_id}", response_model=UserOut)
def account_for_employee(
    employee_id: uuid.UUID,
    _: User = Depends(require_roles(*HR_ROLES)),
    db: Session = Depends(get_db),
):
    user = db.scalar(select(User).where(User.employee_id == employee_id))
    if user is None:
        raise not_found("User")
    return UserOut.model_validate(user)

