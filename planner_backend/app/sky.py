"""고른 시각과 좌표의 태양·달·행성 고도를 Horizons에서 모은다."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from app.targets import resolve_target
from app.tools import cache_key
from app.tools.horizons import get_ephemeris
from app.tools.places import get_place_details, search_places
from app.tools.weather import get_weather

SKY_IDS = ("sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune")
_CACHE: dict[str, dict] = {}


def clear_sky_cache() -> None:
    _CACHE.clear()


def build_sky(time: datetime, latitude: float | None, longitude: float | None, elevation_m: float, until: datetime | None, place_query: str | None, target_id: str | None, purpose: str = "sky") -> dict:
    if time.tzinfo is None or (until is not None and until.tzinfo is None):
        return _fail("INVALID_INPUT", "시각에는 시간대가 필요합니다.")
    located = _locate(latitude, longitude, place_query)
    if located.get("ok") is False:
        return located
    if purpose == "place" or located.get("latitude") is None:
        return {"ok": True, "places": located.get("places") or [], "bodies": None, "source": None}
    latitude = located["latitude"]
    longitude = located["longitude"]
    if not _valid_numbers(latitude, longitude, elevation_m):
        return _fail("INVALID_INPUT", "위도, 경도, 고도 범위를 확인해 주세요.")
    if until is not None and (until <= time or until - time > timedelta(hours=18)):
        return _fail("INVALID_INPUT", "경로 끝 시각은 시작 이후 18시간 이내여야 합니다.")
    bodies = _bodies(time, latitude, longitude, elevation_m)
    if not bodies:
        return _fail("EPHEMERIS_UNAVAILABLE", "요청한 시각과 위치의 천체 고도를 확인하지 못했습니다.")
    sun = next((item["altitude_deg"] for item in bodies if item["target_id"] == "sun"), None)
    path = _path(target_id, time, until, latitude, longitude, elevation_m) if until and target_id else []
    weather = _weather(latitude, longitude, time)
    return {
        "ok": True,
        "source": "jpl_horizons",
        "time": time.isoformat(),
        "latitude": latitude,
        "longitude": longitude,
        "elevation_m": elevation_m,
        "target_id": target_id,
        "sun_altitude_deg": sun,
        "bodies": bodies,
        "path": path,
        "weather": weather,
        "places": located.get("places") or [],
        "star_source": "bright_star_catalog",
    }


def _locate(latitude, longitude, place_query: str | None) -> dict:
    if latitude is not None and longitude is not None:
        return {"latitude": float(latitude), "longitude": float(longitude)}
    if not place_query or not str(place_query).strip():
        return _fail("INVALID_INPUT", "위도와 경도, 또는 장소 이름이 필요합니다.")
    found = search_places(place_query, place_query, limit=5, date=_date(place_query), time_start="12:00", time_end="13:00")
    if not found["ok"]:
        return _fail(found["error"]["code"], found["error"]["message"])
    detailed = []
    for place in found["data"]["places"]:
        details = get_place_details(place["place_id"])
        if not details["ok"]:
            continue
        data = details["data"]
        if data.get("latitude") is None or data.get("longitude") is None:
            continue
        detailed.append({
            "place_id": data["place_id"],
            "name": data["name"] or place["name"],
            "latitude": data["latitude"],
            "longitude": data["longitude"],
        })
    if not detailed:
        return _fail("NO_RESULT", "좌표가 있는 장소 후보가 없습니다.")
    if len(detailed) == 1:
        return {"latitude": detailed[0]["latitude"], "longitude": detailed[0]["longitude"], "places": detailed}
    return {"latitude": None, "longitude": None, "places": detailed}


def _date(place_query: str) -> str:
    del place_query
    return datetime.now(timezone.utc).date().isoformat()


def _bodies(time: datetime, latitude: float, longitude: float, elevation_m: float) -> list[dict]:
    end = time + timedelta(minutes=2)

    def one(target_id: str) -> dict | None:
        result = _cached_ephemeris(target_id, latitude, longitude, elevation_m, time, end, 1)
        if not result["ok"]:
            return None
        sample = result["data"]["samples"][0]
        altitude = sample.get("altitude_deg")
        azimuth = sample.get("azimuth_deg")
        if not isinstance(altitude, (int, float)) or not isinstance(azimuth, (int, float)):
            return None
        target = resolve_target(target_id)
        return {
            "target_id": target_id,
            "name": target.display_name if target else target_id,
            "altitude_deg": altitude,
            "azimuth_deg": azimuth,
        }

    with ThreadPoolExecutor(max_workers=4) as pool:
        rows = list(pool.map(one, SKY_IDS))
    return [row for row in rows if row]


def _path(target_id: str, time: datetime, until: datetime, latitude: float, longitude: float, elevation_m: float) -> list[dict]:
    result = _cached_ephemeris(target_id, latitude, longitude, elevation_m, time, until, 30)
    if not result["ok"]:
        return []
    points = []
    for sample in result["data"]["samples"]:
        altitude = sample.get("altitude_deg")
        azimuth = sample.get("azimuth_deg")
        if not isinstance(altitude, (int, float)) or not isinstance(azimuth, (int, float)):
            continue
        points.append({"time": sample["time"], "altitude_deg": altitude, "azimuth_deg": azimuth})
    return points


def _cached_ephemeris(target_id, latitude, longitude, elevation_m, start, end, step):
    arguments = {
        "target_id": target_id,
        "latitude": latitude,
        "longitude": longitude,
        "elevation_m": elevation_m,
        "start_at": start.isoformat(),
        "end_at": end.isoformat(),
        "step_minutes": step,
    }
    key = cache_key("jpl_horizons", "get_ephemeris", arguments)
    if key in _CACHE:
        return _CACHE[key]
    result = get_ephemeris(target_id, latitude, longitude, elevation_m, start, end, step)
    if result["ok"]:
        _CACHE[key] = result
    return result


def _weather(latitude: float, longitude: float, time: datetime) -> dict:
    result = get_weather(latitude, longitude, time, time + timedelta(hours=1))
    if not result["ok"]:
        return {"available": False, "code": result["error"]["code"], "message": result["error"]["message"]}
    hour = result["data"]["hours"][0]
    return {
        "available": True,
        "cloud_cover_pct": hour["cloud_cover_pct"],
        "precipitation_probability_pct": hour["precipitation_probability_pct"],
    }


def _valid_numbers(latitude: float, longitude: float, elevation_m: float) -> bool:
    try:
        latitude = float(latitude)
        longitude = float(longitude)
        elevation_m = float(elevation_m)
    except (TypeError, ValueError):
        return False
    return -90 <= latitude <= 90 and -180 <= longitude <= 180 and -500 <= elevation_m <= 9000


def _fail(code: str, message: str) -> dict:
    return {"ok": False, "error": {"code": code, "message": message}, "bodies": None, "source": None}
