"""QR codes for check-in.

A booking's QR code holds its signed QR token, "<booking code>.<HMAC-SHA256 hex>",
the same value the API returns as "qrToken" (see make_qr_token). The member shows
the QR image; the staff page scans it with the camera and sends the text it read.
Only this server knows QR_HMAC_SECRET, so a QR code cannot be made up or edited.
"""

import hmac
import io
import re

import qrcode
from fastapi import HTTPException
from qrcode.constants import ERROR_CORRECT_M
from sqlalchemy.orm import Session

from app.models import Booking
from app.services.booking_service import error, get_booking_by_code, make_qr_token

# Booking codes look like TU-69101201; the signature is 64 lowercase hex characters.
QR_TOKEN_PATTERN = re.compile(r"(TU-\d{6,12})\.([0-9a-f]{64})")
# Scanned text longer than this is not one of our QR codes, so it is not read further.
MAX_SCANNED_LENGTH = 256


def invalid_qr() -> HTTPException:
    return error(400, "INVALID_QR", "This QR code is not a valid booking QR code.")


def render_qr_png(data: str, *, box_size: int = 10, border: int = 4) -> bytes:
    """Draws `data` as a QR code and returns the PNG file bytes."""
    qr = qrcode.QRCode(
        error_correction=ERROR_CORRECT_M,  # still scans with ~15% of it smudged or covered
        box_size=box_size,
        border=border,  # quiet zone in modules; 4 is the minimum the QR standard asks for
    )
    qr.add_data(data)
    qr.make(fit=True)
    image = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def parse_scanned_qr(text: str) -> tuple[str, str]:
    """Splits scanned QR text into (booking code, full QR token).

    Raises 400 INVALID_QR when the text is not shaped like one of our tokens.
    """
    if not isinstance(text, str) or len(text) > MAX_SCANNED_LENGTH:
        raise invalid_qr()
    match = QR_TOKEN_PATTERN.fullmatch(text.strip())
    if match is None:
        raise invalid_qr()
    return match.group(1), match.group(0)


def verify_scanned_qr(session: Session, text: str) -> Booking:
    """Returns the booking a scanned QR code belongs to.

    The signature is checked before the database is read, so a forged code gets
    400 INVALID_QR without revealing whether that booking code exists.
    """
    code, token = parse_scanned_qr(text)
    if not hmac.compare_digest(token, make_qr_token(code)):
        raise invalid_qr()
    return get_booking_by_code(session, code)
