from datetime import date, time

import pytest
from fastapi.testclient import TestClient

from app.models.time_block import Recurrence, TimeBlock
from app.services.blocks import occurs_on, visible_on
from tests.conftest import login, register_verified


def create_block(
    client: TestClient,
    title: str = "Deep work",
    *,
    block_date: str = "2026-08-31",
    start: str = "09:00:00",
    end: str = "11:00:00",
    recurrence: str = "none",
    recurrence_days: list[int] | None = None,
    description: str = "",
) -> dict[str, object]:
    payload: dict[str, object] = {
        "title": title,
        "description": description,
        "date": block_date,
        "start": start,
        "end": end,
        "recurrence": recurrence,
    }
    if recurrence_days is not None:
        payload["recurrenceDays"] = recurrence_days
    response = client.post("/api/blocks", json=payload)
    assert response.status_code == 201
    return response.json()


def test_block_crud_trims_content_and_normalizes_days(
    client: TestClient,
) -> None:
    register_verified(client)

    created = client.post(
        "/api/blocks",
        json={
            "title": "  Deep work  ",
            "description": "  Protect the morning.  ",
            "date": "2026-08-31",
            "start": "09:00:00",
            "end": "11:00:00",
            "recurrence": "weekdays",
            "recurrenceDays": [4, 0, 0, 2],
        },
    )

    assert created.status_code == 201
    block = created.json()
    assert block["title"] == "Deep work"
    assert block["description"] == "Protect the morning."
    assert block["date"] == "2026-08-31"
    assert block["start"] == "09:00:00"
    assert block["end"] == "11:00:00"
    assert block["recurrence"] == "weekdays"
    assert block["recurrenceDays"] == [0, 2, 4]
    assert set(block) == {
        "id",
        "title",
        "description",
        "date",
        "start",
        "end",
        "recurrence",
        "recurrenceDays",
    }

    fetched = client.get(f"/api/blocks/{block['id']}")
    assert fetched.status_code == 200
    assert fetched.json() == block

    updated = client.patch(
        f"/api/blocks/{block['id']}",
        json={
            "title": "  Focus block ",
            "description": " ",
            "start": "10:00:00",
        },
    )
    assert updated.status_code == 200
    assert updated.json() == {
        **block,
        "title": "Focus block",
        "description": "",
        "start": "10:00:00",
    }

    listed = client.get("/api/blocks")
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [block["id"]]

    deleted = client.delete(f"/api/blocks/{block['id']}")
    assert deleted.status_code == 204
    assert client.get(f"/api/blocks/{block['id']}").status_code == 404
    assert client.get("/api/blocks").json() == []


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"title": ""},
        {"title": "   "},
        {"title": "x" * 256, "date": "2026-08-31", "start": "09:00", "end": "10:00"},
        {
            "title": "Valid",
            "date": "2026-08-31",
            "start": "09:00:00",
            "end": "09:00:00",
        },
        {
            "title": "Valid",
            "date": "2026-08-31",
            "start": "09:00:00",
            "end": "10:00:00",
            "recurrence": "weekdays",
            "recurrenceDays": [],
        },
        {
            "title": "Valid",
            "date": "2026-08-31",
            "start": "09:00:00",
            "end": "10:00:00",
            "recurrence": "daily",
            "recurrenceDays": [1],
        },
        {
            "title": "Valid",
            "date": "2026-08-31",
            "start": "09:00:00",
            "end": "10:00:00",
            "recurrence": "weekly",
            "recurrenceDays": [0],
        },
        {
            "title": "Valid",
            "date": "2026-08-31",
            "start": "09:00:00",
            "end": "10:00:00",
            "recurrence": "none",
            "recurrenceDays": [2],
        },
        {
            "title": "Valid",
            "date": "2026-08-31",
            "start": "09:00:00",
            "end": "10:00:00",
            "recurrence": "weekdays",
            "recurrenceDays": [7],
        },
    ],
)
def test_create_validates_block_fields(
    client: TestClient,
    payload: dict[str, object],
) -> None:
    register_verified(client)

    response = client.post("/api/blocks", json=payload)

    assert response.status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {"title": None},
        {"description": None},
        {"date": None},
        {"start": None},
        {"end": None},
        {"recurrence": None},
        {"recurrenceDays": None},
        {"title": "   "},
        {"title": "x" * 256},
    ],
)
def test_patch_rejects_invalid_non_nullable_fields(
    client: TestClient,
    payload: dict[str, object],
) -> None:
    register_verified(client)
    block = create_block(client)

    response = client.patch(f"/api/blocks/{block['id']}", json=payload)

    assert response.status_code == 422


