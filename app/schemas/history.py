from pydantic import BaseModel, ConfigDict


class HistoryItem(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    code: str
    court: str
    date: str
    start: str
    end: str
    status: str


class BookingHistoryResponse(BaseModel):
    items: list[HistoryItem]
    page: int
    size: int
    total: int
    totalPages: int
