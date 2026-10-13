-- =====================================================================
-- Ariba HR schema: normalization migration (PostgreSQL)
-- Run on a COPY first. Order: lookups -> parents -> children -> views.
-- Run tools/preflight_checks.sql on a disposable source copy before applying this migration.
-- Application queries must be updated for renamed/dropped columns;
-- leave_requests_v gives you the old leave_requests shape meanwhile.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. Lookup tables (replace free-text categories)
-- ---------------------------------------------------------------------
CREATE TABLE employers   (id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL UNIQUE);
CREATE TABLE departments (id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL UNIQUE);
CREATE TABLE job_titles  (id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL UNIQUE);

CREATE TABLE roles (code text PRIMARY KEY);
INSERT INTO roles VALUES ('employee'),('manager'),('hr'),('ceo'),('admin'),('finance'),('chairman'),('admin_manager');

CREATE TABLE workflow_stages (code text PRIMARY KEY);
INSERT INTO workflow_stages VALUES ('manager'),('hr'),('ceo'),('employee'),('completed'),('rejected');

CREATE TABLE leave_types (
  code text PRIMARY KEY, name_ar text NOT NULL, name_en text,
  is_financial boolean NOT NULL DEFAULT false   -- was leave_requests.is_financial (depends on type)
);
CREATE TABLE permission_types       (code text PRIMARY KEY, name_ar text NOT NULL, name_en text);
CREATE TABLE document_types         (code text PRIMARY KEY, name_ar text NOT NULL, name_en text);
CREATE TABLE workflow_request_types (code text PRIMARY KEY, name_ar text NOT NULL, name_en text);

-- Seed from existing data (rename/translate the labels afterwards)
INSERT INTO employers(name)   SELECT DISTINCT btrim(employer)   FROM employee_directory WHERE nullif(btrim(employer),'') IS NOT NULL;
INSERT INTO employers(name)   SELECT DISTINCT btrim(employer) FROM work_locations WHERE lower(btrim(employer)) <> 'all' ON CONFLICT DO NOTHING;
INSERT INTO departments(name) SELECT DISTINCT btrim(department) FROM employee_directory WHERE nullif(btrim(department),'') IS NOT NULL;
INSERT INTO job_titles(name)  SELECT DISTINCT btrim(job_title) FROM employee_directory WHERE nullif(btrim(job_title),'') IS NOT NULL;

INSERT INTO leave_types(code, name_ar, is_financial)
  SELECT type, type, coalesce(bool_or(is_financial),false) FROM leave_requests GROUP BY type;
INSERT INTO permission_types(code, name_ar)       SELECT DISTINCT type, type FROM permissions;
INSERT INTO document_types(code, name_ar)         SELECT DISTINCT document_type, document_type FROM ariba_documents;
INSERT INTO workflow_request_types(code, name_ar) SELECT DISTINCT request_type, request_type FROM workflow_requests;

INSERT INTO leave_types(code,name_ar) VALUES
  ('annual','annual'),('sick','sick'),('emergency','emergency'),('death','death'),('marriage','marriage'),
  ('maternity','maternity'),('paternity','paternity'),('umrah','umrah'),('hajj','hajj'),('remote','remote'),('mission','mission')
ON CONFLICT(code) DO NOTHING;
INSERT INTO permission_types(code,name_ar) VALUES
  ('permission','permission'),('maternity_permission','maternity_permission'),('early_leave','early_leave'),
  ('perm','perm'),('perm_mat','perm_mat')
ON CONFLICT(code) DO NOTHING;
INSERT INTO document_types(code,name_ar) VALUES ('other','other'),('photo','photo'),('letter','letter')
ON CONFLICT(code) DO NOTHING;
INSERT INTO workflow_request_types(code,name_ar) VALUES
  ('annual','annual'),('sick','sick'),('emergency','emergency'),('death','death'),('marriage','marriage'),
  ('maternity','maternity'),('paternity','paternity'),('umrah','umrah'),('hajj','hajj'),('remote','remote'),
  ('mission','mission'),('permission','permission'),('maternity_permission','maternity_permission'),
  ('early_leave','early_leave'),('perm','perm'),('perm_mat','perm_mat'),('advance','advance'),
  ('overtime','overtime'),('forgot_punch','forgot_punch'),('template:custom','template:custom')
