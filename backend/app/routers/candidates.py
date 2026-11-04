"""The candidates screen (المرشحون): the review list, accept/reject, the invites and the medical form.

    GET    /candidates                       the list and its counts, optionally by status
    GET    /candidates/{id_or_ref}           one candidate (uuid or the 24-hex ref the drawer shows)
    GET    /candidates/files/{file_id}       one uploaded file, base64 (`ariba_hr_candidate_file`)
    POST   /candidates/{id}/accept           turn a candidate into an employee and move their files over
    POST   /candidates/{id}/reject           reject with a note (the screen requires one)
    GET    /candidates/invites               the one-time links, the mode switch and the link lifetime
    POST   /candidates/invites               a new invite
    POST   /candidates/invites/{token}/revoke
    GET    /candidates/apply-mode            {invite_only, hours, form_key}
    PUT    /candidates/apply-mode            HR flips the switch and the lifetime
    POST   /candidates/apply-key             rotate the public form key (the old link stops working)
    GET    /candidates/medical-form          the file candidates download, and who is told of a new one
    PUT    /candidates/medical-form          upload or remove it
    PUT    /candidates/notify-list           which employees hear about every new candidate

The rules are the design's own functions (`ariba_hr_candidates*`, `ariba_hr_invite*`, `ariba_hr_apply_*`,
`ariba_hr_medical_form_*`), ported to Python because the installed copies need the Supabase `auth` schema
(`ariba_session_row`) that this database does not have. Three places where this copy differs, on purpose:

* **The apply switch lives in `ariba_security_flags`**, not `ariba_app_settings`: `apply_invite_only`,
  `apply_invite_hours` and `apply_form_key` are read with `ariba_flag()` in the reference. Our database already
  carries the first two (as `'true'`/`'false'`), so both spellings are read as booleans here.
* **A moved candidate file becomes a `document_types` code**, never the Arabic label: this schema has
  `doc_type_fk` on `ariba_documents.document_type` (the design's database has no such key).
* **Accept takes the employee body**, not only an id: `POST /employees` is the one door that knows how to create
  an employee here (numbers, username, salary figures), so this route calls it and then moves the files.

Every write is audited (`ariba_audit_log`, module `employees`) and a new candidate rings the bell of the people
named in `candidate_notify` — or of every active `hr`/`admin` account when that list is empty.
"""

from __future__ import annotations

import base64
import re
import secrets
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.database import get_db
from app.routers import canonical

router = APIRouter(tags=["candidates"])

#: The screen's three statuses (a candidate is never edited, only reviewed).
STATUSES = ("new", "accepted", "rejected")

#: The file types the public form accepts, and the `document_types` code each becomes on accept.
FILE_TYPES = ("photo", "cv", "id", "passport", "experience", "certificate", "national_address", "insurance", "other")
DOC_TYPE_CODE = {"photo": "photo", "cv": "cv", "id": "id", "passport": "passport", "experience": "experience",
                 "certificate": "certificate", "national_address": "national_address", "insurance": "insurance",
                 "other": "other"}

#: What a submission may carry (the reference's `allowed` array, in the same order).
DATA_FIELDS = ("nameAr", "nameEn", "nationality", "dob", "gender", "mobile", "email", "idNo", "idExpiry",
               "passportNo", "passportExpiry", "position", "education", "experienceYears", "currentEmployer",
               "expectedSalary", "address", "city", "bank", "iban", "accountNo", "notes", "availability")

