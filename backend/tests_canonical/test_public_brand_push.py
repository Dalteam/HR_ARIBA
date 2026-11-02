"""The public brand and the device tokens: B1–B3 and T1–T4, answered without a database.

Two surfaces that exist for one phone each: a phone that has **not** signed in still has to know
what the company looks like (`GET /public/brand` — the only route in this API without a token), and
a phone that has signed in has to be able to leave its Expo token somewhere
(`POST`/`GET`/`DELETE /me/push-token`). Neither sends anything: the switch that will gate a sender
ships off, and there is no sender to gate.

What this file is really about is what the two routes refuse to do:

* the brand answer is a **closed** envelope — five settings keys, named one by one, and a field list
  that drops anything it does not recognise, so `ariba_app_settings`' other rows (the HR signer's
  signature and stamp, the letterhead, the medical form, `doc_sign_cfg`, …) cannot reach a caller
  who has no session at all (B1/B2);
* it is **cached** with an `ETag` and a cap per image, because an unauthenticated route that rebuilds
  a 46 KB logo on every app launch is a file server nobody asked for (B3);
* a token is **one account's** secret: registering is an upsert, the read never returns the token
  text, somebody else's token is `404` and removes nothing, and logout / disable / a forced password
  reset take it away (T1–T3).

`FakeDB` answers the statements the two services issue (the recording style
`test_signing_surface.World` uses) and keeps every SQL string it saw, because half of what this file
proves is *which rows were never read*.
"""

from __future__ import annotations

import asyncio
import base64
import inspect
import json
import uuid
from types import SimpleNamespace

import pytest

from app.core.errors import ApiError
from app.routers import canonical
from app.routers import public as public_router
from app.routers import push as push_router
from app.services import brand, push

ACCOUNT = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
OTHER_ACCOUNT = uuid.UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
EMP = {"employee_id": "emp1", "account_id": ACCOUNT, "role": "employee", "name_ar": "موظف أول",
       "username": "emp1", "token": "session-1"}
OTHER = {"employee_id": "emp2", "account_id": OTHER_ACCOUNT, "role": "employee", "name_ar": "موظف آخر",
         "username": "emp2", "token": "session-2"}
HR = {"employee_id": "hr", "account_id": uuid.uuid4(), "role": "hr", "name_ar": "موارد بشرية",
      "username": "hr", "token": "session-hr"}
PNG = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 8).decode()
TOKEN = "ExponentPushToken[smoke_abcdefghijklmnop]"
OTHER_TOKEN = "ExponentPushToken[smoke_qrstuvwxyzabcdef]"


def refused(exc_info, status: int, code: str) -> None:
    assert (exc_info.value.status, exc_info.value.code) == (status, code), exc_info.value.message


class FakeResult:
    """What `Session.execute` hands back: rows by mapping, one scalar, a rowcount."""

    def __init__(self, rows=(), scalar=None, rowcount=None):
        self._rows = list(rows)
        self._scalar = scalar
        self._rowcount = len(self._rows) if rowcount is None else rowcount

    def mappings(self):
        return self

    def first(self):
        return self._rows[0] if self._rows else None

    def __iter__(self):
        return iter(self._rows)

    def scalar(self):
        return self._scalar

    @property
    def rowcount(self):
        return self._rowcount


