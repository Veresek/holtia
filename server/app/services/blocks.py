import uuid
from datetime import date, time, timedelta

from fastapi import HTTPException, status
from sqlalchemy import Select, and_, or_, select
from sqlalchemy.orm import Session

from app.models.task import Task
from app.models.time_block import Recurrence, TimeBlock
from app.schemas.time_block import (
    TimeBlockCreate,
    TimeBlockUpdate,
    recurrence_days_for,
)


TIME_BLOCK_NOT_FOUND = "Time block not found."
INVALID_TIME_RANGE = "end must differ from start"


def occurs_on(block: TimeBlock, day: date) -> bool:
    if day < block.date:
        return False
    if block.recurrence == Recurrence.NONE:
        return day == block.date
    if block.recurrence == Recurrence.DAILY:
        return True
    if block.recurrence == Recurrence.WEEKLY:
        return day.weekday() == block.date.weekday()
    if block.recurrence == Recurrence.WEEKDAYS:
        return day.weekday() in frozenset(block.recurrence_days)
    return False


def next_occurrence_on_or_after(block: TimeBlock, day: date) -> date:
    start = max(day, block.date)
    for offset in range(7):
        candidate = start + timedelta(days=offset)
        if occurs_on(block, candidate):
            return candidate
    return block.date


def is_overnight(block: TimeBlock) -> bool:
    return block.end < block.start


def visible_on(block: TimeBlock, day: date) -> bool:
    if occurs_on(block, day):
        return True
    if is_overnight(block):
        return occurs_on(block, day - timedelta(days=1))
    return False


def _owned_block_statement(block_id: uuid.UUID, user_id: uuid.UUID) -> Select:
    return select(TimeBlock).where(
        TimeBlock.id == block_id,
        TimeBlock.user_id == user_id,
    )


def get_owned_block(
    db: Session,
    block_id: uuid.UUID,
    user_id: uuid.UUID,
) -> TimeBlock:
    block = db.scalar(_owned_block_statement(block_id, user_id))
    if block is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=TIME_BLOCK_NOT_FOUND,
        )
    return block


def list_owned_blocks(
    db: Session,
    user_id: uuid.UUID,
    on_date: date | None = None,
) -> list[TimeBlock]:
    statement = select(TimeBlock).where(TimeBlock.user_id == user_id)
    if on_date is not None:
        previous = on_date - timedelta(days=1)
        statement = statement.where(
            or_(
                and_(
                    TimeBlock.recurrence == Recurrence.NONE,
                    TimeBlock.date == on_date,
                ),
                and_(
                    TimeBlock.recurrence == Recurrence.NONE,
                    TimeBlock.date == previous,
                    TimeBlock.end < TimeBlock.start,
                ),
                and_(
                    TimeBlock.recurrence != Recurrence.NONE,
                    TimeBlock.date <= on_date,
                ),
            )
        )
    statement = statement.order_by(TimeBlock.start, TimeBlock.end, TimeBlock.id)
    blocks = list(db.scalars(statement).all())
    if on_date is None:
        return blocks
    return [block for block in blocks if visible_on(block, on_date)]


def create_owned_block(
    db: Session,
    user_id: uuid.UUID,
    payload: TimeBlockCreate,
) -> TimeBlock:
    block = TimeBlock(user_id=user_id, **payload.model_dump(by_alias=False))
    db.add(block)
    db.commit()
    db.refresh(block)
    return block


def _merged_time_range(
    block: TimeBlock,
    changes: dict[str, object],
) -> tuple[time, time]:
    start = changes["start"] if "start" in changes else block.start
    end = changes["end"] if "end" in changes else block.end
    if not isinstance(start, time) or not isinstance(end, time):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=INVALID_TIME_RANGE,
        )
    if end == start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=INVALID_TIME_RANGE,
        )
    return start, end


def _merged_recurrence_days(
    block: TimeBlock,
    changes: dict[str, object],
) -> list[int]:
    recurrence = changes.get("recurrence", block.recurrence)
    days = changes.get("recurrence_days", block.recurrence_days)
    if not isinstance(recurrence, Recurrence) or not isinstance(days, list):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid recurrence.",
        )
    try:
        return recurrence_days_for(recurrence, days)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error


def _clear_stale_task_pins(db: Session, block: TimeBlock) -> None:
    pinned = db.scalars(select(Task).where(Task.time_block_id == block.id)).all()
    for task in pinned:
        if task.date is None or not occurs_on(block, task.date):
            task.time_block_id = None


def update_owned_block(
    db: Session,
    block_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: TimeBlockUpdate,
) -> TimeBlock:
    block = get_owned_block(db, block_id, user_id)
    changes = payload.model_dump(exclude_unset=True, by_alias=False)
    if not changes:
        return block
    if "start" in changes or "end" in changes:
        _merged_time_range(block, changes)
    if "recurrence" in changes or "recurrence_days" in changes:
        changes["recurrence_days"] = _merged_recurrence_days(block, changes)
    schedule_changed = any(
        field in changes for field in ("date", "recurrence", "recurrence_days")
    )
    for field, value in changes.items():
        setattr(block, field, value)
    if schedule_changed:
        _clear_stale_task_pins(db, block)
    db.commit()
    db.refresh(block)
    return block


def delete_owned_block(
    db: Session,
    block_id: uuid.UUID,
    user_id: uuid.UUID,
) -> None:
    block = get_owned_block(db, block_id, user_id)
    db.delete(block)
    db.commit()
