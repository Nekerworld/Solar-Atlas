"""관측 플래너 HTTP API. 대화, 계획, 로그는 서로 다른 경로다."""
from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

import app.engine as planner_engine
from app.config import settings
from app.engine import default_task_plan, invoke_graph
from app.llm import gms_analyze, gms_plan
from app.logging_agent import EventBus, LoggingAgent
from app.models import Conversation, ExecutionEvent, Message, ObservationPlan, ProcessedRequest, init_database, make_engine, make_session_factory
from app.schemas import (
    ConversationOut,
    DeletedOut,
    EventListOut,
    HealthOut,
    LogSessionsOut,
    MessageIn,
    MessageOut,
    PlanIn,
    PlanListOut,
    PlanOut,
    PlanSaveOut,
    SkyBodiesOut,
    SkyIn,
    SkyOrbitOut,
    SkyOut,
    TargetListOut,
)
from app.sky import build_sky
from app.sky_bodies import build_sky_bodies, build_sky_orbit
from app.targets import public_targets, resolve_target

engine = make_engine()
init_database(engine)
Session = make_session_factory(engine)

app = FastAPI(title="Solar Atlas Planner", version="3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_methods=["*"],
    allow_headers=["*"],
)


def _analyzer(message: str, constraints: dict) -> dict:
    if settings.llm_mode == "script":
        return _scripted(message)
    return gms_analyze(message, constraints)


def _planner(values: dict, axis: str | None) -> dict:
    if settings.llm_mode == "script" or not settings.gms_key:
        return default_task_plan(values, axis)
    planned = gms_plan(values, axis)
    return planned if planned.get("ok") else default_task_plan(values, axis)


def _scripted(message: str) -> dict:
    if any(word in message for word in ("사용법", "어떻게", "안녕")):
        return {"ok": True, "data": {"intent": "help", "reason": "도구가 필요 없는 안내 요청"}}
    knowledge_words = ("얼마나", "왜 ", "무엇", "뭐야", "설명", "원인", "크기", "질량", "온도", "위성이")
    planning_words = ("보고 싶", "관측", "계획", "봐 줘", "보러")
    if any(word in message for word in knowledge_words) and not any(word in message for word in planning_words):
        data = {"intent": "ask_knowledge", "reason": "외부 API로 확인할 수 없는 천체 지식 질문"}
        for target in public_targets():
            if target["display_name"] in message or (target["frontend_name"] or "") in message:
                data["target_id"] = target["target_id"]
                break
        return {"ok": True, "data": data}
    data = {"intent": "plan_observation", "reason": "관측 계획 요청"}
    for target in public_targets():
        if target["display_name"] in message or (target["frontend_name"] or "") in message:
            data["target_id"] = target["target_id"]
            break
    for region in ("서울숲", "남산", "서울", "강남", "집"):
        if region in message:
            data["search_region"] = region
            data["place_query"] = region
            break
    if "80도" in message or "80도" in message.replace(" ", ""):
        data["min_altitude_deg"] = 80
    if "구름 0" in message:
        data["max_cloud_cover_pct"] = 0
    if "이동 10분" in message:
        data["max_travel_minutes"] = 10
        data["origin_name"] = "집"
    if "다른 날짜" in message:
        data["allow_other_date"] = True
    return {"ok": True, "data": data}


def _plan_dict(row: ObservationPlan) -> dict:
    return {
        "id": row.id,
        "target_id": row.target_id,
        "target_name": row.target_name,
        "place_id": row.place_id,
        "place_name": row.place_name,
        "latitude": row.latitude,
        "longitude": row.longitude,
        "start_at": row.start_at.isoformat(),
        "end_at": row.end_at.isoformat(),
        "status": row.status,
        "created_at": row.created_at.isoformat(),
        "updated_at": row.updated_at.isoformat(),
    }


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _overlaps(session, row: ObservationPlan) -> list[str]:
    start = _as_utc(row.start_at)
    end = _as_utc(row.end_at)
    others = session.query(ObservationPlan).filter(ObservationPlan.id != row.id).all()
    hits = []
    for other in others:
        other_start = _as_utc(other.start_at)
        other_end = _as_utc(other.end_at)
        if other_start.astimezone(timezone.utc).date() != start.date() and other_start.date() != start.date():
            continue
        if start < other_end and other_start < end:
            hits.append(other.id)
    return hits


@app.get("/health", response_model=HealthOut)
def health():
    return {"status": "ok", "service": "planner"}


@app.get("/api/targets", response_model=TargetListOut)
def targets():
    return {"items": public_targets()}


@app.post("/api/sky", response_model=SkyOut)
def sky(body: SkyIn):
    result = build_sky(body.time, body.latitude, body.longitude, body.elevation_m, body.until, body.place_query, body.target_id, body.purpose)
    if not result["ok"] and result.get("error", {}).get("code") == "INVALID_INPUT":
        raise HTTPException(status_code=422, detail=result["error"]["message"])
    return result


