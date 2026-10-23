"""POST SSE progress for local Django runserver/WSGI. Saved final turns remain canonical."""
import json
from queue import Empty, Full, Queue
from threading import Thread
from django.db import close_old_connections
from django.http import StreamingHttpResponse
from .chat_service import ChatError, submit_chat
from .chat_interim import InterimMessage

MESSAGES = {
    "conversation": "이야기를 듣고 있어요…",
    "accepted": "질문을 살펴보고 있어요…",
    "answer_with_evidence": "확인한 내용을 정리하고 있어요…",
    "compare_evidence": "대상별 정보를 비교하고 있어요…",
    "retrieve_priority": "궁금해하신 천체의 정보를 살펴보고 있어요…",
    "select_evidence": "질문에 맞는 내용인지 확인하고 있어요…",
    "retrieve_global": "질문과 관련된 정보를 찾고 있어요…",
    "collect_wikipedia": "조금 더 알아보고 있어요…",
    "retrieve_again": "새로 확인한 정보도 함께 살펴보고 있어요…",
    "generate_answer": "확인한 내용을 정리하고 있어요…",
    "clarify": "질문의 대상을 확인하고 있어요…",
}


def stream_response(data):
    events = Queue(maxsize=128)
    def emit(event, payload):
        try:
            events.put_nowait((event, payload))
            return True
        except Full:
            return False
    interim = InterimMessage(data, emit)
    def progress(line):
        stage = line.removeprefix("NODE: ").strip()
        interim.update(stage)
        try:
            events.put_nowait(("status", {"stage": stage, "message": MESSAGES.get(stage, "답변을 준비하고 있어요…")}))
        except Full:
            pass  # A disconnected reader must never block completion/persistence.
    def terminal(event, payload):
        interim.stop()
        # Reserve room even if the browser disconnected. Only terminal output is authoritative.
        while True:
            try:
                events.put_nowait((event, payload))
                return
            except Full:
                try:
                    events.get_nowait()
                except Empty:
                    pass
    def run():
        close_old_connections()
        try:
            payload, status = submit_chat(data, progress=progress)
            terminal("result", {"payload": payload, "http_status": status})
        except ChatError as error:
            terminal("error", {"payload": error.payload, "http_status": error.status})
        except Exception:
            terminal("error", {"payload": {"error": {"code": "stream_failed",
                "message": "답변을 완료하지 못했어요. 답변 상태를 다시 확인해주세요."}}, "http_status": 500})
        finally:
            close_old_connections()
    def encode(event, payload):
        return "event: " + event + "\ndata: " + json.dumps(payload, ensure_ascii=False) + "\n\n"
    def generate():
        progress("accepted")
        # Start only when the response is consumed. Work continues after a browser
        # disconnect so a retry with the same request_id can recover the saved result.
        Thread(target=run, daemon=True, name="solar-chat").start()
        interim.start()
        try:
            while True:
                try:
                    event, payload = events.get(timeout=10)
                except Empty:
                    yield ": keepalive\n\n"
                    continue
                if payload.get("stage") == "interim" and interim.stopped.is_set():
                    continue
                yield encode(event, payload)
                if event in {"result", "error"}:
                    break
        finally:
            interim.stop()
    response = StreamingHttpResponse(generate(), content_type="text/event-stream; charset=utf-8")
    response["Cache-Control"] = "no-cache, no-transform"
    response["X-Accel-Buffering"] = "no"
    return response