class FakeDB:
    """Answers the two services' statements and records every one of them."""

    def __init__(self, settings=None, tokens=None, owned=(), devices=0):
        self.settings = dict(settings or {})          # settings key -> jsonb value
        self.tokens = dict(tokens or {})              # token -> {"account_id": ..., "platform": ...}
        self.owned = list(owned)                      # what the caller's own-device read answers
        self.devices = devices
        self.statements: list[tuple[str, dict]] = []
        self.commits = 0

    def execute(self, statement, params=None):
        sql = " ".join(str(statement).split())
        params = dict(params or {})
        self.statements.append((sql, params))
        if "FROM public.ariba_app_settings WHERE key=:key" in sql:
            key = params.get("key")
            return FakeResult([{"value": self.settings[key]}] if key in self.settings else [])
        if "UPDATE public.ariba_app_settings" in sql:      # `_set_app_setting`, so a write reads back
            self.settings[params["k"]] = json.loads(params["v"])
            return FakeResult(rowcount=1)
        if "count(*)" in sql and "ariba_push_tokens" in sql:
            return FakeResult(scalar=self.devices)
        if "FROM public.ariba_push_tokens t" in sql:
            return FakeResult(self.owned)
        if "SELECT account_id FROM public.ariba_push_tokens WHERE token=:token" in sql:
            owner = self.tokens.get(params.get("token"))
            return FakeResult([{"account_id": owner["account_id"]}] if owner else [])
        return FakeResult(rowcount=1)

    def scalar(self, statement, params=None):
        sql = " ".join(str(statement).split())
        self.statements.append((sql, dict(params or {})))
        return self.devices if "ariba_push_tokens" in sql else 1  # 1 = the roles lookup succeeds

    def commit(self):
        self.commits += 1

    def wrote(self, needle: str) -> list[tuple[str, dict]]:
        return [(sql, params) for sql, params in self.statements if needle in sql]

    def keys_read(self) -> list[str]:
        return [params.get("key") for sql, params in self.statements
                if "FROM public.ariba_app_settings WHERE key=:key" in sql]


def settings(**over) -> dict:
    """The four rows the brand route may read, in the shape the real database stores them."""
    rows = {
        "company_names": {"coAr": "شركة اريبا لخدمات الأعمال", "coEn": "Ariba Business Solutions",
                          "updated": 1791352154620},
        "brand_colors": {"p": "#004d3d", "s": "#f4f0e4", "a": "", "updated": 1791355761817},
        "company_logo": {"data": PNG, "name": "لوجو_ابيض_اريبا.png", "updated": 1791359795647},
        "punch_watermark": {"data": PNG, "name": "علامة_اللوجو.png", "updated": 1791353572397},
    }
    rows.update(over)
    return rows


def request(headers: dict | None = None) -> SimpleNamespace:
    return SimpleNamespace(headers=dict(headers or {}))


# ---------------------------------------------------------------- the envelope (B1, B2)
def test_the_envelope_is_the_closed_field_list():
    """B1: four keys at the top, and inside `brand` only what `theme.tsx` reads."""
    db = FakeDB(settings=settings(brand_colors={
        "p": "#004d3d", "s": "#f4f0e4", "a": "", "hero": "#0a5c4a", "heroImage": PNG,
        "punch": PNG, "reset": True, "updated": 1791355761817}))
    body = brand.payload(db)
    assert set(body) == {"brand", "names", "logo", "appLogo"}
    assert set(body["brand"]) == {"p", "s", "hero", "heroImage", "punch", "reset"}  # `a` is empty
    assert body["brand"]["p"] == "#004d3d" and body["brand"]["reset"] is True
    assert body["names"] == {"coAr": "شركة اريبا لخدمات الأعمال", "coEn": "Ariba Business Solutions"}
    assert body["logo"] == PNG and body["appLogo"] == PNG


def test_only_the_five_named_keys_are_ever_read():
    """B2: `ariba_app_settings` also holds `hr_signer` (a 234 KB signature), the letterhead, the
    medical form and every switch; the brand route asks for five keys and no others."""
    db = FakeDB(settings=settings())
    brand.payload(db)
    assert db.keys_read() == ["company_names", "brand_colors", "company_logo", "app_logo",
                              "punch_watermark"]
    assert set(db.keys_read()) == set(brand.KEYS)
    for forbidden in ("hr_signer", "letterhead", "medical_form", "doc_sign_cfg", "ins_settings",
                      "workflow_config", "app_links", "push_config", "notify_email_since"):
        assert forbidden not in db.keys_read()


def test_the_stored_row_keeps_its_other_fields_on_the_server():
    """B2: `company_logo` is `{data, name, updated}` — only `data` leaves, and not its file name."""
    db = FakeDB(settings=settings())
    dump = json.dumps(brand.payload(db), ensure_ascii=False)
    assert PNG in dump
    assert "لوجو_ابيض_اريبا" not in dump and "علامة_اللوجو" not in dump
    assert "1791359795647" not in dump and "1791353572397" not in dump
    assert "updated" not in dump


