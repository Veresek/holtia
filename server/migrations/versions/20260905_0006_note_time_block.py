"""Add time_block_id to notes.

Revision ID: 20260905_0006
Revises: 20260902_0005
Create Date: 2026-09-05
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260905_0006"
down_revision: str | None = "20260902_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("notes") as batch_op:
        batch_op.add_column(sa.Column("time_block_id", sa.Uuid(), nullable=True))
        batch_op.create_index("ix_notes_time_block_id", ["time_block_id"])
        batch_op.create_foreign_key(
            "fk_notes_time_block_id_time_blocks",
            "time_blocks",
            ["time_block_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("notes") as batch_op:
        batch_op.drop_constraint(
            "fk_notes_time_block_id_time_blocks",
            type_="foreignkey",
        )
        batch_op.drop_index("ix_notes_time_block_id")
        batch_op.drop_column("time_block_id")
