from app.core.config import seed_enabled
from app.core.database import Base, get_engine
from app.models import (
    Booking,
    BookingSequence,
    BookingSlot,
    Checkin,
    Court,
    StudentFacultyMembership,
    StudentFacultySession,
    User,
)
from app.scripts.seed_data import seed_database


def migrate_database() -> None:
    Base.metadata.create_all(get_engine())


if __name__ == "__main__":
    migrate_database()
    if seed_enabled():
        seed_database()
