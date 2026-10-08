"""schema cleanup: attendance sessions, real payroll/leave tables, drop unused tables

- attendance_records: several sessions per employee per day (legacy V117), index instead of unique
- request_steps.request_id: ON DELETE CASCADE
- employees.leave_eos_excess
- payroll_runs / payroll_rows rebuilt and linked to employees (data moved from sheets `pay_YYYY_MM`)
- leave_year_overrides + leave_adjustments rebuilt (data moved from sheets `leave_data` / `leave_balance_adjustments`)
- dropped (never used): settlements, settlement_items, template_letters, leave_year_ledgers
- sent_letters: CHECK on type and status

Revision ID: 0007
Revises: 0006
"""

import json
import uuid
from datetime import date

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

NOW = sa.func.now()


def _ts():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
    ]


def _load(v):
    if v is None:
        return None
    return json.loads(v) if isinstance(v, str) else v


def _num(v):
    try:
        return None if v is None or v == "" else float(v)
    except (TypeError, ValueError):
        return None


def _uuid(v):
    try:
        return uuid.UUID(str(v))
    except (TypeError, ValueError):
        return None


def upgrade() -> None:
    bind = op.get_bind()
    pg = bind.dialect.name == "postgresql"

    # ---- read data that moves out of `sheets`
    sheets = {k: _load(d) for k, d in bind.execute(sa.text("SELECT key, data FROM sheets")).fetchall()}
    approved = {k: (a, at, by) for k, a, at, by in bind.execute(sa.text("SELECT key, approved, approved_at, approved_by FROM sheets")).fetchall()}
    emp_ids = {str(r[0]).replace("-", "") for r in bind.execute(sa.text("SELECT id FROM employees")).fetchall()}

    # ---- attendance: several sessions a day
    with op.batch_alter_table("attendance_records") as b:
        b.drop_constraint("uq_attendance_employee_date", type_="unique")
        b.create_index("ix_attendance_employee_date", ["employee_id", "work_date"])

    # ---- request steps follow their request on delete
    if pg:
        op.drop_constraint("request_steps_request_id_fkey", "request_steps", type_="foreignkey")
        op.create_foreign_key("request_steps_request_id_fkey", "request_steps", "requests", ["request_id"], ["id"], ondelete="CASCADE")
    else:
        conv = {"fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"}
        with op.batch_alter_table("request_steps", recreate="always", naming_convention=conv) as b:
            b.drop_constraint("fk_request_steps_request_id_requests", type_="foreignkey")
            b.create_foreign_key("fk_request_steps_request_id_requests", "requests", ["request_id"], ["id"], ondelete="CASCADE")

    with op.batch_alter_table("employees") as b:
        b.add_column(sa.Column("leave_eos_excess", sa.Numeric(7, 2), server_default="0", nullable=False))

    # ---- drop unused / replaced tables
    for t in ("settlement_items", "settlements", "template_letters", "payroll_rows", "payroll_runs", "leave_adjustments", "leave_year_ledgers"):
        op.drop_table(t)
    if pg:
        for t in ("leave_field", "payroll_status", "settlement_item_kind", "template_type", "template_status"):
            op.execute(f"DROP TYPE IF EXISTS {t}")

    # ---- new tables
    op.create_table(
        "leave_year_overrides",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("employee_id", sa.Uuid(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        *[sa.Column(c, sa.Numeric(7, 2), nullable=True) for c in ("carry", "entitlement", "used", "adjustment", "year_end", "carry_next", "current_balance", "eos", "used_history")],
        sa.Column("as_of", sa.Date(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        *_ts(),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("employee_id", "year", name="uq_leave_override_employee_year"),
    )
    op.create_index("ix_leave_year_overrides_employee_id", "leave_year_overrides", ["employee_id"])

    op.create_table(
        "leave_adjustments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("employee_id", sa.Uuid(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("action", sa.String(length=20), server_default="delta", nullable=False),
        sa.Column("delta", sa.Numeric(7, 2), nullable=True),
        sa.Column("snapshot", sa.JSON(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        *_ts(),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_leave_adjustments_employee_id", "leave_adjustments", ["employee_id"])

    op.create_table(
        "payroll_runs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=10), server_default="draft", nullable=False),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_by", sa.Uuid(), nullable=True),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        *_ts(),
        sa.ForeignKeyConstraint(["approved_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("year", "month", name="uq_payroll_run_period"),
        sa.CheckConstraint("status IN ('draft', 'approved')", name="ck_payroll_run_status"),
    )
    op.create_table(
        "payroll_rows",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Uuid(), nullable=True),
        sa.Column("emp_no", sa.String(length=40), nullable=True),
        sa.Column("name_ar", sa.String(length=200), nullable=True),
        *[sa.Column(c, sa.Numeric(12, 2), server_default="0", nullable=False) for c in ("total_due", "total_deductions", "gosi_employee", "gosi_employer", "net", "net_sar")],
        sa.Column("data", sa.JSON(), nullable=False),
        *_ts(),
        sa.ForeignKeyConstraint(["run_id"], ["payroll_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_payroll_rows_run_id", "payroll_rows", ["run_id"])
    op.create_index("ix_payroll_rows_employee_id", "payroll_rows", ["employee_id"])
    op.create_index("ix_payroll_rows_run_position", "payroll_rows", ["run_id", "position"])

    with op.batch_alter_table("sent_letters") as b:
        b.create_check_constraint(
            "ck_sent_letters_type",
            "type IN ('onboarding', 'custody', 'extension', 'termination', 'clearance', 'experience', 'evaluation', 'contract_end', 'salary_cert')",
        )
        b.create_check_constraint("ck_sent_letters_status", "status IN ('pending', 'approved', 'rejected')")

    if pg:
        for t in ("leave_year_overrides", "leave_adjustments", "payroll_runs", "payroll_rows"):
            op.execute(f'ALTER TABLE "{t}" ENABLE ROW LEVEL SECURITY')

    # ---- move data out of `sheets`
    def known(eid):
        u = _uuid(eid)
        return u if u and u.hex in emp_ids else None

    runs_t = sa.table("payroll_runs", *[sa.column(c) for c in ("id", "year", "month", "status", "approved_at", "approved_by")])
    rows_t = sa.table("payroll_rows", *[sa.column(c) for c in ("id", "run_id", "position", "employee_id", "emp_no", "name_ar", "total_due", "total_deductions", "gosi_employee", "gosi_employer", "net", "net_sar", "data")])
    for key, data in sheets.items():
        if not key.startswith("pay_") or not isinstance(data, list):
            continue
        try:
            _, y, m = key.split("_")
            y, m = int(y), int(m)
        except ValueError:
            continue
        ok, at, by = approved.get(key, (False, None, None))
        rid = uuid.uuid4()
        op.bulk_insert(runs_t, [{"id": rid, "year": y, "month": m, "status": "approved" if ok else "draft", "approved_at": at, "approved_by": _uuid(by)}])
        op.bulk_insert(rows_t, [{
            "id": uuid.uuid4(), "run_id": rid, "position": i, "employee_id": known(r.get("id")),
            "emp_no": str(r.get("empNo") or "")[:40] or None, "name_ar": str(r.get("name") or "")[:200] or None,
            "total_due": _num(r.get("totalDue")) or 0, "total_deductions": _num(r.get("totalDeduct")) or 0,
            "gosi_employee": _num(r.get("insEmp")) or 0, "gosi_employer": _num(r.get("insEr")) or 0,
            "net": _num(r.get("net")) or 0, "net_sar": _num(r.get("netSAR")) or 0, "data": r,
        } for i, r in enumerate(data) if isinstance(r, dict)])

    ov_t = sa.table("leave_year_overrides", *[sa.column(c) for c in ("id", "employee_id", "year", "carry", "entitlement", "used", "adjustment", "year_end", "carry_next", "current_balance", "eos", "used_history", "as_of", "note")])
    emp_t = sa.table("employees", sa.column("id"), sa.column("leave_eos_excess"))
    for eid, entry in (sheets.get("leave_data") or {}).items():
        e = known(eid)
        if not e or not isinstance(entry, dict):
            continue
        years = dict(entry.get("years") or {})
        for y in (entry.get("used_history") or {}):
            years.setdefault(y, {})
        rows = []
        for y, o in years.items():
            o = o or {}
            as_of = o.get("asOf")
            rows.append({
                "id": uuid.uuid4(), "employee_id": e, "year": int(y), "carry": _num(o.get("carry")), "entitlement": _num(o.get("entitlement")),
                "used": _num(o.get("used")), "adjustment": _num(o.get("adjustment")), "year_end": _num(o.get("yearEnd")),
                "carry_next": _num(o.get("carryNext")), "current_balance": _num(o.get("current")), "eos": _num(o.get("eos")),
                "used_history": _num((entry.get("used_history") or {}).get(y)),
                "as_of": date.fromisoformat(str(as_of)[:10]) if as_of else None, "note": o.get("note"),
            })
        if rows:
            op.bulk_insert(ov_t, rows)
        if _num(entry.get("eos_excess")):
            bind.execute(emp_t.update().where(emp_t.c.id == e).values(leave_eos_excess=_num(entry.get("eos_excess"))))

    adj_t = sa.table("leave_adjustments", *[sa.column(c) for c in ("id", "employee_id", "year", "entry_date", "action", "delta", "snapshot", "note")])
    adj_rows = []
    for a in sheets.get("leave_balance_adjustments") or []:
        e = known(a.get("employee_id")) if isinstance(a, dict) else None
        d = a.get("date") if e else None
        if not e or not d:
            continue
        dd = date.fromisoformat(str(d)[:10])
        adj_rows.append({"id": uuid.uuid4(), "employee_id": e, "year": int(a.get("year") or dd.year), "entry_date": dd,
                         "action": a.get("action") or "delta", "delta": _num(a.get("delta")), "snapshot": a, "note": a.get("note")})
    if adj_rows:
        op.bulk_insert(adj_t, adj_rows)

    bind.execute(sa.text("DELETE FROM sheets WHERE key LIKE 'pay\\_%' ESCAPE '\\' OR key IN ('leave_data', 'leave_balance_adjustments')"))


def downgrade() -> None:
    raise NotImplementedError("0007 is a one-way cleanup (old unused tables were dropped).")
