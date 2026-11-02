"""The letter chain and the document viewer: S1–S12, answered without a database.

Every case starts from the rule it enforces and names the row it is about: who may sign, what the
signature is allowed to be (S12), who closes the letter (S6/S10), whose bell rings (S11) and who may
open a document (S1, S1.1). The refusals are the point of the file — an employee signing somebody
else's letter, a manager stepping into another team's chain, an HR account approving a letter that is
not waiting for it — so each one asserts the status *and* that nothing was written.

`World` answers the statements the routes issue (the same trick `test_manager_surface.FakeDB` uses);
`tests_canonical/test_new_ui_requests.py` is the recording-session style this file follows.
"""

from __future__ import annotations

import asyncio
import base64
import json
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.core.errors import ApiError
from app.routers import canonical
from app.services import html_safety

EMP = {"employee_id": "emp1", "account_id": uuid.uuid4(), "role": "employee", "name_ar": "موظف أول"}
MGR = {"employee_id": "mgr", "account_id": uuid.uuid4(), "role": "employee", "name_ar": "مدير مباشر"}
OTHER = {"employee_id": "emp9", "account_id": uuid.uuid4(), "role": "employee", "name_ar": "موظف آخر"}
HR = {"employee_id": "hr", "account_id": uuid.uuid4(), "role": "hr", "name_ar": "موارد بشرية"}
CEO = {"employee_id": "ceo", "account_id": uuid.uuid4(), "role": "ceo", "name_ar": "الرئيس التنفيذي"}
NOBODY = {"account_id": uuid.uuid4(), "role": "employee"}

LETTER_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
DOC_ID = uuid.UUID("22222222-2222-2222-2222-222222222222")
SIGNED_ID = uuid.UUID("33333333-3333-3333-3333-333333333333")
PNG = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 8).decode()


def refused(exc_info, status: int, code: str) -> None:
    assert (exc_info.value.status, exc_info.value.code) == (status, code), exc_info.value.message


def b64(text: str) -> str:
    return base64.b64encode(text.encode("utf-8")).decode("ascii")


def letter(**over) -> dict:
    """A letter HR sent, waiting for the employee at his stage."""
    row = {"id": LETTER_ID, "employee_id": EMP["employee_id"], "request_type": "template:onboarding",
           "payload": {"title": "خطاب تعريف", "template_type": "onboarding", "sent_by": "hr"},
           "current_stage": "employee", "status": "pending", "completed_at": None,
           "created_at": datetime.now(timezone.utc)}
    row.update(over)
    return row


def page(hostile: bool = False) -> str:
    """A letter as the app holds it: a bilingual sheet, the marker, an embedded signature."""
    extra = ('<script>alert(1)</script><img src="https://evil.example/x.png" onerror="alert(1)">'
             '<a href="javascript:alert(1)">اضغط هنا</a>') if hostile else ""
    return (f"<html><head><meta charset='utf-8'></head><body><h1>خطاب تعريف</h1>{extra}"
            f"<p style='font-family:Arial'>نص الخطاب</p><!--ARIBA_EN--><p>Letter</p>"
            f"<img src='{PNG}' alt='signature'></body></html>")


def signed_body(html: str | None = None) -> dict:
    """What `docs.employeeSign` posts: the whole signed page, base64, no document id (S4)."""
    return {"document_id": None, "template_type": "onboarding", "signed_base64": b64(html or page())}