@app.get("/api/sky/bodies", response_model=SkyBodiesOut)
def sky_bodies(start: datetime, hours: float = 720, step_minutes: int = 120):
    """천구에 올릴 태양계 천체(위성·왜소행성·소행성·혜성·탐사선)의 적경·적위 표(JPL Horizons)."""
    result = build_sky_bodies(start, hours, step_minutes)
    if not result["ok"] and result["error"]["code"] == "INVALID_INPUT":
        raise HTTPException(status_code=422, detail=result["error"]["message"])
    return result


@app.get("/api/sky/orbit", response_model=SkyOrbitOut)
def sky_orbit(body: str, epoch: datetime):
    """한 천체의 궤도선(타원, xyz AU). 위성은 모행성, 나머지는 태양 중심."""
    result = build_sky_orbit(body, epoch)
    if not result["ok"]:
        code = result["error"]["code"]
        if code == "INVALID_INPUT":
            raise HTTPException(status_code=422, detail=result["error"]["message"])
        if code == "TARGET_NOT_FOUND":
            raise HTTPException(status_code=404, detail=result["error"]["message"])
    return result


@app.post("/api/conversations", response_model=ConversationOut)
def create_conversation():
    with Session() as session:
        row = Conversation()
        session.add(row)
        session.commit()
        return {"id": row.id}


@app.post("/api/conversations/{conversation_id}/messages", response_model=MessageOut)
def post_message(conversation_id: str, body: MessageIn):
    with Session() as session:
        conversation = session.get(Conversation, conversation_id)
        if conversation is None:
            raise HTTPException(404, "대화를 찾을 수 없습니다.")
        existing = session.get(ProcessedRequest, body.request_id)
        if existing:
            if existing.conversation_id != conversation_id:
                raise HTTPException(409, "같은 요청 ID를 다른 대화에 사용할 수 없습니다.")
            return json.loads(existing.response_json)
        context = json.loads(conversation.context_json or "{}")
        bus = EventBus()
        logger = LoggingAgent(Session, conversation_id)
        bus.subscribe(logger.handle)
        session.add(Message(conversation_id=conversation_id, role="user", content=body.text))
        session.commit()
        outcome = invoke_graph(body.text, context, bus, _analyzer, _planner, body.selected_target_id)
        conversation.context_json = json.dumps(outcome["context"], ensure_ascii=False, default=str)
        conversation.current_state = outcome["state"]
        session.add(Message(conversation_id=conversation_id, role="assistant", content=outcome["message"], structured_data_json=json.dumps({
            "intent": outcome.get("intent"),
            "candidates": outcome.get("candidates"),
            "replan_count": outcome.get("replan_count"),
        }, ensure_ascii=False, default=str)))
        response = {
            "request_id": body.request_id,
            "conversation_id": conversation_id,
            "state": outcome["state"],
            "message": outcome["message"],
            "intent": outcome.get("intent"),
            "constraints": outcome.get("constraints"),
            "tasks": outcome.get("tasks"),
            "tool_summaries": outcome.get("tool_summaries"),
            "candidates": outcome.get("candidates"),
            "final_plan": outcome.get("final_plan"),
            "replan_count": outcome.get("replan_count"),
            "replanned": outcome.get("replanned"),
            "errors": outcome.get("errors"),
            "sources": outcome.get("sources") or [],
            "graph_path": outcome.get("graph_path") or [],
            "events": bus.events,
        }
        session.add(ProcessedRequest(request_id=body.request_id, conversation_id=conversation_id, response_json=json.dumps(response, ensure_ascii=False, default=str)))
        session.commit()
        return response


@app.get("/api/conversations/{conversation_id}/events", response_model=EventListOut)
def list_events(conversation_id: str):
    with Session() as session:
        rows = session.query(ExecutionEvent).filter(ExecutionEvent.session_id == conversation_id).order_by(ExecutionEvent.sequence).all()
        return {"session_id": conversation_id, "events": [_event(row) for row in rows]}


@app.get(
    "/api/conversations/{conversation_id}/events/stream",
    response_class=StreamingResponse,
    responses={200: {"description": "저장된 실행 이벤트를 `event: log` SSE로 보낸다. data는 EventOut과 같은 JSON이다.", "content": {"text/event-stream": {}}}},
)
def stream_events(conversation_id: str):
    with Session() as session:
        rows = session.query(ExecutionEvent).filter(ExecutionEvent.session_id == conversation_id).order_by(ExecutionEvent.sequence).all()
        payload = [_event(row) for row in rows]

    def generate():
        for event in payload:
            yield "event: log\ndata: " + json.dumps(event, ensure_ascii=False) + "\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


def _resolve_place(name: str) -> dict | None:
    """장소 이름으로 Places(search_places → get_place_details)에서 장소 ID와 좌표를 찾는다. 못 찾으면 None(추정하지 않는다)."""
    if not name or not name.strip():
        return None
    found = planner_engine.run_tool("search_places", {"region": "대한민국", "query": name.strip(), "limit": 1})
    places = (found.get("data") or {}).get("places") if found.get("ok") else None
    if not places:
        return None
    detail = planner_engine.run_tool("get_place_details", {"place_id": places[0]["place_id"]})
    data = detail.get("data") if detail.get("ok") else None
    if not data or data.get("latitude") is None or data.get("longitude") is None:
        return None
    return {"place_id": data.get("place_id") or places[0]["place_id"], "latitude": data["latitude"], "longitude": data["longitude"]}