def test_a_colour_that_does_not_parse_is_dropped_not_passed_through():
    db = FakeDB(settings=settings(brand_colors={"p": "red", "s": "#12345", "a": 5, "hero": "#abc"},
                                  punch_watermark={}))
    body = brand.payload(db)
    assert body["brand"] == {"hero": "#abc"}  # only the one that is a hex colour


def test_an_image_must_be_an_embedded_raster():
    """`theme.tsx` and the payslip both test `/^data:image\\//`; an SVG can carry script, so it is out."""
    hostile = ["https://evil.example/logo.png", "javascript:alert(1)", "data:text/html;base64,PGI+",
               "data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+",
               "data:image/png;base64,", "not an image at all", None, 42]
    for bad in hostile:
        db = FakeDB(settings=settings(company_logo={"data": bad}, punch_watermark={"data": bad}))
        body = brand.payload(db)
        assert body["logo"] is None and body["appLogo"] is None, bad
        assert "punch" not in body["brand"], bad


def test_an_image_over_the_cap_is_absent_rather_than_truncated():
    """B3: a 46 KB logo is normal; a 5 MB setting row must not become a download on every launch."""
    huge = "data:image/png;base64," + "A" * (brand.MAX_IMAGE_CHARS + 4)
    db = FakeDB(settings=settings(company_logo={"data": huge}, punch_watermark={"data": huge},
                                  brand_colors={"p": "#004d3d", "punch": huge}))
    body = brand.payload(db)
    assert body["logo"] is None and body["appLogo"] is None and "punch" not in body["brand"]
    # just under the cap is served untouched: the ceiling is a guard, not a target
    ok = "data:image/png;base64," + "A" * (brand.MAX_IMAGE_CHARS - 64)
    assert brand.payload(FakeDB(settings=settings(company_logo={"data": ok})))["logo"] == ok


def test_the_punch_picture_prefers_the_colour_row_then_its_own_setting():
    """HR edits `brand_colors`; `punch_watermark` is where the older screens put the same picture."""
    jpeg = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff" + b"\x00" * 8).decode()
    db = FakeDB(settings=settings(brand_colors={"p": "#004d3d", "punch": jpeg}))
    assert brand.payload(db)["brand"]["punch"] == jpeg
    db = FakeDB(settings=settings())  # no punch in the colour row: the watermark setting answers
    assert brand.payload(db)["brand"]["punch"] == PNG


def test_the_app_logo_falls_back_to_the_company_logo_and_prefers_its_own():
    """`login.tsx` paints `appLogo`; until HR uploads a separate one the company logo is the app's."""
    assert brand.payload(FakeDB(settings=settings()))["appLogo"] == PNG
    own = "data:image/gif;base64," + base64.b64encode(b"GIF89a" + b"\x00" * 8).decode()
    db = FakeDB(settings=settings(app_logo={"data": own, "name": "app.png", "updated": 1}))
    body = brand.payload(db)
    assert body["appLogo"] == own and body["logo"] == PNG


def test_reset_must_be_literally_true():
    for value in ("true", 1, "yes", [True]):
        db = FakeDB(settings=settings(brand_colors={"p": "#004d3d", "reset": value}))
        assert "reset" not in brand.payload(db)["brand"], value
    db = FakeDB(settings=settings(brand_colors={"p": "#004d3d", "reset": True}))
    assert brand.payload(db)["brand"]["reset"] is True


def test_names_are_trimmed_and_capped():
    db = FakeDB(settings=settings(company_names={"coAr": "  " + "ا" * (brand.MAX_NAME_CHARS + 50) + " ",
                                                "coEn": 7}))
    names = brand.payload(db)["names"]
    assert names["coAr"] == "ا" * brand.MAX_NAME_CHARS and names["coEn"] == ""


