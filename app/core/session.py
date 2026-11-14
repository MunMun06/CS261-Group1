"""Signed session token kept in an HttpOnly cookie after a successful login."""

import base64
import hashlib
import hmac
import json
import os
import time

from fastapi import Response

from app.core.config import session_secret, session_timeout_minutes

SESSION_COOKIE_NAME = "tu_basket_session"


def _encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _sign(payload: str) -> str:
    digest = hmac.new(
        session_secret().encode("utf-8"), payload.encode("ascii"), hashlib.sha256
    ).digest()
    return _encode(digest)


def create_session_token(student_id: str) -> str:
    expires_at = int(time.time()) + session_timeout_minutes() * 60
    body = json.dumps({"sub": student_id, "exp": expires_at}, separators=(",", ":"))
    payload = _encode(body.encode("utf-8"))
    return f"{payload}.{_sign(payload)}"


def set_session_cookie(response: Response, student_id: str) -> None:
    response.set_cookie(
        SESSION_COOKIE_NAME,
        create_session_token(student_id),
        max_age=session_timeout_minutes() * 60,
        httponly=True,
        samesite="lax",
        secure=os.getenv("APP_ENV", "development") == "production",
        path="/",
    )
