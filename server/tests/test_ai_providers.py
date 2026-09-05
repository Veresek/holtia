import json

import httpx
import pytest
from fastapi import HTTPException

from app.config import Settings
from app.models.user_ai_settings import AiProvider
from app.services.ai import providers
from app.services.ai.providers import (
    PROVIDER_REJECTED,
    PROVIDER_TIMEOUT,
    UNUSABLE_PLAN,
    complete_plan,
)
from tests.conftest import TEST_AI_ENCRYPTION_KEY


def plan_settings() -> Settings:
    return Settings(
        environment="test",
        ai_enabled=True,
        ai_encryption_key=TEST_AI_ENCRYPTION_KEY,
        ai_max_proposals=2,
        ai_max_output_tokens=256,
        ai_request_timeout_seconds=5,
    )


def openai_body(arguments: dict | str, content: str | None = None) -> dict:
    return {
        "choices": [
            {
                "message": {
                    "content": content,
                    "tool_calls": [
                        {
                            "function": {
                                "name": "propose_day_changes",
                                "arguments": arguments
                                if isinstance(arguments, str)
                                else json.dumps(arguments),
                            }
                        }
                    ],
                }
            }
        ]
    }


@pytest.fixture
def restore_transport():
    original = providers._transport
    yield
    providers._transport = original


def test_openai_tool_call_builds_validated_items(restore_transport) -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["authorization"] = request.headers["Authorization"]
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json=openai_body(
                {
                    "reply": "I can add these.",
                    "tasks": [
                        {"title": "Write tests", "date": "2026-09-05"},
                        {"title": ""},
                    ],
                    "notes": [{"title": "Stand-up", "markdown": "- agenda"}],
                    "blocks": [
                        {
                            "title": "Deep work",
                            "date": "2026-09-05",
                            "start": "09:00",
                            "end": "11:00",
                        },
                        {
                            "title": "Broken",
                            "date": "2026-09-05",
                            "start": "12:00",
                            "end": "12:00",
                        },
                    ],
                }
            ),
        )

    providers._transport = httpx.MockTransport(handler)
    result = complete_plan(
        provider=AiProvider.OPENAI,
        api_key="sk-test-openai-secret-key-value",
        model="gpt-4o-mini",
        system_prompt="system",
        user_prompt="user",
        settings=plan_settings(),
    )

    assert captured["url"] == "https://api.openai.com/v1/chat/completions"
    assert captured["authorization"] == "Bearer sk-test-openai-secret-key-value"
    assert result.reply == "I can add these."
    assert [item.kind for item in result.items] == ["task", "note"]
    assert result.items[0].title == "Write tests"
    assert result.items[1].title == "Stand-up"


def test_openai_text_only_is_a_clarifying_question(restore_transport) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        del request
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "What time should this start?"}}]},
        )

    providers._transport = httpx.MockTransport(handler)
    result = complete_plan(
        provider=AiProvider.OPENAI,
        api_key="sk-test",
        model="gpt-4o-mini",
        system_prompt="system",
        user_prompt="user",
        settings=plan_settings(),
    )

    assert result.reply == "What time should this start?"
    assert result.items == []


def test_xai_uses_the_xai_host(restore_transport) -> None:
    captured: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["host"] = request.url.host
        return httpx.Response(
            200,
            json=openai_body({"reply": "Noted.", "tasks": [{"title": "Call bank"}]}),
        )

    providers._transport = httpx.MockTransport(handler)
    result = complete_plan(
        provider=AiProvider.XAI,
        api_key="xai-test-key",
        model="grok-3-mini",
        system_prompt="system",
        user_prompt="user",
        settings=plan_settings(),
    )

    assert captured["host"] == "api.x.ai"
    assert result.items[0].kind == "task"


def test_gemini_function_call(restore_transport) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "generativelanguage.googleapis.com"
        assert "key=" not in str(request.url)
        assert request.headers["x-goog-api-key"] == "AIza-test-key"
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "functionCall": {
                                        "name": "propose_day_changes",
                                        "args": {
                                            "reply": "A note for later.",
                                            "notes": [{"title": "Ideas"}],
                                        },
                                    }
                                }
                            ]
                        }
                    }
                ]
            },
        )

    providers._transport = httpx.MockTransport(handler)
    result = complete_plan(
        provider=AiProvider.GEMINI,
        api_key="AIza-test-key",
        model="gemini-2.5-flash",
        system_prompt="system",
        user_prompt="user",
        settings=plan_settings(),
    )

    assert result.reply == "A note for later."
    assert result.items[0].kind == "note"


def test_invalid_tool_json_is_unusable(restore_transport) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        del request
        return httpx.Response(200, json=openai_body("not-json{"))

    providers._transport = httpx.MockTransport(handler)
    with pytest.raises(HTTPException) as raised:
        complete_plan(
            provider=AiProvider.OPENAI,
            api_key="sk-test",
            model="gpt-4o-mini",
            system_prompt="system",
            user_prompt="user",
            settings=plan_settings(),
        )

    assert raised.value.status_code == 502
    assert raised.value.detail == UNUSABLE_PLAN


def test_provider_401_is_mapped(restore_transport) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        del request
        return httpx.Response(401, json={"error": "nope"})

    providers._transport = httpx.MockTransport(handler)
    with pytest.raises(HTTPException) as raised:
        complete_plan(
            provider=AiProvider.OPENAI,
            api_key="sk-bad",
            model="gpt-4o-mini",
            system_prompt="system",
            user_prompt="user",
            settings=plan_settings(),
        )

    assert raised.value.status_code == 400
    assert raised.value.detail == PROVIDER_REJECTED
    assert "nope" not in str(raised.value.detail)


def test_timeout_is_mapped(restore_transport) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        del request
        raise httpx.TimeoutException("slow")

    providers._transport = httpx.MockTransport(handler)
    with pytest.raises(HTTPException) as raised:
        complete_plan(
            provider=AiProvider.OPENAI,
            api_key="sk-test",
            model="gpt-4o-mini",
            system_prompt="system",
            user_prompt="user",
            settings=plan_settings(),
        )

    assert raised.value.status_code == 504
    assert raised.value.detail == PROVIDER_TIMEOUT