ON CONFLICT(code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. employee_directory
-- ---------------------------------------------------------------------
ALTER TABLE employee_directory
  ADD COLUMN employer_id   smallint REFERENCES employers(id),
  ADD COLUMN department_id smallint REFERENCES departments(id),
  ADD COLUMN job_title_id  smallint REFERENCES job_titles(id);

UPDATE employee_directory e SET employer_id   = x.id FROM employers   x WHERE x.name = btrim(e.employer);
UPDATE employee_directory e SET department_id = x.id FROM departments x WHERE x.name = btrim(e.department);
UPDATE employee_directory e SET job_title_id  = x.id FROM job_titles  x WHERE x.name = btrim(e.job_title);

ALTER TABLE employee_directory
  DROP COLUMN employer, DROP COLUMN department, DROP COLUMN job_title;

-- username lives in ariba_auth_accounts (single owner).
-- Preflight check: employee_username_mismatch.
ALTER TABLE employee_directory DROP COLUMN username;

ALTER TABLE employee_directory
  ADD CONSTRAINT employee_directory_manager_fk FOREIGN KEY (manager_id) REFERENCES employee_directory(employee_id),
  ADD CONSTRAINT employee_directory_no_self_manager CHECK (manager_id <> employee_id);

ALTER TABLE employee_termination_archive
  ADD CONSTRAINT termination_employee_fk FOREIGN KEY (employee_id) REFERENCES employee_directory(employee_id);

-- ---------------------------------------------------------------------
-- 3. Auth
-- ---------------------------------------------------------------------
ALTER TABLE ariba_auth_accounts DROP CONSTRAINT IF EXISTS ariba_auth_accounts_role_check;
ALTER TABLE ariba_auth_accounts
  ADD CONSTRAINT accounts_role_fk     FOREIGN KEY (role)        REFERENCES roles(code),
  ADD CONSTRAINT accounts_employee_fk FOREIGN KEY (employee_id) REFERENCES employee_directory(employee_id),
  ADD CONSTRAINT accounts_employee_uq UNIQUE (employee_id);      -- Preflight check: employees_with_multiple_accounts.

-- role/employee_id are derivable from account_id
ALTER TABLE ariba_sessions DROP COLUMN role, DROP COLUMN employee_id;

-- ---------------------------------------------------------------------
-- 4. Workflow
-- ---------------------------------------------------------------------
-- Hard-coded approvers ('40', '86') become configuration
CREATE TABLE workflow_approvers (
  stage       text PRIMARY KEY REFERENCES workflow_stages(code),
  employee_id text NOT NULL REFERENCES employee_directory(employee_id)
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM employee_directory WHERE employee_id='40')
     OR NOT EXISTS (SELECT 1 FROM employee_directory WHERE employee_id='86') THEN
    RAISE EXCEPTION 'Configured workflow approver employees 40 and 86 must exist; see workflow_approver_employees_missing in tools/preflight_checks.sql';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ariba_auth_accounts WHERE employee_id='40' AND active)
     OR NOT EXISTS (SELECT 1 FROM ariba_auth_accounts WHERE employee_id='86' AND active) THEN
    RAISE EXCEPTION 'Configured workflow approvers 40 and 86 need active accounts; see workflow_approver_accounts_missing in tools/preflight_checks.sql';
  END IF;
END $$;
INSERT INTO workflow_approvers VALUES ('hr','40'), ('ceo','86');

