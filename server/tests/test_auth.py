import re
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import Settings, get_settings
from app.db import SessionLocal
from app.main import app
from app.models.email_code import EmailCode
from app.models.refresh_token import RefreshToken
from app.services.email_codes import MAX_CODE_ATTEMPTS, hash_email_code
from app.services.passwords import PASSWORD_HINT
from app.services.rate_limits import RATE_LIMITED
from tests.conftest import (
    SENT_EMAILS,
    login,
    register,
    register_verified,
    sent_code,
    verify,
)

VERIFY_FAILED = "Verification failed. Check the code and try again."
RESET_FAILED = "Reset failed. Check the code and try again."
UNVERIFIED = "Verify your account with the code sent to your email."
NO_SMTP = {
    "smtp_host": "",
    "smtp_user": "",
    "smtp_password": "",
    "mail_from": "",
}


def other_code(live: str) -> str:
    """A code that is certainly not the live one, so a wrong-code test cannot
    win the one-in-a-million guess against the issued code."""
    return "000000" if live != "000000" else "000001"


def send_reset_code(client: TestClient, email: str = "ada@example.com") -> str:
    """Ask for a reset code the way the reset flow does, then read it back from
    the captured mail instead of the SMTP socket."""
    response = client.post(
        "/api/auth/send-code",
        json={"email": email, "purpose": "reset"},
    )
    assert response.status_code == 204
    return sent_code(email, "reset")


def reset(
    client: TestClient,
    *,
    code: str,
    email: str = "ada@example.com",
    new_password: str = "password2",
):
    return client.post(
        "/api/auth/reset",
        json={"email": email, "code": code, "newPassword": new_password},
    )


def _cookie_headers(response) -> list[str]:
    return response.headers.get_list("set-cookie")


def test_register_creates_an_unverified_account(client: TestClient) -> None:
    response = register(client)

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "ada@example.com"
    assert body["verifiedAt"] is None
    assert body["timezone"] == "Europe/Warsaw"
    assert "id" in body
    assert "password" not in body
    assert "access_token" not in body
    assert "refresh_token" not in body
    assert not any("access_token=" in header for header in _cookie_headers(response))


def test_register_does_not_reveal_a_duplicate_email(client: TestClient) -> None:
    created = register(client)
    duplicate = register(client)

    assert created.status_code == duplicate.status_code == 201
    assert created.json()["email"] == duplicate.json()["email"] == "ada@example.com"
    assert created.json()["verifiedAt"] is None
    assert duplicate.json()["verifiedAt"] is None
    assert created.json()["id"] != duplicate.json()["id"]
    assert not any("access_token=" in header for header in _cookie_headers(duplicate))
    assert client.get("/api/users/me").status_code == 401


def test_register_rejects_a_short_password(client: TestClient) -> None:
    response = register(client, password="short")

    assert response.status_code == 422


def test_register_rejects_a_password_without_a_number(client: TestClient) -> None:
    response = register(client, password="password")

    assert response.status_code == 422
    assert response.json()["detail"] == PASSWORD_HINT


def test_register_normalizes_email(client: TestClient) -> None:
    response = register(client, email="Ada@Example.com")

    assert response.status_code == 201
    assert response.json()["email"] == "ada@example.com"


def test_register_stores_a_device_timezone(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register",
        json={
            "email": "ada@example.com",
            "password": "password1",
            "timezone": "Pacific/Auckland",
        },
    )

    assert response.status_code == 201
    assert response.json()["timezone"] == "Pacific/Auckland"


def test_register_falls_back_when_timezone_is_unknown(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register",
        json={
            "email": "ada@example.com",
            "password": "password1",
            "timezone": "Not/AZone",
        },
    )

    assert response.status_code == 201
    assert response.json()["timezone"] == "Europe/Warsaw"


