"""Create one login in the canonical ariba_auth_accounts table with a temporary password.

    python tools/create_account.py --username admin.test --role admin [--employee-id 86]

- Uses the app's own DATABASE_URL (run it on the server: `railway ssh -s HR_ARIBA -- python tools/create_account.py ...`).
- The password is random, Argon2-hashed, printed once, and must be changed at first sign-in (must_change=true).
- Refuses if the username already exists. Writes one row only (plus an audit entry).
"""

import argparse
import json
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/ on the path when run as a script

from argon2 import PasswordHasher  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.database import engine  # noqa: E402

ROLES = ("employee", "manager", "hr", "ceo", "admin", "finance")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--username", required=True)
    ap.add_argument("--role", choices=ROLES, default="admin")
    ap.add_argument("--employee-id", default=None, help="employee_directory.employee_id to link (optional)")
    a = ap.parse_args()
    username = a.username.strip().lower()
    password = secrets.token_urlsafe(9) + "7a"  # letters + digits, >= 8 chars
    with engine.begin() as db:
        if db.execute(text("SELECT 1 FROM public.ariba_auth_accounts WHERE lower(username)=:u"), {"u": username}).first():
            raise SystemExit(f"Username {username} already exists")
        if a.employee_id and not db.execute(text("SELECT 1 FROM public.employee_directory WHERE employee_id=:e"), {"e": a.employee_id}).first():
            raise SystemExit(f"Employee {a.employee_id} not found")
        if a.employee_id and db.execute(text("SELECT 1 FROM public.ariba_auth_accounts WHERE employee_id=:e"), {"e": a.employee_id}).first():
            raise SystemExit(f"Employee {a.employee_id} already has an account")
        acc = db.execute(text("""INSERT INTO public.ariba_auth_accounts(username,password_hash,role,employee_id,active,must_change)
            VALUES(:u,:h,:r,:e,true,true) RETURNING id"""), {"u": username, "h": PasswordHasher().hash(password), "r": a.role, "e": a.employee_id}).scalar_one()
        db.execute(text("SELECT pg_advisory_xact_lock(hashtext('ariba_audit_log'))"))
        next_id = db.execute(text("SELECT coalesce(max(id),0)+1 FROM public.ariba_audit_log")).scalar_one()
        db.execute(text("""INSERT INTO public.ariba_audit_log(id,actor_username,actor_role,module,action,entity_type,entity_id,details)
            VALUES(:id,'cli','system','auth','create_account','account',:acc,CAST(:d AS jsonb))"""),
                   {"id": next_id, "acc": str(acc), "d": json.dumps({"username": username, "role": a.role})})
    print(f"Created {a.role} login '{username}'. Temporary password (shown once, change it at first sign-in): {password}")


if __name__ == "__main__":
    main()