# ---------------------------------------------------------------- the route and its cache (B3)
def test_the_brand_route_takes_no_token():
    """It is the login screen that reads it, so it cannot depend on a session."""
    code = inspect.getsource(public_router.public_brand).split('"""')[-1]   # the code, not the prose
    assert "current_actor" not in code and "Authorization" not in code and "Header" not in code
    assert set(inspect.signature(public_router.public_brand).parameters) == {"request", "db"}


def test_the_route_answers_the_envelope_with_a_public_cache_and_an_etag():
    db = FakeDB(settings=settings())
    response = public_router.public_brand(request=request(), db=db)
    assert response.status_code == 200
    assert json.loads(response.body) == brand.payload(FakeDB(settings=settings()))
    assert response.headers["cache-control"] == f"public, max-age={brand.CACHE_SECONDS}, must-revalidate"
    tag = response.headers["etag"]
    assert tag.startswith('"') and tag.endswith('"') and len(tag) == 34


def test_the_route_answers_304_to_its_own_etag_and_200_to_anything_else():
    db = FakeDB(settings=settings())
    tag = public_router.public_brand(request=request(), db=db).headers["etag"]
    for sent in (tag, "W/" + tag, tag + ', "other"', "*"):
        response = public_router.public_brand(request=request({"if-none-match": sent}), db=db)
        assert response.status_code == 304 and response.body == b"", sent
        assert response.headers["etag"] == tag and "max-age" in response.headers["cache-control"]
    for sent in ('"stale"', "", "not-an-etag"):
        response = public_router.public_brand(request=request({"if-none-match": sent}), db=db)
        assert response.status_code == 200 and response.body, sent


def test_the_etag_moves_when_the_brand_moves():
    first = public_router.public_brand(request=request(), db=FakeDB(settings=settings())).headers["etag"]
    second = public_router.public_brand(request=request(),
                                        db=FakeDB(settings=settings(brand_colors={"p": "#111111"})))
    assert first != second.headers["etag"]


def _through_the_middleware(path: str, headers: dict):
    """One response through `core.security.SecurityHeadersMiddleware`, without a server."""
    from starlette.requests import Request
    from starlette.responses import Response

    from app.core.security import SecurityHeadersMiddleware

    req = Request({"type": "http", "method": "GET", "path": path, "headers": [], "state": {}})

    async def call_next(_request):
        return Response(content=b"{}", media_type="application/json", headers=dict(headers))

    return asyncio.run(SecurityHeadersMiddleware(app=None).dispatch(req, call_next))


def test_the_middleware_keeps_the_brand_cache_and_forbids_caching_everywhere_else():
    kept = f"public, max-age={brand.CACHE_SECONDS}, must-revalidate"
    response = _through_the_middleware("/api/v1/public/brand", {"Cache-Control": kept, "ETag": '"x"'})
    assert response.headers["cache-control"] == kept and response.headers["etag"] == '"x"'
    assert response.headers["content-security-policy"] == "default-src 'none'; frame-ancestors 'none'"
    response = _through_the_middleware("/api/v1/me", {})
    assert response.headers["cache-control"] == "no-store"      # every other answer, as before


# ---------------------------------------------------------------- the device token (T1, T2)
def audit(monkeypatch) -> list[tuple]:
    """Replace `canonical._write_audit` so an audit row is a tuple instead of three statements."""
    rows: list[tuple] = []
    monkeypatch.setattr(canonical, "_write_audit",
                        lambda _db, actor, _req, module, action, entity, entity_id, **kw:
                        rows.append((module, action, entity, entity_id, kw.get("details"))))
    return rows


def register(db: FakeDB, body: dict, actor: dict = EMP) -> dict:
    return push_router.register_push_token(body, request=None, actor=dict(actor), db=db)


def test_a_registration_is_an_upsert_for_the_caller(monkeypatch):
    db = FakeDB()
    rows = audit(monkeypatch)
    assert register(db, {"token": TOKEN, "platform": "ios"}) == {"ok": True}
    (sql, params), = db.wrote("INSERT INTO public.ariba_push_tokens")
    assert "ON CONFLICT (token) DO UPDATE" in sql and "account_id=EXCLUDED.account_id" in sql
    assert params == {"token": TOKEN, "account_id": ACCOUNT, "platform": "ios"}
    assert rows == [("push", "push_token_register", "account", ACCOUNT, {"platform": "ios"})]
    assert TOKEN not in json.dumps(rows, default=str)   # S9's principle: never the credential
    assert db.commits == 1


