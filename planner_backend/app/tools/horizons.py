"""NASA JPL Horizons 관측자 천문력. 고도가 없으면 값을 만들지 않는다."""
from __future__ import annotations

from datetime import datetime, timezone

import requests

from app.config import settings
from app.targets import resolve_target
from app.tools.responses import fail, ok

TOOL = "get_ephemeris"
PROVIDER = "jpl_horizons"
URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
MONTHS = {"Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6, "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12}
MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _parse_block(text: str) -> list[dict]:
    if "$$SOE" not in text or "$$EOE" not in text:
        return []
    body = text.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
    samples = []
    for line in body.splitlines():
        parts = line.split()
        if len(parts) < 4:
            continue
        stamp = f"{parts[0]} {parts[1]}"
        try:
            year, mon, day = parts[0].split("-")
            hour, minute = parts[1].split(":")
            moment = datetime(int(year), MONTHS[mon], int(day), int(hour), int(minute))
            azimuth = float(parts[-2])
            elevation = float(parts[-1])
        except (KeyError, ValueError, IndexError):
            continue
        samples.append({"time": moment.replace(tzinfo=timezone.utc).isoformat(), "azimuth_deg": azimuth, "altitude_deg": elevation})
    return samples


def _horizons_stamp(moment: datetime) -> str:
    utc = moment.astimezone(timezone.utc)
    return f"{utc.year}-{MONTH_NAMES[utc.month - 1]}-{utc.day:02d} {utc.hour:02d}:{utc.minute:02d}"


def _moment(value):
    if isinstance(value, datetime):
        moment = value
    else:
        moment = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if moment.tzinfo is None:
        raise ValueError("timezone required")
    return moment


def _query(command: str, latitude: float, longitude: float, elevation_km: float, start_at: datetime, end_at: datetime, step_minutes: int) -> list[dict]:
    params = {
        "format": "json",
        "COMMAND": f"'{command}'",
        "OBJ_DATA": "NO",
        "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "OBSERVER",
        "CENTER": "'coord@399'",
        "COORD_TYPE": "GEODETIC",
        "SITE_COORD": f"'{longitude},{latitude},{elevation_km}'",
        "START_TIME": f"'{_horizons_stamp(start_at)}'",
        "STOP_TIME": f"'{_horizons_stamp(end_at)}'",
        "STEP_SIZE": f"'{step_minutes} m'",
        "QUANTITIES": "'4'",
    }
    response = requests.get(URL, params=params, timeout=settings.tool_timeout_sec)
    if response.status_code >= 400:
        raise RuntimeError("horizons status")
    try:
        body = response.json()
    except ValueError as error:
        raise RuntimeError("parse") from error
    result = body.get("result") or ""
    if "$$SOE" not in result:
        return []
    return _parse_block(result)


def get_ephemeris(target_id, latitude, longitude, elevation_m=0, start_at=None, end_at=None, step_minutes=None) -> dict:
    target = resolve_target(str(target_id) if target_id is not None else None)
    if target is None or not target.horizons_command:
        return fail(TOOL, "TARGET_NOT_FOUND", "관측 천문력을 계산할 수 있는 대상이 아닙니다.")
    if not target.supported and target.target_id != "sun":
        return fail(TOOL, "UNSUPPORTED_TARGET", target.unsupported_reason or "지원하지 않는 대상입니다.")
    try:
        latitude = float(latitude)
        longitude = float(longitude)
        elevation_m = float(elevation_m)
        step = int(step_minutes or settings.step_minutes)
        start_at = _moment(start_at)
        end_at = _moment(end_at)
    except (TypeError, ValueError):
        return fail(TOOL, "INVALID_INPUT", "천문력 조회 값이 올바르지 않습니다.")
    if step <= 0 or end_at <= start_at:
        return fail(TOOL, "INVALID_INPUT", "천문력 조회 구간이 올바르지 않습니다.")
    try:
        target_rows = _query(target.horizons_command, latitude, longitude, elevation_m / 1000, start_at, end_at, step)
        sun_rows = _query("10", latitude, longitude, elevation_m / 1000, start_at, end_at, step)
    except requests.Timeout:
        return fail(TOOL, "API_TIMEOUT", "천문력 조회 시간이 초과되었습니다.")
    except Exception:
        return fail(TOOL, "EPHEMERIS_UNAVAILABLE", "천문력을 읽지 못했습니다.")
    if not target_rows:
        return fail(TOOL, "EPHEMERIS_UNAVAILABLE", "천체 고도를 확인하지 못했습니다.")
    if not sun_rows:
        return fail(TOOL, "EPHEMERIS_UNAVAILABLE", "태양 고도를 확인하지 못했습니다.")
    sun = {row["time"]: row["altitude_deg"] for row in sun_rows}
    samples = []
    for row in target_rows:
        if row["time"] not in sun:
            return fail(TOOL, "EPHEMERIS_UNAVAILABLE", "천체와 태양 고도를 같은 시각에 맞추지 못했습니다.")
        samples.append({**row, "sun_altitude_deg": sun[row["time"]]})
    return ok(TOOL, {"samples": samples, "target_id": target.target_id}, PROVIDER, URL)
