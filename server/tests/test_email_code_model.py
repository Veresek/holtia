from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import Base, engine
from app.models.email_code import EmailCode
from app.models.user import User
from app.services.passwords import hash_password

TTL = datetime(2026, 10, 10, 12, 0, tzinfo=UTC) + timedelta(minutes=15)


@pytest.fixture
def db() -> Iterator[Session]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with Session(engine) as session:
        yield session


def add_user(db: Session) -> User:
    user = User(
        email="ada@example.com",
        password_hash=hash_password("password1"),
    )
    db.add(user)
    db.flush()
    return user


def test_email_code_round_trip_and_defaults(db: Session) -> None:
    user = add_user(db)
    db.add(
        EmailCode(
            user_id=user.id,
            purpose="verify",
            code_hash="a" * 64,
            expires_at=TTL,
        )
    )
    db.commit()

    row = db.scalar(
        select(EmailCode).where(
            EmailCode.user_id == user.id,
            EmailCode.purpose == "verify",
        )
    )
    assert row is not None
    assert row.id is not None
    assert row.code_hash == "a" * 64
    assert row.attempts == 0
    assert row.consumed_at is None
    assert row.expires_at is not None
    assert row.created_at is not None

    db.refresh(user)
    assert [code.purpose for code in user.email_codes] == ["verify"]


def test_deleting_the_user_cascades_to_codes(db: Session) -> None:
    user = add_user(db)
    db.add_all(
        [
            EmailCode(
                user_id=user.id,
                purpose="verify",
                code_hash="a" * 64,
                expires_at=TTL,
            ),
            EmailCode(
                user_id=user.id,
                purpose="reset",
                code_hash="b" * 64,
                expires_at=TTL,
            ),
        ]
    )
    db.commit()
    assert db.scalar(select(func.count()).select_from(EmailCode)) == 2

    db.delete(user)
    db.commit()

    assert db.scalar(select(func.count()).select_from(EmailCode)) == 0
