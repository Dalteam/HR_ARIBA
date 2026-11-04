-- Checks after 005_expiry_alerts.sql: both logs exist with their columns, primary keys and foreign keys, and
-- the migration inserted nothing. Prints one row per check; run_on_railway.sh stops if any row says FAIL.
WITH expected(t) AS (VALUES ('ariba_alert_log'), ('ariba_alert_daily'))
SELECT 'table ' || t AS check, CASE WHEN to_regclass('public.' || t) IS NOT NULL THEN 'ok' ELSE 'FAIL' END AS result
FROM expected
UNION ALL
SELECT 'column ariba_alert_log.' || c,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
    AND table_name = 'ariba_alert_log' AND column_name = c) THEN 'ok' ELSE 'FAIL' END
FROM (VALUES ('employee_id'), ('kind'), ('expiry'), ('recipient'), ('sent_at')) AS x(c)
UNION ALL
SELECT 'column ariba_alert_daily.' || c,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
    AND table_name = 'ariba_alert_daily' AND column_name = c) THEN 'ok' ELSE 'FAIL' END
FROM (VALUES ('employee_id'), ('kind'), ('expiry'), ('recipient'), ('day')) AS x(c)
UNION ALL
SELECT 'primary key ' || t,
  CASE WHEN EXISTS (SELECT 1 FROM pg_constraint WHERE contype = 'p' AND conrelid = ('public.' || t)::regclass)
  THEN 'ok' ELSE 'FAIL' END
FROM (VALUES ('ariba_alert_log'), ('ariba_alert_daily')) AS x(t)
UNION ALL
SELECT 'foreign key ' || t || ' -> employee_directory',
  CASE WHEN (SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND convalidated
    AND conrelid = ('public.' || t)::regclass AND confrelid = 'public.employee_directory'::regclass) = 1
  THEN 'ok' ELSE 'FAIL' END
FROM (VALUES ('ariba_alert_log'), ('ariba_alert_daily')) AS x(t)
UNION ALL
SELECT 'the migration inserted nothing',
  CASE WHEN (SELECT count(*) FROM public.ariba_alert_log) + (SELECT count(*) FROM public.ariba_alert_daily) = 0
  THEN 'ok' ELSE 'FAIL (rows present: fine after the first daily pass, not right after the migration)' END;
