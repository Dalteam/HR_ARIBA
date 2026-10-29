-- Data fixes that must run before ariba_normalization.sql.
-- Always run on a disposable copy of the source. Order:
--   preflight_checks.sql  ->  this file  ->  preflight_checks.sql again  ->  ariba_normalization.sql
-- Every fix is written against the data, not against one snapshot: no hard-coded usernames or ids.
BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Supabase-only plumbing: triggers that mirror accounts into auth.users.
--    They fire on the UPDATEs below and cannot run outside Supabase (Railway has no
--    auth schema), so they go first. The new backend owns authentication itself.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS ariba_accounts_auth_sync   ON ariba_auth_accounts;
DROP TRIGGER IF EXISTS ariba_accounts_auth_insert ON ariba_auth_accounts;
DROP TRIGGER IF EXISTS ariba_accounts_auth_update ON ariba_auth_accounts;
DROP TRIGGER IF EXISTS ariba_accounts_auth_del    ON ariba_auth_accounts;

-- A. Account pointing to a deleted employee: detach it (keep the row)
UPDATE ariba_auth_accounts a SET employee_id = NULL, updated_at = now()
WHERE a.employee_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM employee_directory d WHERE d.employee_id = a.employee_id);

-- B. Duplicate accounts per employee: keep one, detach the rest, record what was detached.
--    Winner: the username that matches employee_directory.username, then active, then oldest.
--    (Preflight check: employees_with_multiple_accounts. The normalizer adds UNIQUE(employee_id).)
CREATE SCHEMA IF NOT EXISTS ops;
CREATE TABLE IF NOT EXISTS ops.detached_accounts (
  account_id      uuid PRIMARY KEY,
  username        text,
  employee_id     text,
  role            text,
  kept_account_id uuid,
  reason          text,
  detached_at     timestamptz NOT NULL DEFAULT now()
);

WITH ranked AS (
  SELECT a.id, a.username, a.employee_id, a.role, d.username AS dir_username,
         first_value(a.id) OVER w AS kept_id,
         row_number()      OVER w AS rn
  FROM ariba_auth_accounts a
  JOIN employee_directory  d ON d.employee_id = a.employee_id
  WINDOW w AS (PARTITION BY a.employee_id
               ORDER BY (a.username = d.username) DESC, a.active DESC, a.created_at, a.id)
), logged AS (
  INSERT INTO ops.detached_accounts (account_id, username, employee_id, role, kept_account_id, reason)
  SELECT id, username, employee_id, role, kept_id,
         CASE WHEN username = dir_username THEN 'duplicate_account'
              ELSE 'duplicate_username_mismatch' END
  FROM ranked
  WHERE rn > 1
  ON CONFLICT (account_id) DO NOTHING
  RETURNING account_id
)
UPDATE ariba_auth_accounts a SET employee_id = NULL, updated_at = now()
WHERE a.id IN (SELECT account_id FROM logged);


-- C. Rejected requests without a 'rejected' action are rebuilt by F below, from the legacy
--    mgr_/hr_/ceo_ columns; C is the fallback for requests that have some actions but no
--    rejection. It runs after F so the full history is kept when it exists.

-- D. Orphan payrolls: back them up to ops, then remove them
CREATE SCHEMA IF NOT EXISTS ops;
CREATE TABLE IF NOT EXISTS ops.orphan_payrolls_backup AS
  SELECT p.* FROM employee_payrolls p
  WHERE NOT EXISTS (SELECT 1 FROM employee_directory d WHERE d.employee_id = p.employee_id);
DELETE FROM employee_payrolls p
WHERE NOT EXISTS (SELECT 1 FROM employee_directory d WHERE d.employee_id = p.employee_id);

-- E. Legacy "HR override" rows use stage names outside the new stage list
--    (hr_override_manager, hr_override_hr, ...). The normalizer strips that prefix, so do the same
--    here rather than deleting real approval history; whatever is still unmapped goes, so the
--    new FK on workflow_actions.stage can be created.
UPDATE workflow_actions SET stage = replace(stage, 'hr_override_', '') WHERE stage LIKE 'hr_override_%';
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

-- C. Rejected requests that still have no rejection action (but do have other actions): backfill
--    one, before normalization drops workflow_requests.rejection_reason/rejected_at.
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

COMMIT;