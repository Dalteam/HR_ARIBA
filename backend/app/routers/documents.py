"""Employee documents and photo. Files are streamed through the backend after a scope check."""

import uuid
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.permissions import HR_ROLES, require_roles
from app.core.storage import get_storage
from app.database import get_db
from app.models import DocumentType, Role, User
from app.schemas import DocumentOut
from app.services import dependents as dep_svc
from app.services import documents as svc
from app.services import employees as emp_svc

router = APIRouter(tags=["documents"])

_READERS = require_roles(Role.employee, Role.manager, Role.hr, Role.ceo, Role.admin)
_WRITERS = require_roles(*HR_ROLES)


def _file_response(data: bytes, media_type: str, filename: str, inline: bool = True) -> Response:
    disposition = "inline" if inline else "attachment"
    return Response(
        content=data,
        media_type=media_type,
        headers={
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(filename)}",
            "Cache-Control": "private, no-store",
        },
    )


@router.get("/employees/{employee_id}/documents", response_model=list[DocumentOut])
def list_documents(employee_id: uuid.UUID, user: User = Depends(_READERS), db: Session = Depends(get_db)):
    emp = emp_svc.get_employee(db, user, employee_id)
    return [DocumentOut.model_validate(d) for d in svc.list_for_employee(db, emp.id)]


@router.post("/employees/{employee_id}/documents", response_model=DocumentOut, status_code=201)
async def upload_document(
    employee_id: uuid.UUID,
    request: Request,
    type: DocumentType = Form(...),
    title: str | None = Form(None, max_length=200),
    file: UploadFile = File(...),
    user: User = Depends(_WRITERS),
    db: Session = Depends(get_db),
):
    emp = emp_svc.get_employee(db, user, employee_id)
    doc = await svc.upload(db, user, file, type, employee=emp, title=title)
    audit(db, request, user, "upload", "document", doc.id, {"employee_id": str(emp.id), "type": type.value})
    db.commit()
    return DocumentOut.model_validate(doc)


@router.get("/documents/{document_id}/file")
def download_document(document_id: uuid.UUID, request: Request, user: User = Depends(_READERS), db: Session = Depends(get_db)):
    doc = svc.get(db, document_id)
    emp_svc.get_employee(db, user, doc.employee_id)  # scope check: 404 outside scope
    data = get_storage().get(doc.storage_path)
    audit(db, request, user, "download", "document", doc.id)
    db.commit()
    return _file_response(data, doc.mime_type, doc.file_name)


@router.delete("/documents/{document_id}", status_code=204)
def delete_document(document_id: uuid.UUID, request: Request, user: User = Depends(_WRITERS), db: Session = Depends(get_db)):
    doc = svc.get(db, document_id)
    emp_svc.get_employee(db, user, doc.employee_id)
    svc.remove(db, doc)
    audit(db, request, user, "delete", "document", doc.id)
    db.commit()


@router.put("/employees/{employee_id}/photo", status_code=204)
async def upload_photo(
    employee_id: uuid.UUID,
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(_WRITERS),
    db: Session = Depends(get_db),
):
    emp = emp_svc.get_employee(db, user, employee_id)
    await svc.set_photo(db, emp, file)
    audit(db, request, user, "upload_photo", "employee", emp.id)
    db.commit()


@router.get("/employees/{employee_id}/photo")
def get_photo(employee_id: uuid.UUID, user: User = Depends(_READERS), db: Session = Depends(get_db)):
    emp = emp_svc.get_employee(db, user, employee_id)
    data, media = svc.photo_bytes(emp)
    return _file_response(data, media, "photo")


@router.delete("/employees/{employee_id}/photo", status_code=204)
def delete_photo(employee_id: uuid.UUID, request: Request, user: User = Depends(_WRITERS), db: Session = Depends(get_db)):
    emp = emp_svc.get_employee(db, user, employee_id)
    svc.remove_photo(emp)
    audit(db, request, user, "delete_photo", "employee", emp.id)
    db.commit()


@router.post("/dependents/{dependent_id}/documents", response_model=DocumentOut, status_code=201)
async def upload_dependent_document(
    dependent_id: uuid.UUID,
    request: Request,
    type: DocumentType = Form(DocumentType.other),
    file: UploadFile = File(...),
    user: User = Depends(_WRITERS),
    db: Session = Depends(get_db),
):
    dep = dep_svc.get(db, dependent_id)
    emp_svc.get_employee(db, user, dep.employee_id)
    doc = await svc.upload(db, user, file, type, dependent=dep)
    audit(db, request, user, "upload", "document", doc.id, {"dependent_id": str(dep.id), "type": type.value})
    db.commit()
    return DocumentOut.model_validate(doc)
