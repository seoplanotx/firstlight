"""add active ai provider selection

Revision ID: 20260703_0005
Revises: 20260703_0004
Create Date: 2026-07-03 12:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260703_0005"
down_revision = "20260703_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "app_settings",
        sa.Column("active_ai_provider", sa.String(length=40), nullable=False, server_default="openrouter"),
    )


def downgrade() -> None:
    with op.batch_alter_table("app_settings") as batch_op:
        batch_op.drop_column("active_ai_provider")
