"""Add completed_at so yesterday’s done tasks can leave the active list.

Revision ID: 20260909_0009
Revises: 20260906_0008
Create Date: 2026-09-09
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260909_0009"
down_revision: str | None = "20260906_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(
        sa.text("UPDATE tasks SET completed_at = updated_at WHERE done")
    )


def downgrade() -> None:
    op.drop_column("tasks", "completed_at")
