from datetime import date, datetime, time, timedelta
from typing import TypedDict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_session_factory
from app.core.time import now_thailand
from app.models import (
    Booking,
    BookingSequence,
    BookingSlot,
    Checkin,
    Court,
    User,
)


class SeedBooking(TypedDict):
    code: str
    student_id: str
    court_id: int
    day: date
    start: time
    end: time
    status: str


def get_seed_bookings(anchor_day: date | None = None) -> tuple[SeedBooking, ...]:
    base_day = anchor_day or now_thailand().date()
    scenarios = (
        ("A", 1, 6, time(18), time(19), "pending"),
        ("A", 1, 1, time(18), time(19), "checked-in"),
        ("A", 1, 4, time(17), time(18), "cancelled"),
        ("B", 1, 1, time(13), time(15), "pending"),
        ("B", 2, 1, time(11), time(12), "cancelled"),
    )
    daily_sequences: dict[date, int] = {}
    bookings: list[SeedBooking] = []
    for student_id, court_id, day_offset, start, end, status in scenarios:
        booking_day = base_day + timedelta(days=day_offset)
        sequence = daily_sequences.get(booking_day, 0) + 1
        daily_sequences[booking_day] = sequence
        thai_year = (booking_day.year + 543) % 100
        code = (
            f"TU-{thai_year:02d}{booking_day.month:02d}"
            f"{booking_day.day:02d}{sequence:02d}"
        )
        bookings.append(
            SeedBooking(
                code=code,
                student_id=student_id,
                court_id=court_id,
                day=booking_day,
                start=start,
                end=end,
                status=status,
            )
        )
    return tuple(bookings)


def seed_database(
    session: Session | None = None,
    *,
    anchor_day: date | None = None,
) -> None:
    if session is None:
        with get_session_factory()() as owned_session:
            seed_database(owned_session, anchor_day=anchor_day)
        return
    users = (
        User(
            student_id="A",
            name_th="ผู้ใช้ทดสอบ A",
            faculty="คณะวิทยาศาสตร์และเทคโนโลยี",
            email="a@example.invalid",
            role="member",
        ),
        User(
            student_id="B",
            name_th="ผู้ใช้ทดสอบ B",
            faculty="คณะวิทยาศาสตร์และเทคโนโลยี",
            email="b@example.invalid",
            role="member",
        ),
        User(
            student_id="S",
            name_th="เจ้าหน้าที่ทดสอบ",
            faculty="คณะวิทยาศาสตร์และเทคโนโลยี",
            email="staff@example.invalid",
            role="staff",
        ),
    )
    for user in users:
        if session.scalar(select(User).where(User.student_id == user.student_id)) is None:
            session.add(user)
    courts = (
        Court(id=1, name="สนามบาสเกตบอล สนามที่ 1", location="ศูนย์รังสิต"),
        Court(id=2, name="สนามบาสเกตบอล สนามที่ 2", location="ศูนย์รังสิต"),
    )
    for court in courts:
        if session.get(Court, court.id) is None:
            session.add(court)
    if session.get(BookingSequence, 1) is None:
        session.add(BookingSequence(id=1, next_value=1))
    session.flush()

    users_by_student_id = {
        user.student_id: user
        for user in session.scalars(select(User)).all()
    }
    for seed in get_seed_bookings(anchor_day):
        booking = session.scalar(
            select(Booking).where(Booking.code == seed["code"])
        )
        if booking is not None:
            continue
        user = users_by_student_id[seed["student_id"]]
        created_at = datetime.combine(seed["day"], seed["start"])
        booking = Booking(
            code=seed["code"],
            user_id=user.id,
            court_id=seed["court_id"],
            booking_date=seed["day"],
            start_time=seed["start"],
            end_time=seed["end"],
            status=seed["status"],
            created_at=created_at,
            cancelled_at=(
                datetime.combine(seed["day"], time(10))
                if seed["status"] == "cancelled"
                else None
            ),
        )
        session.add(booking)
        session.flush()
        if booking.status in {"pending", "checked-in"}:
            session.add_all(
                BookingSlot(
                    court_id=booking.court_id,
                    booking_date=booking.booking_date,
                    start_hour=hour,
                    booking_id=booking.id,
                )
                for hour in range(booking.start_time.hour, booking.end_time.hour)
            )
        if booking.status == "checked-in":
            staff = users_by_student_id["S"]
            session.add(
                Checkin(
                    booking_id=booking.id,
                    gate="A1",
                    checked_in_at=created_at,
                    staff_id=staff.id,
                )
            )
    session.commit()


if __name__ == "__main__":
    seed_database()
