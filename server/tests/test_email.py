from collections.abc import Iterator
from email.message import EmailMessage

import pytest

from app.config import Settings
from app.services.email import send_code_email

SMTP_VALUES = {
    "smtp_host": "smtp.example.test",
    "smtp_port": 587,
    "smtp_user": "holtia@example.test",
    "smtp_password": "a-mailbox-password",
    "mail_from": "codes@example.test",
}


class FakeSMTP:
    """Stands in for smtplib.SMTP so no test opens a socket."""

    def __init__(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
    ) -> None:
        self.host = host
        self.port = port
        self.timeout = timeout
        self.calls: list[tuple[object, ...]] = []
        self.messages: list[EmailMessage] = []

    def __enter__(self) -> "FakeSMTP":
        self.calls.append(("enter",))
        return self

    def __exit__(
        self,
        exc_type: object,
        exc_value: object,
        traceback: object,
    ) -> None:
        self.calls.append(("exit",))

    def starttls(self) -> None:
        self.calls.append(("starttls",))

    def login(self, user: str, password: str) -> None:
        self.calls.append(("login", user, password))

    def send_message(self, message: EmailMessage) -> None:
        self.calls.append(("send_message",))
        self.messages.append(message)


@pytest.fixture
def smtp_sessions(
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[list[FakeSMTP]]:
    sessions: list[FakeSMTP] = []

    def connect(
        host: str,
        port: int,
        timeout: float | None = None,
    ) -> FakeSMTP:
        session = FakeSMTP(host, port, timeout)
        sessions.append(session)
        return session

    monkeypatch.setattr("app.services.email.smtplib.SMTP", connect)
    yield sessions


def email_settings(**overrides: object) -> Settings:
    return Settings(environment="test", **SMTP_VALUES, **overrides)


def plain_body(message: EmailMessage) -> str:
    part = message.get_body(preferencelist=("plain",))
    assert part is not None
    return str(part.get_content())


def test_verify_code_email_is_sent_over_tls(
    smtp_sessions: list[FakeSMTP],
) -> None:
    settings = email_settings()

    send_code_email(
        settings,
        to="ada@example.com",
        code="123456",
        purpose="verify",
    )

    assert len(smtp_sessions) == 1
    session = smtp_sessions[0]
    assert session.host == settings.smtp_host
    assert session.port == settings.smtp_port
    assert session.timeout == settings.smtp_timeout_seconds
    assert ("enter",) in session.calls
    assert ("starttls",) in session.calls
    assert (
        "login",
        settings.smtp_user,
        settings.smtp_password,
    ) in session.calls
    assert ("exit",) in session.calls
    assert len(session.messages) == 1

    message = session.messages[0]
    assert message["From"] == settings.mail_from
    assert message["To"] == "ada@example.com"
    assert message["Subject"] == "Your Holtia verification code"

    body = plain_body(message)
    assert "123456" in body
    assert "15" in body


def test_reset_code_email_tells_the_user_to_ignore_it(
    smtp_sessions: list[FakeSMTP],
) -> None:
    settings = email_settings()

    send_code_email(
        settings,
        to="ada@example.com",
        code="123456",
        purpose="reset",
    )

    assert len(smtp_sessions) == 1
    session = smtp_sessions[0]
    assert len(session.messages) == 1

    message = session.messages[0]
    assert message["From"] == settings.mail_from
    assert message["To"] == "ada@example.com"
    assert message["Subject"] == "Your Holtia password reset code"

    body = plain_body(message)
    assert "123456" in body
    assert "ignore" in body.lower()


def test_expiry_line_follows_the_ttl_setting(
    smtp_sessions: list[FakeSMTP],
) -> None:
    settings = email_settings(email_code_ttl_minutes=7)

    send_code_email(
        settings,
        to="ada@example.com",
        code="246813",
        purpose="verify",
    )

    body = plain_body(smtp_sessions[0].messages[0])
    assert "7 minutes" in body


def test_smtp_failure_reaches_the_caller(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def connect(
        host: str,
        port: int,
        timeout: float | None = None,
    ) -> FakeSMTP:
        raise ConnectionRefusedError("smtp down")

    monkeypatch.setattr("app.services.email.smtplib.SMTP", connect)

    with pytest.raises(ConnectionRefusedError, match="smtp down"):
        send_code_email(
            email_settings(),
            to="ada@example.com",
            code="123456",
            purpose="verify",
        )