def test_register_auto_verifies_when_smtp_is_unconfigured(
    client: TestClient,
) -> None:
    app.dependency_overrides[get_settings] = lambda: Settings(
        smtp_host="",
        smtp_user="",
        smtp_password="",
        mail_from="",
    )

    response = register(client)

    assert response.status_code == 201
    assert response.json()["verifiedAt"] is not None
    cookies = _cookie_headers(response)
    assert any("access_token=" in header and "HttpOnly" in header for header in cookies)
    assert any("refresh_token=" in header and "HttpOnly" in header for header in cookies)
    me = client.get("/api/users/me")
    assert me.status_code == 200
    assert me.json()["email"] == "ada@example.com"
    assert SENT_EMAILS == []


def test_register_when_email_smtp_configured_sends_verify_code(
    client: TestClient,
) -> None:
    # Configured SMTP is the switch: the account stays unverified and the code
    # goes out by email.
    app.dependency_overrides[get_settings] = lambda: Settings(
        smtp_host="smtp.example.test",
        smtp_user="holtia@example.test",
        smtp_password="a-mailbox-password",
        mail_from="holtia@example.test",
    )

    response = register(client)

    assert response.status_code == 201
    assert response.json()["verifiedAt"] is None
    assert not any("access_token=" in header for header in _cookie_headers(response))
    assert client.get("/api/users/me").status_code == 401
    assert len(SENT_EMAILS) == 1
    to, code, purpose = SENT_EMAILS[0]
    assert (to, purpose) == ("ada@example.com", "verify")
    assert re.fullmatch(r"[0-9]{6}", code)
    assert login(client).status_code == 403


def test_register_existing_email_sends_no_email(client: TestClient) -> None:
    created = register(client)
    assert created.status_code == 201
    sent_before = len(SENT_EMAILS)

    duplicate = register(client)

    assert duplicate.status_code == 201
    assert len(SENT_EMAILS) == sent_before


def test_login_rejects_unverified_account(client: TestClient) -> None:
    register(client)
    response = login(client)

    assert response.status_code == 403
    assert response.json()["detail"] == UNVERIFIED


def test_login_and_me_after_verify(client: TestClient) -> None:
    register_verified(client)
    client.cookies.clear()
    response = login(client)

    assert response.status_code == 200
    assert response.json()["email"] == "ada@example.com"
    cookies = _cookie_headers(response)
    assert any("access_token=" in header and "HttpOnly" in header for header in cookies)
    assert "access_token" not in response.json()
    assert "refresh_token" not in response.json()

    me = client.get("/api/users/me")
    assert me.status_code == 200
    assert me.json()["email"] == "ada@example.com"
    assert me.json()["verifiedAt"] is not None


def test_login_rejects_wrong_password(client: TestClient) -> None:
    register_verified(client)
    client.cookies.clear()
    response = login(client, password="wrong-password")

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password."


def test_login_rejects_unknown_email(client: TestClient) -> None:
    response = login(client)

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password."


def test_me_without_cookie_is_unauthorized(client: TestClient) -> None:
    response = client.get("/api/users/me")

    assert response.status_code == 401
    assert response.json()["detail"] == "Not authenticated."


def test_verify_rejects_wrong_code(client: TestClient) -> None:
    register(client)
    live = sent_code("ada@example.com", "verify")

    response = verify(client, code=other_code(live))

    assert response.status_code == 400
    assert response.json()["detail"] == VERIFY_FAILED
    assert not any("access_token=" in header for header in _cookie_headers(response))
    assert login(client).status_code == 403


def test_verify_unknown_email_same_error(client: TestClient) -> None:
    register(client)
    live = sent_code("ada@example.com", "verify")

    wrong_code = verify(client, code=other_code(live))
    unknown = client.post(
        "/api/auth/verify",
        json={"email": "unknown@example.com", "code": "000000"},
    )

    assert wrong_code.status_code == unknown.status_code == 400
    assert wrong_code.json() == unknown.json() == {"detail": VERIFY_FAILED}


def test_verify_rejects_a_malformed_code(client: TestClient) -> None:
    """Six digits are the wire shape; anything else never reaches the code row."""
    register(client)

    for code in ("12345", "1234567", "abcdef", "00000 "):
        assert verify(client, code=code).status_code == 422

    assert login(client).status_code == 403


