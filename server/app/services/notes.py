import uuid

from fastapi import HTTPException, status
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.models.note import Note
from app.models.task import Task
from app.models.time_block import TimeBlock
from app.schemas.note import NoteCreate, NoteUpdate


NOTE_NOT_FOUND = "Note not found."
TASK_NOT_FOUND = "Task not found."
TIME_BLOCK_NOT_FOUND = "Time block not found."


def _owned_note_statement(note_id: uuid.UUID, user_id: uuid.UUID) -> Select:
    return select(Note).where(Note.id == note_id, Note.user_id == user_id)


def get_owned_note(db: Session, note_id: uuid.UUID, user_id: uuid.UUID) -> Note:
    note = db.scalar(_owned_note_statement(note_id, user_id))
    if note is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=NOTE_NOT_FOUND,
        )
    return note


def _ensure_owned_task(
    db: Session,
    task_id: uuid.UUID | None,
    user_id: uuid.UUID,
) -> None:
    if task_id is None:
        return
    task = db.scalar(
        select(Task.id).where(Task.id == task_id, Task.user_id == user_id)
    )
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=TASK_NOT_FOUND,
        )


def _ensure_owned_time_block(
    db: Session,
    time_block_id: uuid.UUID | None,
    user_id: uuid.UUID,
) -> None:
    if time_block_id is None:
        return
    block = db.scalar(
        select(TimeBlock.id).where(
            TimeBlock.id == time_block_id,
            TimeBlock.user_id == user_id,
        )
    )
    if block is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=TIME_BLOCK_NOT_FOUND,
        )


def list_owned_notes(db: Session, user_id: uuid.UUID) -> list[Note]:
    statement = (
        select(Note)
        .where(Note.user_id == user_id)
        .order_by(Note.updated_at.desc(), Note.id)
    )
    return list(db.scalars(statement).all())


def create_owned_note(
    db: Session,
    user_id: uuid.UUID,
    payload: NoteCreate,
) -> Note:
    _ensure_owned_task(db, payload.task_id, user_id)
    _ensure_owned_time_block(db, payload.time_block_id, user_id)
    note = Note(
        user_id=user_id,
        **payload.model_dump(by_alias=False),
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def update_owned_note(
    db: Session,
    note_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: NoteUpdate,
) -> Note:
    note = get_owned_note(db, note_id, user_id)
    changes = payload.model_dump(exclude_unset=True, by_alias=False)
    if "task_id" in changes:
        _ensure_owned_task(db, changes["task_id"], user_id)
    if "time_block_id" in changes:
        _ensure_owned_time_block(db, changes["time_block_id"], user_id)
    for field, value in changes.items():
        setattr(note, field, value)
    db.commit()
    db.refresh(note)
    return note


def delete_owned_note(db: Session, note_id: uuid.UUID, user_id: uuid.UUID) -> None:
    note = get_owned_note(db, note_id, user_id)
    db.delete(note)
    db.commit()
