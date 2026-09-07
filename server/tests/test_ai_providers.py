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
        model="gpt-5.6-luna",
        system_prompt="system",
        user_prompt="user",
        settings=plan_settings(),
    )

    assert captured["url"] == "https://api.openai.com/v1/chat/completions"
    assert captured["authorization"] == "Bearer sk-test-openai-secret-key-value"
    body = captured["body"]
    assert isinstance(body, dict)
    assert body["model"] == "gpt-5.6-luna"
    assert body["max_completion_tokens"] == 256
    assert body["reasoning_effort"] == "low"
    assert "max_tokens" not in body
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
        model="gpt-5.6-luna",
        system_prompt="system",
        user_prompt="user",
        settings=plan_settings(),
    )

    assert result.reply == "What time should this start?"
    assert result.items == []


def test_xai_uses_the_xai_host(restore_transport) -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["host"] = request.url.host
        captured["body"] = json.loads(request.content)
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
    body = captured["body"]
    assert isinstance(body, dict)
    assert body["model"] == "grok-4.3"
    assert body["max_tokens"] == 256
    assert "reasoning_effort" not in body
    assert result.items[0].kind == "task"


def test_deepseek_uses_the_deepseek_host(restore_transport) -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["host"] = request.url.host
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json=openai_body({"reply": "Noted.", "tasks": [{"title": "Draft notes"}]}),
        )

    providers._transport = httpx.MockTransport(handler)
    result = complete_plan(
        provider=AiProvider.DEEPSEEK,
        api_key="sk-deepseek-test-key",
        model="deepseek-v4-flash",
        system_prompt="system",
        user_prompt="user",
        settings=plan_settings(),
    )

    assert captured["host"] == "api.deepseek.com"
    body = captured["body"]
    assert isinstance(body, dict)
    assert body["model"] == "deepseek-v4-flash"
    assert body["thinking"] == {"type": "disabled"}
    assert result.items[0].kind == "task"


def test_gemini_function_call(restore_transport) -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
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
        model="gemini-3.8-flash",
        system_prompt="system",
        user_prompt="user",
        settings=plan_settings(),
    )

    body = captured["body"]
    assert isinstance(body, dict)
    assert body["generationConfig"]["thinkingConfig"] == {"thinkingLevel": "MINIMAL"}
    assert body["toolConfig"]["functionCallingConfig"]["mode"] == "ANY"
    assert result.reply == "A note for later."
    assert result.items[0].kind == "note"


def test_gemini_retired_flash_id_is_rewritten(restore_transport) -> None:
    captured: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["thinking"] = json.loads(request.content)["generationConfig"][
            "thinkingConfig"
        ]["thinkingLevel"]
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
                                        "args": {"reply": "Noted."},
                                    }
                                }
                            ]
                        }
                    }
                ]
            },
        )

    providers._transport = httpx.MockTransport(handler)
    complete_plan(
        provider=AiProvider.GEMINI,
        api_key="AIza-test-key",
        model="gemini-2.5-flash",
        system_prompt="system",
        user_prompt="user",
        settings=plan_settings(),
    )

    assert "models/gemini-3.8-flash:generateContent" in captured["url"]
    assert captured["thinking"] == "MINIMAL"


def test_gemini_flash_lite_and_gemma_use_minimal_thinking(restore_transport) -> None:
    captured: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["thinking"] = json.loads(request.content)["generationConfig"][
            "thinkingConfig"
        ]["thinkingLevel"]
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
                                        "args": {"reply": "Noted."},
                                    }
                                }
                            ]
                        }
                    }
                ]
            },
        )

    providers._transport = httpx.MockTransport(handler)
    complete_plan(
        provider=AiProvider.GEMINI,
        api_key="AIza-test-key",
        model="gemma-4-31b-it",
        system_prompt="system",
        user_prompt="user",
        settings=plan_settings(),
    )

    assert "models/gemma-4-31b-it:generateContent" in captured["url"]
    assert captured["thinking"] == "MINIMAL"


def test_anthropic_tool_use_builds_validated_items(restore_transport) -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["api_key"] = request.headers["x-api-key"]
        captured["version"] = request.headers["anthropic-version"]
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "content": [
                    {"type": "thinking", "thinking": "internal scratchpad"},
                    {
                        "type": "tool_use",
                        "name": "propose_day_changes",
                        "input": {
                            "reply": "I can add these.",
                            "tasks": [{"title": "Write tests", "date": "2026-09-05"}],
                            "notes": [{"title": "Stand-up", "markdown": "- agenda"}],
                        },
                    },
                ]
            },
        )

    providers._transport = httpx.MockTransport(handler)
    result = complete_plan(
        provider=AiProvider.ANTHROPIC,
        api_key="sk-ant-test-secret-key-value",
        model="claude-sonnet-5",
        system_prompt="system",
        user_prompt="user",
        settings=plan_settings(),
    )

    assert captured["url"] == "https://api.anthropic.com/v1/messages"
    assert captured["api_key"] == "sk-ant-test-secret-key-value"
    assert captured["version"] == "2023-06-01"
    body = captured["body"]
    assert isinstance(body, dict)
    assert body["model"] == "claude-sonnet-5"
    assert body["max_tokens"] == 8_192
    assert body["system"] == "system"
    assert body["tool_choice"] == {"type": "auto"}
    assert result.reply == "I can add these."
    assert [item.kind for item in result.items] == ["task", "note"]
    assert "scratchpad" not in result.reply