def test_verify_rejects_used_code(client: TestClient) -> None:
    created = register(client)
    assert created.status_code == 201

    first = verify(client)
    assert first.status_code == 200
    client.cookies.clear()

    second = verify(client)

    assert second.status_code == 400
    assert second.json()["detail"] == VERIFY_FAILED
    assert not any("access_token=" in header for header in _cookie_headers(second))


def test_verify_does_not_change_password(client: TestClient) -> None:
    register_verified(client)
    client.cookies.clear()

    assert login(client).status_code == 200
    assert login(client, password="wrong-password").status_code == 401


def test_verify_wrong_attempts_burn_across_requests(client: TestClient) -> None:
    """A wrong code is remembered across requests: without that commit the
    counter would reset every call and codes would be guessable."""
    register(client)
    live = sent_code("ada@example.com", "verify")

    for _ in range(MAX_CODE_ATTEMPTS):
        assert verify(client, code=other_code(live)).status_code == 400

    assert verify(client, code=live).status_code == 400
    assert login(client).status_code == 403


def test_verify_resend_does_not_refresh_the_attempt_budget(client: TestClient) -> None:
    """Five guesses are the account’s whole `verify` budget, not five per
    message (ledger Ruling 8): a resend carries what has been spent."""
    register(client)
    sent = other_code(sent_code("ada@example.com", "verify"))

    for _ in range(2):
        assert verify(client, code=sent).status_code == 400
    with SessionLocal() as db:
        row = db.scalar(select(EmailCode).where(EmailCode.purpose == "verify"))
        assert row is not None and row.attempts == 2

    assert client.post(
        "/api/auth/send-code",
        json={"email": "ada@example.com", "purpose": "verify"},
    ).status_code == 204
    fresh = sent_code("ada@example.com", "verify")
    with SessionLocal() as db:
        row = db.scalar(select(EmailCode).where(EmailCode.purpose == "verify"))
        assert row is not None
        assert row.attempts == 2
        assert row.consumed_at is None
        assert row.code_hash == hash_email_code(fresh)

    for _ in range(MAX_CODE_ATTEMPTS - 2):
        assert verify(client, code=other_code(fresh)).status_code == 400

    assert verify(client, code=fresh).status_code == 400
    assert login(client).status_code == 403


def test_verify_cannot_issue_a_session_for_an_activated_account(
    client: TestClient,
) -> None:
    register_verified(client)
    client.cookies.clear()
    send = client.post(
        "/api/auth/send-code",
        json={"email": "ada@example.com", "purpose": "verify"},
    )
    assert send.status_code == 204
    live = sent_code("ada@example.com", "verify")

    response = verify(client, code=live)

    assert response.status_code == 400
    assert response.json()["detail"] == VERIFY_FAILED
    assert not any("access_token=" in header for header in _cookie_headers(response))
    assert client.get("/api/users/me").status_code == 401
    with SessionLocal() as db:
        row = db.scalar(select(EmailCode).where(EmailCode.purpose == "verify"))
        assert row is not None
        assert row.attempts == 0
        assert row.consumed_at is None


def test_verify_does_not_distinguish_unknown_and_activated_accounts(
    client: TestClient,
) -> None:
    register_verified(client)
    client.cookies.clear()

    activated = verify(client, code="000000")
    unknown = client.post(
        "/api/auth/verify",
        json={"email": "unknown@example.com", "code": "000000"},
    )

    assert activated.status_code == unknown.status_code == 400
    assert activated.json() == unknown.json()


def test_refresh_rotates_the_refresh_token(client: TestClient) -> None:
    register_verified(client)
    old_refresh = client.cookies.get("refresh_token")
    old_access = client.cookies.get("access_token")
    assert old_refresh
    assert old_access

    response = client.post("/api/auth/refresh")

    assert response.status_code == 204
    assert response.content == b""
    new_refresh = client.cookies.get("refresh_token")
    new_access = client.cookies.get("access_token")
    assert new_refresh
    assert new_access
    assert new_refresh != old_refresh
    assert new_access != old_access

    me = client.get("/api/users/me")
    assert me.status_code == 200


