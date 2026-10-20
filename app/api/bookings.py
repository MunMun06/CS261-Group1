from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.time import now_thailand
from app.models import User
from app.schemas.booking import BookingCreate, CheckinCreate
from app.services.booking_service import (
    booking_to_dict,
    cancel_booking,
    checkin_booking,
    create_booking,
    error,
    expire_no_shows,
    get_booking_by_code,
    parse_date,
    parse_start,
)

router = APIRouter(tags=["bookings"])


@router.post("/api/bookings", status_code=201)
def book_court(
    payload: BookingCreate,
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, object]:
    now = now_thailand()
    expire_no_shows(session, now)
    session.commit()
    booking = create_booking(
        session,
        user,
        court_id=payload.court_id,
        day=parse_date(payload.date),
        start=parse_start(payload.start),
        duration_hours=payload.duration_hours,
        now=now,
    )
    return booking_to_dict(booking, include_qr=True)


@router.post("/api/bookings/{code}/cancel")
def cancel_my_booking(
    code: str,
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, object]:
    now = now_thailand()
    expire_no_shows(session, now)
    session.commit()
    return booking_to_dict(cancel_booking(session, user.id, code, now))


@router.get("/api/staff/bookings/{code}", tags=["staff"])
def staff_get_booking(
    code: str,
    session: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    expire_no_shows(session, now_thailand())
    session.commit()
    booking = get_booking_by_code(session, code)
    result: dict[str, object] = {
        "id": booking.code,
        "code": booking.code,
        "name": booking.user.name_th,
        "studentId": booking.user.student_id,
        "court": booking.court.name,
        "date": booking.booking_date.isoformat(),
        "start": booking.start_time.strftime("%H:%M"),
        "end": booking.end_time.strftime("%H:%M"),
        "status": booking.status,
    }
    if booking.checkin is not None:
        result["checkedInBy"] = f"สแกนประตู {booking.checkin.gate}"
        result["checkedInAt"] = booking.checkin.checked_in_at.isoformat(timespec="minutes")
    return result


@router.post("/api/staff/bookings/{code}/checkin", tags=["staff"])
def staff_checkin(
    code: str,
    payload: CheckinCreate,
    session: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    expire_no_shows(session, now_thailand())
    session.commit()
    booking = checkin_booking(
        session,
        code,
        gate=payload.gate,
        qr_token=payload.qr_token,
        now=now_thailand(),
    )
    return booking_to_dict(booking)