-- Preflight check: rejected_requests_without_rejected_action. Backfill missing actions before migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM workflow_requests wr WHERE wr.status='rejected'
      AND NOT EXISTS (SELECT 1 FROM workflow_actions wa WHERE wa.request_id=wr.id AND wa.action='rejected')
  ) THEN
    RAISE EXCEPTION 'Rejected workflow requests are missing rejection actions; backfill comments before migration';
  END IF;
END $$;
UPDATE workflow_requests wr SET current_stage='hr',updated_at=now()
FROM employee_directory e
WHERE e.employee_id=wr.employee_id AND e.manager_id IS NULL
  AND wr.current_stage='manager' AND wr.status='pending';
ALTER TABLE workflow_requests
  DROP COLUMN manager_id,          -- = employee's manager in employee_directory
  DROP COLUMN hr_id,
  DROP COLUMN ceo_id,
  DROP COLUMN rejected_at,
  DROP COLUMN rejection_reason,
  DROP COLUMN status;
-- status was fully determined by current_stage -> generated column
ALTER TABLE workflow_requests
  ADD COLUMN status text GENERATED ALWAYS AS (
    CASE current_stage WHEN 'completed' THEN 'approved'
                       WHEN 'rejected'  THEN 'rejected'
                       ELSE 'pending' END) STORED;
ALTER TABLE workflow_requests DROP CONSTRAINT IF EXISTS workflow_requests_current_stage_check;
ALTER TABLE workflow_requests
  ADD CONSTRAINT wr_stage_fk    FOREIGN KEY (current_stage) REFERENCES workflow_stages(code),
  ADD CONSTRAINT wr_employee_fk FOREIGN KEY (employee_id)   REFERENCES employee_directory(employee_id),
  ADD CONSTRAINT wr_type_fk     FOREIGN KEY (request_type)  REFERENCES workflow_request_types(code);

-- actor identity: keep the account, derive the employee from it
-- Preflight check: workflow_actions_missing_actor_account.
UPDATE workflow_actions wa SET actor_account_id=a.id
FROM ariba_auth_accounts a
WHERE wa.actor_account_id IS NULL AND wa.actor_employee_id=a.employee_id;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM workflow_actions WHERE actor_account_id IS NULL) THEN
    RAISE EXCEPTION 'Workflow actions still have no actor account; resolve workflow_actions_missing_actor_account before migration';
  END IF;
END $$;
ALTER TABLE workflow_actions DROP COLUMN actor_employee_id;
UPDATE workflow_actions SET stage = replace(stage, 'hr_override_', '') WHERE stage LIKE 'hr_override_%';
ALTER TABLE workflow_actions ADD CONSTRAINT wa_stage_fk FOREIGN KEY (stage) REFERENCES workflow_stages(code);
CREATE INDEX workflow_actions_request_idx ON workflow_actions(request_id, stage, created_at);

-- is_read duplicated read_at
UPDATE workflow_notifications SET read_at=created_at WHERE is_read AND read_at IS NULL;
ALTER TABLE workflow_notifications DROP COLUMN is_read;
ALTER TABLE workflow_notifications
  ADD CONSTRAINT wn_recipient_fk FOREIGN KEY (recipient_employee_id) REFERENCES employee_directory(employee_id);
CREATE INDEX workflow_notifications_unread_idx ON workflow_notifications(recipient_employee_id) WHERE read_at IS NULL;

-- ---------------------------------------------------------------------
-- 5. leave_requests: approvals move to workflow_actions
-- ---------------------------------------------------------------------
-- Preflight check: leave_requests_missing_workflow_or_actions. Backfill from mgr_*/hr_*/ceo_* before migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM leave_requests lr
    LEFT JOIN workflow_requests wr ON wr.id=lr.workflow_request_id
    WHERE lr.workflow_request_id IS NULL OR wr.id IS NULL
       OR NOT EXISTS (SELECT 1 FROM workflow_actions wa WHERE wa.request_id=lr.workflow_request_id)
  ) THEN
    RAISE EXCEPTION 'Leave requests are missing workflow requests/actions; backfill them before migration';
  END IF;
