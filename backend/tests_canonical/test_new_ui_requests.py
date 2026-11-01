"""The employee app's request envelope: `POST /me/requests` the way the new screens call it.

Every body in this file is one the app actually sends — `submitRequest` in
`frontend/employee-app/src/lib/port.ts` posts `{type, payload, attachment}`, `toPayload` in
`src/components/composer.tsx` names the fields, and `overtime.tsx` still posts the flat body when no
file is picked. A change that breaks those screens fails here without a device.

The flat legacy body has to keep working too: `tools/smoke/api_smoke.py` and the original screens
post the same fields flat, so both shapes are compared on the payload that reaches the database.
"""

from __future__ import annotations

import base64
import json
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.core.errors import ApiError
from app.routers import canonical as canonical_router
from app.services.request_envelope import RequestInput, attachment_limit

PDF = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 24
ACTOR = {"employee_id": "emp-1", "account_id": uuid.uuid4(), "role": "employee"}


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


class RecordingDB:
    """The session calls `submit_request` uses; nothing is written anywhere."""

    def __init__(self):
        self.statements: list[tuple[str, dict]] = []
        self.commits = 0

    def execute(self, statement, params=None):
        self.statements.append((" ".join(str(statement).split()), params or {}))
        return SimpleNamespace(rowcount=1)

    def commit(self):
        self.commits += 1

    def written(self, needle: str) -> list[tuple[str, dict]]:
        return [(sql, params) for sql, params in self.statements if needle in sql]


def harness(monkeypatch, *, manager_id: str | None = "mgr-1", config: dict | None = None):
    """`submit_request` with the database replaced by RecordingDB.

    `manager_id=None` is the employee without a direct manager (the legacy "straight to HR" case),
    `config` is the stored `ariba_app_settings['workflow_config']`.
    """
    db = RecordingDB()
    request_id = uuid.uuid4()
    employee = {"employee_id": "emp-1", "manager_id": manager_id, "name_ar": "Example", "data": {}}
    book = SimpleNamespace(count_workdays=lambda *_args: 2, current=lambda *_args: 30)

    def fake_row(_db, sql, **params):
        if "INSERT INTO public.workflow_requests" in sql:
            db.statements.append((" ".join(sql.split()), params))  # the row the router reads back
            return {"id": request_id, "employee_id": params.get("eid"), "request_type": params.get("type"),
                    "current_stage": params.get("stage"), "status": "pending", "reject_reason": None,
                    "payload": json.loads(params.get("payload") or "{}"),
                    "created_at": datetime.now(timezone.utc)}
        if "SELECT employee_id FROM public.workflow_requests WHERE id=:r" in sql:  # attachment ownership
            return {"employee_id": "emp-1"}
        if "FROM public.ariba_app_settings" in sql:
            return {"value": config} if config is not None else None
        return None

    monkeypatch.setattr(canonical_router, "_employee_scope", lambda *_a, **_k: employee)
    monkeypatch.setattr(canonical_router, "_require_lookup", lambda *_a, **_k: None)
    monkeypatch.setattr(canonical_router, "_row", fake_row)
    monkeypatch.setattr(canonical_router, "_rows", lambda *_a, **_k: [])
    monkeypatch.setattr(canonical_router, "_insert_notification", lambda *_a, **_k: None)
    monkeypatch.setattr(canonical_router, "_notify_stage", lambda *_a, **_k: None)
    monkeypatch.setattr(canonical_router, "_write_audit", lambda *_a, **_k: None)
    monkeypatch.setattr(canonical_router, "_me_requests_out",
                        lambda _db, rows: [{**rows[0], "id": str(rows[0]["id"])}])
    monkeypatch.setattr(canonical_router.cdata, "employees", lambda *_a, **_k: [SimpleNamespace(id="emp-1")])
    monkeypatch.setattr(canonical_router.cdata, "leave_book", lambda *_a, **_k: book)
    return db, request_id


