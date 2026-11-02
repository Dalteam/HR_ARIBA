"""Announcements and greetings (Stage 7 of the employee-app port).

    GET    /me/announcements        announcements.mine()   the home card, my own items only
    GET    /announcements           (HR, no screen yet)    every live row with a recipient count
    POST   /announcements           (HR)                   send an announcement or a greeting
    PATCH  /announcements/{id}      (HR)                   the wording, the pin, the expiry
    DELETE /announcements/{id}      (HR)                   hide it, and take it out of every bell
    GET    /occasions               (HR)                   HR's occasion notes
    POST   /occasions               (HR)
    DELETE /occasions/{id}          (HR)
    GET/PUT /settings/greetings     (HR)                   the automatic-greetings switches, off
    POST   /occasions/run-auto      (HR)                   today's automatic greetings, once each
    GET/PUT /settings/announcements (HR)                   whether announcements are e-mailed, off

The rules live in `app/services/announcements.py` (A1–A12); this module turns them into answers, audit
rows and refusals. Only `hr`/`admin`/`admin_manager` reach the HR routes (A2): the CEO, managers and
employees get `403` and read announcements through their own card. Every write is audited with the id,
the kind, the audience and a count, **never the text** (A11); reading the card is not audited.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.scheduling import today_riyadh
from app.database import get_db
from app.routers import canonical
from app.services import announcements as ann

router = APIRouter(tags=["announcements"])


def _hr(actor: dict[str, Any]) -> None:
    canonical._require(actor, *canonical.HR_ROLES)


@router.get("/me/announcements")
def my_announcements(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """`{ok, items}` — the card's seven keys per item (A3/A4)."""
    return {"ok": True, "items": ann.mine(db, actor.get("employee_id"))}


@router.get("/announcements")
def list_announcements(limit: int = 100, actor: dict[str, Any] = Depends(canonical.current_actor),
                       db: Session = Depends(get_db)):
    _hr(actor)
    return {"ok": True, "items": ann.hr_list(db, limit)}


@router.post("/announcements")
def send_announcement(body: dict[str, Any], request: Request,
                      actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """`{ok, id, sent}` — checked in full before a row or a bell entry is written (A1, A11)."""
    _hr(actor)
    data = ann.validate_new(body, today_riyadh())
    aid, sent = ann.create(db, actor, data)
    canonical._write_audit(db, actor, request, "announcements", f"{data['kind']}_create", "announcement", aid,
                           details={"kind": data["kind"], "occasion": data["occasion"], "audience": data["audience"],
                                    "employer_id": data["employer_id"], "recipients": sent, "pinned": data["pinned"]})
    db.commit()
    return {"ok": True, "id": aid, "sent": sent}


@router.patch("/announcements/{announcement_id}")
def edit_announcement(announcement_id: str, body: dict[str, Any], request: Request,
                      actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """`{ok}` — the wording, the pin and the expiry; the bell does not ring again (A6)."""
    _hr(actor)
    changes = ann.validate_edit(body, today_riyadh())
    row = ann.edit(db, actor, announcement_id, changes)
    canonical._write_audit(db, actor, request, "announcements", f"{row['kind']}_edit", "announcement", row["id"],
                           details={"fields": sorted(changes)})
    db.commit()
    return {"ok": True}


@router.delete("/announcements/{announcement_id}")
def hide_announcement(announcement_id: str, request: Request,
                      actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """`{ok, removed}` — hidden from the card and the list, and its bell entries deleted (A7, D4)."""
    _hr(actor)
    row, removed = ann.hide(db, actor, announcement_id)
    canonical._write_audit(db, actor, request, "announcements", f"{row['kind']}_delete", "announcement", row["id"],
                           details={"audience": row["audience"], "recipients": row["sent_count"],
                                    "bell_entries_removed": removed})
    db.commit()
    return {"ok": True, "removed": removed}


@router.get("/occasions")
def list_occasions(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    _hr(actor)
    return {"ok": True, "items": ann.occasions(db)}


@router.post("/occasions")
def save_occasion(body: dict[str, Any], request: Request,
                  actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    _hr(actor)
    data = ann.validate_occasion(body)
    oid = ann.save_occasion(db, actor, data)
    canonical._write_audit(db, actor, request, "announcements", "occasion_create", "occasion", oid,
                           details={"employee_id": data["employee_id"], "occasion": data["occasion"]})
    db.commit()
    return {"ok": True, "id": oid}


@router.delete("/occasions/{occasion_id}")
def hide_occasion(occasion_id: str, request: Request,
                  actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    _hr(actor)
    ann.hide_occasion(db, occasion_id)
    canonical._write_audit(db, actor, request, "announcements", "occasion_delete", "occasion", occasion_id)
    db.commit()
    return {"ok": True}


@router.get("/settings/greetings")
def get_greetings(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    _hr(actor)
    return ann.auto_cfg(db)


@router.put("/settings/greetings")
def put_greetings(body: dict[str, Any], request: Request,
                  actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    _hr(actor)
    value = {**ann.auto_cfg(db), **ann.validate_switches(body, ann.AUTO_DEFAULT)}
    canonical._set_app_setting(db, ann.AUTO_KEY, value, actor)
    canonical._write_audit(db, actor, request, "settings", "update", "ariba_app_settings", ann.AUTO_KEY, details=value)
    db.commit()
    return ann.auto_cfg(db)


@router.post("/occasions/run-auto")
def run_auto(request: Request, actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """`{ok, sent}` — HR only (the client's version let any session run it); nothing when the switch is off."""
    _hr(actor)
    sent = ann.run_auto(db)
    canonical._write_audit(db, actor, request, "announcements", "greetings_run", "announcement", None,
                           details={"sent": sent})
    db.commit()
    return {"ok": True, "sent": sent}


@router.get("/settings/announcements")
def get_announcement_mail(actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    _hr(actor)
    return ann.mail_cfg(db)


@router.put("/settings/announcements")
def put_announcement_mail(body: dict[str, Any], request: Request,
                          actor: dict[str, Any] = Depends(canonical.current_actor), db: Session = Depends(get_db)):
    """`{email}` — whether announcements are e-mailed once e-mail is on (D5); greetings never are."""
    _hr(actor)
    value = {**ann.mail_cfg(db), **ann.validate_switches(body, ann.MAIL_DEFAULT)}
    canonical._set_app_setting(db, ann.MAIL_KEY, value, actor)
    canonical._write_audit(db, actor, request, "settings", "update", "ariba_app_settings", ann.MAIL_KEY, details=value)
    db.commit()
    return ann.mail_cfg(db)
