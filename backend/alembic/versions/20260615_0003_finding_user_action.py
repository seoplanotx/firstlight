"""add finding user_action triage column

Revision ID: 20260615_0003
Revises: 20260520_0002
Create Date: 2026-06-15 06:30:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260615_0003"
down_revision = "20260520_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "findings",
        sa.Column("user_action", sa.String(length=20), nullable=False, server_default="none"),
    )


def downgrade() -> None:
    with op.batch_alter_table("findings") as batch_op:
        batch_op.drop_column("user_action")
