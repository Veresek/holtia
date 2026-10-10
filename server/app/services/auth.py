import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, Response, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.services.email import send_code_email
from app.services.email_codes import consume_code, issue_code
from app.services.passwords import (
    DUMMY_PASSWORD_HASH,
    hash_password,
    password_problem,
    verify_password,
)
from app.services.tokens import (
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    REFRESH_MAX_AGE,
    create_access_token,
    hash_refresh_token,
    new_refresh_token,
)
from app.timezones import resolve_timezone

logger = logging.getLogger(__name__)

INVALID_CREDENTIALS = "Invalid email or password."
NOT_AUTHENTICATED = "Not authenticated."
UNVERIFIED = "Verify your account with the code sent to your email."
VERIFY_FAILED = "Verification failed. Check the code and try again."
RESET_FAILED = "Reset failed. Check the code and try again."
REFRESH_REUSE_GRACE = timedelta(seconds=15)
VERIFICATION_UNAVAILABLE = (
    "Account cannot be verified. Sign in or check the details."
)


@dataclass(frozen=True)
class SessionTokens:
    access_token: str
    refresh_token: str


@dataclass(frozen=True)
class PendingEmail:
    """A code that is committed and still has to be delivered.

    The request path hands one back instead of opening an SMTP conversation, so
    no response can be timed against a code send; the router schedules
    `deliver_code` once the response is out.
    """

    to: str
    code: str
    purpose: str


def normalize_email(email: str) -> str:
    return email.strip().lower()


def set_session_cookies(
    response: Response,
    tokens: SessionTokens,
    settings: Settings,
) -> None:
    secure = settings.client_origin.startswith("https")
    response.set_cookie(
        key=ACCESS_COOKIE,
        value=tokens.access_token,
        max_age=settings.access_token_minutes * 60,
        httponly=True,
        samesite="lax",
        secure=secure,
        path="/",
    )
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=tokens.refresh_token,
        max_age=REFRESH_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=secure,
        path="/",
    )


def clear_session_cookies(response: Response, settings: Settings) -> None:
    secure = settings.client_origin.startswith("https")
    for name in (ACCESS_COOKIE, REFRESH_COOKIE):
        response.delete_cookie(
            key=name,
            path="/",
            samesite="lax",
            secure=secure,
        )


def issue_session(db: Session, settings: Settings, user: User) -> SessionTokens:
    raw = new_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(raw),
            session_version=user.session_version,
        )
    )
    db.flush()
    access = create_access_token(
        user.id,
        settings.secret_key,
        session_version=user.session_version,
        ttl_minutes=settings.access_token_minutes,
    )
    return SessionTokens(access_token=access, refresh_token=raw)


def _revoke_chain(db: Session, token: RefreshToken) -> None:
    now = datetime.now(UTC)
    current: RefreshToken | None = token
    seen: set[uuid.UUID] = set()
    while current is not None and current.id not in seen:
        seen.add(current.id)
        if current.revoked_at is None:
            current.revoked_at = now
        if current.replaced_by_id is None:
            break
        current = db.get(RefreshToken, current.replaced_by_id)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _within_reuse_grace(token: RefreshToken) -> bool:
    if token.revoked_at is None or token.replaced_by_id is None:
        return False
    age = datetime.now(UTC) - _as_utc(token.revoked_at)
    return age <= REFRESH_REUSE_GRACE


def _live_family_token(db: Session, token: RefreshToken) -> RefreshToken | None:
    current: RefreshToken | None = token
    seen: set[uuid.UUID] = set()
    while current is not None and current.id not in seen:
        seen.add(current.id)
        if current.revoked_at is None:
            return current
        if current.replaced_by_id is None:
            return None
        current = db.get(RefreshToken, current.replaced_by_id)
    return None


def _opaque_unverified_user(email: str, timezone: str) -> User:
    return User(
        id=uuid.uuid4(),
        email=email,
        password_hash="",
        verified_at=None,
        timezone=timezone,
        created_at=datetime.now(UTC),
    )