def submit(db, body):
    return canonical_router.submit_request(body, request=None, actor=dict(ACTOR), db=db)


def stored_payload(db) -> dict:
    """The JSON `workflow_requests.payload` the router wrote, without the submission stamp."""
    (_, params), = db.written("INSERT INTO public.workflow_requests")
    payload = json.loads(params["payload"])
    payload.pop("submitted_at", None)
    payload.pop("submitted_from", None)
    return payload


def stored_stage(db) -> str:
    (_, params), = db.written("INSERT INTO public.workflow_requests")
    return params["stage"]


# --------------------------------------------------------------------------- both shapes, one request
def test_unpaid_leave_envelope_and_flat_body_store_the_same_request(monkeypatch):
    # port.ts: submitRequest("unpaid", { from, to, days, notes }) — it re-adds `type` inside payload
    db, request_id = harness(monkeypatch)
    response = submit(db, {"type": "unpaid",
                           "payload": {"from": "2026-11-02", "to": "2026-11-04", "days": 3,
                                       "notes": "سفر", "type": "unpaid"}})
    envelope = stored_payload(db)
    assert response["id"] == str(request_id)
    assert envelope == {"notes": "سفر", "from": "2026-11-02", "to": "2026-11-04", "days": 3}
    (_, leave), = db.written("INSERT INTO public.leave_requests")
    assert leave["days"] == 3 and leave["rid"] == request_id and leave["f"].isoformat() == "2026-11-02"
    assert db.commits == 1

    # the original flat body: same request, same payload
    db, _ = harness(monkeypatch)
    submit(db, {"type": "unpaid", "from_date": "2026-11-02", "to_date": "2026-11-04", "notes": "سفر"})
    assert stored_payload(db) == envelope


def test_annual_with_an_attachment_uses_the_flat_screen_fields_in_the_envelope(monkeypatch):
    # composer.tsx `toPayload`: an annual leave with a file goes as {from, to, notes} + attachment
    db, _ = harness(monkeypatch)
    submit(db, {"type": "annual",
                "payload": {"from": "2026-11-02", "to": "2026-11-03", "notes": "ظرف", "type": "annual"},
                "attachment": {"name": "report.pdf", "mime": "application/pdf", "data": b64(PDF)}})
    payload = stored_payload(db)
    assert payload["from"] == "2026-11-02" and payload["to"] == "2026-11-03"
    assert payload["days"] == 2  # workdays from cdata.leave_book, as the flat body did
    (_, doc), = db.written("INSERT INTO public.ariba_documents")
    assert doc["dtype"] == "employee_upload" and doc["eid"] == "emp-1" and doc["mime"] == "application/pdf"


def test_unpaid_leave_requires_the_reason_the_composer_marks_mandatory(monkeypatch):
    db, _ = harness(monkeypatch)
    with pytest.raises(ApiError) as err:
        submit(db, {"type": "unpaid", "payload": {"from": "2026-11-02", "to": "2026-11-03"}})
    assert err.value.status == 422
    assert not db.statements  # nothing written


# --------------------------------------------------------------------------- the values the screens send
def test_overtime_keeps_the_hours_from_either_body(monkeypatch):
    db, _ = harness(monkeypatch)
    submit(db, {"type": "overtime", "payload": {"date": "2026-11-02", "hours": 2.5, "notes": "تغطية"}})
    assert stored_payload(db) == {"notes": "تغطية", "date": "2026-11-02", "hours": 2.5}

    # overtime.tsx without a file: requests.submit({ on_date, hours: "3" }) — a string, flat
    db, _ = harness(monkeypatch)
    submit(db, {"type": "overtime", "on_date": "2026-11-02", "hours": "3", "notes": "تغطية"})
    assert stored_payload(db)["hours"] == 3.0

    # toPayload names it `dur` once the request carries a file
    db, _ = harness(monkeypatch)
    submit(db, {"type": "overtime", "payload": {"date": "2026-11-02", "dur": 1.5, "notes": "تغطية"}})
    assert stored_payload(db)["hours"] == 1.5

    db, _ = harness(monkeypatch)
    with pytest.raises(ApiError) as err:
        submit(db, {"type": "overtime", "payload": {"date": "2026-11-02", "hours": 0.25}})
    assert err.value.status == 422 and not db.statements


