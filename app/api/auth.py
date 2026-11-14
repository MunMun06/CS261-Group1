from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.session import clear_session_cookie, set_session_cookie
from app.schemas.auth import LoginRequest, LoginResponse
from app.services.auth_service import upsert_tu_user, verify_tu_credentials

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
            "description": "TU returned an invalid response or an upstream error.",
            "content": {
                "application/json": {
                    "example": {
                        "error": {
                            "code": "TU_API_ERROR",
                            "message": (
                                "ไม่สามารถเชื่อมต่อระบบยืนยันตัวตนของมหาวิทยาลัยได้ "
                                "กรุณาลองใหม่อีกครั้งภายหลัง"
                            ),
                        }
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
