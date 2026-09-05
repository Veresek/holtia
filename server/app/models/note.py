import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255))
    markdown: Mapped[str] = mapped_column(Text, default="")
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"),
        index=True,
    )
    time_block_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("time_blocks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
