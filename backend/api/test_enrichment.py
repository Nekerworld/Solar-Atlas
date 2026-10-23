"""Offline agent execution and presentation regression checks."""
from unittest.mock import Mock, patch
from django.test import SimpleTestCase, override_settings
from rag.presentation import present_result
from rag.search_context import prioritize_collected
from rag.unified_graph import run_unified_graph


def decision(action="stop", query=None):
    return {"action": action, "queries": [{"item_id": "Q2", "query": query}] if query else [],
        "reply": "지금은 정확한 답을 확인하지 못했어요.", "assessment": "평가용 결정",
        "selection": {"coverage": "sufficient" if action == "answer" else "insufficient",
            "evidence": [{"evidence_id": "C1", "quote": "검증된 설명", "source": {"title": "지구"}}] if action == "answer" else [],
            "missing_information": [], "rejected_evidence": 0}}


class AgentExecutionTests(SimpleTestCase):
    def run_flow(self, decisions, reports, history=None):
        collector = Mock()
        collector.collect_direct.side_effect = reports
        composed = {"coverage": "sufficient", "answer": "확인한 설명이에요.", "statements": [{"text": "확인한 설명이에요."}],
                    "sources": [], "warnings": [], "missing_information": []}
        plan = {"action": "retrieve", "target_ids": ["Q2"], "search_question": "지구 대기", "observed_id": "Q2"}
        with patch("rag.unified_graph.retrieve_context", return_value={"chunks": [], "profiles": []}), \
             patch("rag.unified_graph.prioritize_collected", side_effect=lambda retrieval, *args: retrieval) as priority, \
             patch("rag.unified_graph.decide_evidence", side_effect=decisions) as completion, \
             patch("rag.unified_graph.generate_answer", return_value=composed) as composer:
            result = run_unified_graph(Mock(), Mock(), Mock(), {"Q2": {"id": "Q2", "name": "지구"}},
                                       "Q2", "지구 대기", collector=collector, plan=plan, history=history)
            self.last_guidance = composer.call_args.kwargs.get("guidance") if composer.called else None
        return result, collector, priority, completion

    def test_history_and_current_observation_survive_the_composition_handoff(self):
        history = [{"question": "이전에 논의한 대상", "answer": "대화 내용"}]
        self.run_flow([decision("answer")], [], history=history)
        self.assertEqual(self.last_guidance["history"], history)
        self.assertEqual(self.last_guidance["observed_body"]["id"], "Q2")
        self.assertEqual(self.last_guidance["resolved_subjects"][0]["id"], "Q2")

    def test_unchanged_document_is_retrieved_again(self):
        result, collector, priority, _ = self.run_flow([decision("search", "지구 대기"), decision("answer")],
            [{"status": "unchanged", "documents": [{"item_id": "Q2", "document_id": "kowiki:1"}]}])
        priority.assert_called_once()
        self.assertEqual(result["graph_path"].count("retrieve_global"), 2)
        self.assertEqual(collector.collect_direct.call_count, 1)

    def test_searches_are_capped(self):
        report = {"status": "no_evidence", "documents": []}
        _, collector, _, _ = self.run_flow([decision("search", "first"), decision("search", "second"),
            decision("search", "third"), decision()], [report, report])
        self.assertEqual(collector.collect_direct.call_count, 2)

    @override_settings(RAG_AGENT_MAX_DECISIONS=3)
    def test_invalid_requests_get_bounded_reassessment(self):
        result, collector, _, completion = self.run_flow([decision("search"), decision("search"), decision("search")], [])
        self.assertEqual(completion.call_count, 3)
        collector.collect_direct.assert_not_called()
        self.assertEqual(result["coverage"], "insufficient")

    def test_partial_keeps_facts_and_hides_internal_diagnostics(self):
        result = {"coverage": "partial", "statements": [{"text": "검증된 설명이에요."}],
                  "warnings": ["invalid quote"], "missing_information": ["debug gap"]}
        presented = present_result(result, {"attempts": []})
        self.assertIn("검증된 설명이에요.", presented["display_answer"])
        self.assertNotIn("debug gap", presented["display_answer"])
        self.assertEqual(presented["warnings"], [])
        self.assertEqual(presented["diagnostics"]["warnings"], ["invalid quote"])

    def test_collected_chunks_are_filtered_by_document(self):
        store, embeddings = Mock(), Mock()
        store.documents.get.return_value = {"ids": ["new"]}
        meta = {"item_id": "Q2", "document_id": "kowiki:1"}
        store.documents.query.return_value = {"ids": [["new"]], "documents": [["조성비 표"]],
            "metadatas": [[meta]], "distances": [[0.1]]}
        result = prioritize_collected({"chunks": [{"id": "old"}]}, store, embeddings,
            [{"item_id": "Q2", "document_id": "kowiki:1"}], "지구 대기 조성비")
        self.assertEqual([row["id"] for row in result["chunks"]], ["new", "old"])

    def test_relevance_window_keeps_late_material_first(self):
        from rag.collection import WikipediaCollector
        paragraphs = [{"id": f"p{i}", "text": "일반적인 소개예요."} for i in range(20)]
        paragraphs.append({"id": "p20", "text": "관측 장비의 광학적깊이 자료 표"})
        selected = WikipediaCollector._verification_paragraphs({"paragraphs": paragraphs}, "광학적깊이 자료")
        self.assertEqual(selected[0]["id"], "p20")

    def test_table_footnotes_remain_attached_to_numbers(self):
        from rag.table_context import preserve_table_context, PARSER_VERSION
        document = {"raw_html": '<table class="wikitable"><tr><td>측정 비율 10%<sup class="reference"><a href="#cite_note-1">[1]</a></sup></td></tr></table><ol class="reflist"><li id="cite_note-1">특정 조건에서만 적용됨</li></ol>',
                    "paragraphs": [{"id": "p1", "kind": "table", "text": "측정 비율 10% [1]"}]}
        enriched = preserve_table_context(document)
        self.assertIn("특정 조건에서만 적용됨", enriched["paragraphs"][0]["text"])
        self.assertEqual(enriched["parser_version"], PARSER_VERSION)

    def test_dense_table_is_not_lost_to_repeated_prose_keywords(self):
        from rag.collection import WikipediaCollector
        paragraphs = [{"id": f"p{i}", "kind": "p", "text": "대상 관측 일반적인 설명"} for i in range(20)]
        paragraphs.append({"id": "data", "kind": "table", "text": "기호 a: 10%, b: 90%"})
        selected = WikipediaCollector._verification_paragraphs({"paragraphs": paragraphs}, "대상 관측 비율")
        self.assertEqual(selected[0]["id"], "data")
