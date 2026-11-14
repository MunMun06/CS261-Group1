"""Signed session token kept in an HttpOnly cookie after a successful login."""

import base64
import binascii
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


def _decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


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


def read_session_student_id(token: str) -> str | None:
    """Returns the student ID in a token this server signed, or None if it is not one."""
    payload, _, signature = token.partition(".")
    if not payload or not hmac.compare_digest(signature, _sign(payload)):
        return None
    try:
        data = json.loads(_decode(payload))
    except (binascii.Error, UnicodeDecodeError, ValueError):
        return None
    student_id = data.get("sub") if isinstance(data, dict) else None
    return student_id if isinstance(student_id, str) and student_id else None


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