class World:
    """The rows the signing chain and the viewer ask for, picked by what the statement mentions."""

    def __init__(self, *, letter_row: dict | None = None, manager_of: str | None = "mgr", cfg=None,
                 signing: dict | None = None, document: dict | None = None, hr_people=("hr",),
                 door: str = "", states=None, pending=None, letter_file: dict | None = ...):
        self.letter = letter() if letter_row is None else letter_row
        self.letter_file = ({"file_data": b"<p>letter</p><script>alert(1)</script>",
                             "mime_type": "text/html",
                             "file_name": "letter.html"} if letter_file is ... else letter_file)
        self.manager_of = manager_of
        self.cfg = cfg
        self.signing = signing
        self.document = document
        self.hr_people = list(hr_people)
        self.door = door
        self.states = states or []
        self.pending = pending or []
        self.statements: list[tuple[str, dict]] = []
        self.audits: list[tuple] = []
        self.commits = 0

    # ------------------------------------------------------------------ the session
    def execute(self, statement, params=None):
        self.statements.append((" ".join(str(statement).split()), params or {}))
        return SimpleNamespace(rowcount=1)

    def commit(self) -> None:
        self.commits += 1

    def written(self, needle: str) -> list[tuple[str, dict]]:
        return [(sql, params) for sql, params in self.statements if needle in sql]

    def bells(self) -> list[dict]:
        return [params for _, params in self.written("INSERT INTO public.workflow_notifications")]

    def audit(self, *_args, **kwargs):
        self.audits.append((_args[3], _args[4], _args[5], _args[6], kwargs.get("details")))

    # ------------------------------------------------------------------ the reads
    def row(self, _db, sql, **params):
        sql = " ".join(sql.split())
        if "INSERT INTO public.ariba_documents" in sql:
            self.statements.append((sql, params))
            return {"id": SIGNED_ID}
        if "INSERT INTO public.workflow_notifications" in sql:
            self.statements.append((sql, params))
            return {"id": uuid.uuid4()}
        if "FROM public.ariba_app_settings" in sql:
            return {"value": self.cfg} if self.cfg is not None else None
        if "SELECT manager_id FROM public.employee_directory" in sql:
            return {"manager_id": self.manager_of} if self.manager_of else {}
        if "SELECT name_ar FROM public.employee_directory" in sql:
            return {"name_ar": "موظف أول"}
        if "SELECT payload,request_type FROM public.workflow_requests" in sql:
            return {"payload": (self.letter or {}).get("payload"),
                    "request_type": (self.letter or {}).get("request_type")}
        if "FROM public.ariba_doc_signing WHERE request_id=:r FOR UPDATE" in sql:
            return self.signing
        if "SELECT d.file_data" in sql:  # `GET /letters/{id}/html`, the HTML the app's viewer loads
            return self.letter_file
        if "FROM public.ariba_documents WHERE id=:id" in sql:
            return self.document
        if "stage='manager' AND manager_id=:me AND document_id=:d" in sql:
            return {"x": 1} if self.door == "signature" else None
        if "WHERE d.id=:d AND e.manager_id=:me" in sql:
            return {"x": 1} if self.door == "leave" else None
        if "FROM public.workflow_requests r WHERE r.id=:id" in sql:  # the row `/me/letters` answers with
            return {"id": LETTER_ID, "type": (self.letter or {}).get("request_type"),
                    "title": ((self.letter or {}).get("payload") or {}).get("title"),
                    "status": "rejected", "rejection_reason": None, "created_at": None, "responded_at": None}
        if "FROM public.workflow_requests WHERE id=:id" in sql:
            return self.letter
        raise AssertionError(f"unexpected statement: {sql}")

    def rows(self, _db, sql, **params):
        sql = " ".join(sql.split())
        self.statements.append((sql, params))
        if "FROM public.workflow_approvers" in sql:
            return [{"employee_id": person} for person in self.hr_people]
        if "FROM public.ariba_doc_signing WHERE employee_id=:eid" in sql:
            return self.states
        if "WHERE g.stage='manager' AND g.manager_id=:me" in sql:
            return self.pending
        raise AssertionError(f"unexpected statement: {sql}")


def world(monkeypatch, **kwargs) -> World:
    """`World` wired into the router — no session, no database."""
    w = World(**kwargs)
    monkeypatch.setattr(canonical, "_row", w.row)
    monkeypatch.setattr(canonical, "_rows", w.rows)
    monkeypatch.setattr(canonical, "_write_audit", w.audit)
    return w


