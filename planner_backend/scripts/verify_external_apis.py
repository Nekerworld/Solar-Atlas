"""외부 API 실호출 검증. Mock 성공은 통과로 치지 않는다."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.config import settings  # noqa: E402
from app.tools.horizons import get_ephemeris  # noqa: E402
from app.tools.places import get_place_details, search_places  # noqa: E402
from app.tools.routes import get_route  # noqa: E402
from app.tools.weather import get_weather  # noqa: E402

SEOUL = ZoneInfo("Asia/Seoul")


def summarize(result: dict) -> dict:
    if not result["ok"]:
        return {"ok": False, "error": result["error"]}
    data = result["data"]
    brief = {}
    for key in ("places", "samples", "hours", "place_id", "name", "latitude", "longitude", "maps_url", "duration_minutes", "estimated"):
        if key not in data:
            continue
        value = data[key]
        brief[key] = len(value) if isinstance(value, list) else value
    if "samples" in data and data["samples"]:
        brief["first_altitude_deg"] = data["samples"][0].get("altitude_deg")
        brief["first_sun_altitude_deg"] = data["samples"][0].get("sun_altitude_deg")
    if "hours" in data and data["hours"]:
        brief["first_cloud_cover_pct"] = data["hours"][0].get("cloud_cover_pct")
    if "places" in data and data["places"]:
        brief["first_place_id_present"] = bool(data["places"][0].get("place_id"))
    return {"ok": True, "tool": result["tool"], "provider": result["source"]["provider"], "brief": brief}


def main() -> None:
    now = datetime.now(SEOUL)
    start = (now + timedelta(days=1)).replace(hour=20, minute=0, second=0, microsecond=0)
    end = start + timedelta(hours=3)
    report = {
        "places_search": summarize(search_places("서울", "천문대", limit=3, date=start.date().isoformat(), time_start="20:00", time_end="23:00")),
        "horizons": summarize(get_ephemeris("jupiter", 37.5665, 126.9780, 38, start, end, 30)),
        "open_meteo": summarize(get_weather(37.5665, 126.9780, start, end)),
        "routes": (
            summarize(get_route(37.4979, 127.0276, 37.5665, 126.9780, "DRIVE"))
            if settings.routes_enabled
            else {"ok": None, "skipped": "PLANNER_ROUTES_ENABLED=false. 호출하지 않음."}
        ),
        "gms_key_present": bool(settings.gms_key),
        "google_key_present": bool(settings.google_maps_api_key),
    }
    place_id = None
    search = search_places("서울", "천문대", limit=1, date=start.date().isoformat(), time_start="20:00", time_end="23:00")
    if search["ok"] and search["data"]["places"]:
        place_id = search["data"]["places"][0]["place_id"]
        report["places_details"] = summarize(get_place_details(place_id))
    else:
        report["places_details"] = {"ok": False, "error": {"code": "NO_RESULT", "message": "검색 식별자가 없어 상세 조회를 호출하지 않았습니다."}}
    future = get_weather(37.5665, 126.9780, start + timedelta(days=40), start + timedelta(days=40, hours=2))
    report["forecast_beyond"] = summarize(future)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
