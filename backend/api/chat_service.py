"""Persist turns outside network transactions; serialize each conversation."""
from rag.timing import timed, measure
import logging

from django.db import IntegrityError, transaction
from django.utils import timezone

from rag.runtime import file_lock, runtime_dir
from rag.service import RAGService

from .models import ChatTurn, Conversation


logger = logging.getLogger(__name__)


class ChatError(Exception):
    def __init__(self, code, message, status=400, **extra):
        self.payload = {"error": {"code": code, "message": message}, **extra}
        self.status = status


def turn_response(turn, replayed=False):
    result = dict(turn.result)
    # Quotes remain available in sources; the selection debug payload is CLI-only.
    result.pop("selected_evidence", None)
    payload = {**result, "conversation_id": str(turn.conversation_id), "turn_id": str(turn.id),
               "request_id": str(turn.request_id), "item_id": turn.observed_item_id if turn.observed_item_id is not None else turn.conversation.item_id,
               "question": turn.question, "status": turn.status, "replayed": replayed,
               "mode": turn.conversation.mode}
    status = 200
    if turn.status == ChatTurn.Status.PROCESSING:
        status = 202
    elif turn.status == ChatTurn.Status.FAILED:
        status = 502
        payload["error"] = {"code": turn.error_code, "message": "답변 처리를 완료하지 못했습니다. 새 요청 ID로 다시 시도하세요."}
    return payload, status


def _validate_replay(turn, data):
    if ((turn.observed_item_id if turn.observed_item_id is not None else turn.conversation.item_id) != data["item_id"] or turn.question != data["question"]
            or turn.allow_external != data["allow_external"]
            or turn.conversation.mode != data.get("mode", "global")
            or (data.get("conversation_id") and data["conversation_id"] != turn.conversation_id)):
        raise ChatError("request_id_conflict", "같은 요청 ID를 다른 질문이나 대화에 사용할 수 없습니다.", 409)


@timed('chat.total')
def submit_chat(data, progress=None):
    created_conversation = False
    existing = ChatTurn.objects.select_related("conversation").filter(request_id=data["request_id"]).first()
    if existing:
        _validate_replay(existing, data)
        if existing.status != ChatTurn.Status.PROCESSING:
            return turn_response(existing, replayed=True)
        conversation = existing.conversation
        service = None
    else:
        if data.get("conversation_id"):
            conversation = Conversation.objects.filter(id=data["conversation_id"]).first()
            if conversation is None:
                raise ChatError("conversation_not_found", "대화를 찾을 수 없습니다.", 404)
            if (conversation.mode != data.get("mode", "global") or
                    (conversation.mode == "item" and conversation.item_id != data["item_id"])):
                raise ChatError("conversation_scope_mismatch", "선택한 대화의 모드 또는 천체가 다릅니다. 해당 천체의 대화를 선택해주세요.", 409)
        else:
            conversation = None
        try:
            service = RAGService()
        except (ValueError, OSError, ImportError, RuntimeError):
            raise ChatError("index_unavailable", "검색 저장소를 열 수 없습니다. 색인 및 설정을 확인하세요.", 503) from None
        if conversation is None:
            conversation = Conversation.objects.create(item_id=data["item_id"], mode=data.get("mode", "global"))
            created_conversation = True

    try:
        with file_lock(runtime_dir() / "conversations" / f"{conversation.id}.lock", timeout=0.1):
            # Acquiring this lock proves no live process owns the old turn.
            current = ChatTurn.objects.select_related("conversation").filter(request_id=data["request_id"]).first()
            if current:
                _validate_replay(current, data)
                if created_conversation and current.conversation_id != conversation.id:
                    Conversation.objects.filter(id=conversation.id, turns__isnull=True).delete()
                if (existing is not None and current.conversation_id == conversation.id
                        and current.status == ChatTurn.Status.PROCESSING):
                    current.status, current.error_code = ChatTurn.Status.FAILED, "interrupted"
                    current.finished_at = timezone.now()
                    current.save(update_fields=["status", "error_code", "finished_at"])
                return turn_response(current, replayed=True)
            ChatTurn.objects.filter(conversation=conversation, status=ChatTurn.Status.PROCESSING).update(
                status=ChatTurn.Status.FAILED, error_code="interrupted", finished_at=timezone.now(),
            )
            try:
                with transaction.atomic():
                    turn = ChatTurn.objects.create(conversation=conversation, request_id=data["request_id"],
                                                   question=data["question"], allow_external=data["allow_external"],
                                                   observed_item_id=data["item_id"])
                    Conversation.objects.filter(id=conversation.id).update(updated_at=timezone.now())
            except IntegrityError:
                duplicate = ChatTurn.objects.select_related("conversation").filter(request_id=data["request_id"]).first()
                if duplicate:
                    _validate_replay(duplicate, data)
                    return turn_response(duplicate, replayed=True)
                raise ChatError("conversation_busy", "이 대화의 이전 답변을 처리 중입니다.", 409) from None

            recent = list(conversation.turns.filter(status=ChatTurn.Status.COMPLETED)
                          .order_by("-created_at", "-id")[:6])
            history = [{"question": t.question, "answer": t.result.get("answer", "")[:4000],
                        "target_ids": t.result.get("target_ids", []),
                        "discovery": t.result.get("discovery"),
                        "observed_item_id": t.observed_item_id if t.observed_item_id is not None else conversation.item_id}
                       for t in reversed(recent)]
            try:
                result = service.answer(data["item_id"], data["question"],
                                        allow_external=data["allow_external"], history=history, progress=progress)
            except Exception as error:
                # Error bodies and credentials must not be returned or stored.
                logger.error("Chat processing failed: %s", type(error).__name__)
                turn.status, turn.error_code = ChatTurn.Status.FAILED, "rag_failed"
                turn.finished_at = timezone.now()
                turn.save(update_fields=["status", "error_code", "finished_at"])
                return turn_response(turn)
            with measure("chat.persist_result"):
                turn.result, turn.status, turn.finished_at = result, ChatTurn.Status.COMPLETED, timezone.now()
                turn.save(update_fields=["result", "status", "finished_at"])
                Conversation.objects.filter(id=conversation.id).update(updated_at=timezone.now())
            return turn_response(turn)
    except TimeoutError:
        if existing:
            existing.refresh_from_db()
            return turn_response(existing, replayed=True)
        raise ChatError("conversation_busy", "이 대화의 이전 답변을 처리 중입니다.", 409,
                        conversation_id=str(conversation.id)) from None
