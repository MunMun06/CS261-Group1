import os
from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import tu_api_application_key
from app.core.database import get_db
from app.core.session import clear_session_cookie, set_session_cookie
from app.models import User
from app.schemas.auth import DevLoginRequest, LoginRequest, LoginResponse
from app.services.auth_service import upsert_tu_user, verify_tu_credentials
from app.services.booking_service import error

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Verify TU credentials and save user profile",
    description=(
        "Checks the username and password with TU API, then creates or updates "
        "the matching record in users and starts a session in an HttpOnly cookie. "
        "The password is not stored."
    ),
    responses={
        401: {
            "description": "TU rejected the username or password.",
            "content": {
                "application/json": {
                    "example": {
                        "error": {
                            "code": "INVALID_CREDENTIALS",
                            "message": "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
                        }
                    }
                }
            },
        },
        502: {
            "description": (
                "TU rejected the request, rejected the Application-Key, or returned "
                "an invalid response."
            ),
            "content": {
                "application/json": {
                    "examples": {
                        "applicationKeyRejected": {
                            "summary": "Application-Key is invalid or unauthorized",
                            "value": {
                                "error": {
                                    "code": "TU_API_KEY_FORBIDDEN",
                                    "message": (
                                        "ไม่สามารถยืนยันสิทธิ์การเชื่อมต่อ TU API ได้ "
                                        "กรุณาตรวจสอบ Application-Key และสิทธิ์การใช้งาน"
                                    ),
                                }
                            },
                        },
                        "invalidRequest": {
                            "summary": "TU API rejected the request body",
                            "value": {
                                "error": {
                                    "code": "TU_API_REQUEST_ERROR",
                                    "message": (
                                        "คำขอไปยัง TU API ไม่ถูกต้อง "
                                        "กรุณาตรวจสอบรูปแบบคำขอ"
                                    ),
                                }
                            },
                        },
                        "upstreamUnavailable": {
                            "summary": "TU API returned an upstream error",
                            "value": {
                                "error": {
                                    "code": "TU_API_ERROR",
                                    "message": (
                                        "ไม่สามารถเชื่อมต่อระบบยืนยันตัวตนของมหาวิทยาลัยได้ "
                                        "กรุณาลองใหม่อีกครั้งภายหลัง"
                                    ),
                                }
                            },
                        },
                    }
                }
            },
        },
        503: {
            "description": "TU API is not configured or is unavailable.",
            "content": {
                "application/json": {
                    "example": {
                        "error": {
                            "code": "TU_API_UNAVAILABLE",
                            "message": (
                                "ไม่สามารถเชื่อมต่อระบบยืนยันตัวตนของมหาวิทยาลัยได้ "
                                "กรุณาลองใหม่อีกครั้งภายหลัง"
                            ),
                        }
                    }
                }
            },
        },
        504: {
            "description": "TU API request timed out.",
            "content": {
                "application/json": {
                    "example": {
                        "error": {
                            "code": "TU_API_TIMEOUT",
                            "message": (
                                "ไม่สามารถเชื่อมต่อระบบยืนยันตัวตนของมหาวิทยาลัยได้ "
                                "กรุณาลองใหม่อีกครั้งภายหลัง"
                            ),
                        }
                    }
                }
            },
        },
    },
)
def login(
    payload: LoginRequest,
    response: Response,
    session: Annotated[Session, Depends(get_db)],
) -> LoginResponse:
    profile = verify_tu_credentials(
        payload.username, payload.password.get_secret_value()
    )
    user = upsert_tu_user(session, profile)
    session.commit()
    set_session_cookie(response, user.student_id)
    return LoginResponse(
        student_id=user.student_id,
        name=user.name_th,
        faculty=user.faculty,
    )


def dev_login_enabled() -> bool:
    """Test login works only on a development machine that has no TU API key yet."""
    return os.getenv("APP_ENV", "development") != "production" and not tu_api_application_key()


@router.post(
    "/dev-login",
    response_model=LoginResponse,
    summary="Development only: log in as an existing user without TU",
    description=(
        "Starts a session for a user already in the database, e.g. the seeded test "
        "accounts A, B, C, D (students) and S, S2 (staff), without checking a password. "
        "Only works when APP_ENV is not production and TU_API_APPLICATION_KEY is not set; "
        "otherwise it returns 404. Once the TU key is added, use /api/auth/login."
    ),
)
def dev_login(
    payload: DevLoginRequest,
    response: Response,
    session: Annotated[Session, Depends(get_db)],
) -> LoginResponse:
    if not dev_login_enabled():
        raise error(404, "NOT_FOUND", "This API is not available.")
    user = session.scalar(select(User).where(User.student_id == payload.username.strip()))
    if user is None:
        raise error(401, "INVALID_CREDENTIALS", "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
    set_session_cookie(response, user.student_id)
    return LoginResponse(
        student_id=user.student_id,
        name=user.name_th,
        faculty=user.faculty,
    )


@router.post(
    "/logout",
    status_code=204,
    summary="End the current session",
    description=(
        "Removes the session cookie, so later requests need a new login. "
        "Succeeds even if there was no session."
    ),
)
def logout() -> Response:
    response = Response(status_code=204)
    clear_session_cookie(response)
    return response
