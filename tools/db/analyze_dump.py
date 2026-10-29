"""Summarise a pg_dump plain-text export: tables, columns, keys and row counts.

Read-only: it never connects to a database and never modifies the dump.

    python tools/db/analyze_dump.py supabase_full.sql --json report.json --text report.txt
"""

from __future__ import annotations

import argparse
import json
import re
from collections import OrderedDict

HEADER_RE = re.compile(r"^-- Name: (?P<name>.+?); Type: (?P<kind>.+?); Schema: (?P<schema>.+?); Owner:")
COPY_RE = re.compile(r'^COPY (?P<table>\S+) \((?P<cols>.*)\) FROM stdin;$')
CREATE_TABLE_RE = re.compile(r'^CREATE TABLE (?P<table>\S+) \($')
ALTER_ONLY_RE = re.compile(r'^ALTER TABLE ONLY (?P<table>\S+)\s*$')


def split_name(full: str) -> tuple[str, str]:
    """Split 'public."Employees"' into ('public', 'Employees')."""
    full = full.strip()
    if '"' in full:
        schema, _, name = full.partition(".")
        return schema.strip('"'), name.strip('"')
    schema, _, name = full.rpartition(".")
    return schema, name

CONSTRAINT_RE = re.compile(r"^\s+ADD CONSTRAINT (?P<name>\S+) (?P<def>.+);$")


def parse(path: str) -> dict:
    """Return {"tables": {schema.table: {...}}, "objects": [...]}."""
    tables: dict[str, dict] = {}
    objects: "OrderedDict[tuple[str, str], dict]" = OrderedDict()
    current: dict | None = None
    table: dict | None = None
    in_table = False
    in_copy = False
    copy_rows = 0
    copy_target: dict | None = None

    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        for raw in fh:
            line = raw.rstrip("\n")

            if in_copy:
                if line == "\\.":
                    in_copy = False
                    if copy_target is not None:
                        copy_target["rows"] = copy_rows
                    copy_target = None
                else:
                    copy_rows += 1
                continue

            if in_table and table is not None:
                if line == ");":
                    in_table = False
                    table = None
                    continue
                stripped = line.strip().rstrip(",")
                if stripped and not stripped.startswith(("CONSTRAINT", "PRIMARY KEY", "UNIQUE", "FOREIGN KEY", "CHECK")):
                    parts = stripped.split(None, 1)
                    entry = {"name": parts[0], "type": parts[1] if len(parts) > 1 else ""}
                    if "PRIMARY KEY" in stripped:
                        entry["pk"] = True
                    if "REFERENCES" in stripped:
                        entry["references"] = stripped.split("REFERENCES", 1)[1].strip().split()[0].strip("(),")
                    table["columns"].append(entry)
                elif stripped.startswith("CONSTRAINT"):
                    table["constraints"][stripped.split()[1]] = stripped
                continue

            m = HEADER_RE.match(line)
            if m:
                key = (m.group("schema"), m.group("name"))
                current = objects.setdefault(key, {"kind": m.group("kind"), "rows": None})
                current["kind"] = m.group("kind")
                continue

            m = CREATE_TABLE_RE.match(line)
            if m:
                schema, name = split_name(m.group("table"))
                table = tables.setdefault(f"{schema}.{name}", {"columns": [], "rows": None, "constraints": {}})
                if current is not None:
                    current["table"] = f"{schema}.{name}"
                in_table = True
                continue

            m = COPY_RE.match(line)
            if m:
                schema, name = split_name(m.group("table"))
                t = tables.setdefault(f"{schema}.{name}", {"columns": [], "rows": None, "constraints": {}})
                t["columns_copy"] = [c.strip().strip('"') for c in m.group("cols").split(",")]
                current = objects.setdefault((schema, name), {"kind": "TABLE DATA", "rows": None})
                in_copy = True
                copy_rows = 0
                copy_target = t
                continue


            m = ALTER_ONLY_RE.match(line)
            if m:
                current = {"kind": "CONSTRAINT", "table": m.group("table"), "constraint_defs": {}}
                continue

            m = CONSTRAINT_RE.match(line)
            if m and current and "constraint_defs" in current:
                schema, name = split_name(current["table"])
                t = tables.setdefault(f"{schema}.{name}", {"columns": [], "rows": None, "constraints": {}})
                t["constraints"][m.group("name")] = m.group("def").strip()
                current = None


    return {
        "tables": dict(sorted(tables.items())),
        "objects": [
            {"schema": k[0], "name": k[1], "kind": v.get("kind"), "rows": v.get("rows")}
            for k, v in objects.items()
        ],
    }


def render(report: dict) -> str:
    lines: list[str] = []
    tables = report["tables"]
    public = {k: v for k, v in tables.items() if k.startswith("public.")}
    lines.append(f"all tables: {len(tables)}   public tables: {len(public)}")
    kinds: dict[str, int] = {}
    for obj in report["objects"]:
        kinds[obj["kind"]] = kinds.get(obj["kind"], 0) + 1
    lines.append("objects by type: " + ", ".join(f"{k}={v}" for k, v in sorted(kinds.items())))
    lines.append("")
    for name, t in public.items():
        rows = t.get("rows")
        cols = t.get("columns") or []
        lines.append(f"-- {name}  cols={len(cols)} rows={rows if rows is not None else '?'}")
        if cols:
            lines.append("   " + ", ".join(c["name"] for c in cols))
        for cname, cdef in (t.get("constraints") or {}).items():
            lines.append(f"   [{cname}] {cdef}")
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser(description="Summarise a pg_dump plain-text export (read-only).")
    ap.add_argument("dump")
    ap.add_argument("--json")
    ap.add_argument("--text")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()
    report = parse(args.dump)
    text = render(report)
    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=1, ensure_ascii=False)
    if args.text:
        with open(args.text, "w", encoding="utf-8") as fh:
            fh.write(text)
    if not args.quiet:
        print(text)


if __name__ == "__main__":
    main()
