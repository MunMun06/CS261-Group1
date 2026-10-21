from pydantic import BaseModel, ConfigDict


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class ApiInput(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
    )


class BookingCreate(ApiInput):
    court_id: int
    date: str
    start: str
    duration_hours: int


class CheckinCreate(ApiInput):
    gate: str
    qr_token: str | None = None
