import enum
import uuid
from datetime import date, datetime, time

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    JSON,
    String,
    Text,
    Time,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Recurrence(str, enum.Enum):
    NONE = "none"
    DAILY = "daily"
    WEEKLY = "weekly"
    WEEKDAYS = "weekdays"


class BlockColor(str, enum.Enum):
    MOSS = "moss"
    LICHEN = "lichen"
    RUST = "rust"
    INK = "ink"


class TimeBlock(Base):
    __tablename__ = "time_blocks"
    __table_args__ = (
        CheckConstraint('"start" <> "end"', name="ck_time_blocks_start_neq_end"),
        Index("ix_time_blocks_user_id_date", "user_id", "date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    date: Mapped[date] = mapped_column(Date)
    start: Mapped[time] = mapped_column(Time)
    end: Mapped[time] = mapped_column(Time)
    recurrence: Mapped[Recurrence] = mapped_column(
        Enum(Recurrence, native_enum=False),
        default=Recurrence.NONE,
    )
    recurrence_days: Mapped[list[int]] = mapped_column(JSON, default=list)
    color: Mapped[BlockColor] = mapped_column(
        Enum(
            BlockColor,
            native_enum=False,
            values_callable=lambda items: [item.value for item in items],
        ),
        default=BlockColor.MOSS,
        server_default="moss",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
