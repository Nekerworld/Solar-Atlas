"""GMS(Claude Haiku, chat completions) 호출 형식 테스트. 실제 네트워크를 쓰지 않도록 requests.post를 가짜로 바꾼다."""
import json
from dataclasses import replace
from unittest.mock import patch

import pytest
import requests

import app.llm as llm
from app.config import settings

FIXED_URL = "https://gms.ssafy.io/gmsapi/api.anthropic.com/v1/chat/completions"
FAKE_KEY = "test-key-not-real-0123456789"


class FakeResponse:
    def __init__(self, status_code=200, body=None, text=None):
        self.status_code = status_code
        self._body = body
        self._text = text

    def json(self):
        if self._text is not None:
            raise ValueError("not json")
        return self._body

    @property
    def text(self):
        return self._text or json.dumps(self._body, ensure_ascii=False)


def model_output(text, finish_reason="stop"):
    """OpenAI 호환 chat completions 응답 형식."""
    return {"choices": [{"index": 0, "finish_reason": finish_reason, "message": {"role": "assistant", "content": text}}]}


def json_module_dumps(value):
    return json.dumps(value, ensure_ascii=False)


ANALYSIS = {"intent": "plan_observation", "reason": "관측 계획 요청", "target_id": "jupiter", "search_region": "서울숲"}


@pytest.fixture
def key_on(monkeypatch):
    monkeypatch.setattr(llm, "settings", replace(settings, gms_key=FAKE_KEY))


def test_endpoint_and_model_are_fixed_and_not_env_overridable(monkeypatch):
    monkeypatch.setenv("GMS_BASE_URL", "https://example.invalid/v1")
    monkeypatch.setenv("GMS_MODEL", "other-model")
    assert llm.GMS_CHAT_URL == FIXED_URL
    assert llm.GMS_MODEL == "claude-haiku-5-5"
    assert not hasattr(settings, "gms_model")
    assert not hasattr(settings, "gms_base_url")


def test_request_matches_chat_completions_format(key_on):
    captured = {}

    def fake_post(url, headers, json, timeout):
        captured.update(url=url, headers=headers, json=json, timeout=timeout)
        return FakeResponse(200, model_output(json_module_dumps(ANALYSIS)))

    with patch.object(llm.requests, "post", side_effect=fake_post):
        result = llm.gms_analyze("이번 토요일 서울숲에서 목성 보고 싶어", {})

    assert result["ok"] is True
    assert captured["url"] == FIXED_URL
    assert captured["headers"]["x-api-key"] == FAKE_KEY
    assert captured["headers"]["Authorization"] == f"Bearer {FAKE_KEY}"
    assert captured["headers"]["Content-Type"] == "application/json"
    assert captured["json"]["model"] == "claude-haiku-5-5"
    assert set(captured["json"]) == {"model", "messages", "max_tokens"}
    system, user = captured["json"]["messages"]
    assert (system["role"], user["role"]) == ("system", "user")
    # 스키마는 지시문에 들어가고, 필수 필드 이름이 보여야 한다.
    assert '"required"' in system["content"] and '"intent"' in system["content"]
    assert isinstance(user["content"], str)
    assert captured["timeout"] == llm.GMS_TIMEOUT_SEC


def test_output_text_is_read_from_the_first_choice(key_on):
    body = {"choices": [
        {"finish_reason": "stop", "message": {"role": "assistant", "content": json_module_dumps(ANALYSIS)}},
        {"finish_reason": "stop", "message": {"role": "assistant", "content": "ignored"}},
    ]}
    with patch.object(llm.requests, "post", return_value=FakeResponse(200, body)):
        assert llm.gms_analyze("서울숲 목성", {})["data"]["intent"] == "plan_observation"


def test_rate_limit_is_generic_and_hides_key_and_body(key_on):
    body = {"error": {"message": "organization limit", "code": "RESOURCE_EXHAUSTED"}}
    with patch.object(llm.requests, "post", return_value=FakeResponse(429, body)):
        result = llm.gms_analyze("서울숲 목성", {})
    assert result == {"ok": False, "error": {"code": "EXTERNAL_API_ERROR", "message": "요청 분석을 구조화하지 못했습니다."}}
    assert FAKE_KEY not in json.dumps(result, ensure_ascii=False)
    assert "RESOURCE_EXHAUSTED" not in json.dumps(result, ensure_ascii=False)


def test_network_error_is_generic(key_on):
    with patch.object(llm.requests, "post", side_effect=requests.ConnectionError("secret-host-detail")):
        result = llm.gms_plan({"search_region": {"value": "서울"}})
    assert result["ok"] is False
    assert "secret-host-detail" not in json.dumps(result, ensure_ascii=False)


def test_incomplete_or_empty_output_is_failure(key_on):
    truncated = model_output(json_module_dumps(ANALYSIS), finish_reason="length")
    with patch.object(llm.requests, "post", return_value=FakeResponse(200, truncated)):
        assert llm.gms_analyze("서울숲 목성", {})["ok"] is False
    with patch.object(llm.requests, "post", return_value=FakeResponse(200, {"choices": []})):
        assert llm.gms_analyze("서울숲 목성", {})["ok"] is False
    with patch.object(llm.requests, "post", return_value=FakeResponse(200, model_output(""))):
        assert llm.gms_analyze("서울숲 목성", {})["ok"] is False


def test_missing_key_makes_no_request(monkeypatch):
    monkeypatch.setattr(llm, "settings", replace(settings, gms_key=""))
    with patch.object(llm.requests, "post") as post:
        result = llm.gms_analyze("서울숲 목성", {})
    post.assert_not_called()
    assert result["error"]["code"] == "MISSING_API_KEY"


def test_json_fence_is_accepted(key_on):
    fenced = "```json\n" + json_module_dumps(ANALYSIS) + "\n```"
    with patch.object(llm.requests, "post", return_value=FakeResponse(200, model_output(fenced))):
        assert llm.gms_analyze("서울숲 목성", {})["ok"] is True


def test_server_error_is_retried_once_then_succeeds(key_on):
    responses = [FakeResponse(503, {"error": "busy"}), FakeResponse(200, model_output(json_module_dumps(ANALYSIS)))]
    with patch.object(llm.requests, "post", side_effect=responses) as post, patch.object(llm.time, "sleep"):
        assert llm.gms_analyze("서울숲 목성", {})["ok"] is True
    assert post.call_count == 2


def test_rate_limit_is_not_retried(key_on):
    with patch.object(llm.requests, "post", return_value=FakeResponse(429, {})) as post, patch.object(llm.time, "sleep"):
        assert llm.gms_analyze("서울숲 목성", {})["ok"] is False
    assert post.call_count == 1
