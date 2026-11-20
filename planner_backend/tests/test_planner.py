from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.engine import default_task_plan
from app.models import init_database, make_engine, make_session_factory


@pytest.fixture()
def client(monkeypatch):
    test_engine = make_engine("sqlite:///:memory:")
    init_database(test_engine)
    main.engine = test_engine
    main.Session = make_session_factory(test_engine)
    state = {"mode": "suitable"}

    def fake_tool(name, arguments):
        if name == "search_places" and state["mode"] == "missing_key":
            return {"ok": False, "tool": name, "data": None, "error": {"code": "MISSING_API_KEY", "message": "키 없음"}, "source": None}
        if name == "search_places" and state["mode"] == "no_result" and arguments["query"] == "서울숲":
            return {"ok": False, "tool": name, "data": None, "error": {"code": "NO_RESULT", "message": "결과 없음"}, "source": None}
        if name == "get_weather" and state["mode"] == "forecast":
            return {"ok": False, "tool": name, "data": None, "error": {"code": "FORECAST_UNAVAILABLE", "message": "예보 범위 밖"}, "source": None}
        if name == "search_places":
            return {"ok": True, "tool": name, "data": {"places": [{"place_id": "place-1", "name": "서울숲", "address": "서울"}], "estimated": False}, "error": None, "source": {"provider": "google_places"}}
        if name == "get_place_details":
            return {"ok": True, "tool": name, "data": {"place_id": arguments["place_id"], "name": "서울숲", "latitude": 37.54, "longitude": 127.04, "address": "서울 성동구", "maps_url": "https://maps.example/place-1"}, "error": None, "source": {"provider": "google_places"}}
        if name == "get_ephemeris":
            start = datetime.fromisoformat(arguments["start_at"])
            end = datetime.fromisoformat(arguments["end_at"])
            narrow = end - start <= timedelta(hours=3)
            altitude = 8 if state["mode"] == "replan" and narrow else 45
            if state["mode"] == "fail":
                return {"ok": False, "tool": name, "data": None, "error": {"code": "EPHEMERIS_UNAVAILABLE", "message": "천문력 없음"}, "source": None}
            if state["mode"] == "cap":
                altitude = 10
            samples = []
            moment = start
            while moment <= end:
                samples.append({"time": moment.isoformat(), "altitude_deg": altitude, "azimuth_deg": 180, "sun_altitude_deg": -20})
                moment += timedelta(minutes=arguments["step_minutes"])
            return {"ok": True, "tool": name, "data": {"samples": samples}, "error": None, "source": {"provider": "jpl_horizons"}}
        if name == "get_weather":
            start = datetime.fromisoformat(arguments["start_at"])
            end = datetime.fromisoformat(arguments["end_at"])
            hours = []
            moment = start
            while moment <= end:
                hours.append({"time": moment.isoformat(), "cloud_cover_pct": 10, "precipitation_probability_pct": 0, "precipitation_mm": 0})
                moment += timedelta(hours=1)
            return {"ok": True, "tool": name, "data": {"hours": hours}, "error": None, "source": {"provider": "open_meteo"}}
        if name == "get_route":
            return {"ok": True, "tool": name, "data": {"duration_minutes": 40, "duration_seconds": 2400, "transport_mode": "DRIVE"}, "error": None, "source": {"provider": "google_routes"}}
        raise AssertionError(name)

    monkeypatch.setattr("app.engine.run_tool", fake_tool)

    def analyzer(message, constraints):
        if "어떻게" in message:
            return {"ok": True, "data": {"intent": "help", "reason": "사용법 질문이라 Tool이 필요 없다"}}
        data = {"intent": "plan_observation", "reason": "관측 장소를 찾는다", "target_id": "jupiter", "search_region": "서울숲", "date_start": "2026-11-21", "preferred_time_start": "20:00", "preferred_time_end": "21:00"}
        if "목성만" in message:
            data = {"intent": "plan_observation", "reason": "천체만 말했다", "target_id": "jupiter"}
        if "남산" in message:
            state["mode"] = "replan"
            data["search_region"] = "남산"
        if "80도" in message:
            state["mode"] = "cap"
            data.update({"search_region": "집 앞", "min_altitude_deg": 80, "max_cloud_cover_pct": 0, "max_travel_minutes": 10, "origin_name": "집", "origin_lat": 37.5, "origin_lon": 127.0, "transport_mode": "자동차", "allow_other_date": True, "preferred_time_start": "21:00", "preferred_time_end": "22:00"})
        if "천문력만" in message:
            state["mode"] = "fail"
        for word, mode in (("키 없음", "missing_key"), ("검색 없음", "no_result"), ("예보 밖", "forecast")):
            if word in message:
                state["mode"] = mode
                data["place_query"] = "서울숲"
        if "22:00" in message and "21:00" in message:
            data.update({"preferred_time_start": "22:00", "preferred_time_end": "21:00"})
        return {"ok": True, "data": data}

    monkeypatch.setattr(main, "_analyzer", analyzer)
    monkeypatch.setattr(main, "_planner", lambda values, axis=None: default_task_plan(values, axis))
    test_client = TestClient(main.app)
    test_client.state = state
    return test_client


