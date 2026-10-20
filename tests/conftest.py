from collections.abc import Iterator
from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app import main
from app.api import bookings, courts, history
from app.core.database import Base, get_db
from app.scripts.seed_data import seed_database

TZ = ZoneInfo("Asia/Bangkok")


@pytest.fixture
def current_time(monkeypatch: pytest.MonkeyPatch) -> list[datetime]:
    now = [datetime(2026, 10, 10, 10, 0, tzinfo=TZ)]
    monkeypatch.setenv("QR_HMAC_SECRET", "test-only-secret")
    monkeypatch.setattr(courts, "now_thailand", lambda: now[0])
    monkeypatch.setattr(bookings, "now_thailand", lambda: now[0])
    monkeypatch.setattr(history, "now_thailand", lambda: now[0])
    return now


@pytest.fixture
def db_session_factory() -> Iterator[sessionmaker[Session]]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        seed_database(session, anchor_day=date(2026, 10, 10))

    yield factory
    engine.dispose()


@pytest.fixture
def api_client(
    current_time: list[datetime],
    db_session_factory: sessionmaker[Session],
) -> Iterator[TestClient]:
    def override_get_db() -> Iterator[Session]:
        with db_session_factory() as session:
            try:
                yield session
            finally:
                if session.in_transaction():
                    session.rollback()

    main.app.dependency_overrides[get_db] = override_get_db
    client = TestClient(main.app)
    try:
        yield client
    finally:
        client.close()
        main.app.dependency_overrides.clear()
