"""Stage 22: automatic registration of candidates (the design's CandAuto + `candidate_auto`, owner 5 Nov 2026).

Off by default; while HR has switched it on, POST /candidates/auto/run turns every new candidate into an employee
with the chosen employer / department / contract nature, the job applied for, today's date and the expected
salary, exactly as «قبول» does. The database tests run inside a transaction that is rolled back (savepoints, so the
route's own commits stay inside it).
"""

from __future__ import annotations

import json
import os
import random
import uuid

import pytest

from app.core.errors import ApiError
from app.core.scheduling import today_riyadh
from app.main import app
from app.routers import canonical, candidates

needs_db = pytest.mark.skipif(
    not os.environ.get("CANONICAL_TEST_DATABASE_URL"),
    reason="Requires a disposable restored canonical PostgreSQL database",
)

CFG = {"on": True, "employer": "Ariba", "department": "التشغيل", "nature": "indefinite"}


# ------------------------------------------------------------------------------------------ without a database
def test_the_routes_are_mounted():
    paths = {(r.path, m) for r in app.routes for m in getattr(r, "methods", ())}
    for p, m in (("/api/v1/candidates/auto", "GET"), ("/api/v1/candidates/auto", "PUT"), ("/api/v1/candidates/auto/run", "POST")):
        assert (p, m) in paths


def test_the_employee_body_follows_the_accept_dialog():
    body = candidates.auto_employee({"nameAr": " سارة ", "nameEn": "", "position": "محاسبة", "expectedSalary": "8,500",
                                     "idNo": "2123456789", "mobile": "0500000000"}, CFG, "2026-11-05")
    assert body["name_ar"] == "سارة" and body["name_en"] is None
    assert (body["workplace_id"], body["department_id"], body["job_title"]) == ("Ariba", "التشغيل", "محاسبة")
    assert (body["join_date"], body["basic_salary"], body["contract_nature"]) == ("2026-11-05", 8500.0, "indefinite")
    assert body["contract_duration_months"] is None and body["national_id"] == "2123456789"


def test_a_fixed_contract_is_twelve_months_and_a_bad_salary_is_zero():
    body = candidates.auto_employee({"nameAr": "x", "expectedSalary": "حسب الخبرة"}, {**CFG, "nature": "fixed", "department": ""}, "2026-11-05")
    assert (body["contract_nature"], body["contract_duration_months"], body["basic_salary"]) == ("fixed", 12, 0.0)
    assert body["department_id"] is None


# ------------------------------------------------------------------------------------------ with a database
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


HR = {"account_id": None, "employee_id": "40", "role": "hr", "username": "EMP040", "name_ar": "موارد"}
EMPLOYEE = {"account_id": None, "employee_id": "102", "role": "employee", "username": "EMP102", "name_ar": "موظف"}


def _employer(db) -> str:
    from sqlalchemy import text

    return db.scalar(text("SELECT name FROM public.employers ORDER BY id LIMIT 1"))


def _candidate(db, data: dict, *, employee_id: str | None = None, with_file: bool = True) -> str:
    from sqlalchemy import text

    cid = str(uuid.uuid4())
    db.execute(text("""INSERT INTO public.ariba_candidates(id, ref_token, data, status, source, submitted_at, employee_id)
        VALUES (CAST(:id AS uuid), :ref, CAST(:data AS jsonb), 'new', 'public', now() - interval '1 hour', :e)"""),
               {"id": cid, "ref": uuid.uuid4().hex[:24], "data": json.dumps(data), "e": employee_id})
    if with_file:
        column = candidates._file_column(db)
        db.execute(text(f"""INSERT INTO public.ariba_candidate_files(candidate_id, {column}, file_name, mime_type, file_data)
            VALUES (CAST(:id AS uuid), 'cv', 'cv.pdf', 'application/pdf', 'pdf')"""), {"id": cid})
    db.commit()
    return cid


def _status(db, cid: str) -> tuple[str, str | None]:
    from sqlalchemy import text

    row = db.execute(text("SELECT status, employee_id FROM public.ariba_candidates WHERE id=CAST(:id AS uuid)"), {"id": cid}).one()
    return row[0], row[1]


def _turn_on(db, **over) -> dict:
    return candidates.set_auto({**CFG, "employer": _employer(db), "department": "", **over}, request=None, actor=HR, db=db)


