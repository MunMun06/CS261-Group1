from fastapi.testclient import TestClient


def test_list_courts_and_slots(api_client: TestClient) -> None:
    courts = api_client.get("/api/courts")
    slots = api_client.get(
        "/api/courts/1/slots", params={"date": "2026-10-11"}
    )

    assert courts.status_code == 200
    assert len(courts.json()) == 2
    assert courts.json()[0]["location"] == "ศูนย์รังสิต"
    assert slots.status_code == 200
    assert len(slots.json()["slots"]) == 11
    by_start = {item["start"]: item["status"] for item in slots.json()["slots"]}
    assert by_start["13:00"] == "booked"
    assert by_start["14:00"] == "booked"
    assert slots.json()["quotaUsed"] == 1


def test_invalid_date_and_out_of_range_share_error_shape(
    api_client: TestClient,
) -> None:
    invalid = api_client.get(
        "/api/courts/1/slots", params={"date": "11/10/2026"}
    )
    outside = api_client.get(
        "/api/courts/1/slots", params={"date": "2026-10-19"}
    )

    assert invalid.status_code == 400
    assert invalid.json()["error"]["code"] == "INVALID_INPUT"
    assert outside.status_code == 422
    assert outside.json()["error"]["code"] == "DATE_OUT_OF_RANGE"
    assert set(outside.json()) == {"error"}
