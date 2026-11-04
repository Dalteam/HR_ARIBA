"""Roles and permissions matrix (Stage 11): the levels, the admin rule, the cap, the grant rules, the routes.

Most of this runs without a database: the matrix rules live in `services/permissions.py` and the grant rules in
`canonical._role_grant`. The tests at the end need `CANONICAL_TEST_DATABASE_URL` (a throwaway copy of
`ariba_src`) and run inside a transaction that is rolled back; they also clear the matrix cache, so a changed
level never leaks into another test.
"""

from __future__ import annotations

import os

import pytest

from app.core.errors import ApiError
from app.routers import canonical
from app.routers import permissions as perm_router
from app.services import permissions as perms

needs_db = pytest.mark.skipif(
    not os.environ.get("CANONICAL_TEST_DATABASE_URL"),
    reason="Requires a disposable restored canonical PostgreSQL database",
)


def refused(exc_info, status: int, code: str) -> None:
    assert (exc_info.value.status, exc_info.value.code) == (status, code), exc_info.value.message


# ------------------------------------------------------------------------------------------- the model

def test_the_client_matrix_is_76_rows_four_roles_by_19_modules():
    assert len(perms.MODULES) == 19
    assert set(perms.DEFAULTS) == set(perms.EDITABLE_ROLES)
    assert sum(len(levels) for levels in perms.DEFAULTS.values()) == 76
    for levels in perms.DEFAULTS.values():
        assert set(levels) == set(perms.MODULES) and set(levels.values()) <= set(perms.LEVELS)


@pytest.mark.parametrize("role", ["admin", "chairman"])
def test_admin_and_chairman_always_edit_everything(role):
    assert perms.levels_for(role) == {module: "edit" for module in perms.MODULES}
    assert perms.allows({"role": role}, "permissions", "edit")


@pytest.mark.parametrize("role", ["employee", "manager", "", None, "accountant"])
def test_roles_outside_the_matrix_have_no_hr_side(role):
    assert set(perms.levels_for(role).values()) == {"none"}
    assert not perms.allows({"role": role}, perms.MODULES)


@pytest.mark.parametrize("role", ["hr", "ceo"])
def test_permissions_is_capped_at_view_even_where_the_client_gave_edit(role):
    """P1: the client's rows give hr and ceo `permissions: edit`; only admin / chairman edit the matrix."""
    assert perms.DEFAULTS[role]["permissions"] == "edit"
    assert perms.levels_for(role)["permissions"] == "view"
    assert not perms.allows({"role": role}, "permissions", "edit")


def test_any_of_several_modules_is_enough():
    finance = {"role": "finance"}
    assert not perms.allows(finance, "settings")
    assert perms.allows(finance, ("settings", "payroll"))
    assert not perms.allows(finance, ("settings", "permissions"), "edit")


def test_the_owner_answers_on_the_client_matrix():
    """Q2 (match the design): the CEO sees salaries and approves payroll; finance reads employees, no settings."""
    ceo, finance = {"role": "ceo"}, {"role": "finance"}
    assert perms.allows(ceo, "payroll") and perms.allows(ceo, "payroll_approve", "edit")
    assert not perms.allows(ceo, "payroll", "edit")
    assert perms.allows(finance, "employees") and not perms.allows(finance, "employees", "edit")
    assert not perms.allows(finance, "employees_admin") and not perms.allows(finance, "settings")


def test_an_actor_carries_its_levels():
    """`_authenticate` stores the role's levels on the actor; a stored level wins over the defaults."""
    actor = {"role": "finance", "perms": {**perms.levels_for("finance"), "employees": "none"}}
    assert not canonical._can(actor, "employees")
    with pytest.raises(ApiError) as exc:
        canonical._perm(actor, "employees")
    refused(exc, 403, "forbidden")


# --------------------------------------------------------------------------------------- P1–P3 checks

@pytest.mark.parametrize("body", [
    {"role": "admin", "module": "payroll", "level": "view"}, {"role": "chairman", "module": "payroll", "level": "view"},
    {"role": "employee", "module": "payroll", "level": "view"}, {"role": "hr", "module": "salary", "level": "view"},
    {"role": "hr", "module": "payroll", "level": "full"}, {"role": "hr", "module": "permissions", "level": "edit"},
    [], None,
])
def test_bad_matrix_changes_are_refused(body):
    with pytest.raises(ApiError) as exc:
        perm_router.matrix_change(body)
    refused(exc, 422, "validation_error")


def test_a_good_matrix_change_is_read_as_given():
    assert perm_router.matrix_change({"role": "finance", "module": "employees", "level": "none"}) == \
        ("finance", "employees", "none")
    assert perm_router.matrix_change({"role": "ceo", "module": "permissions", "level": "view"})[2] == "view"


@pytest.mark.parametrize("role", ["hr", "admin_manager", "finance", "ceo", "employee", "manager"])
def test_only_admin_and_chairman_change_the_matrix(role):
    with pytest.raises(ApiError) as exc:
        perm_router._admin({"role": role})
    refused(exc, 403, "forbidden")
    perm_router._admin({"role": "admin"})
    perm_router._admin({"role": "chairman"})


