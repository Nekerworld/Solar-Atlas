"""Execute the real compiled graph with mocked retrieval and model responses."""
import unittest
from unittest.mock import Mock, patch

from api.test_answering import generated, retrieval, selected
from rag.graph import build_answer_graph, run_answer_graph


class GraphTests(unittest.TestCase):
    def setUp(self):
        self.store = Mock()
        self.embeddings = Mock()
        self.model = Mock()

    @patch("rag.graph.retrieve")
    def test_sufficient_route_preserves_validated_citations(self, retrieve_mock):
        retrieve_mock.return_value = retrieval()
        self.model.json.side_effect = [selected(), generated()]
        progress = Mock()
        result = run_answer_graph(
            self.store, self.embeddings, self.model, "Q405", "질문",
            candidates=12, max_evidence=8, progress=progress,
        )
        self.assertEqual(result["graph_path"], ["retrieve", "select_evidence", "generate_answer"])
        self.assertEqual(result["coverage"], "sufficient")
        self.assertEqual(self.model.json.call_count, 2)
        self.assertEqual(result["sources"][0]["url"], "https://ko.wikipedia.org/?curid=1")
        retrieve_mock.assert_called_once_with(self.store, self.embeddings, "Q405", "질문", 12)
        self.assertEqual(progress.call_count, 3)

    @patch("rag.graph.retrieve")
    def test_insufficient_route_never_calls_generation_model(self, retrieve_mock):
        retrieve_mock.return_value = retrieval()
        self.model.json.return_value = {
            "coverage": "insufficient", "selected": [],
            "missing_information": ["정확한 미래 온도 자료가 없습니다."],
        }
        result = run_answer_graph(self.store, self.embeddings, self.model, "Q405", "미래 온도는?")
        self.assertEqual(result["graph_path"], ["retrieve", "select_evidence", "insufficient"])
        self.assertEqual(self.model.json.call_count, 1)
        self.assertEqual(result["coverage"], "insufficient")
        self.assertEqual(result["sources"], [])

    @patch("rag.graph.retrieve")
    def test_partial_route_generates_only_partial_answer(self, retrieve_mock):
        retrieve_mock.return_value = retrieval()
        self.model.json.side_effect = [selected("partial", ["비교 대상 일부의 근거 부족"]), generated()]
        result = run_answer_graph(self.store, self.embeddings, self.model, "Q405", "비교해 줘")
        self.assertEqual(result["graph_path"][-1], "generate_answer")
        self.assertEqual(result["coverage"], "partial")

    @patch("rag.graph.retrieve")
    def test_invalid_selected_quote_routes_to_insufficient(self, retrieve_mock):
        retrieve_mock.return_value = retrieval()
        selection = selected()
        selection["selected"][0]["quote"] = "실제 원문에 없는 문장"
        self.model.json.return_value = selection
        result = run_answer_graph(self.store, self.embeddings, self.model, "Q405", "질문")
        self.assertEqual(result["graph_path"][-1], "insufficient")
        self.assertEqual(self.model.json.call_count, 1)

    @patch("rag.graph.retrieve", side_effect=ValueError("not indexed"))
    def test_retrieval_error_stops_before_any_model_call(self, retrieve_mock):
        with self.assertRaisesRegex(ValueError, "not indexed"):
            run_answer_graph(self.store, self.embeddings, self.model, "Q339", "질문")
        self.model.json.assert_not_called()

    @patch("rag.graph.retrieve")
    def test_reused_compiled_graph_does_not_mix_question_state(self, retrieve_mock):
        retrieve_mock.side_effect = lambda store, embeddings, item, question, count: {
            **retrieval(), "item_id": item, "question": question,
        }
        self.model.json.side_effect = [selected(), generated(), selected(), generated()]
        graph = build_answer_graph(self.store, self.embeddings, self.model)
        first = graph.invoke({"item_id": "Q405", "question": "첫 질문"})
        second = graph.invoke({"item_id": "Q405", "question": "두 번째 질문"})
        self.assertEqual(len(first["steps"]), 3)
        self.assertEqual(second["steps"], first["steps"])
        self.assertEqual(second["question"], "두 번째 질문")
        self.assertEqual(second["result"]["question"], "두 번째 질문")

    def test_invalid_input_does_not_execute_graph(self):
        with self.assertRaises(ValueError):
            run_answer_graph(self.store, self.embeddings, self.model, "Q405", " ")
        self.model.json.assert_not_called()
