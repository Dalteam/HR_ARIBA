BEGIN;

-- A. Account pointing to a deleted employee: detach it (keep the row)
UPDATE ariba_auth_accounts a SET employee_id = NULL, updated_at = now()
WHERE a.employee_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM employee_directory d WHERE d.employee_id = a.employee_id);

-- B. Duplicate accounts per employee: keep the one matching the directory username
UPDATE ariba_auth_accounts SET employee_id = NULL, updated_at = now()
WHERE username = 'Ariba-HR' AND employee_id = '40';
UPDATE ariba_auth_accounts SET employee_id = NULL, updated_at = now()
WHERE username = 'EMPXLS-62d422dece6b' AND employee_id = 'XLS-62d422dece6b';

-- C. Rejected requests without a 'rejected' action: backfill before the old columns are dropped
INSERT INTO workflow_actions (request_id, actor_account_id, stage, action, comment, created_at)
SELECT wr.id, (SELECT id FROM ariba_auth_accounts WHERE employee_id = '40' LIMIT 1),
       CASE WHEN lr.mgr_status = 'rejected' THEN 'manager'
            WHEN lr.hr_status  = 'rejected' THEN 'hr' ELSE 'ceo' END,
       'rejected',
       coalesce(wr.rejection_reason, lr.rejected_reason, lr.mgr_notes, lr.hr_notes, lr.ceo_notes),
       coalesce(wr.rejected_at, lr.mgr_at, lr.hr_at, lr.ceo_at, wr.updated_at)
FROM workflow_requests wr
LEFT JOIN leave_requests lr ON lr.workflow_request_id = wr.id
WHERE wr.status = 'rejected'
  AND NOT EXISTS (SELECT 1 FROM workflow_actions a WHERE a.request_id = wr.id AND a.action = 'rejected');

-- D. Orphan payrolls: back them up to ops, then remove them
CREATE SCHEMA IF NOT EXISTS ops;
CREATE TABLE IF NOT EXISTS ops.orphan_payrolls_backup AS
  SELECT p.* FROM employee_payrolls p
  WHERE NOT EXISTS (SELECT 1 FROM employee_directory d WHERE d.employee_id = p.employee_id);
DELETE FROM employee_payrolls p
WHERE NOT EXISTS (SELECT 1 FROM employee_directory d WHERE d.employee_id = p.employee_id);

-- E. Legacy "HR override" action rows use stage names outside the new stage list: remove them
DELETE FROM workflow_actions
WHERE stage NOT IN ('manager','hr','ceo','employee','completed','rejected');

-- F. Leave requests left with no workflow actions: rebuild from the old mgr_/hr_/ceo_ columns
INSERT INTO workflow_actions (request_id, actor_account_id, stage, action, comment, created_at)
SELECT lr.workflow_request_id,
       (SELECT id FROM ariba_auth_accounts WHERE employee_id = '40' LIMIT 1),
       s.stage, s.status, s.notes, coalesce(s.at, lr.updated_at, lr.created_at)
FROM leave_requests lr
CROSS JOIN LATERAL (VALUES
  ('manager', lr.mgr_status, lr.mgr_notes, lr.mgr_at),
  ('hr',      lr.hr_status,  lr.hr_notes,  lr.hr_at),
  ('ceo',     lr.ceo_status, lr.ceo_notes, lr.ceo_at)
) AS s(stage, status, notes, at)
WHERE s.status IN ('approved', 'rejected')
  AND NOT EXISTS (SELECT 1 FROM workflow_actions a WHERE a.request_id = lr.workflow_request_id);

-- F2. Any leave request still without an action (all steps pending): add a 'submitted' action
INSERT INTO workflow_actions (request_id, actor_account_id, stage, action, created_at)
SELECT lr.workflow_request_id,
       (SELECT id FROM ariba_auth_accounts WHERE employee_id = '40' LIMIT 1),
       'employee', 'submitted', lr.created_at
FROM leave_requests lr
WHERE NOT EXISTS (SELECT 1 FROM workflow_actions a WHERE a.request_id = lr.workflow_request_id);

COMMIT;