def sign(w: World, body: dict | None = None, actor: dict = EMP) -> dict:
    return canonical.sign_letter(LETTER_ID, signed_body() if body is None else body,
                                 request=None, actor=dict(actor), db=w)


def manager_sign(w: World, body: dict, actor: dict = MGR) -> dict:
    return canonical.manager_sign_letter(LETTER_ID, body, request=None, actor=dict(actor), db=w)


def respond(w: World, body: dict, actor: dict = EMP):
    return canonical.respond_letter(LETTER_ID, body, request=None, actor=dict(actor), db=w)


def approve(w: World, actor: dict = HR) -> dict:
    return canonical.approve_letter(LETTER_ID, request=None, actor=dict(actor), db=w)


# --------------------------------------------------------------------------- the setting (S10, D31)
def test_hr_closes_is_off_and_the_types_are_empty_until_hr_saves_them(monkeypatch):
    w = world(monkeypatch, cfg=None)
    assert canonical._doc_sign_cfg(w) == {"hr_closes": False, "manager_types": []}
    w.cfg = {"manager_types": ["onboarding"]}  # the seeded setting: no `hr_closes` key at all
    assert canonical._doc_sign_cfg(w) == {"hr_closes": False, "manager_types": ["onboarding"]}
    w.cfg = {"hr_closes": True, "manager_types": ["onboarding"]}
    assert canonical._doc_sign_cfg(w) == {"hr_closes": True, "manager_types": ["onboarding"]}


def test_an_employee_or_a_manager_cannot_change_the_setting(monkeypatch):
    w = world(monkeypatch, cfg={"hr_closes": False, "manager_types": ["onboarding"]})
    for actor in (EMP, MGR, OTHER):
        with pytest.raises(ApiError) as exc:
            canonical.update_doc_sign_settings({"hr_closes": True}, request=None, actor=dict(actor), db=w)
        refused(exc, 403, "forbidden")
    assert w.written("ariba_app_settings") == []  # nothing read, nothing written (D31)


def test_hr_saves_both_fields_and_keeps_the_one_the_body_omits(monkeypatch):
    w = world(monkeypatch, cfg={"manager_types": ["onboarding"]})
    saved = canonical.update_doc_sign_settings({"hr_closes": True}, request=None, actor=dict(HR), db=w)
    assert saved == {"hr_closes": True, "manager_types": ["onboarding"]}
    (_, params), = w.written("UPDATE public.ariba_app_settings")
    assert json.loads(params["v"]) == {"hr_closes": True, "manager_types": ["onboarding"]}


def test_manager_types_must_be_a_list_of_letter_types(monkeypatch):
    w = world(monkeypatch, cfg=None)
    for bad in ("onboarding", [1], [""], {"onboarding": True}):
        with pytest.raises(ApiError) as exc:
            canonical.update_doc_sign_settings({"manager_types": bad}, request=None, actor=dict(HR), db=w)
        refused(exc, 422, "invalid_request")
    assert w.written("UPDATE public.ariba_app_settings") == []


# ---------------------------------------------------------------- the employee signs (S3–S6, S12)
def test_a_type_that_needs_no_manager_closes_at_the_employee(monkeypatch):
    # D24: hr_closes off, type not listed -> done; the row's stage stays at 'hr', nobody's bell rings
    w = world(monkeypatch, cfg={"manager_types": []})
    assert sign(w) == {"next": "done", "document_id": str(SIGNED_ID)}
    (_, signing), = w.written("INSERT INTO public.ariba_doc_signing")
    assert (signing["needs"], signing["mgr"], signing["stage"]) == (False, None, "hr")
    assert signing["rid"] == LETTER_ID and signing["doc"] == SIGNED_ID
    assert w.written("SET current_stage='completed'")
    assert w.bells() == []  # the employee's own act never rings his own bell (S11)