def test_a_token_that_is_not_an_expo_token_is_refused_before_anything_is_written(monkeypatch):
    db = FakeDB()
    audit(monkeypatch)
    bad = [None, "", "   ", "abc", "ExponentPushToken[]", "ExponentPushToken[abc]",
           "expopushtoken[abcdefgh]", "ExponentPushToken[abc def ghij]", "fcm:abcdefghijklmnop",
           "ExponentPushToken[" + "a" * push.TOKEN_MAX_CHARS + "]", 42, {"token": TOKEN}]
    for value in bad:
        with pytest.raises(ApiError) as exc:
            register(db, {"token": value, "platform": "ios"})
        refused(exc, 422, "invalid_token")
    assert db.statements == [] and db.commits == 0


def test_the_platform_is_android_or_ios(monkeypatch):
    db = FakeDB()
    audit(monkeypatch)
    for value in (None, "", "web", "windows", "IOS X", 5):
        with pytest.raises(ApiError) as exc:
            register(db, {"token": TOKEN, "platform": value})
        refused(exc, 422, "invalid_platform")
    assert db.statements == []
    assert register(db, {"token": TOKEN, "platform": "Android"}) == {"ok": True}  # Platform.OS upper-cased


def test_the_read_is_the_callers_own_and_never_carries_the_token():
    """T2: a device list is `platform` + two dates. The token is a credential, not a field."""
    owned = [{"platform": "ios", "created_at": "2026-11-02T09:00:00+00:00",
              "last_seen_at": "2026-11-02T09:00:00+00:00"}]
    db = FakeDB(owned=owned)
    answer = push_router.list_push_tokens(actor=dict(EMP), db=db)
    assert answer == {"ok": True, "enabled": False, "items": owned}
    assert "token" not in json.dumps(answer)
    (sql, params), = db.wrote("FROM public.ariba_push_tokens t")
    assert params == {"account_id": ACCOUNT}
    assert "t.token" not in sql and "a.active" in sql     # a disabled account's rows never appear


def test_the_read_takes_no_account_parameter():
    """P1's shape: the account is the token's, and there is no way to ask for somebody else's."""
    assert set(inspect.signature(push_router.list_push_tokens).parameters) == {"actor", "db"}
    assert "Query" not in inspect.getsource(push_router.list_push_tokens)


def test_deleting_somebody_elses_token_is_404_and_removes_nothing(monkeypatch):
    db = FakeDB(tokens={OTHER_TOKEN: {"account_id": OTHER_ACCOUNT, "platform": "ios"}})
    audits = audit(monkeypatch)
    with pytest.raises(ApiError) as exc:
        push_router.delete_push_token(request=None, body={"token": OTHER_TOKEN}, actor=dict(EMP), db=db)
    refused(exc, 404, "not_found")
    assert db.wrote("DELETE FROM public.ariba_push_tokens") == []
    assert db.commits == 0 and audits == []


def test_deleting_an_unknown_token_is_the_same_404():
    db = FakeDB()
    with pytest.raises(ApiError) as exc:
        push_router.delete_push_token(request=None, body={"token": TOKEN}, actor=dict(EMP), db=db)
    refused(exc, 404, "not_found")
    assert db.wrote("DELETE FROM public.ariba_push_tokens") == []


def test_deleting_my_own_token_removes_exactly_that_row(monkeypatch):
    db = FakeDB(tokens={TOKEN: {"account_id": ACCOUNT, "platform": "ios"}})
    rows = audit(monkeypatch)
    answer = push_router.delete_push_token(request=None, body={"token": TOKEN}, actor=dict(EMP), db=db)
    assert answer == {"ok": True, "removed": 1}
    (sql, params), = db.wrote("DELETE FROM public.ariba_push_tokens")
    assert "account_id=:account_id" in sql and params["account_id"] == ACCOUNT
    assert rows == [("push", "push_token_delete", "account", ACCOUNT, {"all": False, "count": 1})]
    assert TOKEN not in json.dumps(rows, default=str)