END $$;
ALTER TABLE leave_requests RENAME COLUMN emp_id TO employee_id;
ALTER TABLE leave_requests RENAME COLUMN type   TO leave_type;
ALTER TABLE leave_requests ADD COLUMN doc_attachment_id uuid;   -- migrate doc_attachment -> ariba_documents.id, then drop it

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM leave_requests lr
    WHERE lr.doc_attachment IS NOT NULL AND btrim(lr.doc_attachment) <> ''
      AND (btrim(lr.doc_attachment) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           OR NOT EXISTS (SELECT 1 FROM ariba_documents d WHERE d.id::text=btrim(lr.doc_attachment)))
  ) THEN
    RAISE EXCEPTION 'Some leave_requests.doc_attachment values do not identify ariba_documents.id; resolve them before migration';
  END IF;
END $$;
UPDATE leave_requests lr SET doc_attachment_id=d.id
FROM ariba_documents d WHERE btrim(lr.doc_attachment)=d.id::text;

ALTER TABLE leave_requests
  DROP COLUMN status,  DROP COLUMN mgr_status, DROP COLUMN mgr_notes, DROP COLUMN mgr_at,
  DROP COLUMN hr_status, DROP COLUMN hr_notes, DROP COLUMN hr_at,
  DROP COLUMN ceo_status, DROP COLUMN ceo_notes, DROP COLUMN ceo_at,
  DROP COLUMN manager_id, DROP COLUMN rejected_by, DROP COLUMN rejected_reason,
  DROP COLUMN is_financial, DROP COLUMN doc_attachment;

ALTER TABLE leave_requests
  ALTER COLUMN workflow_request_id SET NOT NULL,
  ADD CONSTRAINT lr_workflow_fk FOREIGN KEY (workflow_request_id) REFERENCES workflow_requests(id),
  ADD CONSTRAINT lr_employee_fk FOREIGN KEY (employee_id)         REFERENCES employee_directory(employee_id),
  ADD CONSTRAINT lr_type_fk     FOREIGN KEY (leave_type)          REFERENCES leave_types(code),
  ADD CONSTRAINT lr_dates_ck    CHECK (to_date >= from_date),
  ADD CONSTRAINT lr_days_ck     CHECK (days > 0);
-- `days` is kept on purpose: it is a snapshot (weekends/holidays at request time), not a pure function of the dates.

-- ---------------------------------------------------------------------
-- 6. attendance and permissions
-- ---------------------------------------------------------------------
ALTER TABLE attendance
  RENAME COLUMN emp_id TO employee_id;
UPDATE attendance a SET location_id=w.id FROM work_locations w
  WHERE a.location_id IS NOT NULL AND a.location_id<>w.id AND a.location_id=w.name
    AND (SELECT count(*) FROM work_locations w2 WHERE w2.name=a.location_id)=1;
UPDATE attendance a SET location_id=w.id FROM work_locations w
  WHERE a.location_id IS NULL AND a.location_name=w.id;
UPDATE attendance a SET location_id=w.id FROM work_locations w
  WHERE a.location_id IS NULL AND a.location_name=w.name
    AND (SELECT count(*) FROM work_locations w2 WHERE w2.name=a.location_name)=1;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM attendance a WHERE a.location_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM work_locations w WHERE w.id=a.location_id)) THEN
    RAISE EXCEPTION 'Attendance location_id values must resolve to work_locations.id before migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM attendance a WHERE a.location_id IS NULL AND a.location_name IS NOT NULL
      AND (NOT EXISTS (SELECT 1 FROM work_locations w WHERE w.id=a.location_name OR w.name=a.location_name)
           OR (NOT EXISTS (SELECT 1 FROM work_locations w WHERE w.id=a.location_name)
               AND (SELECT count(*) FROM work_locations w WHERE w.name=a.location_name) > 1))
  ) THEN
    RAISE EXCEPTION 'Attendance location_name values must map to exactly one work_locations row before migration';
  END IF;