def test_a_listed_type_waits_for_the_manager_and_rings_his_bell(monkeypatch):
    # D26
    w = world(monkeypatch, cfg={"manager_types": ["onboarding"]})
    assert sign(w)["next"] == "manager"
    (_, signing), = w.written("INSERT INTO public.ariba_doc_signing")
    assert (signing["needs"], signing["mgr"], signing["stage"]) == (True, "mgr", "manager")
    assert w.written("SET current_stage='manager'")
    [bell] = w.bells()
    assert bell["employee_id"] == "mgr" and bell["stage"] == "manager" and "مستند بانتظار توقيعك" in bell["title"]


def test_hr_closes_on_leaves_the_letter_at_hr_and_rings_the_hr_stage(monkeypatch):
    w = world(monkeypatch, cfg={"hr_closes": True, "manager_types": []}, hr_people=("hr", "hr2"))
    assert sign(w)["next"] == "hr"
    assert w.written("SET current_stage='hr'") and not w.written("SET current_stage='completed'")
    assert [bell["employee_id"] for bell in w.bells()] == ["hr", "hr2"]


def test_a_listed_type_without_a_manager_goes_to_hr_and_says_why(monkeypatch):
    # S8: the signature is skipped for want of a manager, not refused by one
    w = world(monkeypatch, cfg={"manager_types": ["onboarding"]}, manager_of=None)
    assert sign(w)["next"] == "done"
    (_, signing), = w.written("INSERT INTO public.ariba_doc_signing")
    assert (signing["needs"], signing["mgr"], signing["stage"]) == (True, None, "hr")
    assert w.audits[-1][1] == "sign_employee" and w.audits[-1][4]["reason"] == "no_manager"
    assert w.bells() == []


def test_the_body_cannot_choose_the_document_or_the_type(monkeypatch):
    # S4: document_id is ignored, template_type comes from the request's payload
    w = world(monkeypatch, cfg={"manager_types": ["onboarding"]},
              letter_row=letter(payload={"title": "شهادة راتب", "template_type": "salary_cert"}))
    body = {"document_id": str(DOC_ID), "template_type": "onboarding", "signed_base64": b64(page())}
    assert sign(w, body)["next"] == "done"
    (_, params), = w.written("INSERT INTO public.ariba_documents")
    assert params["rid"] == LETTER_ID and params["eid"] == EMP["employee_id"]
    (_, signing), = w.written("INSERT INTO public.ariba_doc_signing")
    assert signing["needs"] is False


def test_a_letter_that_already_moved_is_not_a_pending_letter_of_his(monkeypatch):
    # D13/D17: the guarded read finds no row, so nothing is written at all
    w = world(monkeypatch)
    w.letter = None
    with pytest.raises(ApiError) as exc:
        sign(w)
    refused(exc, 404, "not_found")
    assert w.statements == []


def test_a_body_without_a_usable_signature_writes_nothing(monkeypatch):
    # D19
    w = world(monkeypatch)
    for body in ({}, {"signed_base64": ""}, {"signed_base64": "not base64 !!"}):
        with pytest.raises(ApiError) as exc:
            sign(w, body)
        refused(exc, 422, "invalid_request")
    assert w.statements == []


def test_a_document_over_one_mebibyte_is_refused_before_anything_is_written(monkeypatch):
    # D29
    w = world(monkeypatch)
    big = base64.b64encode(b"<p>" + b"x" * (html_safety.MAX_DOCUMENT_BYTES + 1)).decode("ascii")
    with pytest.raises(ApiError) as exc:
        sign(w, {"signed_base64": big})
    refused(exc, 413, "file_too_large")
    assert w.statements == []


