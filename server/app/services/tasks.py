import uuid
from datetime import date, datetime

from fastapi import HTTPException, status
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.models.task import Task
from app.models.time_block import TimeBlock
from app.schemas.task import TaskCreate, TaskUpdate
from app.services.blocks import next_occurrence_on_or_after, occurs_on
from app.timezones import today_in_timezone, zoneinfo_of


TASK_NOT_FOUND = "Task not found."
TIME_BLOCK_NOT_FOUND = "Time block not found."


def _owned_task_statement(task_id: uuid.UUID, user_id: uuid.UUID) -> Select:
    return select(Task).where(Task.id == task_id, Task.user_id == user_id)


def get_owned_task(db: Session, task_id: uuid.UUID, user_id: uuid.UUID) -> Task:
    task = db.scalar(_owned_task_statement(task_id, user_id))
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=TASK_NOT_FOUND,
        )
    return task


def _ensure_owned_time_block(
    db: Session,
    time_block_id: uuid.UUID | None,
    user_id: uuid.UUID,
) -> TimeBlock | None:
    if time_block_id is None:
        return None
    block = db.scalar(
        select(TimeBlock).where(
            TimeBlock.id == time_block_id,
            TimeBlock.user_id == user_id,
        )
    )
    if block is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=TIME_BLOCK_NOT_FOUND,
        )
    return block


def _today(timezone: str) -> date:
    return today_in_timezone(timezone)


def _pin_date_for(
    block: TimeBlock,
    requested: date | None,
    timezone: str,
) -> date:
    pinned_date = (
        next_occurrence_on_or_after(block, _today(timezone))
        if requested is None
        else requested
    )
    if not occurs_on(block, pinned_date):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"The time block does not occur on {pinned_date.isoformat()}.",
        )
    return pinned_date


def list_owned_tasks(
    db: Session,
    user_id: uuid.UUID,
    task_date: date | None = None,
    *,
    undated: bool = False,
) -> list[Task]:
    statement = select(Task).where(Task.user_id == user_id)
    if undated:
        statement = statement.where(Task.date.is_(None))
    elif task_date is not None:
        statement = statement.where(Task.date == task_date)
    statement = statement.order_by(Task.sort_order, Task.created_at, Task.id)
    return list(db.scalars(statement).all())


def create_owned_task(
    db: Session,
    user_id: uuid.UUID,
    payload: TaskCreate,
    timezone: str,
) -> Task:
    values = payload.model_dump(by_alias=False)
    values["sort_order"] = values.pop("order")
    block = _ensure_owned_time_block(db, values["time_block_id"], user_id)
    if block is not None:
        values["date"] = _pin_date_for(block, values["date"], timezone)
    if values["done"]:
        values["completed_at"] = datetime.now(zoneinfo_of(timezone))
    task = Task(user_id=user_id, **values)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def update_owned_task(
    db: Session,
    task_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: TaskUpdate,
    timezone: str,
) -> Task:
    task = get_owned_task(db, task_id, user_id)
    changes = payload.model_dump(exclude_unset=True, by_alias=False)
    date_specified = "date" in changes
    block_specified = "time_block_id" in changes
    next_date = changes["date"] if date_specified else task.date
    next_block_id = (
        changes["time_block_id"] if block_specified else task.time_block_id
    )
    setting_block = block_specified and next_block_id is not None
    date_cleared = date_specified and next_date is None

    if setting_block:
        block = _ensure_owned_time_block(db, next_block_id, user_id)
        assert block is not None
        requested = None if (not date_specified or next_date is None) else next_date
        changes["time_block_id"] = next_block_id
        changes["date"] = _pin_date_for(block, requested, timezone)
    elif date_cleared:
        changes["date"] = None
        changes["time_block_id"] = None
    elif next_block_id is not None and date_specified:
        block = _ensure_owned_time_block(db, next_block_id, user_id)
        assert block is not None
        changes["date"] = _pin_date_for(block, next_date, timezone)
    elif block_specified:
        changes["time_block_id"] = None

    if "done" in changes and changes["done"] != task.done:
        changes["completed_at"] = (
            datetime.now(zoneinfo_of(timezone)) if changes["done"] else None
        )

    for field, value in changes.items():
        attribute = "sort_order" if field == "order" else field
        setattr(task, attribute, value)
    db.commit()
    db.refresh(task)
    return task


def delete_owned_task(db: Session, task_id: uuid.UUID, user_id: uuid.UUID) -> None:
    task = get_owned_task(db, task_id, user_id)
    db.delete(task)
    db.commit()