def test_patch_validates_merged_time_and_does_not_partially_write(
    client: TestClient,
) -> None:
    register_verified(client)
    block = create_block(client, start="09:00:00", end="11:00:00")

    response = client.patch(
        f"/api/blocks/{block['id']}",
        json={"start": "11:00:00"},
    )

    assert response.status_code == 422
    assert client.get(f"/api/blocks/{block['id']}").json() == block


def test_patch_rejects_recurrence_change_without_matching_days(
    client: TestClient,
) -> None:
    register_verified(client)
    block = create_block(
        client,
        recurrence="weekdays",
        recurrence_days=[0, 2, 4],
    )

    response = client.patch(
        f"/api/blocks/{block['id']}",
        json={"recurrence": "weekly"},
    )

    assert response.status_code == 422
    assert client.get(f"/api/blocks/{block['id']}").json() == block

    updated = client.patch(
        f"/api/blocks/{block['id']}",
        json={"recurrence": "weekly", "recurrenceDays": []},
    )
    assert updated.status_code == 200
    assert updated.json()["recurrence"] == "weekly"
    assert updated.json()["recurrenceDays"] == []


def test_list_filters_occurrences_and_keeps_anchor_date(
    client: TestClient,
) -> None:
    register_verified(client)
    one_off = create_block(client, "One-off", block_date="2026-08-31")
    daily = create_block(
        client,
        "Daily",
        block_date="2026-08-31",
        start="08:00:00",
        end="08:30:00",
        recurrence="daily",
    )
    weekly = create_block(
        client,
        "Weekly",
        block_date="2026-08-31",
        start="12:00:00",
        end="13:00:00",
        recurrence="weekly",
    )
    selected = create_block(
        client,
        "Selected",
        block_date="2026-08-29",
        start="15:00:00",
        end="16:00:00",
        recurrence="weekdays",
        recurrence_days=[0, 2, 4],
    )
    later_one_off = create_block(
        client,
        "Later",
        block_date="2026-09-01",
        start="07:00:00",
        end="07:30:00",
    )

    monday = client.get("/api/blocks?date=2026-08-31")
    tuesday = client.get("/api/blocks?date=2026-09-01")
    sunday = client.get("/api/blocks?date=2026-09-06")
    before_anchor = client.get("/api/blocks?date=2026-08-30")
    all_blocks = client.get("/api/blocks")

    assert monday.status_code == 200
    assert [item["title"] for item in monday.json()] == [
        "Daily",
        "One-off",
        "Weekly",
        "Selected",
    ]
    assert next(item for item in monday.json() if item["id"] == weekly["id"])[
        "date"
    ] == "2026-08-31"
    assert next(item for item in monday.json() if item["id"] == selected["id"])[
        "date"
    ] == "2026-08-29"

    assert [item["title"] for item in tuesday.json()] == ["Later", "Daily"]
    assert [item["title"] for item in sunday.json()] == ["Daily"]
    assert before_anchor.json() == []
    assert [item["id"] for item in all_blocks.json()] == [
        later_one_off["id"],
        daily["id"],
        one_off["id"],
        weekly["id"],
        selected["id"],
    ]
    assert client.get("/api/blocks?date=today").status_code == 422
    assert client.get("/api/blocks?date=31-08-2026").status_code == 422


