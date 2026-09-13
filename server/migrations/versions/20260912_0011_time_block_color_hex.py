"""Store time-block color as a hex value.

Revision ID: 20260912_0011
Revises: 20260909_0010
Create Date: 2026-09-12
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260912_0011"
down_revision: str | None = "20260909_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _color_check_names() -> list[str]:
    inspector = sa.inspect(op.get_bind())
    names: list[str] = []
    for constraint in inspector.get_check_constraints("time_blocks"):
        name = constraint.get("name")
        sqltext = constraint.get("sqltext") or ""
        if not name or name == "ck_time_blocks_start_neq_end":
            continue
        if "blockcolor" in name.lower() or "color" in sqltext.lower():
            names.append(name)
    return names


def upgrade() -> None:
    check_names = _color_check_names()
    with op.batch_alter_table("time_blocks") as batch_op:
        for name in check_names:
            batch_op.drop_constraint(name, type_="check")
        batch_op.alter_column(
            "color",
            existing_type=sa.String(),
            type_=sa.String(7),
            existing_nullable=False,
            server_default="#3e513c",
        )

    op.execute(
        sa.text(
            """
            UPDATE time_blocks SET color = CASE color
                WHEN 'moss' THEN '#3e513c'
                WHEN 'lichen' THEN '#6a7d5c'
                WHEN 'rust' THEN '#8c4a3e'
                WHEN 'ink' THEN '#2a3128'
                ELSE color
            END
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE time_blocks SET color = CASE color
                WHEN '#3e513c' THEN 'moss'
                WHEN '#6a7d5c' THEN 'lichen'
                WHEN '#8c4a3e' THEN 'rust'
                WHEN '#2a3128' THEN 'ink'
                ELSE 'moss'
            END
            """
        )
    )

    blockcolor = sa.Enum(
        "moss",
        "lichen",
        "rust",
        "ink",
        name="blockcolor",
        native_enum=False,
        create_constraint=True,
    )
    with op.batch_alter_table("time_blocks") as batch_op:
        batch_op.alter_column(
            "color",
            existing_type=sa.String(7),
            type_=blockcolor,
            existing_nullable=False,
            server_default="moss",
        )
