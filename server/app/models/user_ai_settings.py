from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, LargeBinary, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class AiProvider(str, enum.Enum):
    OPENAI = "openai"
    XAI = "xai"
    GEMINI = "gemini"


class UserAiSettings(Base):
    __tablename__ = "user_ai_settings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    provider: Mapped[AiProvider] = mapped_column(
        Enum(AiProvider, native_enum=False),
    )
    model: Mapped[str] = mapped_column(String(128))
    key_ciphertext: Mapped[bytes] = mapped_column(LargeBinary)
    key_nonce: Mapped[bytes] = mapped_column(LargeBinary)
    key_hint: Mapped[str] = mapped_column(String(8))
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
    user: Mapped["User"] = relationship(back_populates="ai_keys")
