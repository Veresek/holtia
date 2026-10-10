"""Issue and consume one-time emailed codes.

The service never talks to SMTP: handing the raw code to a sender belongs to
the caller, and a code is returned exactly once and stored only as a digest.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import Select, delete, select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models.email_code import EmailCode

MAX_CODE_ATTEMPTS = 5


def hash_email_code(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def issue_code(
    db: Session,
    settings: Settings,
    *,
    user_id: uuid.UUID,
    purpose: str,
) -> str | None:
    """Replace the pair's live code with a fresh one, or refuse inside the
    cooldown window and return None.

    One row per pair is enforced by uq_email_codes_user_purpose, so two
    overlapping sends on Postgres leave the loser an IntegrityError from the
    commit below; the caller treats that as a send that did not happen.
    """
    now = datetime.now(UTC)
    latest = db.scalar(
        select(EmailCode)
        .where(EmailCode.user_id == user_id, EmailCode.purpose == purpose)
        .order_by(EmailCode.created_at.desc())
        .limit(1)
    )
    if latest is not None and settings.email_code_cooldown_seconds > 0:
        age = (now - _as_utc(latest.created_at)).total_seconds()
        if age < settings.email_code_cooldown_seconds:
            return None

    code = f"{secrets.randbelow(1_000_000):06d}"
    db.execute(
        delete(EmailCode).where(
            EmailCode.user_id == user_id,
            EmailCode.purpose == purpose,
        )
    )
    db.add(
        EmailCode(
            user_id=user_id,
            purpose=purpose,
            code_hash=hash_email_code(code),
            expires_at=now + timedelta(minutes=settings.email_code_ttl_minutes),
        )
    )
    db.commit()
    return code


def _live_code_stmt(
    user_id: uuid.UUID,
    purpose: str,
    now: datetime,
) -> Select[tuple[EmailCode]]:
    """The pair's live row, locked for the duration of the claim.

    Postgres takes the row lock; SQLite parses FOR UPDATE and ignores it.
    """
    return (
        select(EmailCode)
        .where(
            EmailCode.user_id == user_id,
            EmailCode.purpose == purpose,
            EmailCode.consumed_at.is_(None),
            EmailCode.expires_at > now,
        )
        .with_for_update()
    )


def consume_code(
    db: Session,
    settings: Settings,
    *,
    user_id: uuid.UUID,
    purpose: str,
    code: str,
) -> bool:
    """Claim the pair's live code. True only for the first correct entry.

    The caller owns the transaction: failures must be committed too, or the
    attempt counter resets and the burn limit is unreachable. `settings` is
    unused here and kept for the call sites' shape.
    """
    now = datetime.now(UTC)
    row = db.scalar(_live_code_stmt(user_id, purpose, now))
    if row is None:
        return False

    if not secrets.compare_digest(row.code_hash, hash_email_code(code)):
        row.attempts += 1
        if row.attempts >= MAX_CODE_ATTEMPTS:
            row.consumed_at = now
        db.flush()
        return False

    row.consumed_at = now
    db.flush()
    return True


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