def test_refresh_reuses_a_rotated_token_within_grace(client: TestClient) -> None:
    register_verified(client)
    old_refresh = client.cookies.get("refresh_token")
    assert old_refresh
    assert client.post("/api/auth/refresh").status_code == 204

    stale = TestClient(app)
    stale.cookies.set("refresh_token", old_refresh)
    response = stale.post("/api/auth/refresh")

    assert response.status_code == 204
    assert stale.get("/api/users/me").status_code == 200


def test_refresh_rejects_a_rotated_token_after_grace(client: TestClient) -> None:
    register_verified(client)
    old_refresh = client.cookies.get("refresh_token")
    assert old_refresh
    assert client.post("/api/auth/refresh").status_code == 204

    past = datetime.now(UTC) - timedelta(seconds=30)
    with SessionLocal() as db:
        for token in db.scalars(select(RefreshToken)).all():
            if token.revoked_at is not None:
                token.revoked_at = past
        db.commit()

    stale = TestClient(app)
    stale.cookies.set("refresh_token", old_refresh)
    response = stale.post("/api/auth/refresh")

    assert response.status_code == 401
    assert client.post("/api/auth/refresh").status_code == 401


def test_logout_revokes_the_refresh_token(client: TestClient) -> None:
    register_verified(client)
    refresh_token = client.cookies.get("refresh_token")
    assert refresh_token

    response = client.post("/api/auth/logout")

    assert response.status_code == 204
    me = client.get("/api/users/me")
    assert me.status_code == 401

    stale = TestClient(app)
    stale.cookies.set("refresh_token", refresh_token)
    assert stale.post("/api/auth/refresh").status_code == 401


def test_reset_with_code_rotates_sessions(client: TestClient) -> None:
    register_verified(client)
    refresh_token = client.cookies.get("refresh_token")
    access_token = client.cookies.get("access_token")
    assert refresh_token
    assert access_token
    code = send_reset_code(client)

    response = reset(client, code=code)

    assert response.status_code == 204

    stale = TestClient(app)
    stale.cookies.set("refresh_token", refresh_token)
    assert stale.post("/api/auth/refresh").status_code == 401

    stale_access = TestClient(app)
    stale_access.cookies.set("access_token", access_token)
    assert stale_access.get("/api/users/me").status_code == 401

    client.cookies.clear()
    assert login(client, password="password1").status_code == 401
    assert login(client, password="password2").status_code == 200


def test_reset_rejects_wrong_code(client: TestClient) -> None:
    register_verified(client)
    code = send_reset_code(client)

    response = reset(client, code=other_code(code))

    assert response.status_code == 400
    assert response.json()["detail"] == RESET_FAILED
    client.cookies.clear()
    assert login(client, password="password1").status_code == 200
    assert reset(client, code=code).status_code == 204


def test_reset_wrong_attempts_burn_across_requests(client: TestClient) -> None:
    """The verify burn rule covers reset too: without that commit on the
    wrong-code path the counter would restart at zero every request and a reset
    code would be guessable inside its TTL."""
    register_verified(client)
    live = send_reset_code(client)

    for _ in range(MAX_CODE_ATTEMPTS):
        wrong = reset(client, code=other_code(live))
        assert wrong.status_code == 400
        assert wrong.json()["detail"] == RESET_FAILED

    burned = reset(client, code=live)
    assert burned.status_code == 400
    assert burned.json()["detail"] == RESET_FAILED

    client.cookies.clear()
    assert login(client, password="password1").status_code == 200
    assert login(client, password="password2").status_code == 401


