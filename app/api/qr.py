from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_staff, get_current_user
from app.core.time import now_thailand
from app.models import Booking, User
from app.schemas.qr import QrCheckin, QrScan
from app.services.booking_service import (
    FINAL_STATUS_ERRORS,
    booking_to_dict,
    checkin_booking,
    error,
    expire_no_shows,
    make_qr_token,
    staff_booking_to_dict,
)
from app.services.qr_service import render_qr_png, verify_scanned_qr

router = APIRouter(tags=["qr"])


@router.get(
    "/api/bookings/{code}/qr",
    response_class=Response,
    responses={200: {"content": {"image/png": {}}, "description": "QR code PNG"}},
)
def my_booking_qr(
    code: str,
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> Response:
    """PNG of the QR code the member shows at the gate. Only for their own pending booking."""
    expire_no_shows(session, now_thailand())
    session.commit()
    booking = session.scalar(
        select(Booking).where(Booking.code == code, Booking.user_id == user.id)
    )
    if booking is None:
        raise error(404, "BOOKING_NOT_FOUND", "The requested booking does not exist.")
    if booking.status in FINAL_STATUS_ERRORS:
        raise error(409, *FINAL_STATUS_ERRORS[booking.status])
    return Response(
        content=render_qr_png(make_qr_token(booking.code)),
        media_type="image/png",
        # The QR code works like a ticket, so browsers and proxies must not keep a copy.
        headers={"Cache-Control": "no-store"},
    )


@router.post("/api/staff/qr/scan", tags=["staff"])
def staff_scan_qr(
    payload: QrScan,
    session: Annotated[Session, Depends(get_db)],
    _staff: Annotated[User, Depends(get_current_staff)],
) -> dict[str, object]:
    """Checks a scanned QR code and returns its booking, without checking in yet.

    The staff page shows the booking, then confirms with
    POST /api/staff/bookings/{code}/checkin and the returned "qrToken".
    """
    expire_no_shows(session, now_thailand())
    session.commit()
    booking = verify_scanned_qr(session, payload.qr_data)
    result = staff_booking_to_dict(booking)
    result["qrToken"] = make_qr_token(booking.code)
    return result


@router.post("/api/staff/qr/checkin", tags=["staff"])
def staff_checkin_by_qr(
    payload: QrCheckin,
    session: Annotated[Session, Depends(get_db)],
    staff: Annotated[User, Depends(get_current_staff)],
) -> dict[str, object]:
    """Scan and check in in one step, e.g. for a scanner fixed at the gate."""
    now = now_thailand()
    expire_no_shows(session, now)
    session.commit()
    booking = verify_scanned_qr(session, payload.qr_data)
    booking = checkin_booking(
        session,
        booking.code,
        gate=payload.gate,
        qr_token=make_qr_token(booking.code),
        staff=staff,
        now=now,
    )
    return booking_to_dict(booking)
