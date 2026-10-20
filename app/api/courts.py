from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.time import now_thailand
from app.models import Court, User
from app.services.booking_service import (
    expire_no_shows,
    parse_date,
    validate_booking_date,
)
from app.services.quota_checker import (
    CLOSE_HOUR,
    OPEN_HOUR,
    check_booking_rules,
    get_quota_used,
)

router = APIRouter(prefix="/api/courts", tags=["courts"])


@router.get("")
def list_courts(
    session: Annotated[Session, Depends(get_db)],
) -> list[dict[str, object]]:
    courts = session.scalars(select(Court).order_by(Court.id)).all()
    return [
        {
            "id": court.id,
            "name": court.name,
            "location": court.location,
            "imageUrl": court.image_url,
        }
        for court in courts
    ]


@router.get("/{court_id}/slots")
def list_court_slots(
    court_id: int,
    date: str,
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, object]:
    now = now_thailand()
    expire_no_shows(session, now)
    session.commit()
    day = parse_date(date)
    validate_booking_date(day, now)
    if session.get(Court, court_id) is None:
        from app.services.booking_service import error

        raise error(404, "COURT_NOT_FOUND", "The requested court does not exist.")
    quota_used = get_quota_used(session, user.id, day)
    slots: list[dict[str, str | bool]] = []
    for hour in range(OPEN_HOUR, CLOSE_HOUR):
        decision = check_booking_rules(
            session,
            user_id=user.id,
            court_id=court_id,
            day=day,
            start_hour=hour,
            duration_hours=1,
            now=now,
        )
        slots.append(
            {
                "start": f"{hour:02d}:00",
                "end": f"{hour + 1:02d}:00",
                "status": "booked" if decision.reason == "SLOT_TAKEN" else "available",
                "bookable": decision.available,
            }
        )
    return {
        "courtId": court_id,
        "date": day.isoformat(),
        "slots": slots,
        "quotaUsed": quota_used,
        "quotaMax": 2,
    }
