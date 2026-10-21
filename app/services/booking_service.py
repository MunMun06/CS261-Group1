import hashlib
import hmac
import re
from datetime import date, datetime, time, timedelta

from fastapi import HTTPException
from sqlalchemy import case, delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import checkin_window_minutes, qr_hmac_secret
from app.core.time import THAI_TIMEZONE
from app.models import Booking, BookingSlot, Checkin, Court, User
from app.services.quota_checker import check_booking_rules

BOOKING_WINDOW_DAYS = 7
CANCEL_CUTOFF = timedelta(hours=1)
# How many booking codes to try when other bookings save at the same moment.
MAX_CODE_ATTEMPTS = 5

RULE_ERRORS = {
    "MAX_HOURS": (422, "A booking must be 1 or 2 hours long."),
    "OUTSIDE_OPEN_HOURS": (422, "The court is open from 08:00 to 19:00."),
    "SLOT_TAKEN": (409, "This time slot is already booked."),
    "SLOT_IN_PAST": (422, "This time slot has already started."),
    "QUOTA_EXCEEDED": (422, "You can book at most 2 hours per day."),
}

# Statuses that can no longer change, with the error returned when they are acted on.
FINAL_STATUS_ERRORS = {
    "cancelled": ("ALREADY_CANCELLED", "This booking was already cancelled."),
    "checked-in": ("ALREADY_CHECKED_IN", "This booking was already checked in."),
    "no-show": ("ALREADY_NO_SHOW", "This booking expired without a check-in."),
}


def error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})


def invalid_input() -> HTTPException:
    return error(400, "INVALID_INPUT", "The request parameters are invalid.")


def parse_date(value: str) -> date:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise invalid_input()
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise invalid_input() from None


def parse_start(value: str) -> int:
    """Returns the start hour of an "HH:00" time; bookings start on the hour."""
    match = re.fullmatch(r"(\d{2}):00", value)
    if match is None or int(match.group(1)) > 23:
        raise invalid_input()
    return int(match.group(1))


def validate_booking_date(day: date, now: datetime) -> None:
    today = now.astimezone(THAI_TIMEZONE).date()
    if not today <= day < today + timedelta(days=BOOKING_WINDOW_DAYS):
        raise error(
            422,
            "DATE_OUT_OF_RANGE",
            f"Bookings can be made up to {BOOKING_WINDOW_DAYS} days ahead.",
        )


def start_datetime(booking: Booking) -> datetime:
    return datetime.combine(booking.booking_date, booking.start_time, tzinfo=THAI_TIMEZONE)


def checkin_window() -> timedelta:
    return timedelta(minutes=checkin_window_minutes())


def local_naive(now: datetime) -> datetime:
    """Thai wall-clock time without a timezone, the way DateTime columns store it."""
    return now.astimezone(THAI_TIMEZONE).replace(tzinfo=None)


def make_qr_token(code: str) -> str:
    secret = qr_hmac_secret()
    if not secret:
        raise error(500, "QR_NOT_CONFIGURED", "QR_HMAC_SECRET is not configured.")
    digest = hmac.new(secret.encode(), code.encode(), hashlib.sha256).hexdigest()
    return f"{code}.{digest}"


def booking_code_prefix(day: date) -> str:
    thai_year = (day.year + 543) % 100
    return f"TU-{thai_year:02d}{day.month:02d}{day.day:02d}"


def next_booking_code(session: Session, day: date) -> str:
    """Codes count up per day: TU-69101201, TU-69101202, ..."""
    prefix = booking_code_prefix(day)
    codes = session.scalars(select(Booking.code).where(Booking.code.like(f"{prefix}%")))
    used = [int(code[len(prefix):]) for code in codes if code[len(prefix):].isdigit()]
    return f"{prefix}{max(used, default=0) + 1:02d}"


def any_slot_taken(session: Session, court_id: int, day: date, hours: range) -> bool:
    taken = session.scalar(
        select(func.count())
        .select_from(BookingSlot)
        .where(
            BookingSlot.court_id == court_id,
            BookingSlot.booking_date == day,
            BookingSlot.start_hour.in_(hours),
        )
    )
    return bool(taken)


def free_slots(session: Session, booking: Booking) -> None:
    session.execute(delete(BookingSlot).where(BookingSlot.booking_id == booking.id))


def booking_to_dict(booking: Booking, include_qr: bool = False) -> dict[str, object]:
    result: dict[str, object] = {
        "id": booking.code,
        "code": booking.code,
        "courtId": booking.court_id,
        "court": booking.court.name,
        "location": booking.court.location,
        "date": booking.booking_date.isoformat(),
        "start": booking.start_time.strftime("%H:%M"),
        "end": booking.end_time.strftime("%H:%M"),
        "status": booking.status,
    }
    if booking.cancelled_at is not None:
        result["cancelledAt"] = booking.cancelled_at.isoformat(timespec="minutes")
    if booking.checkin is not None:
        result["checkedInBy"] = f"สแกนประตู {booking.checkin.gate}"
        result["checkedInAt"] = booking.checkin.checked_in_at.isoformat(timespec="minutes")
    if include_qr and booking.status == "pending":
        result["qrToken"] = make_qr_token(booking.code)
    return result


def get_booking_by_code(session: Session, code: str) -> Booking:
    booking = session.scalar(select(Booking).where(Booking.code == code))
    if booking is None:
        raise error(404, "BOOKING_NOT_FOUND", "The requested booking does not exist.")
    return booking


