"""GMS(Claude Haiku) 구조화 출력. 키가 없으면 사용자에게 키 입력을 요구하지 않는다.

엔드포인트와 모델은 코드에 고정한다(환경변수로 바꾸지 않는다). 키만 환경변수(GMS_KEY, 없으면 GMS_API_KEY)에서 읽는다.
GMS 안내대로 OpenAI 호환 chat completions 형식(`{base_url}/chat/completions`)에 `Authorization`과 `x-api-key` 헤더를 함께 보낸다.
이 경로는 `response_format`의 JSON Schema를 강제하지 못하므로 스키마를 지시문에 넣고 Pydantic으로 검증한다.
"""
from __future__ import annotations

import json
import logging
import time
from datetime import datetime
from typing import Any, Literal
from zoneinfo import ZoneInfo

import requests
from pydantic import BaseModel, Field, ValidationError

from app.config import settings
from app.tools import catalog

GMS_BASE_URL = "https://gms.ssafy.io/gmsapi/api.anthropic.com/v1"
GMS_CHAT_URL = f"{GMS_BASE_URL}/chat/completions"
GMS_MODEL = "claude-haiku-5-5"
GMS_MAX_TOKENS = 4096
GMS_TIMEOUT_SEC = 40
GMS_ATTEMPTS = 2  # 네트워크 오류와 5xx만 한 번 더 보낸다. 429는 한도 문제라 다시 보내지 않는다.

logger = logging.getLogger(__name__)


class GmsError(Exception):
    """GMS 호출 실패. 메시지에는 상태 코드 같은 분류만 담고, 키나 응답 본문은 담지 않는다."""


Intent = Literal["plan_observation", "discover_targets", "update_constraints", "ask_knowledge", "help"]
DATE_HINT = "YYYY-MM-DD 형식. 상대 날짜는 오늘 기준으로 계산한다."
TIME_HINT = "HH:MM 24시간 형식."


class AnalysisModel(BaseModel):
    intent: Intent = Field(description="관측 계획 요청이면 plan_observation. 천체 추천이면 discover_targets. 조건 변경이면 update_constraints. 천체 지식 질문이면 ask_knowledge. 사용법이나 인사면 help.")
    reason: str = Field(description="분류 근거를 한 문장으로.")
    target_id: str | None = Field(default=None, description="천체 식별자(예: jupiter). 말하지 않았으면 null.")
    date_start: str | None = Field(default=None, description=DATE_HINT)
    date_end: str | None = Field(default=None, description=DATE_HINT)
    preferred_time_start: str | None = Field(default=None, description=TIME_HINT)
    preferred_time_end: str | None = Field(default=None, description=TIME_HINT)
    search_region: str | None = Field(default=None, description="관측 지역 이름. 장소를 말했으면 place_query와 같은 값을 넣는다.")
    origin_name: str | None = None
    origin_lat: float | None = None
    origin_lon: float | None = None
    transport_mode: str | None = None
    max_travel_minutes: int | None = None
    min_altitude_deg: float | None = None
    max_cloud_cover_pct: float | None = None
    max_precipitation_probability_pct: float | None = None
    place_query: str | None = Field(default=None, description="관측 장소 이름(예: 서울숲).")
    allow_other_date: bool = False
    allow_other_target: bool = False
    stop_questions: bool = False


class TaskItem(BaseModel):
    tool: str = Field(description="등록된 Tool 이름 하나.")
    reason: str = Field(default="", description="이 Tool을 고른 이유 한 문장.")


class TaskPlanModel(BaseModel):
    tasks: list[TaskItem] = Field(default_factory=list)
    reason: str = ""


def _plan_schema(names: list[str]) -> dict[str, Any]:
    """계획 출력 스키마. tool은 등록된 이름만 고르도록 enum으로 제한한다."""
    schema = TaskPlanModel.model_json_schema()
    schema["$defs"]["TaskItem"]["properties"]["tool"]["enum"] = names
    return schema


