"""등록된 Tool만 호출한다. 계획 저장은 Tool이 아니다."""
from __future__ import annotations

import json

from app.config import settings
from app.tools.horizons import get_ephemeris
from app.tools.knowledge import search_knowledge
from app.tools.places import get_place_details, search_places
from app.tools.responses import fail
from app.tools.routes import get_route
from app.tools.weather import get_weather


def _object(properties: dict, required: list[str]) -> dict:
    return {"type": "object", "properties": properties, "required": required, "additionalProperties": False}


NUMBER = {"type": "number"}
TEXT = {"type": "string"}
INSTANT = {"type": "string", "format": "date-time", "description": "시간대가 있는 ISO 8601 시각"}


class ToolSpec:
    """Tool 명세. Agent에게는 이름, 설명, 입력·출력 구조를 보여 주고, 실행은 fn이 한다."""

    def __init__(self, name: str, description: str, kind: str, provider: str, fn, input_schema: dict, output_schema: dict):
        self.name = name
        self.description = description
        self.kind = kind
        self.provider = provider
        self.fn = fn
        self.input_schema = input_schema
        self.output_schema = output_schema


REGISTRY = {
    "search_places": ToolSpec(
        "search_places",
        "관측 장소 후보의 식별자가 필요할 때 지역과 장소 유형으로 외부 장소 목록을 찾는다.",
        "external",
        "google_places",
        search_places,
        _object({
            "region": {**TEXT, "description": "사용자가 말한 지역. 비어 있으면 호출하지 않는다."},
            "query": {**TEXT, "description": "장소 유형 또는 장소 이름"},
            "limit": {"type": "integer", "minimum": 1, "maximum": 5},
            "date": {**TEXT, "format": "date"},
            "time_start": {**TEXT, "description": "HH:MM"},
            "time_end": {**TEXT, "description": "HH:MM, 자정은 24:00"},
        }, ["region", "query"]),
        _object({
            "places": {"type": "array", "items": _object({"place_id": TEXT, "name": TEXT, "address": TEXT}, ["place_id", "name"])},
            "requested_region": TEXT,
            "requested_query": TEXT,
            "estimated": {"type": "boolean", "description": "날짜나 시간을 요청에서 받지 못해 추정했는지"},
            "estimate_reason": {"type": ["string", "null"]},
        }, ["places", "estimated"]),
    ),
    "get_place_details": ToolSpec(
        "get_place_details",
        "장소 식별자가 있을 때 이름, 주소, 지도 링크, 좌표를 확인한다.",
        "external",
        "google_places",
        get_place_details,
        _object({"place_id": {**TEXT, "description": "search_places가 돌려준 식별자"}}, ["place_id"]),
        _object({
            "place_id": TEXT, "name": TEXT, "address": TEXT, "maps_url": TEXT,
            "latitude": {"type": ["number", "null"]}, "longitude": {"type": ["number", "null"]},
        }, ["place_id", "name", "latitude", "longitude"]),
    ),
    "get_ephemeris": ToolSpec(
        "get_ephemeris",
        "장소 좌표와 시각에서 천체 고도, 방위각, 태양 고도가 필요할 때 천문력을 조회한다.",
        "external",
        "jpl_horizons",
        get_ephemeris,
        _object({
            "target_id": TEXT,
            "latitude": NUMBER,
            "longitude": NUMBER,
            "elevation_m": {**NUMBER, "default": 0},
            "start_at": INSTANT,
            "end_at": INSTANT,
            "step_minutes": {"type": "integer", "minimum": 1, "default": 30},
        }, ["target_id", "latitude", "longitude", "start_at", "end_at"]),
        _object({
            "target_id": TEXT,
            "samples": {"type": "array", "items": _object({
                "time": INSTANT, "altitude_deg": NUMBER, "azimuth_deg": NUMBER, "sun_altitude_deg": NUMBER,
            }, ["time", "altitude_deg", "azimuth_deg", "sun_altitude_deg"])},
        }, ["target_id", "samples"]),
    ),
    "get_weather": ToolSpec(
        "get_weather",
        "같은 장소와 시각의 구름량, 강수확률, 강수량이 필요할 때 예보를 조회한다.",
        "external",
        "open_meteo",
        get_weather,
        _object({"latitude": NUMBER, "longitude": NUMBER, "start_at": INSTANT, "end_at": INSTANT}, ["latitude", "longitude", "start_at", "end_at"]),
        _object({
            "latitude": NUMBER,
            "longitude": NUMBER,
            "hours": {"type": "array", "items": _object({
                "time": INSTANT,
                "cloud_cover_pct": {"type": ["number", "null"]},
                "precipitation_probability_pct": {"type": ["number", "null"]},
                "precipitation_mm": {"type": ["number", "null"]},
            }, ["time"])},
        }, ["hours"]),
    ),
    "get_route": ToolSpec(
        "get_route",
        "이동시간 제한이 있을 때 출발지에서 관측 장소까지의 실제 이동시간을 확인한다.",
        "external",
        "google_routes",
        get_route,
        _object({
            "origin_lat": NUMBER, "origin_lon": NUMBER, "destination_lat": NUMBER, "destination_lon": NUMBER,
            "transport_mode": {**TEXT, "description": "DRIVE, WALK, TRANSIT 또는 자동차, 도보, 대중교통", "default": "DRIVE"},
        }, ["origin_lat", "origin_lon", "destination_lat", "destination_lon"]),
        _object({"duration_minutes": NUMBER, "duration_seconds": {"type": "integer"}, "transport_mode": TEXT}, ["duration_minutes", "transport_mode"]),
    ),
    "search_knowledge": ToolSpec(
        "search_knowledge",
        "천체에 대한 설명이나 사실처럼 외부 장소·날씨·천문력 API로 확인할 수 없는 질문일 때 색인된 문서에서 근거와 출처를 찾는다.",
        "local",
        "solar_atlas_rag",
        search_knowledge,
        _object({
            "question": {**TEXT, "maxLength": 500},
            "target_id": {"type": ["string", "null"]},
            "top_k": {"type": "integer", "minimum": 1, "maximum": 10, "default": 5},
        }, ["question"]),
        _object({
            "question": TEXT,
            "item_id": {"type": ["string", "null"]},
            "sources": {"type": "array", "items": _object({
                "rank": {"type": "integer"}, "item_id": {"type": ["string", "null"]}, "item_name": {"type": ["string", "null"]},
                "title": {"type": ["string", "null"]}, "section": {"type": ["string", "null"]}, "source_url": {"type": ["string", "null"]},
                "revision_id": {}, "distance": NUMBER, "snippet": TEXT,
            }, ["rank", "snippet"])},
        }, ["sources"]),
    ),
}


