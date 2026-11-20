"""관측 계획 Agent. LangGraph 노드가 단계별로 일하고, 수치 판단은 결정론적 코드가 한다."""
from __future__ import annotations

import operator
from dataclasses import dataclass, field as dataclass_field
from datetime import datetime, timedelta
from time import monotonic
from typing import Annotated, Any, Callable, TypedDict
from zoneinfo import ZoneInfo

from langgraph.graph import END, START, StateGraph
from langgraph.runtime import Runtime

from app.config import settings
from app.evaluator import evaluate_candidate, local_bounds, rank_suitable
from app.fsm import merge_constraints, next_question, read
from app.logging_agent import EventBus
from app.targets import PRIORITY_DISCOVERY, resolve_target
from app.tools import REGISTRY, cache_key, disabled_tools, run_tool
from app.tools.places import default_window

TZ = ZoneInfo("Asia/Seoul")
PLACE_QUERIES = ("천문대", "공원", "전망대")
HELP_TEXT = "관측하고 싶은 천체, 날짜, 지역을 말해 주세요. 예: 이번 토요일 서울에서 목성을 보고 싶어. 이동시간 제한이 있으면 출발 위치와 수단도 알려 주세요."

# 같은 입력으로 다시 불러도 결과가 같은 오류. 검색 기준을 바꿔도 해결되지 않으므로 재계획하지 않고 바로 안내한다.
NON_RETRYABLE_CODES = {
    "MISSING_API_KEY",
    "AUTH_FAILED",
    "RATE_LIMITED",
    "INVALID_INPUT",
    "TOOL_DISABLED",
    "FORECAST_UNAVAILABLE",
    "TARGET_NOT_FOUND",
    "UNSUPPORTED_TARGET",
}
NON_RETRYABLE_TEXT = {
    "MISSING_API_KEY": "외부 API 키가 서버에 없습니다.",
    "AUTH_FAILED": "외부 API 인증에 실패했습니다.",
    "RATE_LIMITED": "외부 API 호출 한도에 걸렸습니다.",
    "INVALID_INPUT": "Tool 입력이 명세와 맞지 않습니다.",
    "TOOL_DISABLED": "필요한 Tool이 설정에서 꺼져 있습니다.",
    "FORECAST_UNAVAILABLE": "요청한 날짜는 날씨 예보 범위를 벗어났습니다.",
    "TARGET_NOT_FOUND": "천문력에서 천체를 찾지 못했습니다.",
    "UNSUPPORTED_TARGET": "지원하지 않는 천체입니다.",
}


def constraint_values(constraints: dict) -> dict:
    return {
        key: item.get("value") if isinstance(item, dict) else item
        for key, item in constraints.items()
        if not str(key).startswith("_")
    }


def public_constraints(constraints: dict) -> dict:
    grouped = {"baseline": {}, "preference": {}, "constraint": {}, "empty": []}
    baseline = ("target_id", "date_start", "date_end", "preferred_time_start", "preferred_time_end")
    preference = ("search_region", "place_query")
    limits = ("max_travel_minutes", "min_altitude_deg", "max_cloud_cover_pct", "max_precipitation_probability_pct", "origin_name", "transport_mode")
    for name in (*baseline, *preference, *limits):
        value = read(constraints, name)
        bucket = "baseline" if name in baseline else "preference" if name in preference else "constraint"
        if value in (None, ""):
            grouped["empty"].append(name)
        else:
            grouped[bucket][name] = value
    return grouped


def _brief_args(arguments: dict) -> dict:
    """이벤트에는 인자를 짧게만 남긴다. 키나 긴 본문은 넣지 않는다."""
    return {key: (str(value)[:80] if value is not None else None) for key, value in (arguments or {}).items()}


class ToolRunner:
    def __init__(self, bus: EventBus | None = None, stage: str = "execute_tools"):
        self.cache: dict[str, dict] = {}
        self.http_calls: dict[str, int] = {}
        self.bus = bus
        self.stage = stage

    def call(self, name: str, arguments: dict) -> dict:
        spec = REGISTRY.get(name)
        provider = spec.provider if spec else "unknown"
        key = cache_key(provider, name, arguments)
        cached = self.cache.get(key)
        if cached is not None:
            if self.bus:
                self.bus.emit("tool_result_reused", self.stage, payload={"provider": provider}, tool_name=name)
            return cached
        if self.bus:
            self.bus.emit("tool_call_requested", self.stage, payload={"provider": provider, "arguments": _brief_args(arguments)}, tool_name=name)
        started = monotonic()
        result = run_tool(name, arguments)
        elapsed_ms = int((monotonic() - started) * 1000)
        self.http_calls[name] = self.http_calls.get(name, 0) + 1
        if self.bus:
            error = result.get("error") or {}
            self.bus.emit(
                "tool_call_completed",
                self.stage,
                payload={"provider": provider, "ok": bool(result.get("ok")), "error_code": error.get("code")},
                tool_name=name,
                duration_ms=elapsed_ms,
            )
        if result.get("ok"):
            self.cache[key] = result
        return result


