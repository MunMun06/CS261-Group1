"""Username and password login for court staff, who may not have a TU account.

Passwords are hashed with scrypt (Python's standard library) and a random salt, and
stored as "scrypt$n$r$p$salt$hash" in staff_credentials.
"""

import base64
import hashlib
import hmac
import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import now_thailand
from app.models import StaffCredential, User

SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
MIN_PASSWORD_LENGTH = 8
STAFF_FACULTY = "เจ้าหน้าที่สนาม"


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _scrypt(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(password.encode("utf-8"), salt=salt, n=n, r=r, p=p, dklen=32)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = _scrypt(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt, digest = stored.split("$")
        if scheme != "scrypt":
            return False
        actual = _scrypt(password, base64.b64decode(salt), int(n), int(r), int(p))
        return hmac.compare_digest(actual, base64.b64decode(digest))
    except (ValueError, TypeError):
        return False


# Checked when the username is unknown, so a wrong username takes as long as a
# wrong password and the response time does not reveal which staff usernames exist.
_UNKNOWN_USER_HASH = hash_password(secrets.token_urlsafe(16))


def authenticate_staff(session: Session, username: str, password: str) -> User | None:
    """The staff user with this username and password, or None."""
    user = session.scalar(select(User).where(User.student_id == username.strip()))
    credential = session.get(StaffCredential, user.id) if user is not None else None
    if credential is None:
        verify_password(password, _UNKNOWN_USER_HASH)
        return None
    if not verify_password(password, credential.password_hash) or user.role != "staff":
        return None
    return user


def has_staff_password(session: Session, user: User) -> bool:
    return session.get(StaffCredential, user.id) is not None


def set_staff_password(
    session: Session, username: str, password: str, *, name: str | None = None
) -> tuple[User, bool]:
    """Creates the staff account, or sets a new password for an existing staff
    account such as the seeded "S". Returns (user, created). The caller commits."""
    username = username.strip()
    if not username or len(username) > 32:
        raise ValueError("Username must be 1 to 32 characters.")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")

    user = session.scalar(select(User).where(User.student_id == username))
    created = user is None
    if user is None:
        user = User(
            student_id=username,
            name_th=name or f"เจ้าหน้าที่ {username}",
            faculty=STAFF_FACULTY,
            email=f"{username.lower()}@staff.invalid",
            role="staff",
        )
        session.add(user)
        session.flush()
    elif user.role != "staff":
        raise ValueError(
            f"{username!r} is a member account, not staff; pick another username."
        )
    elif name:
        user.name_th = name

    password_hash = hash_password(password)
    updated_at = now_thailand().replace(tzinfo=None)
    credential = session.get(StaffCredential, user.id)
    if credential is None:
        session.add(
            StaffCredential(user_id=user.id, password_hash=password_hash, updated_at=updated_at)
        )
    else:
        credential.password_hash = password_hash
        credential.updated_at = updated_at
    session.flush()
    return user, created