def test_hourly_permission_keeps_its_duration(monkeypatch):
    db, _ = harness(monkeypatch)
    submit(db, {"type": "permission", "payload": {"date": "2026-11-02", "time": "09:15", "dur": 2,
                                                  "notes": "موعد"}})
    assert stored_payload(db) == {"notes": "موعد", "date": "2026-11-02", "time": "09:15", "dur": 2.0}
    (_, permission), = db.written("INSERT INTO public.permissions")
    assert permission["dur"] == 2.0 and permission["time"] == "09:15"


def test_salary_advance_keeps_its_amount_and_requires_a_reason(monkeypatch):
    db, _ = harness(monkeypatch)
    submit(db, {"type": "salary_advance", "payload": {"amount": 1500, "notes": "علاج"}})
    assert stored_payload(db) == {"notes": "علاج", "amount": 1500.0}

    db, _ = harness(monkeypatch)
    with pytest.raises(ApiError) as err:
        submit(db, {"type": "salary_advance", "payload": {"amount": 1500}})
    assert err.value.status == 422 and not db.statements


# --------------------------------------------------------------------------- the flat body of every existing type
def _two_days_ago() -> str:
    """A forgot-punch date that is never in the future in Riyadh, whichever timezone the test runs in."""
    return (datetime.now(timezone.utc).date() - timedelta(days=2)).isoformat()


FLAT_CASES = [
    # (the flat body the original screens / api_smoke post, the payload it must store, the stage it stops at)
    ("annual", {"type": "annual", "from_date": "2026-12-01", "to_date": "2026-12-02", "notes": "إجازة"},
     {"notes": "إجازة", "from": "2026-12-01", "to": "2026-12-02", "days": 2}, "manager"),
    ("sick", {"type": "sick", "from_date": "2026-12-01", "to_date": "2026-12-03", "notes": "مرض"},
     {"notes": "مرض", "from": "2026-12-01", "to": "2026-12-03", "days": 3}, "manager"),
    ("mission", {"type": "mission", "from_date": "2026-12-05", "to_date": "2026-12-06", "notes": "مهمة"},
     {"notes": "مهمة", "from": "2026-12-05", "to": "2026-12-06", "days": 2}, "manager"),
    ("permission", {"type": "permission", "on_date": "2026-11-02", "time_from": "09:00", "hours": "2", "notes": "موعد"},
     {"notes": "موعد", "date": "2026-11-02", "time": "09:00", "dur": 2.0}, "manager"),
    ("early_leave", {"type": "early_leave", "on_date": "2026-11-03", "time_from": "14:00", "hours": "1", "notes": "خروج"},
     {"notes": "خروج", "date": "2026-11-03", "time": "14:00", "dur": 1.0}, "manager"),
    ("advance", {"type": "advance", "amount": "1500", "notes": "سلفة"},
     {"notes": "سلفة", "amount": 1500.0}, "manager"),
    ("overtime", {"type": "overtime", "on_date": "2026-11-20", "hours": "2", "notes": "إضافي"},
     {"notes": "إضافي", "date": "2026-11-20", "hours": 2.0}, "manager"),
    ("forgot_punch", {"type": "forgot_punch", "punch_kind": "in", "on_date": _two_days_ago(), "time_from": "08:00",
                      "notes": "نسيان"},
     {"notes": "نسيان", "kind": "in", "date": _two_days_ago(), "time": "08:00"}, "hr"),
]


