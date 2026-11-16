import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.core.session import SESSION_COOKIE_NAME
from app.models import StaffCredential, User
from app.scripts import create_staff
from app.scripts.seed_data import SEED_STAFF_PASSWORD, seed_database
from app.services import auth_service
from app.services.staff_auth import hash_password, set_staff_password, verify_password

STAFF_PASSWORD = "staff-test-password"


@pytest.fixture
def staff_account(db_session_factory: sessionmaker[Session]) -> None:
    """The seeded staff account "S" with a password, as create_staff would set it."""
    with db_session_factory() as session:
        set_staff_password(session, "S", STAFF_PASSWORD)
        session.commit()


def staff_login(client: TestClient, username: str, password: str):
    client.cookies.clear()
    return client.post(
        "/api/auth/staff-login", json={"username": username, "password": password}
    )


def test_password_hash_is_salted_and_verifies() -> None:
    first = hash_password(STAFF_PASSWORD)
    second = hash_password(STAFF_PASSWORD)

    assert first != second
    assert STAFF_PASSWORD not in first
    assert verify_password(STAFF_PASSWORD, first)
    assert not verify_password("wrong-password", first)
    assert not verify_password(STAFF_PASSWORD, "not-a-hash")


def test_staff_logs_in_with_password_and_can_use_staff_apis(
    api_client: TestClient, staff_account: None
) -> None:
    response = staff_login(api_client, "S", STAFF_PASSWORD)
    me = api_client.get("/api/auth/me")
    staff_api = api_client.get("/api/staff/bookings/TU-00000000")

    assert response.status_code == 200
    assert response.json()["studentId"] == "S"
    assert SESSION_COOKIE_NAME in response.cookies
    assert me.json()["role"] == "staff"
    # Signed in as staff: the staff API answers instead of returning 401 or 403.
    assert staff_api.status_code == 404


@pytest.mark.parametrize(
    ("username", "password"),
    [
        ("S", "wrong-password"),  # wrong password
        ("nobody", STAFF_PASSWORD),  # unknown username
        ("S2", STAFF_PASSWORD),  # another staff account's password
        ("A", STAFF_PASSWORD),  # member account
    ],
)
def test_staff_login_rejects_wrong_or_unknown_accounts_the_same_way(
    api_client: TestClient, staff_account: None, username: str, password: str
) -> None:
    response = staff_login(api_client, username, password)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"
    assert SESSION_COOKIE_NAME not in response.cookies


def test_staff_login_stops_working_if_the_account_is_no_longer_staff(
    api_client: TestClient,
    staff_account: None,
    db_session_factory: sessionmaker[Session],
) -> None:
    with db_session_factory() as session:
        session.scalar(select(User).where(User.student_id == "S")).role = "member"
        session.commit()

    assert staff_login(api_client, "S", STAFF_PASSWORD).status_code == 401


@pytest.mark.parametrize("username", ["S", "S2"])
def test_seeded_staff_log_in_with_the_seed_password_even_with_a_tu_key(
    api_client: TestClient, monkeypatch: pytest.MonkeyPatch, username: str
) -> None:
    # With a TU key the test login is off, so this is the real staff login.
    monkeypatch.setenv("TU_API_APPLICATION_KEY", "tu-key")

    response = staff_login(api_client, username, SEED_STAFF_PASSWORD)

    assert response.status_code == 200
    assert api_client.get("/api/auth/me").json()["role"] == "staff"
    assert staff_login(api_client, username, "wrong-password").status_code == 401


def test_seeding_again_keeps_a_password_set_with_create_staff(
    api_client: TestClient,
    staff_account: None,
    db_session_factory: sessionmaker[Session],
) -> None:
    with db_session_factory() as session:
        seed_database(session)

    assert staff_login(api_client, "S", STAFF_PASSWORD).status_code == 200
    assert staff_login(api_client, "S", SEED_STAFF_PASSWORD).status_code == 401


def test_tu_login_cannot_take_over_a_staff_account_with_the_same_username(
    api_client: TestClient,
    staff_account: None,
    db_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    profile = auth_service.TUAuthProfile(
        status=True,
        type="student",
        username="S",
        displayname_th="บัญชี TU ชื่อซ้ำ",
        email="someone@dome.tu.ac.th",
        faculty="คณะวิศวกรรมศาสตร์",
    )
    monkeypatch.setattr(
        "app.api.auth.verify_tu_credentials", lambda username, password: profile
    )
    api_client.cookies.clear()

    response = api_client.post(
        "/api/auth/login", json={"username": "S", "password": "tu-password"}
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "USE_STAFF_LOGIN"
    assert SESSION_COOKIE_NAME not in response.cookies
    with db_session_factory() as session:
        staff = session.scalar(select(User).where(User.student_id == "S"))
        assert staff.name_th != "บัญชี TU ชื่อซ้ำ"
        assert staff.role == "staff"


def test_set_staff_password_creates_a_new_staff_account(
    db_session_factory: sessionmaker[Session],
) -> None:
    with db_session_factory() as session:
        user, created = set_staff_password(
            session, "staff01", STAFF_PASSWORD, name="เจ้าหน้าที่ทดสอบใหม่"
        )
        session.commit()

    with db_session_factory() as session:
        saved = session.scalar(select(User).where(User.student_id == "staff01"))
        credential = session.get(StaffCredential, saved.id)

    assert created
    assert saved.role == "staff"
    assert saved.name_th == "เจ้าหน้าที่ทดสอบใหม่"
    assert verify_password(STAFF_PASSWORD, credential.password_hash)


def test_set_staff_password_resets_an_existing_password(
    db_session_factory: sessionmaker[Session], staff_account: None
) -> None:
    with db_session_factory() as session:
        _, created = set_staff_password(session, "S", "a-brand-new-password")
        session.commit()
        user = session.scalar(select(User).where(User.student_id == "S"))
        credential = session.get(StaffCredential, user.id)

        assert not created
        assert verify_password("a-brand-new-password", credential.password_hash)
        assert not verify_password(STAFF_PASSWORD, credential.password_hash)


@pytest.mark.parametrize(
    ("username", "password", "message"),
    [
        ("A", STAFF_PASSWORD, "member account"),  # never turns a member into staff
        ("staff02", "short", "at least 8"),
        ("", STAFF_PASSWORD, "1 to 32"),
    ],
)
def test_set_staff_password_refuses_bad_input(
    db_session_factory: sessionmaker[Session], username: str, password: str, message: str
) -> None:
    with db_session_factory() as session:
        with pytest.raises(ValueError, match=message):
            set_staff_password(session, username, password)


def test_create_staff_script_needs_the_same_password_twice(
    db_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    answers = iter([STAFF_PASSWORD, "something-else"])
    monkeypatch.setattr(create_staff.getpass, "getpass", lambda prompt: next(answers))

    assert create_staff.main(["staff03"]) == 1
    assert "do not match" in capsys.readouterr().err
    with db_session_factory() as session:
        assert session.scalar(select(User).where(User.student_id == "staff03")) is None


def test_create_staff_script_saves_the_account(
    db_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr(create_staff.getpass, "getpass", lambda prompt: STAFF_PASSWORD)
    monkeypatch.setattr(create_staff, "migrate_database", lambda: None)
    monkeypatch.setattr(create_staff, "get_session_factory", lambda: db_session_factory)

    assert create_staff.main(["staff04", "--name", "เจ้าหน้าที่สี่"]) == 0
    assert "Created staff account 'staff04'" in capsys.readouterr().out
    with db_session_factory() as session:
        assert session.scalar(select(User).where(User.student_id == "staff04")).role == "staff"
