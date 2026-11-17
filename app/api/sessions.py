from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models import User
from app.services.booking_service import ALLOWED_FACULTY, error
from app.services.student_session import (
    StudentRegistryUnavailable,
    StudentSessionRequired,
    StudentSessionStale,
    current_student_session,
    refresh_student_session,
)

router = APIRouter(prefix="/api/session", tags=["session"])

SESSION_REFRESH_MESSAGE = (
    "ตรวจสอบข้อมูลคณะไม่ได้ กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่"
)


@router.post("/start")
def start_student_session(
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, object]:
    try:
        faculties, synced_at = refresh_student_session(session, user)
    except StudentRegistryUnavailable as exc:
        raise error(
            503,
            "STUDENT_REGISTRY_UNAVAILABLE",
            SESSION_REFRESH_MESSAGE,
        ) from exc

    return {
        "studentId": user.student_id,
        "faculties": faculties,
        "eligibleToBook": ALLOWED_FACULTY in faculties,
        "syncedAt": synced_at.isoformat(timespec="seconds"),
    }


@router.get("")
def get_student_session(
    session: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, object]:
    try:
        faculties, synced_at = current_student_session(session, user)
    except StudentSessionRequired as exc:
        raise error(
            409,
            "STUDENT_SESSION_REQUIRED",
            "กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่เพื่ออัปเดตข้อมูลคณะ",
        ) from exc
    except StudentSessionStale as exc:
        raise error(
            409,
            "STUDENT_SESSION_STALE",
            "ข้อมูลคณะใน Session ไม่เป็นปัจจุบัน กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่",
        ) from exc
    except StudentRegistryUnavailable as exc:
        raise error(
            503,
            "STUDENT_REGISTRY_UNAVAILABLE",
            SESSION_REFRESH_MESSAGE,
        ) from exc

    return {
        "studentId": user.student_id,
        "faculties": faculties,
        "eligibleToBook": ALLOWED_FACULTY in faculties,
        "syncedAt": synced_at.isoformat(timespec="seconds"),
    }