END $$;
ALTER TABLE attendance DROP COLUMN location_name;
ALTER TABLE attendance
  ADD CONSTRAINT att_employee_fk FOREIGN KEY (employee_id) REFERENCES employee_directory(employee_id),
  ADD CONSTRAINT att_location_fk FOREIGN KEY (location_id) REFERENCES work_locations(id);

-- Several sessions per day are allowed (out and back in).
-- Only one OPEN session (no time_out) per employee per day, so you can't punch in twice in a row.
-- Preflight check: attendance_duplicate_open_session_groups must be 0 before creating the partial unique index.
CREATE UNIQUE INDEX att_one_open_session ON attendance (employee_id, date) WHERE time_out IS NULL;
CREATE INDEX att_employee_date_idx ON attendance (employee_id, date);

ALTER TABLE permissions RENAME COLUMN emp_id TO employee_id;
ALTER TABLE permissions RENAME COLUMN type   TO permission_type;
ALTER TABLE permissions
  ADD COLUMN workflow_request_id uuid UNIQUE REFERENCES workflow_requests(id),
  ADD CONSTRAINT perm_employee_fk FOREIGN KEY (employee_id)     REFERENCES employee_directory(employee_id),
  ADD CONSTRAINT perm_type_fk     FOREIGN KEY (permission_type) REFERENCES permission_types(code);
-- once workflow_request_id is backfilled: ALTER TABLE permissions DROP COLUMN status;

-- ---------------------------------------------------------------------
-- 7. Payroll: remove duplicated approval flags and the jsonb array of rows
-- ---------------------------------------------------------------------
CREATE TABLE payroll_periods (
  pay_year    integer NOT NULL,
  pay_month   integer NOT NULL CHECK (pay_month BETWEEN 1 AND 12),
  approved    boolean NOT NULL DEFAULT false,
  approved_at timestamptz,
  PRIMARY KEY (pay_year, pay_month)
);
INSERT INTO payroll_periods (pay_year, pay_month, approved, approved_at)
  SELECT pay_year, pay_month, bool_or(approved), max(approved_at)
  FROM employee_payrolls GROUP BY pay_year, pay_month;
INSERT INTO payroll_periods (pay_year, pay_month, approved, approved_at)
  SELECT pay_year, pay_month, approved, NULLIF(approved_at, '')::timestamptz
  FROM payroll_archives_v2
  ON CONFLICT DO NOTHING;

ALTER TABLE employee_payrolls
  DROP COLUMN approved, DROP COLUMN approved_at,
  ADD CONSTRAINT ep_period_fk   FOREIGN KEY (pay_year, pay_month) REFERENCES payroll_periods(pay_year, pay_month),
  ADD CONSTRAINT ep_employee_fk FOREIGN KEY (employee_id)         REFERENCES employee_directory(employee_id),
  ADD CONSTRAINT ep_unique      UNIQUE (employee_id, pay_year, pay_month);

CREATE TABLE payroll_components (
  code text PRIMARY KEY, name_ar text NOT NULL, name_en text,
  kind text NOT NULL CHECK (kind IN ('earning','deduction'))
);
CREATE TABLE payroll_lines (
  payroll_id     uuid NOT NULL REFERENCES employee_payrolls(id) ON DELETE CASCADE,
  component_code text NOT NULL REFERENCES payroll_components(code),
  amount         numeric(12,2) NOT NULL,
  PRIMARY KEY (payroll_id, component_code)
);
-- TODO (needs a sample payload): explode employee_payrolls.payload into payroll_lines, and
-- payroll_archives_v2.rows via jsonb_array_elements(rows) into employee_payrolls. Then drop
-- employee_payrolls.payload and payroll_archives_v2.

