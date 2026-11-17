import io
from datetime import datetime
from zoneinfo import ZoneInfo

import qrcode
from fastapi.testclient import TestClient
from PIL import Image

from app.core.session import SESSION_COOKIE_NAME, create_session_token
from app.services.qr_service import render_qr_png

TZ = ZoneInfo("Asia/Bangkok")


def session_for(student_id: str) -> dict[str, str]:
    """Headers that send a session for a seeded account (api_client is member "A")."""
    return {"Cookie": f"{SESSION_COOKIE_NAME}={create_session_token(student_id)}"}


def as_staff() -> dict[str, str]:
    return session_for("S")


def book_court(api_client: TestClient, current_time: list[datetime]) -> dict[str, str]:
    """Books 2026-10-12 13:00 as member "A", then moves the clock into check-in time."""
    current_time[0] = datetime(2026, 10, 12, 12, 0, tzinfo=TZ)
    created = api_client.post(
        "/api/bookings",
        json={"courtId": 1, "date": "2026-10-12", "start": "13:00", "durationHours": 1},
    )
    assert created.status_code == 201
    current_time[0] = datetime(2026, 10, 12, 12, 50, tzinfo=TZ)
    return created.json()


def png_modules(png: bytes, size: int, box_size: int = 10, border: int = 4) -> list[list[bool]]:
    """Reads back which modules of a QR PNG are dark, by sampling each module's centre."""
    image = Image.open(io.BytesIO(png)).convert("L")
    offset = border * box_size + box_size // 2
    return [
        [image.getpixel((offset + x * box_size, offset + y * box_size)) < 128 for x in range(size)]
        for y in range(size)
    ]


def test_render_qr_png_draws_the_qr_matrix_of_the_data() -> None:
    data = "TU-69101201." + "a" * 64
    png = render_qr_png(data)

    expected = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=0)
    expected.add_data(data)
    expected.make(fit=True)
    matrix = expected.get_matrix()

    assert png.startswith(b"\x89PNG\r\n\x1a\n")
    assert png_modules(png, len(matrix)) == matrix


def test_member_gets_a_qr_png_of_their_booking_token(
    api_client: TestClient, current_time: list[datetime]
) -> None:
    booking = book_court(api_client, current_time)
    response = api_client.get(f"/api/bookings/{booking['code']}/qr")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"] == "no-store"
    assert response.content == render_qr_png(booking["qrToken"])


def test_qr_png_is_only_for_the_owner_and_needs_a_session(
    api_client: TestClient, current_time: list[datetime]
) -> None:
    booking = book_court(api_client, current_time)
    other_member = api_client.get(
        f"/api/bookings/{booking['code']}/qr", headers=session_for("B")
    )
    api_client.cookies.clear()
    signed_out = api_client.get(f"/api/bookings/{booking['code']}/qr")

    assert other_member.status_code == 404
    assert other_member.json()["error"]["code"] == "BOOKING_NOT_FOUND"
    assert signed_out.status_code == 401


def test_no_qr_png_once_the_booking_is_checked_in(
    api_client: TestClient, current_time: list[datetime]
) -> None:
    booking = book_court(api_client, current_time)
    api_client.post(
        "/api/staff/qr/checkin",
        json={"qrData": booking["qrToken"], "gate": "A1"},
        headers=as_staff(),
    )
    response = api_client.get(f"/api/bookings/{booking['code']}/qr")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "ALREADY_CHECKED_IN"


def test_staff_scan_returns_the_booking_then_checkin_with_its_token(
    api_client: TestClient, current_time: list[datetime]
) -> None:
    booking = book_court(api_client, current_time)
    # Camera libraries can hand back the text with a trailing newline.
    scanned = api_client.post(
        "/api/staff/qr/scan", json={"qrData": booking["qrToken"] + "\n"}, headers=as_staff()
    )
    checked_in = api_client.post(
        f"/api/staff/bookings/{booking['code']}/checkin",
        json={"gate": "A1", "qrToken": scanned.json()["qrToken"]},
        headers=as_staff(),
    )

    assert scanned.status_code == 200
    assert scanned.json()["code"] == booking["code"]
    assert scanned.json()["studentId"] == "A"
    assert scanned.json()["status"] == "pending"
    assert checked_in.status_code == 200
    assert checked_in.json()["status"] == "checked-in"


def test_scan_rejects_forged_or_unreadable_qr_codes(
    api_client: TestClient, current_time: list[datetime]
) -> None:
    booking = book_court(api_client, current_time)
    forged_signature = f"{booking['code']}." + "0" * 64
    # A well-formed code for a booking that does not exist must look the same as a forgery.
    unknown_booking = "TU-69101299." + "0" * 64
    for qr_data in (forged_signature, unknown_booking, "hello", "", "x" * 1000):
        response = api_client.post(
            "/api/staff/qr/scan", json={"qrData": qr_data}, headers=as_staff()
        )
        assert response.status_code == 400, qr_data
        assert response.json()["error"]["code"] == "INVALID_QR"


def test_members_cannot_use_staff_qr_apis(
    api_client: TestClient, current_time: list[datetime]
) -> None:
    booking = book_court(api_client, current_time)
    scan = api_client.post("/api/staff/qr/scan", json={"qrData": booking["qrToken"]})
    checkin = api_client.post(
        "/api/staff/qr/checkin", json={"qrData": booking["qrToken"], "gate": "A1"}
    )

    assert scan.status_code == 403
    assert checkin.status_code == 403


def test_one_step_qr_checkin_follows_the_checkin_rules(
    api_client: TestClient, current_time: list[datetime]
) -> None:
    booking = book_court(api_client, current_time)
    body = {"qrData": booking["qrToken"], "gate": "A1"}

    current_time[0] = datetime(2026, 10, 12, 12, 30, tzinfo=TZ)
    too_early = api_client.post("/api/staff/qr/checkin", json=body, headers=as_staff())
    current_time[0] = datetime(2026, 10, 12, 12, 50, tzinfo=TZ)
    checked_in = api_client.post("/api/staff/qr/checkin", json=body, headers=as_staff())
    duplicate = api_client.post("/api/staff/qr/checkin", json=body, headers=as_staff())

    assert too_early.status_code == 422
    assert too_early.json()["error"]["code"] == "CHECKIN_TOO_EARLY"
    assert checked_in.status_code == 200
    assert checked_in.json()["status"] == "checked-in"
    assert checked_in.json()["checkedInBy"] == "สแกนประตู A1"
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "ALREADY_CHECKED_IN"
