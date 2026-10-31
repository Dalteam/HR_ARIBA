"""The notification e-mail: queue selection, the full-detail body, the PDF and the send stamps.

Pure unit tests — no SMTP server and no database: `flush()` is driven with a fake session and
`_deliver` is replaced, so what is checked is exactly our own logic.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest

from app.config import Settings
from app.core.errors import ApiError
from app.routers import canonical as canonical_router
from app.services import notify_email


def settings(**overrides) -> Settings:
    base = dict(env="test", smtp_host="smtp.example.com", smtp_port=587, smtp_username="mailer",
                smtp_password="secret", smtp_from_email="hr@ariba.example", smtp_from_name="Ariba HR",
                smtp_encryption="starttls", public_app_url="https://app.ariba.example",
                notify_email_enabled=True, notify_email_redirect_to="sink@ariba.example",
                notify_email_since="2026-10-01T00:00:00Z")
    base.update(overrides)
    return Settings(**base)


def notification(**overrides) -> dict:
    row = {
        "id": uuid.UUID("11111111-2222-3333-4444-555555555555"),
        "recipient_employee_id": "86",
        "request_id": uuid.UUID("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
        "title": "طلب إجازة جديد",
        "body": "يوجد طلب إجازة سنوية بانتظار موافقتك",
        "stage": "manager",
        "kind": "request",
        "created_at": datetime(2026, 10, 29, 9, 30, tzinfo=timezone.utc),
        "email_tries": 0,
        "name_ar": "محمد فرج",
        "name_en": "Mohammed Farag",
        "employee_data": {"email": "m.farag@ariba.example"},
        "recipient_role": "manager",
        "requester_name": "محمد فرج",
        "request_type": "annual",
        "request_status": "pending",
        "current_stage": "manager",
        "request_created_at": datetime(2026, 10, 29, 9, 25, tzinfo=timezone.utc),
        "request_payload": {"from": "2026-11-01", "to": "2026-11-03", "days": 3},
    }
    row.update(overrides)
    return row


class FakeResult:
    def __init__(self, rows=(), mapping_one=None, first_row=None):
        self._rows, self._one, self._first = list(rows), mapping_one, first_row

    def mappings(self):
        return self

    def all(self):
        return self._rows

    def one(self):
        return self._one

    def first(self):
        return self._first


class FakeDB:
    """Answers the enquiries `flush()` makes and records every UPDATE."""

    def __init__(self, pending=(), attachments=None, documents=None, counts=None,
                 mail_account=None, setting=None):
        self.pending = list(pending)
        self.attachment_rows = list(attachments or [])
        self.document_rows = list(documents or [])
        self.counts = counts or {"ready": len(self.pending), "no_address": 0, "gave_up": 0}
        self.mail_account_row = mail_account
        self.setting_row = setting
        self.statements: list[tuple[str, dict]] = []
        self.commits = self.rollbacks = 0

    def execute(self, statement, params=None):
        sql = str(statement)
        self.statements.append((sql, params or {}))
        if "count(*) FILTER" in sql:
            return FakeResult(mapping_one=self.counts)
        if "FROM public.ariba_app_settings" in sql:
            return FakeResult(first_row=(self.setting_row,) if self.setting_row is not None else None)
        if "FROM public.ariba_mail_accounts" in sql:
            return FakeResult(first_row=self.mail_account_row)
        if "FROM public.ariba_notif_files" in sql:
            return FakeResult(rows=self.attachment_rows)
        if "FROM public.ariba_documents" in sql:
            return FakeResult(rows=self.document_rows)
        if "FROM public.workflow_notifications n" in sql:
            return FakeResult(rows=self.pending)
        return FakeResult()

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def close(self):
        pass


def test_smtp_needs_host_and_sender_to_be_configured():
    assert notify_email.smtp_configured(settings()) is True
    assert notify_email.smtp_configured(settings(smtp_host="")) is False
    assert notify_email.smtp_configured(settings(smtp_from_email="")) is False


def test_app_links_fall_back_to_public_app_url(monkeypatch):
    monkeypatch.setattr(notify_email, "_app_setting", lambda _db, _key: {"hr": "https://hr.ariba.example/"})
    links = notify_email.app_links(object(), settings())
    assert links["hr"] == "https://hr.ariba.example"          # saved, trailing slash dropped
    assert links["emp"] == "https://app.ariba.example"        # empty → PUBLIC_APP_URL


def test_link_points_staff_at_the_hr_portal_and_everyone_else_at_the_employee_app():
    links = {"hr": "https://hr.ariba.example", "emp": "https://app.ariba.example"}
    # staff also get the client's deep link (#/lv = the request list, #/dash = the dashboard)
    assert notify_email.link_for(notification(recipient_role="hr"), links) == links["hr"] + "#/lv"
    assert notify_email.link_for(notification(recipient_role="admin"), links) == links["hr"] + "#/lv"
    assert notify_email.link_for(notification(recipient_role="employee"), links) == links["emp"]
    assert notify_email.link_for(notification(recipient_role=None), links) == links["emp"]
    assert notify_email.link_for(notification(recipient_role="hr", kind="alert"), links) == links["hr"] + "#/dash"
    assert notify_email.link_for(notification(recipient_role="hr", kind="message"), links) == links["hr"]


def test_a_saved_link_with_a_hash_does_not_gain_a_second_one():
    links = {"hr": "https://hr.ariba.example/#/home", "emp": "https://app.ariba.example"}
    assert notify_email.link_for(notification(recipient_role="hr"), links) == "https://hr.ariba.example#/lv"


def test_subject_has_the_clients_shape():
    assert notify_email.subject(notification()) == "[طلب جديد] إجازة سنوية — محمد فرج"
    decided = notification(kind="decision", request_status="approved")
    assert notify_email.subject(decided) == "[قرار: معتمد] إجازة سنوية — محمد فرج"
    template = notification(request_type="template:onboarding", kind="template",
                            request_payload={"title": "مباشرة عمل", "sent_by": "10"})
    assert notify_email.subject(template) == "[مستند للتوقيع] مباشرة عمل — محمد فرج"
    plain = notification(request_id=None, request_type=None, request_status=None, kind="message",
                         title="تحديث بيانات الشركة")
    assert notify_email.subject(plain) == "[رسالة] تحديث بيانات الشركة"


def test_message_carries_the_full_details_of_the_notification():
    message = notify_email.build_message(
        notification(), links={"hr": "https://hr.ariba.example", "emp": "https://app.ariba.example"},
        company="شركة اريبا لخدمات الأعمال", settings=settings())
    assert message["To"] == "محمد فرج <m.farag@ariba.example>"
    assert message["From"] == "Ariba HR <hr@ariba.example>"
    assert message["Subject"] == "[طلب جديد] إجازة سنوية — محمد فرج"
    body = message.get_body(preferencelist=("plain",)).get_content()
    assert "محمد فرج" in body
    assert "قيد الاعتماد / Pending" in body                   # status, bilingual
    assert "المدير المباشر / Direct manager" in body           # current stage
    assert "عدد الأيام / days: 3" in body                      # the request payload
    assert "مراجعة الطلب" in body                              # the client's action box
    assert str(notification()["request_id"]) in body          # the id HR quotes on the phone
    assert "https://hr.ariba.example#/lv" in body              # a manager opens the HR portal
    assert "شركة اريبا لخدمات الأعمال" in body                 # footer
    html = message.get_body(preferencelist=("html",)).get_content()
    assert 'dir="rtl"' in html and "https://hr.ariba.example#/lv" in html


def test_an_employee_gets_the_employee_app_link_not_the_portal():
    message = notify_email.build_message(
        notification(recipient_role="employee"), links={"hr": "https://hr.ariba.example",
                                                        "emp": "https://app.ariba.example"},
        company="Ariba", settings=settings())
    body = message.get_body(preferencelist=("plain",)).get_content()
    assert "https://app.ariba.example" in body and "https://hr.ariba.example" not in body
    assert "مراجعة الطلب" not in body                          # no action box for a plain employee


def test_template_pdf_is_attached_to_the_message():
    pdf = b"%PDF-1.4 fake"
    message = notify_email.build_message(
        notification(kind="template", title="مباشرة عمل"), links={"hr": "", "emp": "https://app.ariba.example"},
        company="Ariba", settings=settings(), attachments=[("onboarding.pdf", "application/pdf", pdf)])
    attachments = [(part.get_filename(), part.get_content_type(), part.get_payload(decode=True))
                   for part in message.walk() if part.get_filename()]
    assert attachments == [("onboarding.pdf", "application/pdf", pdf)]
    assert "onboarding.pdf" in message.get_body(preferencelist=("plain",)).get_content()


def test_flush_does_nothing_while_the_sender_is_switched_off(monkeypatch):
    delivered = []
    monkeypatch.setattr(notify_email, "_deliver", lambda *_a: delivered.append(1))
    db = FakeDB(pending=[notification()])
    result = notify_email.flush(settings=settings(notify_email_enabled=False), db=db)
    assert result["reason"] == "disabled"
    assert result["sent"] == 0 and delivered == []
    assert db.statements == []                     # not even a query: off means off


def test_flush_does_nothing_while_smtp_is_not_configured(monkeypatch):
    delivered = []
    monkeypatch.setattr(notify_email, "_deliver", lambda *_a: delivered.append(1))
    db = FakeDB(pending=[notification()])
    result = notify_email.flush(settings=settings(smtp_host=""), db=db)
    assert result["reason"] == "smtp-not-configured"
    assert result["sent"] == 0 and delivered == []
    assert not any("SET emailed_at" in sql for sql, _ in db.statements)


def test_flush_refuses_everything_when_no_cutoff_is_known(monkeypatch):
    delivered = []
    monkeypatch.setattr(notify_email, "_deliver", lambda *_a: delivered.append(1))
    db = FakeDB(pending=[notification()], setting=None)
    result = notify_email.flush(settings=settings(notify_email_since=""), db=db)
    assert result["reason"] == "no-cutoff"
    assert delivered == []
    assert not any("SET emailed_at" in sql for sql, _ in db.statements)


def test_the_cutoff_comes_from_the_env_then_from_the_migration_stamp(monkeypatch):
    assert notify_email.cutoff(FakeDB(), settings(notify_email_since="2026-10-21T00:00:00Z")) == \
        datetime(2026, 10, 21, tzinfo=timezone.utc)
    monkeypatch.setattr(notify_email, "_app_setting",
                        lambda _db, _key: {"at": "2026-10-20T10:00:00.000Z", "skipped_notifications": 13})
    assert notify_email.cutoff(object(), settings(notify_email_since="")) == \
        datetime(2026, 10, 20, 10, tzinfo=timezone.utc)
    monkeypatch.setattr(notify_email, "_app_setting", lambda _db, _key: None)
    assert notify_email.cutoff(object(), settings(notify_email_since="")) is None
    assert notify_email.parse_since("not a date") is None
    assert notify_email.parse_since("2026-10-20") == datetime(2026, 10, 20, tzinfo=timezone.utc)


def test_flush_only_looks_at_notifications_newer_than_the_cutoff(monkeypatch):
    monkeypatch.setattr(notify_email, "_deliver", lambda *_a: None)
    db = FakeDB(pending=[notification()])
    notify_email.flush(settings=settings(), db=db)
    counted = next(params for sql, params in db.statements if "count(*) FILTER" in sql)
    fetched = next(params for sql, params in db.statements if "FROM public.workflow_notifications n" in sql)
    expected = datetime(2026, 10, 1, tzinfo=timezone.utc)
    assert counted["since"] == expected and fetched["since"] == expected
    assert "n.created_at >= :since" in next(sql for sql, _ in db.statements
                                            if "FROM public.workflow_notifications n" in sql)


def test_flush_stamps_emailed_at_after_a_successful_send(monkeypatch):
    delivered = []
    monkeypatch.setattr(notify_email, "_deliver", lambda message, _config: delivered.append(message))
    row = notification()
    db = FakeDB(pending=[row], attachments=[("form.pdf", "application/pdf", b"%PDF")],
                counts={"ready": 1, "no_address": 2, "gave_up": 0})
    result = notify_email.flush(settings=settings(), db=db)
    assert result["sent"] == 1 and result["failed"] == 0 and result["blocked"] == 0
    assert result["pending"]["no_address"] == 2
    assert result["since"] == "2026-10-01T00:00:00+00:00"
    assert len(delivered) == 1
    assert delivered[0]["X-Ariba-Notification"] == str(row["id"])
    # nothing leaves for a real address: the sink got it, the employee is only a header
    assert delivered[0]["To"] == "محمد فرج <sink@ariba.example>"
    assert delivered[0]["X-Ariba-Intended-To"] == "m.farag@ariba.example"
    assert delivered[0]["Subject"].startswith("[test] ")
    _sql, params = next(item for item in db.statements if "SET emailed_at=now()" in item[0])
    assert params["id"] == row["id"]
    assert db.commits == 1


def test_flush_records_the_error_and_the_try_so_the_next_pass_retries(monkeypatch):
    def boom(*_args):
        raise OSError("connection refused")

    monkeypatch.setattr(notify_email, "_deliver", boom)
    row = notification()
    db = FakeDB(pending=[row])
    result = notify_email.flush(settings=settings(), db=db)
    assert result["sent"] == 0 and result["failed"] == 1 and result["blocked"] == 0
    _sql, params = next(item for item in db.statements if "SET email_error=:error" in item[0])
    assert params["id"] == row["id"]
    assert "connection refused" in params["error"]
    assert not any("SET emailed_at=now()" in sql for sql, _ in db.statements)


def test_flush_sends_nothing_when_the_queue_is_empty(monkeypatch):
    delivered = []
    monkeypatch.setattr(notify_email, "_deliver", lambda *_a: delivered.append(1))
    result = notify_email.flush(settings=settings(), db=FakeDB())
    assert result["sent"] == 0 and result["failed"] == 0 and delivered == []


def test_outside_production_a_real_address_is_refused_not_mailed(monkeypatch):
    delivered = []
    monkeypatch.setattr(notify_email, "_deliver", lambda *_a: delivered.append(1))
    row = notification()
    db = FakeDB(pending=[row])
    result = notify_email.flush(settings=settings(notify_email_redirect_to=""), db=db)
    assert result["blocked"] == 1 and result["sent"] == 0 and delivered == []
    _sql, params = next(item for item in db.statements if "SET email_error=:error" in item[0])
    assert params["error"] == notify_email.BLOCKED_REASON
    assert not any("SET emailed_at=now()" in sql for sql, _ in db.statements)


def test_production_mails_the_employee_and_the_flag_does_the_same_outside_it(monkeypatch):
    delivered = []
    monkeypatch.setattr(notify_email, "_deliver", lambda message, _config: delivered.append(message))
    notify_email.flush(settings=settings(env="production", notify_email_redirect_to="", jwt_secret="x" * 40,
                                         database_url="postgresql://localhost/ariba"),
                       db=FakeDB(pending=[notification()]))
    assert delivered[0]["To"] == "محمد فرج <m.farag@ariba.example>"
    assert "X-Ariba-Intended-To" not in delivered[0]
    delivered.clear()
    notify_email.flush(settings=settings(notify_email_redirect_to="", notify_email_allow_real_recipients=True),
                       db=FakeDB(pending=[notification()]))
    assert delivered[0]["To"] == "محمد فرج <m.farag@ariba.example>"


def test_recipient_address_uses_the_clients_field_order_and_rejects_junk():
    assert notify_email.recipient_address({"email": "a@b.example"}) == "a@b.example"
    assert notify_email.recipient_address({"email": "not-an-address", "workEmail": " w@b.example "}) == "w@b.example"
    assert notify_email.recipient_address({"personal_email": "p@b.example", "mail": "m@b.example"}) == "p@b.example"
    assert notify_email.recipient_address({"ml": "last@b.example"}) == "last@b.example"
    assert notify_email.recipient_address({"email": "", "mail": "   "}) == ""
    assert notify_email.recipient_address(None) == ""


def test_attachments_fall_back_to_the_requests_own_documents():
    db = FakeDB(documents=[("leave.pdf", "application/pdf", b"%PDF-doc", 8)])
    row = notification()
    assert notify_email.attachments(db, row) == [("leave.pdf", "application/pdf", b"%PDF-doc")]
    # a notification with its own file never looks at the request
    db = FakeDB(attachments=[("form.pdf", "application/pdf", b"%PDF-form")],
                documents=[("leave.pdf", "application/pdf", b"%PDF-doc", 8)])
    assert notify_email.attachments(db, row) == [("form.pdf", "application/pdf", b"%PDF-form")]
    # a document over the 6 MiB per-file cap is dropped, not attached
    big = b"x" * (notify_email.MAX_DOCUMENT_BYTES + 1)
    db = FakeDB(documents=[("big.pdf", "application/pdf", big, len(big))])
    assert notify_email.attachments(db, row) == []


def test_the_mailbox_row_can_fill_the_gaps_but_never_the_password():
    account = {"host": "smtp.row.example", "port": 465, "secure": True, "username": "row-user",
               "from_email": "hr@row.example", "from_name": "Row Sender"}
    config = notify_email.smtp_config(settings(smtp_host="", smtp_from_email="", smtp_username="",
                                              smtp_password=""), account)
    assert (config.host, config.port, config.username, config.from_email) == \
        ("smtp.row.example", 465, "row-user", "hr@row.example")
    assert config.password == "" and config.encryption == "ssl"
    # the environment always wins, and the password only ever comes from it
    config = notify_email.smtp_config(settings(), account)
    assert (config.host, config.from_email, config.password) == \
        ("smtp.example.com", "hr@ariba.example", "secret")


def test_the_sender_needs_the_explicit_switch_not_just_smtp():
    assert notify_email.smtp_configured(settings()) is True
    assert notify_email.enabled(settings()) is True
    assert notify_email.enabled(settings(notify_email_enabled=False)) is False
    assert notify_email.enabled(Settings(env="test")) is False


def test_app_links_saved_by_hr_must_be_http_urls_and_may_stay_empty(monkeypatch):
    assert canonical_router._clean_app_link(" https://hr.ariba.example/ ", "hr") == "https://hr.ariba.example"
    assert canonical_router._clean_app_link(None, "emp") == ""
    with pytest.raises(ApiError):
        canonical_router._clean_app_link("ariba.example", "hr")
    with pytest.raises(ApiError):
        canonical_router._clean_app_link("https://ariba example", "hr")

    monkeypatch.setattr(canonical_router, "_app_setting", lambda _db, _key: {"hr": "https://hr.ariba.example"})
    row = canonical_router._app_links_row(object())
    assert row["hr"] == "https://hr.ariba.example"
    assert row["emp"] == ""
    assert row["fallback"]


def test_letter_pdf_accepts_raw_base64_and_data_uris():
    raw = notify_email_test_b64(b"%PDF-1.7 letter")
    assert canonical_router._notification_pdf({"pdf_base64": raw}, "letter.pdf") == (b"%PDF-1.7 letter", "letter.pdf")
    data_uri = "data:application/pdf;base64," + raw
    data, name = canonical_router._notification_pdf(
        {"pdf_base64": data_uri, "pdf_name": " signed.pdf "}, "letter.pdf")
    assert data == b"%PDF-1.7 letter" and name == "signed.pdf"
    assert canonical_router._notification_pdf({}, "letter.pdf") == (None, "letter.pdf")
    assert canonical_router._notification_pdf({"pdf_base64": "   "}, "letter.pdf") == (None, "letter.pdf")


def test_letter_pdf_rejects_a_non_pdf_data_uri_and_a_huge_file():
    with pytest.raises(ApiError):
        canonical_router._notification_pdf(
            {"pdf_base64": "data:text/csv;base64," + notify_email_test_b64(b"a,b")}, "letter.pdf")
    with pytest.raises(ApiError):
        canonical_router._notification_pdf({"pdf_base64": "%%% not base64 %%%"}, "letter.pdf")
    too_big = b"x" * (canonical_router.NOTIF_PDF_MAX_BYTES + 1)
    with pytest.raises(ApiError):
        canonical_router._notification_pdf({"pdf_base64": notify_email_test_b64(too_big)}, "letter.pdf")


def test_sending_a_letter_stores_its_pdf_against_the_bell_entry(monkeypatch):
    notification_id = uuid.uuid4()
    request_id = uuid.uuid4()
    document_id = uuid.uuid4()

    def fake_row(_db, sql, **params):
        if "INSERT INTO public.workflow_requests" in sql:
            return {"id": request_id, "employee_id": "86", "request_type": "template:onboarding",
                    "status": "pending", "created_at": None}
        if "INSERT INTO public.ariba_documents" in sql:
            return {"id": document_id}
        return {"name_ar": "محمد فرج"}

    monkeypatch.setattr(canonical_router, "_employee_scope", lambda *_a, **_k: None)
    monkeypatch.setattr(canonical_router, "_require_lookup", lambda *_a, **_k: None)
    monkeypatch.setattr(canonical_router, "_row", fake_row)
    monkeypatch.setattr(canonical_router, "_insert_notification", lambda *_a, **_k: notification_id)
    monkeypatch.setattr(canonical_router, "_write_audit", lambda *_a, **_k: None)

    db = FakeDB()
    result = canonical_router.send_letter(
        {"employee_id": "86", "title": "مباشرة عمل", "html": "<p>hi</p>", "type": "onboarding",
         "pdf_base64": notify_email_test_b64(b"%PDF-1.7 signed"), "pdf_name": "onboarding.pdf"},
        request=None, actor={"account_id": uuid.uuid4(), "employee_id": "10", "role": "hr"}, db=db)
    insert = next(sql_params for sql_params in db.statements if "public.ariba_notif_files" in sql_params[0])
    assert insert[1]["nid"] == notification_id
    assert insert[1]["data"] == b"%PDF-1.7 signed"
    assert insert[1]["name"] == "onboarding.pdf"
    assert result["notification_id"] == notification_id
    assert result["attachment"] == "onboarding.pdf"


def test_a_letter_without_a_pdf_attaches_nothing(monkeypatch):
    monkeypatch.setattr(canonical_router, "_employee_scope", lambda *_a, **_k: None)
    monkeypatch.setattr(canonical_router, "_require_lookup", lambda *_a, **_k: None)
    monkeypatch.setattr(canonical_router, "_row", lambda _db, sql, **params: (
        {"id": uuid.uuid4(), "employee_id": "86", "request_type": "template:custom", "status": "pending",
         "created_at": None} if "INSERT INTO public.workflow_requests" in sql else {"id": uuid.uuid4()}))
    monkeypatch.setattr(canonical_router, "_insert_notification", lambda *_a, **_k: uuid.uuid4())
    monkeypatch.setattr(canonical_router, "_write_audit", lambda *_a, **_k: None)
    db = FakeDB()
    result = canonical_router.send_letter(
        {"employee_id": "86", "title": "خطاب", "html": "<p>hi</p>", "type": "custom"},
        request=None, actor={"account_id": uuid.uuid4(), "employee_id": "10", "role": "hr"}, db=db)
    assert not any("public.ariba_notif_files" in sql for sql, _ in db.statements)
    assert result["attachment"] is None


def notify_email_test_b64(data: bytes) -> str:
    import base64

    return base64.b64encode(data).decode("ascii")


def test_hr_bell_includes_the_hr_pool_and_an_employee_sees_only_their_own(monkeypatch):
    calls = []
    monkeypatch.setattr(canonical_router, "_rows", lambda _db, sql, **params: calls.append((sql, params)) or [])
    canonical_router.notifications(actor={"role": "hr", "employee_id": "10"}, db=object())
    assert "ariba_hr_pool()" in calls[0][0]
    assert calls[0][1] == {"e": "10", "hr": True}
    calls.clear()
    canonical_router.notifications(actor={"role": "employee", "employee_id": "71"}, db=object())
    assert calls[0][1] == {"e": "71", "hr": False}


def test_marking_all_read_includes_the_pool_only_for_hr():
    db = FakeDB()
    canonical_router.mark_notifications_read(actor={"role": "hr", "employee_id": "10"}, db=db)
    sql, params = db.statements[0]
    assert "SET read_at=now()" in sql and "ariba_hr_pool()" in sql
    assert params == {"e": "10", "hr": True}
    db = FakeDB()
    canonical_router.mark_notifications_read(actor={"role": "employee", "employee_id": "71"}, db=db)
    assert db.statements[0][1] == {"e": "71", "hr": False}