def test_anthropic_text_only_is_a_clarifying_question(restore_transport) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        del request
        return httpx.Response(
            200,
            json={
                "content": [
                    {"type": "text", "text": "What time should this start?"},
                ]
            },
        )

    providers._transport = httpx.MockTransport(handler)
    result = complete_plan(
        provider=AiProvider.ANTHROPIC,
        api_key="sk-ant-test",
        model="claude-haiku-4-5",
        system_prompt="system",
        user_prompt="user",
        settings=plan_settings(),
    )

    assert result.reply == "What time should this start?"
    assert result.items == []


def test_openai_gpt_4_1_skips_reasoning_effort(restore_transport) -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "What time should this start?"}}]},
        )

    providers._transport = httpx.MockTransport(handler)
    complete_plan(
        provider=AiProvider.OPENAI,
        api_key="sk-test",
        model="gpt-4.1",
        system_prompt="system",
        user_prompt="user",
        settings=plan_settings(),
    )

    body = captured["body"]
    assert isinstance(body, dict)
    assert body["max_completion_tokens"] == 256
    assert "reasoning_effort" not in body
    assert "max_tokens" not in body


def test_gemini_pro_leaves_room_for_thinking(restore_transport) -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.content)
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
                                        "args": {"reply": "Noted."},
                                    }
                                }
                            ]
                        }
                    }
                ]
            },
        )

    providers._transport = httpx.MockTransport(handler)
    complete_plan(
        provider=AiProvider.GEMINI,
        api_key="AIza-test-key",
        model="gemini-3.1-pro-preview",
        system_prompt="system",
        user_prompt="user",
        settings=plan_settings(),
    )

    body = captured["body"]
    assert isinstance(body, dict)
    assert body["generationConfig"]["maxOutputTokens"] == 16_384
    assert body["generationConfig"]["thinkingConfig"] == {"thinkingLevel": "LOW"}


def test_gemini_ignores_thought_parts(restore_transport) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        del request
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {"thought": True, "text": "internal scratchpad"},
                                {
                                    "functionCall": {
                                        "name": "propose_day_changes",
                                        "args": {
                                            "reply": "I can add a task.",
                                            "tasks": [{"title": "Call the bank"}],
                                        },
                                    }
                                },
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

    assert result.reply == "I can add a task."
    assert "scratchpad" not in result.reply
    assert result.items[0].title == "Call the bank"


def test_gemini_empty_parts_is_unusable(restore_transport) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        del request
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {"role": "model"},
                        "finishReason": "MAX_TOKENS",
                    }
                ]
            },
        )

    providers._transport = httpx.MockTransport(handler)
    with pytest.raises(HTTPException) as raised:
        complete_plan(
            provider=AiProvider.GEMINI,
            api_key="AIza-test-key",
            model="gemini-2.5-flash",
            system_prompt="system",
            user_prompt="user",
            settings=plan_settings(),
        )

    assert raised.value.status_code == 502
    assert raised.value.detail == UNUSABLE_PLAN


def test_gemini_invalid_key_is_mapped(restore_transport) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        del request
        return httpx.Response(
            400,
            json={
                "error": {
                    "code": 400,
                    "message": "API key not valid. Please pass a valid API key.",
                    "status": "INVALID_ARGUMENT",
                }
            },
        )

    providers._transport = httpx.MockTransport(handler)
    with pytest.raises(HTTPException) as raised:
        complete_plan(
            provider=AiProvider.GEMINI,
            api_key="AIza-bad-key",
            model="gemini-2.5-flash",
            system_prompt="system",
            user_prompt="user",
            settings=plan_settings(),
        )

    assert raised.value.status_code == 400
    assert raised.value.detail == PROVIDER_REJECTED
    assert "API key not valid" not in str(raised.value.detail)


def test_invalid_tool_json_is_unusable(restore_transport) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        del request
        return httpx.Response(200, json=openai_body("not-json{"))

    providers._transport = httpx.MockTransport(handler)
    with pytest.raises(HTTPException) as raised:
        complete_plan(
            provider=AiProvider.OPENAI,
            api_key="sk-test",
            model="gpt-5.6-luna",
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
            model="gpt-5.6-luna",
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
            model="gpt-5.6-luna",
            system_prompt="system",
            user_prompt="user",
            settings=plan_settings(),
        )

    assert raised.value.status_code == 504
    assert raised.value.detail == PROVIDER_TIMEOUT
