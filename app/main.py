import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import SQLAlchemyError

from app.api import bookings_router, courts_router, history_router
from app.core.config import cors_origins, qr_hmac_secret, seed_enabled
from app.jobs import sweep_no_shows
from app.scripts.migrate import migrate_database
from app.scripts.seed_data import seed_database

logger = logging.getLogger(__name__)
NO_SHOW_SWEEP_INTERVAL_SECONDS = 15
PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_FOLDERS = ("html", "css", "js", "assets")


async def run_no_show_scheduler() -> None:
    while True:
        try:
            expired_count = await asyncio.to_thread(sweep_no_shows)
            if expired_count:
                logger.info("Marked %d bookings as no-show", expired_count)
        except Exception:
            logger.exception("Scheduled no-show sweep failed")
        await asyncio.sleep(NO_SHOW_SWEEP_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(_: FastAPI):
    if not qr_hmac_secret():
        raise RuntimeError("QR_HMAC_SECRET must be configured before starting the API.")
    migrate_database()
    if seed_enabled():
        seed_database()
    scheduler = asyncio.create_task(
        run_no_show_scheduler(),
        name="booking-no-show-scheduler",
    )
    try:
        yield
    finally:
        scheduler.cancel()
        try:
            await scheduler
        except asyncio.CancelledError:
            pass


app = FastAPI(title="TU Basket Booking API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(courts_router)
app.include_router(bookings_router)
app.include_router(history_router)

# The API also serves the pages, e.g. /html/index.html, so they reach the API from
# the same origin. The Dockerfile copies these folders into the image.
for folder in FRONTEND_FOLDERS:
    if (PROJECT_ROOT / folder).is_dir():
        app.mount(f"/{folder}", StaticFiles(directory=PROJECT_ROOT / folder), name=folder)


def error_response(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message}},
    )


@app.exception_handler(HTTPException)
async def http_error_handler(_: Request, exc: HTTPException) -> JSONResponse:
    if isinstance(exc.detail, dict):
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.detail},
            headers=exc.headers,
        )
    return error_response(exc.status_code, "HTTP_ERROR", str(exc.detail))


@app.exception_handler(RequestValidationError)
async def validation_error_handler(
    _: Request, exc: RequestValidationError
) -> JSONResponse:
    logger.info("Rejected invalid request: %s", exc.errors())
    return error_response(400, "INVALID_INPUT", "The request parameters are invalid.")


@app.exception_handler(SQLAlchemyError)
async def database_error_handler(_: Request, exc: SQLAlchemyError) -> JSONResponse:
    logger.exception("Database request failed", exc_info=exc)
    return error_response(
        503, "DATABASE_ERROR", "The database request could not be completed."
    )


@app.exception_handler(Exception)
async def unexpected_error_handler(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled API error", exc_info=exc)
    return error_response(500, "INTERNAL_ERROR", "An unexpected server error occurred.")


@app.get("/", tags=["root"])
def read_root() -> dict[str, str]:
    return {"message": "Welcome to the TU Basket Booking API"}


@app.get("/health", tags=["health"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}
