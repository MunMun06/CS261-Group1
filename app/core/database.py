import os
from collections.abc import Generator
from functools import lru_cache

from sqlalchemy import Engine, URL, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import database_settings


class Base(DeclarativeBase):
    pass


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return create_engine(database_url, pool_pre_ping=True)
    settings = database_settings()
    if not settings["password"]:
        raise RuntimeError("Set DATABASE_URL or DB_PASSWORD before starting the API.")
    url = URL.create(
        "mysql+pymysql",
        username=str(settings["username"]),
        password=str(settings["password"]),
        host=str(settings["host"]),
        port=int(settings["port"]),
        database=str(settings["database"]),
        query={"charset": "utf8mb4"},
    )
    return create_engine(url, pool_pre_ping=True)


def get_session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    with get_session_factory()() as session:
        try:
            yield session
        finally:
            if session.in_transaction():
                session.rollback()