def _with_coordinates(body: PlanIn) -> PlanIn:
    """좌표 없이 장소 이름만 온 계획(직접 저장 등)에 장소의 좌표를 채운다. 이미 좌표가 있으면 그대로 둔다."""
    if body.latitude is not None and body.longitude is not None:
        return body
    place = _resolve_place(body.place_name)
    if place is None:
        return body
    return body.model_copy(update={"place_id": body.place_id or place["place_id"], "latitude": place["latitude"], "longitude": place["longitude"]})


@app.get("/api/plans", response_model=PlanListOut)
def list_plans():
    with Session() as session:
        rows = session.query(ObservationPlan).order_by(ObservationPlan.created_at.desc()).all()
        return {"items": [_plan_dict(row) for row in rows]}


@app.get("/api/plans/{plan_id}", response_model=PlanOut)
def get_plan(plan_id: str):
    with Session() as session:
        row = session.get(ObservationPlan, plan_id)
        if row is None:
            raise HTTPException(404, "계획을 찾을 수 없습니다.")
        return _plan_dict(row)


@app.post("/api/plans", response_model=PlanSaveOut)
def create_plan(body: PlanIn):
    body = _with_coordinates(body)
    target = resolve_target(body.target_id)
    if target is None:
        raise HTTPException(422, "지원 목록에 없는 천체입니다.")
    if body.end_at <= body.start_at:
        raise HTTPException(422, "종료 시각은 시작 시각보다 뒤여야 합니다.")
    with Session() as session:
        row = ObservationPlan(
            target_id=target.target_id,
            target_name=target.display_name,
            place_id=body.place_id,
            place_name=body.place_name,
            latitude=body.latitude,
            longitude=body.longitude,
            start_at=body.start_at if body.start_at.tzinfo else body.start_at.replace(tzinfo=timezone.utc),
            end_at=body.end_at if body.end_at.tzinfo else body.end_at.replace(tzinfo=timezone.utc),
            status=body.status,
            evaluation_json=json.dumps({"summary": body.summary}, ensure_ascii=False),
        )
        session.add(row)
        session.flush()
        warnings = [{"code": "OVERLAP", "plan_ids": _overlaps(session, row)}] if _overlaps(session, row) else []
        session.commit()
        return {"plan": _plan_dict(row), "warnings": warnings}


@app.patch("/api/plans/{plan_id}", response_model=PlanSaveOut)
def update_plan(plan_id: str, body: PlanIn):
    body = _with_coordinates(body)
    with Session() as session:
        row = session.get(ObservationPlan, plan_id)
        if row is None:
            raise HTTPException(404, "계획을 찾을 수 없습니다.")
        target = resolve_target(body.target_id)
        if target is None:
            raise HTTPException(422, "지원 목록에 없는 천체입니다.")
        row.target_id = target.target_id
        row.target_name = target.display_name
        row.place_name = body.place_name
        row.place_id = body.place_id
        row.latitude = body.latitude
        row.longitude = body.longitude
        row.start_at = body.start_at if body.start_at.tzinfo else body.start_at.replace(tzinfo=timezone.utc)
        row.end_at = body.end_at if body.end_at.tzinfo else body.end_at.replace(tzinfo=timezone.utc)
        row.status = body.status
        row.updated_at = datetime.now(timezone.utc)
        warnings = [{"code": "OVERLAP", "plan_ids": _overlaps(session, row)}] if _overlaps(session, row) else []
        session.commit()
        return {"plan": _plan_dict(row), "warnings": warnings}


@app.delete("/api/plans/{plan_id}", response_model=DeletedOut)
def delete_plan(plan_id: str):
    with Session() as session:
        row = session.get(ObservationPlan, plan_id)
        if row is None:
            raise HTTPException(404, "계획을 찾을 수 없습니다.")
        session.delete(row)
        session.commit()
        return {"deleted": plan_id}


@app.get("/api/logs/sessions", response_model=LogSessionsOut)
def log_sessions():
    with Session() as session:
        rows = session.query(ExecutionEvent.session_id).distinct().all()
        return {"sessions": [row[0] for row in rows]}


@app.get("/api/logs/sessions/{session_id}", response_model=EventListOut)
def log_detail(session_id: str):
    return list_events(session_id)


@app.delete("/api/logs/sessions/{session_id}", response_model=DeletedOut)
def delete_log(session_id: str):
    with Session() as session:
        session.query(ExecutionEvent).filter(ExecutionEvent.session_id == session_id).delete()
        session.commit()
        return {"deleted": session_id}


def _event(row: ExecutionEvent) -> dict:
    return {
        "sequence": row.sequence,
        "type": row.event_type,
        "stage": row.stage,
        "tool_name": row.tool_name,
        "payload": json.loads(row.payload_json or "{}"),
        "duration_ms": row.duration_ms,
        "created_at": row.created_at.isoformat(),
    }
