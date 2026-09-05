import uuid

import pytest
from fastapi.testclient import TestClient

from tests.conftest import login, register_verified


def create_note(
    client: TestClient,
    title: str,
    *,
    markdown: str = "",
    task_id: str | None = None,
) -> dict[str, object]:
    payload: dict[str, object] = {"title": title, "markdown": markdown}
    if task_id is not None:
        payload["taskId"] = task_id
    response = client.post("/api/notes", json=payload)
    assert response.status_code == 201
    return response.json()


def test_note_crud_trims_title_and_preserves_markdown(
    client: TestClient,
) -> None:
    register_verified(client)
    task = client.post("/api/tasks", json={"title": "Related task"}).json()

    created = client.post(
        "/api/notes",
        json={
            "title": "  Meeting notes  ",
            "markdown": "# Decisions\n\n- Keep the scope small\n",
            "taskId": task["id"],
        },
    )

    assert created.status_code == 201
    note = created.json()
    assert note["title"] == "Meeting notes"
    assert note["markdown"] == "# Decisions\n\n- Keep the scope small\n"
    assert note["taskId"] == task["id"]
    assert note["timeBlockId"] is None
    assert set(note) == {
        "id",
        "title",
        "markdown",
        "taskId",
        "timeBlockId",
        "updatedAt",
    }

    fetched = client.get(f"/api/notes/{note['id']}")
    assert fetched.status_code == 200
    assert fetched.json() == note

    updated = client.patch(
        f"/api/notes/{note['id']}",
        json={
            "title": "  Final decisions ",
            "markdown": "",
            "taskId": None,
        },
    )
    assert updated.status_code == 200
    assert updated.json() | {"updatedAt": note["updatedAt"]} == {
        **note,
        "title": "Final decisions",
        "markdown": "",
        "taskId": None,
    }

    deleted = client.delete(f"/api/notes/{note['id']}")
    assert deleted.status_code == 204
    assert client.get(f"/api/notes/{note['id']}").status_code == 404


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"title": ""},
        {"title": "   "},
        {"title": "x" * 256},
        {"title": "Valid", "markdown": "x" * 100_001},
    ],
)
def test_create_validates_note_fields(
    client: TestClient,
    payload: dict[str, object],
) -> None:
    register_verified(client)

    response = client.post("/api/notes", json=payload)

    assert response.status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {"title": None},
        {"markdown": None},
        {"title": "   "},
        {"title": "x" * 256},
        {"markdown": "x" * 100_001},
    ],
)
def test_patch_rejects_invalid_note_fields(
    client: TestClient,
    payload: dict[str, object],
) -> None:
    register_verified(client)
    note = create_note(client, "Keep this valid")

    response = client.patch(f"/api/notes/{note['id']}", json=payload)

    assert response.status_code == 422


def test_note_task_must_belong_to_current_user(client: TestClient) -> None:
    register_verified(client, "ada@example.com")
    task = client.post("/api/tasks", json={"title": "Ada’s task"}).json()

    register_verified(client, "grace@example.com")

    response = client.post(
        "/api/notes",
        json={"title": "Not allowed", "taskId": task["id"]},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Task not found."


def test_notes_are_isolated_between_users(client: TestClient) -> None:
    register_verified(client, "ada@example.com")
    adas_note = create_note(client, "Ada’s private note")

    register_verified(client, "grace@example.com")
    graces_note = create_note(client, "Grace’s private note")

    assert [note["id"] for note in client.get("/api/notes").json()] == [
        graces_note["id"]
    ]
    for method in ("get", "patch", "delete"):
        request = getattr(client, method)
        kwargs = {"json": {"title": "Changed"}} if method == "patch" else {}
        response = request(f"/api/notes/{adas_note['id']}", **kwargs)
        assert response.status_code == 404

    assert login(client, "ada@example.com").status_code == 200
    assert [note["id"] for note in client.get("/api/notes").json()] == [
        adas_note["id"]
    ]
    assert client.get(f"/api/notes/{uuid.uuid4()}").status_code == 404


def test_note_can_pin_to_a_time_block(client: TestClient) -> None:
    register_verified(client)
    block = client.post(
        "/api/blocks",
        json={
            "title": "Deep work",
            "date": "2026-08-31",
            "start": "09:00:00",
            "end": "11:00:00",
        },
    ).json()

    created = client.post(
        "/api/notes",
        json={"title": "Session notes", "timeBlockId": block["id"]},
    )
    assert created.status_code == 201
    note = created.json()
    assert note["timeBlockId"] == block["id"]
    assert note["taskId"] is None

    updated = client.patch(
        f"/api/notes/{note['id']}",
        json={"timeBlockId": None},
    )
    assert updated.status_code == 200
    assert updated.json()["timeBlockId"] is None


def test_note_time_block_must_belong_to_current_user(client: TestClient) -> None:
    register_verified(client, "ada@example.com")
    block = client.post(
        "/api/blocks",
        json={
            "title": "Ada’s block",
            "date": "2026-08-31",
            "start": "09:00:00",
            "end": "10:00:00",
        },
    ).json()

    register_verified(client, "grace@example.com")
    response = client.post(
        "/api/notes",
        json={"title": "Not allowed", "timeBlockId": block["id"]},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Time block not found."


def test_deleting_a_block_clears_note_pin(client: TestClient) -> None:
    register_verified(client)
    block = client.post(
        "/api/blocks",
        json={
            "title": "Deep work",
            "date": "2026-08-31",
            "start": "09:00:00",
            "end": "11:00:00",
        },
    ).json()
    note = client.post(
        "/api/notes",
        json={"title": "Pinned note", "timeBlockId": block["id"]},
    ).json()
    assert note["timeBlockId"] == block["id"]

    assert client.delete(f"/api/blocks/{block['id']}").status_code == 204
    assert client.get(f"/api/notes/{note['id']}").json()["timeBlockId"] is None
