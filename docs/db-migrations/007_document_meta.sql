-- =====================================================================
-- 007_document_meta.sql — certificate details on a document (Stage 17).
--
-- The design's `sql/37_certificates_meta.sql`: a certificate uploaded to an employee's file carries its title, the
-- body that issued it, and its issue and expiry dates. Four nullable columns on `ariba_documents`, and the two
-- certificate types the design offers that our lookup lacks (`professional`, `course`; `degree`, `experience` and
-- `other` are already there). The certificates report reads these columns, never the file.
--
-- Columns are added empty and nothing existing changes; every statement is IF NOT EXISTS / ON CONFLICT DO NOTHING,
-- so a second run changes nothing. Without it the API still starts; only the certificate details answer 503.
-- Run with docs/db-migrations/run_on_railway.sh (backup first, then this file).
-- =====================================================================
BEGIN;

ALTER TABLE public.ariba_documents ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.ariba_documents ADD COLUMN IF NOT EXISTS issuer text;
ALTER TABLE public.ariba_documents ADD COLUMN IF NOT EXISTS issue_date date;
ALTER TABLE public.ariba_documents ADD COLUMN IF NOT EXISTS expiry_date date;
CREATE INDEX IF NOT EXISTS ariba_documents_type_idx ON public.ariba_documents (document_type);

INSERT INTO public.document_types (code, name_ar, name_en) VALUES
  ('professional', 'شهادة احترافية', 'Professional certificate'),
  ('course', 'شهادة دورة / تدريب', 'Course / training certificate')
ON CONFLICT (code) DO NOTHING;

COMMIT;