@pytest.mark.parametrize("req_type, body, expected, stage", FLAT_CASES, ids=[c[0] for c in FLAT_CASES])
def test_the_flat_body_of_an_existing_type_stores_the_same_request(monkeypatch, req_type, body, expected, stage):
    """The original screens, `overtime.tsx` without a file and `api_smoke.py` post these flat bodies."""
    db, request_id = harness(monkeypatch)
    response = submit(db, body)
    assert stored_payload(db) == expected
    assert stored_stage(db) == stage
    assert response["id"] == str(request_id)
    assert (response["request_type"], response["current_stage"], response["status"]) == (req_type, stage, "pending")


# --------------------------------------------------------------------------- the five new screens
def test_iban_change_stores_the_bank_certificate_under_the_employee(monkeypatch):
    db, request_id = harness(monkeypatch)
    submit(db, {"type": "iban_change",
                "payload": {"iban": "SA03 8000 0000 6080 1016 7519", "bank": "Al Rajhi",
                            "account_no": "608010167519", "letter_html": "<html>خطاب</html>"},
                "attachment": {"name": "cert.pdf", "mime": "application/pdf", "data": b64(PDF)}})
    payload = stored_payload(db)
    assert payload["iban"] == "SA0380000000608010167519"  # spaces and case normalised
    assert payload["bank"] == "Al Rajhi" and payload["account_no"] == "608010167519"
    (_, doc), = db.written("INSERT INTO public.ariba_documents")
    assert doc["dtype"] == "iban_certificate" and doc["rid"] == request_id and doc["eid"] == "emp-1"


def test_iban_change_refuses_a_missing_certificate_or_a_bad_iban(monkeypatch):
    db, _ = harness(monkeypatch)
    with pytest.raises(ApiError) as err:
        submit(db, {"type": "iban_change",
                    "payload": {"iban": "SA0380000000608010167519", "bank": "Al Rajhi", "account_no": "1"}})
    assert err.value.status == 422 and "شهادة" in err.value.message
    assert not db.statements

    db, _ = harness(monkeypatch)
    with pytest.raises(ApiError) as err:
        submit(db, {"type": "iban_change",
                    "payload": {"iban": "SA12", "bank": "Al Rajhi", "account_no": "1"},
                    "attachment": {"name": "cert.pdf", "mime": "application/pdf", "data": b64(PDF)}})
    assert err.value.status == 422
    assert not db.written("INSERT INTO public.workflow_requests")


def test_iban_change_refuses_an_oversized_letter(monkeypatch):
    db, _ = harness(monkeypatch)
    with pytest.raises(ApiError) as err:
        submit(db, {"type": "iban_change",
                    "payload": {"iban": "SA0380000000608010167519", "bank": "Al Rajhi", "account_no": "1",
                                "letter_html": "x" * 200_001},
                    "attachment": {"name": "cert.pdf", "mime": "application/pdf", "data": b64(PDF)}})
    assert err.value.status == 422 and not db.statements


def test_profile_edit_accepts_only_the_employee_fields(monkeypatch):
    db, _ = harness(monkeypatch)
    submit(db, {"type": "profile_edit",
                "payload": {"changes": {"mobile": " 0500000000 ", "email": "a@b.co"}},
                "attachment": {"name": "id.png", "mime": "image/png", "data": b64(PNG)}})
    assert stored_payload(db)["changes"] == {"mobile": "0500000000", "email": "a@b.co"}
    (_, doc), = db.written("INSERT INTO public.ariba_documents")
    assert doc["dtype"] == "profile_edit"

    db, _ = harness(monkeypatch)
    with pytest.raises(ApiError) as err:
        submit(db, {"type": "profile_edit", "payload": {"changes": {"salaryTotal": 9000}}})
    assert err.value.status == 422 and "salaryTotal" in err.value.message

    db, _ = harness(monkeypatch)
    with pytest.raises(ApiError) as err:
        submit(db, {"type": "profile_edit", "payload": {"changes": {"mobile": "  "}}})
    assert err.value.status == 422 and not db.statements