def observation_bounds(values: dict, expanded_time: bool, date_offset: int) -> tuple[datetime, datetime, bool]:
    window = default_window()
    estimated = values.get("date_start") in (None, "")
    date_text = values.get("date_start") or window["date"]
    if date_offset:
        date_text = (datetime.fromisoformat(date_text) + timedelta(days=date_offset)).date().isoformat()
        estimated = True
    if expanded_time:
        start, end = local_bounds(date_text, "18:00", "06:00")
    else:
        start, end = local_bounds(date_text, values.get("preferred_time_start") or "", values.get("preferred_time_end") or "")
    return start, end, estimated or not values.get("preferred_time_start")


OBSERVATION_CHAIN = ["search_places", "get_place_details", "get_ephemeris", "get_weather"]


def normalize_tasks(raw_tasks: list[dict], values: dict) -> tuple[list[str] | None, str | None]:
    order = ["search_places", "get_place_details", "get_ephemeris", "get_weather", "get_route"]
    selected = []
    for task in raw_tasks:
        name = task.get("tool")
        if name not in REGISTRY:
            return None, "등록되지 않은 Tool입니다."
        if task.get("args", {}).get("place_id") or task.get("args", {}).get("latitude"):
            return None, "Tool 계획에 확인되지 않은 식별자나 좌표가 있습니다."
        if name not in selected:
            selected.append(name)
    # 관측 계획은 장소 식별 → 좌표 확인 → 천문·날씨 평가가 한 묶음이다. 모델이 일부만 고르면 후보를 평가할 수 없다.
    if any(name in selected for name in OBSERVATION_CHAIN):
        selected = selected + [name for name in OBSERVATION_CHAIN if name not in selected]
    if values.get("max_travel_minutes") is None:
        selected = [name for name in selected if name != "get_route"]
    off = disabled_tools()
    selected = [name for name in selected if name not in off]
    return [name for name in order if name in selected], None


def _unverified(detail: dict, check: dict, warning: str) -> dict:
    return {
        "candidate_id": detail.get("place_id"),
        "name": detail.get("name"),
        "address": detail.get("address"),
        "maps_url": detail.get("maps_url"),
        "latitude": detail.get("latitude"),
        "longitude": detail.get("longitude"),
        "status": "UNVERIFIED",
        "checks": [check],
        "warnings": [warning],
        "score": None,
        "observation_start": None,
        "observation_end": None,
        "source_refs": detail.get("source_refs") or [],
    }


def execute_names(names: list[str], values: dict, runner: ToolRunner, bounds: tuple[datetime, datetime],
                  query: str, targets: list[str]) -> dict:
    summaries = []
    places = []
    if "search_places" in names:
        found = runner.call("search_places", {
            "region": values["search_region"],
            "query": query,
            "limit": min(3, settings.place_limit),
            "date": bounds[0].date().isoformat(),
            "time_start": bounds[0].strftime("%H:%M"),
            "time_end": "24:00" if bounds[1].hour == 0 else bounds[1].strftime("%H:%M"),
        })
        summaries.append(_summary(found))
        if found.get("ok"):
            places = found["data"]["places"]
    details = []
    if "get_place_details" in names:
        for place in places:
            detail = runner.call("get_place_details", {"place_id": place["place_id"]})
            summaries.append(_summary(detail))
            if detail.get("ok"):
                details.append(detail["data"] | {"source_refs": [detail["source"]]})
    origin = None
    if values.get("max_travel_minutes") is not None and values.get("origin_lat") is None and values.get("origin_name"):
        origin_search = runner.call("search_places", {
            "region": values["origin_name"],
            "query": values["origin_name"],
            "limit": 3,
            "date": bounds[0].date().isoformat(),
            "time_start": "18:00",
            "time_end": "24:00",
        })
        summaries.append(_summary(origin_search))
        if origin_search.get("ok") and len(origin_search["data"]["places"]) == 1:
            origin_detail = runner.call("get_place_details", {"place_id": origin_search["data"]["places"][0]["place_id"]})
            summaries.append(_summary(origin_detail))
            if origin_detail.get("ok") and origin_detail["data"].get("latitude") is not None:
                origin = origin_detail["data"]
        elif origin_search.get("ok"):
            origin = {"ambiguous": [item["name"] for item in origin_search["data"]["places"]]}
    evaluations = []
    for detail in details:
        if detail.get("latitude") is None or detail.get("longitude") is None:
            evaluations.append(_unverified(
                detail,
                {"field": "coordinates", "value": None, "unit": "deg", "threshold": None, "status": "UNKNOWN"},
                "좌표가 없어 고도를 판단하지 않았습니다.",
            ))
            continue
        samples = []
        weather_hours = None
        route = None
        ephemeris_failed = False
        for target_id in targets:
            if "get_ephemeris" not in names:
                break
            sky = runner.call("get_ephemeris", {
                "target_id": target_id,
                "latitude": detail["latitude"],
                "longitude": detail["longitude"],
                "elevation_m": 0,
                "start_at": bounds[0].isoformat(),
                "end_at": bounds[1].isoformat(),
                "step_minutes": settings.step_minutes,
            })
            summaries.append(_summary(sky))
            if sky.get("ok"):
                samples = sky["data"]["samples"]
            else:
                ephemeris_failed = True
        if "get_weather" in names:
            weather = runner.call("get_weather", {
                "latitude": detail["latitude"],
                "longitude": detail["longitude"],
                "start_at": bounds[0].isoformat(),
                "end_at": bounds[1].isoformat(),
            })
            summaries.append(_summary(weather))
            weather_hours = weather["data"]["hours"] if weather.get("ok") else []
        if "get_route" in names and origin and origin.get("latitude") is not None:
            routed = runner.call("get_route", {
                "origin_lat": origin["latitude"],
                "origin_lon": origin["longitude"],
                "destination_lat": detail["latitude"],
                "destination_lon": detail["longitude"],
                "transport_mode": values.get("transport_mode") or "DRIVE",
            })
            summaries.append(_summary(routed))
            route = routed["data"] if routed.get("ok") else None
        if not samples:
            evaluations.append(_unverified(
                detail,
                {"field": "altitude", "value": None, "unit": "deg", "threshold": settings.min_altitude_deg, "status": "UNKNOWN"},
                "천체 고도를 확인하지 못했습니다." if ephemeris_failed else "천문력을 조회하지 않았습니다.",
            ))
            continue
        evaluations.append(evaluate_candidate(detail, samples, weather_hours, route, values))
    return {
        "summaries": summaries,
        "evaluations": rank_suitable(evaluations),
        "estimated_window": bounds[0].isoformat(),
        "origin_ambiguous": origin.get("ambiguous") if isinstance(origin, dict) else None,
    }


