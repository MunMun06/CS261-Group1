import json

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.core.session import SESSION_COOKIE_NAME, create_session_token
from app.models import User


def booking_payload() -> dict[str, object]:
    return {
        "courtId": 1,
        "date": "2026-10-12",
        "start": "16:00",
        "durationHours": 1,
    }


def test_booking_requires_a_started_student_session(
    api_client: TestClient,
    db_session_factory: sessionmaker[Session],
) -> None:
    with db_session_factory() as session:
        session.add(
            User(
                student_id="NOSESSION",
                name_th="ผู้ใช้ยังไม่มี Session",
                faculty="คณะวิทยาศาสตร์และเทคโนโลยี",
                email="nosession@example.invalid",
                role="member",
            )
        )
        session.commit()

    response = api_client.post(
        "/api/bookings",
        json=booking_payload(),
        headers={"Cookie": f"{SESSION_COOKIE_NAME}={create_session_token("NOSESSION")}"},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "STUDENT_SESSION_REQUIRED"
    assert "ออกจากระบบ" in response.json()["error"]["message"]


def test_double_degree_session_is_eligible_to_book(
    api_client: TestClient,
    monkeypatch,
) -> None:
    monkeypatch.setenv(
        "STUDENT_REGISTRY_MOCK_DATA",
        json.dumps(
            {
                "A": [
                    "คณะวิศวกรรมศาสตร์",
                    "คณะวิทยาศาสตร์และเทคโนโลยี",
                ]
            },
            ensure_ascii=False,
        ),
    )

    started = api_client.post("/api/session/start")
    booking = api_client.post("/api/bookings", json=booking_payload())

    assert started.status_code == 200
    assert started.json()["faculties"] == [
        "คณะวิศวกรรมศาสตร์",
        "คณะวิทยาศาสตร์และเทคโนโลยี",
    ]
    assert started.json()["eligibleToBook"] is True
    assert booking.status_code == 201


def test_stale_faculty_session_is_rejected_without_using_quota(
    api_client: TestClient,
    monkeypatch,
) -> None:
    monkeypatch.setenv(
        "STUDENT_REGISTRY_MOCK_DATA",
        json.dumps({"A": ["คณะวิทยาศาสตร์และเทคโนโลยี"]}, ensure_ascii=False),
    )
    started = api_client.post("/api/session/start")
    monkeypatch.setenv(
        "STUDENT_REGISTRY_MOCK_DATA",
        json.dumps({"A": ["คณะวิศวกรรมศาสตร์"]}, ensure_ascii=False),
    )

    rejected = api_client.post("/api/bookings", json=booking_payload())
    slots = api_client.get(
        "/api/courts/1/slots", params={"date": "2026-10-12"}
    )

    assert started.status_code == 200
    assert rejected.status_code == 409
    assert rejected.json()["error"]["code"] == "STUDENT_SESSION_STALE"
    assert "ออกจากระบบ" in rejected.json()["error"]["message"]
    assert slots.status_code == 200
    assert slots.json()["quotaUsed"] == 0
    assert slots.json()["slots"][8]["status"] == "available"


def test_unavailable_registry_blocks_session_start(
    api_client: TestClient,
    monkeypatch,
) -> None:
    monkeypatch.setenv("STUDENT_REGISTRY_PROVIDER", "unconfigured")

    started = api_client.post("/api/session/start")

    assert started.status_code == 503
    assert started.json()["error"]["code"] == "STUDENT_REGISTRY_UNAVAILABLE"


def test_unavailable_registry_blocks_booking(
    api_client: TestClient,
    monkeypatch,
) -> None:
    started = api_client.post("/api/session/start")
    monkeypatch.setenv("STUDENT_REGISTRY_PROVIDER", "unconfigured")

    booking = api_client.post("/api/bookings", json=booking_payload())

    assert started.status_code == 200
    assert booking.status_code == 503
    assert booking.json()["error"]["code"] == "STUDENT_REGISTRY_UNAVAILABLE"
    assert "ออกจากระบบ" in booking.json()["error"]["message"]
