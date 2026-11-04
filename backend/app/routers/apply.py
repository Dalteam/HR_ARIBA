"""The public application form (صفحة التقديم) — the only routes without a token besides `/public/brand`.

    GET  /public/apply/{form_key}            is the form open, and does it need an invite?
    GET  /public/apply/invite/{token}        the state of one invite: ok / used / expired / revoked / invalid
    POST /public/apply/{form_key}            submit an application (the open form)
    POST /public/apply/invite/{token}        submit an application (a one-time invite)
    GET  /public/apply/medical-form          the medical form candidates download, base64 (5 MB cap)

`ariba_candidate_submit`, `ariba_candidate_submit_invite`, `ariba_candidate_submit_core`,
`ariba_candidate_invite_check` and `ariba_candidate_medical_form` are the specification, and the rules they
enforce are the whole of the public surface:

* **Open or invite-only.** `apply_invite_only` on → the open form refuses (`INVITE_ONLY`); the key must equal
  `apply_form_key` (`FORM_CLOSED` otherwise), so rotating the key closes every old link.
* **An invite is one use, and it expires.** `used` / `expired` / `revoked` / `invalid` are answered as a state,
  never as a 500, and a refused invite writes nothing.
* **What may be stored is a closed list** (`DATA_FIELDS`, 300 characters each) — an unknown field is dropped,
  not stored. A hidden `website` field is the honeypot: filled in, the answer looks like a success and nothing is
  written.
* **Files: PDF/JPG/PNG/WebP, at most 10, 6 MB each**, and the name is reduced to word characters.
* **Abuse limits** are the reference's: the same e-mail twice within 10 minutes and more than 200 submissions an
  hour are both refused, and the IP of the caller is stored with the row.

A new candidate rings the bell of `candidate_notify`, or of every active `hr`/`admin` account when that list is
empty — and never writes an audit row of the applicant's own (there is no account to attribute it to; HR's
review writes the audit rows).
"""

from __future__ import annotations

import base64
import json
import re
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.core.security import client_ip


def _invite(db: Session, token: str) -> dict[str, Any] | None:
    return canonical._row(db, "SELECT * FROM public.ariba_candidate_invites WHERE token=:t", t=token)


def _invite_state(row: dict[str, Any] | None) -> str:
    if not row:
        return "invalid"
    if row.get("revoked_at"):
        return "revoked"
    if row.get("used_at"):
        return "used"
    if row.get("expires_at") and row["expires_at"] <= datetime.now(UTC):
        return "expired"
    return "ok"


def _medical_form_file(db: Session) -> dict[str, Any] | None:
    value = cand._med_form(db)
    if not value or not value.get("base64"):
        return None
    return {"name": value.get("name"), "mime": value.get("mime"), "base64": value.get("base64")}


def _company(db: Session) -> dict[str, Any]:
    names = canonical._app_setting(db, "company_names") or {}
    return {"name_ar": names.get("coAr", ""), "name_en": names.get("coEn", "")}


def _clean_data(body: dict[str, Any]) -> dict[str, Any]:
    """Only `DATA_FIELDS`, each a string or a number cut to 300 characters."""
    data = body if isinstance(body, dict) else {}
    clean: dict[str, Any] = {}
    for key in cand.DATA_FIELDS:
        value = data.get(key)
        if isinstance(value, (str, int, float)) and not isinstance(value, bool):
            clean[key] = str(value).strip()[:300]
    return clean


def _validate(clean: dict[str, Any]) -> tuple[str, str]:
    name = str(clean.get("nameAr") or "").strip()
    email = str(clean.get("email") or "").strip().lower()
    if len(name) < 3:
        raise ApiError(422, "name_required", "الاسم مطلوب (٣ أحرف على الأقل)")
    if not cand._EMAIL.match(email):
        raise ApiError(422, "invalid_email", "البريد الإلكتروني غير صحيح")
    if not str(clean.get("mobile") or "").strip():
        raise ApiError(422, "mobile_required", "رقم الجوال مطلوب")
    return name, email


