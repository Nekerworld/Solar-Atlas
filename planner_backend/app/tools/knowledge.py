"""F3022 지식 검색 Tool. backend(8000)의 검색 엔드포인트를 HTTP로 부르는 로컬 서버 API Tool이다.

backend 코드는 import하지 않는다. 서버가 꺼져 있거나 실패해도 예외 대신 실패 응답을 돌려준다.
"""
from __future__ import annotations

import requests

from app.config import settings
from app.targets import resolve_target
from app.tools.responses import fail, ok

TOOL = "search_knowledge"
PROVIDER = "solar_atlas_rag"
PATH = "/api/knowledge/search/"
KNOWN_CODES = {"NO_INDEX", "NO_RESULT", "EXTERNAL_API_ERROR", "INVALID_INPUT"}


def search_knowledge(question: str, target_id: str | None = None, top_k: int = 5) -> dict:
    question = (question or "").strip()
    if not question:
        return fail(TOOL, "INVALID_INPUT", "검색할 질문이 없습니다.")
    body: dict = {"question": question[:500], "top_k": max(1, min(int(top_k or 5), 10))}
    target = resolve_target(target_id) if target_id else None
    if target is not None and target.wikidata_id:
        body["item_id"] = target.wikidata_id
    # 관측 대상 목록에 없는 천체(예: 명왕성)도 색인에는 있을 수 있으므로, 범위를 못 정하면 전체 색인에서 찾는다.
    url = settings.knowledge_url + PATH
    try:
        response = requests.post(url, json=body, timeout=settings.tool_timeout_sec)
    except requests.Timeout:
        return fail(TOOL, "API_TIMEOUT", "지식 검색 시간이 초과되었습니다.")
    except requests.RequestException:
        return fail(TOOL, "KNOWLEDGE_UNAVAILABLE", "지식 검색 서버에 연결하지 못했습니다.")
    try:
        payload = response.json()
    except ValueError:
        return fail(TOOL, "PARSE_ERROR", "지식 검색 응답을 읽지 못했습니다.")
    if response.status_code == 200 and isinstance(payload, dict) and payload.get("ok"):
        data = payload.get("data") or {}
        if not data.get("sources"):
            return fail(TOOL, "NO_RESULT", "질문과 관련된 근거 문서를 찾지 못했습니다.")
        return ok(TOOL, data, PROVIDER, url)
    error = payload.get("error") if isinstance(payload, dict) else None
    code = (error or {}).get("code")
    if code in KNOWN_CODES:
        return fail(TOOL, code, str((error or {}).get("message") or "지식 검색에 실패했습니다."))
    return fail(TOOL, "EXTERNAL_API_ERROR", "지식 검색에 실패했습니다.")