def create_booking(
    session: Session,
    user: User,
    *,
    court_id: int,
    day: date,
    start: int,
    duration_hours: int,
    now: datetime,
) -> Booking:
    if session.get(Court, court_id) is None:
        raise error(404, "COURT_NOT_FOUND", "The requested court does not exist.")
    validate_booking_date(day, now)
    decision = check_booking_rules(
        session,
        user_id=user.id,
        court_id=court_id,
        day=day,
        start_hour=start,
        duration_hours=duration_hours,
        now=now,
    )
    if not decision.available:
        status_code, message = RULE_ERRORS[decision.reason]
        raise error(status_code, decision.reason, message)

    hours = range(start, start + duration_hours)
    # Two requests at the same moment can both pass the checks above; the database
    # then lets only one of them save. Codes come from the same count, so a clash can
    # be just the code: then the hours are still free and the next code is tried.
    for _ in range(MAX_CODE_ATTEMPTS):
        booking = Booking(
            code=next_booking_code(session, day),
            user_id=user.id,
            court_id=court_id,
            booking_date=day,
            start_time=time(start),
            end_time=time(start + duration_hours),
            status="pending",
            created_at=local_naive(now),
        )
        session.add(booking)
        try:
            session.flush()
            # The slot primary key stops two bookings from taking the same hour.
            session.add_all(
                BookingSlot(
                    court_id=court_id,
                    booking_date=day,
                    start_hour=hour,
                    booking_id=booking.id,
                )
                for hour in hours
            )
            session.commit()
            return booking
        except IntegrityError:
            session.rollback()
            if any_slot_taken(session, court_id, day, hours):
                status_code, message = RULE_ERRORS["SLOT_TAKEN"]
                raise error(status_code, "SLOT_TAKEN", message) from None
    raise error(503, "BOOKING_BUSY", "Too many bookings at once. Please try again.")


def cancel_booking(session: Session, user_id: int, code: str, now: datetime) -> Booking:
    booking = session.scalar(
        select(Booking).where(Booking.code == code, Booking.user_id == user_id)
    )
    if booking is None:
        raise error(404, "BOOKING_NOT_FOUND", "The requested booking does not exist.")
    if booking.status in FINAL_STATUS_ERRORS:
        raise error(409, *FINAL_STATUS_ERRORS[booking.status])
    if start_datetime(booking) - now < CANCEL_CUTOFF:
        raise error(
            422,
            "CANCEL_TOO_LATE",
            "Bookings can be cancelled until 1 hour before they start.",
        )
    booking.status = "cancelled"
    booking.cancelled_at = local_naive(now)
    free_slots(session, booking)
    session.commit()
    return booking


def checkin_booking(
    session: Session,
    code: str,
    *,
    gate: str,
    qr_token: str | None,
    now: datetime,
) -> Booking:
    booking = get_booking_by_code(session, code)
    # Staff can check in by booking code alone; a scanned QR token must match the booking.
    if qr_token is not None and not hmac.compare_digest(qr_token, make_qr_token(booking.code)):
        raise error(400, "INVALID_QR", "The QR code does not match this booking.")
    if booking.status in FINAL_STATUS_ERRORS:
        raise error(409, *FINAL_STATUS_ERRORS[booking.status])
    gate = gate.strip()
    if not gate or len(gate) > 16:
        raise invalid_input()
    start = start_datetime(booking)
    window = checkin_window()
    minutes = checkin_window_minutes()
    if now < start - window:
        raise error(
            422,
            "CHECKIN_TOO_EARLY",
            f"Check-in opens {minutes} minutes before the booking starts.",
        )
    if now > start + window:
        raise error(
            422,
            "CHECKIN_TOO_LATE",
            f"Check-in closed {minutes} minutes after the booking started.",
        )
    # Staff login is not built yet, so check-ins are recorded under the first staff user.
    staff = session.scalar(select(User).where(User.role == "staff").order_by(User.id))
    if staff is None:
        raise error(503, "NO_STAFF_USER", "No staff user exists to record the check-in.")
    session.add(
        Checkin(
            booking_id=booking.id,
            gate=gate,
            checked_in_at=local_naive(now),
            staff_id=staff.id,
        )
    )
    booking.status = "checked-in"
    session.commit()
    session.refresh(booking)
    return booking


def expire_no_shows(session: Session, now: datetime) -> int:
    """Marks pending bookings as no-show once their check-in window has closed,
    and frees their slots. The caller commits."""
    pending = session.scalars(
        select(Booking).where(
            Booking.status == "pending",
            Booking.booking_date <= now.astimezone(THAI_TIMEZONE).date(),
        )
    ).all()
    window = checkin_window()
    expired = [booking for booking in pending if now > start_datetime(booking) + window]
    for booking in expired:
        booking.status = "no-show"
        free_slots(session, booking)
    return len(expired)


def user_booking_history(
    session: Session, user_id: int, *, page: int, size: int
) -> tuple[list[Booking], int]:
    total = session.scalar(
        select(func.count()).select_from(Booking).where(Booking.user_id == user_id)
    )
    # Active bookings first, the one made most recently on top. Finished ones
    # (checked in, cancelled, no-show) go below, latest date first.
    is_active = Booking.status == "pending"
    bookings = session.scalars(
        select(Booking)
        .where(Booking.user_id == user_id)
        .order_by(
            case((is_active, 0), else_=1),
            case((is_active, Booking.id), else_=None).desc(),
            Booking.booking_date.desc(),
            Booking.start_time.desc(),
            Booking.id.desc(),
        )
        .offset((page - 1) * size)
        .limit(size)
    ).all()
    return list(bookings), total or 0
