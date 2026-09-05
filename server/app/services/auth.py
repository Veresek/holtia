import secrets
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

INVALID_CREDENTIALS = "Invalid email or password."
NOT_AUTHENTICATED = "Not authenticated."
UNVERIFIED = "Verify your account with the instance code."
INVALID_INSTANCE_CODE = "Invalid instance code."
REFRESH_REUSE_GRACE = timedelta(seconds=15)
VERIFICATION_UNAVAILABLE = (
    "Account cannot be verified. Sign in or check the details."
)


@dataclass(frozen=True)
class SessionTokens:
    access_token: str
    refresh_token: str


def normalize_email(email: str) -> str:
    return email.strip().lower()


def instance_code_matches(settings: Settings, provided: str) -> bool:
    expected = settings.instance_code
    if expected == "":
        return True
    return secrets.compare_digest(
        hash_refresh_token(provided),
        hash_refresh_token(expected),
    )


def require_instance_code(settings: Settings, provided: str) -> None:
    if not instance_code_matches(settings, provided):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=INVALID_INSTANCE_CODE,
        )


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


def _opaque_unverified_user(email: str) -> User:
    return User(
        id=uuid.uuid4(),
        email=email,
        password_hash="",
        verified_at=None,
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


def register(
    db: Session,
    settings: Settings,
    email: str,
    password: str,
) -> tuple[User, SessionTokens | None]:
    require_strong_password(password)
    email = normalize_email(email)
    existing = db.scalar(select(User).where(User.email == email))
    if existing is not None:
        hash_password(password)
        return _opaque_unverified_user(email), None

    verified_at = datetime.now(UTC) if settings.instance_code == "" else None
    user = User(
        email=email,
        password_hash=hash_password(password),
        verified_at=verified_at,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        hash_password(password)
        return _opaque_unverified_user(email), None

    tokens = issue_session(db, settings, user) if verified_at is not None else None
    db.commit()
    db.refresh(user)
    return user, tokens


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


def verify(
    db: Session,
    settings: Settings,
    email: str,
    instance_code: str,
) -> tuple[User, SessionTokens]:
    require_instance_code(settings, instance_code)
    user_id = db.scalar(
        update(User)
        .where(
            User.email == normalize_email(email),
            User.verified_at.is_(None),
        )
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


def reset_password(
    db: Session,
    settings: Settings,
    email: str,
    instance_code: str,
    new_password: str,
) -> None:
    require_instance_code(settings, instance_code)
    require_strong_password(new_password)
    password_hash = hash_password(new_password)
    user = db.scalar(
        select(User)
        .where(User.email == normalize_email(email))
        .with_for_update()
    )
    if user is None:
        return
    user.password_hash = password_hash
    user.session_version += 1
    _revoke_all_for_user(db, user.id)
    db.commit()
