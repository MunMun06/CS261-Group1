from math import ceil
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.time import now_thailand
from app.models import User
from app.schemas.history import BookingHistoryResponse
from app.services.booking_service import (
    booking_to_dict,
    expire_no_shows,
    user_booking_history,
)

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("", response_model=BookingHistoryResponse)
def get_booking_history(
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    page: Annotated[int, Query(ge=1)] = 1,
) -> dict[str, object]:
    now = now_thailand()
    expire_no_shows(session, now)
    session.commit()
    page_size = 20
    bookings, total = user_booking_history(
        session,
        user.id,
        page=page,
        size=page_size,
    )
    return {
        "items": [booking_to_dict(booking, include_qr=True) for booking in bookings],
        "page": page,
        "size": page_size,
        "total": total,
        "totalPages": ceil(total / page_size) if total else 0,
    }
