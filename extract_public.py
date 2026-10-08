
from pathlib import Path
import re

SOURCE = Path("supabase_full.sql")
OUTPUT = Path("supabase_canonical.sql")

CANONICAL_TABLES = {
    "ariba_app_settings",
    "ariba_asset_custody_log",
    "ariba_assets",
    "ariba_audit_log",
    "ariba_audit_purge_requests",
    "ariba_auth_accounts",
    "ariba_backup_v106_duplicates",
    "ariba_backup_v116_cleanup",
    "ariba_bootstrap_recovery",
    "ariba_deleted_items",
    "ariba_documents",
    "ariba_employee_master_state",
    "ariba_function_backups",
    "ariba_leave_tombstones",
    "ariba_login_attempts",
    "ariba_password_resets",
    "ariba_payroll_status",
    "ariba_preview_pages",
    "ariba_role_perms",
    "ariba_security_flags",
    "ariba_sessions",
    "attendance",
    "company_settings",
    "employee_directory",
    "employee_payrolls",
    "employee_termination_archive",
    "leave_requests",
    "payroll_archives_v2",
    "permissions",
    "public_holidays",
    "work_locations",
    "workflow_actions",
    "workflow_notifications",
    "workflow_requests",
}

text = SOURCE.read_text(encoding="utf-8")

output = []

# Extract CREATE TABLE blocks for exactly the canonical tables.
for table in CANONICAL_TABLES:
    pattern = re.compile(
        rf"CREATE TABLE public\.{re.escape(table)}\s*\(.*?\n\);",
        re.DOTALL,
    )

    match = pattern.search(text)

    if not match:
        raise RuntimeError(f"Missing CREATE TABLE for {table}")

    output.append(match.group(0))
    output.append("\n\n")


# Extract COPY data blocks for exactly the canonical tables.
for table in CANONICAL_TABLES:
    pattern = re.compile(
        rf"COPY public\.{re.escape(table)}\s*\(.*?\)\s+FROM stdin;\n.*?\n\\\.",
        re.DOTALL,
    )

    match = pattern.search(text)

    if not match:
        raise RuntimeError(f"Missing COPY data for {table}")

    output.append(match.group(0))
    output.append("\n\n")


OUTPUT.write_text("".join(output), encoding="utf-8")

print(f"Created: {OUTPUT.resolve()}")
print(f"Size: {OUTPUT.stat().st_size:,} bytes")
print(f"Canonical tables: {len(CANONICAL_TABLES)}")
print("CREATE TABLE sections: 34")
print("COPY sections: 34")