def _rotate_refresh(
    db: Session,
    settings: Settings,
    current: RefreshToken,
    user: User,
) -> SessionTokens:
    raw = new_refresh_token()
    replacement = RefreshToken(
        user_id=user.id,
        token_hash=hash_refresh_token(raw),
        session_version=user.session_version,
    )
    db.add(replacement)
    db.flush()
    current.revoked_at = datetime.now(UTC)
    current.replaced_by_id = replacement.id
    db.commit()
    return SessionTokens(
        access_token=create_access_token(
            user.id,
            settings.secret_key,
            session_version=user.session_version,
            ttl_minutes=settings.access_token_minutes,
        ),
        refresh_token=raw,
    )


def _revoke_all_for_user(db: Session, user_id: uuid.UUID) -> None:
    db.execute(
        update(RefreshToken)
        .where(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=datetime.now(UTC))
    )


def require_strong_password(password: str) -> None:
    problem = password_problem(password)
    if problem:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=problem,
        )


def send_code(
    db: Session,
    settings: Settings,
    email: str,
    purpose: str,
) -> PendingEmail | None:
    """Commit a one-time code for this address and return what is left to send.

    Nothing is delivered here. An SMTP conversation inside the request made an
    existing account measurably slower than an unknown address, so the router
    runs `deliver_code` as a background task instead (ledger Ruling 7).

    Unknown emails and a suppressed issue both return None, the same
    nothing-to-send answer, because the endpoint may not reveal that an account
    exists. A racing double-issue loses on the unique pair row and counts as no
    send; the winner's email is already on its way.

    This function never raises: any failure at all — a lagged migration or a
    database error — is absorbed here and looks to the caller like a no-send, so
    no caller can turn it into an existence oracle. Call it after your own
    commit; it owns the rollback and the commit of its own work.
    """
    try:
        user = db.scalar(select(User).where(User.email == normalize_email(email)))
        if user is None:
            return None
        code = issue_code(db, settings, user_id=user.id, purpose=purpose)
        if code is None:
            return None
        return PendingEmail(to=user.email, code=code, purpose=purpose)
    except Exception as exc:
        db.rollback()
        logger.warning(
            "Email code issue failed for %s purpose=%s (%s)",
            email,
            purpose,
            type(exc).__name__,
        )
        return None


def deliver_code(settings: Settings, pending: PendingEmail | None) -> None:
    """Hand a committed code to SMTP, after the response has gone out.

    The never-raise contract moved here with the sender: nothing is listening to
    a background task, and a traceback escaping would be logged with the code
    inside it. The user recovers through “Resend code” once the cooldown
    passes.
    """
    if pending is None:
        return
    try:
        send_code_email(
            settings,
            to=pending.to,
            code=pending.code,
            purpose=pending.purpose,
        )
    except Exception as exc:
        logger.warning(
            "Email send failed for %s purpose=%s (%s)",
            pending.to,
            pending.purpose,
            type(exc).__name__,
        )


def register(
    db: Session,
    settings: Settings,
    email: str,
    password: str,
    timezone: str | None = None,
) -> tuple[User, SessionTokens | None, PendingEmail | None]:
    """Create the account, plus the session and the delivery the caller owes.

    The verify code is issued after the user is committed and returned rather
    than sent, so the response never waits on SMTP. Both duplicate paths burn a
    bcrypt hash and answer with an unverified look-alike user, so a duplicate
    signup looks like a fresh one.
    """
    require_strong_password(password)
    email = normalize_email(email)
    timezone = resolve_timezone(timezone, settings.timezone)
    existing = db.scalar(select(User).where(User.email == email))
    if existing is not None:
        hash_password(password)
        return _opaque_unverified_user(email, timezone), None, None

    verified_at = datetime.now(UTC) if not settings.smtp_configured else None
    user = User(
        email=email,
        password_hash=hash_password(password),
        verified_at=verified_at,
        timezone=timezone,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        hash_password(password)
        return _opaque_unverified_user(email, timezone), None, None

    tokens = issue_session(db, settings, user) if verified_at is not None else None
    db.commit()
    db.refresh(user)
    pending = (
        send_code(db, settings, email, "verify") if verified_at is None else None
    )
    return user, tokens, pending


def login(
    db: Session,
    settings: Settings,
    email: str,
    password: str,
) -> tuple[User, SessionTokens]:
    email = normalize_email(email)
    user = db.scalar(select(User).where(User.email == email))
    password_hash = user.password_hash if user is not None else DUMMY_PASSWORD_HASH
    if user is None or not verify_password(password, password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=INVALID_CREDENTIALS,
        )
    if user.verified_at is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=UNVERIFIED,
        )
    tokens = issue_session(db, settings, user)
    db.commit()
    return user, tokens


