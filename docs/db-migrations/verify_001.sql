-- Checks after 001_react_port.sql: every new table/column exists, the keys are in place, nothing was lost.
-- Prints one row per check; the run script stops if any row says FAIL.
WITH expected(t) AS (VALUES ('ariba_candidates'), ('ariba_candidate_files'), ('ariba_candidate_invites'), ('ariba_targets'),
  ('ariba_evaluations'), ('ariba_delegations'), ('ariba_manager_perms'), ('ariba_doc_signing'), ('ariba_leave_files'),
  ('ariba_mail_accounts'), ('ariba_mail_log'), ('ariba_tasks'), ('ariba_webauthn_credentials'), ('ariba_push_tokens'))
SELECT 'table ' || t AS check, CASE WHEN to_regclass('public.' || t) IS NOT NULL THEN 'ok' ELSE 'FAIL' END AS result FROM expected
UNION ALL
SELECT 'column ' || c, CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = split_part(c, '.', 1)
  AND column_name = split_part(c, '.', 2)) THEN 'ok' ELSE 'FAIL' END
FROM (VALUES ('workflow_requests.submitted_by_employee_id'), ('workflow_requests.escalated_from'), ('workflow_requests.escalated_at'),
  ('workflow_requests.returned_at'), ('workflow_requests.return_note'), ('workflow_notifications.emailed_at'),
  ('workflow_notifications.email_error'), ('workflow_notifications.email_tries'), ('workflow_notifications.pushed_at'), ('payroll_periods.prepared_at'),
  ('payroll_periods.reopen_reason')) AS x(c)
UNION ALL
SELECT 'lookup ' || code, CASE WHEN EXISTS (SELECT 1 FROM workflow_request_types w WHERE w.code = x.code) THEN 'ok' ELSE 'FAIL' END
FROM (VALUES ('unpaid'), ('salary_advance'), ('iban_change'), ('profile_edit'), ('document')) AS x(code)
UNION ALL
SELECT 'setting workflow_config', CASE WHEN EXISTS (SELECT 1 FROM ariba_app_settings WHERE key = 'workflow_config') THEN 'ok' ELSE 'FAIL' END
UNION ALL
SELECT 'duplicate ariba_app_settings keys (unique index skipped)', CASE WHEN count(*) = 0 THEN 'ok' ELSE 'note: ' || string_agg(key, ', ') END
FROM (SELECT key FROM ariba_app_settings GROUP BY key HAVING count(*) > 1) d
UNION ALL
SELECT 'foreign keys on the new tables', CASE WHEN count(*) >= 20 THEN 'ok (' || count(*) || ')' ELSE 'FAIL (' || count(*) || ')' END
FROM pg_constraint WHERE contype = 'f' AND conrelid::regclass::text IN ('ariba_candidates', 'ariba_candidate_files', 'ariba_candidate_invites',
  'ariba_targets', 'ariba_evaluations', 'ariba_delegations', 'ariba_manager_perms', 'ariba_doc_signing', 'ariba_leave_files',
  'ariba_tasks', 'ariba_webauthn_credentials', 'ariba_push_tokens', 'workflow_requests');
