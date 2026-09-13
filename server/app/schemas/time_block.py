import re
import uuid
from datetime import date as DateType
from datetime import time as TimeType

from pydantic import Field, field_validator, model_validator

from app.models.time_block import BLOCK_COLOR_TOKENS, DEFAULT_BLOCK_COLOR, Recurrence
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

HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def normalize_recurrence_days(days: list[int]) -> list[int]:
    if any(day < 0 or day > 6 for day in days):
        raise ValueError("recurrence_days must use 0 (Monday) through 6 (Sunday)")
    return sorted(set(days))


def recurrence_days_for(recurrence: Recurrence, days: list[int]) -> list[int]:
    normalized = normalize_recurrence_days(days)
    if recurrence == Recurrence.WEEKDAYS:
        if not normalized:
            raise ValueError(
                "recurrence_days is required when recurrence is weekdays"
            )
        return normalized
    if normalized:
        raise ValueError(
            "recurrence_days must be empty unless recurrence is weekdays"
        )
    return []


def normalize_block_color(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("Color cannot be null.")
    token = BLOCK_COLOR_TOKENS.get(value.strip().lower())
    if token:
        return token
    hex_value = value.strip()
    if HEX_COLOR.fullmatch(hex_value):
        return hex_value.lower()
    raise ValueError("Color must be a 6-digit hex value.")


class TimeBlockCreate(ApiModel):
    title: str = Field(min_length=1, max_length=TITLE_MAX_LENGTH)
    description: str = Field(default="", max_length=DESCRIPTION_MAX_LENGTH)
    date: DateType
    start: TimeType
    end: TimeType
    recurrence: Recurrence = Recurrence.NONE
    recurrence_days: list[int] = Field(default_factory=list)
    color: str = DEFAULT_BLOCK_COLOR

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        return normalize_required_title(value)

    @field_validator("description")
    @classmethod
    def normalize_description_field(cls, value: str) -> str:
        return normalize_description(value)

    @field_validator("color", mode="before")
    @classmethod
    def normalize_color(cls, value: object) -> str:
        if value is None:
            return DEFAULT_BLOCK_COLOR
        return normalize_block_color(value)

    @model_validator(mode="after")
    def validate_block(self) -> "TimeBlockCreate":
        if self.end == self.start:
            raise ValueError("end must differ from start")
        self.recurrence_days = recurrence_days_for(
            self.recurrence,
            self.recurrence_days,
        )
        return self


class TimeBlockUpdate(ApiModel):
    title: str | None = None
    description: str | None = None
    date: DateType | None = None
    start: TimeType | None = None
    end: TimeType | None = None
    recurrence: Recurrence | None = None
    recurrence_days: list[int] | None = None
    color: str | None = None

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str | None) -> str:
        return normalize_optional_title(value)

    @field_validator("description")
    @classmethod
    def normalize_description_field(cls, value: str | None) -> str:
        return normalize_optional_description(value)

    @field_validator("date")
    @classmethod
    def validate_date(cls, value: DateType | None) -> DateType:
        if value is None:
            raise ValueError("Date cannot be null.")
        return value

    @field_validator("start")
    @classmethod
    def validate_start(cls, value: TimeType | None) -> TimeType:
        if value is None:
            raise ValueError("Start cannot be null.")
        return value

    @field_validator("end")
    @classmethod
    def validate_end(cls, value: TimeType | None) -> TimeType:
        if value is None:
            raise ValueError("End cannot be null.")
        return value

    @field_validator("recurrence")
    @classmethod
    def validate_recurrence(cls, value: Recurrence | None) -> Recurrence:
        if value is None:
            raise ValueError("Recurrence cannot be null.")
        return value

    @field_validator("recurrence_days")
    @classmethod
    def validate_recurrence_days(cls, value: list[int] | None) -> list[int]:
        if value is None:
            raise ValueError("Recurrence days cannot be null.")
        return normalize_recurrence_days(value)

    @field_validator("color", mode="before")
    @classmethod
    def validate_color(cls, value: object) -> str:
        return normalize_block_color(value)


class TimeBlockRead(ApiReadModel):
    id: uuid.UUID
    title: str
    description: str
    date: DateType
    start: TimeType
    end: TimeType
    recurrence: Recurrence
    recurrence_days: list[int]
    color: str

    @field_validator("color", mode="before")
    @classmethod
    def normalize_color(cls, value: object) -> str:
        return normalize_block_color(value)
