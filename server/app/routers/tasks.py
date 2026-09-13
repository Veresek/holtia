import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.task import TaskCreate, TaskRead, TaskUpdate
from app.services.tasks import (
    create_owned_task,
    delete_owned_task,
    get_owned_task,
    list_owned_tasks,
    update_owned_task,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskRead])
def list_tasks(
    date_filter: Annotated[str | None, Query(alias="date")] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TaskRead]:
    if date_filter == "undated":
        return list_owned_tasks(db, user.id, undated=True)
    task_date = None
    if date_filter is not None:
        try:
            task_date = date.fromisoformat(date_filter)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Date must be YYYY-MM-DD or 'undated'.",
            ) from None
    return list_owned_tasks(db, user.id, task_date)


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TaskRead:
    return create_owned_task(db, user.id, payload, user.timezone)


@router.get("/{task_id}", response_model=TaskRead)
def get_task(
    task_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TaskRead:
    return get_owned_task(db, task_id, user.id)


@router.patch("/{task_id}", response_model=TaskRead)
def update_task(
    task_id: uuid.UUID,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TaskRead:
    return update_owned_task(db, task_id, user.id, payload, user.timezone)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    delete_owned_task(db, task_id, user.id)
