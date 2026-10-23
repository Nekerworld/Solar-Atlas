from unittest.mock import Mock

from django.test import SimpleTestCase, override_settings

from rag.model_routing import RoutedModel


class ModelRoutingTests(SimpleTestCase):
    def make_router(self):
        self.luna, self.sol = Mock(), Mock()
        self.factory = Mock(side_effect=lambda env, name, **kwargs: self.sol if name == "gpt-6.1-sol" else self.luna)
        return RoutedModel("unused.env", factory=self.factory)

    def test_routine_work_does_not_initialize_sol(self):
        router = self.make_router()
        router.json("plan", {})
        router.for_stage("compose").json("simple", {})
        self.sol.json.assert_not_called()
        self.assertEqual(router.sol_calls, 0)

    @override_settings(RAG_SOL_MAX_CALLS=2)
    def test_budget_is_shared_across_stages_and_collection_stays_luna(self):
        router = self.make_router()
        router.escalate("complex_plan")
        router.json("collect", {})
        for stage in ["assess", "compose", "review", "assess"]:
            router.for_stage(stage).json("task", {})
        self.assertEqual(self.sol.json.call_count, 2)
        self.assertEqual(self.luna.json.call_count, 3)
        kwargs = next(call.kwargs for call in self.factory.call_args_list if call.args[1] == "gpt-6.1-sol")
        self.assertEqual(kwargs["max_retries"], 0)
        self.assertEqual(kwargs["json_attempts"], 1)

    @override_settings(RAG_SOL_MAX_CALLS=1)
    def test_failed_sol_call_consumes_budget_and_falls_back(self):
        router = self.make_router()
        self.sol.json.side_effect = RuntimeError("sanitized provider error")
        router.escalate("reassessment")
        router.for_stage("assess").json("task", {})
        router.for_stage("compose").json("task", {})
        self.assertEqual(self.sol.json.call_count, 1)
        self.assertEqual(self.luna.json.call_count, 2)

    @override_settings(RAG_SOL_MAX_CALLS=0)
    def test_zero_disables_sol(self):
        router = self.make_router()
        router.escalate("complex_plan")
        router.for_stage("assess").json("task", {})
        self.sol.json.assert_not_called()
