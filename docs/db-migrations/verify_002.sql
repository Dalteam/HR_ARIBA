-- Checks after 002_notif_email_pool.sql: the notification-attachment table, the HR bell pool and the
-- PDF-capable template RPC are all in place, and nothing that was there before disappeared.
-- Prints one row per check; run_on_railway.sh stops if any row says FAIL.
WITH expected(t) AS (VALUES ('ariba_notif_files'))
SELECT 'table ' || t AS check, CASE WHEN to_regclass('public.' || t) IS NOT NULL THEN 'ok' ELSE 'FAIL' END AS result
FROM expected
UNION ALL
SELECT 'column ariba_notif_files.' || c,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
    AND table_name = 'ariba_notif_files' AND column_name = c) THEN 'ok' ELSE 'FAIL' END
FROM (VALUES ('id'), ('notification_id'), ('file_name'), ('mime_type'), ('file_data'), ('file_size'), ('created_at')) AS x(c)
UNION ALL
SELECT 'foreign key ariba_notif_files -> workflow_notifications',
  CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FAIL (' || count(*) || ')' END
FROM pg_constraint WHERE contype = 'f' AND conrelid = 'public.ariba_notif_files'::regclass
  AND confrelid = 'public.workflow_notifications'::regclass AND convalidated
UNION ALL
SELECT 'index ariba_notif_files_notification_idx',
  CASE WHEN to_regclass('public.ariba_notif_files_notification_idx') IS NOT NULL THEN 'ok' ELSE 'FAIL' END
UNION ALL
SELECT 'function ariba_hr_pool()',
  CASE WHEN to_regprocedure('public.ariba_hr_pool()') IS NOT NULL THEN 'ok' ELSE 'FAIL' END
UNION ALL
SELECT 'ariba_hr_pool() takes the HR approvers from workflow_approvers',
  CASE WHEN pg_get_functiondef(to_regprocedure('public.ariba_hr_pool()')) LIKE '%workflow_approvers%'
            THEN 'ok' ELSE 'FAIL' END
UNION ALL
SELECT 'the bell RPCs use ariba_hr_pool()',
  CASE WHEN count(*) = 2 THEN 'ok' ELSE 'FAIL (' || count(*) || ')' END
FROM (VALUES ('ariba_my_notifications'), ('ariba_mark_notifications_read')) AS f(n)
WHERE pg_get_functiondef(to_regprocedure('public.' || f.n || '(uuid,integer)')) LIKE '%ariba_hr_pool%'
   OR pg_get_functiondef(to_regprocedure('public.' || f.n || '(uuid,uuid[])')) LIKE '%ariba_hr_pool%'
UNION ALL
SELECT 'the bell RPCs use the normalized read_at, not the dropped is_read column',
  CASE WHEN count(*) = 2 THEN 'ok' ELSE 'FAIL (' || count(*) || ')' END
FROM (VALUES ('ariba_my_notifications(uuid,integer)'), ('ariba_mark_notifications_read(uuid,uuid[])')) AS f(sig)
WHERE strpos(pg_get_functiondef(to_regprocedure('public.' || f.sig)), 'read_at') > 0
  AND strpos(pg_get_functiondef(to_regprocedure('public.' || f.sig)), 'n.is_read') = 0
  AND strpos(pg_get_functiondef(to_regprocedure('public.' || f.sig)), 'w.is_read') = 0
UNION ALL
SELECT 'ariba_hr_pool() never comes back empty',
  CASE WHEN (SELECT count(*) FROM public.ariba_hr_pool()) > 0 THEN 'ok' ELSE 'FAIL' END
UNION ALL
SELECT 'ariba_hr_pool() includes the HR approver of the workflows',
  CASE WHEN EXISTS (SELECT 1 FROM public.workflow_approvers w WHERE w.stage = 'hr'
                      AND w.employee_id::text IN (SELECT public.ariba_hr_pool()))
       THEN 'ok' ELSE 'FAIL' END
UNION ALL
SELECT 'ariba_hr_send_template is a single 10-argument function',
  CASE WHEN count(*) = 1 AND max(pronargs) = 10 THEN 'ok'
       ELSE 'FAIL (' || count(*) || ' signatures, max ' || coalesce(max(pronargs), 0) || ' arguments)' END
FROM pg_proc WHERE proname = 'ariba_hr_send_template' AND pronamespace = 'public'::regnamespace
UNION ALL
SELECT 'ariba_hr_send_template accepts a PDF',
  CASE WHEN to_regprocedure('public.ariba_hr_send_template(uuid,text,text,text,text,text,text,text,text,text)') IS NOT NULL
            THEN 'ok' ELSE 'FAIL' END
UNION ALL
SELECT 'ariba_hr_send_template stores the PDF in ariba_notif_files',
  CASE WHEN pg_get_functiondef(to_regprocedure('public.ariba_hr_send_template(uuid,text,text,text,text,text,text,text,text,text)'))
            LIKE '%ariba_notif_files%' THEN 'ok' ELSE 'FAIL' END
UNION ALL
SELECT 'setting app_links', CASE WHEN EXISTS (SELECT 1 FROM public.ariba_app_settings WHERE key = 'app_links')
  THEN 'ok' ELSE 'FAIL' END
UNION ALL
SELECT 'setting app_links is a json object',
  CASE WHEN coalesce((SELECT jsonb_typeof(value) FROM public.ariba_app_settings WHERE key = 'app_links'), '') = 'object'
       THEN 'ok' ELSE 'FAIL' END
UNION ALL
SELECT 'notifications still carry their e-mail state',
  CASE WHEN count(*) = 4 THEN 'ok' ELSE 'FAIL (' || count(*) || ')' END
FROM (VALUES ('emailed_at'), ('email_error'), ('email_tries'), ('pushed_at')) AS c(column_name)
WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
  AND table_name = 'workflow_notifications' AND column_name = c.column_name)
UNION ALL
SELECT 'notifications without a recipient (none allowed)',
  CASE WHEN count(*) = 0 THEN 'ok' ELSE 'FAIL (' || count(*) || ')' END
FROM public.workflow_notifications WHERE coalesce(btrim(recipient_employee_id), '') = ''
UNION ALL
SELECT 'setting notify_email_since', CASE WHEN EXISTS (SELECT 1 FROM public.ariba_app_settings WHERE key = 'notify_email_since')
  THEN 'ok' ELSE 'FAIL' END
UNION ALL
SELECT 'notify_email_since carries a timestamp',
  CASE WHEN coalesce((SELECT jsonb_typeof(value -> 'at') FROM public.ariba_app_settings WHERE key = 'notify_email_since'), '') = 'string'
       AND (SELECT (value ->> 'at')::timestamptz FROM public.ariba_app_settings WHERE key = 'notify_email_since') IS NOT NULL
       THEN 'ok' ELSE 'FAIL' END
UNION ALL
SELECT 'notify_email_since records how many old notifications it silences',
  CASE WHEN coalesce((SELECT jsonb_typeof(value -> 'skipped_notifications') FROM public.ariba_app_settings WHERE key = 'notify_email_since'), '') = 'number'
       THEN 'ok' ELSE 'FAIL' END
UNION ALL
-- rows the source system had already e-mailed stay stamped; the cut-off only silences the ones it had not
SELECT 'the cut-off is newer than every notification that came with the migrated data',
  CASE WHEN (SELECT (value ->> 'at')::timestamptz FROM public.ariba_app_settings WHERE key = 'notify_email_since')
            >= coalesce((SELECT max(created_at) FROM public.workflow_notifications), '-infinity'::timestamptz)
       THEN 'ok' ELSE 'FAIL' END;
