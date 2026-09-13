from pydantic import EmailStr, Field

from app.schemas.base import ApiModel
from app.timezones import IANA_TIMEZONE_MAX_LENGTH


class Credentials(ApiModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class RegisterRequest(ApiModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    timezone: str | None = Field(default=None, max_length=IANA_TIMEZONE_MAX_LENGTH)


class VerifyRequest(ApiModel):
    email: EmailStr
    instance_code: str = Field(min_length=1, max_length=256)


class ResetRequest(VerifyRequest):
    new_password: str = Field(min_length=8, max_length=128)