def test_the_stored_copy_is_the_cleaned_one_not_the_submitted_one(monkeypatch):
    # D28/S12: script, handler, javascript: link and remote image never reach the row
    w = world(monkeypatch, cfg={"manager_types": []})
    sign(w, signed_body(page(hostile=True)))
    (_, params), = w.written("INSERT INTO public.ariba_documents")
    stored = params["data"].decode("utf-8")
    assert "<script" not in stored and "onerror" not in stored and "javascript:" not in stored
    assert "evil.example" not in stored
    assert "خطاب تعريف" in stored and "نص الخطاب" in stored and "<!--ARIBA_EN-->" in stored
    assert "data:image/png;base64," in stored
    assert params["type"] == "signed_document" and params["name"] == "خطاب تعريف-signed.html"
    assert params["by"] == EMP["employee_id"]  # the signer, so HR can tell the two copies apart


# ---------------------------------------------------------------- the manager signs (S3, S7–S9)
def waiting(**over) -> dict:
    """The chain row as the employee's signature left it: waiting for `mgr`."""
    row = {"request_id": str(LETTER_ID), "document_id": SIGNED_ID, "employee_id": EMP["employee_id"],
           "needs_manager": True, "manager_id": "mgr", "stage": "manager", "reject_reason": None,
           "emp_signed_at": datetime.now(timezone.utc), "mgr_signed_at": None}
    row.update(over)
    return row


def test_the_manager_signature_closes_the_letter_when_hr_does_not(monkeypatch):
    # D27
    w = world(monkeypatch, signing=waiting(), cfg={"manager_types": ["onboarding"]})
    assert manager_sign(w, {"action": "approved", "signed_base64": b64(page())}) == {"ok": True, "next": "done"}
    assert w.written("SET stage='hr',mgr_signed_at=now()")
    assert w.written("SET current_stage='completed'")
    [bell] = w.bells()
    assert bell["employee_id"] == EMP["employee_id"] and "اعتُمد مستندك" in bell["title"]
    assert w.audits[-1][1] == "sign_manager"


def test_the_manager_signature_waits_for_hr_when_hr_closes(monkeypatch):
    w = world(monkeypatch, signing=waiting(), cfg={"hr_closes": True, "manager_types": ["onboarding"]})
    assert manager_sign(w, {"action": "approved", "signed_base64": b64(page())}) == {"ok": True, "next": "hr"}
    assert w.written("SET current_stage='hr'") and not w.written("SET current_stage='completed'")
    [bell] = w.bells()
    assert bell["employee_id"] == "hr" and "مستند موقّع بانتظار اعتمادك" in bell["title"]


def test_only_the_manager_the_row_names_can_sign_it(monkeypatch):
    # D14–D17
    body = {"action": "approved", "signed_base64": b64(page())}
    for wrong in (OTHER, EMP, NOBODY):
        w = world(monkeypatch, signing=waiting(), cfg={"manager_types": ["onboarding"]})
        with pytest.raises(ApiError) as exc:
            manager_sign(w, body, actor=wrong)
        refused(exc, 404, "not_found")
        assert w.statements == []
    for stage in ("hr", "rejected"):
        w = world(monkeypatch, signing=waiting(stage=stage), cfg={"manager_types": ["onboarding"]})
        with pytest.raises(ApiError) as exc:
            manager_sign(w, body)
        refused(exc, 404, "not_found")
        assert w.statements == []
    w = world(monkeypatch, signing=None)
    with pytest.raises(ApiError) as exc:
        manager_sign(w, body)
    refused(exc, 404, "not_found")


def test_a_manager_rejection_needs_a_reason_and_closes_the_chain(monkeypatch):
    # D18
    w = world(monkeypatch, signing=waiting(), cfg={"manager_types": ["onboarding"]})
    with pytest.raises(ApiError) as exc:
        manager_sign(w, {"action": "rejected", "reason": "لا"})
    refused(exc, 422, "invalid_request")
    assert w.statements == []
    assert manager_sign(w, {"action": "rejected", "reason": "التوقيع لا يطابق"}) == {"ok": True, "next": "rejected"}
    assert w.written("SET stage='rejected',reject_reason=:reason")
    assert w.written("SET current_stage='rejected'")
    [bell] = w.bells()
    assert bell["employee_id"] == EMP["employee_id"] and "التوقيع لا يطابق" in bell["body"]
    assert w.audits[-1][1] == "sign_reject"


