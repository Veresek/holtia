from __future__ import annotations

import json
from typing import Any

import httpx
from fastapi import HTTPException, status
from pydantic import ValidationError

from app.config import Settings
from app.models.user_ai_settings import AiProvider
from app.schemas.ai import (
    AiBlockProposal,
    AiNoteProposal,
    AiPlanResponse,
    AiProposal,
    AiTaskProposal,
)
from app.schemas.note import NoteCreate
from app.schemas.task import TaskCreate
from app.schemas.time_block import TimeBlockCreate
from app.services.ai.catalog import (
    GEMINI_GENERATE_URL,
    GEMINI_TOOL_CONFIG,
    GEMINI_TOOLS,
    OPENAI_CHAT_URL,
    OPENAI_TOOLS,
    PROPOSE_DAY_CHANGES,
    XAI_CHAT_URL,
    resolve_gemini_model,
)

PROVIDER_REJECTED = "The API key was rejected. Check it on Account."
PROVIDER_RATE_LIMITED = "The model is rate limited. Try again later."
PROVIDER_TIMEOUT = "The assistant did not respond in time. Try again."
PROVIDER_UNAVAILABLE = "The assistant could not complete this request."
UNUSABLE_PLAN = "The assistant returned an unusable plan. Try a shorter request."

_transport: httpx.BaseTransport | None = None


def openai_compatible_url(provider: AiProvider) -> str:
    if provider is AiProvider.XAI:
        return XAI_CHAT_URL
    return OPENAI_CHAT_URL


def request_provider(
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    payload: dict[str, Any],
    timeout: float,
) -> httpx.Response:
    try:
        with httpx.Client(timeout=timeout, transport=_transport) as client:
            return client.request(method, url, headers=headers, json=payload)
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=PROVIDER_TIMEOUT,
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=PROVIDER_UNAVAILABLE,
        ) from exc


def provider_error_text(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except json.JSONDecodeError:
        return ""
    if not isinstance(payload, dict):
        return ""
    error = payload.get("error")
    if isinstance(error, str):
        return error
    if isinstance(error, dict):
        message = error.get("message")
        if isinstance(message, str):
            return message
    return ""


def is_rejected_api_key(response: httpx.Response) -> bool:
    if response.status_code in {401, 403}:
        return True
    if response.status_code != 400:
        return False
    text = provider_error_text(response).lower()
    return "api key" in text or "api_key" in text


def raise_for_provider_status(response: httpx.Response) -> None:
    if is_rejected_api_key(response):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=PROVIDER_REJECTED,
        )
    if response.status_code == 429:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=PROVIDER_RATE_LIMITED,
        )
    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=PROVIDER_UNAVAILABLE,
        )


def parse_json_object(value: str) -> dict[str, Any]:
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=UNUSABLE_PLAN,
        ) from exc
    if not isinstance(parsed, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=UNUSABLE_PLAN,
        )
    return parsed


def empty_date(value: object) -> object:
    if value == "":
        return None
    return value


def parse_task_item(raw: object) -> AiTaskProposal | None:
    if not isinstance(raw, dict):
        return None
    try:
        payload = TaskCreate.model_validate(
            {
                "title": raw.get("title"),
                "description": raw.get("description") or "",
                "date": empty_date(raw.get("date")),
            }
        )
    except ValidationError:
        return None
    return AiTaskProposal(
        title=payload.title,
        description=payload.description,
        date=payload.date,
    )


def parse_note_item(raw: object) -> AiNoteProposal | None:
    if not isinstance(raw, dict):
        return None
    try:
        payload = NoteCreate.model_validate(
            {
                "title": raw.get("title"),
                "markdown": raw.get("markdown") or "",
            }
        )
    except ValidationError:
        return None
    return AiNoteProposal(title=payload.title, markdown=payload.markdown)


def parse_block_item(raw: object) -> AiBlockProposal | None:
    if not isinstance(raw, dict):
        return None
    try:
        payload = TimeBlockCreate.model_validate(
            {
                "title": raw.get("title"),
                "description": raw.get("description") or "",
                "date": raw.get("date"),
                "start": raw.get("start"),
                "end": raw.get("end"),
                "recurrence": "none",
                "recurrenceDays": [],
            }
        )
    except ValidationError:
        return None
    return AiBlockProposal(
        title=payload.title,
        description=payload.description,
        date=payload.date,
        start=payload.start,
        end=payload.end,
    )


def proposals_from_arguments(
    arguments: dict[str, Any],
    *,
    max_proposals: int,
) -> tuple[str, list[AiProposal]]:
    reply = arguments.get("reply")
    if not isinstance(reply, str):
        reply = ""
    reply = reply.strip()
    items: list[AiProposal] = []
    for raw in arguments.get("tasks") or []:
        parsed = parse_task_item(raw)
        if parsed is not None:
            items.append(parsed)
    for raw in arguments.get("notes") or []:
        parsed = parse_note_item(raw)
        if parsed is not None:
            items.append(parsed)
    for raw in arguments.get("blocks") or []:
        parsed = parse_block_item(raw)
        if parsed is not None:
            items.append(parsed)
    return reply, items[:max_proposals]