def test_document_upload_keeps_its_type_and_needs_a_file(monkeypatch):
    db, _ = harness(monkeypatch)
    submit(db, {"type": "document",
                "payload": {"doc_type": "iqama", "doc_label": "هوية", "notes": "تجديد"},
                "attachment": {"name": "iqama.jpg", "mime": "image/jpeg",
                               "data": b64(b"\xff\xd8\xff" + b"\x00" * 16)}})
    assert stored_payload(db)["doc_type"] == "iqama"
    (_, doc), = db.written("INSERT INTO public.ariba_documents")
    assert doc["dtype"] == "iqama" and doc["mime"] == "image/jpeg"

    db, _ = harness(monkeypatch)
    with pytest.raises(ApiError) as err:
        submit(db, {"type": "document", "payload": {"doc_type": "iqama", "doc_label": "هوية"}})
    assert err.value.status == 422 and not db.statements


def test_document_upload_checks_the_type_against_the_lookup_table(monkeypatch):
    db, _ = harness(monkeypatch)

    def lookup(_db, table, value, _label):
        if table == "document_types" and value == "nope":
            raise ApiError(422, "invalid_lookup", "Unknown document type")

    monkeypatch.setattr(canonical_router, "_require_lookup", lookup)
    with pytest.raises(ApiError) as err:
        submit(db, {"type": "document", "payload": {"doc_type": "nope"},
                    "attachment": {"name": "a.pdf", "mime": "application/pdf", "data": b64(PDF)}})
    assert err.value.status == 422 and not db.statements


def test_an_unknown_request_type_is_refused(monkeypatch):
    db, _ = harness(monkeypatch)
    with pytest.raises(ApiError) as err:
        submit(db, {"type": "bonus", "payload": {"amount": 1}})
    assert err.value.status == 422 and not db.statements


# --------------------------------------------------------------------------- ownership
@pytest.mark.parametrize("body", [
    {"type": "unpaid", "payload": {"from": "2026-11-02", "to": "2026-11-03", "notes": "سفر",
                                   "employee_id": "emp-2"}},
    {"type": "unpaid", "from_date": "2026-11-02", "to_date": "2026-11-03", "notes": "سفر",
     "employee_id": "emp-2"},
])
def test_a_request_cannot_name_another_employee(monkeypatch, body):
    db, _ = harness(monkeypatch)
    with pytest.raises(ApiError) as err:
        submit(db, body)
    assert err.value.status == 403
    assert not db.statements  # refused before any row


def test_a_request_may_repeat_the_signed_in_employee(monkeypatch):
    db, _ = harness(monkeypatch)
    submit(db, {"type": "unpaid", "payload": {"from": "2026-11-02", "to": "2026-11-03",
                                              "notes": "سفر", "employee_id": "emp-1"}})
    assert stored_payload(db)["notes"] == "سفر"


# --------------------------------------------------------------------------- attachment policy
def _attachment(name="file.pdf", mime="application/pdf", data=None):
    return {"type": "document", "payload": {"doc_type": "iqama"},
            "attachment": {"name": name, "mime": mime, "data": data if isinstance(data, str) else b64(data if data is not None else PDF)}}


