import uuid

from sqlalchemy import Select, func, literal, select
from sqlalchemy.orm import Session

from app.models.note import Note
from app.models.task import Task
from app.models.time_block import TimeBlock
from app.schemas.state import AppStateRead, CollectionFingerprint


def _pinned_count(model: type[Task] | type[Note] | type[TimeBlock]):
    # Foreign keys clear with ON DELETE SET NULL, which does not touch
    # updated_at. Counting the pins is what makes that visible to /state.
    if model is Task:
        return func.count(Task.time_block_id)
    if model is Note:
        return func.count(Note.time_block_id) + func.count(Note.task_id)
    return literal(0)


def _fingerprint(
    db: Session,
    model: type[Task] | type[Note] | type[TimeBlock],
    user_id: uuid.UUID,
) -> CollectionFingerprint:
    statement: Select = select(
        func.count(model.id),
        func.max(model.updated_at),
        _pinned_count(model),
    ).where(model.user_id == user_id)
    count, updated_at, pinned = db.execute(statement).one()
    return CollectionFingerprint(count=count, updated_at=updated_at, pinned=pinned)


def read_app_state(db: Session, user_id: uuid.UUID) -> AppStateRead:
    return AppStateRead(
        tasks=_fingerprint(db, Task, user_id),
        notes=_fingerprint(db, Note, user_id),
        blocks=_fingerprint(db, TimeBlock, user_id),
    )
