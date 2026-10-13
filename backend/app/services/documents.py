"""Employee/dependent files and the employee photo. Files live in storage; rows hold the path."""

import uuid
from datetime import UTC, datetime

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.errors import ApiError, not_found
from app.core.security import check_upload
from app.core.storage import get_storage
from app.models import Dependent, Document, DocumentType, Employee, User

_EXT = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
}
_PHOTO_TYPES = {"image/jpeg", "image/png"}


async def _read(file: UploadFile) -> bytes:
    limit = get_settings().max_upload_bytes
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise ApiError(413, "payload_too_large", "File is larger than 12 MB")
    return data


def _safe_name(name: str | None) -> str:
    name = (name or "file").replace("\\", "/").split("/")[-1].strip()
    return name[:200] or "file"


async def upload(
    db: Session,
    user: User,
    file: UploadFile,
    doc_type: DocumentType,
    *,
    employee: Employee | None = None,
    dependent: Dependent | None = None,
    title: str | None = None,
) -> Document:
    data = await _read(file)
    content_type = (file.content_type or "").split(";")[0].strip()
    check_upload(content_type, data)
    owner = employee.id if employee else dependent.employee_id  # type: ignore[union-attr]
    path = f"employees/{owner}/{uuid.uuid4().hex}.{_EXT[content_type]}"
    get_storage().put(path, data, content_type)
    doc = Document(
        employee_id=employee.id if employee else dependent.employee_id,  # type: ignore[union-attr]
        dependent_id=dependent.id if dependent else None,
        type=doc_type,
        title=title,
        storage_path=path,
        file_name=_safe_name(file.filename),
        mime_type=content_type,
        size_bytes=len(data),
        uploaded_by=user.id,
    )
    db.add(doc)
    db.flush()
    return doc


def list_for_employee(db: Session, employee_id: uuid.UUID) -> list[Document]:
    return list(
        db.scalars(
            select(Document)
            .where(Document.employee_id == employee_id, Document.dependent_id.is_(None), Document.deleted_at.is_(None))
            .order_by(Document.created_at.desc())
        )
    )


def list_for_dependent(db: Session, dependent_id: uuid.UUID) -> list[Document]:
    return list(
        db.scalars(
            select(Document)
            .where(Document.dependent_id == dependent_id, Document.deleted_at.is_(None))
            .order_by(Document.created_at.desc())
        )
    )


def get(db: Session, doc_id: uuid.UUID) -> Document:
    doc = db.get(Document, doc_id)
    if doc is None or doc.deleted_at is not None:
        raise not_found("Document")
    return doc


def remove(db: Session, doc: Document) -> None:
    doc.deleted_at = datetime.now(UTC)
    get_storage().delete(doc.storage_path)


async def set_photo(db: Session, emp: Employee, file: UploadFile) -> None:
    data = await _read(file)
    content_type = (file.content_type or "").split(";")[0].strip()
    if content_type not in _PHOTO_TYPES:
        raise ApiError(415, "unsupported_media_type", "The photo must be JPG or PNG")
    check_upload(content_type, data)
    path = f"employees/{emp.id}/photo-{uuid.uuid4().hex}.{_EXT[content_type]}"
    get_storage().put(path, data, content_type)
    old = emp.photo_path
    emp.photo_path = path
    if old:
        get_storage().delete(old)


def remove_photo(emp: Employee) -> None:
    if emp.photo_path:
        get_storage().delete(emp.photo_path)
        emp.photo_path = None


def photo_bytes(emp: Employee) -> tuple[bytes, str]:
    if not emp.photo_path:
        raise not_found("Photo")
    media = "image/png" if emp.photo_path.endswith(".png") else "image/jpeg"
    return get_storage().get(emp.photo_path), media
