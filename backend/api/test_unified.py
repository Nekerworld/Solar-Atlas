"""Model-owned policy and deterministic citation validation; no external APIs."""
from unittest.mock import Mock, patch
from django.test import SimpleTestCase
from rag.agent_policy import decide_evidence, plan_request


def catalog():
    return {key: {"id": key, "name": name} for key, name in [("Q319", "목성"), ("Q2", "지구"), ("Q193", "토성")]}


def retrieval():
    return {"item_id": "Q2", "question": "태양계에서 가장 무거운 행성은?", "profiles": [],
        "profile": {"text": "", "metadata": {}}, "chunks": [{"id": "doc1", "text": "목성은 태양계에서 질량이 가장 큰 행성이다.",
        "metadata": {"item_id": "Q319", "title": "목성", "source_url": "https://ko.wikipedia.org/?curid=1"}}]}


class AgentPolicyTests(SimpleTestCase):
    def test_invalid_plan_schema_is_repaired_without_mapping_unknown_actions(self):
        model = Mock()
        model.json.side_effect = [{"action": "retrieval"},
            {"action": "retrieve", "target_ids": ["Q2"], "search_query": "지구 대기"}]
        result = plan_request(model, catalog(), "Q2", "공기는 어때?", [])
        self.assertEqual(result["action"], "retrieve")
        self.assertEqual(model.json.call_count, 2)
        self.assertEqual(model.json.call_args.args[1]["output_validation"], ["invalid_action_enum"])

    def assess(self, output, **kwargs):
        model = Mock()
        model.json.return_value = output
        result = decide_evidence(retrieval(), model, catalog(), {"observed_id": "Q2", "target_ids": list(catalog())},
            [], 8, can_search=kwargs.get("can_search", True), attempts=kwargs.get("attempts", []), feedback=[])
        return result, model

    def test_direct_superlative_does_not_require_all_planet_sources(self):
        result, model = self.assess({"action": "answer", "coverage": "sufficient", "missing_information": [],
            "selected": [{"evidence_id": "C1", "quote": "목성은 태양계에서 질량이 가장 큰 행성이다."}]})
        self.assertEqual(result["selection"]["coverage"], "sufficient")
        self.assertEqual(len(result["selection"]["evidence"]), 1)
        self.assertEqual(model.json.call_count, 1)

    def test_fabricated_quote_is_rejected(self):
        result, _ = self.assess({"action": "answer", "coverage": "sufficient", "missing_information": [],
            "selected": [{"evidence_id": "C1", "quote": "자료에 없는 문장"}]})
        self.assertEqual(result["selection"]["coverage"], "insufficient")

    def test_duplicate_query_is_feedback_not_a_hardcoded_replacement(self):
        output = {"action": "search", "coverage": "insufficient", "missing_information": ["속성 정보"],
            "selected": [], "search_queries": [{"item_id": "Q319", "query": "목성 질량"}]}
        result, _ = self.assess(output, attempts=[{"queries": [{"item_id": "Q2", "query": "목성 질량"}]}])
        self.assertEqual(result["queries"], [])

    def test_stop_does_not_force_search(self):
        result, _ = self.assess({"action": "stop", "coverage": "insufficient", "missing_information": [],
            "selected": [], "reply": "미래의 측정값은 아직 알 수 없어요."})
        self.assertEqual(result["action"], "stop")
        self.assertEqual(result["queries"], [])

    def test_planning_interprets_context_without_keyword_routes(self):
        model = Mock()
        model.json.return_value = {"action": "retrieve", "target_ids": ["Q2", "invalid"],
            "search_query": "지구 대기 구성", "requires_comparison": False}
        result = plan_request(model, catalog(), "Q193", "거기 공기는 어때?", [{"question": "지구 이야기해줘"}])
        self.assertEqual(result["target_ids"], ["Q2"])
        self.assertEqual(result["search_question"], "지구 대기 구성")
        self.assertFalse(result["requires_comparison"])

    def test_unknown_action_is_not_executed(self):
        with self.assertRaises(ValueError):
            self.assess({"action": "delete_database"})


class StreamNegotiationTests(SimpleTestCase):
    def test_sse_accept_header_without_model_requests(self):
        from django.http import StreamingHttpResponse
        from rest_framework.test import APIClient
        response = StreamingHttpResponse(iter(["event: status\ndata: {}\n\n"]), content_type="text/event-stream")
        with patch("api.chat_stream.stream_response", return_value=response):
            result = APIClient().post("/api/chat/stream/", {"question": "금성의 대기는?"},
                                      format="json", HTTP_ACCEPT="text/event-stream")
        self.assertEqual(result.status_code, 200)
        result.close()
