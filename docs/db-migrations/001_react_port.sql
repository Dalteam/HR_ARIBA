-- =====================================================================
-- 001_react_port.sql — the tables and columns the features ported from the HR department's React system need
-- (docs/17_PORT_PLAN.md section 3), on the normalized schema. Schema only: no data is changed or removed.
-- One transaction; every object is created IF NOT EXISTS, so a second run changes nothing.
-- Run with docs/db-migrations/run_on_railway.sh (backup + check first, then this file, then verify_001.sql).
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. Lookups for the new request, leave and document types
-- ---------------------------------------------------------------------
INSERT INTO workflow_request_types(code, name_ar, name_en) VALUES
  ('unpaid', 'إجازة بدون راتب', 'Unpaid leave'), ('salary_advance', 'طلب راتب مقدم', 'Salary advance'),
  ('iban_change', 'تغيير الآيبان', 'IBAN change'), ('profile_edit', 'تعديل بيانات', 'Profile edit'),
  ('document', 'رفع مستند', 'Document upload'), ('overtime', 'عمل إضافي', 'Overtime'), ('forgot_punch', 'نسيان بصمة', 'Forgot punch')
ON CONFLICT (code) DO NOTHING;
INSERT INTO leave_types(code, name_ar, name_en, is_financial) VALUES ('unpaid', 'إجازة بدون راتب', 'Unpaid leave', true)
ON CONFLICT (code) DO NOTHING;
INSERT INTO document_types(code, name_ar, name_en) VALUES
  ('cv', 'السيرة الذاتية', 'CV'), ('id', 'الهوية / الإقامة', 'ID / Iqama'), ('passport', 'جواز السفر', 'Passport'),
  ('certificate', 'شهادة التخرج', 'Certificate'), ('experience', 'شهادة الخبرة', 'Experience certificate'),
  ('national_address', 'العنوان الوطني', 'National address'), ('insurance', 'شهادة التأمينات الاجتماعية', 'GOSI certificate'),
  ('photo', 'صورة شخصية', 'Photo'), ('other', 'مستند آخر', 'Other'), ('iban_letter', 'خطاب تغيير الآيبان', 'IBAN change letter'),
  ('iban_certificate', 'شهادة الآيبان', 'IBAN certificate'), ('signed_document', 'مستند موقّع', 'Signed document'),
  ('employee_upload', 'مستند مرفوع من الموظف', 'Uploaded by the employee')
ON CONFLICT (code) DO NOTHING;
INSERT INTO document_types(code, name_ar, name_en) VALUES
  -- the attachment kinds of their employee file (EmpDocsBox EMP_DOC_TYPES)
  ('identity', 'الهوية / الإقامة', 'ID / Iqama'), ('degree', 'شهادة التخرج', 'Degree certificate'),
  ('social_insurance', 'شهادة التأمينات', 'Social insurance certificate'), ('contract', 'عقد العمل', 'Employment contract'),
  ('profile_edit', 'مرفق تعديل بيانات', 'Profile edit attachment'), ('graduation', 'شهادة التخرج', 'Graduation certificate')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Workflow (sql/10: return to manager, escalation, submitted on behalf) and e-mail per notification (sql/15)
-- ---------------------------------------------------------------------
ALTER TABLE workflow_requests
  ADD COLUMN IF NOT EXISTS submitted_by_employee_id text REFERENCES employee_directory(employee_id),
  ADD COLUMN IF NOT EXISTS escalated_from text REFERENCES workflow_stages(code),
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS returned_at timestamptz,
  ADD COLUMN IF NOT EXISTS return_note text;
-- The new workflow steps are recorded as actions too (HR returns a request to the manager; escalation after the wait).
ALTER TABLE workflow_actions DROP CONSTRAINT IF EXISTS workflow_actions_action_check;
ALTER TABLE workflow_actions ADD CONSTRAINT workflow_actions_action_check
  CHECK (action IN ('submitted', 'approved', 'rejected', 'returned', 'escalated'));
CREATE INDEX IF NOT EXISTS workflow_requests_pending_idx ON workflow_requests(current_stage, updated_at)
  WHERE current_stage NOT IN ('completed', 'rejected');

-- The scheduler e-mails / pushes the rows whose emailed_at / pushed_at is empty. The existing notifications get the time of
-- the migration (DEFAULT now() fills them when the column is added), so nothing old is sent; new rows start empty.
ALTER TABLE workflow_notifications
  ADD COLUMN IF NOT EXISTS emailed_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS email_error text,
  ADD COLUMN IF NOT EXISTS email_tries integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pushed_at timestamptz DEFAULT now();
ALTER TABLE workflow_notifications ALTER COLUMN emailed_at DROP DEFAULT, ALTER COLUMN pushed_at DROP DEFAULT;
CREATE INDEX IF NOT EXISTS workflow_notifications_unsent_idx ON workflow_notifications(created_at)
  WHERE emailed_at IS NULL;
CREATE INDEX IF NOT EXISTS workflow_notifications_unpushed_idx ON workflow_notifications(created_at)
  WHERE pushed_at IS NULL;

