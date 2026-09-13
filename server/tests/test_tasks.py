import uuid
from datetime import date as DateType
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from tests.conftest import login, register_verified


def _today() -> str:
    return datetime.now(ZoneInfo("Europe/Warsaw")).date().isoformat()


def create_task(
    client: TestClient,
    title: str,
    *,
    task_date: str | None = None,
    order: int = 0,
) -> dict[str, object]:
    payload: dict[str, object] = {"title": title, "order": order}
    if task_date is not None:
        payload["date"] = task_date
    response = client.post("/api/tasks", json=payload)
    assert response.status_code == 201
    return response.json()


def test_task_crud_trims_content_and_allows_clearing_date(
    client: TestClient,
) -> None:
    register_verified(client)

    created = client.post(
        "/api/tasks",
        json={
            "title": "  Plan the day  ",
            "description": "  Start with the hardest thing.  ",
            "date": "2026-08-31",
            "order": 3,
        },
    )

    assert created.status_code == 201
    task = created.json()
    assert task["title"] == "Plan the day"
    assert task["description"] == "Start with the hardest thing."
    assert task["date"] == "2026-08-31"
    assert set(task) == {
        "id",
        "title",
        "description",
        "done",
        "date",
        "timeBlockId",
        "order",
        "createdAt",
        "completedAt",
    }
    assert task["completedAt"] is None

    fetched = client.get(f"/api/tasks/{task['id']}")
    assert fetched.status_code == 200
    assert fetched.json() == task

    updated = client.patch(
        f"/api/tasks/{task['id']}",
        json={
            "title": "  Finish the plan ",
            "description": " ",
            "done": True,
            "date": None,
            "timeBlockId": None,
            "order": 1,
        },
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["completedAt"] is not None
    assert {**body, "completedAt": None} | {"createdAt": task["createdAt"]} == {
        **task,
        "title": "Finish the plan",
        "description": "",
        "done": True,
        "date": None,
        "timeBlockId": None,
        "order": 1,
    }

    deleted = client.delete(f"/api/tasks/{task['id']}")
    assert deleted.status_code == 204
    assert client.get(f"/api/tasks/{task['id']}").status_code == 404


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"title": ""},
        {"title": "   "},
        {"title": "x" * 256},
        {"title": "Valid", "order": -1},
    ],
)
def test_create_validates_task_fields(
    client: TestClient,
    payload: dict[str, object],
) -> None:
    register_verified(client)

    response = client.post("/api/tasks", json=payload)

    assert response.status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {"title": None},
        {"description": None},
        {"done": None},
        {"order": None},
        {"order": -1},
    ],
)
def test_patch_rejects_invalid_non_nullable_fields(
    client: TestClient,
    payload: dict[str, object],
) -> None:
    register_verified(client)
    task = create_task(client, "Keep this valid")

    response = client.patch(f"/api/tasks/{task['id']}", json=payload)

    assert response.status_code == 422


def test_list_supports_all_date_and_undated_filters(
    client: TestClient,
) -> None:
    register_verified(client)
    later = create_task(client, "Later", order=2)
    today = create_task(client, "Today", task_date="2026-08-31", order=1)
    tomorrow = create_task(client, "Tomorrow", task_date="2026-09-01", order=0)

    all_tasks = client.get("/api/tasks")
    dated = client.get("/api/tasks?date=2026-08-31")
    undated = client.get("/api/tasks?date=undated")

    assert all_tasks.status_code == 200
    assert [task["id"] for task in all_tasks.json()] == [
        tomorrow["id"],
        today["id"],
        later["id"],
    ]
    assert [task["id"] for task in dated.json()] == [today["id"]]
    assert [task["id"] for task in undated.json()] == [later["id"]]
    assert client.get("/api/tasks?date=today").status_code == 422


