"""Open-Meteo 시간별 예보. 예보 구간 밖은 값을 만들지 않는다."""
from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import requests

from app.config import settings
from app.tools.responses import fail, ok

TOOL = "get_weather"
PROVIDER = "open_meteo"
URL = "https://api.open-meteo.com/v1/forecast"
TZ = ZoneInfo("Asia/Seoul")


def _moment(value: datetime | str) -> datetime:
    if isinstance(value, datetime):
        moment = value
    else:
        moment = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if moment.tzinfo is None:
        raise ValueError("timezone required")
    return moment


def get_weather(latitude: float, longitude: float, start_at: datetime | str, end_at: datetime | str) -> dict:
    try:
        latitude = float(latitude)
        longitude = float(longitude)
    except (TypeError, ValueError):
        return fail(TOOL, "INVALID_INPUT", "날씨 조회 좌표가 올바르지 않습니다.")
    try:
        start_at = _moment(start_at)
        end_at = _moment(end_at)
    except (TypeError, ValueError):
        return fail(TOOL, "INVALID_INPUT", "날씨 조회 시각에 시간대가 필요합니다.")
    if end_at <= start_at:
        return fail(TOOL, "INVALID_INPUT", "날씨 조회 시각이 올바르지 않습니다.")
    start_local = start_at.astimezone(TZ)
    end_local = end_at.astimezone(TZ)
    request = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": "cloud_cover,precipitation_probability,precipitation",
        "timezone": "Asia/Seoul",
        "start_date": start_local.date().isoformat(),
        "end_date": end_local.date().isoformat(),
    }
    response = None
    last_error = "EXTERNAL_API_ERROR"
    for _ in range(2):
        try:
            response = requests.get(URL, params=request, headers={"User-Agent": "SolarAtlasPlanner/3.0"}, timeout=settings.tool_timeout_sec)
            break
        except requests.Timeout:
            last_error = "API_TIMEOUT"
            response = None
        except requests.RequestException:
            last_error = "EXTERNAL_API_ERROR"
            response = None
    if response is None:
        message = "날씨 조회 시간이 초과되었습니다." if last_error == "API_TIMEOUT" else "날씨 조회에 실패했습니다."
        return fail(TOOL, last_error, message)
    if response.status_code >= 400:
        return fail(TOOL, "FORECAST_UNAVAILABLE", "요청한 기간의 날씨 예보가 없습니다.")
    try:
        body = response.json()
    except ValueError:
        return fail(TOOL, "PARSE_ERROR", "날씨 응답을 읽지 못했습니다.")
    if body.get("error"):
        return fail(TOOL, "FORECAST_UNAVAILABLE", "요청한 기간의 날씨 예보가 없습니다.")
    hourly = body.get("hourly") or {}
    times = hourly.get("time") or []
    clouds = hourly.get("cloud_cover") or []
    probabilities = hourly.get("precipitation_probability") or []
    precipitation = hourly.get("precipitation") or []
    if not times:
        return fail(TOOL, "FORECAST_UNAVAILABLE", "요청한 기간의 시간별 예보가 없습니다.")
    hours = []
    for index, stamp in enumerate(times):
        cloud = clouds[index] if index < len(clouds) else None
        probability = probabilities[index] if index < len(probabilities) else None
        rain = precipitation[index] if index < len(precipitation) else None
        if cloud is None or probability is None or rain is None:
            continue
        moment = datetime.fromisoformat(stamp).replace(tzinfo=TZ).astimezone(timezone.utc)
        if moment < start_at.astimezone(timezone.utc) or moment > end_at.astimezone(timezone.utc):
            continue
        hours.append({
            "time": moment.isoformat(),
            "cloud_cover_pct": cloud,
            "precipitation_probability_pct": probability,
            "precipitation_mm": rain,
        })
    if not hours:
        return fail(TOOL, "FORECAST_UNAVAILABLE", "요청한 시각의 시간별 예보가 없습니다.")
    return ok(TOOL, {"hours": hours, "latitude": latitude, "longitude": longitude}, PROVIDER, URL)
