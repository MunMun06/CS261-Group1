import threading
from collections.abc import Iterator
from datetime import date, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from app import main
from app.core.database import Base, get_db
from app.models import BookingSlot
from app.scripts.seed_data import seed_database
from app.services import booking_service
from app.services.quota_checker import BookingDecision

# Requests without this header are made as the seeded user "A".
USER_B = {"X-Student-Id": "B"}


def booking(court_id: int, start: str, hours: int) -> dict[str, object]:
    return {"courtId": court_id, "date": "2026-10-12", "start": start, "durationHours": hours}


def test_another_user_cannot_book_a_taken_slot(api_client: TestClient) -> None:
    first = api_client.post("/api/bookings", json=booking(1, "16:00", 1))
    same_slot = api_client.post("/api/bookings", json=booking(1, "16:00", 1), headers=USER_B)
    other_court = api_client.post("/api/bookings", json=booking(2, "16:00", 1), headers=USER_B)

    assert first.status_code == 201
    assert same_slot.status_code == 409
    assert same_slot.json()["error"]["code"] == "SLOT_TAKEN"
    assert other_court.status_code == 201


def test_partial_overlap_is_rejected(api_client: TestClient) -> None:
    held = api_client.post("/api/bookings", json=booking(1, "13:00", 2))
    overlaps_end = api_client.post("/api/bookings", json=booking(1, "14:00", 2), headers=USER_B)
    overlaps_start = api_client.post("/api/bookings", json=booking(1, "12:00", 2), headers=USER_B)
    right_after = api_client.post("/api/bookings", json=booking(1, "15:00", 1), headers=USER_B)
    slots = api_client.get("/api/courts/1/slots", params={"date": "2026-10-12"})

    assert held.status_code == 201
    assert overlaps_end.status_code == 409
    assert overlaps_end.json()["error"]["code"] == "SLOT_TAKEN"
    assert overlaps_start.status_code == 409
    assert overlaps_start.json()["error"]["code"] == "SLOT_TAKEN"
    assert right_after.status_code == 201
    booked = [slot["start"] for slot in slots.json()["slots"] if slot["status"] == "booked"]
    assert booked == ["13:00", "14:00", "15:00"]


def test_slot_saved_by_another_request_at_the_same_moment(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    held = api_client.post("/api/bookings", json=booking(1, "16:00", 1))
    # B's request checked the rules just before A's booking was saved, so it saw a free slot.
    monkeypatch.setattr(
        booking_service,
        "check_booking_rules",
        lambda *args, **kwargs: BookingDecision(True, None, 0),
    )
    late = api_client.post("/api/bookings", json=booking(1, "16:00", 1), headers=USER_B)

    assert held.status_code == 201
    assert late.status_code == 409
    assert late.json()["error"]["code"] == "SLOT_TAKEN"


def test_code_taken_at_the_same_moment_gets_the_next_code(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    first = api_client.post("/api/bookings", json=booking(1, "16:00", 1))
    real_next_code = booking_service.next_booking_code
    tries: list[str] = []

    # B's first try counted codes before A's booking was saved, so it picked A's code.
    def code_counted_too_early(session: Session, day: date) -> str:
        code = first.json()["code"] if not tries else real_next_code(session, day)
        tries.append(code)
        return code

    monkeypatch.setattr(booking_service, "next_booking_code", code_counted_too_early)
    second = api_client.post("/api/bookings", json=booking(2, "16:00", 1), headers=USER_B)

    assert first.status_code == 201
    assert second.status_code == 201
    assert len(tries) == 2
    assert second.json()["code"] != first.json()["code"]
    assert second.json()["code"].startswith("TU-691012")


@pytest.fixture
def shared_db(
    current_time: list[datetime],
    tmp_path: Path,
) -> Iterator[sessionmaker[Session]]:
    """A database file that requests on different threads can use at once."""
    engine = create_engine(
        f"sqlite:///{tmp_path / 'bookings.db'}",
        connect_args={"check_same_thread": False, "timeout": 30},
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        seed_database(session, anchor_day=date(2026, 10, 10))

    def override_get_db() -> Iterator[Session]:
        with factory() as session:
            try:
                yield session
            finally:
                if session.in_transaction():
                    session.rollback()

    main.app.dependency_overrides[get_db] = override_get_db
    try:
        yield factory
    finally:
        main.app.dependency_overrides.clear()
        engine.dispose()


def post_at_the_same_moment(
    requests: list[tuple[dict[str, object], dict[str, str]]],
) -> list[Response]:
    """Sends each (payload, headers) booking from its own thread, all released together."""
    barrier = threading.Barrier(len(requests))
    responses: list[Response | None] = [None] * len(requests)

    def send(index: int, payload: dict[str, object], headers: dict[str, str]) -> None:
        client = TestClient(main.app)
        barrier.wait()
        responses[index] = client.post("/api/bookings", json=payload, headers=headers)

    threads = [
        threading.Thread(target=send, args=(index, payload, headers))
        for index, (payload, headers) in enumerate(requests)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    return [response for response in responses if response is not None]


def test_two_users_booking_the_same_slot_at_once(shared_db: sessionmaker[Session]) -> None:
    responses = post_at_the_same_moment(
        [(booking(1, "16:00", 1), {}), (booking(1, "16:00", 1), USER_B)]
    )

    assert sorted(response.status_code for response in responses) == [201, 409]
    with shared_db() as session:
        saved = session.scalar(
            select(func.count())
            .select_from(BookingSlot)
            .where(BookingSlot.court_id == 1, BookingSlot.start_hour == 16)
        )
    assert saved == 1


def test_two_users_booking_different_slots_at_once(shared_db: sessionmaker[Session]) -> None:
    responses = post_at_the_same_moment(
        [(booking(1, "16:00", 1), {}), (booking(2, "16:00", 1), USER_B)]
    )

    assert [response.status_code for response in responses] == [201, 201]
    codes = {response.json()["code"] for response in responses}
    assert len(codes) == 2