def test_weekdays_anchor_outside_selected_days_starts_later(
    client: TestClient,
) -> None:
    register_verified(client)
    create_block(
        client,
        "Weekdays from Saturday",
        block_date="2026-08-29",
        recurrence="weekdays",
        recurrence_days=[0, 1, 2, 3, 4],
    )

    saturday = client.get("/api/blocks?date=2026-08-29")
    sunday = client.get("/api/blocks?date=2026-08-30")
    monday = client.get("/api/blocks?date=2026-08-31")

    assert saturday.json() == []
    assert sunday.json() == []
    assert [item["title"] for item in monday.json()] == ["Weekdays from Saturday"]
    assert monday.json()[0]["date"] == "2026-08-29"


def test_list_sorts_by_start_then_end_then_id(client: TestClient) -> None:
    register_verified(client)
    later = create_block(client, "Later", start="11:00:00", end="12:00:00")
    create_block(client, "Longer", start="09:00:00", end="12:00:00")
    create_block(client, "Shorter", start="09:00:00", end="10:00:00")

    listed = client.get("/api/blocks?date=2026-08-31")

    titles = [item["title"] for item in listed.json()]
    assert titles == ["Shorter", "Longer", "Later"]
    assert listed.json()[2]["id"] == later["id"]


def test_deleting_a_block_clears_task_pin(client: TestClient) -> None:
    register_verified(client)
    block = create_block(client)
    task = client.post(
        "/api/tasks",
        json={"title": "Pinned work", "timeBlockId": block["id"]},
    ).json()
    assert task["timeBlockId"] == block["id"]

    assert client.delete(f"/api/blocks/{block['id']}").status_code == 204
    assert client.get(f"/api/tasks/{task['id']}").json()["timeBlockId"] is None


def test_changing_recurrence_clears_stale_task_pins(client: TestClient) -> None:
    register_verified(client)
    block = create_block(
        client,
        recurrence="weekdays",
        recurrence_days=[0, 1, 2, 3, 4],
    )
    monday = client.post(
        "/api/tasks",
        json={
            "title": "Monday work",
            "date": "2026-08-31",
            "timeBlockId": block["id"],
        },
    ).json()
    wednesday = client.post(
        "/api/tasks",
        json={
            "title": "Wednesday work",
            "date": "2026-09-02",
            "timeBlockId": block["id"],
        },
    ).json()
    note = client.post(
        "/api/notes",
        json={"title": "Series note", "timeBlockId": block["id"]},
    ).json()

    updated = client.patch(
        f"/api/blocks/{block['id']}",
        json={"recurrenceDays": [2, 3]},
    )
    assert updated.status_code == 200

    assert client.get(f"/api/tasks/{monday['id']}").json()["timeBlockId"] is None
    assert (
        client.get(f"/api/tasks/{wednesday['id']}").json()["timeBlockId"]
        == block["id"]
    )
    assert (
        client.get(f"/api/notes/{note['id']}").json()["timeBlockId"] == block["id"]
    )


def test_blocks_are_isolated_between_users(client: TestClient) -> None:
    register_verified(client, "ada@example.com")
    adas_block = create_block(client, "Ada’s block")

    register_verified(client, "grace@example.com")
    graces_block = create_block(client, "Grace’s block")

    assert [item["id"] for item in client.get("/api/blocks").json()] == [
        graces_block["id"]
    ]
    for method in ("get", "patch", "delete"):
        request = getattr(client, method)
        kwargs = {"json": {"title": "Stolen"}} if method == "patch" else {}
        response = request(f"/api/blocks/{adas_block['id']}", **kwargs)
        assert response.status_code == 404

    assert login(client, "ada@example.com").status_code == 200
    assert [item["id"] for item in client.get("/api/blocks").json()] == [
        adas_block["id"]
    ]


