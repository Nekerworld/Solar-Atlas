"""실행 이벤트. 구독자가 없어도 발행은 계속되고, 저장 실패는 본 요청을 멈추지 않는다."""
from __future__ import annotations

from sqlalchemy import func

from app.models import ExecutionEvent


class EventBus:
    def __init__(self):
        self.events: list[dict] = []
        self.handlers: list = []

    def subscribe(self, handler) -> None:
        self.handlers.append(handler)

    def emit(self, event_type: str, stage: str, payload: dict | None = None, tool_name: str | None = None, duration_ms: int | None = None) -> None:
        event = {
            "type": event_type,
            "stage": stage,
            "payload": payload or {},
            "tool_name": tool_name,
            "duration_ms": duration_ms,
        }
        self.events.append(event)
        for handler in list(self.handlers):
            try:
                handler(event)
            except Exception:
                continue


class LoggingAgent:
    def __init__(self, session_factory, session_id: str):
        self.session_factory = session_factory
        self.session_id = session_id
        self.sequence: int | None = None

    def handle(self, event: dict) -> None:
        try:
            self.store(event)
        except Exception:
            return

    def store(self, event: dict) -> None:
        with self.session_factory() as session:
            if self.sequence is None:
                # 같은 대화의 앞선 요청이 남긴 순번 뒤에 이어 붙여, 세션 안의 순서가 요청을 넘어 유지되게 한다.
                last = session.query(func.max(ExecutionEvent.sequence)).filter(ExecutionEvent.session_id == self.session_id).scalar()
                self.sequence = last or 0
            self.sequence += 1
            session.add(ExecutionEvent(
                session_id=self.session_id,
                sequence=self.sequence,
                event_type=event.get("type") or "event",
                stage=event.get("stage") or "",
                tool_name=event.get("tool_name"),
                payload_json=_dump(event.get("payload") or {}),
                duration_ms=event.get("duration_ms"),
            ))
            session.commit()


def _dump(value) -> str:
    import json
    return json.dumps(value, ensure_ascii=False, default=str)
