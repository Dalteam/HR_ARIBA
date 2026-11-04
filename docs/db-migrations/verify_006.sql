-- Checks after 006_leave_cancel_type.sql: the request type exists with its names.
-- Prints one row per check; run_on_railway.sh stops if any row says FAIL.
SELECT 'request type leave_cancel' AS check,
  CASE WHEN EXISTS (SELECT 1 FROM public.workflow_request_types WHERE code = 'leave_cancel' AND name_ar <> '')
  THEN 'ok' ELSE 'FAIL' END AS result;
