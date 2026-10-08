"""baseline schema

Revision ID: 0001
Revises: 
Create Date: 2026-10-04 11:21:35.674016
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# Frozen copies of the enum values at this revision. Never import app.models here.
ENUMS: dict[str, tuple[str, ...]] = {
    'attendance_source': ('app', 'manual',),
    'attendance_status': ('present', 'late', 'absent', 'leave', 'remote',),
    'contract_nature': ('fixed', 'indefinite',),
    'currency': ('SAR', 'USD', 'EUR', 'EGP',),
    'dependent_relation': ('wife', 'husband', 'son', 'daughter', 'father', 'mother',),
    'document_type': ('iqama', 'passport', 'insurance', 'contract', 'graduation_certificate', 'experience_certificate', 'gosi_certificate', 'cv', 'national_address', 'photo', 'letter', 'other',),
    'employee_category': ('active', 'tamheer', 'training', 'consultant', 'hourly',),
    'exclusion_reason': ('never_joined', 'engagement_ended', 'other',),
    'gender': ('male', 'female',),
    'gosi_system': ('matching', 'non_matching', 'non_saudi',),
    'leave_field': ('entitlement', 'used', 'adjustment', 'year_end', 'carry',),
    'location_type': ('hq', 'project', 'remote',),
    'marital_status': ('single', 'married', 'divorced', 'widowed',),
    'payment_method': ('mudad', 'bank_transfer', 'international_transfer', 'cash',),
    'payroll_status': ('draft', 'approved',),
    'punch_kind': ('in', 'out', 'both',),
    'religion': ('muslim', 'other',),
    'request_status': ('pending', 'approved', 'rejected', 'cancelled',),
    'request_type': ('annual', 'sick', 'emergency', 'death', 'marriage', 'maternity', 'paternity', 'umrah', 'hajj', 'remote', 'permission', 'maternity_permission', 'early_leave', 'advance', 'mission', 'forgot_punch', 'overtime',),
    'settlement_item_kind': ('addition', 'deduction',),
    'step_action': ('submitted', 'approved', 'rejected', 'override_approved',),
    'template_status': ('sent', 'acknowledged', 'rejected',),
    'template_type': ('commencement', 'custody', 'probation_extension', 'probation_end', 'clearance', 'experience_certificate', 'probation_evaluation',),
    'termination_article': ('art_84', 'art_74', 'art_74_death', 'art_74_retirement', 'art_85', 'art_75', 'art_77', 'art_80', 'art_53',),
    'user_role': ('employee', 'manager', 'finance', 'hr', 'ceo', 'admin',),
    'workflow_stage': ('manager', 'hr', 'ceo', 'completed',),
    'wps_type': ('wps', 'trainee', 'tamheer', 'external', 'consultant', 'no_wps', 'remote',),
}


def enum(name: str) -> postgresql.ENUM:
    # create_type=False: types are created once, explicitly, in upgrade() (several tables share one type).
    return postgresql.ENUM(*ENUMS[name], name=name, create_type=False)


def _is_pg() -> bool:
    return op.get_bind().dialect.name == "postgresql"


revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    if _is_pg():
        for name, values in ENUMS.items():
            postgresql.ENUM(*values, name=name).create(op.get_bind(), checkfirst=True)

    op.create_table('attendance_settings',
    sa.Column('work_start', sa.Time(), nullable=False),
    sa.Column('tolerance_minutes', sa.Integer(), nullable=False),
    sa.Column('flexible_enabled', sa.Boolean(), server_default='0', nullable=False),
    sa.Column('shift_hours', sa.Numeric(precision=4, scale=2), nullable=False),
    sa.Column('window_start', sa.Time(), nullable=False),
    sa.Column('window_end', sa.Time(), nullable=False),
    sa.Column('remote_days_per_year', sa.Integer(), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('company_settings',
    sa.Column('company_name_ar', sa.String(length=200), nullable=False),
    sa.Column('company_name_en', sa.String(length=200), nullable=False),
    sa.Column('labour_law_country', sa.String(length=2), server_default='SA', nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('departments',
    sa.Column('code', sa.String(length=40), nullable=False),
    sa.Column('name_ar', sa.String(length=120), nullable=False),
    sa.Column('name_en', sa.String(length=120), nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default='1', nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('code')
    )
    op.create_table('gosi_rules',
    sa.Column('effective_from', sa.Date(), nullable=False),
    sa.Column('system', enum('gosi_system'), nullable=False),
    sa.Column('employee_rate', sa.Numeric(precision=6, scale=3), nullable=False),
    sa.Column('employer_rate', sa.Numeric(precision=6, scale=3), nullable=False),
    sa.Column('employee_rate_senior', sa.Numeric(precision=6, scale=3), nullable=False),
    sa.Column('employer_rate_senior', sa.Numeric(precision=6, scale=3), nullable=False),
    sa.Column('senior_age', sa.Integer(), server_default='55', nullable=False),
    sa.Column('wage_cap', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('effective_from', 'system', name='uq_gosi_rules_effective_system')
    )
    op.create_table('holidays',
    sa.Column('name_ar', sa.String(length=120), nullable=False),
    sa.Column('name_en', sa.String(length=120), nullable=False),
    sa.Column('start_date', sa.Date(), nullable=False),
    sa.Column('days', sa.Integer(), server_default='1', nullable=False),
    sa.Column('is_recurring', sa.Boolean(), server_default='0', nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('holidays', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_holidays_start_date'), ['start_date'], unique=False)

    op.create_table('nationalities',
    sa.Column('code', sa.String(length=40), nullable=False),
    sa.Column('name_ar', sa.String(length=120), nullable=False),
    sa.Column('name_en', sa.String(length=120), nullable=False),
    sa.Column('is_saudi', sa.Boolean(), server_default='0', nullable=False),
    sa.Column('sort_order', sa.Integer(), server_default='0', nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('code')
    )
    op.create_table('workflow_rules',
    sa.Column('request_type', enum('request_type'), nullable=False),
    sa.Column('requires_manager', sa.Boolean(), nullable=False),
    sa.Column('requires_hr', sa.Boolean(), nullable=False),
    sa.Column('requires_ceo', sa.Boolean(), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('request_type')
    )
    op.create_table('workplaces',
    sa.Column('code', sa.String(length=40), nullable=False),
    sa.Column('name_ar', sa.String(length=120), nullable=False),
    sa.Column('name_en', sa.String(length=120), nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default='1', nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('code')
    )
    op.create_table('employees',
    sa.Column('emp_no', sa.String(length=20), nullable=False),
    sa.Column('name_ar', sa.String(length=200), nullable=False),
    sa.Column('name_en', sa.String(length=200), nullable=True),
    sa.Column('photo_path', sa.String(length=500), nullable=True),
    sa.Column('birth_date', sa.Date(), nullable=True),
    sa.Column('gender', enum('gender'), nullable=True),
    sa.Column('religion', enum('religion'), nullable=True),
    sa.Column('marital_status', enum('marital_status'), nullable=True),
    sa.Column('mobile', sa.String(length=30), nullable=True),
    sa.Column('email', sa.String(length=200), nullable=True),
    sa.Column('national_address', sa.Text(), nullable=True),
    sa.Column('nationality_id', sa.Uuid(), nullable=True),
    sa.Column('workplace_id', sa.Uuid(), nullable=True),
    sa.Column('department_id', sa.Uuid(), nullable=True),
    sa.Column('job_title', sa.String(length=200), nullable=True),
    sa.Column('manager_id', sa.Uuid(), nullable=True),
    sa.Column('sponsor', sa.String(length=200), nullable=True),
    sa.Column('category', enum('employee_category'), nullable=False),
    sa.Column('wps_type', enum('wps_type'), nullable=False),
    sa.Column('bank_name', sa.String(length=120), nullable=True),
    sa.Column('iban', sa.String(length=34), nullable=True),
    sa.Column('national_id', sa.String(length=20), nullable=True),
    sa.Column('national_id_expiry', sa.Date(), nullable=True),
    sa.Column('passport_no', sa.String(length=30), nullable=True),
    sa.Column('passport_expiry', sa.Date(), nullable=True),
    sa.Column('insurance_company', sa.String(length=120), nullable=True),
    sa.Column('insurance_class', sa.String(length=30), nullable=True),
    sa.Column('insurance_card_no', sa.String(length=60), nullable=True),
    sa.Column('insurance_expiry', sa.Date(), nullable=True),
    sa.Column('contract_nature', enum('contract_nature'), nullable=False),
    sa.Column('contract_duration_months', sa.Integer(), nullable=True),
    sa.Column('join_date', sa.Date(), nullable=True),
    sa.Column('contract_end_date', sa.Date(), nullable=True),
    sa.Column('annual_leave_days', sa.Integer(), server_default='21', nullable=False),
    sa.Column('basic_salary', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
    sa.Column('housing_allowance', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
    sa.Column('transport_allowance', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
    sa.Column('project_allowance', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
    sa.Column('other_allowances', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
    sa.Column('other_deductions', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
    sa.Column('currency', enum('currency'), nullable=False),
    sa.Column('exchange_rate', sa.Numeric(precision=10, scale=4), server_default='1', nullable=False),
    sa.Column('gosi_system', enum('gosi_system'), nullable=False),
    sa.Column('payment_method', enum('payment_method'), nullable=False),
    sa.Column('exclude_from_payroll', sa.Boolean(), server_default='0', nullable=False),
    sa.Column('exclude_from_eos', sa.Boolean(), server_default='0', nullable=False),
    sa.Column('termination_date', sa.Date(), nullable=True),
    sa.Column('termination_article', enum('termination_article'), nullable=True),
    sa.Column('termination_reason', sa.Text(), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['department_id'], ['departments.id'], ),
    sa.ForeignKeyConstraint(['manager_id'], ['employees.id'], ),
    sa.ForeignKeyConstraint(['nationality_id'], ['nationalities.id'], ),
    sa.ForeignKeyConstraint(['workplace_id'], ['workplaces.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('emp_no')
    )
    with op.batch_alter_table('employees', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_employees_category'), ['category'], unique=False)
        batch_op.create_index('ix_employees_contract_end_date', ['contract_end_date'], unique=False)
        batch_op.create_index(batch_op.f('ix_employees_department_id'), ['department_id'], unique=False)
        batch_op.create_index('ix_employees_insurance_expiry', ['insurance_expiry'], unique=False)
        batch_op.create_index(batch_op.f('ix_employees_manager_id'), ['manager_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_employees_national_id'), ['national_id'], unique=False)
        batch_op.create_index('ix_employees_national_id_expiry', ['national_id_expiry'], unique=False)
        batch_op.create_index(batch_op.f('ix_employees_nationality_id'), ['nationality_id'], unique=False)
        batch_op.create_index('ix_employees_passport_expiry', ['passport_expiry'], unique=False)
        batch_op.create_index(batch_op.f('ix_employees_termination_date'), ['termination_date'], unique=False)
        batch_op.create_index(batch_op.f('ix_employees_workplace_id'), ['workplace_id'], unique=False)

    op.create_table('excluded_candidates',
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('nationality_id', sa.Uuid(), nullable=True),
    sa.Column('workplace_id', sa.Uuid(), nullable=True),
    sa.Column('reason', enum('exclusion_reason'), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.ForeignKeyConstraint(['nationality_id'], ['nationalities.id'], ),
    sa.ForeignKeyConstraint(['workplace_id'], ['workplaces.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('locations',
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('name_en', sa.String(length=200), nullable=True),
    sa.Column('workplace_id', sa.Uuid(), nullable=True),
    sa.Column('type', enum('location_type'), nullable=False),
    sa.Column('radius_m', sa.Integer(), server_default='200', nullable=False),
    sa.Column('latitude', sa.Numeric(precision=9, scale=6), nullable=False),
    sa.Column('longitude', sa.Numeric(precision=9, scale=6), nullable=False),
    sa.Column('is_active', sa.Boolean(), server_default='1', nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['workplace_id'], ['workplaces.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('locations', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_locations_workplace_id'), ['workplace_id'], unique=False)

    op.create_table('dependents',
    sa.Column('employee_id', sa.Uuid(), nullable=False),
    sa.Column('relation', enum('dependent_relation'), nullable=False),
    sa.Column('name_ar', sa.String(length=200), nullable=False),
    sa.Column('name_en', sa.String(length=200), nullable=True),
    sa.Column('birth_date', sa.Date(), nullable=True),
    sa.Column('national_id', sa.String(length=20), nullable=True),
    sa.Column('national_id_expiry', sa.Date(), nullable=True),
    sa.Column('passport_no', sa.String(length=30), nullable=True),
    sa.Column('passport_expiry', sa.Date(), nullable=True),
    sa.Column('insurance_company', sa.String(length=120), nullable=True),
    sa.Column('insurance_card_no', sa.String(length=60), nullable=True),
    sa.Column('insurance_expiry', sa.Date(), nullable=True),
    sa.Column('mobile', sa.String(length=30), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('dependents', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_dependents_employee_id'), ['employee_id'], unique=False)

    op.create_table('leave_year_ledgers',
    sa.Column('employee_id', sa.Uuid(), nullable=False),
    sa.Column('year', sa.Integer(), nullable=False),
    sa.Column('opening', sa.Numeric(precision=7, scale=2), server_default='0', nullable=False),
    sa.Column('entitlement', sa.Numeric(precision=7, scale=2), server_default='0', nullable=False),
    sa.Column('used', sa.Numeric(precision=7, scale=2), server_default='0', nullable=False),
    sa.Column('adjustment', sa.Numeric(precision=7, scale=2), server_default='0', nullable=False),
    sa.Column('closing', sa.Numeric(precision=7, scale=2), server_default='0', nullable=False),
    sa.Column('carry', sa.Numeric(precision=7, scale=2), server_default='0', nullable=False),
    sa.Column('eos_bank', sa.Numeric(precision=7, scale=2), server_default='0', nullable=False),
    sa.Column('is_closed', sa.Boolean(), server_default='0', nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('employee_id', 'year', name='uq_leave_ledger_employee_year')
    )
    with op.batch_alter_table('leave_year_ledgers', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_leave_year_ledgers_employee_id'), ['employee_id'], unique=False)

    op.create_table('users',
    sa.Column('username', sa.String(length=60), nullable=False),
    sa.Column('role', enum('user_role'), nullable=False),
    sa.Column('employee_id', sa.Uuid(), nullable=True),
    sa.Column('is_active', sa.Boolean(), server_default='1', nullable=False),
    sa.Column('must_change_password', sa.Boolean(), server_default='1', nullable=False),
    sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('employee_id'),
    sa.UniqueConstraint('username')
    )
    op.create_table('attendance_records',
    sa.Column('employee_id', sa.Uuid(), nullable=False),
    sa.Column('work_date', sa.Date(), nullable=False),
    sa.Column('time_in', sa.DateTime(timezone=True), nullable=True),
    sa.Column('time_out', sa.DateTime(timezone=True), nullable=True),
    sa.Column('location_id', sa.Uuid(), nullable=True),
    sa.Column('status', enum('attendance_status'), nullable=False),
    sa.Column('late_minutes', sa.Integer(), server_default='0', nullable=False),
    sa.Column('early_minutes', sa.Integer(), server_default='0', nullable=False),
    sa.Column('lat_in', sa.Numeric(precision=9, scale=6), nullable=True),
    sa.Column('lng_in', sa.Numeric(precision=9, scale=6), nullable=True),
    sa.Column('lat_out', sa.Numeric(precision=9, scale=6), nullable=True),
    sa.Column('lng_out', sa.Numeric(precision=9, scale=6), nullable=True),
    sa.Column('source', enum('attendance_source'), nullable=False),
    sa.Column('created_by', sa.Uuid(), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ),
    sa.ForeignKeyConstraint(['location_id'], ['locations.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('employee_id', 'work_date', name='uq_attendance_employee_date')
    )
    with op.batch_alter_table('attendance_records', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_attendance_records_employee_id'), ['employee_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_attendance_records_work_date'), ['work_date'], unique=False)

    op.create_table('audit_logs',
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('actor_user_id', sa.Uuid(), nullable=True),
    sa.Column('action', sa.String(length=60), nullable=False),
    sa.Column('entity', sa.String(length=60), nullable=False),
    sa.Column('entity_id', sa.String(length=64), nullable=True),
    sa.Column('details', sa.JSON(), nullable=True),
    sa.Column('ip', sa.String(length=64), nullable=True),
    sa.Column('request_id', sa.String(length=64), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.ForeignKeyConstraint(['actor_user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('audit_logs', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_audit_logs_actor_user_id'), ['actor_user_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_audit_logs_created_at'), ['created_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_audit_logs_entity'), ['entity'], unique=False)
        batch_op.create_index(batch_op.f('ix_audit_logs_entity_id'), ['entity_id'], unique=False)

    op.create_table('documents',
    sa.Column('employee_id', sa.Uuid(), nullable=True),
    sa.Column('dependent_id', sa.Uuid(), nullable=True),
    sa.Column('type', enum('document_type'), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=True),
    sa.Column('storage_path', sa.String(length=500), nullable=False),
    sa.Column('file_name', sa.String(length=255), nullable=False),
    sa.Column('mime_type', sa.String(length=100), nullable=False),
    sa.Column('size_bytes', sa.Integer(), nullable=False),
    sa.Column('uploaded_by', sa.Uuid(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['dependent_id'], ['dependents.id'], ),
    sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ),
    sa.ForeignKeyConstraint(['uploaded_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('storage_path')
    )
    with op.batch_alter_table('documents', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_documents_dependent_id'), ['dependent_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_documents_employee_id'), ['employee_id'], unique=False)

    op.create_table('leave_adjustments',
    sa.Column('employee_id', sa.Uuid(), nullable=False),
    sa.Column('year', sa.Integer(), nullable=False),
    sa.Column('field', enum('leave_field'), nullable=False),
    sa.Column('value', sa.Numeric(precision=7, scale=2), nullable=False),
    sa.Column('effective_date', sa.Date(), nullable=False),
    sa.Column('reason', sa.Text(), nullable=False),
    sa.Column('created_by', sa.Uuid(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('leave_adjustments', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_leave_adjustments_employee_id'), ['employee_id'], unique=False)

    op.create_table('payroll_runs',
    sa.Column('year', sa.Integer(), nullable=False),
    sa.Column('month', sa.Integer(), nullable=False),
    sa.Column('days_in_month', sa.Integer(), nullable=False),
    sa.Column('workplace_id', sa.Uuid(), nullable=True),
    sa.Column('status', enum('payroll_status'), nullable=False),
    sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('approved_by', sa.Uuid(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.ForeignKeyConstraint(['approved_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['workplace_id'], ['workplaces.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('year', 'month', 'workplace_id', name='uq_payroll_run_period')
    )
    op.create_table('payroll_rows',
    sa.Column('run_id', sa.Uuid(), nullable=False),
    sa.Column('employee_id', sa.Uuid(), nullable=False),
    sa.Column('basic_salary', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('housing_allowance', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('transport_allowance', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('project_allowance', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('other_allowances', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('total_salary', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('work_days', sa.Numeric(precision=7, scale=2), nullable=False),
    sa.Column('gosi_days', sa.Numeric(precision=7, scale=2), nullable=False),
    sa.Column('salary_by_days', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('overtime', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
    sa.Column('leave_compensation', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
    sa.Column('extra_allowances', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
    sa.Column('total_due', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('gosi_base', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('gosi_employee', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('gosi_employer', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('loan_deduction', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
    sa.Column('other_deductions', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
    sa.Column('total_deductions', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('net', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('currency', enum('currency'), nullable=False),
    sa.Column('exchange_rate', sa.Numeric(precision=10, scale=4), nullable=False),
    sa.Column('net_sar', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('payment_method', enum('payment_method'), nullable=False),
    sa.Column('iban', sa.String(length=34), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ),
    sa.ForeignKeyConstraint(['run_id'], ['payroll_runs.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('run_id', 'employee_id', name='uq_payroll_row_run_employee')
    )
    with op.batch_alter_table('payroll_rows', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_payroll_rows_employee_id'), ['employee_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_payroll_rows_run_id'), ['run_id'], unique=False)

    op.create_table('requests',
    sa.Column('employee_id', sa.Uuid(), nullable=False),
    sa.Column('type', enum('request_type'), nullable=False),
    sa.Column('status', enum('request_status'), nullable=False),
    sa.Column('current_stage', enum('workflow_stage'), nullable=False),
    sa.Column('from_date', sa.Date(), nullable=True),
    sa.Column('to_date', sa.Date(), nullable=True),
    sa.Column('days', sa.Numeric(precision=7, scale=2), nullable=True),
    sa.Column('on_date', sa.Date(), nullable=True),
    sa.Column('time_from', sa.Time(), nullable=True),
    sa.Column('time_to', sa.Time(), nullable=True),
    sa.Column('hours', sa.Numeric(precision=5, scale=2), nullable=True),
    sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=True),
    sa.Column('punch_kind', enum('punch_kind'), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('rejection_reason', sa.Text(), nullable=True),
    sa.Column('attachment_id', sa.Uuid(), nullable=True),
    sa.Column('submitted_by', sa.Uuid(), nullable=True),
    sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.ForeignKeyConstraint(['attachment_id'], ['documents.id'], ),
    sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ),
    sa.ForeignKeyConstraint(['submitted_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('requests', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_requests_employee_id'), ['employee_id'], unique=False)
        batch_op.create_index('ix_requests_status_stage', ['status', 'current_stage'], unique=False)
        batch_op.create_index(batch_op.f('ix_requests_type'), ['type'], unique=False)

    op.create_table('settlements',
    sa.Column('employee_id', sa.Uuid(), nullable=False),
    sa.Column('end_date', sa.Date(), nullable=False),
    sa.Column('article', enum('termination_article'), nullable=False),
    sa.Column('service_years', sa.Numeric(precision=8, scale=4), nullable=False),
    sa.Column('eos_base', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('eos_amount', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('leave_remaining_days', sa.Numeric(precision=7, scale=2), nullable=False),
    sa.Column('leave_compensation', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('excess_leave_deduction', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('final_period_days', sa.Numeric(precision=7, scale=2), nullable=False),
    sa.Column('final_period_salary', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('total', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('document_id', sa.Uuid(), nullable=True),
    sa.Column('created_by', sa.Uuid(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
    sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ),
    sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('settlements', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_settlements_employee_id'), ['employee_id'], unique=False)

    op.create_table('template_letters',
    sa.Column('employee_id', sa.Uuid(), nullable=False),
    sa.Column('type', enum('template_type'), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('document_id', sa.Uuid(), nullable=True),
    sa.Column('status', enum('template_status'), nullable=False),
    sa.Column('sent_by', sa.Uuid(), nullable=True),
    sa.Column('responded_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('rejection_reason', sa.Text(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ),
    sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ),
    sa.ForeignKeyConstraint(['sent_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('template_letters', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_template_letters_employee_id'), ['employee_id'], unique=False)

    op.create_table('request_steps',
    sa.Column('request_id', sa.Uuid(), nullable=False),
    sa.Column('stage', enum('workflow_stage'), nullable=False),
    sa.Column('action', enum('step_action'), nullable=False),
    sa.Column('actor_user_id', sa.Uuid(), nullable=True),
    sa.Column('reason', sa.Text(), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.ForeignKeyConstraint(['actor_user_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['request_id'], ['requests.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('request_steps', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_request_steps_request_id'), ['request_id'], unique=False)

    op.create_table('settlement_items',
    sa.Column('settlement_id', sa.Uuid(), nullable=False),
    sa.Column('kind', enum('settlement_item_kind'), nullable=False),
    sa.Column('label', sa.String(length=200), nullable=False),
    sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=True),
    sa.Column('days', sa.Numeric(precision=7, scale=2), nullable=True),
    sa.Column('daily_rate', sa.Numeric(precision=12, scale=2), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.ForeignKeyConstraint(['settlement_id'], ['settlements.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('settlement_items', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_settlement_items_settlement_id'), ['settlement_id'], unique=False)


    if _is_pg():
        # Second layer of defence: the browser never talks to the database, and with RLS on and no
        # policies the Supabase anon/authenticated roles can read nothing. The backend connects as
        # the table owner, which bypasses RLS.
        for table in sa.inspect(op.get_bind()).get_table_names():
            op.execute(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    with op.batch_alter_table('settlement_items', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_settlement_items_settlement_id'))

    op.drop_table('settlement_items')
    with op.batch_alter_table('request_steps', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_request_steps_request_id'))

    op.drop_table('request_steps')
    with op.batch_alter_table('template_letters', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_template_letters_employee_id'))

    op.drop_table('template_letters')
    with op.batch_alter_table('settlements', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_settlements_employee_id'))

    op.drop_table('settlements')
    with op.batch_alter_table('requests', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_requests_type'))
        batch_op.drop_index('ix_requests_status_stage')
        batch_op.drop_index(batch_op.f('ix_requests_employee_id'))

    op.drop_table('requests')
    with op.batch_alter_table('payroll_rows', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_payroll_rows_run_id'))
        batch_op.drop_index(batch_op.f('ix_payroll_rows_employee_id'))

    op.drop_table('payroll_rows')
    op.drop_table('payroll_runs')
    with op.batch_alter_table('leave_adjustments', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_leave_adjustments_employee_id'))

    op.drop_table('leave_adjustments')
    with op.batch_alter_table('documents', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_documents_employee_id'))
        batch_op.drop_index(batch_op.f('ix_documents_dependent_id'))

    op.drop_table('documents')
    with op.batch_alter_table('audit_logs', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_audit_logs_entity_id'))
        batch_op.drop_index(batch_op.f('ix_audit_logs_entity'))
        batch_op.drop_index(batch_op.f('ix_audit_logs_created_at'))
        batch_op.drop_index(batch_op.f('ix_audit_logs_actor_user_id'))

    op.drop_table('audit_logs')
    with op.batch_alter_table('attendance_records', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_attendance_records_work_date'))
        batch_op.drop_index(batch_op.f('ix_attendance_records_employee_id'))

    op.drop_table('attendance_records')
    op.drop_table('users')
    with op.batch_alter_table('leave_year_ledgers', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_leave_year_ledgers_employee_id'))

    op.drop_table('leave_year_ledgers')
    with op.batch_alter_table('dependents', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_dependents_employee_id'))

    op.drop_table('dependents')
    with op.batch_alter_table('locations', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_locations_workplace_id'))

    op.drop_table('locations')
    op.drop_table('excluded_candidates')
    with op.batch_alter_table('employees', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_employees_workplace_id'))
        batch_op.drop_index(batch_op.f('ix_employees_termination_date'))
        batch_op.drop_index('ix_employees_passport_expiry')
        batch_op.drop_index(batch_op.f('ix_employees_nationality_id'))
        batch_op.drop_index('ix_employees_national_id_expiry')
        batch_op.drop_index(batch_op.f('ix_employees_national_id'))
        batch_op.drop_index(batch_op.f('ix_employees_manager_id'))
        batch_op.drop_index('ix_employees_insurance_expiry')
        batch_op.drop_index(batch_op.f('ix_employees_department_id'))
        batch_op.drop_index('ix_employees_contract_end_date')
        batch_op.drop_index(batch_op.f('ix_employees_category'))

    op.drop_table('employees')
    op.drop_table('workplaces')
    op.drop_table('workflow_rules')
    op.drop_table('nationalities')
    with op.batch_alter_table('holidays', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_holidays_start_date'))

    op.drop_table('holidays')
    op.drop_table('gosi_rules')
    op.drop_table('departments')
    op.drop_table('company_settings')
    op.drop_table('attendance_settings')

    if _is_pg():
        for name in ENUMS:
            postgresql.ENUM(name=name).drop(op.get_bind(), checkfirst=True)
