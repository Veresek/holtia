import uuid
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import update

from app.db import SessionLocal
from app.models.note import Note
from app.models.task import Task
from app.models.time_block import TimeBlock
from tests.conftest import login, register_verified

EMPTY_FINGERPRINT = {"count": 0, "updatedAt": None, "pinned": 0}


def get_state(client: TestClient) -> dict[str, object]:
    response = client.get("/api/state")
    assert response.status_code == 200
    return response.json()


def age_updated_at(
    model: type[Task] | type[Note] | type[TimeBlock],
    item_id: str,
) -> None:
    past = datetime.now(timezone.utc) - timedelta(seconds=5)
    with SessionLocal() as session:
        session.execute(
            update(model)
            .where(model.id == uuid.UUID(item_id))
            .values(updated_at=past),
        )
        session.commit()


def test_state_requires_authentication(client: TestClient) -> None:
    response = client.get("/api/state")
    assert response.status_code == 401


def test_empty_state_has_null_updated_at(client: TestClient) -> None:
    register_verified(client)

    assert get_state(client) == {
        "tasks": EMPTY_FINGERPRINT,
        "notes": EMPTY_FINGERPRINT,
        "blocks": EMPTY_FINGERPRINT,
    }


def test_state_fingerprint_grows_after_create_and_drops_after_delete(
    client: TestClient,
) -> None:
    register_verified(client)

    task = client.post("/api/tasks", json={"title": "Plan the day"}).json()
    note = client.post("/api/notes", json={"title": "Ideas"}).json()
    block = client.post(
        "/api/blocks",
        json={
            "title": "Deep work",
            "date": "2026-08-31",
            "start": "09:00:00",
            "end": "11:00:00",
        },
    ).json()

    created = get_state(client)
    assert created["tasks"]["count"] == 1
    assert created["notes"]["count"] == 1
    assert created["blocks"]["count"] == 1
    assert created["tasks"]["updatedAt"] is not None
    assert created["notes"]["updatedAt"] is not None
    assert created["blocks"]["updatedAt"] is not None

    assert client.delete(f"/api/tasks/{task['id']}").status_code == 204
    assert client.delete(f"/api/notes/{note['id']}").status_code == 204
    assert client.delete(f"/api/blocks/{block['id']}").status_code == 204

    assert get_state(client) == {
        "tasks": EMPTY_FINGERPRINT,
        "notes": EMPTY_FINGERPRINT,
        "blocks": EMPTY_FINGERPRINT,
    }


def test_state_fingerprint_changes_after_edit(client: TestClient) -> None:
    register_verified(client)

    task = client.post("/api/tasks", json={"title": "Plan the day"}).json()
    note = client.post("/api/notes", json={"title": "Ideas"}).json()
    block = client.post(
        "/api/blocks",
        json={
            "title": "Deep work",
            "date": "2026-08-31",
            "start": "09:00:00",
            "end": "11:00:00",
        },
    ).json()

    age_updated_at(Task, task["id"])
    age_updated_at(Note, note["id"])
    age_updated_at(TimeBlock, block["id"])
    before = get_state(client)

    assert client.patch(
        f"/api/tasks/{task['id']}",
        json={"title": "Finish the plan"},
    ).status_code == 200
    assert client.patch(
        f"/api/notes/{note['id']}",
        json={"title": "Final ideas"},
    ).status_code == 200
    assert client.patch(
        f"/api/blocks/{block['id']}",
        json={"title": "Writing"},
    ).status_code == 200

    after = get_state(client)
    assert after["tasks"]["count"] == 1
    assert after["notes"]["count"] == 1
    assert after["blocks"]["count"] == 1
    assert after["tasks"]["updatedAt"] != before["tasks"]["updatedAt"]
    assert after["notes"]["updatedAt"] != before["notes"]["updatedAt"]
    assert after["blocks"]["updatedAt"] != before["blocks"]["updatedAt"]


def test_state_is_isolated_between_users(client: TestClient) -> None:
    register_verified(client)
    client.post("/api/tasks", json={"title": "Ada’s task"})
    client.post("/api/notes", json={"title": "Ada’s note"})
    client.post(
        "/api/blocks",
        json={
            "title": "Ada’s block",
            "date": "2026-08-31",
            "start": "09:00:00",
            "end": "11:00:00",
        },
    )
    ada_state = get_state(client)

    register_verified(client, email="other@example.com")
    other_state = get_state(client)
    assert other_state == {
        "tasks": EMPTY_FINGERPRINT,
        "notes": EMPTY_FINGERPRINT,
        "blocks": EMPTY_FINGERPRINT,
    }

    login(client)
    assert get_state(client) == ada_state


def test_deleting_a_block_changes_pin_fingerprints_without_editing(
    client: TestClient,
) -> None:
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
    task = client.post(
        "/api/tasks",
        json={
            "title": "Write",
            "date": "2026-08-31",
            "timeBlockId": block["id"],
        },
    ).json()
    note = client.post(
        "/api/notes",
        json={"title": "Session notes", "timeBlockId": block["id"]},
    ).json()

    before = get_state(client)
    assert before["tasks"]["pinned"] == 1
    assert before["notes"]["pinned"] == 1
    assert before["blocks"]["pinned"] == 0

    assert client.delete(f"/api/blocks/{block['id']}").status_code == 204

    after = get_state(client)
    assert after["tasks"]["count"] == 1
    assert after["notes"]["count"] == 1
    assert after["blocks"]["count"] == 0
    assert after["tasks"]["pinned"] == 0
    assert after["notes"]["pinned"] == 0
    assert after["tasks"]["updatedAt"] == before["tasks"]["updatedAt"]
    assert after["notes"]["updatedAt"] == before["notes"]["updatedAt"]
    assert client.get(f"/api/tasks/{task['id']}").json()["timeBlockId"] is None
    assert client.get(f"/api/notes/{note['id']}").json()["timeBlockId"] is None


def test_deleting_a_task_changes_the_note_pin_fingerprint(
    client: TestClient,
) -> None:
    register_verified(client)
    task = client.post("/api/tasks", json={"title": "Write"}).json()
    note = client.post(
        "/api/notes",
        json={"title": "Session notes", "taskId": task["id"]},
    ).json()

    before = get_state(client)
    assert before["notes"]["pinned"] == 1

    assert client.delete(f"/api/tasks/{task['id']}").status_code == 204

    after = get_state(client)
    assert after["notes"]["count"] == 1
    assert after["notes"]["pinned"] == 0
    assert after["notes"]["updatedAt"] == before["notes"]["updatedAt"]
    assert client.get(f"/api/notes/{note['id']}").json()["taskId"] is None
