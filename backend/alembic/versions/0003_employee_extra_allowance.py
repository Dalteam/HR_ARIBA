"""employee extra allowance ("إضافي" in the V114 salary tab)

Revision ID: 0003
Revises: 0002
"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("employees") as batch:
        batch.add_column(sa.Column("extra_allowance", sa.Numeric(12, 2), server_default="0", nullable=False))


def downgrade() -> None:
    with op.batch_alter_table("employees") as batch:
        batch.drop_column("extra_allowance")