def test_the_attachment_ceiling_is_the_pickers_twelve_megabytes():
    assert attachment_limit() == 12 * 1024 * 1024  # src/lib/files.ts MAX_ATT
    too_long = "A" * ((attachment_limit() // 3 + 1) * 4 + 4)  # refused before it is decoded
    with pytest.raises(ApiError) as err:
        RequestInput(_attachment(data=too_long), owner="emp-1")
    assert err.value.status == 413
    assert RequestInput(_attachment(), owner="emp-1").attachment.size == len(PDF)


def test_a_generic_picker_mime_falls_back_to_the_file_name():
    form = RequestInput({"type": "document", "payload": {},
                         "attachment": {"name": "CERT.PDF", "mime": "application/octet-stream",
                                        "data": b64(PDF)}}, owner="emp-1")
    assert form.attachment.mime == "application/pdf"


def test_the_attachment_name_loses_its_path():
    form = RequestInput({"type": "document", "payload": {},
                         "attachment": {"name": "..\\..\\etc/passwd.pdf", "mime": "application/pdf",
                                        "data": b64(PDF)}}, owner="emp-1")
    assert form.attachment.name == "passwd.pdf"


def test_an_attachment_outside_the_policy_is_refused():
    with pytest.raises(ApiError) as wrong_bytes:  # declared PDF, actually text
        RequestInput(_attachment(data=b"just some text"), owner="emp-1")
    assert wrong_bytes.value.status == 415

    with pytest.raises(ApiError) as wrong_family:  # a family the API never stores
        RequestInput(_attachment(name="notes.txt", mime="text/plain", data=b"hello"), owner="emp-1")
    assert wrong_family.value.status == 415

    with pytest.raises(ApiError) as broken:  # not base64 at all
        RequestInput(_attachment(data="not base64!!"), owner="emp-1")
    assert broken.value.status == 422


# --------------------------------------------------------------------------- approval routing
def test_the_chain_ends_where_workflow_config_says(monkeypatch):
    db, _ = harness(monkeypatch)
    # the migrated setting: the five new-screen types finish at HR, the older ones still reach the CEO
    assert canonical_router._stages(db, "annual", True) == ["manager", "hr", "ceo"]
    assert canonical_router._stages(db, "unpaid", True) == ["manager", "hr"]
    assert canonical_router._stages(db, "salary_advance", True) == ["manager", "hr"]
    assert canonical_router._stages(db, "forgot_punch", True) == ["hr"]


def test_the_stored_setting_overrides_the_code_default(monkeypatch):
    db, _ = harness(monkeypatch, config={"final_by_type": {"annual": "hr", "unpaid": "ceo"}})
    assert canonical_router._final_stage(db, "annual") == "hr"
    assert canonical_router._stages(db, "unpaid", True) == ["manager", "hr", "ceo"]

    db, _ = harness(monkeypatch, config={"final_by_type": {"unpaid": "manager"}})  # not a final stage
    assert canonical_router._final_stage(db, "unpaid") == "hr"
    db, _ = harness(monkeypatch, config={"final_by_type": "hr"})  # not a mapping
    assert canonical_router._final_stage(db, "document") == "hr"


def test_a_stale_manager_stage_still_goes_on_to_hr(monkeypatch):
    db, _ = harness(monkeypatch)
    assert canonical_router._next_stage(db, "annual", "manager", has_manager=False) == "hr"
    assert canonical_router._next_stage(db, "unpaid", "manager", has_manager=False) == "hr"
    assert canonical_router._next_stage(db, "annual", "hr") == "ceo"
    assert canonical_router._next_stage(db, "annual", "ceo") == "completed"
    assert canonical_router._next_stage(db, "unpaid", "hr") == "completed"
    assert canonical_router._next_stage(db, "forgot_punch", "hr") == "completed"
    assert canonical_router._next_stage(db, "annual", "completed") == "completed"


def test_a_new_request_waits_at_the_first_stage_only(monkeypatch):
    db, _ = harness(monkeypatch, manager_id="mgr-1")
    submit(db, {"type": "unpaid", "payload": {"from": "2026-11-02", "to": "2026-11-03", "notes": "سفر"}})
    assert stored_stage(db) == "manager"

    db, _ = harness(monkeypatch, manager_id=None)  # no manager: HR is first and last
    submit(db, {"type": "unpaid", "payload": {"from": "2026-11-02", "to": "2026-11-03", "notes": "سفر"}})
    assert stored_stage(db) == "hr"

    db, _ = harness(monkeypatch, manager_id=None)  # an older type keeps the CEO leg
    submit(db, {"type": "overtime", "payload": {"date": "2026-11-02", "hours": 2}})
    assert stored_stage(db) == "hr"
    assert canonical_router._next_stage(db, "overtime", "hr") == "ceo"
