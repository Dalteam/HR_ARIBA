"""Validate a canonical database that was restored from a dump (e.g. the Railway Postgres).

Needs only a connection string, no second database to compare against: the expected shape
(public tables, foreign keys, indexes and row counts) is read from `expected_counts.json`,
which is generated from the database the API smoke test already passed on.

Checks
  1. every expected table exists, no unexpected public table appeared
  2. row counts match (sessions and login counters are listed but not compared: they expire or grow
     as soon as the service is used)
  3. every declared foreign key is VALIDATED and holds no orphan rows (checking the data, not only
     the catalog flag)
  4. references the schema does not enforce (manager_id, employee ids inside JSON-ish columns) hold
     no orphans either
  5. no duplicate employees / usernames / payroll months, no blank required columns

Usage
    backend\\.venv\\Scripts\\python.exe tools\\smoke\\railway_validate.py --url "$env:DATABASE_PUBLIC_URL"
    backend\\.venv\\Scripts\\python.exe tools\\smoke\\railway_validate.py --url <conninfo> --write-expected

Exit code 0 only when every check passed; the report is printed and written to `--out`.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import psycopg

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]                      # repository root
DEFAULT_EXPECTED = HERE / "expected_counts.json"

# Tables whose row count changes as soon as somebody signs in or a request is submitted.
VOLATILE = {"ariba_sessions", "ariba_login_attempts"}

# References the legacy schema never enforced (no foreign keys existed before the migration).
SOFT_REFERENCES = [
    ("employee_directory", "manager_id", "employee_directory", "employee_id"),
    ("attendance", "employee_id", "employee_directory", "employee_id"),
    ("employee_payrolls", "employee_id", "employee_directory", "employee_id"),
    ("leave_requests", "employee_id", "employee_directory", "employee_id"),
    ("permissions", "employee_id", "employee_directory", "employee_id"),
    ("ariba_auth_accounts", "employee_id", "employee_directory", "employee_id"),
    ("ariba_documents", "employee_id", "employee_directory", "employee_id"),
    ("workflow_requests", "employee_id", "employee_directory", "employee_id"),
    ("workflow_notifications", "recipient_employee_id", "employee_directory", "employee_id"),
    ("workflow_approvers", "employee_id", "employee_directory", "employee_id"),
]

DUPLICATES = [
    ("duplicate employee ids",
     "SELECT count(*) FROM (SELECT employee_id FROM public.employee_directory GROUP BY 1 HAVING count(*)>1) d"),
    ("duplicate usernames",
     "SELECT count(*) FROM (SELECT lower(username) FROM public.ariba_auth_accounts WHERE username IS NOT NULL "
     "GROUP BY 1 HAVING count(*)>1) d"),
    ("duplicate employee numbers",
     "SELECT count(*) FROM (SELECT data->>'empNo' FROM public.employee_directory WHERE data->>'empNo' IS NOT NULL "
     "GROUP BY 1 HAVING count(*)>1) d"),
    ("duplicate payroll months per employee",
     "SELECT count(*) FROM (SELECT employee_id,pay_year,pay_month FROM public.employee_payrolls "
     "GROUP BY 1,2,3 HAVING count(*)>1) d"),
]


def conninfo(url: str) -> str:
    """psycopg wants postgresql:// but Railway also hands out postgres:// and postgresql+psycopg://."""
    for prefix in ("postgresql+psycopg://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql://" + url[len(prefix):]
    return url


def public_tables(db: psycopg.Connection) -> list[str]:
    rows = db.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' "
                      "AND table_type='BASE TABLE' ORDER BY 1").fetchall()
    return [r[0] for r in rows]


def row_count(db: psycopg.Connection, table: str) -> int:
    return int(db.execute(f'SELECT count(*) FROM public."{table}"').fetchone()[0])


