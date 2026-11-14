import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import tu_api_timeout_seconds
from app.core.session import SESSION_COOKIE_NAME
from app.models import User
from app.services import auth_service


def tu_student_profile(
    *,
    name: str = "นักศึกษาทดสอบ",
    faculty: str = "คณะทดสอบ",
) -> dict[str, object]:
    return {
        "status": True,
        "type": "student",
        "username": "6601000001",
        "tu_status": "สำเร็จการศึกษา",
        "displayname_th": name,
        "displayname_en": "Test Student",
        "statusid": "40",
        "email": "student@dome.tu.ac.th",
        "department": "สาขาวิชาทดสอบ",
        "faculty": faculty,
    }


def mock_tu_response(
    monkeypatch: pytest.MonkeyPatch,
    body: object,
    *,
    status_code: int = 200,
) -> None:
    def post(
        url: str,
        *,
        headers: dict[str, str],
        json: dict[str, str],
        timeout: float,
    ) -> httpx.Response:
        assert url == auth_service.TU_AUTH_URL
        assert headers["Application-Key"] == "test-application-key"
        assert json == {
            "UserName": "6601000001",
            "PassWord": "password-for-test",
        }
        assert timeout == 10
        return httpx.Response(status_code, json=body)

    monkeypatch.setattr(auth_service.httpx, "post", post)


def test_login_verifies_and_saves_tu_profile(
    api_client: TestClient,
    db_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mock_tu_response(monkeypatch, tu_student_profile())

    response = api_client.post(
        "/api/auth/login",
        json={"username": "6601000001", "password": "password-for-test"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "studentId": "6601000001",
        "name": "นักศึกษาทดสอบ",
        "faculty": "คณะทดสอบ",
    }
    assert response.cookies.get(SESSION_COOKIE_NAME)
    assert "httponly" in response.headers["set-cookie"].lower()
    with db_session_factory() as session:
        user = session.scalar(
            select(User).where(User.student_id == "6601000001")
        )
        assert user is not None
        assert user.name_th == "นักศึกษาทดสอบ"
        assert user.faculty == "คณะทดสอบ"
        assert user.email == "student@dome.tu.ac.th"
        assert user.role == "member"


def test_logout_removes_the_session_cookie(api_client: TestClient) -> None:
    response = api_client.post("/api/auth/logout")

    assert response.status_code == 204
    set_cookie = response.headers["set-cookie"].lower()
    assert set_cookie.startswith(f"{SESSION_COOKIE_NAME}=")
    assert "max-age=0" in set_cookie
    assert "httponly" in set_cookie


def test_login_updates_existing_user_without_creating_duplicate(
    api_client: TestClient,
    db_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mock_tu_response(
        monkeypatch,
        tu_student_profile(name="ชื่ออัปเดต", faculty="คณะใหม่"),
    )

    response = api_client.post(
        "/api/auth/login",
        json={"username": "6601000001", "password": "password-for-test"},
    )

    assert response.status_code == 200
    with db_session_factory() as session:
        matches = session.scalars(
            select(User).where(User.student_id == "6601000001")
        ).all()
        assert len(matches) == 1
        assert matches[0].name_th == "ชื่ออัปเดต"
        assert matches[0].faculty == "คณะใหม่"


@pytest.mark.parametrize(
    ("status_code", "body"),
    [
        (200, {"status": False, "message": "invalid"}),
        (400, {"status": False, "message": "User or Password Invalid!"}),
    ],
)
def test_invalid_tu_credentials_are_rejected(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    status_code: int,
    body: dict[str, object],
) -> None:
    mock_tu_response(monkeypatch, body, status_code=status_code)

    response = api_client.post(
        "/api/auth/login",
        json={"username": "6601000001", "password": "password-for-test"},
    )

    assert response.status_code == 401
    assert SESSION_COOKIE_NAME not in response.cookies
    assert response.json()["error"] == {
        "code": "INVALID_CREDENTIALS",
        "message": "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
    }


def test_tu_timeout_is_returned_as_gateway_timeout(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def timeout(*_: object, **kwargs: object) -> httpx.Response:
        assert kwargs["timeout"] == 10
        raise httpx.TimeoutException("timeout")

    monkeypatch.setattr(auth_service.httpx, "post", timeout)
    response = api_client.post(
        "/api/auth/login",
        json={"username": "6601000001", "password": "password-for-test"},
    )

    assert response.status_code == 504
    assert response.json()["error"] == {
        "code": "TU_API_TIMEOUT",
        "message": (
            "ไม่สามารถเชื่อมต่อระบบยืนยันตัวตนของมหาวิทยาลัยได้ "
            "กรุณาลองใหม่อีกครั้งภายหลัง"
        ),
    }


def test_tu_connection_error_returns_unavailable_message(
    api_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def connection_error(*_: object, **__: object) -> httpx.Response:
        raise httpx.ConnectError("TU is unavailable")

    monkeypatch.setattr(auth_service.httpx, "post", connection_error)
    response = api_client.post(
        "/api/auth/login",
        json={"username": "6601000001", "password": "password-for-test"},
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "TU_API_UNAVAILABLE"
    assert response.json()["error"]["message"] == (
        "ไม่สามารถเชื่อมต่อระบบยืนยันตัวตนของมหาวิทยาลัยได้ "
        "กรุณาลองใหม่อีกครั้งภายหลัง"
    )


@pytest.mark.parametrize("timeout", ["5", "7.5", "10"])
def test_tu_timeout_setting_accepts_values_between_five_and_ten(
    monkeypatch: pytest.MonkeyPatch,
    timeout: str,
) -> None:
    monkeypatch.setenv("TU_API_TIMEOUT_SECONDS", timeout)

    assert tu_api_timeout_seconds() == float(timeout)


@pytest.mark.parametrize("timeout", ["4.9", "10.1", "0"])
def test_tu_timeout_setting_rejects_values_outside_five_to_ten(
    monkeypatch: pytest.MonkeyPatch,
    timeout: str,
) -> None:
    monkeypatch.setenv("TU_API_TIMEOUT_SECONDS", timeout)

    with pytest.raises(ValueError, match="between 5 and 10"):
        tu_api_timeout_seconds()
