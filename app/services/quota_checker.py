from dataclasses import dataclass
from datetime import date, datetime, time

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import THAI_TIMEZONE
from app.models import Booking, BookingSlot

OPEN_HOUR = 8
CLOSE_HOUR = 19
DAILY_QUOTA_HOURS = 2


@dataclass(frozen=True)
class BookingDecision:
    available: bool
    reason: str | None
    quota_used: int


def get_daily_quota_used_portable(
    session: Session, user_id: int, day: date
) -> int:
    bookings = session.scalars(
        select(Booking).where(
            Booking.user_id == user_id,
            Booking.booking_date == day,
            Booking.status != "cancelled",
        )
    )
    return sum(booking.end_time.hour - booking.start_time.hour for booking in bookings)


def is_slot_occupied(
    session: Session, court_id: int, day: date, start_hour: int
) -> bool:
    return session.get(BookingSlot, (court_id, day, start_hour)) is not None


def evaluate_booking(
    session: Session,
    *,
    user_id: int,
    court_id: int,
    day: date,
    start_hour: int,
    duration_hours: int,
    now: datetime,
) -> BookingDecision:
    quota_used = get_daily_quota_used_portable(session, user_id, day)
    if duration_hours not in (1, 2):
        return BookingDecision(False, "MAX_HOURS", quota_used)
    if start_hour < OPEN_HOUR or start_hour + duration_hours > CLOSE_HOUR:
        return BookingDecision(False, "OUTSIDE_OPEN_HOURS", quota_used)
    if any(
        is_slot_occupied(session, court_id, day, hour)
        for hour in range(start_hour, start_hour + duration_hours)
    ):
        return BookingDecision(False, "SLOT_TAKEN", quota_used)
    start = datetime.combine(day, time(start_hour), tzinfo=THAI_TIMEZONE)
    if start <= now.astimezone(THAI_TIMEZONE):
        return BookingDecision(False, "SLOT_IN_PAST", quota_used)
    if quota_used + duration_hours > DAILY_QUOTA_HOURS:
        return BookingDecision(False, "QUOTA_EXCEEDED", quota_used)
    return BookingDecision(True, None, quota_used)


def get_quota_used(session: Session, user_id: int, day: date) -> int:
    return get_daily_quota_used_portable(session, user_id, day)


def check_booking_rules(
    session: Session,
    *,
    user_id: int,
    court_id: int,
    day: date,
    start_hour: int,
    duration_hours: int,
    now: datetime,
) -> BookingDecision:
    return evaluate_booking(
        session,
        user_id=user_id,
        court_id=court_id,
        day=day,
        start_hour=start_hour,
        duration_hours=duration_hours,
        now=now,
    )
