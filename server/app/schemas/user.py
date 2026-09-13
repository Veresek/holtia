import uuid
from datetime import datetime

from pydantic import EmailStr, Field, field_validator

from app.schemas.base import ApiModel, ApiReadModel
from app.timezones import IANA_TIMEZONE_MAX_LENGTH, parse_timezone


class UserRead(ApiReadModel):
    id: uuid.UUID
    email: str
    verified_at: datetime | None
    timezone: str
    created_at: datetime


class UserUpdate(ApiModel):
    email: EmailStr | None = None
    timezone: str | None = Field(
        default=None,
        max_length=IANA_TIMEZONE_MAX_LENGTH,
    )

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: EmailStr | None) -> EmailStr:
        if value is None:
            raise ValueError("Email cannot be null.")
        return value

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("Timezone cannot be null.")
        return parse_timezone(value)
