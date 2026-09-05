import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.ai import (
    AiKeyCreate,
    AiKeyUpdate,
    AiPlanRequest,
    AiPlanResponse,
    AiSettingsRead,
)
from app.services.ai.credentials import (
    activate_key,
    create_key,
    delete_key,
    list_keys,
    public_settings,
    update_key,
)
from app.services.ai.planner import create_plan
from app.services.rate_limits import enforce_ai_rate_limit

router = APIRouter(prefix="/ai", tags=["ai"])


@router.get("/settings", response_model=AiSettingsRead)
def get_ai_settings(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AiSettingsRead:
    return public_settings(settings, list_keys(db, user))


@router.post("/keys", response_model=AiSettingsRead, status_code=status.HTTP_201_CREATED)
def post_ai_key(
    payload: AiKeyCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AiSettingsRead:
    return public_settings(settings, create_key(db, user, payload, settings))


@router.patch("/keys/{key_id}", response_model=AiSettingsRead)
def patch_ai_key(
    key_id: uuid.UUID,
    payload: AiKeyUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AiSettingsRead:
    return public_settings(settings, update_key(db, user, key_id, payload, settings))


@router.delete("/keys/{key_id}", response_model=AiSettingsRead)
def remove_ai_key(
    key_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AiSettingsRead:
    return public_settings(settings, delete_key(db, user, key_id, settings))


@router.put("/keys/{key_id}/active", response_model=AiSettingsRead)
def put_active_ai_key(
    key_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AiSettingsRead:
    return public_settings(settings, activate_key(db, user, key_id, settings))


@router.post("/plan", response_model=AiPlanResponse)
def post_ai_plan(
    payload: AiPlanRequest,
    _: None = Depends(enforce_ai_rate_limit),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AiPlanResponse:
    return create_plan(db, user, payload, settings)
