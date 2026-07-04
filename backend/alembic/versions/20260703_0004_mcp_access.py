"""add mcp access settings for the Claude Desktop extension gateway

Revision ID: 20260703_0004
Revises: 20260615_0003
Create Date: 2026-07-03 09:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260703_0004"
down_revision = "20260615_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "app_settings",
        sa.Column("mcp_access_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "app_settings",
        sa.Column("mcp_access_token_encrypted", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    with op.batch_alter_table("app_settings") as batch_op:
        batch_op.drop_column("mcp_access_token_encrypted")
        batch_op.drop_column("mcp_access_enabled")