def gms_responses(instructions: str, user_input: str, schema: dict[str, Any]) -> str:
    """chat completions 요청 한 번. 스키마는 지시문에 넣고, 첫 응답 메시지의 텍스트를 돌려준다."""
    key = settings.gms_key
    if not key:
        raise GmsError("MISSING_KEY")
    system = (
        f"{instructions}\n\n출력은 아래 JSON Schema를 따르는 JSON 객체 하나만 쓴다. "
        "설명, 마크다운, 코드 펜스를 붙이지 않는다.\n"
        f"{json.dumps(schema, ensure_ascii=False)}"
    )
    body = {
        "model": GMS_MODEL,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user_input}],
        "max_tokens": GMS_MAX_TOKENS,
    }
    response = None
    label = "NETWORK"
    for attempt in range(GMS_ATTEMPTS):
        if attempt:
            time.sleep(1)
        try:
            response = requests.post(
                GMS_CHAT_URL,
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}", "x-api-key": key},
                json=body,
                timeout=GMS_TIMEOUT_SEC,
            )
        except requests.RequestException:
            response, label = None, "NETWORK"
            continue
        if response.status_code == 200:
            break
        label = f"HTTP {response.status_code}"
        if response.status_code < 500:
            break
    if response is None or response.status_code != 200:
        raise GmsError(label)
    try:
        payload = response.json()
        choice = payload["choices"][0]
        text = choice["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError):
        raise GmsError("PARSE") from None
    if choice.get("finish_reason") not in (None, "stop"):
        raise GmsError("INCOMPLETE")
    text = (text or "").strip() if isinstance(text, str) else ""
    if not text:
        raise GmsError("EMPTY")
    return text


def _failure_kind(error: Exception) -> str:
    """로그용 분류. 메시지 본문이나 입력 문장은 쓰지 않는다."""
    return str(error) if isinstance(error, GmsError) else type(error).__name__


def _today() -> str:
    return datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat()


def _json_text(text: str) -> str:
    """응답 전체를 감싼 코드 펜스 하나만 벗긴다. 그 밖의 문장에서 JSON을 억지로 찾지 않는다."""
    if text.startswith("```") and text.endswith("```"):
        inner = text[3:-3]
        return inner.removeprefix("json").strip()
    return text


def gms_analyze(message: str, constraints: dict) -> dict:
    if not settings.gms_key:
        return {"ok": False, "error": {"code": "MISSING_API_KEY", "message": "서버 LLM 설정이 없어 요청을 분석하지 못했습니다."}}
    instruction = (
        "관측 계획 요청을 JSON으로만 구조화한다. 말하지 않은 값은 null이다. "
        f"오늘은 {_today()}(Asia/Seoul)이다. '모레', '이번 토요일' 같은 표현은 이 날짜 기준으로 YYYY-MM-DD로 바꾼다. "
        "help는 사용법이나 인사다. discover_targets는 천체가 정해지지 않은 추천이다. "
        "ask_knowledge는 관측 계획이 아니라 천체의 크기, 성질, 원인 같은 지식 질문이다. "
        "이미 있는 조건은 constraints에 있다. 사용자가 바꾼 값만 채운다."
    )
    try:
        text = gms_responses(instruction, json.dumps({"message": message, "constraints": constraints}, ensure_ascii=False), AnalysisModel.model_json_schema())
        parsed = AnalysisModel.model_validate_json(_json_text(text))
    except (GmsError, ValidationError, ValueError) as error:
        logger.warning("GMS structured call failed: %s", _failure_kind(error))
        return {"ok": False, "error": {"code": "EXTERNAL_API_ERROR", "message": "요청 분석을 구조화하지 못했습니다."}}
    return {"ok": True, "data": parsed.model_dump()}


def gms_plan(constraints: dict, replan_axis: str | None = None) -> dict:
    if not settings.gms_key:
        return {"ok": False, "error": {"code": "MISSING_API_KEY", "message": "서버 LLM 설정이 없어 작업 계획을 만들지 못했습니다."}}
    tools = catalog()
    names = [item["name"] for item in tools]
    described = "; ".join(f"{item['name']}: {item['description']} 필수 입력 {item['input_schema']['required']}" for item in tools)
    instruction = (
        "필요한 Tool 이름만 JSON tasks로 고른다. 등록된 이름만 쓴다. "
        f"사용 가능한 Tool: {described}. 장소 식별자나 좌표를 만들지 않는다. "
        "이동시간 제한이 없으면 get_route를 넣지 않는다. "
        "사용법 질문이면 tasks를 비운다."
    )
    try:
        text = gms_responses(instruction, json.dumps({"constraints": constraints, "replan_axis": replan_axis}, ensure_ascii=False, default=str), _plan_schema(names))
        parsed = TaskPlanModel.model_validate_json(_json_text(text))
    except (GmsError, ValidationError, ValueError) as error:
        logger.warning("GMS structured call failed: %s", _failure_kind(error))
        return {"ok": False, "error": {"code": "EXTERNAL_API_ERROR", "message": "작업 계획을 구조화하지 못했습니다."}}
    return {"ok": True, "data": parsed.model_dump()}


def select_tool_probe() -> dict:
    """기획 검증용. Tool 명세를 보고 호출을 선택하는지만 확인한다."""
    if not settings.gms_key:
        return {"ok": False, "error": {"code": "MISSING_API_KEY", "message": "GMS_KEY가 없습니다."}}
    result = gms_plan({"search_region": {"value": "서울"}, "target_id": {"value": "jupiter"}, "max_travel_minutes": None})
    if not result["ok"]:
        return result
    names = [task.get("tool") for task in result["data"].get("tasks", [])]
    return {"ok": bool(names), "selected": names}