def plan_from_arguments(
    arguments: dict[str, Any],
    *,
    fallback_reply: str,
    max_proposals: int,
) -> AiPlanResponse:
    reply, items = proposals_from_arguments(
        arguments,
        max_proposals=max_proposals,
    )
    message = reply or fallback_reply.strip()
    if not message and not items:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=UNUSABLE_PLAN,
        )
    return AiPlanResponse(reply=message, items=items)


def openai_compatible_plan(
    payload: dict[str, Any],
    *,
    fallback_reply: str,
    max_proposals: int,
) -> AiPlanResponse:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=UNUSABLE_PLAN,
        )
    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    if not isinstance(message, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=UNUSABLE_PLAN,
        )
    content = message.get("content")
    text = content.strip() if isinstance(content, str) else ""
    tool_calls = message.get("tool_calls")
    if isinstance(tool_calls, list):
        for call in tool_calls:
            if not isinstance(call, dict):
                continue
            function = call.get("function")
            if not isinstance(function, dict):
                continue
            if function.get("name") != PROPOSE_DAY_CHANGES:
                continue
            arguments = function.get("arguments")
            if isinstance(arguments, dict):
                parsed = arguments
            elif isinstance(arguments, str):
                parsed = parse_json_object(arguments)
            else:
                continue
            return plan_from_arguments(
                parsed,
                fallback_reply=text or fallback_reply,
                max_proposals=max_proposals,
            )
    if text:
        return AiPlanResponse(reply=text, items=[])
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=UNUSABLE_PLAN,
    )


def gemini_plan(
    payload: dict[str, Any],
    *,
    fallback_reply: str,
    max_proposals: int,
) -> AiPlanResponse:
    candidates = payload.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=UNUSABLE_PLAN,
        )
    content = candidates[0].get("content") if isinstance(candidates[0], dict) else None
    parts = content.get("parts") if isinstance(content, dict) else None
    if not isinstance(parts, list):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=UNUSABLE_PLAN,
        )
    texts: list[str] = []
    for part in parts:
        if not isinstance(part, dict):
            continue
        if part.get("thought") is True:
            continue
        text = part.get("text")
        if isinstance(text, str) and text.strip():
            texts.append(text.strip())
        function_call = part.get("functionCall") or part.get("function_call")
        if not isinstance(function_call, dict):
            continue
        if function_call.get("name") != PROPOSE_DAY_CHANGES:
            continue
        arguments = function_call.get("args") or function_call.get("arguments")
        if isinstance(arguments, str):
            arguments = parse_json_object(arguments)
        if not isinstance(arguments, dict):
            continue
        return plan_from_arguments(
            arguments,
            fallback_reply=" ".join(texts) or fallback_reply,
            max_proposals=max_proposals,
        )
    if texts:
        return AiPlanResponse(reply=" ".join(texts), items=[])
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=UNUSABLE_PLAN,
    )


def complete_openai_compatible(
    *,
    provider: AiProvider,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    settings: Settings,
) -> AiPlanResponse:
    response = request_provider(
        "POST",
        openai_compatible_url(provider),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        payload={
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "tools": OPENAI_TOOLS,
            "tool_choice": "auto",
            "max_tokens": settings.ai_max_output_tokens,
        },
        timeout=settings.ai_request_timeout_seconds,
    )
    raise_for_provider_status(response)
    try:
        payload = response.json()
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=UNUSABLE_PLAN,
        ) from exc
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=UNUSABLE_PLAN,
        )
    return openai_compatible_plan(
        payload,
        fallback_reply="",
        max_proposals=settings.ai_max_proposals,
    )


def gemini_generation_config(model: str, settings: Settings) -> dict[str, Any]:
    config: dict[str, Any] = {
        "maxOutputTokens": settings.ai_max_output_tokens,
    }
    name = model.lower()
    if "pro" in name:
        # Pro cannot use MINIMAL thinking; leave room for thoughts plus the tool call.
        config["maxOutputTokens"] = max(settings.ai_max_output_tokens, 16_384)
        config["thinkingConfig"] = {"thinkingLevel": "LOW"}
    else:
        # Flash thinks by default; those tokens eat maxOutputTokens and the
        # response comes back with no parts, which we surface as 502.
        config["thinkingConfig"] = {"thinkingLevel": "MINIMAL"}
    return config


def complete_gemini(
    *,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    settings: Settings,
) -> AiPlanResponse:
    response = request_provider(
        "POST",
        GEMINI_GENERATE_URL.format(model=model),
        headers={
            "x-goog-api-key": api_key,
            "Content-Type": "application/json",
        },
        payload={
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            "tools": GEMINI_TOOLS,
            "toolConfig": GEMINI_TOOL_CONFIG,
            "generationConfig": gemini_generation_config(model, settings),
        },
        timeout=settings.ai_request_timeout_seconds,
    )
    raise_for_provider_status(response)
    try:
        payload = response.json()
    except json.JSONDecodeError as extra:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=UNUSABLE_PLAN,
        ) from extra
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=UNUSABLE_PLAN,
        )
    return gemini_plan(
        payload,
        fallback_reply="",
        max_proposals=settings.ai_max_proposals,
    )


def complete_plan(
    *,
    provider: AiProvider,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    settings: Settings,
) -> AiPlanResponse:
    if provider is AiProvider.GEMINI:
        return complete_gemini(
            api_key=api_key,
            model=resolve_gemini_model(model),
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            settings=settings,
        )
    return complete_openai_compatible(
        provider=provider,
        api_key=api_key,
        model=model,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        settings=settings,
    )
