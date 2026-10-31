-- =====================================================================
-- 002_notif_email_pool.sql — the client's migrations 39, 40 and 41 ported onto the normalized schema.
--
--   39_notify_email_full_details  : no schema change (the e-mail itself is built by the backend, see
--                                   backend/app/services/notify_email.py); it only needs the
--                                   ariba_app_settings row 'app_links' = {"hr":"<url>","emp":"<url>"}.
--   40_hr_bell_pool               : ariba_hr_pool() = HR accounts ∪ employee 40 ∪ the HR approvers of the
--                                   workflows, and the two bell RPCs now use it. Before this the bell went
--                                   silent for HR as soon as the only role='hr' account was removed.
--   41_notif_files_template_pdf   : ariba_notif_files (the PDF a template was sent with, attached to the
--                                   notification e-mail) + ariba_hr_send_template(..., p_pdf_base64,
--                                   p_pdf_name) that stores it in the same transaction.
--
-- Where the client's SQL is re-written for our schema:
--   * the bell RPCs read/set read_at, not is_read (ariba_normalization.sql dropped is_read);
--   * ariba_hr_pool() takes the third part from workflow_approvers(stage='hr'), not from
--     workflow_requests.hr_id (dropped by the same migration);
--   * the template RPC no longer writes workflow_requests.manager_id (dropped as well) and the PDF
--     arguments extend the one function instead of overloading it, so 8-argument calls stay unambiguous.
--
-- Known limitation, older than this file and shared by every RPC that takes p_token: they resolve the
-- token through ariba_session_row(), which reads the Supabase auth schema. On plain Postgres (Railway)
-- that helper does not work, so the API — backend/app/routers/*.py — is what the app actually calls; the
-- RPCs are kept in step with the tables for parity only.
--
-- One transaction, every object IF NOT EXISTS / CREATE OR REPLACE, so a second run changes nothing.
-- Run with docs/db-migrations/run_on_railway.sh (backup first, then this file, then verify_002.sql).
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. (39) Links used inside the notification e-mails: ariba_app_settings['app_links']
--    {"hr": "https://hr.example.com", "emp": "https://emp.example.com"}. Settings → Mail writes it;
--    the backend falls back to PUBLIC_APP_URL when it is empty.
-- ---------------------------------------------------------------------
INSERT INTO public.ariba_app_settings(key, value, updated_at)
SELECT 'app_links', '{}'::jsonb, now()
WHERE NOT EXISTS (SELECT 1 FROM public.ariba_app_settings WHERE key = 'app_links');

-- ---------------------------------------------------------------------
-- 2. (41) Attachments that belong to one notification (a PDF next to the e-mail).
--    Same shape as ariba_leave_files: uuid key, bytea payload, size check, ON DELETE CASCADE.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ariba_notif_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    notification_id uuid NOT NULL,
    file_name text NOT NULL,
    mime_type text NOT NULL DEFAULT 'application/pdf'::text,
    file_data bytea NOT NULL,
    file_size integer GENERATED ALWAYS AS (octet_length(file_data)) STORED,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ariba_notif_files_pkey PRIMARY KEY (id),
    CONSTRAINT ariba_notif_files_notification_id_fkey FOREIGN KEY (notification_id)
        REFERENCES public.workflow_notifications(id) ON DELETE CASCADE,
    CONSTRAINT ariba_notif_files_file_data_check CHECK ((octet_length(file_data) <= 13631488))
);
CREATE INDEX IF NOT EXISTS ariba_notif_files_notification_idx
    ON public.ariba_notif_files USING btree (notification_id);

-- ---------------------------------------------------------------------
-- 3. (40) The HR bell pool.
--    HR accounts ∪ employee 40 (the HR employee whose account was deleted) ∪ the HR approver(s) of the
--    workflow — so the bell keeps working even when no account carries role='hr'.
--    NOTE: the client reads the third part from workflow_requests.hr_id; the normalized schema has no
--    such column, the approver of every HR stage lives in workflow_approvers (stage='hr').
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ariba_hr_pool() RETURNS SETOF text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT a.employee_id::text
    FROM public.ariba_auth_accounts a
   WHERE a.role = 'hr' AND a.active = true AND a.employee_id IS NOT NULL
  UNION
  SELECT '40'::text
   WHERE EXISTS (SELECT 1 FROM public.employee_directory d WHERE d.employee_id = '40' AND d.active = true)
  UNION
  SELECT DISTINCT w.employee_id::text
    FROM public.workflow_approvers w
   WHERE w.stage = 'hr' AND w.employee_id IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.ariba_my_notifications(p_token uuid, p_limit integer DEFAULT 40) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare s record; items jsonb; unread int; lim int := greatest(1, least(coalesce(p_limit,40), 100));
begin
  select * into s from public.ariba_session_row(p_token) limit 1;
  if s.account_id is null then raise exception 'INVALID_SESSION'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into items from (
    select n.id, n.request_id, n.title, n.body, n.stage, n.kind,
           (n.read_at is null) as is_read, n.created_at,
           coalesce(r.request_type,'') as request_type
    from public.workflow_notifications n
    left join public.workflow_requests r on r.id=n.request_id
    where n.recipient_employee_id = s.employee_id
       or (s.role in ('hr','admin') and n.recipient_employee_id in (select public.ariba_hr_pool()))
    order by n.created_at desc limit lim) x;
  select count(*) into unread from public.workflow_notifications n
    where n.read_at is null and (n.recipient_employee_id = s.employee_id
       or (s.role in ('hr','admin') and n.recipient_employee_id in (select public.ariba_hr_pool())));
  return jsonb_build_object('ok',true,'unread',unread,'items',items);
end; $$;

CREATE OR REPLACE FUNCTION public.ariba_mark_notifications_read(p_token uuid, p_ids uuid[] DEFAULT NULL::uuid[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare s record; n int;
begin
  select * into s from public.ariba_session_row(p_token) limit 1;
  if s.account_id is null then raise exception 'INVALID_SESSION'; end if;
  update public.workflow_notifications w set read_at=now()
   where w.read_at is null
     and (w.recipient_employee_id = s.employee_id
       or (s.role in ('hr','admin') and w.recipient_employee_id in (select public.ariba_hr_pool())))
     and (p_ids is null or cardinality(p_ids)=0 or w.id = any(p_ids));
  get diagnostics n = row_count;
  return jsonb_build_object('ok',true,'updated',n);
end; $$;

-- ---------------------------------------------------------------------
-- 4. (41) ariba_hr_send_template with the optional PDF.
--    The client adds p_pdf_base64/p_pdf_name to the same function instead of overloading it: an overload
--    would make an 8-argument call ambiguous. So the 8-argument signature is dropped and the 10-argument
--    one takes over — every existing 8-argument call still resolves, because the two new arguments have
--    defaults. The body is the client's, adjusted to the normalized schema (workflow_requests has no
--    manager_id/ceo_id any more, workflow_notifications has read_at instead of is_read).
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.ariba_hr_send_template(uuid,text,text,text,text,text,text,text);

CREATE OR REPLACE FUNCTION public.ariba_hr_send_template(
        p_token uuid, p_employee_id text, p_template_type text, p_title text,
        p_file_name text, p_mime_type text, p_base64 text, p_emp_no text DEFAULT NULL::text,
        p_pdf_base64 text DEFAULT NULL::text, p_pdf_name text DEFAULT NULL::text)
    RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare s record; e record; r_id uuid; doc jsonb; lookup text; nid uuid; pdf text;
begin
  select * into s from public.ariba_session_row(p_token) limit 1;
  if s.account_id is null then raise exception 'انتهت جلسة الدخول'; end if;
  if not public.ariba_can(s.role,'forms','edit') then raise exception 'NOT_AUTHORIZED'; end if;

  lookup := coalesce(nullif(trim(p_emp_no),''), p_employee_id);
  select * into e from public.employee_directory
  where active=true and (employee_id=p_employee_id or employee_id=lookup or coalesce(data->>'empNo','')=lookup)
  limit 1;
  if e.employee_id is null then raise exception 'الموظف غير موجود'; end if;
  if p_template_type is null or trim(p_template_type)='' then raise exception 'TEMPLATE_TYPE_REQUIRED'; end if;

  insert into public.workflow_requests(employee_id,request_type,payload,current_stage,status)
  values(e.employee_id,'template:'||p_template_type,
    jsonb_build_object('title',coalesce(p_title,p_template_type),'template_type',p_template_type,'sent_by',s.employee_id,'sent_at',now()),
    'employee','pending')
  returning id into r_id;

  select public.ariba_save_document(p_token,e.employee_id,coalesce(p_title,p_template_type),p_file_name,p_mime_type,p_base64,r_id) into doc;

  pdf := regexp_replace(coalesce(p_pdf_base64,''),'^data:[^;]+;base64,','');
  insert into public.workflow_notifications(recipient_employee_id,request_id,title,body,stage,kind)
  values(e.employee_id,r_id,'مستند بانتظار توقيعك: '||coalesce(p_title,p_template_type),
    'برجاء مراجعة المستند والموافقة عليه أو الاعتراض مع بيان السبب.','employee','template')
  returning id into nid;

  -- the attachment belongs to the employee's bell entry; it is what the notification e-mail sends along
  if pdf <> '' and length(pdf) < 16000000 then
    insert into public.ariba_notif_files(notification_id,file_name,mime_type,file_data)
    values(nid, coalesce(nullif(trim(p_pdf_name),''), coalesce(p_title,p_template_type)||'.pdf'),
           'application/pdf', decode(pdf,'base64'));
  end if;

  return jsonb_build_object('ok',true,'request_id',r_id,'document',doc,'resolved_employee_id',e.employee_id,
                            'notification_id',nid);
end; $$;

-- ---------------------------------------------------------------------
-- 5. Safety cut-off for the notification e-mails.
--    Turning the sender on must never mail the notifications that came with the restored data: the
--    table already holds every bell entry from the client's Supabase database, all of them with
--    emailed_at IS NULL, so the first poll would blast months of history at real addresses.
--    The sender therefore only mails rows created at or after this stamp (notify_email.cutoff());
--    the stamp is written once, the first time this file runs, and the count of rows it silences is
--    kept next to it so the number is auditable later.
--    NOTIFY_EMAIL_SINCE overrides it (an explicit ISO timestamp) for an operator who wants a different
--    line. Deleting the row makes the sender refuse to send anything at all (it fails closed).
-- ---------------------------------------------------------------------
DO $$
DECLARE cut timestamp with time zone := now(); skipped integer;
BEGIN
    IF EXISTS (SELECT 1 FROM public.ariba_app_settings WHERE key = 'notify_email_since') THEN
        RETURN;                                        -- already stamped: a second run changes nothing
    END IF;
    SELECT count(*) INTO skipped
      FROM public.workflow_notifications
     WHERE emailed_at IS NULL AND created_at < cut;
    INSERT INTO public.ariba_app_settings(key, value, updated_at)
    VALUES ('notify_email_since',
            jsonb_build_object(
                'at', to_char(cut AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                'skipped_notifications', skipped,
                'note', 'Notifications older than this are never e-mailed; written by 002_notif_email_pool.sql'),
            now());
    RAISE NOTICE 'notify_email_since=%, % older notification(s) will never be mailed', cut, skipped;
END $$;

COMMIT;
