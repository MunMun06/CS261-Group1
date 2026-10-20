import os


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def database_settings() -> dict[str, str | int]:
    return {
        "host": os.getenv("DB_HOST", "127.0.0.1"),
        "port": int(os.getenv("DB_PORT", "3306")),
        "database": os.getenv("DB_NAME", "tu_basket_booking"),
        "username": os.getenv("DB_USER", "booking_user"),
        "password": os.getenv("DB_PASSWORD", ""),
    }


def cors_origins() -> list[str]:
    return [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:3000,http://localhost:5173,"
            "http://127.0.0.1:3000,http://127.0.0.1:5173,"
            # VS Code Live Server and the JetBrains built-in preview server.
            "http://localhost:5500,http://127.0.0.1:5500,"
            "http://localhost:63342,http://127.0.0.1:63342",
        ).split(",")
        if origin.strip()
    ]


def checkin_window_minutes() -> int:
    """Check-in is open this many minutes either side of the start time. A demo can
    raise it, e.g. to 60, so a booking for the next hour can be checked in right away."""
    return int(os.getenv("CHECKIN_WINDOW_MINUTES", "15"))


def qr_hmac_secret() -> str:
    return os.getenv("QR_HMAC_SECRET", "")


def seed_enabled() -> bool:
    return env_bool("AUTO_SEED", default=os.getenv("APP_ENV", "development") != "production")
