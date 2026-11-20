"""Google Places API (New). 검색 식별자를 상세 조회로 넘긴다."""
from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import requests

from app.config import settings
from app.tools.responses import fail, ok

TOOL_SEARCH = "search_places"
TOOL_DETAILS = "get_place_details"
PROVIDER = "google_places"
SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
DETAIL_URL = "https://places.googleapis.com/v1/places/{place_id}"
SEARCH_MASK = "places.id,places.displayName,places.formattedAddress"
DETAIL_MASK = "id,displayName,formattedAddress,location,googleMapsUri"
SERVICE_TZ = ZoneInfo("Asia/Seoul")


def default_window(now=None) -> dict:
    current = now or datetime.now(SERVICE_TZ)
    if current.tzinfo is None:
        current = current.replace(tzinfo=SERVICE_TZ)
    local = current.astimezone(SERVICE_TZ)
    day = (local + timedelta(days=1)).date()
    return {
        "date": day.isoformat(),
        "time_start": "18:00",
        "time_end": "24:00",
        "timezone": "Asia/Seoul",
        "estimated": True,
        "estimate_reason": "날짜가 없어 서비스 시간대 기준 다음 지역 날짜와 18:00~24:00을 조회했습니다.",
    }


def search_places(region, query, limit=3, date=None, time_start=None, time_end=None, now=None) -> dict:
    if not region or not str(region).strip():
        return fail(TOOL_SEARCH, "INVALID_INPUT", "관측 지역은 필수입니다. 지역을 추정해 채우지 않습니다.")
    if not query or not str(query).strip():
        return fail(TOOL_SEARCH, "INVALID_INPUT", "장소 검색어는 필수입니다.")
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        return fail(TOOL_SEARCH, "INVALID_INPUT", "limit는 정수여야 합니다.")
    if limit < 1 or limit > settings.place_limit:
        return fail(TOOL_SEARCH, "INVALID_INPUT", f"limit는 1~{settings.place_limit}입니다.")
    key = settings.google_maps_api_key
    if not key:
        return fail(TOOL_SEARCH, "MISSING_API_KEY", "GOOGLE_MAPS_API_KEY가 설정되지 않았습니다.")
    window = default_window(now)
    estimated = False
    reasons = []
    if not date:
        date = window["date"]
        estimated = True
        reasons.append(window["estimate_reason"])
    if not time_start or not time_end:
        time_start = time_start or window["time_start"]
        time_end = time_end or window["time_end"]
        estimated = True
        reasons.append("시간창이 없어 18:00~24:00을 사용했습니다.")
    try:
        response = requests.post(
            SEARCH_URL,
            headers={"Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": SEARCH_MASK},
            json={"textQuery": f"{query} {region}".strip(), "pageSize": limit, "languageCode": "ko", "regionCode": "KR"},
            timeout=settings.tool_timeout_sec,
        )
    except requests.Timeout:
        return fail(TOOL_SEARCH, "API_TIMEOUT", "장소 검색 시간이 초과되었습니다.")
    except requests.RequestException:
        return fail(TOOL_SEARCH, "EXTERNAL_API_ERROR", "장소 검색 요청에 실패했습니다.")
    if response.status_code in {401, 403}:
        return fail(TOOL_SEARCH, "AUTH_FAILED", "장소 검색 인증에 실패했습니다.")
    if response.status_code == 429:
        return fail(TOOL_SEARCH, "RATE_LIMITED", "장소 검색 호출 한도에 도달했습니다.")
    if response.status_code >= 400:
        return fail(TOOL_SEARCH, "EXTERNAL_API_ERROR", "장소 검색이 실패했습니다.")
    try:
        body = response.json()
    except ValueError:
        return fail(TOOL_SEARCH, "PARSE_ERROR", "장소 검색 응답을 읽지 못했습니다.")
    places = []
    for item in body.get("places") or []:
        place_id = item.get("id")
        name = (item.get("displayName") or {}).get("text")
        if not place_id or not name:
            continue
        places.append({"place_id": place_id, "name": name, "address": item.get("formattedAddress")})
    if not places:
        return fail(TOOL_SEARCH, "NO_RESULT", f"'{region}'에서 '{query}' 장소 후보가 없습니다.")
    return ok(TOOL_SEARCH, {
        "places": places[:limit],
        "requested_region": region,
        "requested_query": query,
        "queried_date": date,
        "queried_time_start": time_start,
        "queried_time_end": time_end,
        "estimated": estimated,
        "estimate_reason": " ".join(reasons) if estimated else None,
    }, PROVIDER, SEARCH_URL)


def get_place_details(place_id) -> dict:
    if not place_id or not str(place_id).strip():
        return fail(TOOL_DETAILS, "INVALID_INPUT", "장소 식별자가 없습니다.")
    key = settings.google_maps_api_key
    if not key:
        return fail(TOOL_DETAILS, "MISSING_API_KEY", "GOOGLE_MAPS_API_KEY가 설정되지 않았습니다.")
    try:
        response = requests.get(
            DETAIL_URL.format(place_id=place_id),
            headers={"X-Goog-Api-Key": key, "X-Goog-FieldMask": DETAIL_MASK},
            timeout=settings.tool_timeout_sec,
        )
    except requests.Timeout:
        return fail(TOOL_DETAILS, "API_TIMEOUT", "장소 상세 조회 시간이 초과되었습니다.")
    except requests.RequestException:
        return fail(TOOL_DETAILS, "EXTERNAL_API_ERROR", "장소 상세 조회에 실패했습니다.")
    if response.status_code == 404:
        return fail(TOOL_DETAILS, "NO_RESULT", "해당 장소 상세가 없습니다.")
    if response.status_code in {401, 403}:
        return fail(TOOL_DETAILS, "AUTH_FAILED", "장소 상세 인증에 실패했습니다.")
    if response.status_code >= 400:
        return fail(TOOL_DETAILS, "EXTERNAL_API_ERROR", "장소 상세 조회가 실패했습니다.")
    try:
        body = response.json()
    except ValueError:
        return fail(TOOL_DETAILS, "PARSE_ERROR", "장소 상세 응답을 읽지 못했습니다.")
    location = body.get("location") or {}
    return ok(TOOL_DETAILS, {
        "place_id": body.get("id") or place_id,
        "name": (body.get("displayName") or {}).get("text") or "",
        "address": body.get("formattedAddress") or "",
        "maps_url": body.get("googleMapsUri") or "",
        "latitude": location.get("latitude"),
        "longitude": location.get("longitude"),
    }, PROVIDER, DETAIL_URL)
