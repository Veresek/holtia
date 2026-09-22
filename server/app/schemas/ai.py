import uuid
from datetime import date as DateType
from datetime import time as TimeType
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator

from app.models.user_ai_settings import AiProvider
from app.schemas.base import (
    DESCRIPTION_MAX_LENGTH,
    TITLE_MAX_LENGTH,
    ApiModel,
    ApiReadModel,
    normalize_description,
    normalize_required_title,
)
from app.schemas.note import MARKDOWN_MAX_LENGTH

PROMPT_HARD_MAX = 8_000


class AiModelOption(ApiModel):
    id: str
    label: str


class AiKeyRead(ApiReadModel):
    id: uuid.UUID
    provider: AiProvider
    model: str
    key_hint: str


class AiSettingsRead(ApiModel):
    enabled: bool
    configured: bool
    provider: AiProvider | None = None
    model: str | None = None
    key_hint: str | None = None
    active_key_id: uuid.UUID | None = None
    keys: list[AiKeyRead] = Field(default_factory=list)
    models: dict[AiProvider, list[AiModelOption]]


def _normalize_api_key(value: str) -> str:
    key = value.strip()
    if len(key) < 20:
        raise ValueError("API key is too short.")
    if any(character in key for character in "\r\n"):
        raise ValueError("API key cannot contain line breaks.")
    return key


def _normalize_model(value: str) -> str:
    model = value.strip()
    if not model:
        raise ValueError("Model cannot be empty.")
    return model


class AiKeyCreate(ApiModel):
    provider: AiProvider
    model: str = Field(min_length=1, max_length=128)
    api_key: str = Field(min_length=20, max_length=4_096)

    @field_validator("api_key")
    @classmethod
    def normalize_api_key(cls, value: str) -> str:
        return _normalize_api_key(value)

    @field_validator("model")
    @classmethod
    def normalize_model(cls, value: str) -> str:
        return _normalize_model(value)


class AiKeyUpdate(ApiModel):
    provider: AiProvider | None = None
    model: str | None = Field(default=None, min_length=1, max_length=128)
    api_key: str | None = Field(default=None, min_length=20, max_length=4_096)

    @field_validator("api_key")
    @classmethod
    def normalize_api_key(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _normalize_api_key(value)

    @field_validator("model")
    @classmethod
    def normalize_model(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _normalize_model(value)

    @model_validator(mode="after")
    def require_a_change(self) -> "AiKeyUpdate":
        if self.provider is None and self.model is None and self.api_key is None:
            raise ValueError("Provide a provider, model, or API key to update.")
        return self


class AiTaskProposal(ApiModel):
    kind: Literal["task"] = "task"
    title: str = Field(min_length=1, max_length=TITLE_MAX_LENGTH)
    description: str = Field(default="", max_length=DESCRIPTION_MAX_LENGTH)
    date: DateType | None = None
    priority: Literal["high", "medium", "low"] = "medium"

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        return normalize_required_title(value)

    @field_validator("description")
    @classmethod
    def normalize_description_field(cls, value: str) -> str:
        return normalize_description(value)


class AiNoteProposal(ApiModel):
    kind: Literal["note"] = "note"
    title: str = Field(min_length=1, max_length=TITLE_MAX_LENGTH)
    markdown: str = Field(default="", max_length=MARKDOWN_MAX_LENGTH)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        return normalize_required_title(value)


class AiBlockProposal(ApiModel):
    kind: Literal["block"] = "block"
    title: str = Field(min_length=1, max_length=TITLE_MAX_LENGTH)
    description: str = Field(default="", max_length=DESCRIPTION_MAX_LENGTH)
    date: DateType
    start: TimeType
    end: TimeType

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        return normalize_required_title(value)

    @field_validator("description")
    @classmethod
    def normalize_description_field(cls, value: str) -> str:
        return normalize_description(value)


AiProposal = Annotated[
    AiTaskProposal | AiNoteProposal | AiBlockProposal,
    Field(discriminator="kind"),
]


class AiPlanRequest(ApiModel):
    prompt: str = Field(min_length=1, max_length=PROMPT_HARD_MAX)

    @field_validator("prompt")
    @classmethod
    def normalize_prompt(cls, value: str) -> str:
        prompt = value.strip()
        if not prompt:
            raise ValueError("Prompt cannot be empty.")
        return prompt


class AiPlanResponse(ApiModel):
    reply: str
    items: list[AiProposal]
