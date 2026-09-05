import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models.user import User
from app.models.user_ai_settings import UserAiSettings
from app.schemas.ai import AiKeyCreate, AiKeyRead, AiKeyUpdate, AiSettingsRead
from app.services.ai.catalog import is_supported_model, models_catalog
from app.services.ai.crypto import (
    DECRYPT_ERROR,
    decrypt_api_key,
    encrypt_api_key,
    key_hint,
    parse_encryption_key,
)

AI_DISABLED = "The AI assistant is not enabled on this instance."
UNKNOWN_MODEL = "That model is not available for the selected provider."
KEY_NOT_CONFIGURED = "Set an API key on Account before using the assistant."
KEY_NOT_FOUND = "API key not found."
TOO_MANY_KEYS = "You can save at most 10 API keys."
MAX_KEYS = 10


def require_ai_enabled(settings: Settings) -> None:
    if not settings.ai_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=AI_DISABLED)


def _key_read(stored: UserAiSettings) -> AiKeyRead:
    return AiKeyRead.model_validate(stored)


def public_settings(
    settings: Settings,
    keys: list[UserAiSettings],
) -> AiSettingsRead:
    catalog = models_catalog()
    if not settings.ai_enabled:
        return AiSettingsRead(
            enabled=False,
            configured=False,
            models=catalog,
        )
    active = next((key for key in keys if key.is_active), None)
    if active is None and keys:
        active = keys[0]
    return AiSettingsRead(
        enabled=True,
        configured=active is not None,
        provider=active.provider if active else None,
        model=active.model if active else None,
        key_hint=active.key_hint if active else None,
        active_key_id=active.id if active else None,
        keys=[_key_read(key) for key in keys],
        models=catalog,
    )


def list_keys(db: Session, user: User) -> list[UserAiSettings]:
    return list(
        db.scalars(
            select(UserAiSettings)
            .where(UserAiSettings.user_id == user.id)
            .order_by(UserAiSettings.created_at.desc(), UserAiSettings.id.desc())
        ).all()
    )


def get_owned_key(
    db: Session,
    user: User,
    key_id: uuid.UUID,
) -> UserAiSettings:
    stored = db.scalar(
        select(UserAiSettings).where(
            UserAiSettings.id == key_id,
            UserAiSettings.user_id == user.id,
        )
    )
    if stored is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=KEY_NOT_FOUND,
        )
    return stored


def get_active_key(db: Session, user: User) -> UserAiSettings | None:
    return db.scalar(
        select(UserAiSettings).where(
            UserAiSettings.user_id == user.id,
            UserAiSettings.is_active.is_(True),
        )
    )


def _deactivate_keys(db: Session, user: User) -> None:
    for stored in list_keys(db, user):
        if stored.is_active:
            stored.is_active = False


def _encrypt(api_key: str, settings: Settings) -> tuple[bytes, bytes, str]:
    ciphertext, nonce = encrypt_api_key(
        api_key,
        parse_encryption_key(settings.ai_encryption_key),
    )
    return ciphertext, nonce, key_hint(api_key)


def create_key(
    db: Session,
    user: User,
    payload: AiKeyCreate,
    settings: Settings,
) -> list[UserAiSettings]:
    require_ai_enabled(settings)
    if not is_supported_model(payload.provider, payload.model):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=UNKNOWN_MODEL,
        )
    existing = list_keys(db, user)
    if len(existing) >= MAX_KEYS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=TOO_MANY_KEYS,
        )
    ciphertext, nonce, hint = _encrypt(payload.api_key, settings)
    now = datetime.now(timezone.utc)
    _deactivate_keys(db, user)
    stored = UserAiSettings(
        user_id=user.id,
        provider=payload.provider,
        model=payload.model,
        key_ciphertext=ciphertext,
        key_nonce=nonce,
        key_hint=hint,
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    db.add(stored)
    db.commit()
    return list_keys(db, user)


def update_key(
    db: Session,
    user: User,
    key_id: uuid.UUID,
    payload: AiKeyUpdate,
    settings: Settings,
) -> list[UserAiSettings]:
    require_ai_enabled(settings)
    stored = get_owned_key(db, user, key_id)
    next_provider = payload.provider or stored.provider
    next_model = payload.model or stored.model
    if not is_supported_model(next_provider, next_model):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=UNKNOWN_MODEL,
        )
    stored.provider = next_provider
    stored.model = next_model
    if payload.api_key is not None:
        ciphertext, nonce, hint = _encrypt(payload.api_key, settings)
        stored.key_ciphertext = ciphertext
        stored.key_nonce = nonce
        stored.key_hint = hint
    stored.updated_at = datetime.now(timezone.utc)
    db.commit()
    return list_keys(db, user)


def delete_key(
    db: Session,
    user: User,
    key_id: uuid.UUID,
    settings: Settings,
) -> list[UserAiSettings]:
    require_ai_enabled(settings)
    stored = get_owned_key(db, user, key_id)
    was_active = stored.is_active
    db.delete(stored)
    db.flush()
    remaining = list_keys(db, user)
    if was_active and remaining:
        remaining[0].is_active = True
        remaining[0].updated_at = datetime.now(timezone.utc)
    db.commit()
    return list_keys(db, user)


def activate_key(
    db: Session,
    user: User,
    key_id: uuid.UUID,
    settings: Settings,
) -> list[UserAiSettings]:
    require_ai_enabled(settings)
    stored = get_owned_key(db, user, key_id)
    _deactivate_keys(db, user)
    stored.is_active = True
    stored.updated_at = datetime.now(timezone.utc)
    db.commit()
    return list_keys(db, user)


def load_configured_key(
    db: Session,
    user: User,
    settings: Settings,
) -> tuple[UserAiSettings, str]:
    require_ai_enabled(settings)
    stored = get_active_key(db, user)
    if stored is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=KEY_NOT_CONFIGURED,
        )
    try:
        api_key = decrypt_api_key(
            stored.key_ciphertext,
            stored.key_nonce,
            parse_encryption_key(settings.ai_encryption_key),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=DECRYPT_ERROR,
        ) from exc
    return stored, api_key
