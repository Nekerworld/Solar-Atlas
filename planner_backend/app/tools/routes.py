"""Google Routes. 키가 없거나 실패하면 직선거리로 대체하지 않는다."""
from __future__ import annotations

import requests

from app.config import settings
from app.tools.responses import fail, ok

TOOL = "get_route"
PROVIDER = "google_routes"
URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
MODES = {"자동차": "DRIVE", "도보": "WALK", "대중교통": "TRANSIT", "DRIVE": "DRIVE", "WALK": "WALK", "TRANSIT": "TRANSIT"}


def get_route(origin_lat, origin_lon, destination_lat, destination_lon, transport_mode="DRIVE") -> dict:
    try:
        origin_lat = float(origin_lat)
        origin_lon = float(origin_lon)
        destination_lat = float(destination_lat)
        destination_lon = float(destination_lon)
    except (TypeError, ValueError):
        return fail(TOOL, "INVALID_INPUT", "이동 경로 좌표가 없습니다.")
    mode = MODES.get(str(transport_mode or "DRIVE"), None)
    if mode is None:
        return fail(TOOL, "INVALID_INPUT", "지원하지 않는 이동 수단입니다.")
    if not settings.routes_key:
        return fail(TOOL, "ROUTE_UNAVAILABLE", "이동시간 API 키가 없어 운전시간을 확인하지 못했습니다.")
    body = {
        "origin": {"location": {"latLng": {"latitude": origin_lat, "longitude": origin_lon}}},
        "destination": {"location": {"latLng": {"latitude": destination_lat, "longitude": destination_lon}}},
        "travelMode": mode,
    }
    try:
        response = requests.post(
            URL,
            headers={"Content-Type": "application/json", "X-Goog-Api-Key": settings.routes_key, "X-Goog-FieldMask": "routes.duration,routes.distanceMeters"},
            json=body,
            timeout=settings.tool_timeout_sec,
        )
    except requests.Timeout:
        return fail(TOOL, "API_TIMEOUT", "이동시간 조회 시간이 초과되었습니다.")
    except requests.RequestException:
        return fail(TOOL, "ROUTE_UNAVAILABLE", "이동시간을 확인하지 못했습니다.")
    if response.status_code in {401, 403}:
        return fail(TOOL, "AUTH_FAILED", "이동시간 인증에 실패했습니다.")
    if response.status_code >= 400:
        return fail(TOOL, "ROUTE_UNAVAILABLE", "이동시간을 확인하지 못했습니다.")
    try:
        payload = response.json()
    except ValueError:
        return fail(TOOL, "PARSE_ERROR", "이동시간 응답을 읽지 못했습니다.")
    routes = payload.get("routes") or []
    if not routes:
        return fail(TOOL, "NO_RESULT", "이동 경로가 없습니다.")
    duration = str(routes[0].get("duration") or "")
    if not duration.endswith("s") or not duration[:-1].replace(".", "", 1).isdigit():
        return fail(TOOL, "ROUTE_UNAVAILABLE", "이동시간 값을 읽지 못했습니다.")
    seconds = float(duration[:-1])
    return ok(TOOL, {"duration_minutes": round(seconds / 60, 1), "duration_seconds": seconds, "transport_mode": mode}, PROVIDER, URL)
