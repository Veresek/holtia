import uuid
from datetime import date, time

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.db import SessionLocal
from app.models.note import Note
from app.models.refresh_token import RefreshToken
from app.models.task import Task
from app.models.time_block import TimeBlock
from app.models.user import User
from app.models.user_ai_settings import UserAiSettings
from app.services.tokens import ACCESS_COOKIE, REFRESH_COOKIE
from tests.conftest import login, register_verified


def test_delete_me_removes_only_current_account_and_clears_cookies(
    client: TestClient,
) -> None:
    ada = register_verified(client, "ada@example.com").json()
    grace = register_verified(client, "grace@example.com").json()
    ada_id = uuid.UUID(ada["id"])
    grace_id = uuid.UUID(grace["id"])

    with SessionLocal() as db:
        block = TimeBlock(
            user_id=ada_id,
            title="Private block",
            date=date(2026, 8, 31),
            start=time(9),
            end=time(10),
        )
        db.add(block)
        db.flush()
        task = Task(
            user_id=ada_id,
            title="Private task",
            time_block_id=block.id,
        )
        db.add(task)
        db.flush()
        db.add(
            Note(
                user_id=ada_id,
                title="Private note",
                task_id=task.id,
            )
        )
        db.add(Task(user_id=grace_id, title="Grace’s task"))
        db.commit()

    assert login(client, "ada@example.com").status_code == 200
    deleted = client.delete("/api/users/me")

    assert deleted.status_code == 204
    set_cookies = deleted.headers.get_list("set-cookie")
    assert any(cookie.startswith(f"{ACCESS_COOKIE}=") for cookie in set_cookies)
    assert any(cookie.startswith(f"{REFRESH_COOKIE}=") for cookie in set_cookies)
    assert all("Max-Age=0" in cookie for cookie in set_cookies)
    assert ACCESS_COOKIE not in client.cookies
    assert REFRESH_COOKIE not in client.cookies

    with SessionLocal() as db:
        assert db.get(User, ada_id) is None
        assert db.get(User, grace_id) is not None
        for model in (RefreshToken, Task, TimeBlock, Note, UserAiSettings):
            count = db.scalar(
                select(func.count())
                .select_from(model)
                .where(model.user_id == ada_id)
            )
            assert count == 0
        grace_tasks = db.scalar(
            select(func.count())
            .select_from(Task)
            .where(Task.user_id == grace_id)
        )
        assert grace_tasks == 1

    assert login(client, "ada@example.com").status_code == 401
    assert login(client, "grace@example.com").status_code == 200


def test_delete_me_requires_the_current_session(client: TestClient) -> None:
    response = client.delete("/api/users/me")

    assert response.status_code == 401


def test_update_me_is_not_implemented(client: TestClient) -> None:
    register_verified(client)
    response = client.patch(
        "/api/users/me",
        json={"email": "new@example.com"},
    )

    assert response.status_code == 501
    assert response.json()["detail"] == "Changing email is not available yet."
