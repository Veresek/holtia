import logging
import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from app.config import Settings, get_settings
from app.main import app
from app.services import auth as auth_service
from tests.conftest import SENT_EMAILS, register, register_verified, sent_code


def request_code(
    client: TestClient,
    email: str = "ada@example.com",
    purpose: str = "verify",
):
    return client.post(
        "/api/auth/send-code",
        json={"email": email, "purpose": purpose},
    )


def sent_for(purpose: str) -> list[tuple[str, str, str]]:
    return [row for row in SENT_EMAILS if row[2] == purpose]


def failing_sender(codes: list[str]):
    """A sender that takes the code and then dies, as a down SMTP does."""

    def send(settings: Settings, *, to: str, code: str, purpose: str) -> None:
        codes.append(code)
        raise ConnectionRefusedError("smtp down")

    return send


def test_send_code_unknown_email_is_still_204(client: TestClient) -> None:
    response = request_code(client, email="ghost@example.com")

    assert response.status_code == 204
    assert response.content == b""
    assert SENT_EMAILS == []


def test_send_code_verify_and_reset_purposes_send_one_email_each(
    client: TestClient,
) -> None:
    register_verified(client)
    assert len(sent_for("verify")) == 1
    assert sent_for("reset") == []

    for purpose in ("verify", "reset"):
        response = request_code(client, purpose=purpose)
        assert response.status_code == 204
        assert response.content == b""

    assert len(sent_for("verify")) == 2
    assert len(sent_for("reset")) == 1
    for to, code, purpose in SENT_EMAILS:
        assert to == "ada@example.com"
        assert re.fullmatch(r"[0-9]{6}", code)
    assert sent_code("ada@example.com", "reset") == sent_for("reset")[0][1]


def test_send_code_rejects_bad_purpose(client: TestClient) -> None:
    register_verified(client)
    sent_before = len(SENT_EMAILS)

    response = request_code(client, purpose="admin")

    assert response.status_code == 422
    assert len(SENT_EMAILS) == sent_before


def test_send_code_respects_cooldown(client: TestClient) -> None:
    app.dependency_overrides[get_settings] = lambda: Settings(
        email_code_cooldown_seconds=600
    )

    register(client)
    first = request_code(client)
    second = request_code(client)

    assert first.status_code == second.status_code == 204
    assert len(SENT_EMAILS) == 1
    to, code, purpose = SENT_EMAILS[0]
    assert (to, purpose) == ("ada@example.com", "verify")
    assert re.fullmatch(r"[0-9]{6}", code)


def test_send_code_survives_smtp_failure(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    handed_over: list[str] = []
    monkeypatch.setattr(
        auth_service,
        "send_code_email",
        failing_sender(handed_over),
    )

    created = register(client)
    response = request_code(client, purpose="reset")

    assert created.status_code == 201
    assert response.status_code == 204
    assert len(handed_over) == 2


def test_send_code_absorbs_a_racing_issue(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def lose_the_race(db, settings, *, user_id, purpose):
        raise IntegrityError("INSERT", Exception("duplicate key"), {})

    register(client)
    monkeypatch.setattr(auth_service, "issue_code", lose_the_race)
    sent_before = len(SENT_EMAILS)

    response = request_code(client, purpose="reset")

    assert response.status_code == 204
    assert len(SENT_EMAILS) == sent_before


def test_send_failure_log_has_no_code(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    handed_over: list[str] = []
    monkeypatch.setattr(
        auth_service,
        "send_code_email",
        failing_sender(handed_over),
    )

    with caplog.at_level(logging.WARNING, logger="app.services.auth"):
        register(client)
        response = request_code(client, purpose="reset")

    assert response.status_code == 204
    assert handed_over
    assert "ada@example.com" in caplog.text
    for code in handed_over:
        assert code not in caplog.text
    assert re.search(r"\b\d{6}\b", caplog.text) is None