def test_a_manager_signature_is_cleaned_before_it_is_stored(monkeypatch):
    w = world(monkeypatch, signing=waiting(), cfg={"manager_types": ["onboarding"]})
    manager_sign(w, {"action": "approved", "signed_base64": b64(page(hostile=True))})
    (_, stored), = w.written("INSERT INTO public.ariba_documents")
    html = stored["data"].decode("utf-8")
    assert "<script" not in html and "evil.example" not in html and "نص الخطاب" in html
    assert stored["name"] == "خطاب تعريف-signed-manager.html" and stored["by"] == "mgr"


# ---------------------------------------------------------------- HR closes the chain (S10, D20–D22)
def test_hr_approves_a_letter_waiting_at_its_stage(monkeypatch):
    w = world(monkeypatch, letter_row=letter(current_stage="hr"), cfg={"hr_closes": True})
    assert approve(w) == {"ok": True, "status": "approved"}
    assert w.written("SET current_stage='completed'")
    [bell] = w.bells()
    assert bell["employee_id"] == EMP["employee_id"] and "اعتُمد مستندك" in bell["title"]
    assert w.audits[-1][1] == "letter_approve"


def test_hr_approves_only_what_is_waiting_for_it(monkeypatch):
    # D21: still with the manager, or already rejected -> not_waiting_for_hr, nothing written
    for row in (letter(current_stage="manager"), letter(current_stage="rejected", status="rejected")):
        w = world(monkeypatch, letter_row=row, cfg={"hr_closes": True})
        with pytest.raises(ApiError) as exc:
            approve(w)
        refused(exc, 409, "not_waiting_for_hr")
        assert w.statements == []
    # the setting was turned off while the letter sits at HR: it no longer waits for HR (S10)
    w = world(monkeypatch, letter_row=letter(current_stage="hr"), cfg={"hr_closes": False})
    with pytest.raises(ApiError) as exc:
        approve(w)
    refused(exc, 409, "not_waiting_for_hr")
    # D25/D22: it closed itself (or was approved already) -> already_closed
    for cfg in ({"hr_closes": False}, {"hr_closes": True}):
        w = world(monkeypatch, letter_row=letter(current_stage="completed", status="approved"), cfg=cfg)
        with pytest.raises(ApiError) as exc:
            approve(w)
        refused(exc, 409, "already_closed")
        assert w.statements == []


def test_an_employee_a_manager_and_an_outsider_cannot_approve(monkeypatch):
    # D20
    for actor in (EMP, MGR, NOBODY):
        w = world(monkeypatch, letter_row=letter(current_stage="hr"), cfg={"hr_closes": True})
        with pytest.raises(ApiError) as exc:
            approve(w, actor=actor)
        refused(exc, 403, "forbidden")
        assert w.statements == []
    w = world(monkeypatch, letter_row=letter(current_stage="hr"), cfg={"hr_closes": True})
    assert approve(w, actor=CEO)["status"] == "approved"  # the CEO is one of the four roles
    w = world(monkeypatch, cfg={"hr_closes": True})
    w.letter = None  # the id is not a letter at all
    with pytest.raises(ApiError) as exc:
        approve(w)
    refused(exc, 404, "not_found")  # an id that is not a letter


