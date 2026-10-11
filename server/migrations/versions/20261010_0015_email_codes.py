"""Store one-time email codes as short-lived hashed rows.

Revision ID: 20261010_0015
Revises: 20260921_0014
Create Date: 2026-10-10
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20261010_0015"
down_revision: str | None = "20260921_0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "email_codes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("purpose", sa.String(length=8), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "attempts",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_email_codes_user_id",
        "email_codes",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_email_codes_user_purpose",
        "email_codes",
        ["user_id", "purpose"],
    )


def downgrade() -> None:
    op.drop_index("ix_email_codes_user_purpose", table_name="email_codes")
    op.drop_index("ix_email_codes_user_id", table_name="email_codes")
    op.drop_table("email_codes")
