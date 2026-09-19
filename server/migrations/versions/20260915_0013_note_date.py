"""Allow notes to hang on a calendar day.

Revision ID: 20260915_0013
Revises: 20260913_0012
Create Date: 2026-09-15
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260915_0013"
down_revision: str | None = "20260913_0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("notes", sa.Column("date", sa.Date(), nullable=True))
    op.create_index("ix_notes_date", "notes", ["date"])


def downgrade() -> None:
    op.drop_index("ix_notes_date", table_name="notes")
    op.drop_column("notes", "date")
