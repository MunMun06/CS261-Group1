from typing import Annotated

from fastapi import Cookie, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.session import SESSION_COOKIE_NAME, read_session_student_id
from app.models import User
from app.services.booking_service import error


def get_current_user(
    session: Annotated[Session, Depends(get_db)],
    session_token: Annotated[str | None, Cookie(alias=SESSION_COOKIE_NAME)] = None,
) -> User:
    # The signed-in user comes from the session cookie set by POST /api/auth/login.
    student_id = read_session_student_id(session_token) if session_token else None
    user = (
        session.scalar(select(User).where(User.student_id == student_id))
        if student_id
        else None
    )
    if user is None:
        raise error(401, "UNAUTHORIZED", "No signed-in user was found.")
    return user
