import uuid
from datetime import date as DateType
from datetime import datetime

from pydantic import Field, field_validator

from app.schemas.base import (
    TITLE_MAX_LENGTH,
    ApiModel,
    ApiReadModel,
    normalize_optional_title,
    normalize_required_title,
)

MARKDOWN_MAX_LENGTH = 100_000


class NoteCreate(ApiModel):
    title: str = Field(min_length=1, max_length=TITLE_MAX_LENGTH)
    markdown: str = Field(default="", max_length=MARKDOWN_MAX_LENGTH)
    date: DateType | None = None
    task_id: uuid.UUID | None = None
    time_block_id: uuid.UUID | None = None

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        return normalize_required_title(value)


class NoteUpdate(ApiModel):
    title: str | None = None
    markdown: str | None = None
    date: DateType | None = None
    task_id: uuid.UUID | None = None
    time_block_id: uuid.UUID | None = None

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str | None) -> str:
        return normalize_optional_title(value)

    @field_validator("markdown")
    @classmethod
    def validate_markdown(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("Markdown cannot be null.")
        if len(value) > MARKDOWN_MAX_LENGTH:
            raise ValueError(
                f"Markdown cannot exceed {MARKDOWN_MAX_LENGTH} characters."
            )
        return value


class NoteRead(ApiReadModel):
    id: uuid.UUID
    title: str
    markdown: str
    date: DateType | None
    task_id: uuid.UUID | None
    time_block_id: uuid.UUID | None
    updated_at: datetime
