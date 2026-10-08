"""Command-line helpers for bootstrapping an environment.

    python -m app.services.seeds create-user --username emp084 --name-ar "..." --role admin

Creates (or reuses) the employee record and a login with a temporary password, which must be
changed on first sign-in. Locally the password is written to `.env.test.local` (git-ignored);
with --print it is printed once instead (use that on Railway, where there is no local file).
"""

import argparse
from datetime import date
from pathlib import Path

from sqlalchemy import select

import uuid

from app.core.identity import generate_temporary_password, set_password
from app.database import SessionLocal
from app.models import Employee, Role, User, Workplace

SECRETS_FILE = Path(".env.test.local")


def _record_secret(username: str, password: str) -> None:
    lines = SECRETS_FILE.read_text().splitlines() if SECRETS_FILE.exists() else []
    key = f"TEST_PASSWORD_{username.upper()}"
    lines = [ln for ln in lines if not ln.startswith(f"{key}=")]
    lines.append(f"{key}={password}")
    SECRETS_FILE.write_text("\n".join(lines) + "\n")


def create_user(username: str, name_ar: str, role: Role, show: bool = False) -> None:
    username = username.strip().lower()
    with SessionLocal() as db:
        if db.scalar(select(User).where(User.username == username)):
            raise SystemExit(f"User {username} already exists")
        emp = db.scalar(select(Employee).where(Employee.emp_no == username))
        if emp is None:
            workplace = db.scalar(select(Workplace).where(Workplace.code == "ariba"))
            emp = Employee(emp_no=username, name_ar=name_ar, workplace_id=workplace.id if workplace else None, join_date=date.today())
            db.add(emp)
            db.flush()
        password = generate_temporary_password()
        user = User(id=uuid.uuid4(), username=username, role=role, employee_id=emp.id, must_change_password=True)
        db.add(user)
        db.flush()
        set_password(db, user, password)
        db.commit()
    if show:
        print(f"Created {role.value} login '{username}'. Temporary password (change it at first sign-in): {password}")
    else:
        _record_secret(username, password)
        print(f"Created {role.value} login '{username}'. Temporary password saved to {SECRETS_FILE}.")


def bootstrap_admin() -> None:
    """Create the first admin from BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD when the
    users table is empty. Does nothing once any user exists."""
    from app.config import get_settings
    from app.core.security import password_policy_errors

    s = get_settings()
    username = s.bootstrap_admin_username.strip().lower()
    if not username or not s.bootstrap_admin_password:
        return
    if password_policy_errors(s.bootstrap_admin_password):
        raise SystemExit("BOOTSTRAP_ADMIN_PASSWORD must be 8+ characters with letters and digits")
    with SessionLocal() as db:
        if db.scalar(select(User.id).limit(1)) is not None:
            return
        workplace = db.scalar(select(Workplace).where(Workplace.code == "ariba"))
        emp = db.scalar(select(Employee).where(Employee.emp_no == username)) or Employee(
            emp_no=username, name_ar="مدير النظام", workplace_id=workplace.id if workplace else None, join_date=date.today()
        )
        db.add(emp)
        db.flush()
        user = User(id=uuid.uuid4(), username=username, role=Role.admin, employee_id=emp.id, must_change_password=True)
        db.add(user)
        db.flush()
        set_password(db, user, s.bootstrap_admin_password)
        db.commit()
    print(f"Bootstrap: created admin '{username}' (must change the password at first sign-in).")


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.services.seeds")
    sub = parser.add_subparsers(dest="cmd", required=True)
    cu = sub.add_parser("create-user", help="Create an employee + login with a temporary password")
    cu.add_argument("--username", required=True)
    cu.add_argument("--name-ar", required=True)
    cu.add_argument("--role", choices=[r.value for r in Role], default="employee")
    cu.add_argument("--print", dest="show", action="store_true", help="print the temporary password instead of saving it")
    args = parser.parse_args()
    if args.cmd == "create-user":
        create_user(args.username, args.name_ar, Role(args.role), args.show)


if __name__ == "__main__":
    main()
