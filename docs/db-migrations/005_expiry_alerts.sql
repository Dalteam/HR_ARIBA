-- =====================================================================
-- 005_expiry_alerts.sql — the two small logs behind the expiry alerts (Stage 13).
--
-- The design's `sql/32_expiry_alerts_notify.sql` and `sql/36_alerts_daily_bell.sql` create both; the
-- normalized copy never had them. The daily pass (`services/expiry_alerts.py`) rings a bell once a day per
-- (employee, kind, expiry date, recipient) until the date is renewed, and records the first alert so an
-- e-mail would go out only once when e-mail is switched on:
--
--   ariba_alert_log    NEW. The first alert per (employee, kind, expiry, recipient).
--   ariba_alert_daily  NEW. One row per day a bell was rung; rows older than 90 days are cleared by the pass.
--
-- A renewed document has a new expiry date, so it starts fresh. Nothing existing is changed or dropped,
-- every statement is IF NOT EXISTS, so a second run changes nothing. No RLS: the API checks the session.
-- The routes answer 503 migration_required on a database without these tables, and the API still starts.
-- Run with docs/db-migrations/run_on_railway.sh (backup first, then this file).
-- =====================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.ariba_alert_log (
  employee_id  text NOT NULL REFERENCES public.employee_directory (employee_id) ON UPDATE CASCADE ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('probation', 'contract', 'iqama', 'passport', 'insurance', 'natAddr', 'gosiCert')),
  expiry       date NOT NULL,
  recipient    text NOT NULL,
  sent_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, kind, expiry, recipient)
);

CREATE TABLE IF NOT EXISTS public.ariba_alert_daily (
  employee_id  text NOT NULL REFERENCES public.employee_directory (employee_id) ON UPDATE CASCADE ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('probation', 'contract', 'iqama', 'passport', 'insurance', 'natAddr', 'gosiCert')),
  expiry       date NOT NULL,
  recipient    text NOT NULL,
  day          date NOT NULL,
  PRIMARY KEY (employee_id, kind, expiry, recipient, day)
);

CREATE INDEX IF NOT EXISTS ariba_alert_log_sent_idx ON public.ariba_alert_log (sent_at DESC);
CREATE INDEX IF NOT EXISTS ariba_alert_daily_day_idx ON public.ariba_alert_daily (day);

COMMIT;