def test_reset_resend_does_not_refresh_the_attempt_budget(client: TestClient) -> None:
    """Reset keeps the same per-pair budget as verify: a resend replaces the
    code and carries the attempts spent on the old one."""
    register_verified(client)
    first = send_reset_code(client)

    for _ in range(3):
        assert reset(client, code=other_code(first)).status_code == 400
    with SessionLocal() as db:
        row = db.scalar(select(EmailCode).where(EmailCode.purpose == "reset"))
        assert row is not None and row.attempts == 3

    live = send_reset_code(client)
    with SessionLocal() as db:
        row = db.scalar(select(EmailCode).where(EmailCode.purpose == "reset"))
        assert row is not None
        assert row.attempts == 3
        assert row.consumed_at is None
        assert row.code_hash == hash_email_code(live)

    for _ in range(MAX_CODE_ATTEMPTS - 3):
        assert reset(client, code=other_code(live)).status_code == 400

    assert reset(client, code=live).status_code == 400
    client.cookies.clear()
    assert login(client, password="password1").status_code == 200
    assert login(client, password="password2").status_code == 401


def test_reset_requires_strong_password_before_code(client: TestClient) -> None:
    """The password rule runs before the code is claimed, so a weak password
    cannot spend a live code or one of its five attempts."""
    register_verified(client)
    code = send_reset_code(client)

    weak = reset(client, code=other_code(code), new_password="password")

    assert weak.status_code == 422
    assert weak.json()["detail"] == PASSWORD_HINT
    with SessionLocal() as db:
        row = db.scalar(select(EmailCode).where(EmailCode.purpose == "reset"))
        assert row is not None
        assert row.attempts == 0
        assert row.consumed_at is None
    assert reset(client, code=code).status_code == 204


def test_reset_does_not_verify(client: TestClient) -> None:
    register(client)
    code = send_reset_code(client)

    response = reset(client, code=code)

    assert response.status_code == 204
    client.cookies.clear()
    attempt = login(client, password="password2")
    assert attempt.status_code == 403
    assert attempt.json()["detail"] == UNVERIFIED


def test_reset_does_not_reveal_an_unknown_email(client: TestClient) -> None:
    register_verified(client)
    code = send_reset_code(client)

    unknown = reset(client, email="unknown@example.com", code=code)
    wrong_code = reset(client, code=other_code(code))

    assert unknown.status_code == wrong_code.status_code == 400
    assert unknown.json() == wrong_code.json() == {"detail": RESET_FAILED}


def test_verify_unknown_email_burns_nothing(client: TestClient) -> None:
    """The unknown-email path spends the same DB work as a real miss by
    consuming against a random user id; that burn must stay inert."""
    register(client)
    live = sent_code("ada@example.com", "verify")

    unknown = client.post(
        "/api/auth/verify",
        json={"email": "ghost@example.com", "code": "000000"},
    )

    assert unknown.status_code == 400
    assert unknown.json() == {"detail": VERIFY_FAILED}
    with SessionLocal() as db:
        row = db.scalar(select(EmailCode).where(EmailCode.purpose == "verify"))
    assert row is not None
    assert row.attempts == 0
    assert row.consumed_at is None
    assert verify(client, code=live).status_code == 200


def test_reset_unknown_email_burns_nothing(client: TestClient) -> None:
    register_verified(client)
    code = send_reset_code(client)

    unknown = reset(client, email="ghost@example.com", code="000000")

    assert unknown.status_code == 400
    assert unknown.json() == {"detail": RESET_FAILED}
    with SessionLocal() as db:
        row = db.scalar(select(EmailCode).where(EmailCode.purpose == "reset"))
    assert row is not None
    assert row.attempts == 0
    assert row.consumed_at is None
    assert reset(client, code=code).status_code == 204


def test_dev_mode_skips_codes(client: TestClient) -> None:
    created = register(client)

    assert created.status_code == 201
    assert created.json()["verifiedAt"] is None
    assert len(SENT_EMAILS) == 1

    app.dependency_overrides[get_settings] = lambda: Settings(**NO_SMTP)

    unconfigured_signup = register(client, email="grace@example.com")
    verified = verify(client, code="000000")
    reset_response = reset(client, email="grace@example.com", code="000000")

    assert unconfigured_signup.json()["verifiedAt"] is not None
    assert verified.status_code == 200
    assert verified.json()["verifiedAt"] is not None
    assert reset_response.status_code == 204
    assert len(SENT_EMAILS) == 1

    client.cookies.clear()
    assert (
        login(client, email="grace@example.com", password="password2").status_code == 200
    )