def test_tasks_are_isolated_between_users(client: TestClient) -> None:
    register_verified(client, "ada@example.com")
    adas_task = create_task(client, "Ada’s private task")

    register_verified(client, "grace@example.com")
    graces_task = create_task(client, "Grace’s private task")

    assert [task["id"] for task in client.get("/api/tasks").json()] == [
        graces_task["id"]
    ]
    for method in ("get", "patch", "delete"):
        request = getattr(client, method)
        kwargs = {"json": {"done": True}} if method == "patch" else {}
        response = request(f"/api/tasks/{adas_task['id']}", **kwargs)
        assert response.status_code == 404

    assert login(client, "ada@example.com").status_code == 200
    assert [task["id"] for task in client.get("/api/tasks").json()] == [
        adas_task["id"]
    ]
    assert client.get(f"/api/tasks/{uuid.uuid4()}").status_code == 404


def test_cannot_pin_a_task_to_another_users_block(client: TestClient) -> None:
    register_verified(client, "ada@example.com")
    ada_block = client.post(
        "/api/blocks",
        json={
            "title": "Ada’s block",
            "date": "2026-08-31",
            "start": "09:00:00",
            "end": "10:00:00",
        },
    )
    assert ada_block.status_code == 201

    register_verified(client, "grace@example.com")
    response = client.post(
        "/api/tasks",
        json={"title": "Stolen pin", "timeBlockId": ada_block.json()["id"]},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Time block not found."


def test_pinning_a_task_without_a_date_fills_the_next_occurrence(
    client: TestClient,
) -> None:
    register_verified(client)
    one_off = client.post(
        "/api/blocks",
        json={
            "title": "One-off",
            "date": "2026-08-31",
            "start": "09:00:00",
            "end": "10:00:00",
        },
    ).json()
    daily = client.post(
        "/api/blocks",
        json={
            "title": "Daily",
            "date": "2026-08-31",
            "start": "10:00:00",
            "end": "11:00:00",
            "recurrence": "daily",
        },
    ).json()
    weekly = client.post(
        "/api/blocks",
        json={
            "title": "Weekly",
            "date": "2026-08-31",
            "start": "11:00:00",
            "end": "12:00:00",
            "recurrence": "weekly",
        },
    ).json()
    weekdays = client.post(
        "/api/blocks",
        json={
            "title": "Weekdays",
            "date": "2026-08-31",
            "start": "12:00:00",
            "end": "13:00:00",
            "recurrence": "weekdays",
            "recurrenceDays": [0, 1, 2, 3, 4],
        },
    ).json()

    pinned_one_off = client.post(
        "/api/tasks",
        json={"title": "Past one-off", "timeBlockId": one_off["id"]},
    ).json()
    pinned_daily = client.post(
        "/api/tasks",
        json={"title": "Daily work", "timeBlockId": daily["id"]},
    ).json()
    pinned_weekly = client.post(
        "/api/tasks",
        json={"title": "Weekly work", "timeBlockId": weekly["id"]},
    ).json()
    pinned_weekdays = client.post(
        "/api/tasks",
        json={"title": "Weekday work", "timeBlockId": weekdays["id"]},
    ).json()

    assert pinned_one_off["date"] == "2026-08-31"
    assert pinned_daily["date"] == _today()
    assert pinned_weekly["date"] >= _today()
    assert pinned_weekly["date"] is not None
    weekly_date = DateType.fromisoformat(pinned_weekly["date"])
    assert weekly_date.weekday() == 0
    weekdays_date = DateType.fromisoformat(pinned_weekdays["date"])
    assert weekdays_date.weekday() <= 4
    assert pinned_weekdays["date"] >= _today()


def test_pinning_a_task_to_a_day_the_block_does_not_occur_is_rejected(
    client: TestClient,
) -> None:
    register_verified(client)
    block = client.post(
        "/api/blocks",
        json={
            "title": "Monday only",
            "date": "2026-08-31",
            "start": "09:00:00",
            "end": "10:00:00",
            "recurrence": "weekly",
        },
    ).json()

    response = client.post(
        "/api/tasks",
        json={
            "title": "Wrong day",
            "date": "2026-09-01",
            "timeBlockId": block["id"],
        },
    )

    assert response.status_code == 422
    assert (
        response.json()["detail"]
        == "The time block does not occur on 2026-09-01."
    )


def test_clearing_a_task_date_unpins_it(client: TestClient) -> None:
    register_verified(client)
    block = client.post(
        "/api/blocks",
        json={
            "title": "Deep work",
            "date": "2026-08-31",
            "start": "09:00:00",
            "end": "10:00:00",
        },
    ).json()
    task = client.post(
        "/api/tasks",
        json={
            "title": "Pinned",
            "date": "2026-08-31",
            "timeBlockId": block["id"],
        },
    ).json()
    assert task["timeBlockId"] == block["id"]

    updated = client.patch(f"/api/tasks/{task['id']}", json={"date": None})
    assert updated.status_code == 200
    assert updated.json()["date"] is None
    assert updated.json()["timeBlockId"] is None


def test_clearing_a_task_pin_keeps_the_date(client: TestClient) -> None:
    register_verified(client)
    block = client.post(
        "/api/blocks",
        json={
            "title": "Deep work",
            "date": "2026-08-31",
            "start": "09:00:00",
            "end": "10:00:00",
        },
    ).json()
    task = client.post(
        "/api/tasks",
        json={
            "title": "Pinned",
            "date": "2026-08-31",
            "timeBlockId": block["id"],
        },
    ).json()

    updated = client.patch(
        f"/api/tasks/{task['id']}",
        json={"timeBlockId": None},
    )
    assert updated.status_code == 200
    assert updated.json()["date"] == "2026-08-31"
    assert updated.json()["timeBlockId"] is None


def test_repinning_with_a_cleared_date_autofills(
    client: TestClient,
) -> None:
    register_verified(client)
    block = client.post(
        "/api/blocks",
        json={
            "title": "Daily",
            "date": "2026-08-31",
            "start": "09:00:00",
            "end": "10:00:00",
            "recurrence": "daily",
        },
    ).json()
    task = create_task(client, "Open")

    updated = client.patch(
        f"/api/tasks/{task['id']}",
        json={"date": None, "timeBlockId": block["id"]},
    )
    assert updated.status_code == 200
    assert updated.json()["timeBlockId"] == block["id"]
    assert updated.json()["date"] == _today()


def test_pinning_without_a_date_uses_the_users_timezone(
    client: TestClient,
) -> None:
    register_verified(client)
    updated = client.patch(
        "/api/users/me",
        json={"timezone": "Pacific/Auckland"},
    )
    assert updated.status_code == 200
    block = client.post(
        "/api/blocks",
        json={
            "title": "Daily",
            "date": "2026-08-31",
            "start": "09:00:00",
            "end": "10:00:00",
            "recurrence": "daily",
        },
    ).json()

    pinned = client.post(
        "/api/tasks",
        json={"title": "Across the date line", "timeBlockId": block["id"]},
    )

    assert pinned.status_code == 201
    assert pinned.json()["date"] == datetime.now(
        ZoneInfo("Pacific/Auckland")
    ).date().isoformat()


def test_completing_a_task_sets_and_clears_completed_at(
    client: TestClient,
) -> None:
    register_verified(client)
    task = create_task(client, "Write")
    assert task["done"] is False
    assert task["completedAt"] is None

    done = client.patch(f"/api/tasks/{task['id']}", json={"done": True})
    assert done.status_code == 200
    completed = done.json()
    assert completed["done"] is True
    assert completed["completedAt"] is not None

    renamed = client.patch(
        f"/api/tasks/{task['id']}",
        json={"title": "Wrote"},
    )
    assert renamed.json()["completedAt"] == completed["completedAt"]

    reopened = client.patch(f"/api/tasks/{task['id']}", json={"done": False})
    assert reopened.status_code == 200
    assert reopened.json()["done"] is False
    assert reopened.json()["completedAt"] is None


def test_creating_a_done_task_stamps_completed_at(client: TestClient) -> None:
    register_verified(client)
    created = client.post(
        "/api/tasks",
        json={"title": "Already finished", "done": True},
    )
    assert created.status_code == 201
    assert created.json()["done"] is True
    assert created.json()["completedAt"] is not None
