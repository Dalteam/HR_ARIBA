"""employee_locations: punch locations per employee (legacy V121 workLocationIds)

Revision ID: 0008
Revises: 0007
"""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "employee_locations",
        sa.Column("employee_id", sa.Uuid(), nullable=False),
        sa.Column("location_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("employee_id", "location_id"),
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute('ALTER TABLE "employee_locations" ENABLE ROW LEVEL SECURITY')


def downgrade() -> None:
    op.drop_table("employee_locations")
