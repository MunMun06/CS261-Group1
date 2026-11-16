from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class StudentFacultySession(Base):
    __tablename__ = "student_faculty_sessions"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    synced_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class StudentFacultyMembership(Base):
    __tablename__ = "student_faculty_memberships"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    faculty: Mapped[str] = mapped_column(String(160), primary_key=True)
