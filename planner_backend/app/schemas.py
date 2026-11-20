"""플래너 HTTP 요청·응답 모델. OpenAPI 문서와 입출력 검증이 같은 정의를 쓴다."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

RunState = Literal["COMPLETED", "WAITING_USER", "FAILED"]
CandidateStatus = Literal["SUITABLE", "UNSUITABLE", "UNVERIFIED"]


class MessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    request_id: str = Field(default_factory=lambda: str(uuid.uuid4()), description="같은 값으로 다시 보내면 다시 실행하지 않고 저장된 응답을 돌려준다.")
    selected_target_id: str | None = None


class SkyIn(BaseModel):
    time: datetime
    latitude: float | None = None
    longitude: float | None = None
    elevation_m: float = 0
    until: datetime | None = None
    place_query: str | None = None
    target_id: str | None = None
    purpose: str = "sky"


class PlanIn(BaseModel):
    target_id: str
    place_name: str
    place_id: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    start_at: datetime
    end_at: datetime
    status: str = "SUITABLE"
    summary: str = ""


class OpenModel(BaseModel):
    """판정 근거처럼 항목이 늘어날 수 있는 객체. 정의한 필드 외의 값도 그대로 내보낸다."""
    model_config = ConfigDict(extra="allow")


class ErrorInfo(BaseModel):
    code: str = Field(description="오류 코드. 예: MISSING_API_KEY, NO_RESULT, FORECAST_UNAVAILABLE")
    message: str = ""


class HealthOut(BaseModel):
    status: str
    service: str


class TargetOut(BaseModel):
    target_id: str
    display_name: str
    frontend_name: str | None = None
    wikidata_id: str | None = None
    supported: bool
    unsupported_reason: str = ""
    kind: str


class TargetListOut(BaseModel):
    items: list[TargetOut]


class SkyOut(OpenModel):
    ok: bool
    error: ErrorInfo | None = None
    source: str | None = None
    bodies: list[dict[str, Any]] | None = None
    places: list[dict[str, Any]] = Field(default_factory=list)


class SkyBodiesOut(OpenModel):
    ok: bool
    error: ErrorInfo | None = None
    source: str | None = None
    reference: str | None = None
    start: str | None = None
    step_minutes: int | None = None
    count: int | None = None
    bodies: list[dict[str, Any]] = Field(default_factory=list)
    unavailable: list[dict[str, Any]] = Field(default_factory=list)


class SkyOrbitOut(OpenModel):
    ok: bool
    error: ErrorInfo | None = None
    source: str | None = None
    id: str | None = None
    center: str | None = None
    epoch: str | None = None
    elements: dict[str, Any] | None = None
    points: list[float] = Field(default_factory=list)


class ConversationOut(BaseModel):
    id: str


class ToolSummary(BaseModel):
    tool: str | None
    ok: bool
    error: ErrorInfo | None = None


class ConditionCheck(OpenModel):
    field: str
    value: Any = None
    unit: str | None = None
    threshold: Any = None
    status: Literal["MET", "UNMET", "UNKNOWN"]


class Candidate(OpenModel):
    candidate_id: str | None = None
    name: str | None = None
    address: str | None = None
    maps_url: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    status: CandidateStatus
    observation_start: str | None = None
    observation_end: str | None = None
    duration_minutes: int | None = None
    checks: list[ConditionCheck] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    score: float | None = None
    source_refs: list[dict[str, Any]] = Field(default_factory=list)


class GroupedConstraints(BaseModel):
    baseline: dict[str, Any] = Field(default_factory=dict, description="천체, 날짜, 시간대")
    preference: dict[str, Any] = Field(default_factory=dict, description="지역, 장소 유형")
    constraint: dict[str, Any] = Field(default_factory=dict, description="고도, 구름량, 이동시간 같은 제한")
    empty: list[str] = Field(default_factory=list, description="아직 비어 있는 항목")


class KnowledgeSource(OpenModel):
    rank: int
    item_id: str | None = None
    item_name: str | None = None
    title: str | None = None
    section: str | None = None
    source_url: str | None = None
    snippet: str = ""


class EventOut(BaseModel):
    sequence: int | None = Field(default=None, description="세션 안의 순번. 저장 전 응답 본문에서는 비어 있다.")
    type: str
    stage: str
    tool_name: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    duration_ms: int | None = None
    created_at: str | None = None


class MessageOut(BaseModel):
    request_id: str
    conversation_id: str
    state: RunState
    message: str
    intent: str | None = None
    constraints: GroupedConstraints | None = None
    tasks: list[str] = Field(default_factory=list, description="실행한 Tool 이름 순서")
    tool_summaries: list[ToolSummary] = Field(default_factory=list)
    candidates: list[Candidate] = Field(default_factory=list)
    final_plan: Candidate | None = None
    replan_count: int = 0
    replanned: bool = False
    errors: list[ErrorInfo] = Field(default_factory=list)
    sources: list[KnowledgeSource] = Field(default_factory=list)
    graph_path: list[str] = Field(default_factory=list, description="이번 요청이 지나간 LangGraph 노드 순서")
    events: list[EventOut] = Field(default_factory=list)


class EventListOut(BaseModel):
    session_id: str
    events: list[EventOut]


class PlanOut(BaseModel):
    id: str
    target_id: str
    target_name: str
    place_id: str | None = None
    place_name: str
    latitude: float | None = None
    longitude: float | None = None
    start_at: str
    end_at: str
    status: str
    created_at: str
    updated_at: str


class PlanWarning(BaseModel):
    code: Literal["OVERLAP"]
    plan_ids: list[str]


class PlanSaveOut(BaseModel):
    plan: PlanOut
    warnings: list[PlanWarning] = Field(default_factory=list)


class PlanListOut(BaseModel):
    items: list[PlanOut]


class DeletedOut(BaseModel):
    deleted: str


class LogSessionsOut(BaseModel):
    sessions: list[str]