def _summary(result: dict) -> dict:
    if result.get("ok"):
        return {"tool": result["tool"], "ok": True, "error": None}
    return {"tool": result.get("tool"), "ok": False, "error": result.get("error")}


AXIS_TEXT = {"time": "시간대", "place": "검색 장소", "date": "날짜", "body": "천체", "target": "천체"}


def local_text(value) -> str:
    """UTC ISO 문자열이나 datetime을 서울 시각 문장으로 바꾼다. 읽지 못하면 원문을 그대로 쓴다."""
    try:
        moment = value if isinstance(value, datetime) else datetime.fromisoformat(str(value))
        if moment.tzinfo is None:
            return str(value)
        return moment.astimezone(TZ).strftime("%m월 %d일 %H:%M (KST)")
    except (TypeError, ValueError):
        return str(value)


def factual_message(evaluations: list[dict], estimated: bool, replan_count: int, reason: str | None) -> str:
    lines = []
    if estimated:
        lines.append("날짜 또는 시간창은 요청에 없어 추정값이며, 사용자 조건으로 고정하지 않았습니다.")
    if replan_count:
        lines.append(f"충족 후보가 없어 {replan_count}회 재계획했습니다. 마지막으로 바꾼 기준은 {AXIS_TEXT.get(reason or '', reason or '없음')}입니다.")
    suitable = [item for item in evaluations if item["status"] == "SUITABLE"]
    if suitable:
        best = suitable[0]
        lines.append(
            f"{best.get('name')}에서 {local_text(best.get('observation_start'))}부터 {local_text(best.get('observation_end'))}까지 확인된 조건을 충족합니다. "
            f"연속 {best.get('duration_minutes')}분, 점수 {best.get('score')}."
        )
        for check in best.get("checks") or []:
            lines.append(f"{check['field']}={check['value']} {check['unit']} 기준 {check['threshold']} {check['status']}")
    elif evaluations:
        lines.append("확인한 후보 중 필수 조건을 모두 충족한 장소는 없습니다.")
    else:
        lines.append("확인할 수 있는 장소 후보가 없습니다.")
    for item in evaluations:
        if item["status"] == "SUITABLE":
            continue
        failed = [check for check in item.get("checks") or [] if check["status"] in {"UNMET", "UNKNOWN"}]
        reason_text = ", ".join(f"{check['field']} {check['status']}" for check in failed)
        reason_text = reason_text or "; ".join(
            f"{row['field']} 기준 {row['threshold']}{row['unit']}을 맞춘 시각이 {row['total_samples'] - row['unmet_samples']}/{row['total_samples']}개"
            f"(가장 좋은 값 {round(row['best_value'], 1)}{row['unit']})"
            for row in item.get("unmet_summary") or []
        ) or " ".join(item.get("warnings") or [])
        lines.append(f"제외 또는 미확인: {item.get('name')} ({item['status']}) {reason_text}".strip())
    return "\n".join(lines)


