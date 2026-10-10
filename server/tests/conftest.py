import base64
import os
from collections.abc import Iterator

os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
os.environ["ENVIRONMENT"] = "test"
os.environ["SECRET_KEY"] = "test-secret-key-for-hs256-ok!!xy"
os.environ["INSTANCE_CODE"] = "test-instance-code"
os.environ["AI_ENABLED"] = "false"
os.environ["SMTP_HOST"] = "smtp.test"
os.environ["SMTP_USER"] = "u"
os.environ["SMTP_PASSWORD"] = "p"
os.environ["MAIL_FROM"] = "holtia@example.com"
os.environ["EMAIL_CODE_COOLDOWN_SECONDS"] = "0"

import pytest
from fastapi.testclient import TestClient

from app import models as _models
from app.config import Settings, get_settings
from app.db import Base, engine
from app.main import app
from app.services.rate_limits import ai_rate_limiter, auth_rate_limiter

assert _models.UserAiSettings is not None

TEST_AI_ENCRYPTION_KEY = base64.b64encode(b"t" * 32).decode()

SENT_EMAILS: list[tuple[str, str, str]] = []


@pytest.fixture(autouse=True)
def capture_sent_emails(monkeypatch: pytest.MonkeyPatch) -> None:
    """Catch what the code service hands SMTP instead of opening a socket."""
    SENT_EMAILS.clear()

    def record(
        settings: Settings,
        *,
        to: str,
        code: str,
        purpose: str,
    ) -> None:
        SENT_EMAILS.append((to, code, purpose))

    monkeypatch.setattr("app.services.auth.send_code_email", record)


def enable_ai(**overrides: object) -> Settings:
    settings = Settings(
        environment="test",
        database_url="sqlite+pysqlite:///:memory:",
        secret_key="test-secret-key-for-hs256-ok!!xy",
        instance_code="test-instance-code",
        ai_enabled=True,
        ai_encryption_key=TEST_AI_ENCRYPTION_KEY,
        **overrides,
    )
    app.dependency_overrides[get_settings] = lambda: settings
    return settings


@pytest.fixture
def client() -> Iterator[TestClient]:
    auth_rate_limiter.clear()
    ai_rate_limiter.clear()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    auth_rate_limiter.clear()
    ai_rate_limiter.clear()


def sent_code(email: str, purpose: str) -> str:
    """The newest code captured for this pair; fails the test if none."""
    codes = [
        code
        for to, code, row_purpose in SENT_EMAILS
        if to == email and row_purpose == purpose
    ]
    assert codes, f"no {purpose} code was sent to {email}"
    return codes[-1]


def register(
    client: TestClient,
    email: str = "ada@example.com",
    password: str = "password1",
):
    return client.post(
        "/api/auth/register",
        json={"email": email, "password": password},
    )


def verify(
    client: TestClient,
    email: str = "ada@example.com",
    code: str | None = None,
):
    if code is None:
        code = sent_code(email, "verify")
    return client.post(
        "/api/auth/verify",
        json={"email": email, "code": code},
    )


def login(
    client: TestClient,
    email: str = "ada@example.com",
    password: str = "password1",
):
    return client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )


def register_verified(
    client: TestClient,
    email: str = "ada@example.com",
    password: str = "password1",
):
    created = register(client, email, password)
    assert created.status_code == 201
    verified = verify(client, email)
    assert verified.status_code == 200
    return verified
