"""모델은 claude-haiku-5-5로 고정한다. 단계 이름 인터페이스만 남기고, 상위 모델로 올리는 경로는 없다."""
from .generation import GMSJSONModel


class RoutedModel:
    def __init__(self, env_file, *, factory=GMSJSONModel):
        self.env_file, self.factory = env_file, factory
        self.client = None
        # 상위 모델 호출 한도. 모델을 고정했으므로 항상 0이다.
        self.limit = 0
        self.escalated = False

    def escalate(self, reason):
        """호출부 호환용. 모델을 올리지 않는다."""

    def _client(self):
        if self.client is None:
            self.client = self.factory(self.env_file)
        return self.client

    def json(self, instruction, data):
        return self._client().json(instruction, data)

    def for_stage(self, stage):
        return self


def stage_model(model, stage):
    return model.for_stage(stage) if isinstance(model, RoutedModel) else model


def escalate(model, reason):
    if isinstance(model, RoutedModel):
        model.escalate(reason)
