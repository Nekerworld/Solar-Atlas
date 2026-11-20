"""Grounding/citation regressions with fake model responses; no API calls."""
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from rag.answering import answer_from_retrieval, select_evidence, generate_answer
import requests

from rag.generation import parse_chat_json, GMSJSONModel
from rag.gms import GMS_CHAT_URL, GMS_MODEL


def retrieval():
    return {
        "item_id": "Q405", "question": "달의 크레이터는 어떻게 생겼어?",
        "profile": {"text": "달은 지구의 자연위성이다.", "metadata": {
            "item_id": "Q405", "name_ko": "달", "own_document_id": "kowiki:1",
            "source_url": "https://ko.wikipedia.org/?curid=1",
        }},
        "chunks": [
            {"id": "Q405:kowiki:1:0000", "text": "달의 크레이터는 주로 충돌로 형성된다.", "metadata": {
                "item_id": "Q405", "document_id": "kowiki:1", "title": "달", "section": "크레이터",
                "source_url": "https://ko.wikipedia.org/?curid=1", "revision_id": "123",
            }},
            {"id": "Q405:kowiki:1:0001", "text": "동아시아에서 달에 관한 설화가 전해진다.", "metadata": {
                "item_id": "Q405", "document_id": "kowiki:1", "title": "달", "section": "문화",
                "source_url": "https://ko.wikipedia.org/?curid=1",
            }},
        ],
    }


def selected(coverage="sufficient", missing=None):
    return {"coverage": coverage, "missing_information": missing or [], "selected": [
        {"evidence_id": "C1", "quote": "크레이터는 주로 충돌로 형성된다."},
    ]}


def generated(coverage="sufficient", ids=None, text="달의 크레이터는 주로 충돌로 만들어집니다."):
    return {"coverage": coverage, "missing_information": [], "statements": [
        {"text": text, "evidence_ids": ids if ids is not None else ["C1"]},
    ]}


class FakeResponse:
    def __init__(self, status_code, body):
        self.status_code, self._body = status_code, body

    def json(self):
        return self._body


def output_payload(text, finish_reason="stop"):
    """OpenAI 호환 chat completions 응답."""
    return {"choices": [{"index": 0, "finish_reason": finish_reason, "message": {"role": "assistant", "content": text}}]}


