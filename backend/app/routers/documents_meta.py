"""Certificate details on a document, and the certificates report (Stage 17, migration 007).

    PUT /documents/{document_id}/meta   {title, issuer, issue_date, expiry_date}   attachments: edit
    GET /registry/attachments?types=…   every employee's documents, details only    documents | attachments: view

The design's `ariba_set_document_meta` and `ariba_hr_docs_all` (sql/37_certificates_meta.sql). The report never
returns a file's content: name, type, size, dates and the details above. Before migration 007 the columns do not
exist: the report answers without the details and the save answers 503 `migration_required`.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.database import get_db
from app.routers import canonical

router = APIRouter(tags=["documents-meta"])

#: The design's certificate types (CERT_TYPES), offered by the employee form's «إضافة شهادة».
CERT_TYPES = ("degree", "experience", "professional", "course", "other")


def meta_ready(db: Session) -> bool:
    return bool(db.scalar(text("""SELECT count(*) = 4 FROM information_schema.columns WHERE table_schema='public'
        AND table_name='ariba_documents' AND column_name IN ('title','issuer','issue_date','expiry_date')""")))


def _date(value: Any, field: str) -> date | None:
    if value in (None, ""):
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError as exc:
        raise ApiError(422, "validation_error", f"{field}: تاريخ غير صحيح") from exc


def meta_in(body: Any) -> dict[str, Any]:
    if not isinstance(body, dict):
        raise ApiError(422, "validation_error", "The body must be an object")
    title, issuer = str(body.get("title") or "").strip(), str(body.get("issuer") or "").strip()
    if len(title) > 200 or len(issuer) > 200:
        raise ApiError(422, "validation_error", "اسم الشهادة أو الجهة أطول من المسموح")
    issue, expiry = _date(body.get("issue_date"), "issue_date"), _date(body.get("expiry_date"), "expiry_date")
    if issue and expiry and expiry < issue:
        raise ApiError(422, "validation_error", "تاريخ الانتهاء قبل تاريخ الإصدار")
    return {"title": title or None, "issuer": issuer or None, "issue": issue, "expiry": expiry}


@router.put("/documents/{document_id}/meta")
def set_meta(document_id: uuid.UUID, body: dict[str, Any], request: Request,
             actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    canonical._perm(actor, "attachments", "edit")
    if not meta_ready(db):
        raise ApiError(503, "migration_required", "بيانات الشهادات تحتاج docs/db-migrations/007_document_meta.sql")
    value = meta_in(body)
    row = canonical._row(db, """UPDATE public.ariba_documents SET title=:title, issuer=:issuer, issue_date=:issue,
        expiry_date=:expiry WHERE id=:id RETURNING employee_id""", id=document_id, **value)
    if not row:
        raise ApiError(404, "not_found", "Document not found")
    canonical._write_audit(db, actor, request, "employees", "document_meta", "document", document_id,
                           details={"employee": row["employee_id"], "fields": sorted(k for k, v in value.items() if v)})
    db.commit()
    return {"id": str(document_id), "title": value["title"], "issuer": value["issuer"],
            "issue_date": value["issue"], "expiry_date": value["expiry"]}


@router.get("/registry/attachments")
def all_attachments(types: str | None = None, actor: dict[str, Any] = Depends(canonical.current_actor),
                    db: Session = Depends(get_db)):
    canonical._perm(actor, ("documents", "attachments"))
    wanted = [t.strip() for t in (types or "").split(",") if t.strip()]
    meta = ", d.title, d.issuer, d.issue_date, d.expiry_date" if meta_ready(db) else ""
    return canonical._rows(db, f"""SELECT d.id, d.employee_id, e.name_ar, d.document_type AS type, d.file_name,
            d.mime_type, d.file_size AS size_bytes, d.created_at{meta}
        FROM public.ariba_documents d LEFT JOIN public.employee_directory e ON e.employee_id = d.employee_id
        WHERE d.request_id IS NULL AND (cardinality(CAST(:t AS text[])) = 0 OR d.document_type = ANY(CAST(:t AS text[])))
        ORDER BY e.name_ar, d.created_at DESC""", t=wanted)
