"""Citation completeness is model-assessed, with deterministic ID validation."""
from unittest import TestCase
from unittest.mock import Mock
from rag.comparison_review import review_comparison


class ComparisonReviewTests(TestCase):
    def setUp(self):
        self.result = {"coverage": "sufficient", "statements": [{"text": "A가 B보다 작아요.", "evidence_ids": ["C1"]}],
                       "sources": [], "warnings": []}
        self.selection = {"evidence": [{"evidence_id": key, "record_id": key,
            "quote": quote, "source": {"title": title, "url": "https://example.org/" + key}}
            for key, title, quote in [("C1", "A", "A는 1이다."), ("C2", "B", "B는 2이다.")]]}

    def test_repaired_citations_include_all_comparison_operands(self):
        model = Mock()
        model.json.return_value = {"valid": True, "citations": [{"statement_index": 0, "evidence_ids": ["C1", "C2"]}]}
        result = review_comparison(self.result, self.selection, "어느 쪽이 작아?", model)
        self.assertEqual(result["statements"][0]["evidence_ids"], ["C1", "C2"])
        self.assertEqual(len(result["sources"]), 2)
        self.assertTrue(result["comparison_reviewed"])

    def test_direct_comparison_can_use_one_source(self):
        model = Mock()
        model.json.return_value = {"valid": True, "citations": [{"statement_index": 0, "evidence_ids": ["C1"]}]}
        result = review_comparison(self.result, self.selection, "어느 쪽이 작아?", model)
        self.assertEqual(len(result["sources"]), 1)

    def test_reviewer_cannot_invent_ids_or_leave_statements_unchecked(self):
        for citations in [[], [{"statement_index": 0, "evidence_ids": ["invented"]}],
                          [{"statement_index": True, "evidence_ids": ["C1"]}]]:
            with self.subTest(citations=citations):
                model = Mock()
                model.json.return_value = {"valid": True, "citations": citations}
                result = review_comparison(self.result, self.selection, "어느 쪽이 작아?", model)
                self.assertEqual(result["coverage"], "insufficient")
                self.assertEqual(result["statements"], [])

    def test_unsupported_conclusion_returns_feedback_instead_of_guess(self):
        model = Mock()
        model.json.return_value = {"valid": False, "feedback": "대상 전체의 비교를 입증하지 못함"}
        result = review_comparison(self.result, self.selection, "전체에서 가장 작아?", model)
        self.assertEqual(result["sources"], [])
        self.assertIn("대상 전체", result["comparison_feedback"])
