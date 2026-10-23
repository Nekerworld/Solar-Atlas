"""Stage/timing regressions; no APIs, database or real sleeps."""
import unittest
from unittest.mock import Mock
from api.chat_interim import InterimMessage
from rag.unified_graph import comparison_stage


class InterimMessageTests(unittest.TestCase):
    def setUp(self):
        self.now = 0
        self.emit = Mock()
        self.generate = Mock(side_effect=lambda data, stage, context: context["kind"] + " 안내예요.")
        self.controller = InterimMessage({}, self.emit, generate=self.generate, clock=lambda: self.now)
        self.controller.update("retrieve_global")

    def tick(self, seconds, stage=None):
        self.now = seconds
        if stage is not None:
            self.controller.update(stage)
        self.controller._tick()

    def kinds(self):
        return [call.args[1]["kind"] for call in self.emit.call_args_list]

    def test_first_message_waits_five_seconds(self):
        self.tick(4.99)
        self.generate.assert_not_called()
        self.tick(5)
        self.assertEqual(self.kinds(), ["acknowledge"])

    def test_ordinary_answer_is_not_comparison(self):
        self.tick(5)
        self.tick(10, "answer_with_evidence")
        self.tick(20)
        self.assertEqual(self.kinds(), ["acknowledge"])

    def test_each_kind_once_with_five_second_spacing(self):
        self.tick(5)
        self.tick(9.9, "collect_wikipedia")
        self.assertEqual(len(self.kinds()), 1)
        self.tick(10)
        self.tick(15, "compare_evidence")
        self.tick(20)
        self.tick(30)
        self.tick(40, "collect_wikipedia")
        self.tick(50, "compare_evidence")
        self.assertEqual(self.kinds(), ["acknowledge", "explore", "compare", "long_wait"])
        self.assertEqual(self.generate.call_count, 4)

    def test_long_wait_wins_and_respects_interval(self):
        self.tick(27)
        self.tick(30, "collect_wikipedia")
        self.assertEqual(self.kinds(), ["acknowledge"])
        self.tick(32)
        self.assertEqual(self.kinds(), ["acknowledge", "long_wait"])

    def test_previous_outputs_passed_to_next_generation(self):
        self.tick(5)
        self.tick(10, "collect_wikipedia")
        self.assertEqual(self.generate.call_args.args[2]["previous_interim"],
                         [{"kind": "acknowledge", "message": "acknowledge 안내예요."}])

    def test_spacing_starts_after_generation_finishes(self):
        def slow_reply(*args):
            self.now = 8
            return "확인하고 있어요."
        self.generate.side_effect = slow_reply
        self.tick(5)
        self.tick(12, "collect_wikipedia")
        self.assertEqual(self.generate.call_count, 1)

    def test_phase_ended_before_interval_is_skipped(self):
        self.tick(5)
        self.tick(8, "collect_wikipedia")
        self.tick(10, "answer_with_evidence")
        self.assertEqual(self.kinds(), ["acknowledge"])

    def test_phase_ended_during_generation_is_discarded(self):
        self.tick(5)
        def changed(*args):
            self.controller.update("answer_with_evidence")
            return "추가로 찾아보고 있어요."
        self.generate.side_effect = changed
        self.tick(10, "collect_wikipedia")
        self.assertEqual(self.kinds(), ["acknowledge"])

    def test_completion_during_generation_discards_message(self):
        def completed(*args):
            self.controller.stop()
            return "늦게 도착한 멘트"
        self.generate.side_effect = completed
        self.tick(5)
        self.emit.assert_not_called()

    def test_stopped_or_replayed_request_skips_generation(self):
        self.tick(5, "accepted")
        self.controller.stop()
        self.tick(30, "retrieve_global")
        self.generate.assert_not_called()

    def test_failure_does_not_retry_same_kind(self):
        self.generate.side_effect = RuntimeError("mock failure")
        self.tick(5)
        self.tick(6)
        self.assertEqual(self.generate.call_count, 1)
        self.emit.assert_not_called()

    def test_duplicate_text_not_emitted(self):
        self.generate.side_effect = None
        self.generate.return_value = "확인하고 있어요."
        self.tick(5)
        self.tick(10, "collect_wikipedia")
        self.assertEqual(self.kinds(), ["acknowledge"])

    def test_only_real_multi_body_comparison_has_comparison_stage(self):
        two = {"target_ids": ["Q2", "Q111"], "requires_comparison": True}
        material = {"chunks": [{"text": "후보 자료"}]}
        self.assertTrue(comparison_stage(two, "지구와 화성의 대기를 비교해줘", material))
        self.assertFalse(comparison_stage({**two, "requires_comparison": False}, "지구와 화성을 각각 소개해줘", material))
        self.assertFalse(comparison_stage(two, "지구와 화성을 비교해줘", {"chunks": []}))
        self.assertFalse(comparison_stage({"target_ids": ["Q2"]}, "지구 대기 조성비", material))
