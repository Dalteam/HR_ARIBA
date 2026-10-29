-- =====================================================================
-- Step 0: prepare the Railway databases for the colleague's scripts (which are run unchanged after it).
-- Run order: railway_prep.sql -> preflight_checks.sql -> pre_migration_fixes.sql -> preflight_checks.sql -> ariba_normalization.sql
--
-- 1. Keys. The Railway databases were loaded from an export that kept no primary/unique/foreign keys, while
--    ariba_normalization.sql references employee_directory(employee_id), workflow_requests(id), ... This restores the
--    keys of the original Supabase schema (aribaOldSchema.txt). A constraint that already exists (by name) is skipped.
-- 2. Payroll approval. ariba_normalization.sql builds payroll_periods from employee_payrolls with bool_or(approved) and
--    max(approved_at), then drops those columns. The app reads a month as approved from its payroll_archives_v2 row,
--    else only when every employee row is approved. The flags are backed up to ops, then aligned so each month
--    migrates with the approval (and approval time) the app shows today.
-- =====================================================================
BEGIN;

-- 1. Keys
DO $$
DECLARE
  k record;
BEGIN
  FOR k IN SELECT * FROM (VALUES
    ('leave_requests',               'leave_requests_pkey',               'PRIMARY KEY (id)'),
    ('leave_requests',               'leave_requests_workflow_request_id_key', 'UNIQUE (workflow_request_id)'),
    ('attendance',                   'attendance_pkey',                   'PRIMARY KEY (id)'),
    ('permissions',                  'permissions_pkey',                  'PRIMARY KEY (id)'),
    ('employee_directory',           'employee_directory_pkey',           'PRIMARY KEY (employee_id)'),
    ('ariba_auth_accounts',          'ariba_auth_accounts_pkey',          'PRIMARY KEY (id)'),
    ('ariba_auth_accounts',          'ariba_auth_accounts_username_key',  'UNIQUE (username)'),
    ('ariba_sessions',               'ariba_sessions_pkey',               'PRIMARY KEY (token)'),
    ('workflow_requests',            'workflow_requests_pkey',            'PRIMARY KEY (id)'),
    ('workflow_actions',             'workflow_actions_pkey',             'PRIMARY KEY (id)'),
    ('workflow_notifications',       'workflow_notifications_pkey',       'PRIMARY KEY (id)'),
    ('work_locations',               'work_locations_pkey',               'PRIMARY KEY (id)'),
    ('employee_payrolls',            'employee_payrolls_pkey',            'PRIMARY KEY (id)'),
    ('ariba_documents',              'ariba_documents_pkey',              'PRIMARY KEY (id)'),
    ('ariba_preview_pages',          'ariba_preview_pages_pkey',          'PRIMARY KEY (slug)'),
    ('public_holidays',              'public_holidays_pkey',              'PRIMARY KEY (id)'),
    ('payroll_archives_v2',          'payroll_archives_v2_pkey',          'PRIMARY KEY (id)'),
    ('ariba_password_resets',        'ariba_password_resets_pkey',        'PRIMARY KEY (id)'),
    ('ariba_password_resets',        'ariba_password_resets_token_hash_key', 'UNIQUE (token_hash)'),
    ('ariba_bootstrap_recovery',     'ariba_bootstrap_recovery_pkey',     'PRIMARY KEY (id)'),
    ('employee_termination_archive', 'employee_termination_archive_pkey', 'PRIMARY KEY (employee_id)'),
    ('ariba_employee_master_state',  'ariba_employee_master_state_pkey',  'PRIMARY KEY (id)'),
    ('company_settings',             'company_settings_pkey',             'PRIMARY KEY (id)'),
    ('ariba_backup_v106_duplicates', 'ariba_backup_v106_duplicates_pkey', 'PRIMARY KEY (employee_id)'),
    ('ariba_backup_v116_cleanup',    'ariba_backup_v116_cleanup_pkey',    'PRIMARY KEY (id)'),
    ('ariba_function_backups',       'ariba_function_backups_pkey',       'PRIMARY KEY (id)'),
    ('ariba_app_settings',           'ariba_app_settings_pkey',           'PRIMARY KEY (key)'),
    ('ariba_deleted_items',          'ariba_deleted_items_pkey',          'PRIMARY KEY (id)'),
    ('ariba_audit_log',              'ariba_audit_log_pkey',              'PRIMARY KEY (id)'),
    -- foreign keys last (they need the primary keys above)
    ('ariba_sessions',               'ariba_sessions_account_id_fkey',    'FOREIGN KEY (account_id) REFERENCES public.ariba_auth_accounts(id)'),
    ('workflow_actions',             'workflow_actions_request_id_fkey',  'FOREIGN KEY (request_id) REFERENCES public.workflow_requests(id)'),
    ('workflow_actions',             'workflow_actions_actor_account_id_fkey', 'FOREIGN KEY (actor_account_id) REFERENCES public.ariba_auth_accounts(id)'),
    ('workflow_notifications',       'workflow_notifications_request_id_fkey', 'FOREIGN KEY (request_id) REFERENCES public.workflow_requests(id)'),
    ('ariba_password_resets',        'ariba_password_resets_account_id_fkey', 'FOREIGN KEY (account_id) REFERENCES public.ariba_auth_accounts(id)'),
    ('ariba_bootstrap_recovery',     'ariba_bootstrap_recovery_account_id_fkey', 'FOREIGN KEY (account_id) REFERENCES public.ariba_auth_accounts(id)')
  ) AS t(tbl, name, def)
  LOOP
    IF to_regclass('public.' || k.tbl) IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = k.name AND conrelid = ('public.' || k.tbl)::regclass) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s', k.tbl, k.name, k.def);
    END IF;
  END LOOP;
END $$;

-- 2. Payroll approval per month
CREATE SCHEMA IF NOT EXISTS ops;
CREATE TABLE IF NOT EXISTS ops.employee_payrolls_approval_backup AS
  SELECT id, employee_id, pay_year, pay_month, approved, approved_at FROM employee_payrolls;

WITH month AS (
  SELECT p.pay_year, p.pay_month,
         coalesce((SELECT a.approved FROM payroll_archives_v2 a WHERE a.pay_year = p.pay_year AND a.pay_month = p.pay_month
                   ORDER BY a.updated_at DESC NULLS LAST LIMIT 1), bool_and(p.approved)) AS approved,
         (SELECT nullif(a.approved_at, '')::timestamptz FROM payroll_archives_v2 a WHERE a.pay_year = p.pay_year AND a.pay_month = p.pay_month
                   AND a.approved ORDER BY a.updated_at DESC NULLS LAST LIMIT 1) AS archive_approved_at
  FROM employee_payrolls p GROUP BY p.pay_year, p.pay_month)
UPDATE employee_payrolls p
SET approved    = m.approved,
    approved_at = CASE WHEN m.approved THEN coalesce(m.archive_approved_at, p.approved_at) END
FROM month m
WHERE m.pay_year = p.pay_year AND m.pay_month = p.pay_month
  AND (p.approved IS DISTINCT FROM m.approved
       OR p.approved_at IS DISTINCT FROM CASE WHEN m.approved THEN coalesce(m.archive_approved_at, p.approved_at) END);

COMMIT;
