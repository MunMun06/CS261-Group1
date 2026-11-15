from app.api.auth import router as auth_router
from app.api.bookings import router as bookings_router
from app.api.courts import router as courts_router
from app.api.history import router as history_router
from app.api.qr import router as qr_router

__all__ = ["auth_router", "bookings_router", "courts_router", "history_router", "qr_router"]
