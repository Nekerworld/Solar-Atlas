"""후보 구간의 충족 여부. 점수는 충족 후보 사이에서만 계산한다."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app.config import settings

TZ = ZoneInfo("Asia/Seoul")


def _parse(value: str) -> datetime:
    moment = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if moment.tzinfo is None:
        return moment.replace(tzinfo=timezone.utc)
    return moment


def _check(field_name: str, value, threshold, status: str, unit: str) -> dict:
    return {"field": field_name, "value": value, "unit": unit, "threshold": threshold, "status": status}


def _compare(value, threshold, higher_is_fail: bool) -> str:
    if value is None:
        return "UNKNOWN"
    failed = value > threshold if higher_is_fail else value < threshold
    return "UNMET" if failed else "MET"


def _nearest_weather(moment: datetime, hours: list[dict]) -> dict | None:
    best = None
    best_gap = None
    for hour in hours:
        stamp = _parse(hour["time"])
        gap = abs((stamp - moment).total_seconds())
        if gap <= 3600 and (best_gap is None or gap < best_gap):
            best = hour
            best_gap = gap
    return best


def _unmet_summary(flags: list[dict]) -> list[dict]:
    """조건별로 기준을 못 넘은 표본 수와 관측된 가장 좋은 값을 모은다. 불충족 이유를 사실대로 말하기 위한 요약이다."""
    rows = []
    for index, name in enumerate(("altitude", "sun_altitude", "cloud_cover", "precipitation_probability")):
        checks = [flag["checks"][index] for flag in flags]
        unmet = [check for check in checks if check["status"] == "UNMET"]
        if not unmet:
            continue
        values = [check["value"] for check in checks if check["value"] is not None]
        best = max(values) if name == "altitude" else min(values)
        rows.append({"field": name, "threshold": checks[0]["threshold"], "unit": checks[0]["unit"],
                     "unmet_samples": len(unmet), "total_samples": len(checks), "best_value": best})
    return rows


def evaluate_candidate(candidate: dict, target_samples: list[dict], weather_hours: list[dict] | None,
                       route: dict | None, constraints: dict, policy: dict | None = None) -> dict:
    rules = policy or {
        "min_altitude_deg": settings.min_altitude_deg,
        "max_sun_altitude_deg": settings.max_sun_altitude_deg,
        "max_cloud_cover_pct": settings.max_cloud_cover_pct,
        "max_precipitation_probability_pct": settings.max_precipitation_probability_pct,
        "min_window_minutes": settings.min_window_minutes,
        "step_minutes": settings.step_minutes,
    }
    user_altitude = constraints.get("min_altitude_deg")
    user_cloud = constraints.get("max_cloud_cover_pct")
    user_rain = constraints.get("max_precipitation_probability_pct")
    travel_limit = constraints.get("max_travel_minutes")
    min_altitude = user_altitude if user_altitude is not None else rules["min_altitude_deg"]
    max_cloud = user_cloud if user_cloud is not None else rules["max_cloud_cover_pct"]
    max_rain = user_rain if user_rain is not None else rules["max_precipitation_probability_pct"]
    max_sun = rules["max_sun_altitude_deg"]
    window_minutes = rules["min_window_minutes"]
    step = rules["step_minutes"]
    needed = max(2, int(window_minutes / step) + 1)
    weather_required = weather_hours is not None
    samples = sorted(target_samples, key=lambda row: row["time"])
    flags = []
    for sample in samples:
        moment = _parse(sample["time"])
        weather = _nearest_weather(moment, weather_hours or []) if weather_required else None
        altitude_status = _compare(sample.get("altitude_deg"), min_altitude, False)
        sun_status = _compare(sample.get("sun_altitude_deg"), max_sun, True)
        if not weather_required:
            cloud_status = rain_status = "MET"
        elif weather is None:
            cloud_status = rain_status = "UNKNOWN"
        else:
            cloud_status = _compare(weather.get("cloud_cover_pct"), max_cloud, True)
            rain_status = _compare(weather.get("precipitation_probability_pct"), max_rain, True)
        statuses = [altitude_status, sun_status, cloud_status, rain_status]
        if "UNMET" in statuses:
            state = "UNMET"
        elif "UNKNOWN" in statuses:
            state = "UNKNOWN"
        else:
            state = "MET"
        flags.append({
            "time": sample["time"],
            "state": state,
            "altitude_deg": sample.get("altitude_deg"),
            "sun_altitude_deg": sample.get("sun_altitude_deg"),
            "azimuth_deg": sample.get("azimuth_deg"),
            "cloud_cover_pct": None if weather is None else weather.get("cloud_cover_pct"),
            "precipitation_probability_pct": None if weather is None else weather.get("precipitation_probability_pct"),
            "checks": [
                _check("altitude", sample.get("altitude_deg"), min_altitude, altitude_status, "deg"),
                _check("sun_altitude", sample.get("sun_altitude_deg"), max_sun, sun_status, "deg"),
                _check("cloud_cover", None if weather is None else weather.get("cloud_cover_pct"), max_cloud, cloud_status, "pct"),
                _check("precipitation_probability", None if weather is None else weather.get("precipitation_probability_pct"), max_rain, rain_status, "pct"),
            ],
        })
    windows = []
    run = []
    for flag in flags:
        if flag["state"] == "MET":
            run.append(flag)
            if len(run) >= needed:
                windows.append(run[:])
        else:
            run = []
    # 확인되지 않은 조건(UNKNOWN)만 남은 연속 구간. 충족이라고 말할 수는 없지만 불충족도 아니다.
    open_windows = []
    run = []
    for flag in flags:
        if flag["state"] in {"MET", "UNKNOWN"}:
            run.append(flag)
            if len(run) >= needed:
                open_windows.append(run[:])
        else:
            run = []
    travel_status = "MET"
    travel_minutes = None
    if travel_limit is not None:
        if not route or route.get("duration_minutes") is None:
            travel_status = "UNKNOWN"
        else:
            travel_minutes = route["duration_minutes"]
            travel_status = "UNMET" if travel_minutes > travel_limit else "MET"
    if windows and travel_status != "UNMET":
        if travel_status == "UNKNOWN":
            status = "UNVERIFIED"
            chosen = windows[0]
        else:
            status = "SUITABLE"
            chosen = max(windows, key=len)
    elif open_windows and travel_status != "UNMET":
        status = "UNVERIFIED"
        chosen = open_windows[0]
    elif any(flag["state"] == "UNMET" for flag in flags) or travel_status == "UNMET":
        status = "UNSUITABLE"
        chosen = []
    else:
        status = "UNVERIFIED"
        chosen = []
    start_at = chosen[0]["time"] if chosen else None
    end_at = chosen[-1]["time"] if chosen else None
    duration = (len(chosen) - 1) * step if chosen else 0
    checks = []
    if chosen:
        checks = chosen[len(chosen) // 2]["checks"]
    if travel_limit is not None:
        checks.append(_check("travel_minutes", travel_minutes, travel_limit, travel_status, "min"))
    latest = None
    met_flags = [flag for flag in flags if flag["state"] == "MET"]
    if len(met_flags) >= needed:
        latest = met_flags[-needed]["time"]
    unmet_summary = _unmet_summary(flags)
    warnings = []
    if status == "UNVERIFIED" and chosen and any(flag["state"] == "UNKNOWN" for flag in chosen):
        missing = sorted({check["field"] for flag in chosen for check in flag["checks"] if check["status"] == "UNKNOWN"})
        warnings.append("확인하지 못한 조건이 있어 충족 여부를 판정하지 않았습니다: " + ", ".join(missing))
    if step:
        warnings.append(f"관측 구간은 {step}분 간격 근사입니다.")
    if latest and status != "SUITABLE":
        warnings.append(f"확인된 고도·태양 조건만으로 보면 {latest} 이전에는 연속 {window_minutes}분을 만들기 어렵습니다.")
    score = None
    if status == "SUITABLE" and chosen:
        altitude = sum(item["altitude_deg"] or 0 for item in chosen) / len(chosen)
        cloud_values = [item["cloud_cover_pct"] for item in chosen if item["cloud_cover_pct"] is not None]
        cloud = sum(cloud_values) / len(cloud_values) if cloud_values else max_cloud
        score = round(duration * 0.35 + (100 - cloud) * 0.25 + altitude * 0.2 + (0 if travel_minutes is None else max(0, 60 - travel_minutes) * 0.1), 2)
    return {
        "candidate_id": candidate.get("place_id"),
        "name": candidate.get("name"),
        "address": candidate.get("address"),
        "maps_url": candidate.get("maps_url"),
        "latitude": candidate.get("latitude"),
        "longitude": candidate.get("longitude"),
        "status": status,
        "observation_start": start_at,
        "observation_end": end_at,
        "duration_minutes": duration,
        "checks": checks,
        "warnings": warnings,
        "score": score,
        "latest_viable_start": latest,
        "unmet_summary": unmet_summary,
        "source_refs": candidate.get("source_refs") or [],
    }


def rank_suitable(candidates: list[dict]) -> list[dict]:
    suitable = [item for item in candidates if item["status"] == "SUITABLE"]
    others = [item for item in candidates if item["status"] != "SUITABLE"]
    suitable.sort(key=lambda item: item.get("score") or 0, reverse=True)
    return suitable + others


def local_bounds(date_text: str, time_start: str, time_end: str) -> tuple[datetime, datetime]:
    start_clock = "18:00" if not time_start else time_start
    end_clock = "24:00" if not time_end else time_end
    start = datetime.fromisoformat(f"{date_text}T{start_clock}:00").replace(tzinfo=TZ)
    if end_clock == "24:00":
        end = datetime.fromisoformat(f"{date_text}T00:00:00").replace(tzinfo=TZ) + timedelta(days=1)
    else:
        end = datetime.fromisoformat(f"{date_text}T{end_clock}:00").replace(tzinfo=TZ)
        if end <= start:
            end += timedelta(days=1)
    return start, end