def choose_axis(values: dict, expanded_time: bool, query_index: int, query_count: int, date_offset: int) -> str | None:
    """조건을 측정했지만 못 맞춘 경우에 바꿀 기준. 시간대 → 검색 장소 → 날짜(허용 시) → 천체(허용 시) 순이다."""
    if not expanded_time:
        return "time"
    if query_index < query_count - 1:
        return "place"
    if values.get("allow_other_date") and date_offset < 2:
        return "date"
    if values.get("allow_other_target"):
        return "target"
    return None


def date_is_user_locked(constraints: dict) -> bool:
    item = constraints.get("date_start")
    return isinstance(item, dict) and item.get("source") == "USER" and item.get("locked") and not read(constraints, "allow_other_date")


def failed_codes(summaries: list[dict]) -> list[str]:
    return sorted({(item.get("error") or {}).get("code") for item in summaries if not item.get("ok") and item.get("error")} - {None})


def replan_decision(execution: dict, replan_count: int, constraints: dict, progress: dict) -> dict:
    """재계획 여부. 충족 후보가 하나도 없고, 기준을 바꾸면 결과가 달라질 수 있을 때만 재계획한다."""
    evaluations = execution["evaluations"]
    codes = failed_codes(execution["summaries"])
    blocking = [code for code in codes if code in NON_RETRYABLE_CODES]
    if any(item["status"] == "SUITABLE" for item in evaluations):
        return {"action": "respond", "reason": "suitable"}
    if execution.get("origin_ambiguous"):
        return {"action": "ask_origin", "reason": "origin_ambiguous"}
    if replan_count >= settings.max_replans:
        return {"action": "respond", "reason": "limit", "codes": blocking}
    measured_unmet = any(item["status"] == "UNSUITABLE" for item in evaluations)
    values = {**constraint_values(constraints), "allow_other_date": read(constraints, "allow_other_date"), "allow_other_target": read(constraints, "allow_other_target")}
    if measured_unmet:
        axis = choose_axis(values, progress["expanded_time"], progress["query_index"], len(progress["queries"]), progress["date_offset"])
        if axis == "date" and date_is_user_locked(constraints):
            axis = None
        if axis is None:
            return {"action": "respond", "reason": "no_axis", "codes": blocking}
        return {"action": "replan", "reason": "unmet", "axis": axis}
    if blocking:
        return {"action": "respond", "reason": "non_retryable", "codes": blocking}
    if evaluations:
        return {"action": "respond", "reason": "unverified", "codes": codes}
    if "NO_RESULT" in codes and progress["query_index"] < len(progress["queries"]) - 1:
        return {"action": "replan", "reason": "no_candidate", "axis": "place"}
    return {"action": "respond", "reason": "no_candidate", "codes": codes}


Analyzer = Callable[[str, dict], dict]
Planner = Callable[[dict, str | None], dict]


def default_task_plan(values: dict, axis: str | None = None) -> dict:
    tasks = [
        {"tool": "search_places", "reason": "관측 장소 후보의 식별자를 확보한다."},
        {"tool": "get_place_details", "reason": "식별자로 이름, 주소, 지도 링크, 좌표를 확인한다."},
        {"tool": "get_ephemeris", "reason": "좌표에서 천체와 태양 고도를 확인한다."},
        {"tool": "get_weather", "reason": "같은 좌표의 구름량과 강수 확률을 확인한다."},
    ]
    if values.get("max_travel_minutes") is not None and "get_route" not in disabled_tools():
        tasks.append({"tool": "get_route", "reason": "제한된 이동시간을 실제 경로로 확인한다."})
    return {"ok": True, "data": {"tasks": tasks, "reason": axis or "초기 계획", "source": "default"}}


KNOWLEDGE_FAILURE_TEXT = {
    "NO_INDEX": "색인이 없어 지식 검색을 할 수 없습니다.",
    "NO_RESULT": "질문과 관련된 근거 문서를 찾지 못했습니다. 근거 없이 답하지 않습니다.",
    "KNOWLEDGE_UNAVAILABLE": "지식 검색 서버에 연결하지 못했습니다. 서버가 켜져 있는지 확인해 주세요.",
    "API_TIMEOUT": "지식 검색 시간이 초과되었습니다.",
    "EXTERNAL_API_ERROR": "지식 검색에 실패했습니다. 잠시 뒤 다시 시도해 주세요.",
}


def _missing_analyzer(message: str, constraints: dict) -> dict:
    return {"ok": False, "error": {"code": "MISSING_API_KEY", "message": "서버 LLM 설정이 없어 요청을 분석하지 못했습니다."}}


