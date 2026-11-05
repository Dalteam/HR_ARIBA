"""Small settings saves (Stage 16): brand colours, punch logo, letterhead, greeting texts, mailboxes.

The field checks run without a database. The tests at the end need `CANONICAL_TEST_DATABASE_URL` (a throwaway copy
of `ariba_src`) and run inside a transaction that is rolled back.
"""

from __future__ import annotations

import os
from datetime import date

import pytest

from app.core.errors import ApiError
from app.routers import settings_extra as se

needs_db = pytest.mark.skipif(
    not os.environ.get("CANONICAL_TEST_DATABASE_URL"),
    reason="Requires a disposable restored canonical PostgreSQL database",
)

PNG = "data:image/png;base64,iVBORw0KGgo="


def refused(exc_info, status: int, code: str) -> None:
    assert (exc_info.value.status, exc_info.value.code) == (status, code), exc_info.value.message


# ------------------------------------------------------------------------------------------- without a database

def test_colours_are_hex_only_and_a_reset_is_a_reset():
    assert se.colours_in({"p": "#004D3D", "s": "#f4f0e4"}) == {"p": "#004d3d", "s": "#f4f0e4", "a": ""}
    assert se.colours_in({"reset": True, "p": "x"}) == {"reset": True}
    for bad in ({"p": "green", "s": "#fff"}, {"p": "#fff"}, {"p": "#fff", "s": "#fff", "a": "url(x)"}, []):
        with pytest.raises(ApiError) as exc:
            se.colours_in(bad)
        refused(exc, 422, "validation_error")


def test_images_are_raster_data_uris_within_the_cap():
    assert se._image("", "x", 10) == "" and se._image(PNG, "x", 100) == PNG
    for bad in ("data:image/svg+xml;base64,PHN2Zz4=", "https://example.com/a.png", PNG + "A" * 200, 5):
        with pytest.raises(ApiError):
            se._image(bad, "x", 100)


def test_the_letterhead_modes_and_margins():
    assert se.letterhead_in({"mode": "default"})["mode"] == "default"
    page = se.letterhead_in({"mode": "page", "page": PNG, "top": 40, "bottom": 25, "head": PNG})
    assert (page["page"], page["head"], page["top"], page["bottom"]) == (PNG, "", 40, 25)
    preset = se.letterhead_in({"mode": "hf", "preset": "ariba", "head": PNG})
    assert preset["preset"] == "ariba" and preset["head"] == ""
    for bad in ({"mode": "poster"}, {"mode": "page", "top": 121}, {"mode": "hf", "head": "javascript:x"}):
        with pytest.raises(ApiError) as exc:
            se.letterhead_in(bad)
        refused(exc, 422, "validation_error")


def test_greeting_texts_are_bounded_and_default_to_empty():
    assert se.templates_in({}) == {"birthday": {"t": "", "b": ""}, "anniversary": {"t": "", "b": ""}}
    got = se.templates_in({"birthday": {"t": " كل عام وأنت بخير يا {name} ", "b": "نص"}})
    assert got["birthday"] == {"t": "كل عام وأنت بخير يا {name}", "b": "نص"}
    with pytest.raises(ApiError):
        se.templates_in({"birthday": {"t": "x" * 201}})


def test_a_mailbox_never_takes_a_password():
    good = {"host": "smtp.office365.com", "port": 587, "from_email": "hr@ariba.com.sa", "username": "hr@ariba.com.sa"}
    assert se.mail_in(good)["port"] == 587
    for bad in ({**good, "password": "x"}, {**good, "host": "smtp server"}, {**good, "port": 0},
                {**good, "from_email": "nobody"}):
        with pytest.raises(ApiError) as exc:
            se.mail_in(bad)
        refused(exc, 422, "validation_error")


def test_routes_are_mounted():
    from app.main import create_app

    paths = {route.path for route in create_app().routes}
    for path in ("/api/v1/settings/brand-colors", "/api/v1/settings/punch-logo", "/api/v1/settings/letterhead",
                 "/api/v1/settings/greeting-templates", "/api/v1/settings/mail/{scope}",
                 "/api/v1/settings/schedule", "/api/v1/settings/leave-rules"):
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
    try:
        yield session
    finally:
        session.close()
        outer.rollback()
        connection.close()
        engine.dispose()


ADMIN = {"account_id": None, "employee_id": "10", "role": "admin", "username": "EMP010", "name_ar": "مدير"}
CEO = {"account_id": None, "employee_id": "86", "role": "ceo", "username": "EMP086", "name_ar": "تنفيذي"}


@needs_db
def test_saved_colours_and_logo_reach_the_public_brand(db):
    from app.services import brand

    se.put_colours({"p": "#123456", "s": "#abcdef"}, request=None, actor=ADMIN, db=db)
    se.put_punch({"data": PNG}, request=None, actor=ADMIN, db=db)
    answer = brand.payload(db)
    assert answer["brand"]["p"] == "#123456" and answer["brand"]["punch"] == PNG
    with pytest.raises(ApiError) as exc:  # the CEO reads settings, it does not change them
        se.put_colours({"p": "#000000", "s": "#ffffff"}, request=None, actor=CEO, db=db)
    refused(exc, 403, "forbidden")


@needs_db
def test_the_saved_letterhead_reads_back_and_the_mailbox_keeps_no_password(db):
    from sqlalchemy import text

    assert se.get_letterhead(actor=CEO, db=db)["mode"] in (None, "default", "page", "hf")  # ariba_src holds a page one
    se.put_letterhead({"mode": "hf", "preset": "ariba"}, request=None, actor=ADMIN, db=db)
    assert se.get_letterhead(actor=CEO, db=db)["preset"] == "ariba"
    se.put_mail("company", {"host": "smtp.office365.com", "port": 587, "from_email": "hr@ariba.com.sa"},
                request=None, actor=ADMIN, db=db)
    row = db.execute(text("SELECT provider, password_enc FROM public.ariba_mail_accounts WHERE owner='company'")).one()
    assert row.provider == "smtp" and row.password_enc is None
    assert se.get_mail("mine", actor=CEO, db=db)["configured"] is False


@needs_db
def test_saved_greeting_texts_are_used_on_the_day(db):
    from sqlalchemy import text

    from app.services import announcements as ann

    emp = db.scalar(text("SELECT employee_id FROM public.employee_directory WHERE active ORDER BY employee_id LIMIT 1"))
    today = date(2026, 11, 5)
    db.execute(text("UPDATE public.employee_directory SET dob=:d WHERE employee_id=:e"), {"d": date(1990, 11, 5), "e": emp})
    db.execute(text("DELETE FROM public.ariba_app_settings WHERE key='occasions_auto'"))
    db.execute(text("""INSERT INTO public.ariba_app_settings(key, value, updated_at)
        VALUES ('occasions_auto', '{"enabled": true, "birthday": true}', now())"""))
    se.put_templates({"birthday": {"t": "عيد سعيد يا {name}", "b": "من فريق الموارد البشرية"}}, request=None,
                     actor=ADMIN, db=db)
    assert ann.run_auto(db, today) >= 1
    title = db.scalar(text("""SELECT title FROM public.ariba_announcements WHERE auto_key=:k"""),
                      {"k": f"birthday:{emp}:{today.year}"})
    assert title.startswith("عيد سعيد يا ") and "{name}" not in title
