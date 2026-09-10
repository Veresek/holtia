import uuid
from datetime import date as DateType
from datetime import datetime

from pydantic import Field, field_validator

from app.schemas.base import (
    DESCRIPTION_MAX_LENGTH,
    TITLE_MAX_LENGTH,
    ApiModel,
    ApiReadModel,
    normalize_description,
    normalize_optional_description,
    normalize_optional_title,
    normalize_required_title,
)


class TaskCreate(ApiModel):
    title: str = Field(min_length=1, max_length=TITLE_MAX_LENGTH)
    description: str = Field(default="", max_length=DESCRIPTION_MAX_LENGTH)
    done: bool = False
    date: DateType | None = None
    time_block_id: uuid.UUID | None = None
    order: int = Field(default=0, ge=0)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        return normalize_required_title(value)

    @field_validator("description")
    @classmethod
    def normalize_description_field(cls, value: str) -> str:
        return normalize_description(value)


class TaskUpdate(ApiModel):
    title: str | None = None
    description: str | None = None
    done: bool | None = None
    date: DateType | None = None
    time_block_id: uuid.UUID | None = None
    order: int | None = None

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str | None) -> str:
        return normalize_optional_title(value)

    @field_validator("description")
    @classmethod
    def normalize_description_field(cls, value: str | None) -> str:
        return normalize_optional_description(value)

    @field_validator("done")
    @classmethod
    def validate_done(cls, value: bool | None) -> bool:
        if value is None:
            raise ValueError("Done cannot be null.")
        return value

    @field_validator("order")
    @classmethod
    def validate_order(cls, value: int | None) -> int:
        if value is None:
            raise ValueError("Order cannot be null.")
        if value < 0:
            raise ValueError("Order cannot be negative.")
        return value


class TaskRead(ApiReadModel):
    id: uuid.UUID
    title: str
    description: str
    done: bool
    date: DateType | None
    time_block_id: uuid.UUID | None
    order: int = Field(validation_alias="sort_order")
    created_at: datetime
    completed_at: datetime | None
