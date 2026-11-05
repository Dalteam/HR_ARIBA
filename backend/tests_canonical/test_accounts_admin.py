"""Accounts (Stage 18): delete an employee into the recycle bin and back, and the temporary-password list.

Needs `CANONICAL_TEST_DATABASE_URL` (a throwaway copy of `ariba_src`, migrations 005-007) for the round trip; it runs
inside a transaction that is rolled back.
"""

from __future__ import annotations

import os

import pytest

from app.core.errors import ApiError
from app.routers import accounts_admin, recycle_bin
from app.services import employee_delete

needs_db = pytest.mark.skipif(
    not os.environ.get("CANONICAL_TEST_DATABASE_URL"),
    reason="Requires a disposable restored canonical PostgreSQL database",
)


def test_the_restore_knows_every_table_the_delete_takes():
    tables = [t for t, _ in employee_delete.EXTRAS]
    assert len(tables) == len(set(tables))
    assert "permissions" in tables and "ariba_doc_signing" in tables  # both point at requests: restored after them


def test_routes_are_mounted():
    from app.main import create_app

    paths = {(route.path, tuple(sorted(route.methods))) for route in create_app().routes if hasattr(route, "methods")}
    assert ("/api/v1/employees/{employee_id}", ("DELETE",)) in paths
    assert ("/api/v1/accounts/temporary-password", ("GET",)) in paths


@pytest.fixture
def db():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    engine = create_engine(os.environ["CANONICAL_TEST_DATABASE_URL"])
    connection = engine.connect()
    outer = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        outer.rollback()
        connection.close()
        engine.dispose()


ADMIN = {"account_id": None, "employee_id": "10", "role": "admin", "username": "EMP010", "name_ar": "مدير"}
FINANCE = {"account_id": None, "employee_id": "15", "role": "finance", "username": "EMP015", "name_ar": "مالية"}

COUNTS = {
    "employee_directory": "employee_id", "ariba_auth_accounts": "employee_id", "workflow_requests": "employee_id",
    "leave_requests": "employee_id", "attendance": "employee_id", "employee_payrolls": "employee_id",
    "ariba_documents": "employee_id",
}


def _counts(db, emp: str) -> dict[str, int]:
    from sqlalchemy import text

    return {t: db.scalar(text(f"SELECT count(*) FROM public.{t} WHERE {c}=:e"), {"e": emp}) for t, c in COUNTS.items()}


def _free_employee(db) -> str:
    """An active employee nobody else's data points at, with as much of their own data as possible."""
    from sqlalchemy import text

    for (emp,) in db.execute(text("""SELECT d.employee_id FROM public.employee_directory d WHERE d.active
            ORDER BY (SELECT count(*) FROM public.attendance a WHERE a.employee_id=d.employee_id) DESC""")).all():
        if emp != ADMIN["employee_id"] and not employee_delete.blockers(db, emp):
            return emp
    pytest.skip("no employee free of links in this copy")


@needs_db
def test_delete_then_restore_puts_every_row_back(db):
    from sqlalchemy import text

    emp = _free_employee(db)
    db.execute(text("""INSERT INTO public.ariba_documents(employee_id, document_type, file_name, mime_type, file_data)
        VALUES (:e, 'cv', 'cv.pdf', 'application/pdf', 'abc')"""), {"e": emp})
    before = _counts(db, emp)
    done = accounts_admin.delete_employee(emp, request=None, actor=ADMIN, db=db)
    assert done["in_bin"] is True
    assert all(v == 0 for v in _counts(db, emp).values())
    item = db.scalar(text("SELECT id FROM public.ariba_deleted_items WHERE kind='employee' AND ref_id=:e"), {"e": emp})
    recycle_bin.bin_restore(str(item), request=None, actor=ADMIN, db=db)
    assert _counts(db, emp) == before
    assert db.scalar(text("SELECT encode(file_data,'escape') FROM public.ariba_documents WHERE employee_id=:e AND file_name='cv.pdf'"),
                     {"e": emp}) == "abc"


@needs_db
def test_a_linked_employee_is_refused_with_the_reasons(db):
    from sqlalchemy import text

    manager = db.scalar(text("""SELECT manager_id FROM public.employee_directory
        WHERE manager_id IS NOT NULL AND manager_id<>employee_id AND manager_id<>:me LIMIT 1"""), {"me": ADMIN["employee_id"]})
    with pytest.raises(ApiError) as exc:
        accounts_admin.delete_employee(manager, request=None, actor=ADMIN, db=db)
    assert (exc.value.status, exc.value.code) == (409, "employee_linked") and exc.value.details["reasons"]
    with pytest.raises(ApiError) as exc:
        accounts_admin.delete_employee(ADMIN["employee_id"], request=None, actor=ADMIN, db=db)
    assert exc.value.status == 403
    with pytest.raises(ApiError) as exc:
        accounts_admin.delete_employee(_free_employee(db), request=None, actor=FINANCE, db=db)
    assert exc.value.status == 403
    with pytest.raises(ApiError) as exc:
        accounts_admin.delete_employee("no-such-person", request=None, actor=ADMIN, db=db)
    assert exc.value.status == 404


@needs_db
def test_the_temporary_password_list_shows_names_never_passwords(db):
    from sqlalchemy import text

    db.execute(text("UPDATE public.ariba_auth_accounts SET must_change=true WHERE username='EMP002'"))
    rows = accounts_admin.temporary_password_accounts(actor=ADMIN, db=db)
    assert any(r["username"] == "EMP002" for r in rows)
    assert all("password" not in k for r in rows for k in r)
