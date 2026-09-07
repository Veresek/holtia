import json
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.db import SessionLocal
from app.models.user_ai_settings import UserAiSettings
from app.services.ai import providers
from app.services.ai.crypto import decrypt_api_key, parse_encryption_key
from app.services.ai.credentials import AI_DISABLED, KEY_NOT_CONFIGURED, UNKNOWN_MODEL
from tests.conftest import (
    TEST_AI_ENCRYPTION_KEY,
    enable_ai,
    login,
    register_verified,
)

SECRET_KEY = "sk-test-openai-secret-key-value"
SECOND_KEY = "xai-test-secret-key-value-wxyz"


def save_openai_key(client: TestClient, api_key: str = SECRET_KEY) -> dict:
    enable_ai()
    response = client.post(
        "/api/ai/keys",
        json={
            "provider": "openai",
            "model": "gpt-5.6-luna",
            "apiKey": api_key,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_settings_are_disabled_by_default(client: TestClient) -> None:
    register_verified(client)
    response = client.get("/api/ai/settings")

    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is False
    assert body["configured"] is False
    assert body["provider"] is None
    assert body["keyHint"] is None
    assert "openai" in body["models"]
    assert "anthropic" in body["models"]
    assert "gemini" in body["models"]
    assert "deepseek" in body["models"]
    assert "xai" in body["models"]
    assert body["models"]["openai"][0]["id"] == "gpt-5.6-luna"
    assert body["models"]["anthropic"][0]["id"] == "claude-haiku-4-5"
    assert body["models"]["deepseek"][0]["id"] == "deepseek-v4-flash"
    gemini_ids = [option["id"] for option in body["models"]["gemini"]]
    assert "gemini-3.5-flash-lite" in gemini_ids
    assert "gemma-4-31b-it" in gemini_ids


def test_settings_require_authentication(client: TestClient) -> None:
    key_id = "11111111-1111-1111-1111-111111111111"
    assert client.get("/api/ai/settings").status_code == 401
    assert client.post("/api/ai/keys", json={}).status_code == 401
    assert client.patch(f"/api/ai/keys/{key_id}", json={}).status_code == 401
    assert client.delete(f"/api/ai/keys/{key_id}").status_code == 401
    assert client.put(f"/api/ai/keys/{key_id}/active").status_code == 401
    assert client.post("/api/ai/plan", json={"prompt": "hi"}).status_code == 401


def test_mutations_are_hidden_when_ai_is_disabled(client: TestClient) -> None:
    register_verified(client)
    response = client.post(
        "/api/ai/keys",
        json={
            "provider": "openai",
            "model": "gpt-5.6-luna",
            "apiKey": SECRET_KEY,
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"] == AI_DISABLED
    assert client.post("/api/ai/plan", json={"prompt": "Plan today"}).status_code == 404


def test_put_settings_stores_encrypted_key_and_redacts_it(
    client: TestClient,
) -> None:
    ada = register_verified(client).json()
    save_openai_key(client)
    response = client.get("/api/ai/settings")

    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is True
    assert body["configured"] is True
    assert body["provider"] == "openai"
    assert body["model"] == "gpt-5.6-luna"
    assert body["keyHint"] == "alue"
    assert body["activeKeyId"] == body["keys"][0]["id"]
    assert body["keys"] == [
        {
            "id": body["activeKeyId"],
            "provider": "openai",
            "model": "gpt-5.6-luna",
            "keyHint": "alue",
        }
    ]
    dumped = json.dumps(body)
    assert SECRET_KEY not in dumped
    assert "sk-test" not in dumped

    with SessionLocal() as db:
        stored = db.scalar(
            select(UserAiSettings).where(
                UserAiSettings.user_id == uuid.UUID(ada["id"])
            )
        )
        assert stored is not None
        assert SECRET_KEY.encode() not in stored.key_ciphertext
        key = parse_encryption_key(TEST_AI_ENCRYPTION_KEY)
        assert decrypt_api_key(stored.key_ciphertext, stored.key_nonce, key) == SECRET_KEY


def test_unknown_model_is_rejected(client: TestClient) -> None:
    register_verified(client)
    enable_ai()
    response = client.post(
        "/api/ai/keys",
        json={
            "provider": "openai",
            "model": "gpt-not-a-model",
            "apiKey": SECRET_KEY,
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == UNKNOWN_MODEL


def test_legacy_model_alias_can_still_be_saved(client: TestClient) -> None:
    register_verified(client)
    enable_ai()
    response = client.post(
        "/api/ai/keys",
        json={
            "provider": "openai",
            "model": "gpt-4o-mini",
            "apiKey": SECRET_KEY,
        },
    )

    assert response.status_code == 201, response.text
    assert response.json()["model"] == "gpt-4o-mini"


def test_anthropic_and_deepseek_keys_can_be_saved(client: TestClient) -> None:
    register_verified(client)
    enable_ai()
    anthropic = client.post(
        "/api/ai/keys",
        json={
            "provider": "anthropic",
            "model": "claude-sonnet-5",
            "apiKey": "sk-ant-test-secret-key-value",
        },
    )
    assert anthropic.status_code == 201, anthropic.text
    assert anthropic.json()["provider"] == "anthropic"
    assert anthropic.json()["model"] == "claude-sonnet-5"

    deepseek = client.post(
        "/api/ai/keys",
        json={
            "provider": "deepseek",
            "model": "deepseek-v4-flash",
            "apiKey": "sk-deepseek-test-secret-key",
        },
    )
    assert deepseek.status_code == 201, deepseek.text
    assert deepseek.json()["provider"] == "deepseek"
    assert deepseek.json()["model"] == "deepseek-v4-flash"
    assert {key["provider"] for key in deepseek.json()["keys"]} == {
        "anthropic",
        "deepseek",
    }


def test_settings_are_isolated_per_user(client: TestClient) -> None:
    register_verified(client, "ada@example.com")
    save_openai_key(client)
    register_verified(client, "grace@example.com")
    login(client, "grace@example.com")
    enable_ai()

    response = client.get("/api/ai/settings")
    assert response.json()["configured"] is False
    assert response.json()["keyHint"] is None


def test_delete_settings_removes_the_key(client: TestClient) -> None:
    register_verified(client)
    body = save_openai_key(client)
    key_id = body["activeKeyId"]
    deleted = client.delete(f"/api/ai/keys/{key_id}")

    assert deleted.status_code == 200
    assert deleted.json()["configured"] is False
    assert deleted.json()["keys"] == []
    assert client.get("/api/ai/settings").json()["configured"] is False
    assert client.get("/api/ai/settings").json()["keys"] == []


def test_a_second_key_becomes_active_and_can_be_switched(
    client: TestClient,
) -> None:
    register_verified(client)
    first = save_openai_key(client)
    first_id = first["activeKeyId"]
    enable_ai()
    second = client.post(
        "/api/ai/keys",
        json={
            "provider": "xai",
            "model": "grok-4.3",
            "apiKey": SECOND_KEY,
        },
    )
    assert second.status_code == 201, second.text
    body = second.json()
    second_id = body["activeKeyId"]
    assert second_id != first_id
    assert body["provider"] == "xai"
    assert body["keyHint"] == "wxyz"
    assert {key["id"] for key in body["keys"]} == {first_id, second_id}

    activated = client.put(f"/api/ai/keys/{first_id}/active")
    assert activated.status_code == 200
    assert activated.json()["activeKeyId"] == first_id
    assert activated.json()["provider"] == "openai"

    deleted = client.delete(f"/api/ai/keys/{first_id}")
    assert deleted.status_code == 200
    assert deleted.json()["activeKeyId"] == second_id
    assert deleted.json()["keys"] == [
        {
            "id": second_id,
            "provider": "xai",
            "model": "grok-4.3",
            "keyHint": "wxyz",
        }
    ]


def test_patch_key_can_keep_the_secret(client: TestClient) -> None:
    register_verified(client)
    body = save_openai_key(client)
    key_id = body["activeKeyId"]
    updated = client.patch(
        f"/api/ai/keys/{key_id}",
        json={"model": "gpt-5.6-sol"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["model"] == "gpt-5.6-sol"
    assert updated.json()["keyHint"] == "alue"
    with SessionLocal() as db:
        stored = db.scalar(
            select(UserAiSettings).where(UserAiSettings.id == uuid.UUID(key_id))
        )
        assert stored is not None
        key = parse_encryption_key(TEST_AI_ENCRYPTION_KEY)
        assert decrypt_api_key(stored.key_ciphertext, stored.key_nonce, key) == SECRET_KEY


def test_plan_requires_a_saved_key(client: TestClient) -> None:
    register_verified(client)
    enable_ai()
    response = client.post("/api/ai/plan", json={"prompt": "Add a task to buy milk"})

    assert response.status_code == 400
    assert response.json()["detail"] == KEY_NOT_CONFIGURED


def test_plan_returns_proposals_and_keeps_the_key_off_the_wire(
    client: TestClient,
    monkeypatch,
) -> None:
    register_verified(client)
    save_openai_key(client)
    today = datetime.now(ZoneInfo("Europe/Warsaw")).date().isoformat()
    client.post(
        "/api/tasks",
        json={"title": "Existing", "date": today},
    )

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        user_message = body["messages"][1]["content"]
        assert "Existing" in user_message
        assert SECRET_KEY not in user_message
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "tool_calls": [
                                {
                                    "function": {
                                        "name": "propose_day_changes",
                                        "arguments": json.dumps(
                                            {
                                                "reply": "I can add a grocery task.",
                                                "tasks": [
                                                    {
                                                        "title": "Buy milk",
                                                        "date": "2026-09-05",
                                                    }
                                                ],
                                            }
                                        ),
                                    }
                                }
                            ]
                        }
                    }
                ]
            },
        )

    monkeypatch.setattr(providers, "_transport", httpx.MockTransport(handler))
    response = client.post("/api/ai/plan", json={"prompt": "Add a task to buy milk"})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["reply"] == "I can add a grocery task."
    assert body["items"] == [
        {
            "kind": "task",
            "title": "Buy milk",
            "description": "",
            "date": "2026-09-05",
        }
    ]
    assert SECRET_KEY not in json.dumps(body)


def test_plan_prompt_length_is_limited(client: TestClient) -> None:
    register_verified(client)
    save_openai_key(client)
    enable_ai(ai_prompt_max_length=8)
    response = client.post("/api/ai/plan", json={"prompt": "this is too long"})

    assert response.status_code == 422
    assert response.json()["detail"] == "The prompt is too long."


def test_plan_is_rate_limited_per_user(client: TestClient, monkeypatch) -> None:
    register_verified(client)
    save_openai_key(client)
    enable_ai(auth_rate_limit_enabled=True, ai_rate_limit_requests=1)

    def handler(request: httpx.Request) -> httpx.Response:
        del request
        return httpx.Response(
            200,
            json={
                "choices": [
                    {"message": {"content": "What should the title be?"}}
                ]
            },
        )

    monkeypatch.setattr(providers, "_transport", httpx.MockTransport(handler))
    first = client.post("/api/ai/plan", json={"prompt": "Help me plan"})
    second = client.post("/api/ai/plan", json={"prompt": "Help me plan"})

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.headers["Retry-After"]


def test_delete_account_removes_ai_settings(client: TestClient) -> None:
    ada = register_verified(client).json()
    save_openai_key(client)
    deleted = client.delete("/api/users/me")

    assert deleted.status_code == 204
    with SessionLocal() as db:
        count = db.scalar(select(func.count()).select_from(UserAiSettings))
        assert count == 0
        leftover = db.scalar(
            select(func.count())
            .select_from(UserAiSettings)
            .where(UserAiSettings.user_id == uuid.UUID(ada["id"]))
        )
        assert leftover == 0
