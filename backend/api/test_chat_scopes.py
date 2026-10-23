import tempfile
import uuid
from unittest.mock import patch

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import Conversation


class ChatScopeTests(TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.settings = override_settings(RAG_RUNTIME_DIR=self.temp.name)
        self.settings.enable()
        self.addCleanup(self.settings.disable)
        self.client = APIClient()
        patcher = patch("api.chat_service.RAGService")
        self.service = patcher.start().return_value
        self.addCleanup(patcher.stop)
        self.service.answer.return_value = {"answer": "확인한 답변이에요.", "sources": []}

    def send(self, item="Q2", mode="global", conversation=None, request=None):
        data = {"item_id": item, "question": "질문", "mode": mode, "request_id": str(request or uuid.uuid4())}
        if conversation:data["conversation_id"] = str(conversation)
        return self.client.post("/api/chat/", data, format="json")

    def test_global_chat_keeps_cross_body_followups_and_old_chats_default_global(self):
        legacy = Conversation.objects.create(item_id="Q2")
        self.assertEqual(legacy.mode, "global")
        first = self.send(conversation=legacy.id)
        self.assertEqual(first.status_code, 200)
        second = self.send(item="Q111", conversation=legacy.id)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.data["conversation_id"], str(legacy.id))
        self.assertEqual(len(self.service.answer.call_args.kwargs["history"]), 1)

    def test_item_chat_rejects_another_item_or_global_mode_before_model_call(self):
        first = self.send(mode="item")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data["mode"], "item")
        cid = first.data["conversation_id"]
        self.service.answer.reset_mock()
        for item, mode in [("Q111", "item"), ("Q2", "global")]:
            response = self.send(item, mode, cid)
            self.assertEqual(response.status_code, 409)
            self.assertEqual(response.data["error"]["code"], "conversation_scope_mismatch")
        self.service.answer.assert_not_called()

    def test_item_history_is_independent_and_mode_filters_are_available(self):
        global_chat = self.send()
        earth = self.send(mode="item")
        mars = self.send(item="Q111", mode="item")
        self.send(mode="item", conversation=earth.data["conversation_id"])
        history = self.service.answer.call_args.kwargs["history"]
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["observed_item_id"], "Q2")
        response = self.client.get("/api/conversations/", {"mode": "item", "item_id": "Q2"})
        self.assertEqual([row["id"] for row in response.data["results"]], [earth.data["conversation_id"]])
        self.assertNotEqual(global_chat.data["conversation_id"], earth.data["conversation_id"])
        self.assertNotEqual(earth.data["conversation_id"], mars.data["conversation_id"])

    def test_replay_cannot_cross_modes_and_item_mode_requires_a_body(self):
        request = uuid.uuid4()
        first = self.send(mode="item", request=request)
        self.service.answer.reset_mock()
        replay = self.send(mode="item", conversation=first.data["conversation_id"], request=request)
        self.assertEqual(replay.status_code, 200)
        self.assertTrue(replay.data["replayed"])
        invalid = self.send(mode="global", request=request)
        self.assertEqual(invalid.status_code, 409)
        self.assertEqual(self.send(item="", mode="item").status_code, 400)
        self.service.answer.assert_not_called()

    def test_discovery_cards_persist_and_context_reaches_followup(self):
        discovery={"conditions":["고리가 있는 행성"],"result_ids":["Q193"],"evaluated_ids":["Q193"],"truncated":False}
        cards=[{"item_id":"Q193","name":"토성","reason":"짧은 부합 이유","evidence_ids":["D0_C1"]}]
        self.service.answer.return_value={"answer":"조건 결과","response_mode":"discovery","sources":[],"cards":cards,"discovery":discovery}
        first=self.send();cid=first.data["conversation_id"]
        self.assertEqual(first.data["cards"],cards)
        saved=self.client.get(f"/api/conversations/{cid}/turns/")
        self.assertEqual(saved.data["results"][0]["result"]["cards"],cards)
        self.send(conversation=cid)
        self.assertEqual(self.service.answer.call_args.kwargs["history"][0]["discovery"],discovery)