def _result(state: str, constraints: dict, message: str, **extra) -> dict:
    constraints = dict(constraints)
    question_count = constraints.pop("_question_count", 0)
    context = extra.pop("context", None) or {"constraints": constraints, "question_count": question_count, "intent": extra.get("intent")}
    context["constraints"] = {key: value for key, value in constraints.items() if key != "_question_count"}
    context["question_count"] = question_count
    context["last_conclusion"] = message.split("\n", 1)[0][:500]
    return {
        "state": state,
        "message": message,
        "constraints": public_constraints(constraints),
        "raw_constraints": constraints,
        "missing_fields": extra.get("missing") or [],
        "intent": extra.get("intent"),
        "tasks": extra.get("tasks") or [],
        "tool_summaries": extra.get("tool_summaries") or [],
        "candidates": extra.get("evaluations") or [],
        "final_plan": extra.get("final_plan"),
        "replanned": extra.get("replanned", False),
        "replan_count": extra.get("replan_count", 0),
        "errors": [item for item in extra.get("errors") or [] if item],
        "http_calls": extra.get("http_calls") or {},
        "estimated": extra.get("estimated", False),
        "sources": extra.get("sources") or [],
        "context": context,
    }


# ---------------------------------------------------------------------------
# LangGraph
# ---------------------------------------------------------------------------

class PlannerState(TypedDict, total=False):
    message: str
    context: dict
    selected_target_id: str | None
    constraints: dict
    question_count: int
    intent: str
    gate: dict
    tasks: list[str]
    queries: list[str]
    query_index: int
    expanded_time: bool
    date_offset: int
    targets: list[str]
    replan_count: int
    replan_axis: str | None
    bounds: tuple
    execution: dict
    decision: dict
    outcome: dict
    path: Annotated[list[str], operator.add]


@dataclass
class PlannerContext:
    bus: EventBus
    analyzer: Analyzer
    task_planner: Planner
    started: float = dataclass_field(default_factory=monotonic)
    runner: ToolRunner | None = None

    def __post_init__(self):
        if self.runner is None:
            self.runner = ToolRunner(self.bus)


def _fail(state: PlannerState, message: str, error: dict | None = None, **extra) -> dict:
    return _result("FAILED", state["constraints"], message, errors=[error] if error else [], intent=state.get("intent"), **extra)


def analyze_request(state: PlannerState, runtime: Runtime[PlannerContext]) -> dict:
    bus = runtime.context.bus
    context = state.get("context") or {}
    constraints = dict(context.get("constraints") or {})
    question_count = int(context.get("question_count") or 0)
    constraints["_question_count"] = question_count
    selected = state.get("selected_target_id")
    if selected and read(constraints, "target_id") in (None, ""):
        target = resolve_target(selected)
        if target is not None:
            constraints = merge_constraints(constraints, {"target_id": target.target_id}, "UI")
            if constraints.get("target_id"):
                constraints["target_id"]["locked"] = False
                constraints["target_id"]["source"] = "UI"
    bus.emit("stage_entered", "analyze_request")
    analyzer = runtime.context.analyzer or _missing_analyzer
    analysis = analyzer(state["message"], public_constraints(constraints))
    if not analysis.get("ok"):
        error = analysis.get("error") or {}
        bus.emit("stage_exited", "analyze_request", payload={"error": error})
        bus.emit("execution_failed", "analyze_request", payload=error)
        outcome = _result("FAILED", constraints, error.get("message", "요청을 분석하지 못했습니다."), errors=[error])
        return {"constraints": constraints, "question_count": question_count, "outcome": outcome, "path": ["analyze_request"]}
    data = analysis["data"]
    intent = data.get("intent") or "plan_observation"
    reason = data.get("reason") or ""
    bus.emit("stage_exited", "analyze_request", payload={"intent": intent, "reason": reason})
    bus.emit("intent_analyzed", "analyze_request", payload={"intent": intent, "reason": reason})
    updates = {key: data.get(key) for key in (
        "target_id", "date_start", "date_end", "preferred_time_start", "preferred_time_end", "search_region",
        "origin_name", "origin_lat", "origin_lon", "transport_mode", "max_travel_minutes", "min_altitude_deg",
        "max_cloud_cover_pct", "max_precipitation_probability_pct", "place_query", "allow_other_date", "allow_other_target",
    ) if data.get(key) is not None}
    if updates.get("target_id"):
        resolved = resolve_target(str(updates["target_id"]))
        updates["target_id"] = resolved.target_id if resolved else updates["target_id"]
    constraints = merge_constraints(constraints, updates, "USER")
    stop = bool(data.get("stop_questions")) or any(phrase in state["message"] for phrase in ("모르겠어", "그만 물어", "현재 조건으로"))
    return {
        "constraints": constraints,
        "question_count": question_count,
        "intent": intent,
        "gate": {"stop_questions": stop, "knowledge_target": data.get("target_id")},
        "path": ["analyze_request"],
    }


