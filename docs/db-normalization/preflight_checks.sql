SELECT check_name, issue_count FROM (
SELECT 'accounts_with_missing_employee' AS check_name, count(*) AS issue_count FROM ariba_auth_accounts a WHERE a.employee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM employee_directory d WHERE d.employee_id = a.employee_id)
UNION ALL SELECT 'accounts_with_roles_not_in_new_roles', count(*) FROM ariba_auth_accounts WHERE role NOT IN ('employee','manager','hr','ceo','admin','finance','chairman','admin_manager')
UNION ALL SELECT 'employees_with_multiple_accounts', count(*) FROM (SELECT employee_id FROM ariba_auth_accounts WHERE employee_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x
UNION ALL SELECT 'employee_username_mismatch', count(*) FROM employee_directory d JOIN ariba_auth_accounts a ON a.employee_id = d.employee_id WHERE a.username <> d.username
UNION ALL SELECT 'employees_with_missing_manager', count(*) FROM employee_directory e WHERE e.manager_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM employee_directory m WHERE m.employee_id = e.manager_id)
UNION ALL SELECT 'employees_that_are_their_own_manager', count(*) FROM employee_directory WHERE manager_id = employee_id
UNION ALL SELECT 'leave_requests_without_workflow_request', count(*) FROM leave_requests WHERE workflow_request_id IS NULL
UNION ALL SELECT 'leave_requests_workflow_request_missing', count(*) FROM leave_requests lr WHERE lr.workflow_request_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM workflow_requests w WHERE w.id = lr.workflow_request_id)
UNION ALL SELECT 'leave_requests_with_no_workflow_actions', count(*) FROM leave_requests lr WHERE NOT EXISTS (SELECT 1 FROM workflow_actions a WHERE a.request_id = lr.workflow_request_id)
UNION ALL SELECT 'leave_requests_bad_dates_or_days', count(*) FROM leave_requests WHERE to_date < from_date OR days <= 0
UNION ALL SELECT 'leave_requests_with_missing_employee', count(*) FROM leave_requests lr WHERE NOT EXISTS (SELECT 1 FROM employee_directory d WHERE d.employee_id = lr.emp_id)
UNION ALL SELECT 'leave_requests_with_doc_attachment_to_migrate', count(*) FROM leave_requests WHERE doc_attachment IS NOT NULL AND doc_attachment <> ''
UNION ALL SELECT 'rejected_requests_without_rejected_action', count(*) FROM workflow_requests wr WHERE wr.status = 'rejected' AND NOT EXISTS (SELECT 1 FROM workflow_actions a WHERE a.request_id = wr.id AND a.action = 'rejected')
UNION ALL SELECT 'workflow_requests_with_missing_employee', count(*) FROM workflow_requests w WHERE NOT EXISTS (SELECT 1 FROM employee_directory d WHERE d.employee_id = w.employee_id)
UNION ALL SELECT 'workflow_actions_missing_actor_account', count(*) FROM workflow_actions WHERE actor_account_id IS NULL AND actor_employee_id IS NOT NULL
UNION ALL SELECT 'workflow_actions_with_unmapped_stage', count(*) FROM workflow_actions WHERE stage NOT IN ('manager','hr','ceo','employee','completed','rejected')
UNION ALL SELECT 'workflow_approver_employees_missing', count(*) FROM (VALUES ('40'),('86')) v(id) WHERE NOT EXISTS (SELECT 1 FROM employee_directory d WHERE d.employee_id = v.id)
UNION ALL SELECT 'notifications_with_missing_recipient', count(*) FROM workflow_notifications n WHERE NOT EXISTS (SELECT 1 FROM employee_directory d WHERE d.employee_id = n.recipient_employee_id)
UNION ALL SELECT 'attendance_with_missing_employee', count(*) FROM attendance a WHERE NOT EXISTS (SELECT 1 FROM employee_directory d WHERE d.employee_id = a.emp_id)
UNION ALL SELECT 'attendance_location_ids_without_work_location', count(*) FROM attendance a WHERE a.location_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM work_locations w WHERE w.id = a.location_id)
UNION ALL SELECT 'attendance_duplicate_open_session_groups', count(*) FROM (SELECT 1 FROM attendance WHERE time_out IS NULL GROUP BY emp_id, date HAVING count(*) > 1) x
UNION ALL SELECT 'attendance_employee_day_groups_with_multiple_sessions', count(*) FROM (SELECT 1 FROM attendance GROUP BY emp_id, date HAVING count(*) > 1) x
UNION ALL SELECT 'permissions_with_missing_employee', count(*) FROM permissions p WHERE NOT EXISTS (SELECT 1 FROM employee_directory d WHERE d.employee_id = p.emp_id)
UNION ALL SELECT 'documents_with_missing_employee', count(*) FROM ariba_documents x WHERE NOT EXISTS (SELECT 1 FROM employee_directory d WHERE d.employee_id = x.employee_id)
UNION ALL SELECT 'documents_with_missing_request', count(*) FROM ariba_documents x WHERE x.request_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM workflow_requests w WHERE w.id = x.request_id)
UNION ALL SELECT 'payrolls_with_missing_employee', count(*) FROM employee_payrolls p WHERE NOT EXISTS (SELECT 1 FROM employee_directory d WHERE d.employee_id = p.employee_id)
UNION ALL SELECT 'payrolls_duplicate_employee_month', count(*) FROM (SELECT 1 FROM employee_payrolls GROUP BY employee_id, pay_year, pay_month HAVING count(*) > 1) x
UNION ALL SELECT 'payroll_archive_approved_at_values_that_do_not_cast', count(*) FROM payroll_archives_v2 WHERE approved_at IS NOT NULL AND approved_at <> '' AND NOT pg_input_is_valid(approved_at, 'timestamptz')
UNION ALL SELECT 'termination_archive_employees_missing', count(*) FROM employee_termination_archive t WHERE NOT EXISTS (SELECT 1 FROM employee_directory d WHERE d.employee_id = t.employee_id)
UNION ALL SELECT 'company_settings_rows_violating_new_checks', count(*) FROM company_settings WHERE id <> 'default' OR flex_window_end <= flex_window_start
) c ORDER BY check_name;
