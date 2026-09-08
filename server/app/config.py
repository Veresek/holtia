from functools import lru_cache
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.services.ai.crypto import parse_encryption_key

DEFAULT_SECRET_KEY = "change-me-before-deploying"
KNOWN_WEAK_SECRET_KEYS = {
    DEFAULT_SECRET_KEY,
    "local-development-only",
    "replace-with-a-long-random-secret",
}


class Settings(BaseSettings):
    app_name: str = "Holtia API"
    environment: Literal["development", "test", "production"] = "development"
    database_url: str = "postgresql+psycopg://holtia:holtia@localhost:5432/holtia"
    instance_code: str = ""
    secret_key: str = DEFAULT_SECRET_KEY
    timezone: str = "Europe/Warsaw"
    client_origin: str = "http://localhost:5173"
    access_token_minutes: int = Field(default=30, gt=0)
    auth_rate_limit_enabled: bool | None = None
    auth_rate_limit_requests: int = Field(default=10, gt=0)
    auth_rate_limit_window_seconds: int = Field(default=60, gt=0)
    ai_enabled: bool = False
    ai_encryption_key: str = ""
    ai_request_timeout_seconds: float = Field(default=30, gt=0)
    ai_prompt_max_length: int = Field(default=2_000, gt=0)
    ai_max_output_tokens: int = Field(default=2_048, gt=0)
    ai_max_proposals: int = Field(default=12, gt=0)
    ai_rate_limit_requests: int = Field(default=20, gt=0)
    ai_rate_limit_window_seconds: int = Field(default=3_600, gt=0)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, KeyError) as exc:
            raise ValueError(f"Unknown timezone: {value}") from exc
        return value

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        if self.environment != "production":
            return self
        if not self.instance_code.strip():
            raise ValueError("INSTANCE_CODE must not be empty in production.")
        if (
            len(self.secret_key) < 32
            or len(set(self.secret_key)) < 8
            or self.secret_key.strip() in KNOWN_WEAK_SECRET_KEYS
        ):
            raise ValueError(
                "SECRET_KEY must be at least 32 characters and non-default "
                "in production."
            )
        if not self.client_origin.startswith("https://"):
            raise ValueError("CLIENT_ORIGIN must use HTTPS in production.")
        return self

    @model_validator(mode="after")
    def validate_ai_encryption_key(self) -> "Settings":
        if not self.ai_enabled:
            return self
        try:
            parse_encryption_key(self.ai_encryption_key)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc
        return self

    @property
    def rate_limiting_enabled(self) -> bool:
        if self.auth_rate_limit_enabled is not None:
            return self.auth_rate_limit_enabled
        return self.environment != "test"

    @property
    def zoneinfo(self) -> ZoneInfo:
        return ZoneInfo(self.timezone)


@lru_cache
def get_settings() -> Settings:
    return Settings()
