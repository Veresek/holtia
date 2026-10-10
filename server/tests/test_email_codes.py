import re
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, update
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings
from app.db import Base, engine
from app.models.email_code import EmailCode
from app.models.user import User
from app.services.email_codes import (
    MAX_CODE_ATTEMPTS,
    _live_code_stmt,
    consume_code,
    hash_email_code,
    issue_code,
)
from app.services.passwords import hash_password


@pytest.fixture
def db() -> Iterator[Session]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with Session(engine) as session:
        yield session


@pytest.fixture
def settings() -> Settings:
    return Settings(
        environment="test",
        database_url="sqlite+pysqlite:///:memory:",
        secret_key="x" * 32,
        smtp_host="smtp.test",
        smtp_user="u",
        smtp_password="p",
        mail_from="h@test",
        email_code_cooldown_seconds=0,
        email_code_ttl_minutes=15,
    )


@pytest.fixture
def user(db: Session) -> User:
    row = User(email="ada@example.com", password_hash=hash_password("password1"))
    db.add(row)
    db.commit()
    return row


def as_utc(value: datetime) -> datetime:
    """SQLite keeps no offset, so what comes back has to be read as UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def codes_for(db: Session, user_id: uuid.UUID, purpose: str) -> list[EmailCode]:
    return list(
        db.scalars(
            select(EmailCode).where(
                EmailCode.user_id == user_id,
                EmailCode.purpose == purpose,
            )
        )
    )


def wrong_code(code: str) -> str:
    """A six-digit value that is never the issued one."""
    return f"{(int(code) + 1) % 1_000_000:06d}"


def test_issue_returns_six_digit_code_and_stores_hash_only(
    db: Session,
    settings: Settings,
    user: User,
) -> None:
    code = issue_code(db, settings, user_id=user.id, purpose="verify")

    assert code is not None
    assert re.fullmatch(r"[0-9]{6}", code)

    rows = codes_for(db, user.id, "verify")
    assert len(rows) == 1
    row = rows[0]
    assert row.code_hash == hash_email_code(code)
    assert row.code_hash != code
    assert len(row.code_hash) == 64
    assert row.attempts == 0
    assert row.consumed_at is None
    ttl = as_utc(row.expires_at) - datetime.now(UTC)
    assert timedelta(minutes=14) < ttl <= timedelta(minutes=15)


def test_issue_replaces_previous_code(
    db: Session,
    settings: Settings,
    user: User,
) -> None:
    first = issue_code(db, settings, user_id=user.id, purpose="verify")
    second = issue_code(db, settings, user_id=user.id, purpose="verify")

    assert first is not None
    assert second is not None
    rows = codes_for(db, user.id, "verify")
    assert len(rows) == 1
    assert rows[0].code_hash == hash_email_code(second)

    # the pair is scoped: another purpose keeps its own row
    issued_elsewhere = issue_code(db, settings, user_id=user.id, purpose="reset")
    assert issued_elsewhere is not None
    assert len(codes_for(db, user.id, "verify")) == 1
    assert len(codes_for(db, user.id, "reset")) == 1


def test_duplicate_live_row_for_pair_is_rejected(
    db: Session,
    user: User,
) -> None:
    expires_at = datetime.now(UTC) + timedelta(minutes=15)
    db.add(
        EmailCode(
            user_id=user.id,
            purpose="verify",
            code_hash=hash_email_code("111111"),
            expires_at=expires_at,
        )
    )
    db.commit()

    with pytest.raises(IntegrityError):
        db.add(
            EmailCode(
                user_id=user.id,
                purpose="verify",
                code_hash=hash_email_code("222222"),
                expires_at=expires_at,
            )
        )
        db.commit()
    db.rollback()

    assert len(codes_for(db, user.id, "verify")) == 1


def test_consume_does_not_commit(
    db: Session,
    settings: Settings,
    user: User,
) -> None:
    code = issue_code(db, settings, user_id=user.id, purpose="verify")
    assert code is not None

    consumed = consume_code(
        db, settings, user_id=user.id, purpose="verify", code=code
    )
    assert consumed is True

    # the service flushes only; the caller owns the commit
    db.rollback()

    user_id = user.id
    with Session(engine) as fresh:
        row = fresh.scalar(
            select(EmailCode).where(
                EmailCode.user_id == user_id,
                EmailCode.purpose == "verify",
            )
        )
    assert row is not None
    assert row.consumed_at is None


def test_for_update_is_requested() -> None:
    stmt = _live_code_stmt(uuid.uuid4(), "verify", datetime.now(UTC))

    assert "FOR UPDATE" in str(stmt.compile())
    assert "FOR UPDATE" in str(stmt.compile(dialect=postgresql.dialect()))


def test_cooldown_suppresses_issue(
    db: Session,
    settings: Settings,
    user: User,
) -> None:
    throttled = settings.model_copy(update={"email_code_cooldown_seconds": 60})
    first = issue_code(db, throttled, user_id=user.id, purpose="verify")
    assert first is not None

    second = issue_code(db, throttled, user_id=user.id, purpose="verify")

    assert second is None
    rows = codes_for(db, user.id, "verify")
    assert len(rows) == 1
    assert rows[0].code_hash == hash_email_code(first)
    assert rows[0].consumed_at is None

    db.execute(
        update(EmailCode)
        .where(EmailCode.user_id == user.id, EmailCode.purpose == "verify")
        .values(created_at=datetime.now(UTC) - timedelta(seconds=90))
    )
    db.commit()

    third = issue_code(db, throttled, user_id=user.id, purpose="verify")
    assert third is not None
    assert len(codes_for(db, user.id, "verify")) == 1


def test_consume_is_single_shot(
    db: Session,
    settings: Settings,
    user: User,
) -> None:
    code = issue_code(db, settings, user_id=user.id, purpose="verify")
    assert code is not None

    consumed = consume_code(
        db, settings, user_id=user.id, purpose="verify", code=code
    )
    db.commit()
    assert consumed is True

    replayed = consume_code(
        db, settings, user_id=user.id, purpose="verify", code=code
    )
    db.commit()
    assert replayed is False

    # A claimed code leaves no row behind: the pair is empty, so the next
    # resend starts from a clean attempt budget.
    assert codes_for(db, user.id, "verify") == []


def test_successful_consume_deletes_the_row(
    db: Session,
    settings: Settings,
    user: User,
) -> None:
    code = issue_code(db, settings, user_id=user.id, purpose="verify")
    assert code is not None

    assert (
        consume_code(db, settings, user_id=user.id, purpose="verify", code=code)
        is True
    )
    db.commit()

    assert codes_for(db, user.id, "verify") == []
    with Session(engine) as fresh:
        assert (
            fresh.scalar(
                select(EmailCode).where(
                    EmailCode.user_id == user.id, EmailCode.purpose == "verify"
                )
            )
            is None
        )


def test_resend_carries_the_attempt_budget(
    db: Session,
    settings: Settings,
    user: User,
) -> None:
    """The 5-try cap is per pair, not per message (ledger Ruling 8): an
    unsuccessful resend replaces the code but keeps what has been spent."""
    code = issue_code(db, settings, user_id=user.id, purpose="verify")
    assert code is not None

    for _ in range(4):
        assert (
            consume_code(
                db, settings, user_id=user.id, purpose="verify", code=wrong_code(code)
            )
            is False
        )
        db.commit()

    resent = issue_code(db, settings, user_id=user.id, purpose="verify")
    assert resent is not None
    rows = codes_for(db, user.id, "verify")
    assert len(rows) == 1
    assert rows[0].attempts == 4
    assert rows[0].consumed_at is None

    # One wrong guess reaches the cap on the replacement row.
    assert (
        consume_code(
            db,
            settings,
            user_id=user.id,
            purpose="verify",
            code=wrong_code(resent),
        )
        is False
    )
    db.commit()
    row = codes_for(db, user.id, "verify")[0]
    assert row.attempts == MAX_CODE_ATTEMPTS
    assert row.consumed_at is not None
    assert (
        consume_code(db, settings, user_id=user.id, purpose="verify", code=resent)
        is False
    )


def test_budget_is_fresh_after_a_successful_consume(
    db: Session,
    settings: Settings,
    user: User,
) -> None:
    code = issue_code(db, settings, user_id=user.id, purpose="verify")
    assert code is not None
    for _ in range(3):
        assert (
            consume_code(
                db, settings, user_id=user.id, purpose="verify", code=wrong_code(code)
            )
            is False
        )
        db.commit()

    assert (
        consume_code(db, settings, user_id=user.id, purpose="verify", code=code) is True
    )
    db.commit()

    resent = issue_code(db, settings, user_id=user.id, purpose="verify")
    assert resent is not None
    rows = codes_for(db, user.id, "verify")
    assert len(rows) == 1
    assert rows[0].attempts == 0


def test_consume_rejects_expired(
    db: Session,
    settings: Settings,
    user: User,
) -> None:
    db.add(
        EmailCode(
            user_id=user.id,
            purpose="verify",
            code_hash=hash_email_code("123456"),
            expires_at=datetime.now(UTC) - timedelta(minutes=1),
        )
    )
    db.commit()

    rejected = consume_code(
        db, settings, user_id=user.id, purpose="verify", code="123456"
    )
    assert rejected is False

    row = codes_for(db, user.id, "verify")[0]
    assert row.consumed_at is None
    assert row.attempts == 0


def test_wrong_attempts_burn_code(
    db: Session,
    settings: Settings,
    user: User,
) -> None:
    assert MAX_CODE_ATTEMPTS == 5
    code = issue_code(db, settings, user_id=user.id, purpose="verify")
    assert code is not None
    wrong = wrong_code(code)

    for attempt in range(1, MAX_CODE_ATTEMPTS):
        rejected = consume_code(
            db, settings, user_id=user.id, purpose="verify", code=wrong
        )
        db.commit()
        assert rejected is False
        row = codes_for(db, user.id, "verify")[0]
        assert row.attempts == attempt
        assert row.consumed_at is None

    rejected = consume_code(
        db, settings, user_id=user.id, purpose="verify", code=wrong
    )
    db.commit()
    assert rejected is False
    row = codes_for(db, user.id, "verify")[0]
    assert row.attempts == MAX_CODE_ATTEMPTS
    assert row.consumed_at is not None

    burned = consume_code(db, settings, user_id=user.id, purpose="verify", code=code)
    assert burned is False


def test_consume_wrong_code_increments_attempts(
    db: Session,
    settings: Settings,
    user: User,
) -> None:
    code = issue_code(db, settings, user_id=user.id, purpose="verify")
    assert code is not None
    wrong = wrong_code(code)

    rejected = consume_code(
        db, settings, user_id=user.id, purpose="verify", code=wrong
    )
    db.commit()
    assert rejected is False

    row = codes_for(db, user.id, "verify")[0]
    assert row.attempts == 1
    assert row.consumed_at is None

    accepted = consume_code(db, settings, user_id=user.id, purpose="verify", code=code)
    assert accepted is True

