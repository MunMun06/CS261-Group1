from app.core.database import get_session_factory
from app.core.time import now_thailand
from app.services.booking_service import expire_no_shows


def sweep_no_shows() -> int:
    """Marks bookings nobody checked in to as no-show. Run on a timer by app.main."""
    with get_session_factory()() as session:
        expired_count = expire_no_shows(session, now_thailand())
        session.commit()
        return expired_count
