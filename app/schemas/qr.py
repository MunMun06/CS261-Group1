from app.schemas.booking import ApiInput


class QrScan(ApiInput):
    """The text the staff page's camera read from a member's QR code."""

    qr_data: str


class QrCheckin(ApiInput):
    qr_data: str
    gate: str