def foreign_keys(db: psycopg.Connection) -> list[dict]:
    """Every FK in public with its columns resolved to identifiers, ready for an orphan query."""
    rows = db.execute("""
        SELECT c.conname,
               format('%I.%I', cn.nspname, cl.relname) AS child,
               format('%I.%I', pn.nspname, pl.relname) AS parent,
               (SELECT array_agg(quote_ident(a.attname) ORDER BY k.ord)
                  FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
                  JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum) AS child_cols,
               (SELECT array_agg(quote_ident(a.attname) ORDER BY k.ord)
                  FROM unnest(c.confkey) WITH ORDINALITY k(attnum, ord)
                  JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.attnum) AS parent_cols,
               c.convalidated
          FROM pg_constraint c
          JOIN pg_namespace n  ON n.oid=c.connamespace
          JOIN pg_class     cl ON cl.oid=c.conrelid
          JOIN pg_namespace cn ON cn.oid=cl.relnamespace
          JOIN pg_class     pl ON pl.oid=c.confrelid
          JOIN pg_namespace pn ON pn.oid=pl.relnamespace
         WHERE c.contype='f' AND n.nspname='public'
         ORDER BY 2, 1""").fetchall()
    return [{"name": r[0], "child": r[1], "parent": r[2], "child_cols": list(r[3]),
             "parent_cols": list(r[4]), "validated": r[5]} for r in rows]


def orphan_count(db: psycopg.Connection, fk: dict) -> int:
    not_null = " AND ".join(f"t.{column} IS NOT NULL" for column in fk["child_cols"])
    match = " AND ".join(f"p.{parent} = t.{child}"
                         for child, parent in zip(fk["child_cols"], fk["parent_cols"]))
    sql = (f"SELECT count(*) FROM {fk['child']} t WHERE {not_null} "
           f"AND NOT EXISTS (SELECT 1 FROM {fk['parent']} p WHERE {match})")
    return int(db.execute(sql).fetchone()[0])

