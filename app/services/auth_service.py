import logging
from typing import Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import tu_api_application_key, tu_api_timeout_seconds
from app.models import User
from app.services.booking_service import error

logger = logging.getLogger(__name__)
TU_AUTH_URL = "https://restapi.tu.ac.th/api/v1/auth/Ad/verify"
TU_API_UNAVAILABLE_MESSAGE = (
    "ไม่สามารถเชื่อมต่อระบบยืนยันตัวตนของมหาวิทยาลัยได้ "
    "กรุณาลองใหม่อีกครั้งภายหลัง"
)
INVALID_CREDENTIALS_MESSAGE = "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"
TU_API_KEY_ERROR_MESSAGE = (
    "ไม่สามารถยืนยันสิทธิ์การเชื่อมต่อ TU API ได้ "
    "กรุณาตรวจสอบ Application-Key และสิทธิ์การใช้งาน"
)
TU_API_REQUEST_ERROR_MESSAGE = (
    "คำขอไปยัง TU API ไม่ถูกต้อง กรุณาตรวจสอบรูปแบบคำขอ"
)


class TUAuthProfile(BaseModel):
    model_config = ConfigDict(extra="ignore")

    status: bool
    type: Literal["student", "employee"]
    username: str = Field(min_length=1, max_length=32)
    displayname_th: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=1, max_length=255)
    faculty: str | None = None
    department: str | None = None
    organization: str | None = None


def verify_tu_credentials(username: str, password: str) -> TUAuthProfile:
    application_key = tu_api_application_key()
    if not application_key:
        raise error(
            503,
            "TU_API_NOT_CONFIGURED",
            "TU API Application-Key is not configured.",
        )

    try:
        response = httpx.post(
            TU_AUTH_URL,
            headers={
                "Content-Type": "application/json",
                "Application-Key": application_key,
            },
            json={"UserName": username, "PassWord": password},
            timeout=tu_api_timeout_seconds(),
        )
    except httpx.TimeoutException as exc:
        raise error(504, "TU_API_TIMEOUT", TU_API_UNAVAILABLE_MESSAGE) from exc
    except httpx.RequestError as exc:
        raise error(
            503, "TU_API_UNAVAILABLE", TU_API_UNAVAILABLE_MESSAGE
        ) from exc

    if response.status_code in {401, 403}:
        code = (
            "TU_API_KEY_UNAUTHORIZED"
            if response.status_code == 401
            else "TU_API_KEY_FORBIDDEN"
        )
        logger.error(
            "TU authentication rejected Application-Key with HTTP %d",
            response.status_code,
        )
        raise error(502, code, TU_API_KEY_ERROR_MESSAGE)
    if response.status_code == 400:
        data = _response_json(response)
        if _is_invalid_credentials_message(_response_message(data)):
            raise error(401, "INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE)
        logger.warning("TU authentication rejected the request with HTTP 400.")
        raise error(502, "TU_API_REQUEST_ERROR", TU_API_REQUEST_ERROR_MESSAGE)
    if response.status_code == 429:
        raise error(
            503, "TU_API_RATE_LIMITED", TU_API_UNAVAILABLE_MESSAGE
        )
    if response.status_code != 200:
        logger.warning("TU authentication returned HTTP %d", response.status_code)
        raise error(502, "TU_API_ERROR", TU_API_UNAVAILABLE_MESSAGE)

    data = _response_json(response)
    if data is None:
        logger.warning("TU authentication returned invalid JSON.")
        raise error(502, "TU_API_INVALID_RESPONSE", TU_API_UNAVAILABLE_MESSAGE)
    if data.get("status") is False:
        if _is_invalid_credentials_message(_response_message(data)):
            raise error(401, "INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE)
        logger.warning("TU authentication returned status=false.")
        raise error(502, "TU_API_ERROR", TU_API_UNAVAILABLE_MESSAGE)

    try:
        profile = TUAuthProfile.model_validate(data)
    except ValidationError as exc:
        logger.warning("TU authentication returned an incomplete profile.")
        raise error(
            502, "TU_API_INVALID_RESPONSE", TU_API_UNAVAILABLE_MESSAGE
        ) from exc

    if not profile.status:
        raise error(502, "TU_API_ERROR", TU_API_UNAVAILABLE_MESSAGE)
    return profile


def _response_json(response: httpx.Response) -> dict[str, object] | None:
    try:
        data = response.json()
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def _response_message(data: dict[str, object] | None) -> str:
    message = data.get("message") if data else None
    return message if isinstance(message, str) else ""


def _is_invalid_credentials_message(message: str) -> bool:
    normalized = " ".join(message.casefold().split())
    if "request body" in normalized:
        return False
    # TU's real reply for a wrong password is "Users or Password Invalid!".
    return (
        "user or password invalid" in normalized
        or "users or password invalid" in normalized
        or "username or password invalid" in normalized
    )


def upsert_tu_user(session: Session, profile: TUAuthProfile) -> User:
    user = session.scalar(select(User).where(User.student_id == profile.username))
    if user is None:
        user = User(
            student_id=profile.username,
            name_th=profile.displayname_th,
            faculty="",
            email=profile.email,
            role="member",
        )
        session.add(user)

    user.name_th = profile.displayname_th
    user.faculty = profile.faculty or "มหาวิทยาลัยธรรมศาสตร์"
    user.email = profile.email
    session.flush()
    return user