-- Delegation of the direct manager by the employee (sql/16) and the manager permissions HR grants (sql/10)
CREATE TABLE IF NOT EXISTS ariba_delegations (
  employee_id text PRIMARY KEY REFERENCES employee_directory(employee_id) ON DELETE CASCADE,
  manager_id  text NOT NULL REFERENCES employee_directory(employee_id),
  active      boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ariba_manager_perms (
  manager_id text PRIMARY KEY REFERENCES employee_directory(employee_id) ON DELETE CASCADE,
  perms      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 3. Candidates, their files and single-use invites (sql/11, sql/20)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ariba_candidates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_token    text NOT NULL UNIQUE,
  data         jsonb NOT NULL,
  status       text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'accepted', 'rejected')),
  source       text NOT NULL DEFAULT 'public' CHECK (source IN ('public', 'invite')),
  email        text GENERATED ALWAYS AS (lower(btrim(data->>'email'))) STORED,
  ip           text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at  timestamptz,
  reviewed_by  text,
  review_note  text,
  employee_id  text REFERENCES employee_directory(employee_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ariba_candidates_status_idx ON ariba_candidates(status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS ariba_candidates_email_idx ON ariba_candidates(email, submitted_at DESC);
CREATE TABLE IF NOT EXISTS ariba_candidate_files (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES ariba_candidates(id) ON DELETE CASCADE,
  file_type    text NOT NULL REFERENCES document_types(code),
  file_name    text NOT NULL,
  mime_type    text NOT NULL,
  file_data    bytea NOT NULL,
  file_size    integer GENERATED ALWAYS AS (octet_length(file_data)) STORED,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ariba_candidate_files_candidate_idx ON ariba_candidate_files(candidate_id);
CREATE TABLE IF NOT EXISTS ariba_candidate_invites (
  token        text PRIMARY KEY,
  label        text,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  opened_at    timestamptz,
  used_at      timestamptz,
  revoked_at   timestamptz,
  candidate_id uuid REFERENCES ariba_candidates(id) ON DELETE SET NULL
);

-- ---------------------------------------------------------------------
-- 4. Targets and evaluations (sql/12, sql/16)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ariba_targets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  text NOT NULL REFERENCES employee_directory(employee_id) ON DELETE CASCADE,
  period_type  text NOT NULL CHECK (period_type IN ('annual', 'quarterly', 'monthly')),
  period_key   text NOT NULL CHECK (period_key ~ '^\d{4}(-Q[1-4]|-(0[1-9]|1[0-2]))?$'),
  title        text NOT NULL CHECK (btrim(title) <> ''),
  description  text,
  unit         text,
  target_value numeric(14,2),
  actual_value numeric(14,2),
  weight       numeric(6,2) NOT NULL DEFAULT 1 CHECK (weight > 0),
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done')),
  created_by   text REFERENCES employee_directory(employee_id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ariba_targets_employee_idx ON ariba_targets(employee_id, period_key);
CREATE TABLE IF NOT EXISTS ariba_evaluations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  text NOT NULL REFERENCES employee_directory(employee_id) ON DELETE CASCADE,
  period_type  text NOT NULL CHECK (period_type IN ('annual', 'quarterly', 'monthly')),
  period_key   text NOT NULL,
  items        jsonb NOT NULL DEFAULT '[]'::jsonb,
  comments     text,
  overall      numeric(5,1),
  rating       text,
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved')),
  evaluator_id text REFERENCES employee_directory(employee_id) ON DELETE SET NULL,
  submitted_at timestamptz,
  approved_by  text,
  approved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, period_type, period_key)
);

-- ---------------------------------------------------------------------
-- 5. Document signing (sql/13) and leave attachments on the server (sql/14)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ariba_doc_signing (
  request_id     uuid PRIMARY KEY REFERENCES workflow_requests(id) ON DELETE CASCADE,
  document_id    uuid REFERENCES ariba_documents(id) ON DELETE CASCADE,
  employee_id    text NOT NULL REFERENCES employee_directory(employee_id),
  manager_id     text REFERENCES employee_directory(employee_id),
  template_type  text,
  stage          text NOT NULL CHECK (stage IN ('manager', 'hr', 'rejected')),
  needs_manager  boolean NOT NULL DEFAULT false,
  emp_signed_at  timestamptz NOT NULL DEFAULT now(),
  mgr_signed_at  timestamptz,
  reject_reason  text,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ariba_doc_signing_manager_idx ON ariba_doc_signing(manager_id) WHERE stage = 'manager';
CREATE TABLE IF NOT EXISTS ariba_leave_files (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_id    text NOT NULL,
  employee_id text NOT NULL REFERENCES employee_directory(employee_id) ON DELETE CASCADE,
  file_name   text NOT NULL,
  mime_type   text NOT NULL,
  file_data   bytea NOT NULL CHECK (octet_length(file_data) <= 13631488),
  file_size   integer GENERATED ALWAYS AS (octet_length(file_data)) STORED,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ariba_leave_files_leave_idx ON ariba_leave_files(leave_id);

-- ---------------------------------------------------------------------
-- 6. Mail: sending accounts (password encrypted by the backend, AES-GCM — decision 5) and a send log
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ariba_mail_accounts (
  owner        text PRIMARY KEY,                     -- 'company' or an employee_id
  provider     text NOT NULL DEFAULT 'smtp' CHECK (provider IN ('smtp', 'graph', 'resend')),
  host         text,
  port         integer CHECK (port BETWEEN 1 AND 65535),
  secure       boolean NOT NULL DEFAULT true,
  username     text,
  password_enc bytea,
  from_name    text,
  from_email   text NOT NULL,
  updated_by   text,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ariba_mail_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind        text NOT NULL,                         -- notification | document | report | message | test | password
  recipients  text[] NOT NULL,
  subject     text,
  status      text NOT NULL CHECK (status IN ('sent', 'failed')),
  error       text,
  sent_by     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 7. Team tasks and meetings (the missing ariba_my_tasks / ariba_send_task / ariba_task_update): one row per recipient
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ariba_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id      uuid NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('task', 'meeting')),
  title         text NOT NULL CHECK (btrim(title) <> ''),
  details       text,
  due_date      date,
  start_at      timestamptz,
  end_at        timestamptz,
  location      text,
  created_by    text NOT NULL REFERENCES employee_directory(employee_id),
  assignee_id   text NOT NULL REFERENCES employee_directory(employee_id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'accepted', 'declined', 'cancelled')),
  response_note text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (kind = 'task' OR start_at IS NOT NULL),
  CHECK (end_at IS NULL OR start_at IS NULL OR end_at >= start_at)
);
CREATE INDEX IF NOT EXISTS ariba_tasks_assignee_idx ON ariba_tasks(assignee_id, status);
CREATE INDEX IF NOT EXISTS ariba_tasks_creator_idx ON ariba_tasks(created_by, created_at DESC);

-- ---------------------------------------------------------------------
-- 8. Sign-in with fingerprint / Face ID on the site (WebAuthn) and push tokens for the app
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ariba_webauthn_credentials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid NOT NULL REFERENCES ariba_auth_accounts(id) ON DELETE CASCADE,
  credential_id text NOT NULL UNIQUE,
  public_key    bytea NOT NULL,
  sign_count    bigint NOT NULL DEFAULT 0,
  device_label  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz
);
CREATE TABLE IF NOT EXISTS ariba_push_tokens (
  token        text PRIMARY KEY,
  account_id   uuid NOT NULL REFERENCES ariba_auth_accounts(id) ON DELETE CASCADE,
  platform     text NOT NULL DEFAULT 'expo',
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 9. Settings the ported screens keep on the server (ariba_app_settings is key/value; one row per key)
-- ---------------------------------------------------------------------
-- The export kept no key on these two tables; the index is added only when the keys are already unique (no row is
-- removed — verify_001.sql reports duplicates if there are any).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ariba_app_settings GROUP BY key HAVING count(*) > 1) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS ariba_app_settings_key_uidx ON ariba_app_settings(key);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ariba_security_flags GROUP BY key HAVING count(*) > 1) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS ariba_security_flags_key_uidx ON ariba_security_flags(key);
  END IF;
