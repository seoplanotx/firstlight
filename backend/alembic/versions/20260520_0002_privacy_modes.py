"""add privacy mode settings

Revision ID: 20260520_0002
Revises: 20260403_0001
Create Date: 2026-05-20 23:55:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260520_0002"
down_revision = "20260403_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "app_settings",
        sa.Column("privacy_mode", sa.String(length=40), nullable=False, server_default="local_only"),
    )
    op.add_column(
        "app_settings",
        sa.Column("deidentified_ai_disclosure_acknowledged", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    with op.batch_alter_table("app_settings") as batch_op:
        batch_op.drop_column("deidentified_ai_disclosure_acknowledged")
        batch_op.drop_column("privacy_mode")
