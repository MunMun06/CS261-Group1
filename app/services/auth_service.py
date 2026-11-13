import logging

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


class TUAuthProfile(BaseModel):
    model_config = ConfigDict(extra="ignore")

    status: bool
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
            TU_API_UNAVAILABLE_MESSAGE,
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

    if response.status_code == 400:
        raise error(401, "INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE)
    if response.status_code == 429:
        raise error(
            503, "TU_API_RATE_LIMITED", TU_API_UNAVAILABLE_MESSAGE
        )
    if response.status_code != 200:
        logger.warning("TU authentication returned HTTP %d", response.status_code)
        raise error(502, "TU_API_ERROR", TU_API_UNAVAILABLE_MESSAGE)

    try:
        data = response.json()
    except ValueError as exc:
        logger.warning("TU authentication returned invalid JSON.")
        raise error(
            502, "TU_API_INVALID_RESPONSE", TU_API_UNAVAILABLE_MESSAGE
        ) from exc

    if not isinstance(data, dict):
        logger.warning("TU authentication returned a non-object response.")
        raise error(502, "TU_API_INVALID_RESPONSE", TU_API_UNAVAILABLE_MESSAGE)
    if data.get("status") is False:
        raise error(401, "INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE)

    try:
        profile = TUAuthProfile.model_validate(data)
    except ValidationError as exc:
        logger.warning("TU authentication returned an incomplete profile.")
        raise error(
            502, "TU_API_INVALID_RESPONSE", TU_API_UNAVAILABLE_MESSAGE
        ) from exc

    if not profile.status:
        raise error(401, "INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE)
    return profile


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
    user.faculty = (
        profile.faculty
        or profile.organization
        or profile.department
        or "มหาวิทยาลัยธรรมศาสตร์"
    )
    user.email = profile.email
    session.flush()
    return user
