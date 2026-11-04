"""The roles × modules permission matrix (the design's `ariba_role_perms` / `ariba_can`), Stage 11.

    level(actor, module)            "none" | "view" | "edit" for the actor's role
    allows(actor, modules, need)    True when ANY of `modules` reaches `need` (the design's 'a|b')
    load(db)                        the stored matrix, cached for CACHE_SECONDS and cleared on every write

* **`admin` and `chairman` always have `edit`** on every module; they are not stored and cannot be edited.
* **Four roles are edited**: hr, admin_manager, finance, ceo. `employee` and `manager` have no HR side.
* **`permissions` is capped at `view`** for every edited role (owner, 4 Nov 2026: only the admin edits it). The
  client's rows give hr and ceo `permissions: edit`; the row is kept, the cap applies when it is read.
* A missing row is `none`. `DEFAULTS` is the client's own matrix (`ariba_src`, 76 rows, October 2026); it is what
  an actor dict without a loaded matrix falls back to (the database-free tests) and what a fresh database seeds.

The actor dict carries its role's levels as `actor["perms"]` from the moment it is authenticated
(`canonical._authenticate`), so the checks never need a database handle.
"""

from __future__ import annotations

import time
from typing import Any, Iterable

from sqlalchemy import text
from sqlalchemy.orm import Session

MODULES = ("staff", "employees", "employees_admin", "attachments", "attendance", "locations", "leaves", "requests",
           "payroll", "payroll_prepare", "payroll_approve", "settlement", "documents", "forms", "reports", "settings",
           "permissions", "audit", "assets")
EDITABLE_ROLES = ("hr", "admin_manager", "finance", "ceo")
FULL_ROLES = ("admin", "chairman")
#: every role an account may hold (`roles` lookup)
ALL_ROLES = ("employee", "manager", "finance", "hr", "ceo", "admin", "admin_manager", "chairman")
LEVELS = ("none", "view", "edit")
RANK = {"none": 0, "view": 1, "edit": 2}
#: the module only `admin` / `chairman` may edit (P1)
CAPPED = {"permissions": "view"}

CACHE_SECONDS = 30.0

#: The client's matrix as it stood in `ariba_src` (ariba_role_perms, 76 rows).
DEFAULTS: dict[str, dict[str, str]] = {
    "hr": {"staff": "edit", "employees": "edit", "employees_admin": "edit", "attachments": "edit", "attendance": "edit",
           "locations": "edit", "leaves": "edit", "requests": "edit", "payroll": "edit", "payroll_prepare": "edit",
           "payroll_approve": "view", "settlement": "edit", "documents": "edit", "forms": "edit", "reports": "edit",
           "settings": "edit", "permissions": "edit", "audit": "edit", "assets": "edit"},
    "admin_manager": {"staff": "edit", "employees": "edit", "employees_admin": "edit", "attachments": "edit",
                      "attendance": "view", "locations": "view", "leaves": "view", "requests": "view", "payroll": "view",
                      "payroll_prepare": "view", "payroll_approve": "view", "settlement": "edit", "documents": "edit",
                      "forms": "edit", "reports": "edit", "settings": "edit", "permissions": "view", "audit": "view",
                      "assets": "edit"},
    "finance": {"staff": "view", "employees": "view", "employees_admin": "none", "attachments": "view",
                "attendance": "view", "locations": "view", "leaves": "view", "requests": "view", "payroll": "edit",
                "payroll_prepare": "edit", "payroll_approve": "edit", "settlement": "edit", "documents": "view",
                "forms": "view", "reports": "view", "settings": "none", "permissions": "none", "audit": "edit",
                "assets": "edit"},
    "ceo": {"staff": "view", "employees": "view", "employees_admin": "view", "attachments": "view", "attendance": "view",
            "locations": "view", "leaves": "view", "requests": "view", "payroll": "view", "payroll_prepare": "view",
            "payroll_approve": "edit", "settlement": "view", "documents": "view", "forms": "view", "reports": "view",
            "settings": "view", "permissions": "edit", "audit": "view", "assets": "view"},
}

_cache: dict[str, Any] = {"at": 0.0, "matrix": None}


def clear_cache() -> None:
    _cache.update(at=0.0, matrix=None)


def _capped(module: str, value: str) -> str:
    cap = CAPPED.get(module)
    return cap if cap and RANK[value] > RANK[cap] else value


def load(db: Session) -> dict[str, dict[str, str]]:
    """The stored matrix {role: {module: level}}, cached; a table that is missing falls back to DEFAULTS."""
    now = time.monotonic()
    if _cache["matrix"] is not None and now - _cache["at"] < CACHE_SECONDS:
        return _cache["matrix"]
    try:
        rows = db.execute(text("SELECT role, module, level FROM public.ariba_role_perms")).mappings().all()
    except Exception:  # noqa: BLE001 - an old database without the table keeps the client's defaults
        db.rollback()
        return {role: dict(levels) for role, levels in DEFAULTS.items()}
    matrix: dict[str, dict[str, str]] = {role: {} for role in EDITABLE_ROLES}
    for row in rows:
        if row["role"] in matrix and row["module"] in MODULES and row["level"] in LEVELS:
            matrix[row["role"]][row["module"]] = row["level"]
    _cache.update(at=now, matrix=matrix)
    return matrix


def levels_for(role: str | None, matrix: dict[str, dict[str, str]] | None = None) -> dict[str, str]:
    """All 19 levels of one role, with the admin rule and the permissions cap applied."""
    if role in FULL_ROLES:
        return {module: "edit" for module in MODULES}
    stored = (matrix if matrix is not None else DEFAULTS).get(role or "", {})
    return {module: _capped(module, stored.get(module, "none")) for module in MODULES}


def level(actor: dict[str, Any], module: str) -> str:
    perms = actor.get("perms")
    if perms is None:
        perms = levels_for(actor.get("role"))
    return perms.get(module, "none")


def allows(actor: dict[str, Any], modules: str | Iterable[str], need: str = "view") -> bool:
    wanted = RANK[need]
    names = (modules,) if isinstance(modules, str) else tuple(modules)
    return any(RANK.get(level(actor, module), 0) >= wanted for module in names)