class AnsweringTests(unittest.TestCase):
    def make_model(self, max_retries=0):
        model = GMSJSONModel.__new__(GMSJSONModel)
        model.key, model.timeout, model.max_retries, model.json_attempts = "test-key-not-real", 5, max_retries, 2
        return model

    def test_invalid_json_is_retried_once_without_exposing_body(self):
        model = self.make_model()
        with patch.object(model, "_post", side_effect=[output_payload('{"broken":'), output_payload('{"ok":true}')]) as post:
            self.assertEqual(model.json("Return JSON", {}), {"ok": True})
        self.assertEqual(post.call_count, 2)

    def test_blocked_response_is_not_retried_as_a_format_error(self):
        model = self.make_model()
        blocked = output_payload("{}", finish_reason="content_filter")
        with patch.object(model, "_post", return_value=blocked) as post, self.assertRaises(ValueError):
            model.json("Return JSON", {})
        self.assertEqual(post.call_count, 1)

    def test_request_follows_chat_completions_with_fixed_endpoint_and_model(self):
        model = self.make_model()
        captured = {}

        def fake_post(url, headers, json, timeout):
            captured.update(url=url, headers=headers, body=json, timeout=timeout)
            return FakeResponse(200, output_payload('{"ok": true}'))

        with patch("rag.generation.requests.post", side_effect=fake_post):
            self.assertEqual(model.json("Return JSON", {"q": "달"}), {"ok": True})
        self.assertEqual(captured["url"], GMS_CHAT_URL)
        self.assertEqual(GMS_CHAT_URL, "https://gms.ssafy.io/gmsapi/api.anthropic.com/v1/chat/completions")
        self.assertEqual(captured["headers"]["x-api-key"], "test-key-not-real")
        self.assertEqual(captured["headers"]["Authorization"], "Bearer test-key-not-real")
        self.assertEqual(captured["body"]["model"], "claude-haiku-5-5")
        self.assertEqual(GMS_MODEL, "claude-haiku-5-5")
        self.assertEqual(set(captured["body"]), {"model", "messages", "max_tokens"})
        system, user = captured["body"]["messages"]
        self.assertEqual((system["role"], user["role"]), ("system", "user"))
        self.assertIn("Return JSON", system["content"])

    def test_rate_limit_is_not_retried_and_hides_key_and_body(self):
        model = self.make_model(max_retries=2)
        response = FakeResponse(429, {"error": {"code": "organization_spend_limit_exceeded"}})
        with patch("rag.generation.requests.post", return_value=response) as post, self.assertRaises(RuntimeError) as caught:
            model.json("Return JSON", {})
        self.assertEqual(post.call_count, 1)
        self.assertIn("HTTP 429", str(caught.exception))
        self.assertNotIn("test-key-not-real", str(caught.exception))
        self.assertNotIn("organization", str(caught.exception))

    def test_server_errors_and_timeouts_are_retried_up_to_the_limit(self):
        model = self.make_model(max_retries=2)
        results = [FakeResponse(503, {}), requests.Timeout("slow"), FakeResponse(200, output_payload('{"ok": true}'))]
        with patch("rag.generation.requests.post", side_effect=results) as post, patch("rag.generation.time.sleep"):
            self.assertEqual(model.json("Return JSON", {}), {"ok": True})
        self.assertEqual(post.call_count, 3)

    def test_assessed_distinctions_reach_composer_without_becoming_evidence(self):
        model = Mock()
        model.json.return_value = generated()
        selection = select_evidence(retrieval(), Mock(json=Mock(return_value=selected())), 8)
        guidance = {"assessment": "답을 바꾸는 기준을 명시해야 함"}
        generate_answer(retrieval(), selection, model, guidance=guidance)
        supplied = model.json.call_args.args[1]
        self.assertEqual(supplied["answer_guidance"], guidance)
        self.assertEqual([row["evidence_id"] for row in supplied["evidence"]], ["C1"])

    def test_sources_are_resolved_from_stored_metadata_and_only_cited_sources_are_shown(self):
        response = generated()
        response["sources"] = [{"title": "invented", "url": "https://fake.invalid"}]
        model = Mock()
        model.json.side_effect = [selected(), response]
        result = answer_from_retrieval(retrieval(), model)
        self.assertEqual(result["coverage"], "sufficient")
        self.assertIn("[C1]", result["answer"])
        self.assertEqual(len(result["sources"]), 1)
        self.assertEqual(result["sources"][0]["title"], "달")
        self.assertEqual(result["sources"][0]["url"], "https://ko.wikipedia.org/?curid=1")
        self.assertNotIn("문화", str(result["sources"]))
        sent_evidence = model.json.call_args_list[1].args[1]["evidence"]
        self.assertEqual([e["evidence_id"] for e in sent_evidence], ["C1"])
        self.assertNotIn("설화", str(sent_evidence))

    def test_no_relevant_evidence_skips_answer_generation(self):
        model = Mock()
        model.json.return_value = {
            "coverage": "insufficient", "missing_information": ["현재 자료에 필요한 관측값이 없습니다."], "selected": [],
        }
        result = answer_from_retrieval(retrieval(), model)
        self.assertEqual(model.json.call_count, 1)
        self.assertEqual(result["coverage"], "insufficient")
        self.assertEqual(result["sources"], [])
        self.assertIn("확실한 정보를 확인하지 못했어요", result["answer"])

    def test_hallucinated_quote_is_rejected(self):
        model = Mock()
        response = selected()
        response["selected"][0]["quote"] = "달에는 커다란 도시가 있다."
        model.json.return_value = response
        result = answer_from_retrieval(retrieval(), model)
        self.assertEqual(result["coverage"], "insufficient")
        self.assertEqual(result["sources"], [])
        self.assertTrue(result["warnings"])
        self.assertEqual(model.json.call_count, 1)

    def test_partial_coverage_cannot_be_upgraded_by_generator(self):
        model = Mock()
        model.json.side_effect = [selected("partial", ["고지에 관한 근거가 부족합니다."]), generated()]
        result = answer_from_retrieval(retrieval(), model)
        self.assertEqual(result["coverage"], "partial")
        self.assertIn("나머지 부분은 더 확인이 필요해요", result["answer"])
        self.assertIn("고지", str(result["missing_information"]))

    def test_unknown_or_unselected_citation_is_not_published(self):
        for ids in (["C999"], ["C2"], ["C1", "C999"], []):
            with self.subTest(ids=ids):
                model = Mock()
                model.json.side_effect = [selected(), generated(ids=ids)]
                result = answer_from_retrieval(retrieval(), model)
                self.assertEqual(result["coverage"], "insufficient")
                self.assertEqual(result["sources"], [])
                self.assertNotIn("만들어집니다", result["answer"])

    def test_uncited_invalid_sentence_is_dropped_and_answer_downgraded(self):
        response = generated()
        response["statements"].append({"text": "근거 없는 추가 설명", "evidence_ids": []})
        model = Mock()
        model.json.side_effect = [selected(), response]
        result = answer_from_retrieval(retrieval(), model)
        self.assertEqual(result["coverage"], "partial")
        self.assertNotIn("근거 없는 추가 설명", result["answer"])
        self.assertEqual(len(result["sources"]), 1)

    def test_generated_urls_or_inline_citations_are_rejected(self):
        for text in ("설명 https://fake.invalid", "설명 [C999]", "설명 [출처](https://fake.invalid)"):
            with self.subTest(text=text):
                model = Mock()
                model.json.side_effect = [selected(), generated(text=text)]
                result = answer_from_retrieval(retrieval(), model)
                self.assertEqual(result["coverage"], "insufficient")

    def test_profile_can_be_cited_using_stored_item_source(self):
        model = Mock()
        selection = {"coverage": "sufficient", "missing_information": [], "selected": [
            {"evidence_id": "M1", "quote": "달은 지구의 자연위성이다."},
        ]}
        model.json.side_effect = [selection, generated(ids=["M1"], text="달은 지구의 자연위성입니다.")]
        result = answer_from_retrieval(retrieval(), model)
        self.assertEqual(result["sources"][0]["kind"], "metadata")
        self.assertEqual(result["sources"][0]["url"], "https://ko.wikipedia.org/?curid=1")

    def test_malformed_schema_is_an_error_not_a_knowledge_gap(self):
        model = Mock()
        model.json.return_value = {"coverage": "invented", "selected": []}
        with self.assertRaises(ValueError):
            select_evidence(retrieval(), model)


class JSONMessageTests(unittest.TestCase):
    def test_message_text_is_read_from_the_first_choice(self):
        self.assertEqual(parse_chat_json(output_payload('{"ok": true}')), {"ok": True})

    def test_single_json_fence_is_accepted(self):
        self.assertEqual(parse_chat_json(output_payload('```json\n{"ok": true}\n```')), {"ok": True})

    def test_incomplete_invalid_or_empty_json_fails(self):
        for payload in [
            output_payload('{"ok": true}', finish_reason="length"),
            output_payload(""), {"choices": []},
            output_payload("not JSON"), output_payload("[]"), None, [],
        ]:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                parse_chat_json(payload)