def test_respond_approval_takes_the_signature_path(monkeypatch):
    # S6: no signed copy, a chain row with document_id NULL, and the manager's step
    w = world(monkeypatch, cfg={"manager_types": ["onboarding"]})
    respond(w, {"action": "approved"})
    (_, signing), = w.written("INSERT INTO public.ariba_doc_signing")
    assert (signing["doc"], signing["stage"], signing["needs"]) == (None, "manager", True)
    assert w.written("SET current_stage='manager'")
    assert w.written("INSERT INTO public.ariba_documents") == []
    assert w.audits[-1][4]["next"] == "manager"


def test_respond_approval_closes_a_letter_no_one_else_needs(monkeypatch):
    w = world(monkeypatch, cfg={"manager_types": []})
    respond(w, {"action": "approved"})
    assert w.written("SET current_stage='completed'")
    assert w.bells() == []


def test_respond_rejection_still_needs_a_reason(monkeypatch):
    w = world(monkeypatch, cfg={"manager_types": []})
    for reason in ("", "لا"):
        with pytest.raises(ApiError) as exc:
            respond(w, {"action": "rejected", "reason": reason})
        refused(exc, 422, "invalid_request")
    assert w.statements == []
    respond(w, {"action": "rejected", "reason": "المبلغ غير مناسب"})
    assert w.written("SET current_stage='rejected'")
    (_, action), = w.written("INSERT INTO public.workflow_actions")
    assert action["action"] == "rejected" and action["reason"] == "المبلغ غير مناسب"


# ---------------------------------------------------------------- the viewer (S1, S1.1, D1–D12)
def document(**over) -> dict:
    """One stored file: the letter HR sent, or an attachment hanging off a request."""
    row = {"id": DOC_ID, "employee_id": EMP["employee_id"], "request_id": LETTER_ID,
           "file_name": "letter.html", "mime_type": "text/html", "file_data": b"<p>hi</p>"}
    row.update(over)
    return row


def content(w: World, actor: dict = EMP) -> dict:
    return canonical.document_content(DOC_ID, request=None, actor=dict(actor), db=w)


def test_the_owner_and_hr_open_a_document_without_an_audit_row(monkeypatch):
    for actor in (EMP, HR, CEO):
        w = world(monkeypatch, document=document())
        opened = content(w, actor)
        assert opened == {"id": str(DOC_ID), "file_name": "letter.html", "mime_type": "text/html",
                          "base64": base64.b64encode(b"<p>hi</p>").decode("ascii")}
        assert w.audits == []  # a person's own paper is not a row per glance (S9)


def test_a_manager_opens_the_letter_waiting_for_his_signature_and_is_audited(monkeypatch):
    w = world(monkeypatch, document=document(), door="signature")
    assert content(w, MGR)["id"] == str(DOC_ID)
    module, action, entity, entity_id, details = w.audits[0]
    assert (module, action, entity, entity_id) == ("documents", "open", "document", DOC_ID)
    assert details == {"employee_id": EMP["employee_id"], "via": "content"}  # no bytes, no name (S1.1)


def test_a_manager_opens_a_leave_attachment_of_his_report(monkeypatch):
    # D7: all leave types, the paper behind a claim he already approves
    w = world(monkeypatch, document=document(document_type="employee_upload", mime_type="application/pdf",
                                              file_name="sick.pdf"), door="leave")
    assert content(w, MGR)["file_name"] == "sick.pdf"
    assert w.audits[0][4] == {"employee_id": EMP["employee_id"], "via": "content"}


def test_the_viewer_opens_two_doors_for_a_manager_and_no_more(monkeypatch):
    # D4/D5/D8–D12: no door matches -> the answer an unknown id gets, and no audit row
    for actor in (MGR, OTHER, NOBODY):
        w = world(monkeypatch, document=document(), door="")
        with pytest.raises(ApiError) as exc:
            content(w, actor)
        refused(exc, 404, "not_found")
        assert w.audits == []
    w = world(monkeypatch, document=None)
    with pytest.raises(ApiError) as exc:
        content(w, EMP)
    refused(exc, 404, "not_found")