def validate_information(state: PlannerState, runtime: Runtime[PlannerContext]) -> dict:
    bus = runtime.context.bus
    constraints = state["constraints"]
    intent = state["intent"]
    bus.emit("stage_entered", "validate_information")
    gate = next_question(intent, constraints, state["question_count"], settings.max_questions, state["gate"]["stop_questions"])
    gate = {**state["gate"], **gate}
    update: dict[str, Any] = {"gate": gate, "path": ["validate_information"]}
    if gate.get("blocked"):
        bus.emit("stage_exited", "validate_information", payload={"result": "blocked", "missing": gate.get("missing") or []})
        update["outcome"] = _fail(state, gate.get("question") or "계획을 만들 수 없습니다.", missing=gate.get("missing") or [])
        return update
    target_id = read(constraints, "target_id")
    if intent not in ("help", "ask_knowledge") and not gate.get("ask") and target_id:
        target = resolve_target(str(target_id))
        if target is None or not target.supported:
            text = target.unsupported_reason if target else "지원하지 않는 천체입니다."
            bus.emit("stage_exited", "validate_information", payload={"result": "unsupported_target"})
            update["outcome"] = _fail(state, text, {"code": "UNSUPPORTED_TARGET", "message": text})
            return update
    bus.emit("stage_exited", "validate_information", payload={"result": "ask" if gate.get("ask") else "ok"})
    return update


def ask_clarification(state: PlannerState, runtime: Runtime[PlannerContext]) -> dict:
    gate = state["gate"]
    constraints = dict(state["constraints"])
    question_count = state["question_count"] + 1
    constraints["_question_count"] = question_count
    runtime.context.bus.emit("information_required", "validate_information", payload={"field": gate.get("field")})
    context_out = {"constraints": constraints, "question_count": question_count, "intent": state["intent"]}
    outcome = _result("WAITING_USER", constraints, gate["question"], missing=gate.get("missing") or [], context=context_out, intent=state["intent"])
    return {"outcome": outcome, "path": ["ask_clarification"]}


def plan_tasks(state: PlannerState, runtime: Runtime[PlannerContext]) -> dict:
    bus = runtime.context.bus
    bus.emit("stage_entered", "plan_tasks")
    if state["intent"] == "ask_knowledge":
        names = ["search_knowledge"]
        bus.emit("task_plan_created", "plan_tasks", payload={"tasks": names, "reason": "외부 장소·날씨·천문력 API로 확인할 수 없는 지식 질문", "source": "rule"})
        bus.emit("stage_exited", "plan_tasks")
        return {"tasks": names, "path": ["plan_tasks"]}
    values = constraint_values(state["constraints"])
    planned = runtime.context.task_planner(values, None)
    if not planned.get("ok"):
        error = planned.get("error") or {}
        bus.emit("execution_failed", "plan_tasks", payload=error)
        return {"outcome": _fail(state, error.get("message", "작업 계획을 만들지 못했습니다."), error), "path": ["plan_tasks"]}
    names, error_text = normalize_tasks(planned["data"].get("tasks") or [], values)
    if error_text or not names:
        bus.emit("execution_failed", "plan_tasks", payload={"code": "INVALID_PLAN", "message": error_text or "실행할 Tool이 없습니다."})
        return {"outcome": _fail(state, error_text or "실행할 Tool이 없습니다."), "path": ["plan_tasks"]}
    bus.emit("task_plan_created", "plan_tasks", payload={"tasks": names, "reason": planned["data"].get("reason"), "source": planned["data"].get("source", "llm")})
    bus.emit("stage_exited", "plan_tasks")
    place_query = values.get("place_query")
    queries = [place_query, *PLACE_QUERIES] if place_query and place_query not in PLACE_QUERIES else list(PLACE_QUERIES)
    return {
        "tasks": names,
        "queries": queries,
        "query_index": PLACE_QUERIES.index(place_query) if place_query in PLACE_QUERIES else 0,
        "expanded_time": False,
        "date_offset": 0,
        "targets": [values["target_id"]] if values.get("target_id") else list(PRIORITY_DISCOVERY),
        "replan_count": 0,
        "replan_axis": None,
        "path": ["plan_tasks"],
    }


def execute_tools(state: PlannerState, runtime: Runtime[PlannerContext]) -> dict:
    bus = runtime.context.bus
    runner = runtime.context.runner
    if monotonic() > runtime.context.started + settings.total_budget_sec:
        evaluations = (state.get("execution") or {}).get("evaluations") or []
        outcome = _fail(state, "처리 시간 상한에 도달했습니다.", {"code": "API_TIMEOUT", "message": "처리 시간 상한"},
                        evaluations=evaluations, replan_count=state.get("replan_count", 0))
        bus.emit("execution_failed", "execute_tools", payload={"code": "API_TIMEOUT"})
        return {"outcome": outcome, "path": ["execute_tools"]}
    bus.emit("stage_entered", "execute_tools")
    if state["intent"] == "ask_knowledge":
        args = {"question": state["message"]}
        if state["gate"].get("knowledge_target"):
            args["target_id"] = state["gate"]["knowledge_target"]
        result = runner.call("search_knowledge", args)
        execution = {"summaries": [_summary(result)], "evaluations": [], "knowledge": result}
        bus.emit("stage_exited", "execute_tools", payload={"http_calls": dict(runner.http_calls)})
        return {"execution": execution, "path": ["execute_tools"]}
    values = constraint_values(state["constraints"])
    bounds = observation_bounds(values, state["expanded_time"], state["date_offset"])
    execution = execute_names(state["tasks"], values, runner, (bounds[0], bounds[1]), state["queries"][state["query_index"]], state["targets"])
    bus.emit("stage_exited", "execute_tools", payload={"http_calls": dict(runner.http_calls)})
    return {"execution": execution, "bounds": bounds, "path": ["execute_tools"]}