def test_who_may_grant_which_role():
    """P2: hr cannot give roles at all; the chairman gives any role but admin / chairman; admin gives all."""
    with pytest.raises(ApiError) as exc:
        canonical._role_grant({"role": "hr"}, "finance")
    refused(exc, 403, "forbidden")
    canonical._role_grant({"role": "chairman"}, "finance")
    for role in ("admin", "chairman"):
        with pytest.raises(ApiError) as exc:
            canonical._role_grant({"role": "chairman"}, role)
        refused(exc, 403, "only_admin_can_grant_admin")
        canonical._role_grant({"role": "admin"}, role)


def test_routes_are_mounted():
    from app.main import create_app

    paths = {route.path for route in create_app().routes}
    for path in ("/api/v1/permissions", "/api/v1/permissions/accounts", "/api/v1/permissions/accounts/{employee_id}",
                 "/api/v1/me/permissions"):
        assert path in paths, path


# ------------------------------------------------------------------------------------------ with a database

@pytest.fixture
def db():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    engine = create_engine(os.environ["CANONICAL_TEST_DATABASE_URL"])
    connection = engine.connect()
    outer = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    perms.clear_cache()
    try:
        yield session
    finally:
        session.close()
        outer.rollback()
        connection.close()
        engine.dispose()
        perms.clear_cache()


ADMIN = {"account_id": None, "employee_id": "10", "role": "admin", "username": "EMP010", "name_ar": "مدير"}


@needs_db
def test_the_stored_matrix_is_complete(db):
    """Four roles × 19 modules with valid levels. `ariba_src` is the client's 7 Oct snapshot: it differs from
    DEFAULTS (their 29 Oct dump) in four rows the admin changed on 14 and 27 Oct (FOLLOW_UPS #49)."""
    stored = perms.load(db)
    assert set(stored) == set(perms.EDITABLE_ROLES)
    for levels in stored.values():
        assert set(levels) == set(perms.MODULES) and set(levels.values()) <= set(perms.LEVELS)
    differing = {(r, m) for r in perms.EDITABLE_ROLES for m in perms.MODULES if stored[r][m] != perms.DEFAULTS[r][m]}
    assert differing <= {("admin_manager", "staff"), ("admin_manager", "permissions"),
                         ("ceo", "payroll_prepare"), ("ceo", "payroll_approve")}


@needs_db
def test_a_change_is_stored_audited_and_applies_at_once(db):
    from sqlalchemy import text

    assert perms.levels_for("finance", perms.load(db))["employees"] == "view"
    perm_router.set_level({"role": "finance", "module": "employees", "level": "none"}, request=None, actor=ADMIN, db=db)
    assert perms.levels_for("finance", perms.load(db))["employees"] == "none"
    audit = db.scalar(text("""SELECT count(*) FROM public.ariba_audit_log
        WHERE module='security' AND entity_id='finance.employees'"""))
    assert audit == 1
    matrix = perm_router.get_matrix(actor=ADMIN, db=db)
    assert matrix["matrix"]["finance"]["employees"] == "none" and matrix["can_edit"] is True


@needs_db
def test_the_accounts_list_and_a_role_change(db):
    from sqlalchemy import text

    listing = perm_router.list_accounts(actor=ADMIN, db=db)
    assert listing["can_grant_admin"] is True
    target = next(a for a in listing["accounts"] if a["role"] == "employee" and a["employee_id"])
    done = perm_router.set_role(target["employee_id"], {"role": "finance"}, request=None, actor=ADMIN, db=db)
    assert done["role"] == "finance" and done["accounts_updated"] >= 1
    assert db.scalar(text("SELECT role FROM public.ariba_auth_accounts WHERE id=CAST(:i AS uuid)"),
                     {"i": target["user_id"]}) == "finance"


@needs_db
def test_nobody_changes_their_own_role_and_the_last_admin_stays(db):
    from sqlalchemy import text

    me = db.execute(text("SELECT id::text AS id, employee_id FROM public.ariba_auth_accounts WHERE username='EMP010'")).mappings().one()
    actor = {**ADMIN, "account_id": me["id"]}
    with pytest.raises(ApiError) as exc:
        perm_router.set_role(me["employee_id"], {"role": "hr"}, request=None, actor=actor, db=db)
    refused(exc, 403, "own_role")
    # leave EMP010 as the only active admin, then try to demote it from another (chairman) account
    db.execute(text("UPDATE public.ariba_auth_accounts SET active=false WHERE role='admin' AND username<>'EMP010'"))
    with pytest.raises(ApiError) as exc:
        perm_router.set_role(me["employee_id"], {"role": "hr"}, request=None,
                             actor={"role": "chairman", "account_id": None, "employee_id": None}, db=db)
    refused(exc, 409, "last_admin")