def _files_payload(raw: Any) -> list[dict[str, Any]]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ApiError(422, "validation_error", "files must be a list")
    if len(raw) > cand.MAX_FILES:
        raise ApiError(422, "too_many_files", "عدد الملفات غير مسموح (الحد 10)")
    checked = []
    for item in raw:
        if not isinstance(item, dict):
            raise ApiError(422, "validation_error", "each file must be an object")
        mime = str(item.get("mime") or "")
        if mime not in cand.FILE_MIMES:
            raise ApiError(422, "unsupported_type", "نوع الملف غير مدعوم (PDF/JPG/PNG فقط)")
        doc_type = str(item.get("type") or "other")
        if doc_type not in cand.FILE_TYPES:
            raise ApiError(422, "unknown_doc_type", "نوع المستند غير معروف")
        b64 = str(item.get("base64") or "").strip()
        try:
            raw = base64.b64decode(b64, validate=True)
        except (ValueError, TypeError) as exc:
            raise ApiError(422, "invalid_file", "الملف غير صالح") from exc
        size = len(raw)
        if size > cand.MAX_FILE_BYTES:
            raise ApiError(413, "file_too_large", "الملف أكبر من 6MB")
        checked.append({"type": doc_type, "mime": mime, "base64": b64, "size": size,
                        "name": _SAFE_NAME.sub("_", str(item.get("name") or "file"))[:120]})
    return checked


def _notify_hr(db: Session, title: str, body: str) -> None:
    """The bell of `candidate_notify`, or of every active hr/admin account when that list is empty."""
    targets = cand._notify_ids(db)
    if not targets:
        targets = [r["employee_id"] for r in canonical._rows(db, """SELECT DISTINCT a.employee_id
            FROM public.ariba_auth_accounts a JOIN public.employee_directory d ON d.employee_id=a.employee_id
            WHERE a.role IN ('hr','admin') AND a.active AND d.active AND a.employee_id IS NOT NULL""")]
    for employee_id in targets:
        canonical._insert_notification(db, employee_id, None, title, body, "hr", "request")

from app.database import get_db
from app.routers import candidates as cand
from app.routers import canonical

router = APIRouter(prefix="/public/apply", tags=["apply"])

#: The reference's file-name guard: word characters, dots, dashes, spaces and Arabic letters survive.
_SAFE_NAME = re.compile(r"[^\w.\- \u0600-\u06FF]", re.UNICODE)


def _store(db: Session, clean: dict[str, Any], files: list[dict[str, Any]], source: str, email: str,
           ip: str | None) -> dict[str, Any]:
    """Insert the candidate and its files, then tell HR. `ariba_candidate_submit_core`, in Python."""
    recent = canonical._row(db, """SELECT 1 AS x FROM public.ariba_candidates
        WHERE lower(data->>'email')=:e AND submitted_at > now() - interval '10 minutes'""", e=email)
    if recent:
        raise ApiError(429, "rate_limited", "تم استلام طلبك قبل قليل، حاول لاحقاً")
    hourly = int(db.scalar(text("SELECT count(*) FROM public.ariba_candidates WHERE submitted_at > now() - interval '1 hour'")) or 0)
    if hourly > 200:
        raise ApiError(429, "too_many", "تم استلام عدد كبير من الطلبات، حاول بعد قليل")
    ref = cand._new_ref()
    # `ariba_candidates.email` is generated from `data->>'email'` in this copy — never inserted.
    row = canonical._row(db, """INSERT INTO public.ariba_candidates(ref_token, data, source, ip)
        VALUES (:ref, CAST(:data AS jsonb), :source, CAST(:ip AS inet)) RETURNING id, ref_token""",
        ref=ref, data=json.dumps(clean, ensure_ascii=False), source=source, ip=ip or None)
    column = cand._file_column(db)
    for item in files:
        # `file_size` is generated from the bytes in this schema — never inserted.
        db.execute(text(f"""INSERT INTO public.ariba_candidate_files(candidate_id, {column}, file_name, mime_type,
                file_data) VALUES (CAST(:id AS uuid), :type, :name, :mime, decode(:b64,'base64'))"""),
            {"id": row["id"], "type": item["type"], "name": item["name"], "mime": item["mime"],
             "b64": item["base64"]})
    name = clean.get("nameAr") or ""
    position = clean.get("position") or "دون تحديد وظيفة"
    _notify_hr(db, f"📥 طلب توظيف جديد: {name}",
               f"{name} عبّأ بياناته وأرسل طلب توظيف ({position}) مع {len(files)} ملف — راجع تبويب المرشحين.")
    return {"ref": row["ref_token"], "files": len(files)}



