import pytest
from fastapi.testclient import TestClient

from tests.conftest import register_verified


def test_list_tasks_is_empty(client: TestClient) -> None:
    register_verified(client)
    response = client.get("/api/tasks")

    assert response.status_code == 200
    assert response.json() == []


def test_list_notes_is_empty(client: TestClient) -> None:
    register_verified(client)
    response = client.get("/api/notes")

    assert response.status_code == 200
    assert response.json() == []


def test_list_blocks_is_empty(client: TestClient) -> None:
    register_verified(client)
    response = client.get("/api/blocks")

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.parametrize("path", ["/api/tasks", "/api/blocks", "/api/notes", "/api/ai/settings"])
def test_resources_require_authentication(
    client: TestClient,
    path: str,
) -> None:
    response = client.get(path)

    assert response.status_code == 401
    assert response.json()["detail"] == "Not authenticated."
