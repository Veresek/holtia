import uuid
from datetime import date, datetime, time, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.models.time_block import Recurrence
from app.schemas.note import NoteRead
from app.schemas.task import TaskRead
from app.schemas.time_block import TimeBlockRead
from app.schemas.ai import AiPlanResponse, AiSettingsRead
from app.schemas.user import UserRead
from tests.conftest import register, register_verified


def test_read_schemas_serialize_with_camel_case() -> None:
    now = datetime(2026, 8, 31, 18, 0, tzinfo=timezone.utc)
    related_id = uuid.uuid4()
    responses = [
        UserRead.model_validate(
            SimpleNamespace(
                id=uuid.uuid4(),
                email="ada@example.com",
                verified_at=now,
                created_at=now,
            )
        ).model_dump(mode="json"),
        TaskRead.model_validate(
            SimpleNamespace(
                id=uuid.uuid4(),
                title="Plan the day",
                description="",
                done=False,
                date=date(2026, 8, 31),
                time_block_id=related_id,
                sort_order=2,
                created_at=now,
            )
        ).model_dump(mode="json"),
        TimeBlockRead.model_validate(
            SimpleNamespace(
                id=uuid.uuid4(),
                title="Deep work",
                description="",
                date=date(2026, 8, 31),
                start=time(9),
                end=time(11),
                recurrence=Recurrence.WEEKDAYS,
                recurrence_days=[0, 2, 4],
            )
        ).model_dump(mode="json"),
        NoteRead.model_validate(
            SimpleNamespace(
                id=uuid.uuid4(),
                title="Ideas",
                markdown="A note",
                task_id=related_id,
                time_block_id=related_id,
                updated_at=now,
            )
        ).model_dump(mode="json"),
        AiSettingsRead(
            enabled=True,
            configured=True,
            provider="openai",
            model="gpt-4o-mini",
            key_hint="abcd",
            active_key_id=related_id,
            keys=[
                {
                    "id": related_id,
                    "provider": "openai",
                    "model": "gpt-4o-mini",
                    "key_hint": "abcd",
                }
            ],
            models={"openai": [{"id": "gpt-4o-mini", "label": "GPT-4o mini"}]},
        ).model_dump(mode="json"),
        AiPlanResponse(
            reply="I can add this.",
            items=[
                {
                    "kind": "task",
                    "title": "Buy milk",
                    "description": "",
                    "date": date(2026, 9, 5),
                }
            ],
        ).model_dump(mode="json"),
    ]

    assert set(responses[0]) == {"id", "email", "verifiedAt", "createdAt"}
    assert set(responses[1]) == {
        "id",
        "title",
        "description",
        "done",
        "date",
        "timeBlockId",
        "order",
        "createdAt",
    }
    assert set(responses[2]) == {
        "id",
        "title",
        "description",
        "date",
        "start",
        "end",
        "recurrence",
        "recurrenceDays",
    }
    assert set(responses[3]) == {
        "id",
        "title",
        "markdown",
        "taskId",
        "timeBlockId",
        "updatedAt",
    }
    assert set(responses[4]) == {
        "enabled",
        "configured",
        "provider",
        "model",
        "keyHint",
        "activeKeyId",
        "keys",
        "models",
    }
    assert set(responses[5]) == {"reply", "items"}
    assert all("_" not in key for response in responses for key in response)


def test_auth_contract_uses_camel_case(client: TestClient) -> None:
    created = register(client)

    assert created.status_code == 201
    assert set(created.json()) == {"id", "email", "verifiedAt", "createdAt"}

    verified = client.post(
        "/api/auth/verify",
        json={
            "email": "ada@example.com",
            "instanceCode": "test-instance-code",
        },
    )
    assert verified.status_code == 200
    assert set(verified.json()) == {"id", "email", "verifiedAt", "createdAt"}

    reset = client.post(
        "/api/auth/reset",
        json={
            "email": "ada@example.com",
            "instanceCode": "test-instance-code",
            "newPassword": "password2",
        },
    )
    assert reset.status_code == 204


@pytest.mark.parametrize(
    ("path", "payload"),
    [
        (
            "/api/tasks",
            {
                "title": "Plan the day",
                "timeBlockId": "11111111-1111-1111-1111-111111111111",
            },
        ),
        (
            "/api/blocks",
            {
                "title": "Deep work",
                "date": "2026-08-31",
                "start": "09:00:00",
                "end": "11:00:00",
                "recurrence": "weekdays",
                "recurrenceDays": [0, 2, 4],
            },
        ),
        (
            "/api/notes",
            {
                "title": "Ideas",
                "taskId": "11111111-1111-1111-1111-111111111111",
            },
        ),
    ],
)
def test_resource_requests_accept_camel_case(
    client: TestClient,
    path: str,
    payload: dict[str, object],
) -> None:
    register_verified(client)

    response = client.post(path, json=payload)

    expected_status = 201 if path == "/api/blocks" else 404
    assert response.status_code == expected_status
    if path == "/api/blocks":
        body = response.json()
        assert body["title"] == "Deep work"
        assert body["recurrence"] == "weekdays"
        assert body["recurrenceDays"] == [0, 2, 4]
