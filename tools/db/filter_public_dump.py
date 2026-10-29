"""Turn a full pg_dump (all schemas, owners, grants, RLS) into a public-only, owner-free dump.

    python tools/db/filter_public_dump.py supabase_full.sql -o supabase_public.sql

Equivalent in spirit to:
    pg_dump ... --schema=public --no-owner --no-privileges

but works offline on a dump you already have, so the same file can be loaded into a
local scratch database and into Railway. Read-only on the input.

What is kept: the session preamble, every section whose schema is `public`
(tables, sequences, sequence values, views, indexes, constraints, comments).
What is dropped: all other schemas, extensions, event triggers, publications,
policies, row-security toggles, and every OWNER TO / GRANT / REVOKE statement.
"""

from __future__ import annotations

import argparse
import re

SECTION_START = re.compile(
    r"^-- (?:Data for )?Name: (?P<name>.+?); Type: (?P<kind>.+?); Schema: (?P<schema>.+?); Owner:"
)

# Section kinds that never belong in a public-only, owner-free dump.
DROP_KINDS = {
    "ACL",
    "DEFAULT ACL",
    "EXTENSION",
    "EVENT TRIGGER",
    "PUBLICATION",
    "PUBLICATION TABLE",
    "POLICY",
    "ROW SECURITY",
}

# Lines stripped from kept sections.
STRIP_PREFIXES = (
    "ALTER ",
    "GRANT ",
    "REVOKE ",
    "\\restrict",
    "\\unrestrict",
)
KEEP_ALTER_PREFIXES = ("ALTER TABLE ", "ALTER SEQUENCE ", "ALTER VIEW ", "ALTER MATERIALIZED VIEW ", "ALTER TYPE ")


def is_owner_line(line: str) -> bool:
    return line.endswith(" OWNER TO ") or " OWNER TO " in line


def filter_dump(text: str) -> tuple[str, dict]:
    lines = text.splitlines()
    kept: list[str] = []
    stats = {"sections_kept": 0, "sections_dropped": 0, "owner_lines_dropped": 0, "grant_lines_dropped": 0}
    dropped_kinds: dict[str, int] = {}

    i = 0
    n = len(lines)
    # Preamble: everything before the first section header.
    while i < n and not (lines[i] == "--" and i + 1 < n and SECTION_START.match(lines[i + 1])):
        line = lines[i]
        if line.startswith(("\\restrict", "\\unrestrict")):
            i += 1
            continue
        kept.append(line)
        i += 1

    while i < n:
        if not (lines[i] == "--" and i + 1 < n and SECTION_START.match(lines[i + 1])):
            # Stray content outside a section: keep it (it is normally blank lines).
            kept.append(lines[i])
            i += 1
            continue

        m = SECTION_START.match(lines[i + 1])
        block_start = i
        # Section body runs until the next section header.
        j = i + 3
        while j < n and not (lines[j] == "--" and j + 1 < n and SECTION_START.match(lines[j + 1])):
            j += 1
        body = lines[block_start:j]
        schema = (m.group("schema") or "").strip()
        kind = (m.group("kind") or "").strip()

        keep = schema == "public" and kind not in DROP_KINDS
        if keep:
            stats["sections_kept"] += 1
            for line in body:
                if is_owner_line(line):
                    stats["owner_lines_dropped"] += 1
                    continue
                if line.startswith(("GRANT ", "REVOKE ", "ALTER DEFAULT PRIVILEGES", "\\restrict", "\\unrestrict")):
                    stats["grant_lines_dropped"] += 1
                    continue
                if line.startswith("ALTER ") and not line.startswith(KEEP_ALTER_PREFIXES):
                    stats["grant_lines_dropped"] += 1
                    continue
                kept.append(line)
        else:
            stats["sections_dropped"] += 1
            dropped_kinds[f"{kind}|{schema}"] = dropped_kinds.get(f"{kind}|{schema}", 0) + 1
        i = j

    stats["dropped_kinds"] = dict(sorted(dropped_kinds.items()))
    return "\n".join(kept) + "\n", stats


def main() -> None:
    ap = argparse.ArgumentParser(description="Make a public-only, owner-free dump (offline).")
    ap.add_argument("dump")
    ap.add_argument("-o", "--out", required=True)
    args = ap.parse_args()

    with open(args.dump, "r", encoding="utf-8", errors="replace") as fh:
        text = fh.read()
    filtered, stats = filter_dump(text)
    with open(args.out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(filtered)

    leftovers = sorted({m for m in re.findall(r"\b(auth|storage|realtime|vault|supabase_migrations|cron|net|graphql|graphql_public)\.", filtered)})
    print(f"written: {args.out}")
    print(f"lines: {filtered.count(chr(10))}")
    print(f"sections kept: {stats['sections_kept']}  dropped: {stats['sections_dropped']}")
    print(f"owner lines dropped: {stats['owner_lines_dropped']}  grant/alter-owner lines dropped: {stats['grant_lines_dropped']}")
    print("dropped kinds: " + ", ".join(f"{k}={v}" for k, v in stats["dropped_kinds"].items()))
    print("foreign-schema references left: " + (", ".join(leftovers) if leftovers else "none"))


if __name__ == "__main__":
    main()