def refresh(
    db: Session,
    settings: Settings,
    raw_refresh: str | None,
) -> SessionTokens:
    if not raw_refresh:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=NOT_AUTHENTICATED,
        )

    row = db.scalar(
        select(RefreshToken)
        .where(RefreshToken.token_hash == hash_refresh_token(raw_refresh))
        .with_for_update()
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=NOT_AUTHENTICATED,
        )
    if row.revoked_at is not None:
        if _within_reuse_grace(row):
            live = _live_family_token(db, row)
            if live is not None:
                row = live
            else:
                _revoke_chain(db, row)
                db.commit()
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=NOT_AUTHENTICATED,
                )
        else:
            _revoke_chain(db, row)
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=NOT_AUTHENTICATED,
            )

    user = db.get(User, row.user_id)
    if (
        user is None
        or user.verified_at is None
        or row.session_version != user.session_version
    ):
        _revoke_chain(db, row)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=NOT_AUTHENTICATED,
        )

    return _rotate_refresh(db, settings, row, user)


def logout(db: Session, raw_refresh: str | None) -> None:
    if not raw_refresh:
        return
    row = db.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == hash_refresh_token(raw_refresh)
        )
    )
    if row is not None and row.revoked_at is None:
        row.revoked_at = datetime.now(UTC)
        db.commit()


def _verify_without_code(
    db: Session,
    settings: Settings,
    email: str,
) -> tuple[User, SessionTokens]:
    """Local development with no mail server: nothing can be emailed, so the
    account is opened on request. No code row is read, written or consumed."""
    user_id = db.scalar(
        update(User)
        .where(User.email == email, User.verified_at.is_(None))
        .values(verified_at=datetime.now(UTC))
        .returning(User.id)
    )
    if user_id is None:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=VERIFICATION_UNAVAILABLE,
        )
    user = db.get(User, user_id)
    if user is None:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=VERIFICATION_UNAVAILABLE,
        )
    tokens = issue_session(db, settings, user)
    db.commit()
    db.refresh(user)
    return user, tokens


def verify(
    db: Session,
    settings: Settings,
    email: str,
    code: str,
) -> tuple[User, SessionTokens]:
    email = normalize_email(email)
    if not settings.smtp_configured:
        return _verify_without_code(db, settings, email)

    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        # Same shape as `login`'s dummy hash: an unknown address still runs a
        # full consume and a commit, so its response is not the cheap one. The
        # id is random, so the consume finds no row and writes nothing.
        consume_code(db, settings, user_id=uuid.uuid4(), purpose="verify", code=code)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=VERIFY_FAILED,
        )
    if user.verified_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=VERIFY_FAILED,
        )
    if not consume_code(db, settings, user_id=user.id, purpose="verify", code=code):
        # The failed attempt belongs to the row, not to this request: rolling
        # back would put the counter back to zero and lift the attempt cap.
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=VERIFY_FAILED,
        )

    user.verified_at = datetime.now(UTC)
    tokens = issue_session(db, settings, user)
    db.commit()
    db.refresh(user)
    return user, tokens


def reset_password(
    db: Session,
    settings: Settings,
    email: str,
    code: str,
    new_password: str,
) -> None:
    require_strong_password(new_password)
    password_hash = hash_password(new_password)
    user = db.scalar(
        select(User)
        .where(User.email == normalize_email(email))
        .with_for_update()
    )
    if user is None:
        # Verify's dummy burn, mirrored here: the row lock, a consume that can
        # only miss and the commit all happen for an unknown address too.
        consume_code(db, settings, user_id=uuid.uuid4(), purpose="reset", code=code)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=RESET_FAILED,
        )
    if settings.smtp_configured and not consume_code(
        db,
        settings,
        user_id=user.id,
        purpose="reset",
        code=code,
    ):
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=RESET_FAILED,
        )

    user.password_hash = password_hash
    user.session_version += 1
    _revoke_all_for_user(db, user.id)
    db.commit()
