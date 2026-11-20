"""F3022 search_knowledge Tool과 지식 질문 흐름. 외부 서버와 GMS를 부르지 않는다."""
import pytest
import requests
from fastapi.testclient import TestClient

import app.main as main
from app.models import init_database, make_engine, make_session_factory
from app.tools import knowledge


class FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


SOURCES = [
    {"rank": 1, "item_id": "Q319", "item_name": "목성", "title": "목성", "section": "개요",
     "source_url": "https://ko.wikipedia.org/wiki/목성", "revision_id": "1", "distance": 0.1,
     "snippet": "목성은 태양계에서 가장 큰 행성이다."},
]


def _post_returning(response, capture=None):
    def fake_post(url, json=None, timeout=None):
        if capture is not None:
            capture["url"] = url
            capture["body"] = json
        if isinstance(response, Exception):
            raise response
        return response
    return fake_post


def test_tool_returns_sources_and_scopes_to_target(monkeypatch):
    seen = {}
    monkeypatch.setattr(knowledge.requests, "post", _post_returning(FakeResponse(200, {"ok": True, "data": {"sources": SOURCES}}), seen))
    result = knowledge.search_knowledge("목성은 얼마나 커?", "jupiter")
    assert result["ok"] is True
    assert result["data"]["sources"][0]["source_url"].startswith("https://")
    assert seen["body"]["item_id"] == "Q319"
    assert seen["url"].endswith("/api/knowledge/search/")


def test_unknown_target_falls_back_to_global_search(monkeypatch):
    seen = {}
    monkeypatch.setattr(knowledge.requests, "post", _post_returning(FakeResponse(200, {"ok": True, "data": {"sources": SOURCES}}), seen))
    assert knowledge.search_knowledge("명왕성은?", "pluto")["ok"] is True
    assert "item_id" not in seen["body"]


@pytest.mark.parametrize("raised, code", [
    (requests.Timeout(), "API_TIMEOUT"),
    (requests.ConnectionError("down"), "KNOWLEDGE_UNAVAILABLE"),
])
def test_tool_failure_is_a_response_not_an_exception(monkeypatch, raised, code):
    monkeypatch.setattr(knowledge.requests, "post", _post_returning(raised))
    result = knowledge.search_knowledge("목성은?")
    assert result["ok"] is False
    assert result["error"]["code"] == code


def test_backend_no_index_code_is_passed_through(monkeypatch):
    body = {"ok": False, "error": {"code": "NO_INDEX", "message": "색인이 없어 지식 검색을 할 수 없습니다."}}
    monkeypatch.setattr(knowledge.requests, "post", _post_returning(FakeResponse(503, body)))
    result = knowledge.search_knowledge("목성은?")
    assert result["error"]["code"] == "NO_INDEX"


def test_unreadable_and_unknown_error_bodies_do_not_leak(monkeypatch):
    monkeypatch.setattr(knowledge.requests, "post", _post_returning(FakeResponse(500, ValueError("traceback with secret"))))
    assert knowledge.search_knowledge("목성은?")["error"]["code"] == "PARSE_ERROR"
    leaky = {"ok": False, "error": {"code": "WEIRD", "message": "key=abc123"}}
    monkeypatch.setattr(knowledge.requests, "post", _post_returning(FakeResponse(500, leaky)))
    result = knowledge.search_knowledge("목성은?")
    assert result["error"]["code"] == "EXTERNAL_API_ERROR"
    assert "abc123" not in result["error"]["message"]


def test_empty_question_makes_no_request(monkeypatch):
    def boom(*args, **kwargs):
        raise AssertionError("요청이 나가면 안 된다")

    monkeypatch.setattr(knowledge.requests, "post", boom)
    assert knowledge.search_knowledge("  ")["error"]["code"] == "INVALID_INPUT"


@pytest.fixture()
def client(monkeypatch):
    test_engine = make_engine("sqlite:///:memory:")
    init_database(test_engine)
    main.engine = test_engine
    main.Session = make_session_factory(test_engine)
    state = {"result": {"ok": True, "tool": "search_knowledge", "data": {"sources": SOURCES}, "error": None, "source": {"provider": "solar_atlas_rag"}}}

    def fake_tool(name, arguments):
        state["calls"] = state.get("calls", []) + [name]
        if name == "search_knowledge":
            return state["result"]
        raise AssertionError(f"지식 질문에서 {name}을 호출하면 안 된다")

    monkeypatch.setattr("app.engine.run_tool", fake_tool)
    monkeypatch.setattr(main, "_analyzer", lambda message, constraints: {"ok": True, "data": {"intent": "ask_knowledge", "reason": "지식 질문", "target_id": "jupiter"}})
    test_client = TestClient(main.app)
    test_client.state = state
    return test_client


def _ask(client, text):
    conversation = client.post("/api/conversations").json()["id"]
    response = client.post(f"/api/conversations/{conversation}/messages", json={"text": text})
    return conversation, response


def test_knowledge_question_returns_sources_without_planning(client):
    conversation, response = _ask(client, "목성은 얼마나 큰 행성이야?")
    body = response.json()
    assert response.status_code == 200
    assert body["state"] == "COMPLETED"
    assert body["intent"] == "ask_knowledge"
    assert body["tasks"] == ["search_knowledge"]
    assert body["sources"][0]["source_url"].startswith("https://")
    assert "가장 큰 행성" in body["message"]
    assert client.state["calls"] == ["search_knowledge"]
    events = client.get(f"/api/logs/sessions/{conversation}").json()["events"]
    completed = [item for item in events if item["type"] == "tool_call_completed"]
    assert completed[0]["tool_name"] == "search_knowledge"
    assert completed[0]["duration_ms"] is not None


def test_knowledge_failure_keeps_service_alive_and_hides_details(client):
    client.state["result"] = {"ok": False, "tool": "search_knowledge", "data": None,
                              "error": {"code": "NO_INDEX", "message": "색인이 없어 지식 검색을 할 수 없습니다."}, "source": None}
    _, response = _ask(client, "목성은 얼마나 큰 행성이야?")
    body = response.json()
    assert response.status_code == 200
    assert body["state"] == "COMPLETED"
    assert body["sources"] == []
    assert "색인이 없어" in body["message"]
    assert any(item["tool"] == "search_knowledge" and item["ok"] is False for item in body["tool_summaries"])


def test_knowledge_no_result_does_not_invent_an_answer(client):
    client.state["result"] = {"ok": False, "tool": "search_knowledge", "data": None,
                              "error": {"code": "NO_RESULT", "message": "x"}, "source": None}
    _, response = _ask(client, "목성은 얼마나 큰 행성이야?")
    assert "근거 없이 답하지 않습니다" in response.json()["message"]