def test_signing_out_with_no_token_forgets_all_of_mine(monkeypatch):
    """`push.unregister(undefined)` sends `{}`: that phone stops receiving my notifications."""
    for body in ({}, None, {"token": ""}, {"token": None}):
        db = FakeDB()
        rows = audit(monkeypatch)
        assert push_router.delete_push_token(request=None, body=body, actor=dict(EMP),
                                             db=db)["removed"] == 1
        (sql, params), = db.wrote("DELETE FROM public.ariba_push_tokens")
        assert params == {"account_id": ACCOUNT} and "token" not in sql.split("WHERE")[1]
        assert rows == [("push", "push_token_delete", "account", ACCOUNT, {"all": True, "count": 1})]


# ---------------------------------------------------------------- it dies with the session (T3)
def test_logout_forgets_every_token_of_the_account(monkeypatch):
    db = FakeDB()
    audit(monkeypatch)
    canonical.logout(request=None, actor=dict(EMP), db=db)
    assert db.wrote("DELETE FROM public.ariba_sessions WHERE token=:token")
    (sql, params), = db.wrote("DELETE FROM public.ariba_push_tokens")
    assert params == {"account_id": ACCOUNT} and db.commits == 1


def _account(db=None, **over) -> dict:
    row = {"id": ACCOUNT, "username": "emp1", "role": "employee", "active": True,
           "must_change": False, "employee_id": "emp1"}
    row.update(over)
    return row


def test_disabling_an_account_forgets_its_tokens(monkeypatch):
    db = FakeDB()
    audit(monkeypatch)
    target = _account()
    monkeypatch.setattr(canonical, "_row",
                        lambda _db, sql, **p: target if "ariba_auth_accounts WHERE id=:id" in sql else None)
    monkeypatch.setattr(canonical, "_account_user", lambda _db, account: {"id": str(account["id"])})
    canonical.update_account(ACCOUNT, {"is_active": False}, request=None, actor=dict(HR), db=db)
    assert db.wrote("UPDATE public.ariba_auth_accounts SET role=")
    (sql, params), = db.wrote("DELETE FROM public.ariba_push_tokens")
    assert params == {"account_id": ACCOUNT}


def test_an_account_that_stays_active_keeps_its_devices(monkeypatch):
    db = FakeDB()
    audit(monkeypatch)
    target = _account()
    monkeypatch.setattr(canonical, "_row",
                        lambda _db, sql, **p: target if "ariba_auth_accounts WHERE id=:id" in sql else None)
    monkeypatch.setattr(canonical, "_account_user", lambda _db, account: {"id": str(account["id"])})
    canonical.update_account(ACCOUNT, {"is_active": True}, request=None, actor=dict(HR), db=db)
    assert db.wrote("DELETE FROM public.ariba_push_tokens") == []


def test_a_temporary_password_forgets_the_tokens_too(monkeypatch):
    db = FakeDB()
    audit(monkeypatch)
    target = _account()
    monkeypatch.setattr(canonical, "_row", lambda _db, sql, **p: target)
    monkeypatch.setattr(canonical, "_account_user", lambda _db, account: {"id": str(account["id"])})
    monkeypatch.setattr(canonical, "_hasher", SimpleNamespace(hash=lambda _password: "hashed"))
    canonical.temporary_password(ACCOUNT, request=None, actor=dict(HR), db=db)
    assert db.wrote("DELETE FROM public.ariba_sessions WHERE account_id=:id")
    (sql, params), = db.wrote("DELETE FROM public.ariba_push_tokens")
    assert params == {"account_id": ACCOUNT}