@pytest.mark.parametrize(
    ("block_date", "recurrence", "days", "day", "expected"),
    [
        (date(2026, 8, 31), Recurrence.NONE, [], date(2026, 8, 31), True),
        (date(2026, 8, 31), Recurrence.NONE, [], date(2026, 9, 1), False),
        (date(2026, 8, 31), Recurrence.DAILY, [], date(2026, 8, 30), False),
        (date(2026, 8, 31), Recurrence.DAILY, [], date(2026, 9, 2), True),
        (date(2026, 8, 31), Recurrence.WEEKLY, [], date(2026, 9, 7), True),
        (date(2026, 8, 31), Recurrence.WEEKLY, [], date(2026, 9, 1), False),
        (date(2026, 8, 29), Recurrence.WEEKDAYS, [0, 2, 4], date(2026, 8, 31), True),
        (date(2026, 8, 29), Recurrence.WEEKDAYS, [0, 2, 4], date(2026, 8, 29), False),
    ],
)
def test_occurs_on_matches_locked_recurrence_rules(
    block_date: date,
    recurrence: Recurrence,
    days: list[int],
    day: date,
    expected: bool,
) -> None:
    block = TimeBlock(
        title="Rule",
        date=block_date,
        start=time(9),
        end=time(10),
        recurrence=recurrence,
        recurrence_days=days,
    )

    assert occurs_on(block, day) is expected


def test_create_allows_overnight_times(client: TestClient) -> None:
    register_verified(client)

    created = create_block(
        client,
        "Night shift",
        start="22:00:00",
        end="06:00:00",
    )

    assert created["start"] == "22:00:00"
    assert created["end"] == "06:00:00"


def test_list_includes_overnight_continuation(client: TestClient) -> None:
    register_verified(client)
    overnight = create_block(
        client,
        "Night shift",
        block_date="2026-08-31",
        start="22:00:00",
        end="06:00:00",
    )

    monday = client.get("/api/blocks?date=2026-08-31")
    tuesday = client.get("/api/blocks?date=2026-09-01")
    wednesday = client.get("/api/blocks?date=2026-09-02")

    assert [item["id"] for item in monday.json()] == [overnight["id"]]
    assert tuesday.json() == [overnight]
    assert tuesday.json()[0]["date"] == "2026-08-31"
    assert wednesday.json() == []


def test_patch_allows_overnight_times(client: TestClient) -> None:
    register_verified(client)
    block = create_block(client, start="09:00:00", end="11:00:00")

    updated = client.patch(
        f"/api/blocks/{block['id']}",
        json={"start": "22:00:00", "end": "06:00:00"},
    )

    assert updated.status_code == 200
    assert updated.json()["start"] == "22:00:00"
    assert updated.json()["end"] == "06:00:00"


def test_weekly_overnight_is_visible_on_the_next_morning(
    client: TestClient,
) -> None:
    register_verified(client)
    create_block(
        client,
        "Night review",
        block_date="2026-08-31",
        start="22:00:00",
        end="06:00:00",
        recurrence="weekly",
    )

    monday = client.get("/api/blocks?date=2026-08-31")
    tuesday = client.get("/api/blocks?date=2026-09-01")
    next_tuesday = client.get("/api/blocks?date=2026-09-08")

    assert [item["title"] for item in monday.json()] == ["Night review"]
    assert [item["title"] for item in tuesday.json()] == ["Night review"]
    assert [item["title"] for item in next_tuesday.json()] == ["Night review"]


@pytest.mark.parametrize(
    ("block_date", "recurrence", "days", "day", "expected"),
    [
        (date(2026, 8, 31), Recurrence.NONE, [], date(2026, 8, 31), True),
        (date(2026, 8, 31), Recurrence.NONE, [], date(2026, 9, 1), True),
        (date(2026, 8, 31), Recurrence.NONE, [], date(2026, 9, 2), False),
        (date(2026, 8, 31), Recurrence.WEEKLY, [], date(2026, 9, 1), True),
        (date(2026, 8, 31), Recurrence.WEEKLY, [], date(2026, 9, 2), False),
        (date(2026, 8, 31), Recurrence.WEEKDAYS, [0], date(2026, 9, 1), True),
        (date(2026, 8, 31), Recurrence.WEEKDAYS, [0], date(2026, 9, 2), False),
    ],
)
def test_visible_on_includes_overnight_continuation(
    block_date: date,
    recurrence: Recurrence,
    days: list[int],
    day: date,
    expected: bool,
) -> None:
    block = TimeBlock(
        title="Night",
        date=block_date,
        start=time(22),
        end=time(6),
        recurrence=recurrence,
        recurrence_days=days,
    )

    assert visible_on(block, day) is expected
