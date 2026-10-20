from fastapi.testclient import TestClient


def test_booking_history_is_private_and_paginated(api_client: TestClient) -> None:
    first_page = api_client.get("/api/history")
    empty_page = api_client.get("/api/history", params={"page": 2})
    bad_page = api_client.get("/api/history", params={"page": 0})

    assert first_page.status_code == 200
    assert first_page.json()["total"] == 3
    assert first_page.json()["size"] == 20
    assert first_page.json()["items"][0]["id"] == "TU-69101601"
    assert first_page.json()["items"][2]["checkedInBy"] == "สแกนประตู A1"
    assert empty_page.json()["items"] == []
    assert empty_page.json()["total"] == 3
    assert bad_page.status_code == 400
    assert bad_page.json()["error"]["code"] == "INVALID_INPUT"