def _say(client, text, conversation_id=None, request_id=None):
    if conversation_id is None:
        created = client.post("/api/conversations")
        assert created.status_code == 200
        conversation_id = created.json()["id"]
    payload = {"text": text}
    if request_id:
        payload["request_id"] = request_id
    response = client.post(f"/api/conversations/{conversation_id}/messages", json=payload)
    return conversation_id, response


def test_help_skips_tools(client):
    session, response = _say(client, "이 플래너 어떻게 써?")
    body = response.json()
    assert response.status_code == 200
    assert body["tasks"] == []
    logs = client.get(f"/api/logs/sessions/{session}").json()["events"]
    assert any(item["payload"].get("intent") == "help" for item in logs)


def test_suitable_plan_without_replan(client):
    _, response = _say(client, "이번 토요일 20시에 서울숲에서 목성을 1시간 보고 싶어.")
    body = response.json()
    assert body["state"] == "COMPLETED"
    assert body["replan_count"] == 0
    assert body["final_plan"]["status"] == "SUITABLE"
    assert body["final_plan"]["maps_url"] == "https://maps.example/place-1"
    assert "45" in body["message"]


def test_replan_reuses_place_details(client):
    session, response = _say(client, "오늘 21시에 남산에서 목성을 1시간 봐 줘.")
    body = response.json()
    assert body["replanned"] is True
    assert body["final_plan"]["status"] == "SUITABLE"
    logs = client.get(f"/api/logs/sessions/{session}").json()["events"]
    completed = [item for item in logs if item["type"] == "stage_exited" and item["stage"] == "execute_tools"]
    assert completed[-1]["payload"]["http_calls"]["get_place_details"] == 1
    assert completed[-1]["payload"]["http_calls"]["get_ephemeris"] == 2


def test_tool_events_carry_name_and_duration_and_reuse_is_logged(client):
    session, _ = _say(client, "오늘 21시에 남산에서 목성을 1시간 봐 줘.")
    events = client.get(f"/api/logs/sessions/{session}").json()["events"]
    completed = [item for item in events if item["type"] == "tool_call_completed"]
    requested = [item for item in events if item["type"] == "tool_call_requested"]
    assert len(requested) == len(completed) > 0
    assert all(item["tool_name"] and item["duration_ms"] is not None for item in completed)
    assert all(item["payload"]["ok"] is True for item in completed)
    reused = [item for item in events if item["type"] == "tool_result_reused"]
    assert any(item["tool_name"] == "get_place_details" for item in reused)
    assert events == sorted(events, key=lambda item: item["sequence"])


def test_failed_tool_event_records_error_code(client):
    session, _ = _say(client, "이번 토요일 서울숲에서 목성 관측 계획 짜 줘. 천문력만 실패해도 계속")
    events = client.get(f"/api/logs/sessions/{session}").json()["events"]
    failed = [item for item in events if item["type"] == "tool_call_completed" and not item["payload"]["ok"]]
    assert failed and failed[0]["tool_name"] == "get_ephemeris"
    assert failed[0]["payload"]["error_code"] == "EPHEMERIS_UNAVAILABLE"


def test_travel_limit_without_routes_is_not_guessed(client):
    _, response = _say(client, "오늘 밤 집 앞에서 목성을 보고 싶어. 고도 80도 이상, 구름 0%, 이동 10분 이내.")
    body = response.json()
    assert "get_route" not in body["tasks"]
    assert all(item["tool"] != "get_route" for item in body["tool_summaries"])
    assert "이동시간 제한은 확인하지 못했습니다" in body["message"]


def test_replan_cap(client):
    _, response = _say(client, "오늘 밤 집 앞에서 목성을 보고 싶어. 고도 80도 이상, 구름 0%, 이동 10분 이내.")
    body = response.json()
    assert body["replan_count"] == 3
    assert body["final_plan"] is None
    assert "상한" in body["message"]


