"""Store each user’s IANA timezone for calendar today.

Revision ID: 20260913_0012
Revises: 20260912_0011
Create Date: 2026-09-13
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260913_0012"
down_revision: str | None = "20260912_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "timezone",
            sa.String(length=64),
            nullable=False,
            server_default="Europe/Warsaw",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "timezone")