def test_auth_rate_limit_uses_the_direct_client_address(
    client: TestClient,
) -> None:
    app.dependency_overrides[get_settings] = lambda: Settings(
        auth_rate_limit_enabled=True,
        auth_rate_limit_requests=2,
        auth_rate_limit_window_seconds=60,
    )

    first = client.post(
        "/api/auth/login",
        headers={"X-Forwarded-For": "198.51.100.1"},
        json={"email": "unknown@example.com", "password": "password1"},
    )
    second = client.post(
        "/api/auth/login",
        headers={"X-Forwarded-For": "198.51.100.2"},
        json={"email": "unknown@example.com", "password": "password1"},
    )
    limited = client.post(
        "/api/auth/login",
        headers={"X-Forwarded-For": "198.51.100.3"},
        json={"email": "unknown@example.com", "password": "password1"},
    )

    assert first.status_code == second.status_code == 401
    assert limited.status_code == 429
    assert limited.json()["detail"] == RATE_LIMITED
    assert int(limited.headers["Retry-After"]) > 0


@pytest.mark.parametrize(
    ("path", "payload"),
    [
        (
            "/api/auth/register",
            {"email": "ada@example.com", "password": "password1"},
        ),
        (
            "/api/auth/verify",
            {
                "email": "unknown@example.com",
                "code": "000000",
            },
        ),
        (
            "/api/auth/reset",
            {
                "email": "unknown@example.com",
                "code": "000000",
                "newPassword": "password2",
            },
        ),
        (
            "/api/auth/send-code",
            {"email": "unknown@example.com", "purpose": "reset"},
        ),
    ],
)
def test_sensitive_auth_endpoints_are_rate_limited(
    client: TestClient,
    path: str,
    payload: dict[str, str],
) -> None:
    app.dependency_overrides[get_settings] = lambda: Settings(
        auth_rate_limit_enabled=True,
        auth_rate_limit_requests=1,
        auth_rate_limit_window_seconds=60,
    )

    client.post(path, json=payload)
    limited = client.post(path, json=payload)

    assert limited.status_code == 429
    assert limited.json()["detail"] == RATE_LIMITED


def test_register_rejects_a_password_longer_than_bcrypt_allows(
    client: TestClient,
) -> None:
    response = register(client, password="a1" + ("x" * 71))

    assert response.status_code == 422
    assert response.json()["detail"] == PASSWORD_HINT


def test_refresh_can_be_repeated_without_ending_the_session(
    client: TestClient,
) -> None:
    register_verified(client)

    for _ in range(3):
        assert client.post("/api/auth/refresh").status_code == 204
        assert client.get("/api/users/me").status_code == 200


def test_login_does_not_revoke_an_existing_session(client: TestClient) -> None:
    register_verified(client)
    first_refresh = client.cookies.get("refresh_token")
    assert first_refresh

    other = TestClient(app)
    assert login(other).status_code == 200

    first = TestClient(app)
    first.cookies.set("refresh_token", first_refresh)
    assert first.post("/api/auth/refresh").status_code == 204
    assert first.get("/api/users/me").status_code == 200


def test_refresh_is_rate_limited(client: TestClient) -> None:
    register_verified(client)
    app.dependency_overrides[get_settings] = lambda: Settings(
        auth_rate_limit_enabled=True,
        auth_rate_limit_requests=1,
        auth_rate_limit_window_seconds=60,
    )

    assert client.post("/api/auth/refresh").status_code == 204
    limited = client.post("/api/auth/refresh")

    assert limited.status_code == 429
    assert limited.json()["detail"] == RATE_LIMITED