def evaluate_candidates(state: PlannerState, runtime: Runtime[PlannerContext]) -> dict:
    bus = runtime.context.bus
    execution = state["execution"]
    progress = {key: state[key] for key in ("expanded_time", "query_index", "queries", "date_offset")}
    decision = replan_decision(execution, state["replan_count"], state["constraints"], progress)
    bus.emit("candidate_evaluated", "evaluate_candidates", payload={
        "statuses": [item["status"] for item in execution["evaluations"]],
        "decision": decision["action"],
        "reason": decision["reason"],
    })
    update: dict[str, Any] = {"decision": decision, "path": ["evaluate_candidates"]}
    if decision["action"] == "respond" and decision["reason"] in ("non_retryable", "unverified", "no_candidate"):
        bus.emit("replan_skipped", "evaluate_candidates", payload={"reason": decision["reason"], "codes": decision.get("codes") or []})
    if decision["action"] == "ask_origin":
        text = "출발 후보가 여러 곳입니다. " + ", ".join(execution["origin_ambiguous"])
        update["outcome"] = _result("WAITING_USER", state["constraints"], text, intent=state["intent"], tool_summaries=execution["summaries"])
    return update


def replan_tasks(state: PlannerState, runtime: Runtime[PlannerContext]) -> dict:
    bus = runtime.context.bus
    decision = state["decision"]
    axis = decision["axis"]
    count = state["replan_count"] + 1
    reason = "후보를 찾지 못했습니다." if decision["reason"] == "no_candidate" else "충족 후보가 없습니다."
    bus.emit("replan_started", "replan_tasks", payload={"replan_count": count, "axis": axis, "reason": reason})
    update: dict[str, Any] = {"replan_count": count, "replan_axis": axis, "path": ["replan_tasks"]}
    if axis == "time":
        update["expanded_time"] = True
    elif axis == "place":
        update["query_index"] = state["query_index"] + 1
    elif axis == "date":
        update["date_offset"] = state["date_offset"] + 1
    elif axis == "target":
        update["targets"] = state["targets"][1:] or state["targets"]
    bus.emit("replan_completed", "replan_tasks", payload={"replan_count": count, "axis": axis})
    return update


def _respond_knowledge(state: PlannerState, bus: EventBus) -> dict:
    """외부 API로 확인할 수 없는 천체 지식 질문. 색인에서 찾은 근거와 출처만 보여 주고 문장을 지어내지 않는다."""
    result = state["execution"]["knowledge"]
    summaries = state["execution"]["summaries"]
    common = {"intent": state["intent"], "tasks": ["search_knowledge"], "tool_summaries": summaries}
    if not result.get("ok"):
        error = result.get("error") or {}
        text = KNOWLEDGE_FAILURE_TEXT.get(error.get("code"), error.get("message") or "지식 검색에 실패했습니다.")
        bus.emit("response_ready", "generate_response", payload={"replan_count": 0, "has_plan": False})
        return _result("COMPLETED", state["constraints"], text, errors=[error], sources=[], **common)
    sources = result["data"]["sources"]
    lines = ["색인된 문서에서 찾은 근거입니다. 아래는 문서 발췌이며 요약하거나 내용을 보태지 않았습니다."]
    for source in sources[:3]:
        label = " / ".join(part for part in (source.get("title"), source.get("section")) if part) or source.get("item_name") or "문서"
        lines.append(f"[{source['rank']}] {label}\n{source.get('snippet') or ''}")
    bus.emit("response_ready", "generate_response", payload={"replan_count": 0, "has_plan": False, "source_count": len(sources)})
    return _result("COMPLETED", state["constraints"], "\n\n".join(lines), sources=sources, **common)


