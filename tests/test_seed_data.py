from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.models import User
from app.scripts.seed_data import seed_database


def test_seed_adds_cross_faculty_members_and_staff_accounts(
    db_session_factory: sessionmaker[Session],
) -> None:
    with db_session_factory() as session:
        users = {
            user.student_id: user
            for user in session.scalars(select(User)).all()
        }

    assert users["C"].faculty == "คณะวิศวกรรมศาสตร์"
    assert users["D"].faculty == "คณะศิลปศาสตร์"
    assert users["C"].role == users["D"].role == "member"
    assert users["S"].role == users["S2"].role == "staff"


def test_seed_is_idempotent_for_test_users(
    db_session_factory: sessionmaker[Session],
) -> None:
    with db_session_factory() as session:
        seed_database(session, anchor_day=date(2026, 10, 10))
        student_ids = session.scalars(select(User.student_id)).all()

    assert len(student_ids) == len(set(student_ids))
    assert {"A", "B", "C", "D", "S", "S2"} <= set(student_ids)
