-- Schema only (no data) of the canonical public tables, from the colleague's Supabase export.
-- Used by tools/legacy-parity to run the legacy SQL functions on an empty local Postgres.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.ariba_app_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by text
);

CREATE TABLE public.ariba_asset_custody_log (
    id bigint NOT NULL,
    asset_id uuid NOT NULL,
    employee_id text,
    action text NOT NULL,
    at_date date DEFAULT CURRENT_DATE NOT NULL,
    notes text,
    by_employee text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT ariba_asset_custody_log_action_check CHECK ((action = ANY (ARRAY['assign'::text, 'return'::text])))
);

CREATE TABLE public.ariba_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_no text,
    name text NOT NULL,
    category text NOT NULL,
    serial_no text,
    model text,
    location text,
    condition text,
    notes text,
    capitalized boolean DEFAULT true NOT NULL,
    acquisition_date date NOT NULL,
    cost numeric(14,2) NOT NULL,
    salvage_value numeric(14,2) DEFAULT 0 NOT NULL,
    useful_life_months integer NOT NULL,
    depreciation_method text DEFAULT 'straight_line'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    disposal_date date,
    disposal_value numeric(14,2) DEFAULT 0,
    custodian_employee_id text,
    custody_date date,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    updated_by text,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT ariba_assets_category_check CHECK ((category = ANY (ARRAY['computers'::text, 'electronics'::text, 'vehicles'::text, 'furniture'::text, 'equipment'::text, 'software'::text, 'other'::text]))),
    CONSTRAINT ariba_assets_check CHECK ((salvage_value <= cost)),
    CONSTRAINT ariba_assets_check1 CHECK (((disposal_date IS NULL) OR (disposal_date >= acquisition_date))),
    CONSTRAINT ariba_assets_cost_check CHECK ((cost >= (0)::numeric)),
    CONSTRAINT ariba_assets_depreciation_method_check CHECK ((depreciation_method = 'straight_line'::text)),
    CONSTRAINT ariba_assets_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0)),
    CONSTRAINT ariba_assets_salvage_value_check CHECK ((salvage_value >= (0)::numeric)),
    CONSTRAINT ariba_assets_status_check CHECK ((status = ANY (ARRAY['active'::text, 'disposed'::text, 'sold'::text, 'lost'::text]))),
    CONSTRAINT ariba_assets_useful_life_months_check CHECK (((useful_life_months >= 1) AND (useful_life_months <= 1200)))
);

CREATE TABLE public.ariba_audit_log (
    id bigint NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    actor_employee_id text,
    actor_username text,
    actor_name text,
    actor_role text,
    module text NOT NULL,
    action text NOT NULL,
    entity_type text,
    entity_id text,
    entity_name text,
    summary text,
    details jsonb
);

CREATE TABLE public.ariba_audit_purge_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    month text NOT NULL,
    requested_by uuid NOT NULL,
    requester_name text,
    requester_role text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_by uuid,
    decided_name text,
    decided_at timestamp with time zone,
    deleted_count integer,
    CONSTRAINT ariba_audit_purge_requests_month_check CHECK ((month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'::text)),
    CONSTRAINT ariba_audit_purge_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'executed'::text])))
);

CREATE TABLE public.ariba_auth_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL,
    employee_id text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    must_change boolean DEFAULT false NOT NULL,
    auth_user_id uuid,
    CONSTRAINT ariba_auth_accounts_role_check CHECK ((role = ANY (ARRAY['employee'::text, 'manager'::text, 'hr'::text, 'ceo'::text, 'admin'::text, 'finance'::text, 'admin_manager'::text, 'chairman'::text])))
);

