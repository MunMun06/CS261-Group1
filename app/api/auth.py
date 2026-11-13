from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.auth import LoginRequest, LoginResponse
from app.services.auth_service import upsert_tu_user, verify_tu_credentials

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Verify TU credentials and save user profile",
    description=(
        "Checks the username and password with TU API, then creates or updates "
        "the matching record in users. The password is not stored."
    ),
    responses={
        401: {"description": "TU rejected the username or password."},
        502: {"description": "TU returned an invalid response or an upstream error."},
        503: {"description": "TU API is not configured or is unavailable."},
        504: {"description": "TU API request timed out."},
    },
)
def login(
    payload: LoginRequest,
    session: Annotated[Session, Depends(get_db)],
) -> LoginResponse:
    profile = verify_tu_credentials(
        payload.username, payload.password.get_secret_value()
    )
    user = upsert_tu_user(session, profile)
    session.commit()
    return LoginResponse(
        student_id=user.student_id,
        name=user.name_th,
        faculty=user.faculty,
    )
