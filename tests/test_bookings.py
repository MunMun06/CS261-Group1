from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient

TZ = ZoneInfo("Asia/Bangkok")


def test_booking_and_conflicting_slot_are_enforced(api_client: TestClient) -> None:
    payload = {
        "courtId": 1,
        "date": "2026-10-12",
        "start": "16:00",
        "durationHours": 2,
    }
    created = api_client.post("/api/bookings", json=payload)
    conflict = api_client.post("/api/bookings", json=payload)

    assert created.status_code == 201
    assert created.json()["end"] == "18:00"
    assert created.json()["status"] == "pending"
    assert created.json()["qrToken"].startswith(created.json()["code"] + ".")
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "SLOT_TAKEN"


def test_booking_rules_and_daily_quota(api_client: TestClient) -> None:
    overlong = api_client.post(
        "/api/bookings",
        json={
            "courtId": 1,
            "date": "2026-10-12",
            "start": "15:00",
            "durationHours": 3,
        },
    )
    first = api_client.post(
        "/api/bookings",
        json={
            "courtId": 1,
            "date": "2026-10-12",
            "start": "12:00",
            "durationHours": 2,
        },
    )
    quota = api_client.post(
        "/api/bookings",
        json={
            "courtId": 2,
            "date": "2026-10-12",
            "start": "15:00",
            "durationHours": 1,
        },
    )
    next_day = api_client.post(
        "/api/bookings",
        json={
            "courtId": 2,
            "date": "2026-10-13",
            "start": "15:00",
            "durationHours": 2,
        },
    )

    assert overlong.status_code == 422
    assert overlong.json()["error"]["code"] == "MAX_HOURS"
    assert first.status_code == 201
    assert quota.status_code == 422
    assert quota.json()["error"]["code"] == "QUOTA_EXCEEDED"
    assert next_day.status_code == 201


def test_booking_rejects_invalid_start_hours_and_courts(
    api_client: TestClient,
) -> None:
    cases = (
        (
            {"courtId": 1, "date": "2026-10-12", "start": "07:00", "durationHours": 1},
            422,
            "OUTSIDE_OPEN_HOURS",
        ),
        (
            {"courtId": 1, "date": "2026-10-12", "start": "18:00", "durationHours": 2},
            422,
            "OUTSIDE_OPEN_HOURS",
        ),
        (
            {"courtId": 1, "date": "2026-10-12", "start": "16:30", "durationHours": 1},
            400,
            "INVALID_INPUT",
        ),
        (
            {"courtId": 1, "date": "2026-10-10", "start": "09:00", "durationHours": 1},
            422,
            "SLOT_IN_PAST",
        ),
        (
            {"courtId": 999, "date": "2026-10-12", "start": "16:00", "durationHours": 1},
            404,
            "COURT_NOT_FOUND",
        ),
    )

    for payload, status_code, error_code in cases:
        response = api_client.post("/api/bookings", json=payload)
        assert response.status_code == status_code
        assert response.json()["error"]["code"] == error_code


def test_cancel_at_one_hour_restores_daily_quota(
    api_client: TestClient,
    current_time: list[datetime],
) -> None:
    current_time[0] = datetime(2026, 10, 12, 15, 0, tzinfo=TZ)
    created = api_client.post(
        "/api/bookings",
        json={
            "courtId": 1,
            "date": "2026-10-12",
            "start": "16:00",
            "durationHours": 2,
        },
    )
    cancelled = api_client.post(
        f"/api/bookings/{created.json()['code']}/cancel"
    )
    slots = api_client.get(
        "/api/courts/1/slots", params={"date": "2026-10-12"}
    )

    assert created.status_code == 201
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert slots.json()["quotaUsed"] == 0
    assert slots.json()["slots"][8]["status"] == "available"


def test_cancellation_too_late_does_not_change_booking(
    api_client: TestClient,
    current_time: list[datetime],
) -> None:
    current_time[0] = datetime(2026, 10, 12, 15, 1, tzinfo=TZ)
    created = api_client.post(
        "/api/bookings",
        json={
            "courtId": 1,
            "date": "2026-10-12",
            "start": "16:00",
            "durationHours": 1,
        },
    )
    cancelled = api_client.post(
        f"/api/bookings/{created.json()['code']}/cancel"
    )

    assert cancelled.status_code == 422
    assert cancelled.json()["error"]["code"] == "CANCEL_TOO_LATE"
    history = api_client.get("/api/history")
    item = next(
        entry
        for entry in history.json()["items"]
        if entry["code"] == created.json()["code"]
    )
    assert item["status"] == "pending"


def test_cancel_is_owner_scoped_and_terminal_states_are_immutable(
    api_client: TestClient,
) -> None:
    other_users_booking = api_client.post(
        "/api/bookings/TU-69101102/cancel"
    )
    already_cancelled = api_client.post(
        "/api/bookings/TU-69101401/cancel"
    )
    already_checked_in = api_client.post(
        "/api/bookings/TU-69101101/cancel"
    )

    assert other_users_booking.status_code == 404
    assert already_cancelled.status_code == 409
    assert already_cancelled.json()["error"]["code"] == "ALREADY_CANCELLED"
    assert already_checked_in.status_code == 409
    assert already_checked_in.json()["error"]["code"] == "ALREADY_CHECKED_IN"


def test_staff_checkin_verifies_qr_and_accepts_window_boundary(
    api_client: TestClient,
    current_time: list[datetime],
) -> None:
    current_time[0] = datetime(2026, 10, 12, 12, 45, tzinfo=TZ)
    created = api_client.post(
        "/api/bookings",
        json={
            "courtId": 1,
            "date": "2026-10-12",
            "start": "13:00",
            "durationHours": 1,
        },
    )
    code = created.json()["code"]
    lookup = api_client.get(f"/api/staff/bookings/{code}")
    invalid_qr = api_client.post(
        f"/api/staff/bookings/{code}/checkin",
        json={"gate": "A1", "qrToken": f"{code}." + "0" * 64},
    )
    current_time[0] = datetime(2026, 10, 12, 13, 15, tzinfo=TZ)
    checked_in = api_client.post(
        f"/api/staff/bookings/{code}/checkin",
        json={"gate": "A1", "qrToken": created.json()["qrToken"]},
    )
    duplicate = api_client.post(
        f"/api/staff/bookings/{code}/checkin",
        json={"gate": "A1", "qrToken": created.json()["qrToken"]},
    )

    assert lookup.status_code == 200
    assert lookup.json()["studentId"] == "A"
    assert invalid_qr.status_code == 400
    assert invalid_qr.json()["error"]["code"] == "INVALID_QR"
    assert checked_in.status_code == 200
    assert checked_in.json()["status"] == "checked-in"
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "ALREADY_CHECKED_IN"
