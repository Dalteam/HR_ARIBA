"""Load the canonical Supabase export (supabase_canonical.sql) into an EMPTY PostgreSQL database.

    CANONICAL_TARGET_URL=postgresql://... python tools/load_canonical.py /path/to/supabase_canonical.sql

- Reads the SQL file only; never modifies it, never touches the database it came from.
- The target is given explicitly (CANONICAL_TARGET_URL), never DATABASE_URL, so the app's own
  connection can't be hit by mistake. Refuses to run if the target already has public tables.
- The export repeats the COPY block of some tables twice (identical copies); each table's data is
  loaded once. Nothing else is changed: no keys, functions or policies are added.
"""

import os
import re
import sys
from collections import Counter

import psycopg

COPY_RE = re.compile(r"^COPY public\.(\w+) \((.*)\) FROM stdin;$")


def blocks(path: str):
    """Yield ('ddl', sql) for each CREATE TABLE and ('copy', table, columns, lines) for each data block."""
    with open(path, encoding="utf-8") as f:
        ddl: list[str] | None = None
        copy: tuple[str, str, list[str]] | None = None
        for raw in f:
            line = raw.rstrip("\n")
            if copy is not None:
                if line == "\\.":
                    yield ("copy", *copy)
                    copy = None
                else:
                    copy[2].append(raw)
                continue
            if ddl is not None:
                ddl.append(raw)
                if line == ");":
                    yield ("ddl", "".join(ddl))
                    ddl = None
                continue
            if line.startswith("CREATE TABLE public."):
                ddl = [raw]
            elif m := COPY_RE.match(line):
                copy = (m.group(1), m.group(2), [])


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    url = os.environ.get("CANONICAL_TARGET_URL", "").replace("postgresql+psycopg://", "postgresql://")
    if not url.startswith(("postgresql://", "postgres://")):
        raise SystemExit("Set CANONICAL_TARGET_URL to the target PostgreSQL URL")
    loaded: dict[str, int] = {}
    skipped: Counter = Counter()
    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
        if cur.fetchone()[0]:
            raise SystemExit("Target database already has public tables; refusing to load into it")
        for kind, *rest in blocks(sys.argv[1]):
            if kind == "ddl":
                cur.execute(rest[0])
                continue
            table, cols, lines = rest
            if table in loaded:
                skipped[table] += 1  # identical repeated block in the export
                continue
            with cur.copy(f"COPY public.{table} ({cols}) FROM STDIN") as cp:
                for ln in lines:
                    cp.write(ln.encode("utf-8"))
            loaded[table] = len(lines)
        conn.commit()
    print(f"tables loaded: {len(loaded)}")
    for t in sorted(loaded):
        print(f"  {t}: {loaded[t]}" + (f"  (repeated block skipped ×{skipped[t]})" if skipped[t] else ""))


if __name__ == "__main__":
    main()
