"""Tasks, meetings and the team's availability (Stage 4 of the employee-app port).

The four calls `frontend/employee-app/src/lib/port.ts` makes, and who may make each:

    GET  /team/availability        tasks.availability()   the employees I may see, with their leaves
    GET  /tasks?box=inbox|sent     tasks.list()           what was sent to me / by me
    POST /tasks                    tasks.send()           my audience only, one row per recipient
    POST /tasks/{id}/update        tasks.update()         the assignee answers, the sender cancels

The rules - who the audience is, one row per recipient, who may move a row where - live in
`app/services/tasks.py`; this module turns them into refusals, bell entries and audit rows:

* **Every write is audited** - `task_create` with the batch and its recipients, then
  `task_done`/`task_accepted`/`task_declined`/`task_cancelled` with the row - and rings the bell of
  whoever has to act next: each recipient on a send, the other side on an answer.
* **Reading is not audited.** These are a team's own tasks, not somebody else's signature.
* **A refusal keeps Stage 2's shape**: a recipient outside the caller's audience is `403`
  (`FORBIDDEN`, the sentence the team screen already shows) and happens before a row is written; a
  task id that is not the caller's is `404`, the same answer as an id that does not exist.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.database import get_db
from app.routers import canonical
from app.services import tasks

router = APIRouter()

#: What the bell says when a row leaves `open` (their `ariba_task_update` wording).
STATUS_LABEL = {"done": "أُنجزت المهمة", "accepted": "قُبلت دعوة الاجتماع",
                "declined": "اعتذار عن الاجتماع", "cancelled": "أُلغيت المهمة"}
#: And what it says when one arrives.
SEND_LABEL = {"task": "مهمة جديدة: ", "meeting": "دعوة اجتماع: "}


@router.get("/team/availability")
def team_availability(actor: dict[str, Any] = Depends(canonical.current_actor),
                      db: Session = Depends(get_db)):
    """`{items, today, allowed}` for the availability tab.

    `allowed: false` is the screen's «هذه الصفحة للمدراء والإدارة», not a refusal: a plain employee
    is told nothing about anybody's leave, not even that there is a list.
    """
    return tasks.availability(db, actor)


@router.get("/tasks")
def list_tasks(box: str = Query("inbox"),
               actor: dict[str, Any] = Depends(canonical.current_actor),
               db: Session = Depends(get_db)):
    """`{items}` - my inbox (`box=inbox`, the default) or what I sent (`box=sent`), newest first."""
    return {"items": [tasks.task_out(row) for row in tasks.for_box(db, actor.get("employee_id"), box)]}


@router.post("/tasks")
def send_tasks(body: dict[str, Any], request: Request,
               actor: dict[str, Any] = Depends(canonical.current_actor),
               db: Session = Depends(get_db)):
    """Send one task or meeting invitation to the people on the availability tab (`{sent, batch_id}`).

    The recipients are checked against the caller's audience as a whole: one name outside it
    refuses the request, so a batch is never half-delivered.
    """
    task = tasks.clean_task(body)
    batch_id = tasks.send(db, actor, task)
    sender = actor.get("name_ar") or actor.get("employee_id") or ""
    when = tasks.when_label(task)
    bell_body = f"من {sender}" + (f" — {when}" if when else "")
    for recipient in task["to"]:
        canonical._insert_notification(db, recipient, None,
                                       SEND_LABEL[task["kind"]] + task["title"], bell_body,
                                       "employee", "task")
    canonical._write_audit(db, actor, request, "tasks", "task_create", "task", batch_id,
                           details={"kind": task["kind"], "to": task["to"]})
    db.commit()
    return {"sent": len(task["to"]), "batch_id": str(batch_id)}


@router.post("/tasks/{task_id}/update")
def update_task(task_id: str, body: dict[str, Any], request: Request,
                actor: dict[str, Any] = Depends(canonical.current_actor),
                db: Session = Depends(get_db)):
    """Answer a row (`{status, note?}`): the assignee `done`/`accepted`/`declined`, the sender `cancelled`."""
    row = tasks.find_task(db, task_id)
    me = actor.get("employee_id")
    if not row or me not in (str(row["created_by"]), str(row["assignee_id"])):
        raise ApiError(404, "not_found", tasks.NOT_FOUND)
    status = tasks.update_task(db, row, me, body.get("status"), body.get("note"))
    other = str(row["assignee_id"]) if me == str(row["created_by"]) else str(row["created_by"])
    note = str(body.get("note") or "").strip()
    who = actor.get("name_ar") or actor.get("employee_id") or ""
    bell_body = " — ".join(part for part in (note, who) if part)
    canonical._insert_notification(db, other, None, f"{STATUS_LABEL[status]}: {row['title']}",
                                   bell_body, "employee", "task")
    canonical._write_audit(db, actor, request, "tasks", "task_" + status, "task", row["id"],
                           details={"kind": row["kind"], "batch_id": str(row["batch_id"])})
    db.commit()
    return {"ok": True, "status": status}
