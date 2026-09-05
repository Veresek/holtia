"""Add encrypted per-user AI credentials.

Revision ID: 20260905_0007
Revises: 20260905_0006
Create Date: 2026-09-05
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260905_0007"
down_revision: str | None = "20260905_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_ai_settings",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("model", sa.String(length=128), nullable=False),
        sa.Column("key_ciphertext", sa.LargeBinary(), nullable=False),
        sa.Column("key_nonce", sa.LargeBinary(), nullable=False),
        sa.Column("key_hint", sa.String(length=8), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_user_ai_settings_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id"),
    )


def downgrade() -> None:
    op.drop_table("user_ai_settings")
