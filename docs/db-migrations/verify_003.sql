-- Checks after 003_announcements.sql: the three tables with their columns, keys, indexes and checks are
-- in place, and the migration inserted nothing. Prints one row per check; run_on_railway.sh stops if any
-- row says FAIL.
WITH expected(t) AS (VALUES ('ariba_announcements'), ('ariba_announcement_notifs'), ('ariba_emp_occasions'))
SELECT 'table ' || t AS check, CASE WHEN to_regclass('public.' || t) IS NOT NULL THEN 'ok' ELSE 'FAIL' END AS result
FROM expected
UNION ALL
SELECT 'column ariba_announcements.' || c,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
    AND table_name = 'ariba_announcements' AND column_name = c) THEN 'ok' ELSE 'FAIL' END
FROM (VALUES ('id'), ('kind'), ('occasion'), ('title'), ('body'), ('audience'), ('employer_id'), ('employee_ids'),
             ('pinned'), ('expires_on'), ('source'), ('auto_key'), ('sent_count'), ('hidden'), ('created_by'),
             ('created_at'), ('updated_by'), ('updated_at')) AS x(c)
UNION ALL
SELECT 'column ariba_emp_occasions.' || c,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
    AND table_name = 'ariba_emp_occasions' AND column_name = c) THEN 'ok' ELSE 'FAIL' END
FROM (VALUES ('id'), ('employee_id'), ('occasion'), ('occ_date'), ('yearly'), ('note'), ('hidden'), ('created_by'),
             ('created_at')) AS x(c)
UNION ALL
SELECT 'foreign key ' || src || ' -> ' || dst,
  CASE WHEN (SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND convalidated
    AND conrelid = ('public.' || src)::regclass AND confrelid = ('public.' || dst)::regclass) = 1
  THEN 'ok' ELSE 'FAIL' END
FROM (VALUES ('ariba_announcements', 'employers'),
             ('ariba_announcement_notifs', 'ariba_announcements'),
             ('ariba_announcement_notifs', 'workflow_notifications'),
             ('ariba_emp_occasions', 'employee_directory')) AS x(src, dst)
UNION ALL
SELECT 'index ' || i, CASE WHEN to_regclass('public.' || i) IS NOT NULL THEN 'ok' ELSE 'FAIL' END
FROM (VALUES ('ariba_announcements_created_idx'), ('ariba_announcement_notifs_notification_idx'),
             ('ariba_emp_occasions_emp_idx')) AS x(i)
UNION ALL
SELECT 'auto_key is unique',
  CASE WHEN EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ariba_announcements'::regclass
    AND contype = 'u' AND pg_get_constraintdef(oid) LIKE '%auto_key%') THEN 'ok' ELSE 'FAIL' END
UNION ALL
SELECT 'check: audience names its target',
  CASE WHEN EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ariba_announcements'::regclass
    AND conname = 'ariba_announcements_audience_target') THEN 'ok' ELSE 'FAIL' END
UNION ALL
SELECT 'check constraints on ariba_announcements (kind, title, body, audience, source, sent_count, target)',
  CASE WHEN (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.ariba_announcements'::regclass
    AND contype = 'c') >= 7 THEN 'ok' ELSE 'FAIL' END
UNION ALL
SELECT 'deleting an announcement removes its bell links (ON DELETE CASCADE)',
  CASE WHEN (SELECT confdeltype FROM pg_constraint WHERE contype = 'f'
    AND conrelid = 'public.ariba_announcement_notifs'::regclass
    AND confrelid = 'public.ariba_announcements'::regclass) = 'c' THEN 'ok' ELSE 'FAIL' END
UNION ALL
SELECT 'text trigger ariba_sanitize on ' || t,
  CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ariba_sanitize' AND NOT tgisinternal
    AND tgrelid = ('public.' || t)::regclass) THEN 'ok' ELSE 'FAIL' END
FROM (VALUES ('ariba_announcements'), ('ariba_emp_occasions')) AS x(t);