-- ---------------------------------------------------------------------
-- 8. Documents, locations, settings
-- ---------------------------------------------------------------------
ALTER TABLE ariba_documents
  DROP COLUMN file_size,
  ADD COLUMN file_size integer GENERATED ALWAYS AS (octet_length(file_data)) STORED,
  ADD CONSTRAINT doc_employee_fk FOREIGN KEY (employee_id)   REFERENCES employee_directory(employee_id),
  ADD CONSTRAINT doc_request_fk  FOREIGN KEY (request_id)    REFERENCES workflow_requests(id),
  ADD CONSTRAINT doc_type_fk     FOREIGN KEY (document_type) REFERENCES document_types(code);
ALTER TABLE leave_requests
  ADD CONSTRAINT lr_doc_fk FOREIGN KEY (doc_attachment_id) REFERENCES ariba_documents(id);

-- employer 'all' becomes NULL = every employer
ALTER TABLE work_locations ADD COLUMN employer_id smallint REFERENCES employers(id);
UPDATE work_locations w SET employer_id = e.id FROM employers e WHERE e.name = btrim(w.employer) AND lower(btrim(w.employer)) <> 'all';
ALTER TABLE work_locations DROP COLUMN employer;

-- Backend responses derive shift_hours from shift_duration_minutes / 60.
ALTER TABLE company_settings
  DROP COLUMN shift_hours,
  ADD CONSTRAINT company_settings_singleton CHECK (id = 'default'),
  ADD CONSTRAINT company_settings_flex_ck   CHECK (flex_window_end > flex_window_start);

-- ---------------------------------------------------------------------
-- 9. Housekeeping: backups are not part of the domain model
-- ---------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS ops;
ALTER TABLE ariba_backup_v106_duplicates SET SCHEMA ops;
ALTER TABLE ariba_backup_v116_cleanup    SET SCHEMA ops;
ALTER TABLE ariba_function_backups       SET SCHEMA ops;
-- ariba_audit_log and ariba_deleted_items stay as-is: denormalized snapshots are correct for history.

-- ---------------------------------------------------------------------
-- 10. Compatibility view: old leave_requests shape, rebuilt from the workflow
-- ---------------------------------------------------------------------
CREATE VIEW leave_requests_v AS
SELECT lr.id, lr.employee_id AS emp_id, lr.leave_type AS type, lr.from_date, lr.to_date, lr.days, lr.notes,
       wr.status, wr.current_stage,
       coalesce(m.action,'pending') AS mgr_status, m.comment AS mgr_notes, m.created_at AS mgr_at,
       coalesce(h.action,'pending') AS hr_status,  h.comment AS hr_notes,  h.created_at AS hr_at,
      coalesce(c.action,'pending') AS ceo_status, c.comment AS ceo_notes, c.created_at AS ceo_at,
      emp.manager_id, lt.is_financial, lr.doc_attachment_id::text AS doc_attachment, lr.created_at, lr.updated_at, lr.workflow_request_id
FROM leave_requests lr
JOIN workflow_requests   wr  ON wr.id = lr.workflow_request_id
JOIN employee_directory  emp ON emp.employee_id = lr.employee_id
JOIN leave_types         lt  ON lt.code = lr.leave_type
LEFT JOIN LATERAL (SELECT action, comment, created_at FROM workflow_actions a
                   WHERE a.request_id = wr.id AND a.stage = 'manager' AND a.action IN ('approved','rejected')
                   ORDER BY created_at DESC LIMIT 1) m ON true
LEFT JOIN LATERAL (SELECT action, comment, created_at FROM workflow_actions a
                   WHERE a.request_id = wr.id AND a.stage = 'hr' AND a.action IN ('approved','rejected')
                   ORDER BY created_at DESC LIMIT 1) h ON true
LEFT JOIN LATERAL (SELECT action, comment, created_at FROM workflow_actions a
                   WHERE a.request_id = wr.id AND a.stage = 'ceo' AND a.action IN ('approved','rejected')
                   ORDER BY created_at DESC LIMIT 1) c ON true;

COMMIT;
