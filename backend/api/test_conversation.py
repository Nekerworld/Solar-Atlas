"""Offline conversation routing regressions; no model, network or Chroma writes."""
import unittest
from unittest.mock import Mock

from rag.conversation import conversation_reply


class ConversationTests(unittest.TestCase):
    def test_greeting_has_no_missing_evidence_or_search(self):
        model = Mock()
        model.json.return_value = {
            "route": "conversation", "reply": "안녕하세요! 아틀라스예요. 어떤 이야기를 나눠볼까요?",
        }
        result = conversation_reply(model, "Q405", "안녕")
        self.assertEqual(result["response_mode"], "conversation")
        self.assertIn("아틀라스", result["answer"])
        self.assertEqual(result["sources"], [])
        self.assertEqual(result["missing_information"], [])
        self.assertEqual(result["retrieved_chunks"], 0)
        self.assertEqual(result["collection"]["status"], "not_needed")

    def test_mixed_science_question_keeps_retrieval(self):
        model = Mock()
        model.json.return_value = {"route": "retrieval", "reply": ""}
        self.assertIsNone(conversation_reply(model, "Q319", "안녕, 목성은 얼마나 커?"))

    def test_history_is_forwarded_for_followup_conversation(self):
        model = Mock()
        model.json.return_value = {"route": "conversation", "reply": "편하게 아틀라스라고 불러주세요."}
        history = [{"question": "이름이 뭐야?", "answer": "아틀라스예요."}]
        conversation_reply(model, "Q405", "어떻게 부르면 돼?", history)
        self.assertEqual(model.json.call_args.args[1]["history"], history)

    def test_invalid_output_falls_back_to_grounded_path(self):
        for output in [
            {"route": "unknown", "reply": "임의 답변"},
            {"route": "conversation", "reply": ""},
            {"route": "conversation", "reply": "근거예요 [C1]"},
            {"route": "conversation", "reply": "https://example.com"},
            {"route": "conversation", "reply": None},
        ]:
            with self.subTest(output=output):
                model = Mock()
                model.json.return_value = output
                self.assertIsNone(conversation_reply(model, "Q405", "안녕"))
