import pytest
from pydantic import ValidationError

from app.config import Settings

STRONG_SECRET = "a-unique-production-secret-with-32-characters"

SMTP_FIELDS = ("smtp_host", "smtp_user", "smtp_password", "mail_from")
SMTP_VALUES = {
    "smtp_host": "smtp.example.test",
    "smtp_user": "holtia@example.test",
    "smtp_password": "a-mailbox-password",
    "mail_from": "holtia@example.test",
}

PRODUCTION_SMTP_ERROR = (
    "SMTP_HOST, SMTP_USER, SMTP_PASSWORD and MAIL_FROM are required in production."
)


def test_production_requires_configured_smtp() -> None:
    with pytest.raises(ValidationError, match=PRODUCTION_SMTP_ERROR):
        Settings(
            environment="production",
            secret_key=STRONG_SECRET,
            client_origin="https://holtia.xyz",
            smtp_host="",
            smtp_user="",
            smtp_password="",
            mail_from="",
        )


@pytest.mark.parametrize("missing", SMTP_FIELDS)
def test_production_requires_every_smtp_setting(missing: str) -> None:
    values = {**SMTP_VALUES, missing: ""}

    with pytest.raises(ValidationError, match=PRODUCTION_SMTP_ERROR):
        Settings(
            environment="production",
            secret_key=STRONG_SECRET,
            client_origin="https://holtia.xyz",
            **values,
        )


def test_production_accepts_configured_email() -> None:
    settings = Settings(
        environment="production",
        secret_key=STRONG_SECRET,
        client_origin="https://holtia.xyz",
        **SMTP_VALUES,
    )

    assert settings.smtp_configured is True


def test_development_allows_unconfigured_email() -> None:
    settings = Settings(
        environment="development",
        smtp_host="",
        smtp_user="",
        smtp_password="",
        mail_from="",
    )

    assert settings.smtp_configured is False


@pytest.mark.parametrize(
    "secret_key",
    [
        "too-short",
        "a" * 40,
        "change-me-before-deploying",
        "replace-with-a-long-random-secret",
        "local-development-only",
    ],
)
def test_production_rejects_weak_or_default_secret_keys(
    secret_key: str,
) -> None:
    with pytest.raises(
        ValidationError,
        match="SECRET_KEY must be at least 32 characters and non-default",
    ):
        Settings(
            environment="production",
            secret_key=secret_key,
            **SMTP_VALUES,
        )


def test_production_accepts_explicit_security_configuration() -> None:
    settings = Settings(
        environment="production",
        secret_key=STRONG_SECRET,
        client_origin="https://holtia.xyz",
        **SMTP_VALUES,
    )

    assert settings.environment == "production"


def test_enabled_ai_requires_an_encryption_key() -> None:
    with pytest.raises(ValidationError, match="AI_ENCRYPTION_KEY"):
        Settings(ai_enabled=True, ai_encryption_key="")


def test_enabled_ai_accepts_a_32_byte_encryption_key() -> None:
    settings = Settings(
        ai_enabled=True,
        ai_encryption_key="ab" * 32,
    )

    assert settings.ai_enabled is True


def test_unknown_timezone_is_rejected() -> None:
    with pytest.raises(ValidationError, match="Unknown timezone"):
        Settings(timezone="Not/AZone")


def test_production_rejects_an_insecure_client_origin() -> None:
    with pytest.raises(
        ValidationError,
        match="CLIENT_ORIGIN must use HTTPS in production",
    ):
        Settings(
            environment="production",
            secret_key=STRONG_SECRET,
            client_origin="http://holtia.xyz",
            **SMTP_VALUES,
        )


@pytest.mark.parametrize(
    ("provided", "expected"),
    [
        ((), False),
        (("smtp_host",), False),
        (("mail_from",), False),
        (("smtp_host", "smtp_user"), False),
        (("smtp_host", "smtp_user", "smtp_password"), False),
        (("smtp_user", "smtp_password", "mail_from"), False),
        (SMTP_FIELDS, True),
    ],
)
def test_smtp_configured_requires_all_four(
    provided: tuple[str, ...],
    expected: bool,
) -> None:
    settings = Settings(
        **{
            name: SMTP_VALUES[name] if name in provided else ""
            for name in SMTP_FIELDS
        }
    )

    assert settings.smtp_configured is expected


@pytest.mark.parametrize("blank_name", SMTP_FIELDS)
@pytest.mark.parametrize("blank_value", [" ", "\t\n"])
def test_smtp_configured_treats_whitespace_as_missing(
    blank_name: str,
    blank_value: str,
) -> None:
    settings = Settings(**{**SMTP_VALUES, blank_name: blank_value})

    assert settings.smtp_configured is False


EMAIL_ENV_VARS = (
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "MAIL_FROM",
    "EMAIL_CODE_TTL_MINUTES",
    "EMAIL_CODE_COOLDOWN_SECONDS",
)


def test_email_settings_default_to_an_unconfigured_instance(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # The suite's env is SMTP-configured so the auth flows can send; defaults
    # are only observable with that environment and the .env file taken away.
    for name in EMAIL_ENV_VARS:
        monkeypatch.delenv(name, raising=False)

    settings = Settings(_env_file=None)

    assert settings.smtp_configured is False
    assert settings.smtp_host == ""
    assert settings.smtp_user == ""
    assert settings.smtp_password == ""
    assert settings.mail_from == ""
    assert settings.smtp_port == 587
    assert settings.smtp_timeout_seconds == 10
    assert settings.email_code_ttl_minutes == 15
    assert settings.email_code_cooldown_seconds == 60
