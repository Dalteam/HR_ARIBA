"""Compare per-table row counts in a pg_dump export with a migrated database.

The dump is the source of truth: ``Supabase_DB_row_counts.csv`` and similar files are
approximate snapshots and drift from the export, so they are not used here.

    python tools/db/analyze_dump.py supabase_full.sql --json dump.json --quiet
    psql -X -A -F ',' -t -c "..." -o db_counts.csv
    python tools/db/compare_counts.py dump.json db_counts.csv

Read-only. Exit code 1 when a table lost rows without an annotation, so the check can gate a
deployment.

Annotations describe the *intended* deltas introduced by the normalization pipeline
(docs/db-normalization/pre_migration_fixes.sql). Anything else counts as unexplained loss.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys

# table -> reason. Deltas here are expected and reviewed; everything else must be 0.
EXPECTED_DELTAS: dict[str, str] = {
    "employee_payrolls": "orphan payrolls purged to ops.orphan_payrolls_backup (pre_migration_fixes D)",
    "workflow_actions": "actions rebuilt from legacy mgr_/hr_/ceo_ columns (pre_migration_fixes F)",
    "ariba_app_settings": "settings seeded by ariba_normalization.sql / 001_react_port.sql",
    "ariba_security_flags": "flags seeded by ariba_normalization.sql",
}

# Tables the pipeline archives into the ops schema instead of dropping.
EXPECTED_MOVED = {
    "ariba_backup_v106_duplicates": "archived to the ops schema (kept, not dropped)",
    "ariba_backup_v116_cleanup": "archived to the ops schema (kept, not dropped)",
    "ariba_function_backups": "archived to the ops schema (kept, not dropped)",
}

# Tables created by the normalizer: they have no dump counterpart by design.
NEW_TABLES = {
    "employers", "departments", "job_titles", "leave_types", "document_types", "roles",
    "permission_types", "workflow_stages", "workflow_request_types", "workflow_approvers",
    "payroll_periods", "payroll_lines", "payroll_components",
}
# Tables created by docs/db-migrations/001_react_port.sql (the React port's own features).
NEW_TABLES_001 = {
    "ariba_candidates", "ariba_candidate_files", "ariba_candidate_invites", "ariba_targets",
    "ariba_evaluations", "ariba_delegations", "ariba_manager_perms", "ariba_doc_signing",
    "ariba_leave_files", "ariba_mail_accounts", "ariba_mail_log", "ariba_tasks",
    "ariba_webauthn_credentials", "ariba_push_tokens",
}


def load_dump(path: str) -> dict[str, int]:
    with open(path, "r", encoding="utf-8") as fh:
        report = json.load(fh)
    counts: dict[str, int] = {}
    for key, table in report.get("tables", {}).items():
        schema, _, name = key.partition(".")
        if schema != "public":
            continue
        rows = table.get("rows")
        counts[name] = int(rows) if rows is not None else -1
    return counts


def load_db(path: str) -> tuple[dict[str, int], dict[str, set[str]]]:
    """Return (public table counts, {table: other schemas holding it}).

    Accepts ``schema,table,count`` (preferred) or ``table,count`` rows.
    """
    public: dict[str, int] = {}
    others: dict[str, set[str]] = {}
    with open(path, "r", encoding="utf-8-sig", newline="") as fh:
        for row in csv.reader(fh):
            cells = [c.strip() for c in row if c.strip() not in ("",)]
            if len(cells) >= 3:
                schema, name, value = cells[0].strip('"'), cells[1].strip('"'), cells[2]
            elif len(cells) == 2:
                schema, name, value = "public", cells[0].strip('"'), cells[1]
            else:
                continue
            if name.lower() in ("table_name", "relname", "table"):
                continue
            try:
                count = int(value)
            except ValueError:
                continue
            if schema == "public":
                public[name] = count
            else:
                others.setdefault(name, set()).add(schema)
    return public, others


def main() -> int:
    ap = argparse.ArgumentParser(description="Compare dump row counts with the migrated database.")
    ap.add_argument("dump_json")
    ap.add_argument("db_counts_csv")
    ap.add_argument("--out", help="write the comparison table here as well as to stdout")
    args = ap.parse_args()

    dump = load_dump(args.dump_json)
    db, elsewhere = load_db(args.db_counts_csv)

    lines: list[str] = []
    problems: list[str] = []

    lines.append(f"{'table':<38}{'dump':>8}{'db':>8}{'delta':>8}  note")
    lines.append("-" * 100)
    for name in sorted(dump):
        if name not in db:
            if name in EXPECTED_MOVED or name in elsewhere:
                where = ", ".join(sorted(elsewhere.get(name, {"ops"})))
                lines.append(f"{name:<38}{dump[name]:>8}{'-':>8}{'':>8}  {EXPECTED_MOVED.get(name, 'moved to the ' + where + ' schema')}")
                continue
            lines.append(f"{name:<38}{dump[name]:>8}{'MISSING':>8}{'':>8}  table gone after migration")
            problems.append(f"{name}: missing from migrated database")
            continue
        delta = db[name] - dump[name]
        note = "" if delta == 0 else EXPECTED_DELTAS.get(name, "")
        if delta and not note:
            problems.append(f"{name}: {delta:+d} unexplained rows")
        lines.append(f"{name:<38}{dump[name]:>8}{db[name]:>8}{delta:>+8}  {note}")

    created = sorted(set(db) - set(dump))
    if created:
        lines.append("")
        lines.append("tables with no dump counterpart:")
        for name in created:
            if name in NEW_TABLES:
                origin = "created by ariba_normalization.sql"
            elif name in NEW_TABLES_001:
                origin = "created by 001_react_port.sql"
            else:
                origin = "<-- UNEXPECTED, not created by any known migration"
                problems.append(f"{name}: new table not created by a known migration")
            lines.append(f"  {name:<38}{db[name]:>8}  {origin}")

    extra_schemas = sorted({s for schemas in elsewhere.values() for s in schemas})
    if extra_schemas:
        lines.append("")
        lines.append("other schemas present: " + ", ".join(extra_schemas) +
                     f" ({len(elsewhere)} tables, archives and ops.* backups)")

    lines.append("")
    if problems:
        lines.append(f"FAILED: {len(problems)} problem(s)")
        lines.extend(f"  - {p}" for p in problems)
    else:
        lines.append("OK: every dump table is present and every delta is accounted for")

    text = "\n".join(lines)
    print(text)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(text + "\n")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