# ---------------------------------------------------------------- the switch, and no sender (T4)
def test_the_switch_is_off_until_hr_saves_it():
    assert push.enabled(FakeDB()) is False                                  # no row at all
    assert push.cfg(FakeDB(settings={"push_config": {"enabled": "true"}})) == {"enabled": False}
    assert push.cfg(FakeDB(settings={"push_config": {"enabled": 1}})) == {"enabled": False}
    assert push.cfg(FakeDB(settings={"push_config": {"enabled": True}})) == {"enabled": True}
    assert push.settings(FakeDB(settings={"push_config": {"enabled": True}}, devices=3)) == \
        {"enabled": True, "devices": 3}


def test_only_hr_reads_and_writes_the_switch(monkeypatch):
    db = FakeDB(settings=settings(), devices=2)
    audit(monkeypatch)
    for actor in (EMP, OTHER):
        for attempt in (lambda: push_router.get_push_settings(actor=dict(actor), db=db),
                        lambda: push_router.update_push_settings({"enabled": True}, request=None,
                                                                 actor=dict(actor), db=db)):
            with pytest.raises(ApiError) as exc:
                attempt()
            refused(exc, 403, "forbidden")
    assert db.wrote("ariba_app_settings") == []
    assert push_router.get_push_settings(actor=dict(HR), db=db) == {"enabled": False, "devices": 2}


def test_hr_saves_the_switch_and_it_is_audited(monkeypatch):
    db = FakeDB(settings=settings())
    rows = audit(monkeypatch)
    assert push_router.update_push_settings({"enabled": True}, request=None, actor=dict(HR),
                                            db=db) == {"enabled": True, "devices": 0}
    assert db.settings["push_config"] == {"enabled": True}
    assert rows == [("settings", "update", "ariba_app_settings", "push_config", {"enabled": True})]
    assert push_router.update_push_settings({"enabled": False}, request=None, actor=dict(HR),
                                            db=db)["enabled"] is False


def test_a_switch_that_is_not_a_boolean_is_refused(monkeypatch):
    db = FakeDB(settings=settings())
    audit(monkeypatch)
    for body in ({}, {"enabled": "yes"}, {"enabled": 1}, {"enabled": None}, {"enabled": "true"}):
        with pytest.raises(ApiError) as exc:
            push_router.update_push_settings(body, request=None, actor=dict(HR), db=db)
        refused(exc, 422, "invalid_request")
    assert db.wrote("ariba_app_settings") == []


def test_registering_while_the_switch_is_off_writes_one_row_and_nothing_else(monkeypatch):
    """T4: with sending off, a registration is storage — no bell, no e-mail, no outbound call."""
    db = FakeDB(settings={"push_config": {"enabled": False}})
    audit(monkeypatch)
    assert register(db, {"token": TOKEN, "platform": "android"}) == {"ok": True}
    written = [sql for sql, _ in db.statements]
    assert sum("INSERT INTO public.ariba_push_tokens" in sql for sql in written) == 1
    for forbidden in ("workflow_notifications", "ariba_mail_log", "ariba_notif_files", "ariba_tasks"):
        assert not any(forbidden in sql for sql in written), forbidden
    assert push.enabled(db) is False


def test_there_is_no_sender_yet():
    """The stage is class C: the module ships storage and a switch, and no way to send anything."""
    source = inspect.getsource(push)
    for forbidden in ("requests", "httpx", "urllib", "exp.host", "https://", "def send"):
        assert forbidden not in source, forbidden


# ---------------------------------------------------------------- the app's own contract
def test_the_paths_the_app_calls_are_the_paths_that_exist():
    from pathlib import Path

    port = (Path(__file__).resolve().parents[2] / "frontend" / "employee-app" / "src" / "lib"
            / "port.ts").read_text(encoding="utf-8")
    assert 'api<Brand>("/public/brand")' in port
    assert 'post<{ ok: boolean }>("/me/push-token", { token, platform })' in port
    assert '"/me/push-token", { method: "DELETE"' in port
    assert {route.path for route in public_router.router.routes} == {"/public/brand"}
    assert {(route.path, method) for route in push_router.router.routes for method in route.methods} == {
        ("/me/push-token", "POST"), ("/me/push-token", "GET"), ("/me/push-token", "DELETE"),
        ("/settings/push", "GET"), ("/settings/push", "PUT")}
