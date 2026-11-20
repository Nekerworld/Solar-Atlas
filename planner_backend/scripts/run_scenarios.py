"""대표 시나리오 실행기.

LLM 분석 결과만 시나리오별로 고정하고, Tool(Places, Horizons, Open-Meteo)은 실제로 호출한다.
GMS가 막혀 있을 때도 Agent 루프, 재계획, Tool 실패 격리, 로그를 같은 방식으로 확인하기 위한 용도다.
키 값은 읽거나 출력하지 않는다.

사용: planner_backend 폴더에서 `python scripts/run_scenarios.py` (결과는 docs/samples/ 에 저장)
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import time
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "planner_backend"))
os.environ["PLANNER_DB"] = str(Path(tempfile.mkdtemp()) / "scenarios.sqlite")
os.environ["PLANNER_LLM"] = "script"

from fastapi.testclient import TestClient  # noqa: E402

from app import main  # noqa: E402

SAMPLES = ROOT / "docs" / "samples"


def day(offset: int) -> str:
    return (datetime.now().date() + timedelta(days=offset)).isoformat()


# 의도 분석(LLM) 결과를 고정한 입력. 실제 GMS 응답과 같은 필드를 쓴다.
SCENARIOS = [
    {
        "id": "S1",
        "title": "한 번에 성공하는 관측 계획",
        "message": "모레 새벽 3시부터 5시 반 사이 서울숲에서 목성을 보고 싶어.",
        "analysis": {"intent": "plan_observation", "reason": "관측 계획 요청", "target_id": "jupiter",
                     "date_start": day(2), "preferred_time_start": "03:00", "preferred_time_end": "05:30",
                     "search_region": "서울숲", "place_query": "서울숲"},
        "expect": "COMPLETED, 재계획 0회, Tool 3종 모두 호출",
    },
    {
        "id": "S2",
        "title": "재계획으로 성공하는 경우",
        "message": "모레 저녁 8시에서 9시 사이 서울숲에서 목성을 보고 싶어.",
        "analysis": {"intent": "plan_observation", "reason": "관측 계획 요청", "target_id": "jupiter",
                     "date_start": day(2), "preferred_time_start": "20:00", "preferred_time_end": "21:00",
                     "search_region": "서울숲", "place_query": "서울숲"},
        "expect": "처음 시간대에서 목성이 낮아 후보가 없으면 시간 축을 넓혀 재계획",
    },
    {
        "id": "S3",
        "title": "재계획 상한(3회)에서 멈추는 경우",
        "message": "모레 새벽 서울숲에서 고도 85도 이상, 구름 0%로 목성을 보고 싶어.",
        "analysis": {"intent": "plan_observation", "reason": "관측 계획 요청", "target_id": "jupiter",
                     "date_start": day(2), "preferred_time_start": "03:00", "preferred_time_end": "05:30",
                     "search_region": "서울숲", "place_query": "서울숲",
                     "min_altitude_deg": 85, "max_cloud_cover_pct": 0},
        "expect": "충족 후보 없음, 재계획 3회에서 중단, 실패 이유를 사실대로 안내",
    },
    {
        "id": "S4",
        "title": "Tool 하나가 실패해도 나머지가 계속되는 경우",
        "message": "예보 범위를 넘는 날짜(약 60일 뒤) 밤 서울숲에서 목성을 보고 싶어.",
        "analysis": {"intent": "plan_observation", "reason": "관측 계획 요청", "target_id": "jupiter",
                     "date_start": day(60), "preferred_time_start": "22:00", "preferred_time_end": "23:59",
                     "search_region": "서울숲", "place_query": "서울숲"},
        "expect": "날씨 Tool이 FORECAST_UNAVAILABLE로 실패해도 장소·천문력 결과로 응답, 날씨는 미확인으로 표시",
    },
    {
        "id": "S5",
        "title": "Tool이 필요 없는 사용법 질문",
        "message": "이 플래너 어떻게 써?",
        "analysis": {"intent": "help", "reason": "도구가 필요 없는 안내 요청"},
        "expect": "Tool 호출 0, 안내 문장 응답",
    },
    {
        "id": "S6",
        "title": "지식 질문(search_knowledge) - 지식 서버가 꺼져 있는 경우",
        "message": "목성은 얼마나 큰 행성이야?",
        "analysis": {"intent": "ask_knowledge", "reason": "천체 지식 질문", "target_id": "jupiter"},
        "expect": "답을 지어내지 않고 KNOWLEDGE_UNAVAILABLE 안내, 이후 흐름은 정상",
    },
    {
        "id": "S7",
        "title": "다시 시도해도 결과가 같은 오류(API 키 누락)",
        "message": "모레 새벽 서울숲에서 목성을 보고 싶어.",
        "analysis": {"intent": "plan_observation", "reason": "관측 계획 요청", "target_id": "jupiter",
                     "date_start": day(2), "preferred_time_start": "03:00", "preferred_time_end": "05:30",
                     "search_region": "서울숲", "place_query": "서울숲"},
        "without_places_key": True,
        "expect": "장소 검색이 MISSING_API_KEY로 실패하면 재계획하지 않고 바로 안내",
    },
]


def run_one(client: TestClient, scenario: dict) -> dict:
    from dataclasses import replace

    import app.tools.places as places

    original = places.settings
    if scenario.get("without_places_key"):
        places.settings = replace(original, google_maps_api_key="")
    try:
        return _run(client, scenario)
    finally:
        places.settings = original


def _run(client: TestClient, scenario: dict) -> dict:
    main._analyzer = lambda message, constraints, data=scenario["analysis"]: {"ok": True, "data": dict(data)}
    conversation = client.post("/api/conversations").json()["id"]
    started = time.perf_counter()
    response = client.post(f"/api/conversations/{conversation}/messages", json={
        "text": scenario["message"], "request_id": f"scenario-{scenario['id']}", "selected_target_id": None,
    })
    elapsed_ms = round((time.perf_counter() - started) * 1000)
    body = response.json()
    events = client.get(f"/api/conversations/{conversation}/events").json().get("events", [])
    return {"scenario": scenario, "http_status": response.status_code, "response": body, "events": events, "elapsed_ms": elapsed_ms}


def digest(item: dict) -> dict:
    body = item["response"]
    events = item["events"]
    calls = [e for e in events if e["type"] == "tool_call_completed"]
    return {
        "id": item["scenario"]["id"],
        "title": item["scenario"]["title"],
        "http_status": item["http_status"],
        "elapsed_ms": item["elapsed_ms"],
        "state": body.get("state"),
        "intent": body.get("intent"),
        "replan_count": body.get("replan_count"),
        "tasks": body.get("tasks"),
        "tool_calls": [{"tool": e["tool_name"], "ok": e["payload"].get("ok"), "error_code": e["payload"].get("error_code"),
                        "duration_ms": e["duration_ms"]} for e in calls],
        "reused": sum(1 for e in events if e["type"] == "tool_result_reused"),
        "replan_events": [e["payload"] for e in events if e["type"] == "replan_started"],
        "replan_skipped": [e["payload"] for e in events if e["type"] == "replan_skipped"],
        "graph_path": body.get("graph_path"),
        "candidates": [{"name": c.get("name"), "status": c.get("status"),
                        "checks": [f"{k.get('field')}={k.get('status')}" for k in c.get("checks") or []]}
                       for c in body.get("candidates") or []],
        "event_count": len(events),
        "message": body.get("message"),
    }


def main_run() -> None:
    SAMPLES.mkdir(parents=True, exist_ok=True)
    results = []
    with TestClient(main.app) as client:
        for scenario in SCENARIOS:
            results.append(run_one(client, scenario))
    summary = [digest(item) for item in results]
    (SAMPLES / "scenario_results.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    # 전체 실행 로그 샘플은 재계획이 있었던 시나리오를 우선으로 한 건 저장한다.
    chosen = next((item for item in results if item["response"].get("replan_count")), results[0])
    (SAMPLES / "execution_log_sample.json").write_text(json.dumps({
        "scenario": chosen["scenario"]["id"],
        "title": chosen["scenario"]["title"],
        "user_message": chosen["scenario"]["message"],
        "final_response": chosen["response"].get("message"),
        "events": chosen["events"],
    }, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main_run()
