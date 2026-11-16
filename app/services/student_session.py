from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.time import now_thailand
from app.models import (
    StudentFacultyMembership,
    StudentFacultySession,
    User,
)
from app.services.student_registry import (
    StudentRegistryUnavailable,
    fetch_student_faculties,
)


class StudentSessionRequired(Exception):
    pass


class StudentSessionStale(Exception):
    pass


def refresh_student_session(
    session: Session,
    user: User,
) -> tuple[list[str], datetime]:
    faculties = fetch_student_faculties(
        user.student_id,
        fallback_faculty=user.faculty,
    )
    synced_at = now_thailand().replace(tzinfo=None)

    session.execute(
        delete(StudentFacultyMembership).where(
            StudentFacultyMembership.user_id == user.id
        )
    )
    snapshot = session.get(StudentFacultySession, user.id)
    if snapshot is None:
        session.add(StudentFacultySession(user_id=user.id, synced_at=synced_at))
    else:
        snapshot.synced_at = synced_at
    session.add_all(
        StudentFacultyMembership(user_id=user.id, faculty=faculty)
        for faculty in faculties
    )
    session.commit()
    return faculties, synced_at


def current_student_session(
    session: Session,
    user: User,
) -> tuple[list[str], datetime]:
    snapshot = session.get(StudentFacultySession, user.id)
    if snapshot is None:
        raise StudentSessionRequired

    latest_faculties = fetch_student_faculties(
        user.student_id,
        fallback_faculty=user.faculty,
    )
    session_faculties = list(
        session.scalars(
            select(StudentFacultyMembership.faculty).where(
                StudentFacultyMembership.user_id == user.id
            )
        )
    )
    if set(latest_faculties) != set(session_faculties):
        raise StudentSessionStale
    return latest_faculties, snapshot.synced_at


__all__ = [
    "StudentRegistryUnavailable",
    "StudentSessionRequired",
    "StudentSessionStale",
    "current_student_session",
    "refresh_student_session",
]
