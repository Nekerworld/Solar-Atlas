from unittest.mock import Mock

from django.test import SimpleTestCase

from rag.gms import GMS_MODEL
from rag.model_routing import RoutedModel, escalate, stage_model


class ModelRoutingTests(SimpleTestCase):
    def make_router(self):
        self.luna = Mock()
        self.factory = Mock(return_value=self.luna)
        return RoutedModel("unused.env", factory=self.factory)

    def test_model_is_fixed_to_haiku(self):
        self.assertEqual(GMS_MODEL, "claude-haiku-5-5")

    def test_every_stage_uses_the_same_single_client(self):
        router = self.make_router()
        router.json("plan", {})
        for stage in ["assess", "compose", "review", "collect"]:
            stage_model(router, stage).json("task", {})
        self.assertEqual(self.luna.json.call_count, 5)
        self.factory.assert_called_once_with("unused.env")

    def test_escalation_does_not_change_the_model(self):
        router = self.make_router()
        escalate(router, "complex_plan")
        router.escalate("reassessment")
        router.for_stage("assess").json("task", {})
        self.assertEqual(router.limit, 0)
        self.assertFalse(router.escalated)
        self.factory.assert_called_once_with("unused.env")

    def test_client_is_created_only_when_needed(self):
        self.make_router()
        self.factory.assert_not_called()
