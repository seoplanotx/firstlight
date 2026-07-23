"""add plain-language summary cache columns to findings

Revision ID: 20260722_0006
Revises: 20260703_0005
Create Date: 2026-07-22 21:20:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260722_0006"
down_revision = "20260703_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("findings") as batch_op:
        batch_op.add_column(sa.Column("plain_language_summary", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("plain_language_generated_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("plain_language_provider", sa.String(length=80), nullable=True))
        batch_op.add_column(sa.Column("plain_language_model", sa.String(length=120), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("findings") as batch_op:
        batch_op.drop_column("plain_language_model")
        batch_op.drop_column("plain_language_provider")
        batch_op.drop_column("plain_language_generated_at")
        batch_op.drop_column("plain_language_summary")