def _respond_observation(state: PlannerState, runner: ToolRunner, bus: EventBus) -> dict:
    execution = state["execution"]
    decision = state["decision"]
    values = constraint_values(state["constraints"])
    replan_count = state["replan_count"]
    bounds = state["bounds"]
    final_plan = next((item for item in execution["evaluations"] if item["status"] == "SUITABLE"), None)
    lines = [factual_message(execution["evaluations"], bounds[2], replan_count, state.get("replan_axis"))]
    codes = decision.get("codes") or []
    if final_plan is None:
        if decision["reason"] == "limit":
            lines.append(f"재계획 상한 {settings.max_replans}회에 도달해 멈췄습니다.")
        elif decision["reason"] == "no_axis":
            lines.append("더 바꿀 수 있는 검색 기준이 없어 멈췄습니다.")
        elif decision["reason"] == "non_retryable":
            reasons = " ".join(NON_RETRYABLE_TEXT.get(code, code) for code in codes)
            lines.append(f"다시 시도해도 결과가 같은 오류라 재계획하지 않았습니다. {reasons}")
        elif decision["reason"] == "unverified":
            lines.append("일부 조건을 확인하지 못해 판정을 보류했습니다. 같은 Tool이 다시 실패할 수 있어 기준을 바꿔 재계획하지 않았습니다.")
        elif decision["reason"] == "no_candidate":
            lines.append("조건에 맞는 관측 장소 후보를 찾지 못했습니다.")
    if values.get("max_travel_minutes") is not None and "get_route" in disabled_tools():
        lines.append("이동시간 조회가 꺼져 있어 이동시간 제한은 확인하지 못했습니다. 이동시간 값을 추정하지 않았습니다.")
    errors = [item["error"] for item in execution["summaries"] if not item["ok"] and (item.get("error") or {}).get("code") in NON_RETRYABLE_CODES]
    unique_errors = list({error["code"]: error for error in errors}.values())
    bus.emit("response_ready", "generate_response", payload={"replan_count": replan_count, "has_plan": final_plan is not None})
    return _result(
        "COMPLETED",
        state["constraints"],
        "\n".join(lines),
        intent=state["intent"],
        tasks=state["tasks"],
        tool_summaries=execution["summaries"],
        evaluations=execution["evaluations"],
        final_plan=final_plan,
        replan_count=replan_count,
        replanned=replan_count > 0,
        http_calls=runner.http_calls,
        estimated=bounds[2],
        errors=unique_errors,
    )


def generate_response(state: PlannerState, runtime: Runtime[PlannerContext]) -> dict:
    bus = runtime.context.bus
    bus.emit("stage_entered", "generate_response")
    if state["intent"] == "help":
        bus.emit("response_ready", "generate_response", payload={"replan_count": 0, "has_plan": False, "tools": 0})
        outcome = _result("COMPLETED", state["constraints"], HELP_TEXT, intent="help", tasks=[])
    elif state["intent"] == "ask_knowledge":
        outcome = _respond_knowledge(state, bus)
    else:
        outcome = _respond_observation(state, runtime.context.runner, bus)
    return {"outcome": outcome, "path": ["generate_response"]}


def _after_analyze(state: PlannerState) -> str:
    return END if state.get("outcome") else "validate_information"


def _after_validate(state: PlannerState) -> str:
    if state.get("outcome"):
        return END
    if state["gate"].get("ask"):
        return "ask_clarification"
    if state["intent"] == "help":
        return "generate_response"
    return "plan_tasks"


def _after_plan(state: PlannerState) -> str:
    return END if state.get("outcome") else "execute_tools"


def _after_execute(state: PlannerState) -> str:
    if state.get("outcome"):
        return END
    return "generate_response" if state["intent"] == "ask_knowledge" else "evaluate_candidates"


def _after_evaluate(state: PlannerState) -> str:
    if state.get("outcome"):
        return END
    return "replan_tasks" if state["decision"]["action"] == "replan" else "generate_response"


NODES = {
    "analyze_request": analyze_request,
    "validate_information": validate_information,
    "ask_clarification": ask_clarification,
    "plan_tasks": plan_tasks,
    "execute_tools": execute_tools,
    "evaluate_candidates": evaluate_candidates,
    "replan_tasks": replan_tasks,
    "generate_response": generate_response,
}


def graph_node_names() -> list[str]:
    return list(NODES)


def build_graph():
    graph = StateGraph(PlannerState, context_schema=PlannerContext)
    for name, node in NODES.items():
        graph.add_node(name, node)
    graph.add_edge(START, "analyze_request")
    graph.add_conditional_edges("analyze_request", _after_analyze, ["validate_information", END])
    graph.add_conditional_edges("validate_information", _after_validate, ["ask_clarification", "plan_tasks", "generate_response", END])
    graph.add_edge("ask_clarification", END)
    graph.add_conditional_edges("plan_tasks", _after_plan, ["execute_tools", END])
    graph.add_conditional_edges("execute_tools", _after_execute, ["evaluate_candidates", "generate_response", END])
    graph.add_conditional_edges("evaluate_candidates", _after_evaluate, ["replan_tasks", "generate_response", END])
    graph.add_edge("replan_tasks", "execute_tools")
    graph.add_edge("generate_response", END)
    return graph.compile()


PLANNER_GRAPH = build_graph()


def invoke_graph(message: str, context: dict, bus: EventBus, analyzer: Analyzer, task_planner: Planner,
                 selected_target_id: str | None = None) -> dict:
    state = PLANNER_GRAPH.invoke(
        {"message": message, "context": context, "selected_target_id": selected_target_id, "path": []},
        context=PlannerContext(bus=bus, analyzer=analyzer, task_planner=task_planner),
    )
    outcome = state["outcome"]
    outcome["graph_path"] = state.get("path") or []
    return outcome
