from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.user import UserRead, UserUpdate
from app.services.auth import clear_session_cookies
from app.services.users import delete_me as delete_current_user

router = APIRouter(prefix="/users", tags=["users"])


def not_implemented() -> None:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Changing email is not available yet.",
    )


@router.get("/me", response_model=UserRead)
def get_me(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("/me", response_model=UserRead)
def update_me(
    _: UserUpdate,
    user: User = Depends(get_current_user),
) -> UserRead:
    del user
    not_implemented()


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> None:
    delete_current_user(db, user)
    clear_session_cookies(response, settings)