END $$;

INSERT INTO ariba_app_settings(key, value, updated_by)
SELECT v.key, v.value::jsonb, 'migration_001' FROM (VALUES
  ('workflow_config', '{"manager_wait_days":3,"ceo_wait_days":3,"advance_max_percent":100,"extra_hr_emails":[],"final_by_type":{"unpaid":"hr","salary_advance":"hr","iban_change":"hr","profile_edit":"hr","document":"hr"}}'),
  ('doc_sign_cfg', '{"manager_types":[]}')) AS v(key, value)
WHERE NOT EXISTS (SELECT 1 FROM ariba_app_settings s WHERE s.key = v.key);
INSERT INTO ariba_security_flags(key, value, updated_by)
SELECT v.key, v.value, 'migration_001' FROM (VALUES ('apply_invite_only', 'false'), ('apply_invite_hours', '72')) AS v(key, value)
WHERE NOT EXISTS (SELECT 1 FROM ariba_security_flags f WHERE f.key = v.key);

-- ---------------------------------------------------------------------
-- 10. Payroll flow (their ariba_payroll_prepare / _reopen): HR prepares → finance approves → finance reopens with a reason
-- ---------------------------------------------------------------------
ALTER TABLE payroll_periods
  ADD COLUMN IF NOT EXISTS prepared_at   timestamptz,
  ADD COLUMN IF NOT EXISTS prepared_by   text,
  ADD COLUMN IF NOT EXISTS prepare_note  text,
  ADD COLUMN IF NOT EXISTS approved_by   text,
  ADD COLUMN IF NOT EXISTS reopened_at   timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_by   text,
  ADD COLUMN IF NOT EXISTS reopen_reason text;

COMMIT;
