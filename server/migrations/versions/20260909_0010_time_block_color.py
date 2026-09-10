"""Add a restrained colour token on time blocks.

Revision ID: 20260909_0010
Revises: 20260909_0009
Create Date: 2026-09-09
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260909_0010"
down_revision: str | None = "20260909_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

blockcolor = sa.Enum(
    "moss",
    "lichen",
    "rust",
    "ink",
    name="blockcolor",
    native_enum=False,
    create_constraint=True,
)


def upgrade() -> None:
    op.add_column(
        "time_blocks",
        sa.Column(
            "color",
            blockcolor,
            nullable=False,
            server_default="moss",
        ),
    )


def downgrade() -> None:
    op.drop_column("time_blocks", "color")
