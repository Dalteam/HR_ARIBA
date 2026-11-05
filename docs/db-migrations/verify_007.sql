-- Checks after 007_document_meta.sql: the four columns and the two certificate types exist.
-- Prints one row per check; run_on_railway.sh stops if any row says FAIL.
SELECT 'column ariba_documents.' || c AS check,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
    AND table_name = 'ariba_documents' AND column_name = c) THEN 'ok' ELSE 'FAIL' END AS result
FROM (VALUES ('title'), ('issuer'), ('issue_date'), ('expiry_date')) AS x(c)
UNION ALL
SELECT 'document type ' || t,
  CASE WHEN EXISTS (SELECT 1 FROM public.document_types WHERE code = t) THEN 'ok' ELSE 'FAIL' END
FROM (VALUES ('professional'), ('course')) AS x(t);
