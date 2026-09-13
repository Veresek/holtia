from sqlalchemy.orm import Session

from app.models.user import User
from app.timezones import parse_timezone


def update_me(db: Session, user: User, timezone: str) -> User:
    user.timezone = parse_timezone(timezone)
    db.commit()
    db.refresh(user)
    return user


def delete_me(db: Session, user: User) -> None:
    db.delete(user)
    db.commit()
