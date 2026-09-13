from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import Settings, get_settings
from app.db import SessionLocal
from app.main import app
from app.models.refresh_token import RefreshToken
from app.services.passwords import PASSWORD_HINT
from app.services.rate_limits import RATE_LIMITED
from tests.conftest import login, register, register_verified, verify


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


def test_register_auto_verifies_when_instance_code_is_empty(
    client: TestClient,
) -> None:
    app.dependency_overrides[get_settings] = lambda: Settings(instance_code="")

    response = register(client)

    assert response.status_code == 201
    assert response.json()["verifiedAt"] is not None
    cookies = _cookie_headers(response)
    assert any("access_token=" in header and "HttpOnly" in header for header in cookies)
    assert any("refresh_token=" in header and "HttpOnly" in header for header in cookies)
    me = client.get("/api/users/me")
    assert me.status_code == 200
    assert me.json()["email"] == "ada@example.com"


def test_login_rejects_unverified_account(client: TestClient) -> None:
    register(client)
    response = login(client)

    assert response.status_code == 403
    assert response.json()["detail"] == "Verify your account with the instance code."


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


def test_verify_rejects_wrong_instance_code(client: TestClient) -> None:
    register(client)
    response = verify(client, instance_code="nope")

    assert response.status_code == 403
    assert response.json()["detail"] == "Invalid instance code."


def test_verify_cannot_issue_a_session_for_an_activated_account(
    client: TestClient,
) -> None:
    register_verified(client)
    client.cookies.clear()

    response = verify(client)

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Account cannot be verified. Sign in or check the details."
    )
    assert not any("access_token=" in header for header in _cookie_headers(response))
    assert client.get("/api/users/me").status_code == 401


def test_verify_does_not_distinguish_unknown_and_activated_accounts(
    client: TestClient,
) -> None:
    register_verified(client)
    client.cookies.clear()

    activated = verify(client)
    unknown = verify(client, email="unknown@example.com")

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


def test_reset_changes_password_and_revokes_sessions(client: TestClient) -> None:
    register_verified(client)
    refresh_token = client.cookies.get("refresh_token")
    access_token = client.cookies.get("access_token")
    assert refresh_token
    assert access_token

    response = client.post(
        "/api/auth/reset",
        json={
            "email": "ada@example.com",
            "instanceCode": "test-instance-code",
            "newPassword": "password2",
        },
    )

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


def test_reset_rejects_wrong_instance_code(client: TestClient) -> None:
    register_verified(client)
    response = client.post(
        "/api/auth/reset",
        json={
            "email": "ada@example.com",
            "instanceCode": "nope",
            "newPassword": "password2",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Invalid instance code."


def test_reset_does_not_reveal_an_unknown_email(client: TestClient) -> None:
    response = client.post(
        "/api/auth/reset",
        json={
            "email": "unknown@example.com",
            "instanceCode": "test-instance-code",
            "newPassword": "password2",
        },
    )

    assert response.status_code == 204
    assert response.content == b""


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
                "instanceCode": "test-instance-code",
            },
        ),
        (
            "/api/auth/reset",
            {
                "email": "unknown@example.com",
                "instanceCode": "test-instance-code",
                "newPassword": "password2",
            },
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
