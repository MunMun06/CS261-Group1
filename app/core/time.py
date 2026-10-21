from datetime import datetime
from zoneinfo import ZoneInfo

THAI_TIMEZONE = ZoneInfo("Asia/Bangkok")


def now_thailand() -> datetime:
    return datetime.now(THAI_TIMEZONE)
