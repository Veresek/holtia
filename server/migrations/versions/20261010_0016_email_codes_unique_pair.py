"""Pin one email code row per user and purpose.

Revision ID: 20261010_0016
Revises: 20261010_0015
Create Date: 2026-10-10
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20261010_0016"
down_revision: str | None = "20261010_0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Batch mode: SQLite has no ALTER TABLE ... ADD CONSTRAINT, so the table is
    # copied and rebuilt there, while Postgres takes the plain ALTER path.
    with op.batch_alter_table("email_codes") as batch_op:
        batch_op.create_unique_constraint(
            "uq_email_codes_user_purpose",
            ["user_id", "purpose"],
        )


def downgrade() -> None:
    with op.batch_alter_table("email_codes") as batch_op:
        batch_op.drop_constraint(
            "uq_email_codes_user_purpose",
            type_="unique",
        )