def _id_no() -> str:
    return "2" + "".join(random.choice("0123456789") for _ in range(9))


@needs_db
def test_the_switch_is_off_until_hr_turns_it_on(db):
    from sqlalchemy import text

    db.execute(text("DELETE FROM public.ariba_app_settings WHERE key='candidate_auto'"))
    assert candidates.get_auto(actor=HR, db=db)["on"] is False
    cid = _candidate(db, {"nameAr": "مرشح الاختبار", "idNo": _id_no()})
    assert candidates.run_auto(request=None, actor=HR, db=db) == {"on": False, "registered": 0, "failed": []}
    assert _status(db, cid) == ("new", None)


@needs_db
def test_the_settings_are_checked(db):
    with pytest.raises(ApiError) as e:
        candidates.set_auto({"on": True, "employer": ""}, request=None, actor=HR, db=db)
    assert e.value.status == 422
    for bad in ({"employer": "لا توجد جهة بهذا الاسم"}, {"department": "لا يوجد قسم بهذا الاسم"}, {"nature": "monthly"}):
        with pytest.raises(ApiError) as e:
            _turn_on(db, **bad)
        assert e.value.status == 422
    with pytest.raises(ApiError) as e:
        candidates.set_auto({**CFG, "employer": _employer(db)}, request=None, actor=EMPLOYEE, db=db)
    assert e.value.status == 403


@needs_db
def test_a_run_registers_each_new_candidate_once(db):
    from sqlalchemy import text

    _turn_on(db)
    cid = _candidate(db, {"nameAr": "مرشحة تلقائية", "position": "محاسبة", "expectedSalary": "7000", "idNo": _id_no()})
    done = candidates.run_auto(request=None, actor=HR, db=db)
    mine = [x for x in done["employees"] if x["candidate_id"] == cid]
    assert len(mine) == 1
    emp = mine[0]["employee_id"]
    assert _status(db, cid) == ("accepted", emp)
    row = canonical.employee_detail(emp, actor=HR, db=db)
    assert row["name_ar"] == "مرشحة تلقائية" and str(row["join_date"])[:10] == today_riyadh().isoformat()
    assert row["job_title"] == "محاسبة" and float(row["salary"]["basic_salary"]) == 7000
    assert db.scalar(text("SELECT count(*) FROM public.ariba_documents WHERE employee_id=:e AND file_name='cv.pdf'"), {"e": emp}) == 1
    assert db.scalar(text("""SELECT count(*) FROM public.ariba_audit_log WHERE action='candidate_accept'
        AND entity_id=:id AND summary='تسجيل تلقائي لمرشح كموظف'"""), {"id": cid}) == 1
    again = candidates.run_auto(request=None, actor=HR, db=db)
    assert all(x["candidate_id"] != cid for x in again["employees"])


@needs_db
def test_a_refused_candidate_stays_new_for_hr(db):
    _turn_on(db)
    cid = _candidate(db, {"nameEn": "No Arabic Name", "idNo": _id_no()}, with_file=False)
    done = candidates.run_auto(request=None, actor=HR, db=db)
    assert any(x["candidate_id"] == cid for x in done["failed"])
    assert _status(db, cid) == ("new", None)


@needs_db
def test_a_candidate_already_tied_to_an_employee_is_left_alone(db):
    _turn_on(db)
    cid = _candidate(db, {"nameAr": "نصف مسجّل", "idNo": _id_no()}, employee_id="40")
    done = candidates.run_auto(request=None, actor=HR, db=db)
    assert all(x["candidate_id"] != cid for x in done["employees"] + done["failed"])
    assert _status(db, cid) == ("new", "40")


@needs_db
def test_the_manual_accept_still_works(db):
    cid = _candidate(db, {"nameAr": "قبول يدوي", "idNo": _id_no()})
    body = {"employee": candidates.auto_employee({"nameAr": "قبول يدوي"}, {**CFG, "employer": _employer(db), "department": ""},
                                                 today_riyadh().isoformat()), "note": "يدوي"}
    done = candidates.accept_candidate(cid, body, request=None, actor=HR, db=db)
    assert done["status"] == "accepted" and done["moved"] == 1
    assert _status(db, cid) == ("accepted", done["employee_id"])
