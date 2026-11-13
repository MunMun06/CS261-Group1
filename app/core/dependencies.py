import os
from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import User
from app.services.booking_service import error


def get_current_user(
    session: Annotated[Session, Depends(get_db)],
    x_student_id: Annotated[str | None, Header()] = None,
) -> User:
    # Login is not yet connected to the booking APIs: this header selects a test
    # user, and DEV_STUDENT_ID (the seeded user "A") is used without it.
    student_id = x_student_id or os.getenv("DEV_STUDENT_ID", "A")
    user = session.scalar(select(User).where(User.student_id == student_id))
    if user is None:
        raise error(401, "UNAUTHORIZED", "No signed-in user was found.")
    return user