@router.get("/medical-form")
def public_medical_form(form_key: str | None = None, invite: str | None = None, db: Session = Depends(get_db)):
    """The medical form, base64 — only for someone holding a live invite or the current public key."""
    allowed = False
    if invite:
        allowed = _invite_state(_invite(db, invite)) in ("ok", "used")
    elif form_key:
        allowed = form_key == cand._flag(db, "apply_form_key")
    return {"ok": allowed, "file": _medical_form_file(db) if allowed else None}


@router.get("/invite/{token}")
def invite_state(token: str, db: Session = Depends(get_db)):
    """`{status: ok|used|expired|revoked|invalid}` — the page's first question."""
    row = _invite(db, token)
    state = _invite_state(row)
    if state == "ok":
        db.execute(text("""UPDATE public.ariba_candidate_invites SET opened_at=coalesce(opened_at, now())
            WHERE token=:t"""), {"t": token})
        db.commit()
    return {"status": state, "label": (row or {}).get("label"), "expires_at": (row or {}).get("expires_at"),
            "medical_form": bool(_medical_form_file(db))}


@router.get("/{form_key}")
def open_form(form_key: str, db: Session = Depends(get_db)):
    """Is the open form accepting applications under this key?"""
    invite_only = cand._truthy(cand._flag(db, "apply_invite_only"))
    current = cand._flag(db, "apply_form_key")
    reason = "invite_only" if invite_only else ("closed" if not current or form_key != current else None)
    return {"ok": reason is None, "invite_only": invite_only, "reason": reason,
            "company": _company(db), "medical_form": bool(_medical_form_file(db))}


@router.post("/{form_key}", status_code=201)
def submit(form_key: str, body: dict[str, Any], request: Request, db: Session = Depends(get_db)):
    """An application through the open form."""
    if cand._truthy(cand._flag(db, "apply_invite_only")):
        raise ApiError(409, "invite_only", "التقديم متاح بروابط الدعوة فقط حاليًا")
    current = cand._flag(db, "apply_form_key")
    if not current or form_key != current:
        raise ApiError(409, "form_closed", "نموذج التقديم مغلق أو تم تغيير رابطه")
    if not isinstance(body, dict):
        raise ApiError(422, "bad_data", "البيانات غير صالحة")
    if str(body.get("website") or "").strip():  # honeypot: answer like a success, store nothing
        return {"ref": "x", "files": 0}
    clean = _clean_data(body.get("data"))
    _, email = _validate(clean)
    files = _files_payload(body.get("files"))
    result = _store(db, clean, files, "public", email, client_ip(request))
    db.commit()
    return result


@router.post("/invite/{token}", status_code=201)
def submit_invite(token: str, body: dict[str, Any], request: Request, db: Session = Depends(get_db)):
    """An application through a one-time invite; the invite is spent only if the application is stored."""
    row = canonical._row(db, "SELECT * FROM public.ariba_candidate_invites WHERE token=:t FOR UPDATE", t=token)
    state = _invite_state(row)
    if state in ("invalid", "revoked"):
        raise ApiError(409, "invite_invalid", "رابط الدعوة غير صالح")
    if state == "used":
        raise ApiError(409, "invite_used", "تم استخدام رابط الدعوة بالفعل")
    if state == "expired":
        raise ApiError(409, "invite_expired", "انتهت صلاحية رابط الدعوة")
    if not isinstance(body, dict):
        raise ApiError(422, "bad_data", "البيانات غير صالحة")
    if str(body.get("website") or "").strip():
        return {"ref": "x", "files": 0}
    clean = _clean_data(body.get("data"))
    if row.get("label"):
        clean["inviteLabel"] = str(row["label"])[:120]
    _, email = _validate(clean)
    files = _files_payload(body.get("files"))
    result = _store(db, clean, files, "invite", email, client_ip(request))
    db.execute(text("""UPDATE public.ariba_candidate_invites SET used_at=now(), opened_at=coalesce(opened_at, now()),
        candidate_id=(SELECT id FROM public.ariba_candidates WHERE ref_token=:ref) WHERE token=:t"""),
        {"ref": result["ref"], "t": token})
    db.commit()
    return result

