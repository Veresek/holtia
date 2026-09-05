"""Allow multiple encrypted AI keys per user.

Revision ID: 20260906_0008
Revises: 20260905_0007
Create Date: 2026-09-06
"""

import uuid
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "20260906_0008"
down_revision: str | None = "20260905_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_ai_settings_new",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("model", sa.String(length=128), nullable=False),
        sa.Column("key_ciphertext", sa.LargeBinary(), nullable=False),
        sa.Column("key_nonce", sa.LargeBinary(), nullable=False),
        sa.Column("key_hint", sa.String(length=8), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
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
            name="fk_user_ai_settings_new_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    bind = op.get_bind()
    new_table = sa.table(
        "user_ai_settings_new",
        sa.column("id", sa.Uuid()),
        sa.column("user_id", sa.Uuid()),
        sa.column("provider", sa.String()),
        sa.column("model", sa.String()),
        sa.column("key_ciphertext", sa.LargeBinary()),
        sa.column("key_nonce", sa.LargeBinary()),
        sa.column("key_hint", sa.String()),
        sa.column("is_active", sa.Boolean()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    rows = bind.execute(
        sa.text(
            """
            SELECT user_id, provider, model, key_ciphertext, key_nonce,
                   key_hint, created_at, updated_at
            FROM user_ai_settings
            """
        )
    ).mappings()
    for row in rows:
        bind.execute(
            new_table.insert().values(
                id=uuid.uuid4(),
                user_id=row["user_id"],
                provider=row["provider"],
                model=row["model"],
                key_ciphertext=row["key_ciphertext"],
                key_nonce=row["key_nonce"],
                key_hint=row["key_hint"],
                is_active=True,
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )
        )

    op.drop_table("user_ai_settings")
    op.rename_table("user_ai_settings_new", "user_ai_settings")
    op.create_index(
        "ix_user_ai_settings_user_id",
        "user_ai_settings",
        ["user_id"],
    )


def downgrade() -> None:
    op.create_table(
        "user_ai_settings_old",
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

    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            """
            SELECT user_id, provider, model, key_ciphertext, key_nonce,
                   key_hint, created_at, updated_at, is_active
            FROM user_ai_settings
            ORDER BY is_active DESC, updated_at DESC
            """
        )
    ).mappings()
    seen: set[object] = set()
    for row in rows:
        if row["user_id"] in seen:
            continue
        seen.add(row["user_id"])
        bind.execute(
            sa.text(
                """
                INSERT INTO user_ai_settings_old (
                    user_id, provider, model, key_ciphertext, key_nonce,
                    key_hint, created_at, updated_at
                ) VALUES (
                    :user_id, :provider, :model, :key_ciphertext, :key_nonce,
                    :key_hint, :created_at, :updated_at
                )
                """
            ),
            {
                "user_id": row["user_id"],
                "provider": row["provider"],
                "model": row["model"],
                "key_ciphertext": row["key_ciphertext"],
                "key_nonce": row["key_nonce"],
                "key_hint": row["key_hint"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            },
        )

    op.drop_index("ix_user_ai_settings_user_id", table_name="user_ai_settings")
    op.drop_table("user_ai_settings")
    op.rename_table("user_ai_settings_old", "user_ai_settings")
