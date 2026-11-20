from dataclasses import replace
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.engine import default_task_plan, normalize_tasks
from app.evaluator import evaluate_candidate
from app.fsm import field, merge_constraints, missing_fields, next_question
from app.tools import REGISTRY, catalog, run_tool
from app.tools.horizons import _parse_block
from app.tools.places import search_places
from app.tools.responses import fail


SAMPLE = """
$$SOE
 2026-Nov-19 11:00  m   26.171342 -34.956295
 2026-Nov-19 12:00  m   41.490188 -28.301992
$$EOE
"""


def test_horizons_parser_skips_solar_marker():
    rows = _parse_block(SAMPLE)
    assert rows[0]["azimuth_deg"] == 26.171342
    assert rows[0]["altitude_deg"] == -34.956295
    assert rows[0]["time"].startswith("2026-11-19T11:00")


def test_places_does_not_invent_region():
    result = search_places("", "천문대")
    assert result["ok"] is False
    assert result["error"]["code"] == "INVALID_INPUT"


def test_places_reports_missing_key(monkeypatch):
    # .env에 실제 키가 있어도 단위 테스트가 외부 API를 부르지 않도록 키를 비운 설정으로 고정한다.
    monkeypatch.setattr("app.tools.places.settings", replace(settings, google_maps_api_key=""))
    result = search_places("서울", "천문대", date="2026-11-21", time_start="20:00", time_end="21:00")
    assert result["ok"] is False
    assert result["error"]["code"] == "MISSING_API_KEY"


def test_routes_disabled_is_hidden_from_agent(monkeypatch):
    monkeypatch.setattr("app.tools.settings", replace(settings, routes_enabled=False))
    assert "get_route" not in [item["name"] for item in catalog()]
    assert "get_route" in REGISTRY
    blocked = run_tool("get_route", {"origin_lat": 1, "origin_lon": 1, "destination_lat": 2, "destination_lon": 2})
    assert blocked["ok"] is False
    assert blocked["error"]["code"] == "TOOL_DISABLED"


def test_routes_enabled_is_visible(monkeypatch):
    monkeypatch.setattr("app.tools.settings", replace(settings, routes_enabled=True))
    assert "get_route" in [item["name"] for item in catalog()]


def test_disabled_route_is_dropped_from_task_plan(monkeypatch):
    monkeypatch.setattr("app.tools.settings", replace(settings, routes_enabled=False))
    tasks = [{"tool": "search_places"}, {"tool": "get_route"}]
    names, error = normalize_tasks(tasks, {"max_travel_minutes": 30})
    assert error is None
    assert names == ["search_places", "get_place_details", "get_ephemeris", "get_weather"]
    plan = default_task_plan({"max_travel_minutes": 30})
    assert "get_route" not in [item["tool"] for item in plan["data"]["tasks"]]


def test_merge_keeps_unmentioned_fields():
    current = {"target_id": field("jupiter", "USER", True), "search_region": field("서울", "USER", True)}
    merged = merge_constraints(current, {"max_travel_minutes": 30}, "USER")
    assert merged["target_id"]["value"] == "jupiter"
    assert merged["max_travel_minutes"]["value"] == 30


def test_question_limit_blocks_without_inventing_values():
    constraints = {"target_id": field("jupiter", "USER", True)}
    for count in range(4):
        gate = next_question("plan_observation", constraints, count, 4, False)
        assert gate["ask"] is True
    blocked = next_question("plan_observation", constraints, 4, 4, False)
    assert blocked["ask"] is False
    assert blocked["blocked"] is True
    assert missing_fields("plan_observation", constraints) == ["search_region"]


def test_unknown_weather_is_not_suitable():
    start = datetime(2026, 11, 21, 11, tzinfo=timezone.utc)
    samples = []
    moment = start
    for _ in range(3):
        samples.append({"time": moment.isoformat(), "altitude_deg": 40, "sun_altitude_deg": -20, "azimuth_deg": 180})
        moment += timedelta(minutes=30)
    result = evaluate_candidate(
        {"place_id": "p", "name": "서울숲"},
        samples,
        [],
        None,
        {},
        {"min_altitude_deg": 20, "max_sun_altitude_deg": -12, "max_cloud_cover_pct": 50, "max_precipitation_probability_pct": 30, "min_window_minutes": 60, "step_minutes": 30},
    )
    assert result["status"] == "UNVERIFIED"
    assert fail("get_weather", "FORECAST_UNAVAILABLE", "없음")["ok"] is False


def test_message_times_are_shown_in_korean_local_time():
    from app.engine import factual_message, local_text

    assert local_text("2026-11-22T19:00:00+00:00") == "11월 23일 04:00 (KST)"
    assert local_text("읽을 수 없는 값") == "읽을 수 없는 값"
    text = factual_message([], False, 2, "time")
    assert "시간대" in text and "time" not in text


POLICY = {"min_altitude_deg": 20, "max_sun_altitude_deg": -12, "max_cloud_cover_pct": 50, "max_precipitation_probability_pct": 30, "min_window_minutes": 60, "step_minutes": 30}


def _samples(altitudes, sun=-20):
    moment = datetime(2026, 11, 21, 11, tzinfo=timezone.utc)
    rows = []
    for altitude in altitudes:
        rows.append({"time": moment.isoformat(), "altitude_deg": altitude, "sun_altitude_deg": sun, "azimuth_deg": 180})
        moment += timedelta(minutes=30)
    return rows


def test_unknown_weather_with_some_unmet_samples_stays_unverified():
    # 일부 시각은 고도 미달이지만, 확인된 조건을 맞춘 연속 구간이 있고 날씨만 모르면 불충족으로 단정하지 않는다.
    result = evaluate_candidate({"place_id": "p", "name": "서울숲"}, _samples([5, 40, 45, 50]), [], None, {}, POLICY)
    assert result["status"] == "UNVERIFIED"
    assert any("확인하지 못한 조건" in warning for warning in result["warnings"])


def test_unsuitable_reports_which_condition_failed_without_inventing():
    result = evaluate_candidate({"place_id": "p", "name": "서울숲"}, _samples([30, 50, 55, 40]), None, None, {"min_altitude_deg": 85}, POLICY)
    assert result["status"] == "UNSUITABLE"
    row = result["unmet_summary"][0]
    assert row["field"] == "altitude" and row["unmet_samples"] == 4 and row["best_value"] == 55
    from app.engine import factual_message

    text = factual_message([result], False, 0, None)
    assert "altitude" in text and "55" in text


def test_tool_specs_match_function_signatures():
    import inspect

    for spec in REGISTRY.values():
        parameters = inspect.signature(spec.fn).parameters
        without_default = {name for name, item in parameters.items() if item.default is inspect.Parameter.empty}
        assert without_default <= set(spec.input_schema["required"]), spec.name
        assert set(spec.input_schema["properties"]) <= set(parameters), spec.name
        assert spec.output_schema["type"] == "object" and spec.output_schema["required"], spec.name
    listed = catalog()
    assert all("input_schema" in item and "output_schema" in item for item in listed)


def test_observation_chain_is_completed_when_model_picks_a_subset():
    names, error = normalize_tasks([{"tool": "get_ephemeris"}], {})
    assert error is None
    assert names == ["search_places", "get_place_details", "get_ephemeris", "get_weather"]

