from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import Settings
from app.models.user import User
from app.schemas.ai import AiPlanRequest, AiPlanResponse
from app.services.ai.context import build_day_context, system_prompt, user_prompt
from app.services.ai.credentials import load_configured_key
from app.services.ai.providers import complete_plan

PROMPT_TOO_LONG = "The prompt is too long."


def create_plan(
    db: Session,
    user: User,
    payload: AiPlanRequest,
    settings: Settings,
) -> AiPlanResponse:
    if len(payload.prompt) > settings.ai_prompt_max_length:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=PROMPT_TOO_LONG,
        )
    stored, api_key = load_configured_key(db, user, settings)
    context = build_day_context(db, user)
    try:
        return complete_plan(
            provider=stored.provider,
            api_key=api_key,
            model=stored.model,
            system_prompt=system_prompt(user),
            user_prompt=user_prompt(payload.prompt, context),
            settings=settings,
        )
    finally:
        api_key = ""
        del api_key
