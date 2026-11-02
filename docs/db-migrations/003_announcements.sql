-- =====================================================================
-- 003_announcements.sql — announcements and greetings (Stage 7 of the employee-app port), on the
-- normalized schema. The rules are docs/BUSINESS_RULES.md § Announcements and greetings (A1–A12).
--
--   ariba_announcements        one row per announcement or greeting HR sends (or an automatic greeting).
--                              Column names follow the client's 002_announcements.sql so a later client
--                              drop lines up; the one change is employer_id (a renamed employer would
--                              otherwise lose its announcements) instead of the employer's name.
--   ariba_announcement_notifs  which bell entries (workflow_notifications) a row created, so hiding the
--                              row also removes them from every bell (decision D4). A link table instead
--                              of a new column, so workflow_notifications itself is not changed.
--   ariba_emp_occasions        HR's notes of an employee's occasions (graduation, wedding, newborn, …),
--                              used only for greetings. HR-only (A10); see FOLLOW_UPS #44.
--
-- Three new tables; no existing table, column or row is changed, and no row is inserted (the settings
-- behind the new switches default to off in code). No RLS: the API checks the session and the role.
-- The two tables that hold text get the database's existing `ariba_sanitize` trigger, the one that
-- already guards workflow_notifications, employee_directory, workflow_requests and 14 other tables
-- (ariba_clean_text: < > " become look-alike characters), so an announcement is stored exactly like
-- every other piece of text in this database and the card and the bell show the same characters.
-- One transaction, every object IF NOT EXISTS, so a second run changes nothing.
-- Run with docs/db-migrations/run_on_railway.sh (backup first, then this file, then verify_003.sql).
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.ariba_announcements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL DEFAULT 'announcement' CHECK (kind IN ('announcement', 'greeting')),
  occasion      text,
  title         text NOT NULL CHECK (btrim(title) <> '' AND char_length(title) <= 200),
  body          text NOT NULL DEFAULT '' CHECK (char_length(body) <= 2000),
  audience      text NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'employer', 'employees')),
  employer_id   smallint REFERENCES public.employers (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  employee_ids  text[] NOT NULL DEFAULT '{}',
  pinned        boolean NOT NULL DEFAULT false,
  expires_on    date,
  source        text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto')),
  auto_key      text UNIQUE,
  sent_count    integer NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  hidden        boolean NOT NULL DEFAULT false,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    text,
  updated_at    timestamptz,
  CONSTRAINT ariba_announcements_audience_target CHECK (
    (audience = 'all')
    OR (audience = 'employer' AND employer_id IS NOT NULL)
    OR (audience = 'employees' AND cardinality(employee_ids) > 0))
);
CREATE INDEX IF NOT EXISTS ariba_announcements_created_idx
  ON public.ariba_announcements (created_at DESC) WHERE NOT hidden;

CREATE TABLE IF NOT EXISTS public.ariba_announcement_notifs (
  announcement_id  uuid NOT NULL REFERENCES public.ariba_announcements (id) ON DELETE CASCADE,
  notification_id  uuid NOT NULL REFERENCES public.workflow_notifications (id) ON DELETE CASCADE,
  PRIMARY KEY (announcement_id, notification_id)
);
CREATE INDEX IF NOT EXISTS ariba_announcement_notifs_notification_idx
  ON public.ariba_announcement_notifs (notification_id);

CREATE TABLE IF NOT EXISTS public.ariba_emp_occasions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id text NOT NULL REFERENCES public.employee_directory (employee_id) ON UPDATE CASCADE ON DELETE CASCADE,
  occasion    text NOT NULL,
  occ_date    date NOT NULL,
  yearly      boolean NOT NULL DEFAULT false,
  note        text CHECK (note IS NULL OR char_length(note) <= 500),
  hidden      boolean NOT NULL DEFAULT false,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ariba_emp_occasions_emp_idx ON public.ariba_emp_occasions (employee_id);

-- The text guard every other user-text table has. Skipped (and reported by verify_003.sql as FAIL) only
-- on a database that lacks ariba_sanitize_row(), which no database restored from ariba_src does.
DO $$
DECLARE t text;
BEGIN
  IF to_regprocedure('public.ariba_sanitize_row()') IS NULL THEN
    RAISE NOTICE 'ariba_sanitize_row() is missing: the text trigger was not attached';
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY['ariba_announcements', 'ariba_emp_occasions'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ariba_sanitize'
                    AND tgrelid = ('public.' || t)::regclass) THEN
      EXECUTE format('CREATE TRIGGER ariba_sanitize BEFORE INSERT OR UPDATE ON public.%I '
                     'FOR EACH ROW EXECUTE FUNCTION public.ariba_sanitize_row()', t);
    END IF;
  END LOOP;
END $$;

COMMIT;