def test_one_tool_failure_continues(client):
    _, response = _say(client, "이번 토요일 서울숲에서 목성 관측 계획 짜 줘. 천문력만 실패해도 계속")
    body = response.json()
    assert any(item["status"] == "UNVERIFIED" for item in body["candidates"])
    assert any(item["tool"] == "get_weather" and item["ok"] for item in body["tool_summaries"])
    assert any(item["tool"] == "get_ephemeris" and not item["ok"] for item in body["tool_summaries"])


def test_missing_key_is_reported_without_replan(client):
    session, response = _say(client, "서울숲에서 목성 보고 싶어. 키 없음")
    body = response.json()
    assert body["replan_count"] == 0
    assert "재계획하지 않았습니다" in body["message"]
    assert body["errors"][0]["code"] == "MISSING_API_KEY"
    events = client.get(f"/api/logs/sessions/{session}").json()["events"]
    assert sum(1 for item in events if item["type"] == "tool_call_requested" and item["tool_name"] == "search_places") == 1
    skipped = [item for item in events if item["type"] == "replan_skipped"]
    assert skipped and skipped[0]["payload"]["codes"] == ["MISSING_API_KEY"]


def test_forecast_out_of_range_is_not_replanned(client):
    _, response = _say(client, "서울숲에서 목성 보고 싶어. 예보 밖")
    body = response.json()
    assert body["replan_count"] == 0
    assert all(item["status"] == "UNVERIFIED" for item in body["candidates"])
    assert "예보 범위" in body["message"]


def test_no_result_replans_with_next_place_query(client):
    _, response = _say(client, "서울숲에서 목성 보고 싶어. 검색 없음")
    body = response.json()
    assert body["replan_count"] == 1
    assert body["final_plan"]["status"] == "SUITABLE"


def test_graph_path_shows_conditional_branches_and_replan_loop(client):
    _, help_response = _say(client, "이 플래너 어떻게 써?")
    assert help_response.json()["graph_path"] == ["analyze_request", "validate_information", "generate_response"]
    _, waiting = _say(client, "목성만 보고 싶어")
    assert waiting.json()["graph_path"] == ["analyze_request", "validate_information", "ask_clarification"]
    _, replanned = _say(client, "오늘 21시에 남산에서 목성을 1시간 봐 줘.")
    assert replanned.json()["graph_path"] == [
        "analyze_request", "validate_information", "plan_tasks", "execute_tools", "evaluate_candidates",
        "replan_tasks", "execute_tools", "evaluate_candidates", "generate_response",
    ]


def test_missing_region_then_resume(client):
    session, first = _say(client, "목성만 보고 싶어")
    assert first.json()["state"] == "WAITING_USER"
    assert "지역" in first.json()["message"]
    _, second = _say(client, "서울숲에서 보자", session)
    assert second.json()["state"] == "COMPLETED"


def test_question_limit_and_contradiction(client):
    _, conflict = _say(client, "22:00에 시작해서 21:00에 끝내고 서울숲에서 목성")
    assert conflict.json()["state"] == "WAITING_USER"
    session = None
    for _ in range(4):
        session, response = _say(client, "목성만", session)
    _, blocked = _say(client, "목성만", session)
    assert blocked.json()["state"] == "FAILED"
    assert "부족" in blocked.json()["message"]


def test_request_id_is_not_executed_twice(client):
    session, first = _say(client, "이번 토요일 20시에 서울숲에서 목성을 1시간 보고 싶어.", request_id="same-request")
    before = len(client.get(f"/api/logs/sessions/{session}").json()["events"])
    _, second = _say(client, "이번 토요일 20시에 서울숲에서 목성을 1시간 보고 싶어.", session, "same-request")
    after = len(client.get(f"/api/logs/sessions/{session}").json()["events"])
    assert first.json()["conversation_id"] == second.json()["conversation_id"]
    assert before == after


def test_plan_overlap_does_not_block_save(client):
    body = {"target_id": "jupiter", "place_name": "서울숲", "start_at": "2026-11-21T11:00:00Z", "end_at": "2026-11-21T13:00:00Z", "status": "SUITABLE"}
    first = client.post("/api/plans", json=body)
    second = client.post("/api/plans", json={**body, "place_name": "남산"})
    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["warnings"][0]["code"] == "OVERLAP"
    updated = client.patch(f"/api/plans/{second.json()['plan']['id']}", json={**body, "place_name": "남산", "start_at": "2026-11-21T12:00:00Z", "end_at": "2026-11-21T14:00:00Z"})
    assert updated.status_code == 200
    assert updated.json()["warnings"]
    listed = client.get("/api/plans")
    assert len(listed.json()["items"]) == 2
    detail = client.get(f"/api/plans/{first.json()['plan']['id']}")
    assert detail.status_code == 200
    body_out = detail.json()
    assert body_out["place_name"] == "서울숲"
    assert body_out["target_id"] == "jupiter"
    assert body_out["created_at"]
    assert client.get("/api/plans/missing-plan").status_code == 404
    assert client.delete(f"/api/plans/{first.json()['plan']['id']}").status_code == 200


