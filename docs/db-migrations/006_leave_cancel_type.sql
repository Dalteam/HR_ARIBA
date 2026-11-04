-- =====================================================================
-- 006_leave_cancel_type.sql — the request type behind «طلب إلغاء إجازة» (Stage 14).
--
-- An employee who wants an approved leave cancelled sends a `leave_cancel` request (the design's
-- `ariba_leave_cancel_request`, sql/26_leave_cancel.sql). It goes through the approvals like any request and,
-- once approved, cancels the leave it names and returns its days. `workflow_requests.request_type` has a
-- foreign key to `workflow_request_types`, so the type has to exist first.
--
-- One row is added; nothing is changed or dropped. ON CONFLICT DO NOTHING, so a second run changes nothing.
-- Without it the API still starts; only «طلب إلغاء» answers 503 migration_required.
-- Run with docs/db-migrations/run_on_railway.sh (backup first, then this file).
-- =====================================================================
BEGIN;

INSERT INTO public.workflow_request_types (code, name_ar, name_en)
VALUES ('leave_cancel', 'طلب إلغاء إجازة', 'Leave cancellation request')
ON CONFLICT (code) DO NOTHING;

COMMIT;