def test_the_letter_html_route_sends_the_display_policy(monkeypatch):
    """S12's second belt for a row written before the sanitizer existed: the bytes are served as they
    are, and the header is what makes a hostile one inert in the browser that opens it."""
    w = world(monkeypatch)
    response = canonical.letter_html(LETTER_ID, actor=dict(EMP), db=w)
    assert response.headers["content-security-policy"] == html_safety.DISPLAY_CSP
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "default-src 'none'" in html_safety.DISPLAY_CSP and "script-src" not in html_safety.DISPLAY_CSP
    assert "img-src data:" in html_safety.DISPLAY_CSP and "style-src 'unsafe-inline'" in html_safety.DISPLAY_CSP
    assert "alert(1)" in response.body.decode("utf-8")  # an old row keeps its bytes; the header disarms them
    w = world(monkeypatch, letter_file=None)
    with pytest.raises(ApiError) as exc:
        canonical.letter_html(LETTER_ID, actor=dict(EMP), db=w)
    refused(exc, 404, "not_found")


def _through_the_middleware(path: str, headers: dict):
    """One response through `core.security.SecurityHeadersMiddleware`, without a server."""
    from starlette.requests import Request
    from starlette.responses import Response

    from app.core.security import SecurityHeadersMiddleware

    request = Request({"type": "http", "method": "GET", "path": path, "headers": [], "state": {}})

    async def call_next(_request):
        return Response(content=b"<p>x</p>", media_type="text/html", headers=dict(headers))

    return asyncio.run(SecurityHeadersMiddleware(app=None).dispatch(request, call_next))


def test_the_security_middleware_keeps_the_route_policy_and_sends_its_own():
    # the route's policy is the one a browser honours for a letter, so the blanket header must not win
    response = _through_the_middleware("/api/v1/letters/1111/html",
                                       {"Content-Security-Policy": html_safety.DISPLAY_CSP})
    assert response.headers["content-security-policy"] == html_safety.DISPLAY_CSP
    assert response.headers["x-content-type-options"] == "nosniff"  # still the middleware's own headers
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["cache-control"] == "no-store"
    # every other answer keeps the blanket policy the API has always sent
    response = _through_the_middleware("/api/v1/me", {})
    assert response.headers["content-security-policy"] == "default-src 'none'; frame-ancestors 'none'"


# ---------------------------------------------------------------- states and the manager's list
def test_states_are_the_callers_own_rows(monkeypatch):
    row = {"request_id": str(LETTER_ID), "stage": "manager", "needs_manager": True, "reject_reason": None,
           "emp_signed_at": datetime.now(timezone.utc), "mgr_signed_at": None}
    w = world(monkeypatch, states=[row])
    assert canonical.sign_states(actor=dict(EMP), db=w) == [row]
    assert w.statements[0][1] == {"eid": "emp1"}
    # D23: an account with no employee row has no rows, and asks nobody
    w = world(monkeypatch, states=[row])
    assert canonical.sign_states(actor=dict(NOBODY), db=w) == []
    assert w.statements == []


def test_pending_is_the_managers_own_duty_not_a_team_view(monkeypatch):
    # S7: no `view_team*` flag is consulted, only the row's own manager
    pending = [{"request_id": str(LETTER_ID), "document_id": SIGNED_ID, "employee_id": "emp1",
                "employee_name": "موظف أول", "emp_signed_at": datetime.now(timezone.utc),
                "template_type": "onboarding"}]
    w = world(monkeypatch, pending=pending)
    assert canonical.sign_pending(actor=dict(MGR), db=w) == pending
    sql, params = w.statements[0]
    assert params == {"me": "mgr"} and "g.stage='manager'" in sql and "g.manager_id=:me" in sql
    w = world(monkeypatch)
    assert canonical.sign_pending(actor=dict(NOBODY), db=w) == []  # no employee row: nobody's queue
    assert w.statements == []