#: The reference's file rules: PDF or an image, at most 10 files of 6 MB each.
FILE_MIMES = ("application/pdf", "image/jpeg", "image/png", "image/webp")
MAX_FILES, MAX_FILE_BYTES = 10, 6 * 1024 * 1024
MAX_MEDICAL_BYTES = 5 * 1024 * 1024
MEDICAL_MIMES = ("application/pdf", "application/msword",
                 "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                 "image/jpeg", "image/png")

#: The public form key / a candidate's ref are 24 hex characters.
_REF = re.compile(r"^[0-9a-f]{24}$")
_EMAIL = re.compile(r"^\S+@\S+\.\S+$")


def _reader(actor: dict[str, Any]) -> None:
    canonical._perm(actor, ("employees", "employees_admin"))


def _writer(actor: dict[str, Any]) -> None:
    canonical._perm(actor, ("employees", "employees_admin"), "edit")


def _truthy(value: Any) -> bool:
    """`ariba_security_flags` stores `'1'` in the design and `'true'` in this copy; both mean on."""
    return str(value or "").strip().lower() in ("1", "true", "on", "yes")


def _flag(db: Session, key: str) -> str | None:
    row = canonical._row(db, "SELECT value FROM public.ariba_security_flags WHERE key=:k", k=key)
    return (row or {}).get("value")


def _set_flag(db: Session, key: str, value: str) -> None:
    db.execute(text("""INSERT INTO public.ariba_security_flags(key, value) VALUES (:k, :v)
        ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value"""), {"k": key, "v": value})


def _hours(db: Session) -> int:
    """The invite lifetime in hours, clamped to 1…720 (30 days), 72 by default."""
    raw = _flag(db, "apply_invite_hours")
    try:
        hours = int(str(raw).strip())
    except (TypeError, ValueError):
        hours = 72
    return max(1, min(720, hours))


_FILE_COLUMN: str | None = None


def _file_column(db: Session) -> str:
    """`doc_type` in the design, `file_type` in this copy — resolved once, so both schemas work."""
    global _FILE_COLUMN
    if _FILE_COLUMN is None:
        row = canonical._row(db, """SELECT column_name FROM information_schema.columns
            WHERE table_schema='public' AND table_name='ariba_candidate_files'
              AND column_name IN ('doc_type','file_type') ORDER BY (column_name='doc_type') DESC LIMIT 1""")
        _FILE_COLUMN = (row or {}).get("column_name") or "file_type"
    return _FILE_COLUMN


def _new_ref() -> str:
    return secrets.token_hex(12)


def _med_form(db: Session) -> dict[str, Any] | None:
    value = canonical._app_setting(db, "medical_form")
    return value if isinstance(value, dict) else None


def _notify_ids(db: Session) -> list[str]:
    value = canonical._app_setting(db, "candidate_notify")
    ids = (value or {}).get("ids") if isinstance(value, dict) else None
    return [str(i) for i in ids] if isinstance(ids, list) else []


def _files(db: Session, candidate_id: str) -> list[dict[str, Any]]:
    column = _file_column(db)
    return canonical._rows(db, f"""SELECT id, {column} AS type, file_name AS name, mime_type AS mime,
            file_size AS size FROM public.ariba_candidate_files
        WHERE candidate_id=CAST(:id AS uuid) ORDER BY created_at""", id=candidate_id)


def _cand_json(candidate: dict[str, Any], files: list[dict[str, Any]]) -> dict[str, Any]:
    """`ariba_cand_json`: the row the screen reads, with its files, never the file bytes."""
    return {"id": candidate["id"], "ref": candidate["ref_token"], "status": candidate["status"],
            "data": candidate.get("data") or {}, "source": candidate.get("source"), "email": candidate.get("email"),
            "submitted_at": candidate["submitted_at"], "review_note": candidate.get("review_note"),
            "reviewed_at": candidate.get("reviewed_at"), "employee_id": candidate.get("employee_id"),
            "files": files}



@router.get("/candidates")
def list_candidates(status: str | None = None, q: str | None = None,
                    actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """Every candidate, newest first, with the three counters above the list."""
    _reader(actor)
    if status and status not in STATUSES:
        raise ApiError(422, "invalid_status", "status must be new, accepted or rejected")
    rows = canonical._rows(db, """SELECT * FROM public.ariba_candidates
        WHERE (CAST(:status AS text) IS NULL OR status=:status) ORDER BY submitted_at DESC""", status=status or None)
    if q and q.strip():
        needle = q.strip().lower()
        rows = [r for r in rows if needle in " ".join(str(v) for v in (r.get("data") or {}).values()).lower()
                or needle in str(r.get("ref_token") or "").lower()]
    candidates = [_cand_json(r, _files(db, r["id"])) for r in rows]
    counts = {"new": 0, "accepted": 0, "rejected": 0, "all": 0}
    for item in canonical._rows(db, "SELECT status, count(*)::int AS count FROM public.ariba_candidates GROUP BY status"):
        counts[item["status"]] = item["count"]
        counts["all"] += item["count"]
    return {"candidates": candidates, "counts": counts,
            "form_key": _flag(db, "apply_form_key"), "invite_only": _truthy(_flag(db, "apply_invite_only")),
            "hours": _hours(db), "medical_form": bool(_med_form(db))}


@router.get("/candidates/invites")
def list_invites(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """The last 100 invites with their state (open / used / expired / revoked)."""
    _reader(actor)
    now = datetime.now(UTC)
    rows = canonical._rows(db, """SELECT i.token, i.label, i.created_at, i.expires_at, i.opened_at, i.used_at,
            i.revoked_at, c.data->>'nameAr' AS candidate
        FROM public.ariba_candidate_invites i
        LEFT JOIN public.ariba_candidates c ON c.id = i.candidate_id
        ORDER BY i.created_at DESC LIMIT 100""")
    for row in rows:
        row["state"] = ("revoked" if row["revoked_at"] else "used" if row["used_at"]
                        else "expired" if row["expires_at"] and row["expires_at"] <= now else "open")
    return {"invites": rows, "invite_only": _truthy(_flag(db, "apply_invite_only")), "hours": _hours(db),
            "form_key": _flag(db, "apply_form_key")}


@router.post("/candidates/invites", status_code=201)
def create_invite(body: dict[str, Any], request: Request,
                  actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """One one-time link; the lifetime falls back to `apply_invite_hours`, clamped to 1…720 hours."""
    _writer(actor)
    hours = body.get("hours")
    if hours is not None:
        try:
            hours = max(1, min(720, int(hours)))
        except (TypeError, ValueError) as exc:
            raise ApiError(422, "validation_error", "hours must be a number") from exc
    else:
        hours = _hours(db)
    label = str(body.get("label") or "").strip()[:120] or None
    row = canonical._row(db, """INSERT INTO public.ariba_candidate_invites(token, label, created_by, expires_at)
        VALUES (:token, :label, :by, now() + make_interval(hours => :hours))
        RETURNING token, label, expires_at""",
        token=_new_ref(), label=label, by=actor.get("employee_id"), hours=hours)
    canonical._write_audit(db, actor, request, "employees", "candidate_invite", "ariba_candidate_invites",
                           row["token"], summary="إنشاء رابط تقديم لمرة واحدة", details={"hours": hours})
    db.commit()
    return {"token": row["token"], "label": row["label"], "expires_at": row["expires_at"], "hours": hours}


@router.post("/candidates/invites/{token}/revoke")
def revoke_invite(token: str, request: Request, actor: dict[str, Any] = Depends(canonical.current_actor),
                  db: Session = Depends(get_db)):
    """Revoke an invite that was never used (a used or already-revoked one is left as it is)."""
    _writer(actor)
    row = canonical._row(db, """UPDATE public.ariba_candidate_invites SET revoked_at=now()
        WHERE token=:t AND used_at IS NULL AND revoked_at IS NULL RETURNING token""", t=token)
    if not row:
        raise ApiError(404, "not_found", "الدعوة غير موجودة أو مستخدمة أو ملغاة بالفعل")
    canonical._write_audit(db, actor, request, "employees", "candidate_invite_revoke", "ariba_candidate_invites", token,
                           summary="إلغاء رابط تقديم")
    db.commit()
    return {"token": token, "revoked": True}


def _candidate(db: Session, candidate_id: str) -> dict[str, Any]:
    row = canonical._row(db, "SELECT * FROM public.ariba_candidates WHERE id=CAST(:id AS uuid)", id=candidate_id)
    if not row:
        raise ApiError(404, "not_found", "المرشح غير موجود")
    return row



@router.get("/candidates/apply-mode")
def get_apply_mode(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """The switch, the lifetime and the current public key."""
    _reader(actor)
    return {"invite_only": _truthy(_flag(db, "apply_invite_only")), "hours": _hours(db),
            "form_key": _flag(db, "apply_form_key")}


@router.put("/candidates/apply-mode")
def set_apply_mode(body: dict[str, Any], request: Request,
                   actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """«الاستمارة مفتوحة للجميع» on/off, and how long an invite lives."""
    _writer(actor)
    invite_only = body.get("invite_only")
    if not isinstance(invite_only, bool):
        raise ApiError(422, "validation_error", "invite_only must be true or false")
    _set_flag(db, "apply_invite_only", "1" if invite_only else "0")
    hours = body.get("hours")
    if hours is not None:
        try:
            _set_flag(db, "apply_invite_hours", str(max(1, min(720, int(hours)))))
        except (TypeError, ValueError) as exc:
            raise ApiError(422, "validation_error", "hours must be a number") from exc
    canonical._write_audit(db, actor, request, "settings", "apply_mode", "ariba_security_flags", "apply_invite_only",
                           summary=("تفعيل روابط التقديم لمرة واحدة فقط" if invite_only else "السماح بالرابط العام للتقديم"),
                           details={"hours": body.get("hours")})
    db.commit()
    return {"invite_only": _truthy(_flag(db, "apply_invite_only")), "hours": _hours(db),
            "form_key": _flag(db, "apply_form_key")}


@router.post("/candidates/apply-key")
def rotate_apply_key(request: Request, actor: dict[str, Any] = Depends(canonical.current_actor),
                     db: Session = Depends(get_db)):
    """A new public key: every link sent so far stops working, invites keep working."""
    _writer(actor)
    key = _new_ref()
    _set_flag(db, "apply_form_key", key)
    canonical._write_audit(db, actor, request, "settings", "apply_key_rotate", "ariba_security_flags", "apply_form_key",
                           summary="تغيير رابط نموذج التقديم")
    db.commit()
    return {"form_key": key}


@router.get("/candidates/medical-form")
def get_medical_form(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """The file candidates download («النموذج الطبي»), and who hears of a new candidate."""
    _reader(actor)
    value = _med_form(db) or {}
    return {"name": value.get("name"), "mime": value.get("mime"), "size": value.get("size"),
            "updated": value.get("updated"), "notify_ids": _notify_ids(db), "has_file": bool(value.get("base64"))}


@router.put("/candidates/medical-form")
def set_medical_form(body: dict[str, Any], request: Request,
                     actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """Upload (name + mime + base64, ≤ 5 MB) or remove (`remove: true`) the medical form."""
    _writer(actor)
    b64 = str(body.get("base64") or "").strip()
    if body.get("remove") or not b64:
        db.execute(text("DELETE FROM public.ariba_app_settings WHERE key='medical_form'"))
        canonical._write_audit(db, actor, request, "settings", "medical_form_remove", "ariba_app_settings", "medical_form",
                               summary="حذف النموذج الطبي")
        db.commit()
        return {"removed": True}
    mime = str(body.get("mime") or "").strip()
    if mime not in MEDICAL_MIMES:
        raise ApiError(422, "unsupported_type", "نوع الملف غير مدعوم (PDF أو Word أو صورة)")
    try:
        size = len(base64.b64decode(b64, validate=True))
    except (ValueError, TypeError) as exc:
        raise ApiError(422, "invalid_file", "الملف غير صالح") from exc
    if size > MAX_MEDICAL_BYTES:
        raise ApiError(413, "file_too_large", "الملف أكبر من 5MB")
    value = {"name": str(body.get("name") or "medical-form")[:120], "mime": mime, "base64": b64,
             "size": size, "updated": datetime.now(UTC).isoformat()}
    canonical._set_app_setting(db, "medical_form", value, actor)
    canonical._write_audit(db, actor, request, "settings", "medical_form", "ariba_app_settings", "medical_form",
                           summary="تحديث النموذج الطبي", details={"size": size, "mime": mime})
    db.commit()
    return {"name": value["name"], "mime": mime, "size": size, "updated": value["updated"]}


@router.put("/candidates/notify-list")
def set_notify_list(body: dict[str, Any], request: Request,
                    actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """Who hears about every new candidate (employee ids; empty means every active hr/admin account)."""
    _writer(actor)
    ids = body.get("ids")
    if ids is None:
        ids = []
    if not isinstance(ids, list) or len(ids) > 200:
        raise ApiError(422, "validation_error", "ids must be a list of at most 200 employee ids")
    clean = []
    for value in ids:
        employee_id = str(value).strip()
        if not employee_id:
            continue
        if not canonical._row(db, "SELECT 1 AS x FROM public.employee_directory WHERE employee_id=:e", e=employee_id):
            raise ApiError(422, "unknown_employee", f"الموظف {employee_id} غير موجود")
        if employee_id not in clean:
            clean.append(employee_id)
    canonical._set_app_setting(db, "candidate_notify", {"ids": clean}, actor)
    canonical._write_audit(db, actor, request, "settings", "candidate_notify", "ariba_app_settings", "candidate_notify",
                           summary="تحديد من يُبلَّغ بالمرشحين الجدد", details={"count": len(clean)})
    db.commit()
    return {"ids": clean}



@router.get("/candidates/files/{file_id}")
def candidate_file(file_id: str, actor: dict[str, Any] = Depends(canonical.current_actor),
                   db: Session = Depends(get_db)):
    """One uploaded file as base64 — the drawer opens it in a blob, never as a stored URL."""
    _reader(actor)
    try:
        uuid.UUID(file_id)
    except ValueError as exc:
        raise ApiError(422, "validation_error", "file_id must be a uuid") from exc
    row = canonical._row(db, """SELECT file_name, mime_type, file_data FROM public.ariba_candidate_files
        WHERE id=CAST(:id AS uuid)""", id=file_id)
    if not row:
        raise ApiError(404, "not_found", "الملف غير موجود")
    return {"name": row["file_name"], "mime": row["mime_type"],
            "base64": base64.b64encode(bytes(row["file_data"])).decode("ascii")}


@router.post("/candidates/{candidate_id}/accept")
def accept_candidate(candidate_id: str, body: dict[str, Any], request: Request,
                     actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """Accept: create the employee (or use the id given), move every file to their documents, audit it."""
    _writer(actor)
    candidate = _candidate(db, candidate_id)
    if candidate["status"] != "new":
        raise ApiError(409, "bad_status", "تمت مراجعة هذا المرشح مسبقاً")
    employee_id = str(body.get("employee_id") or "").strip() or None
    employee = body.get("employee")
    if employee_id:
        if not canonical._row(db, "SELECT 1 AS x FROM public.employee_directory WHERE employee_id=:e", e=employee_id):
            raise ApiError(422, "employee_not_created", "الموظف غير موجود — أنشئه أولًا أو أرسل بياناته")
    else:
        if not isinstance(employee, dict):
            raise ApiError(422, "validation_error", "Send the employee body (or an existing employee_id)")
        created = canonical.create_employee(body=employee, request=request, actor=actor, db=db)
        employee_id = created["id"]
    moved = 0
    column = _file_column(db)
    for row in canonical._rows(db, f"""SELECT {column} AS type, file_name, mime_type, file_data
            FROM public.ariba_candidate_files WHERE candidate_id=CAST(:id AS uuid)""", id=candidate_id):
        db.execute(text("""INSERT INTO public.ariba_documents
            (employee_id, document_type, file_name, mime_type, file_data, uploaded_by)
            VALUES (:e, :type, :name, :mime, :data, :by)"""), {
            "e": employee_id, "type": DOC_TYPE_CODE.get(row["type"], "other"), "name": row["file_name"],
            "mime": row["mime_type"], "data": row["file_data"], "by": actor.get("employee_id")})
        moved += 1
    db.execute(text("""UPDATE public.ariba_candidates SET status='accepted', reviewed_by=:by, reviewed_at=now(),
        review_note=:note, employee_id=:e WHERE id=CAST(:id AS uuid)"""),
        {"by": actor.get("employee_id"), "note": body.get("note") or None, "e": employee_id, "id": candidate_id})
    canonical._write_audit(db, actor, request, "employees", "candidate_accept", "ariba_candidates", candidate_id,
                           summary="قبول مرشح وإضافته كموظف",
                           details={"employee": employee_id, "files": moved})
    db.commit()
    return {"candidate_id": candidate_id, "employee_id": employee_id, "moved": moved, "status": "accepted"}


@router.post("/candidates/{candidate_id}/reject")
def reject_candidate(candidate_id: str, body: dict[str, Any], request: Request,
                     actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """Reject with a note (the screen requires one) — the files stay for the record until HR deletes them."""
    _writer(actor)
    note = str(body.get("note") or "").strip()
    if not note:
        raise ApiError(400, "note_required", "سبب الرفض مطلوب")
    candidate = _candidate(db, candidate_id)
    if candidate["status"] != "new":
        raise ApiError(409, "bad_status", "تمت مراجعة هذا المرشح مسبقاً")
    db.execute(text("""UPDATE public.ariba_candidates SET status='rejected', reviewed_by=:by, reviewed_at=now(),
        review_note=:note WHERE id=CAST(:id AS uuid)"""),
        {"by": actor.get("employee_id"), "note": note, "id": candidate_id})
    canonical._write_audit(db, actor, request, "employees", "candidate_reject", "ariba_candidates", candidate_id,
                           summary="رفض مرشح")
    db.commit()
    return {"candidate_id": candidate_id, "status": "rejected", "note": note}


@router.get("/candidates/{candidate_ref}")
def candidate_detail(candidate_ref: str, actor: dict[str, Any] = Depends(canonical.current_actor),
                     db: Session = Depends(get_db)):
    """One candidate by uuid or by the 24-hex ref printed in the drawer."""
    _reader(actor)
    if _REF.match(candidate_ref):
        row = canonical._row(db, "SELECT * FROM public.ariba_candidates WHERE ref_token=:r", r=candidate_ref)
    else:
        try:
            uuid.UUID(candidate_ref)
        except ValueError as exc:
            raise ApiError(422, "invalid_reference", "رمز المرشح غير صحيح") from exc
        row = canonical._row(db, "SELECT * FROM public.ariba_candidates WHERE id=CAST(:id AS uuid)", id=candidate_ref)
    if not row:
        raise ApiError(404, "not_found", "لم يُعثر على مرشح بهذا الرابط")
    return {"candidate": _cand_json(row, _files(db, row["id"]))}

