from datetime import date, datetime, time

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.court import Court


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    name_th: Mapped[str] = mapped_column(String(120), nullable=False)
    faculty: Mapped[str] = mapped_column(String(160), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="member")


class Booking(Base):
    __tablename__ = "bookings"
    __table_args__ = (
        UniqueConstraint("code", name="uq_bookings_code"),
        Index("ix_bookings_user_date_status", "user_id", "booking_date", "status"),
        Index("ix_bookings_date_start_status", "booking_date", "start_time", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    court_id: Mapped[int] = mapped_column(ForeignKey("courts.id"), nullable=False)
    booking_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime)

    user: Mapped[User] = relationship()
    court: Mapped[Court] = relationship()
    checkin: Mapped["Checkin | None"] = relationship(
        back_populates="booking", uselist=False
    )


class BookingSlot(Base):
    __tablename__ = "booking_slots"
    __table_args__ = (Index("ix_booking_slots_booking_id", "booking_id"),)

    court_id: Mapped[int] = mapped_column(ForeignKey("courts.id"), primary_key=True)
    booking_date: Mapped[date] = mapped_column(Date, primary_key=True)
    start_hour: Mapped[int] = mapped_column(Integer, primary_key=True)
    booking_id: Mapped[int] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False
    )


class Checkin(Base):
    __tablename__ = "checkins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    booking_id: Mapped[int] = mapped_column(
        ForeignKey("bookings.id"), unique=True, nullable=False
    )
    gate: Mapped[str] = mapped_column(String(16), nullable=False)
    checked_in_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    staff_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    booking: Mapped[Booking] = relationship(back_populates="checkin")
    staff: Mapped[User] = relationship()


class BookingSequence(Base):
    __tablename__ = "booking_sequences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    next_value: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
