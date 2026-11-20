from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.main import app
from app.sky import clear_sky_cache
from app.tools.responses import fail, ok

client = TestClient(app)
WHEN = "2026-11-19T20:00:00+09:00"


def _sample(target_id):
    return ok("get_ephemeris", {
        "samples": [{
            "time": "2026-11-19T11:00:00+00:00",
            "azimuth_deg": 12.5,
            "altitude_deg": 33.0,
            "sun_altitude_deg": -20.0,
        }],
        "target_id": target_id,
    }, "jpl_horizons", "https://ssd.jpl.nasa.gov/api/horizons.api")


def test_sky_omits_body_without_altitude(monkeypatch):
    clear_sky_cache()
    calls = {}

    def fake(target_id, latitude, longitude, elevation_m, start_at, end_at, step_minutes=None):
        calls[target_id] = calls.get(target_id, 0) + 1
        if target_id == "mars":
            return fail("get_ephemeris", "EPHEMERIS_UNAVAILABLE", "천체 고도를 확인하지 못했습니다.")
        return _sample(target_id)

    monkeypatch.setattr("app.sky.get_ephemeris", fake)
    monkeypatch.setattr("app.sky.get_weather", lambda *args, **kwargs: fail("get_weather", "FORECAST_UNAVAILABLE", "요청한 기간의 날씨 예보가 없습니다."))
    response = client.post("/api/sky", json={
        "time": WHEN,
        "latitude": 37.5665,
        "longitude": 126.978,
        "elevation_m": 30,
        "target_id": "jupiter",
    })
    body = response.json()
    assert response.status_code == 200
    assert body["ok"] is True
    assert body["source"] == "jpl_horizons"
    assert body["sun_altitude_deg"] == 33.0
    ids = {item["target_id"] for item in body["bodies"]}
    assert "mars" not in ids
    assert "jupiter" in ids
    assert body["weather"]["code"] == "FORECAST_UNAVAILABLE"
    again = client.post("/api/sky", json={
        "time": WHEN,
        "latitude": 37.5665,
        "longitude": 126.978,
        "elevation_m": 30,
        "target_id": "jupiter",
    })
    assert again.json()["ok"] is True
    assert calls["jupiter"] == 1
    assert calls["mars"] == 2


def test_sky_returns_place_choices_without_ephemeris(monkeypatch):
    clear_sky_cache()

    def boom(*args, **kwargs):
        raise AssertionError("천문력을 호출하면 안 됩니다.")

    monkeypatch.setattr("app.sky.get_ephemeris", boom)
    monkeypatch.setattr("app.sky.search_places", lambda *args, **kwargs: ok("search_places", {"places": [
        {"place_id": "a", "name": "서울숲"},
        {"place_id": "b", "name": "남산"},
    ]}, "google_places", "https://places.googleapis.com"))

    def details(place_id):
        coords = {"a": (37.54, 127.04), "b": (37.55, 126.98)}
        latitude, longitude = coords[place_id]
        return ok("get_place_details", {"place_id": place_id, "name": place_id, "latitude": latitude, "longitude": longitude}, "google_places", "https://places.googleapis.com")

    monkeypatch.setattr("app.sky.get_place_details", details)
    response = client.post("/api/sky", json={"time": WHEN, "place_query": "공원", "purpose": "place"})
    body = response.json()
    assert body["ok"] is True
    assert body["bodies"] is None
    assert len(body["places"]) == 2
    assert body["places"][0]["latitude"] == 37.54


def test_sky_rejects_naive_time_and_bad_latitude():
    clear_sky_cache()
    naive = client.post("/api/sky", json={"time": "2026-11-19T20:00:00", "latitude": 37.5, "longitude": 127})
    assert naive.status_code == 422
    high = client.post("/api/sky", json={"time": WHEN, "latitude": 99, "longitude": 127})
    assert high.status_code == 422