def snapshot(db: psycopg.Connection) -> dict:
    tables = public_tables(db)
    return {
        "generated_from": db.execute("SELECT current_database()").fetchone()[0],
        "server_version": db.execute("SHOW server_version").fetchone()[0],
        "tables": len(tables),
        "foreign_keys": len(foreign_keys(db)),
        "indexes": int(db.execute("SELECT count(*) FROM pg_indexes WHERE schemaname='public'").fetchone()[0]),
        "row_counts": {table: row_count(db, table) for table in tables},
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Validate a restored canonical database.")
    ap.add_argument("--url", required=True, help="postgres URL or key=value conninfo of the target database")
    ap.add_argument("--expected", default=str(DEFAULT_EXPECTED), help="expected shape written by --write-expected")
    ap.add_argument("--out", default=str(ROOT / "_db_validate.txt"), help="report file")
    ap.add_argument("--write-expected", action="store_true",
                    help="write the expected shape from --url instead of validating against it")
    args = ap.parse_args()

    lines: list[str] = [f"database validation: {args.url.split('@')[-1]}", ""]
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        checks.append((name, ok, detail))
        lines.append(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  {detail}" if detail else ""))

    with psycopg.connect(conninfo(args.url), autocommit=True, connect_timeout=20) as db:
        version = db.execute("SHOW server_version").fetchone()[0]
        if args.write_expected:
            data = snapshot(db)
            Path(args.expected).write_text(json.dumps(data, indent=1) + "\n", encoding="utf-8")
            print(f"wrote {args.expected} from {data['generated_from']} "
                  f"({data['tables']} tables, {data['row_counts'].get('employee_directory', 0)} employees)")
            return 0

        expected = json.loads(Path(args.expected).read_text(encoding="utf-8"))
        lines.insert(0, f"database validation against {Path(args.expected).name} "
                        f"(from {expected['generated_from']}), server {version}")


        # 1. the schema is there
        here = set(public_tables(db))
        missing = sorted(set(expected["row_counts"]) - here)
        unexpected = sorted(here - set(expected["row_counts"]))
        check(f"all {len(expected['row_counts'])} expected public tables exist", not missing,
              f"missing: {missing[:6]}" if missing else "")
        check("no unexpected public table appeared", not unexpected,
              f"extra: {unexpected[:6]}" if unexpected else "")

        # 2. the data is there (sessions and login counters are ignored: they expire or grow with use)
        drifted, ignored = [], []
        for table, want in expected["row_counts"].items():
            if table not in here:
                continue
            got = row_count(db, table)
            if got == want:
                continue
            if table in VOLATILE:
                ignored.append(f"{table} {want}->{got}")
                continue
            drifted.append(f"{table} {want}->{got}")
        check("row counts match the validated database", not drifted, "; ".join(drifted) if drifted
              else f"{len(expected['row_counts'])} tables")
        if ignored:
            lines.append(f"INFO  not compared (volatile): {', '.join(ignored)}")

        # 3. declared foreign keys: validated flag and no orphan rows
        fks = foreign_keys(db)
        unvalidated = [fk["name"] for fk in fks if not fk["validated"]]
        keys_ok = len(fks) == expected["foreign_keys"] and not unvalidated
        check(f"all {len(fks)} foreign keys are declared and validated", keys_ok,
              "" if keys_ok else f"expected {expected['foreign_keys']}; unvalidated: {unvalidated[:4]}")
        broken = []
        for fk in fks:
            if fk["child"].split(".")[-1] not in here:
                continue
            orphans = orphan_count(db, fk)
            if orphans:
                broken.append(f"{fk['child']}.{fk['name']} ({orphans} rows)")
        check("every foreign key holds only rows that exist", not broken,
              "; ".join(broken[:6]) if broken else f"{len(fks)} keys checked against the data")

        # 4. references nobody declared (a column the canonical schema renamed is skipped, not failed)
        present = {(r[0], r[1]) for r in db.execute(
            "SELECT table_name, column_name FROM information_schema.columns "
            "WHERE table_schema='public'").fetchall()}
        soft_broken, soft_checked, soft_skipped = [], 0, []
        for table, column, ref_table, ref_column in SOFT_REFERENCES:
            if table not in here or ref_table not in here:
                continue
            if (table, column) not in present or (ref_table, ref_column) not in present:
                soft_skipped.append(f"{table}.{column}")
                continue
            soft_checked += 1
            orphans = int(db.execute(
                f'SELECT count(*) FROM public."{table}" t WHERE t."{column}" IS NOT NULL '
                f'AND NOT EXISTS (SELECT 1 FROM public."{ref_table}" r WHERE r."{ref_column}"=t."{column}")'
            ).fetchone()[0])
            if orphans:
                soft_broken.append(f"{table}.{column} ({orphans})")
        check("employee references hold only rows that exist", not soft_broken,
              "; ".join(soft_broken) if soft_broken else f"{soft_checked} references")
        if soft_skipped:
            lines.append(f"INFO  not checked (column renamed in the canonical schema): {', '.join(soft_skipped)}")

        # 5. duplicates and blanks the legacy data could hold
        for label, sql in DUPLICATES:
            if not set(w for w in ("employee_directory", "ariba_auth_accounts", "employee_payrolls")
                       if w in sql) <= here:
                continue
            found = int(db.execute(sql).fetchone()[0])
            check(f"no {label}", found == 0, f"{found} found")
        blanks = int(db.execute("SELECT count(*) FROM public.employee_directory WHERE "
                                "coalesce(btrim(employee_id),'')='' OR coalesce(btrim(name_ar),'')=''"
                                ).fetchone()[0])
        check("employee id and Arabic name are always filled", blanks == 0, f"{blanks} blank rows")

        # 6. the dump carried the payloads, not only the keys
        no_data = int(db.execute("SELECT count(*) FROM public.employee_directory "
                                 "WHERE data IS NULL OR data='{}'::jsonb").fetchone()[0])
        check("every employee kept its legacy jsonb payload", no_data == 0, f"{no_data} empty")
        employees = row_count(db, "employee_directory")
        check("the directory is not empty", employees > 0, f"{employees} employees")

    failed = [name for name, ok, _ in checks if not ok]
    lines += ["", f"summary: checks={len(checks)}  failed={len(failed)}",
              "RESULT: " + ("FAIL" if failed else "OK")]
    text = "\n".join(lines)
    Path(args.out).write_text(text, encoding="utf-8")
    print(text)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