CREATE TABLE public.ariba_backup_v106_duplicates (
    employee_id text NOT NULL,
    removed jsonb,
    backed_up_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.ariba_backup_v116_cleanup (
    id bigint NOT NULL,
    kind text,
    ref text,
    before jsonb,
    at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.ariba_bootstrap_recovery (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ariba_deleted_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text NOT NULL,
    ref_id text,
    employee_id text,
    snapshot jsonb NOT NULL,
    deleted_by text,
    deleted_by_role text,
    deleted_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ariba_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id text NOT NULL,
    request_id uuid,
    document_type text NOT NULL,
    file_name text NOT NULL,
    mime_type text DEFAULT 'application/octet-stream'::text NOT NULL,
    file_size integer DEFAULT 0 NOT NULL,
    file_data bytea NOT NULL,
    uploaded_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ariba_employee_master_state (
    id boolean DEFAULT true NOT NULL,
    source_version text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ariba_function_backups (
    id bigint NOT NULL,
    fn text NOT NULL,
    def text NOT NULL,
    note text,
    saved_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ariba_leave_tombstones (
    hr_leave_id text NOT NULL,
    employee_id text,
    deleted_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_by text
);

CREATE TABLE public.ariba_login_attempts (
    id bigint NOT NULL,
    uname text NOT NULL,
    ip text,
    at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ariba_password_resets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ariba_payroll_status (
    pay_year integer NOT NULL,
    pay_month integer NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    prepared_by text,
    prepared_by_name text,
    prepared_at timestamp with time zone,
    prepare_note text,
    approved_by text,
    approved_by_name text,
    approved_at timestamp with time zone,
    reopened_by text,
    reopened_by_name text,
    reopened_at timestamp with time zone,
    reopen_reason text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ariba_payroll_status_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'prepared'::text, 'approved'::text, 'reopened'::text])))
);

CREATE TABLE public.ariba_preview_pages (
    slug text NOT NULL,
    html text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ariba_role_perms (
    role text NOT NULL,
    module text NOT NULL,
    level text NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    updated_by text,
    CONSTRAINT ariba_role_perms_level_check CHECK ((level = ANY (ARRAY['none'::text, 'view'::text, 'edit'::text])))
);

CREATE TABLE public.ariba_security_flags (
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by text
);

CREATE TABLE public.ariba_sessions (
    token uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    employee_id text,
    role text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '08:00:00'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.attendance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    emp_id text NOT NULL,
    date date NOT NULL,
    time_in time without time zone,
    time_out time without time zone,
    location_id text,
    location_name text,
    lat numeric,
    lng numeric,
    status text DEFAULT 'present'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    late_minutes integer,
    early_minutes integer
);

CREATE TABLE public.company_settings (
    id text DEFAULT 'default'::text NOT NULL,
    work_start time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
    tolerance_minutes integer DEFAULT 15 NOT NULL,
    remote_days_per_year integer DEFAULT 10 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    shift_duration_minutes integer DEFAULT 480 NOT NULL,
    flexible_enabled boolean DEFAULT false NOT NULL,
    shift_hours numeric DEFAULT 8 NOT NULL,
    flex_window_start time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
    flex_window_end time without time zone DEFAULT '17:00:00'::time without time zone NOT NULL
);

CREATE TABLE public.employee_directory (
    employee_id text NOT NULL,
    username text NOT NULL,
    name_ar text NOT NULL,
    name_en text,
    employer text,
    department text,
    job_title text,
    nationality text,
    iqama_no text,
    dob date,
    join_date date,
    manager_id text,
    active boolean DEFAULT true NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.employee_payrolls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id text NOT NULL,
    pay_year integer NOT NULL,
    pay_month integer NOT NULL,
    approved boolean DEFAULT false NOT NULL,
    approved_at timestamp with time zone,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT employee_payrolls_pay_month_check CHECK (((pay_month >= 1) AND (pay_month <= 12)))
);

CREATE TABLE public.employee_termination_archive (
    employee_id text NOT NULL,
    source_file text DEFAULT 'المنتهية خدماتهم (1).xlsx'::text NOT NULL,
    source_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.leave_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    emp_id text NOT NULL,
    type text NOT NULL,
    from_date date NOT NULL,
    to_date date NOT NULL,
    days integer NOT NULL,
    notes text,
    status text DEFAULT 'pending'::text,
    mgr_status text DEFAULT 'pending'::text,
    mgr_notes text,
    mgr_at timestamp with time zone,
    hr_status text DEFAULT 'pending'::text,
    hr_notes text,
    hr_at timestamp with time zone,
    ceo_status text DEFAULT 'pending'::text,
    ceo_notes text,
    ceo_at timestamp with time zone,
    manager_id text,
    rejected_by text,
    rejected_reason text,
    doc_attachment text,
    is_financial boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    workflow_request_id uuid,
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.payroll_archives_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pay_year integer NOT NULL,
    pay_month integer NOT NULL,
    approved boolean DEFAULT false NOT NULL,
    approved_at text,
    rows jsonb DEFAULT '[]'::jsonb NOT NULL,
    saved_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    emp_id text NOT NULL,
    type text NOT NULL,
    date date NOT NULL,
    "time" time without time zone,
    dur numeric DEFAULT 1,
    notes text,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.public_holidays (
    id text NOT NULL,
    name text NOT NULL,
    name_en text,
    holiday_date date NOT NULL,
    days integer DEFAULT 1 NOT NULL,
    recurring boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.work_locations (
    id text NOT NULL,
    name text NOT NULL,
    name_en text,
    employer text DEFAULT 'all'::text NOT NULL,
    type text DEFAULT 'project'::text NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    radius_m integer DEFAULT 200 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    polygon jsonb,
    CONSTRAINT work_locations_radius_m_check CHECK (((radius_m >= 10) AND (radius_m <= 5000)))
);

CREATE TABLE public.workflow_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    actor_employee_id text,
    actor_account_id uuid,
    stage text NOT NULL,
    action text NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workflow_actions_action_check CHECK ((action = ANY (ARRAY['submitted'::text, 'approved'::text, 'rejected'::text])))
);

CREATE TABLE public.workflow_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_employee_id text NOT NULL,
    request_id uuid,
    title text NOT NULL,
    body text NOT NULL,
    stage text,
    kind text DEFAULT 'workflow'::text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone
);

CREATE TABLE public.workflow_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id text NOT NULL,
    request_type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    manager_id text,
    hr_id text DEFAULT '40'::text NOT NULL,
    ceo_id text DEFAULT '86'::text NOT NULL,
    current_stage text DEFAULT 'manager'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    rejected_at timestamp with time zone,
    rejection_reason text,
    CONSTRAINT workflow_requests_current_stage_check CHECK ((current_stage = ANY (ARRAY['manager'::text, 'hr'::text, 'ceo'::text, 'employee'::text, 'completed'::text, 'rejected'::text]))),
    CONSTRAINT workflow_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);
