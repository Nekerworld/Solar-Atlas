"""Request-local, bounded Sol use; routine and collection work stays on Luna."""
import logging

from django.conf import settings

from .generation import GMSJSONModel


class RoutedModel:
    def __init__(self, env_file, *, factory=GMSJSONModel):
        self.env_file, self.factory = env_file, factory
        self.clients = {}
        self.escalated = False
        self.sol_calls = 0
        self.limit = max(0, int(getattr(settings, "RAG_SOL_MAX_CALLS", 2)))

    def escalate(self, reason):
        if self.limit and not self.escalated:
            self.escalated = True
            logging.getLogger("rag.timing").info("[ATLAS MODEL] escalation=%s", reason)

    def _client(self, name):
        if name not in self.clients:
            options = {"max_retries": 0, "json_attempts": 1, "reasoning_effort": "low"} if name == "gpt-6.1-sol" else {}
            self.clients[name] = self.factory(self.env_file, name, **options)
        return self.clients[name]

    def json(self, instruction, data):
        return self._client("gpt-6-luna").json(instruction, data)

    def for_stage(self, stage):
        owner = self

        class StageModel:
            def json(self, instruction, data):
                if owner.escalated and stage in {"assess", "compose", "review"} and owner.sol_calls < owner.limit:
                    owner.sol_calls += 1
                    logging.getLogger("rag.timing").info("[ATLAS MODEL] stage=%s model=gpt-6.1-sol call=%d/%d", stage, owner.sol_calls, owner.limit)
                    try:
                        return owner._client("gpt-6.1-sol").json(instruction, data)
                    except (RuntimeError, ValueError) as error:
                        # No repeated paid Sol requests; normal citation checks still apply.
                        logging.getLogger("rag.timing").warning("[ATLAS MODEL] sol_fallback=%s", type(error).__name__)
                return owner.json(instruction, data)

        return StageModel()


def stage_model(model, stage):
    return model.for_stage(stage) if isinstance(model, RoutedModel) else model


def escalate(model, reason):
    if isinstance(model, RoutedModel):
        model.escalate(reason)