def test_logs_have_no_update_and_sessions_do_not_mix(client):
    one, _ = _say(client, "이 플래너 어떻게 써?")
    two, _ = _say(client, "이 플래너 어떻게 써?")
    assert one != two
    log_one = client.get(f"/api/logs/sessions/{one}").json()["events"]
    assert log_one[0]["sequence"] == 1
    assert client.patch(f"/api/logs/sessions/{one}", json={"sequence": 1}).status_code == 405
    assert client.delete(f"/api/logs/sessions/{one}").status_code == 200
    assert client.get(f"/api/logs/sessions/{two}").status_code == 200
    assert client.get(f"/api/logs/sessions/{one}").json()["events"] == []


def test_log_order_continues_across_requests_in_one_conversation(client):
    conversation, first = _say(client, "이 플래너 어떻게 써?")
    _, second = _say(client, "이 플래너 어떻게 써?", conversation_id=conversation)
    events = client.get(f"/api/logs/sessions/{conversation}").json()["events"]
    sequences = [item["sequence"] for item in events]
    assert sequences == list(range(1, len(events) + 1))
    assert len(events) == len(first.json()["events"]) + len(second.json()["events"])
    # 두 번째 요청의 이벤트는 첫 요청의 이벤트 뒤에, 발생한 순서 그대로 놓인다.
    assert [item["type"] for item in events[len(first.json()["events"]):]] == [item["type"] for item in second.json()["events"]]


def test_agent_runs_without_a_logging_agent():
    from app.engine import invoke_graph
    from app.logging_agent import EventBus

    bus = EventBus()
    outcome = invoke_graph(
        "이 플래너 어떻게 써?", {}, bus,
        lambda message, constraints: {"ok": True, "data": {"intent": "help", "reason": "사용법 질문이라 Tool이 필요 없다"}},
        lambda values, axis=None: default_task_plan(values, axis),
    )
    assert outcome["state"] == "COMPLETED"
    assert bus.handlers == []
    assert bus.events


def test_every_json_endpoint_declares_a_response_model(client):
    paths = client.get("/openapi.json").json()["paths"]
    for path, methods in paths.items():
        for method, operation in methods.items():
            content = operation["responses"]["200"]["content"]
            if path.endswith("/events/stream"):
                assert "text/event-stream" in content
                continue
            assert "$ref" in content["application/json"]["schema"], f"{method.upper()} {path}"


def test_logging_failure_does_not_stop_chat(client, monkeypatch):
    def explode(self, event):
        raise RuntimeError("disk")

    monkeypatch.setattr("app.logging_agent.LoggingAgent.store", explode)
    _, response = _say(client, "이 플래너 어떻게 써?")
    assert response.status_code == 200
    assert response.json()["state"] == "COMPLETED"


def test_plan_saved_without_coordinates_gets_place_coordinates(client):
    body = {"target_id": "jupiter", "place_name": "서울숲", "start_at": "2026-11-21T11:00:00Z", "end_at": "2026-11-21T13:00:00Z", "status": "UNVERIFIED"}
    saved = client.post("/api/plans", json=body).json()["plan"]
    assert saved["place_id"] == "place-1"
    assert saved["latitude"] == 37.54
    assert saved["longitude"] == 127.04
    kept = client.post("/api/plans", json={**body, "place_name": "내 마당", "latitude": 35.0, "longitude": 128.0}).json()["plan"]
    assert (kept["latitude"], kept["longitude"]) == (35.0, 128.0)
    assert kept["place_id"] is None


def test_plan_stays_without_coordinates_when_place_is_not_found(client):
    client.state["mode"] = "no_result"
    body = {"target_id": "jupiter", "place_name": "서울숲", "start_at": "2026-11-21T11:00:00Z", "end_at": "2026-11-21T13:00:00Z", "status": "UNVERIFIED"}
    saved = client.post("/api/plans", json=body).json()["plan"]
    assert saved["latitude"] is None
    assert saved["longitude"] is None
