import pytest
from fastapi.testclient import TestClient

from app.core.session import SESSION_COOKIE_NAME


@pytest.fixture
def signed_out_client(
    api_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> TestClient:
    """A development server with no TU API key yet, and no one signed in."""
    monkeypatch.delenv("TU_API_APPLICATION_KEY", raising=False)
    monkeypatch.delenv("APP_ENV", raising=False)
    api_client.cookies.clear()
    return api_client


def test_dev_login_signs_in_a_seeded_user_without_tu(signed_out_client: TestClient) -> None:
    response = signed_out_client.post("/api/auth/dev-login", json={"username": "S"})
    staff_api = signed_out_client.get("/api/staff/bookings/TU-00000000")

    assert response.status_code == 200
    assert response.json()["studentId"] == "S"
    assert SESSION_COOKIE_NAME in response.cookies
    # Signed in as staff: the staff API answers instead of returning 401 or 403.
    assert staff_api.status_code == 404


def test_dev_login_rejects_users_not_in_the_database(signed_out_client: TestClient) -> None:
    response = signed_out_client.post("/api/auth/dev-login", json={"username": "nobody"})

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"
    assert SESSION_COOKIE_NAME not in response.cookies


def test_login_reports_missing_tu_key_so_the_page_can_fall_back(
    signed_out_client: TestClient,
) -> None:
    response = signed_out_client.post(
        "/api/auth/login", json={"username": "A", "password": "anything"}
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "TU_API_NOT_CONFIGURED"


def test_dev_login_is_off_in_production(
    signed_out_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    response = signed_out_client.post("/api/auth/dev-login", json={"username": "A"})

    assert response.status_code == 404
    assert SESSION_COOKIE_NAME not in response.cookies


def test_dev_login_is_off_once_the_tu_key_is_set(
    signed_out_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("TU_API_APPLICATION_KEY", "real-key")
    response = signed_out_client.post("/api/auth/dev-login", json={"username": "A"})

    assert response.status_code == 404
    assert SESSION_COOKIE_NAME not in response.cookies