def cache_key(provider: str, name: str, arguments: dict) -> str:
    normalized = json.dumps(arguments, ensure_ascii=False, sort_keys=True, default=str)
    return f"{provider}|{name}|{normalized}"


def disabled_tools() -> set[str]:
    """설정으로 꺼진 Tool 이름. 레지스트리에는 남기고 Agent에게는 보이지 않는다."""
    return set() if settings.routes_enabled else {"get_route"}


def catalog() -> list[dict]:
    off = disabled_tools()
    return [
        {
            "name": spec.name,
            "description": spec.description,
            "kind": spec.kind,
            "input_schema": spec.input_schema,
            "output_schema": spec.output_schema,
        }
        for spec in REGISTRY.values()
        if spec.name not in off
    ]


def run_tool(name: str, arguments: dict | None = None) -> dict:
    spec = REGISTRY.get(name)
    if spec is None:
        return fail(name, "INVALID_INPUT", "등록되지 않은 Tool입니다.")
    if name in disabled_tools():
        return fail(name, "TOOL_DISABLED", "이 Tool은 현재 설정에서 꺼져 있습니다.")
    try:
        return spec.fn(**(arguments or {}))
    except TypeError:
        return fail(name, "INVALID_INPUT", "Tool 입력이 명세와 맞지 않습니다.")
    except Exception:
        return fail(name, "EXTERNAL_API_ERROR", "Tool 실행에 실패했습니다.")
