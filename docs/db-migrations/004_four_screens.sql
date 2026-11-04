-- =====================================================================
-- 004_four_screens.sql — what the four screens the design had and this API did not need from the schema
-- (Stage 9: audit log, recycle bin, candidates, business cards).
--
-- The audit log and the recycle bin need nothing: `ariba_audit_log` (473 rows) and `ariba_deleted_items`
-- (62 snapshots) are already here and this API already writes them. The candidates tables exist from
-- `001_react_port.sql` but carry three pieces of drift, and business cards had no table at all:
--
--   ariba_bizcards        NEW. One row per employee whose card differs from the company design; the
--                         company design itself lives in `ariba_app_settings` (`bizcard_design`,
--                         `bizcard_cfg`), which the routes upsert on the first save. Same columns as the
--                         design's `sql/35_bizcards_per_employee.sql` so a later client drop lines up.
--   ariba_candidate_files `file_type` → `doc_type`, the design's name, so the ported functions read
--                         exactly like their reference bodies. Both tables are empty, so nothing is lost;
--                         the API also reads either name at runtime, so an unmigrated database still works.
--   ariba_candidates      `ref_token` gets the design's default (24 hex characters). The submit route
--                         generates it too, so this is belt and braces rather than a requirement.
--   ariba_security_flags  the three apply keys. The first two already exist here as 'true'/'false'
--                         (`ariba_flag` reads a text), the third is created once with a random key.
--
-- Nothing is dropped, no row of an existing table is changed, and every statement is IF NOT EXISTS or
-- guarded, so a second run changes nothing. No RLS: the API checks the session and the role.
-- Run with docs/db-migrations/run_on_railway.sh (backup first, then this file).
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.ariba_bizcards (
  employee_id  text PRIMARY KEY REFERENCES public.employee_directory (employee_id) ON UPDATE CASCADE ON DELETE CASCADE,
  design       jsonb NOT NULL CHECK (jsonb_typeof(design) = 'object'),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   text
);

COMMENT ON TABLE public.ariba_bizcards IS
  'بطاقات العمل: تصميم خاص بموظف يتجاوز تصميم الشركة (bizcard_design في ariba_app_settings)';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'ariba_candidate_files'
                AND column_name = 'file_type')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'ariba_candidate_files'
                        AND column_name = 'doc_type') THEN
    ALTER TABLE public.ariba_candidate_files RENAME COLUMN file_type TO doc_type;
  END IF;
END $$;

ALTER TABLE public.ariba_candidates
  ALTER COLUMN ref_token SET DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 24);

-- This copy's invites table has no default for the token either; the route generates one, and so does this.
ALTER TABLE public.ariba_candidate_invites
  ALTER COLUMN token SET DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 24);

INSERT INTO public.ariba_security_flags (key, value) VALUES
  ('apply_invite_only', '0'),
  ('apply_invite_hours', '72'),
  ('apply_form_key', substr(replace(gen_random_uuid()::text, '-', ''), 1, 18))
ON CONFLICT (key) DO NOTHING;

CREATE INDEX IF NOT EXISTS ariba_audit_log_at_idx ON public.ariba_audit_log (at DESC);
CREATE INDEX IF NOT EXISTS ariba_deleted_items_deleted_at_idx ON public.ariba_deleted_items (deleted_at DESC);
CREATE INDEX IF NOT EXISTS ariba_candidates_status_idx ON public.ariba_candidates (status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS ariba_candidates_ref_idx ON public.ariba_candidates (ref_token);
CREATE INDEX IF NOT EXISTS ariba_candidate_invites_created_idx ON public.ariba_candidate_invites (created_at DESC);

COMMIT;
