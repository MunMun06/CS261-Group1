from app.core.database import Base, get_engine
from app.models import Booking, BookingSequence, BookingSlot, Checkin, Court, User


def migrate_database() -> None:
    Base.metadata.create_all(get_engine())


if __name__ == "__main__":
    migrate_database()
