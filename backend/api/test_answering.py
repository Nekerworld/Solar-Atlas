"""Grounding/citation regressions with fake model responses; no API calls."""
import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from rag.answering import answer_from_retrieval, select_evidence, generate_answer
from rag.generation import parse_json_message, GMSJSONModel


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


class AnsweringTests(unittest.TestCase):
    def test_invalid_json_is_retried_once_without_exposing_body(self):
        model = GMSJSONModel.__new__(GMSJSONModel)
        model.client = Mock()
        model.client.invoke.side_effect = [SimpleNamespace(response_metadata={}, content='{"broken":'),
                                          SimpleNamespace(response_metadata={}, content='{"ok":true}')]
        self.assertEqual(model.json("Return JSON", {}), {"ok": True})
        self.assertEqual(model.client.invoke.call_count, 2)

    def test_blocked_response_is_not_retried_as_a_format_error(self):
        model = GMSJSONModel.__new__(GMSJSONModel)
        model.client = Mock()
        model.client.invoke.return_value = SimpleNamespace(response_metadata={"finish_reason": "content_filter"}, content="")
        with self.assertRaises(ValueError):
            model.json("Return JSON", {})
        self.assertEqual(model.client.invoke.call_count, 1)

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
    def test_responses_text_blocks_ignore_reasoning(self):
        message = SimpleNamespace(response_metadata={"status": "completed"}, content=[
            {"type": "reasoning", "text": "not answer text"},
            {"type": "text", "text": '{"ok": true}'},
        ])
        self.assertEqual(parse_json_message(message), {"ok": True})

    def test_incomplete_invalid_or_empty_json_fails(self):
        for content, metadata in [
            ('{"ok": true}', {"status": "incomplete"}),
            ("not JSON", {}), ("[]", {}), ([], {}),
        ]:
            with self.subTest(content=content), self.assertRaises(ValueError):
                parse_json_message(SimpleNamespace(content=content, response_metadata=metadata))
