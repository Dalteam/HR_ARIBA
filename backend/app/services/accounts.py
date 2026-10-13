"""Login accounts: sign-in, password changes, temporary passwords, roles.

Usernames are employee numbers (e.g. `emp084`). Passwords live only as Argon2 hashes.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError, forbidden, not_found
from app.core.identity import (
    AuthSession,
    check_password,
    generate_temporary_password,
    issue_session,
    set_password,
)
from app.core.security import password_policy_errors
from app.models import Credential, Employee, Role, User


def sign_in(db: Session, username: str, password: str) -> tuple[AuthSession, User]:
    user = db.scalar(select(User).where(User.username == username))
    cred = check_password(db, user, password)  # raises invalid_credentials (timing-safe)
    if not user.is_active:  # type: ignore[union-attr]
        raise ApiError(403, "account_inactive", "This account is disabled")
    user.last_login_at = datetime.now(UTC)  # type: ignore[union-attr]
    return issue_session(user, cred), user  # type: ignore[arg-type]


def change_password(db: Session, user: User, old: str, new: str) -> AuthSession:
    errors = password_policy_errors(new, old)
    if errors:
        raise ApiError(422, "weak_password", errors[0], [{"field": "new_password", "message": e} for e in errors])
    try:
        check_password(db, user, old)
    except ApiError as exc:
        if exc.code == "invalid_credentials":
            raise ApiError(422, "validation_error", "Current password is incorrect", [{"field": "old_password", "message": "Incorrect"}])
        raise
    set_password(db, user, new)
    user.must_change_password = False
    # The old tokens are now invalid; hand back a fresh session for this device.
    return issue_session(user, db.get(Credential, user.id))  # type: ignore[arg-type]


def create_account(db: Session, employee_id: uuid.UUID, role: Role, actor: User) -> tuple[User, str]:
    if role == Role.admin and actor.role != Role.admin:
        raise forbidden("Only an admin can create admin accounts")
    emp = db.get(Employee, employee_id)
    if emp is None or emp.deleted_at is not None:
        raise not_found("Employee")
    if emp.termination_date is not None:
        raise ApiError(409, "conflict", "Cannot create a login for a terminated employee")
    if db.scalar(select(User.id).where(User.employee_id == emp.id)):
        raise ApiError(409, "conflict", "This employee already has a login")
    username = emp.emp_no.lower()
    if db.scalar(select(User.id).where(User.username == username)):
        raise ApiError(409, "conflict", "This username is already taken")
    temp = generate_temporary_password()
    user = User(id=uuid.uuid4(), username=username, role=role, employee_id=emp.id, is_active=True, must_change_password=True)
    db.add(user)
    db.flush()
    set_password(db, user, temp)
    return user, temp


def issue_temporary_password(db: Session, target: User, actor: User) -> str:
    if target.role == Role.admin and actor.role != Role.admin:
        raise forbidden("Only an admin can reset an admin's password")
    temp = generate_temporary_password()
    set_password(db, target, temp)
    target.must_change_password = True
    return temp


def update_account(db: Session, target: User, actor: User, role: Role | None, is_active: bool | None) -> list[str]:
    changed = []
    if role is not None and role != target.role:
        if actor.role != Role.admin:
            raise forbidden("Only an admin can change roles")
        if target.id == actor.id:
            raise ApiError(409, "conflict", "You cannot change your own role")
        target.role = role
        changed.append("role")
    if is_active is not None and is_active != target.is_active:
        if target.id == actor.id:
            raise ApiError(409, "conflict", "You cannot disable your own account")
        if target.role == Role.admin and actor.role != Role.admin:
            raise forbidden()
        target.is_active = is_active
        changed.append("is_active")
    return changed
