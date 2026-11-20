"""기존 Django 채팅 API의 FastAPI 진입점.

RAG 그래프와 Django 모델은 그대로 두고, HTTP 계층만 FastAPI로 제공한다.
실행: backend 디렉터리에서
  uvicorn fastapi_app:app --host 127.0.0.1 --port 8000
"""
from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path

BACKEND = Path(__file__).resolve().parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django

django.setup()

from django.core.paginator import Paginator
from django.db.models import Q
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from api.chat_service import ChatError, submit_chat
from api.chat_stream import stream_response
from api.models import ChatTurn, Conversation

app = FastAPI(title="Solar Atlas API", version="2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatIn(BaseModel):
    item_id: str = ""
    question: str = Field(min_length=1, max_length=2000)
    conversation_id: uuid.UUID | None = None
    request_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    allow_external: bool = True
    mode: str = "global"

    @field_validator("item_id")
    @classmethod
    def wikidata(cls, value: str) -> str:
        if value and not (value.startswith("Q") and value[1:].isdigit() and not value.startswith("Q0")):
            raise ValueError("천체 ID 형식이 올바르지 않습니다.")
        return value

    @field_validator("mode")
    @classmethod
    def known_mode(cls, value: str) -> str:
        if value not in {"global", "item"}:
            raise ValueError("대화 모드가 올바르지 않습니다.")
        return value

    def payload(self) -> dict:
        if self.mode == "item" and not self.item_id:
            raise HTTPException(422, "천체 전용 대화에는 천체 ID가 필요합니다.")
        return {
            "item_id": self.item_id,
            "question": self.question.strip(),
            "conversation_id": self.conversation_id,
            "request_id": self.request_id,
            "allow_external": self.allow_external,
            "mode": self.mode,
        }


def _chat_error(error: ChatError):
    raise HTTPException(error.status, error.payload)


@app.get("/api/health/")
def health():
    return {"status": "ok", "message": "FastAPI가 정상 작동합니다.", "backend": "fastapi"}


@app.post("/api/chat/")
def chat(body: ChatIn):
    try:
        payload, status = submit_chat(body.payload())
    except ChatError as error:
        return _json(error.payload, error.status)
    return _json(payload, status)


@app.post("/api/chat/stream/")
def chat_stream(body: ChatIn):
    response = stream_response(body.payload())
    return StreamingResponse(response.streaming_content, media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/celestial-objects/")
def celestial_objects():
    from rag.config import IndexConfig
    from rag.dataset import read_json
    from rag.store import ChromaStore

    try:
        config = IndexConfig.from_django()
        items = read_json(config.data_dir / "celestial_objects.json")
        try:
            store = ChromaStore(config, create=False)
            indexed = set(store.profiles.get(include=[])["ids"])
        except (ValueError, OSError, RuntimeError):
            indexed = set()
    except (ValueError, OSError, ImportError):
        return _json({"error": {"code": "items_unavailable", "message": "천체 목록을 불러올 수 없습니다."}}, 503)
    return {"items": [{"item_id": item["id"], "name_ko": item["name_ko"], "name_en": item.get("name_en"), "type": item["type"], "parent_id": item.get("parent_id"), "indexed": item["id"] in indexed} for item in items]}


class KnowledgeIn(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    item_id: str = ""
    top_k: int = Field(default=5, ge=1, le=10)

    @field_validator("item_id")
    @classmethod
    def wikidata(cls, value: str) -> str:
        if value and not (value.startswith("Q") and value[1:].isdigit() and not value.startswith("Q0")):
            raise ValueError("천체 ID 형식이 올바르지 않습니다.")
        return value


@app.post("/api/knowledge/search/")
def knowledge_search(body: KnowledgeIn):
    """플래너 Agent의 search_knowledge Tool이 부르는 검색 전용 엔드포인트. 답변은 만들지 않는다."""
    from rag.config import IndexConfig
    from rag.knowledge_search import KnowledgeSearchError, LazyQueryEmbeddings, no_index_error, search_knowledge
    from rag.scoped_retrieval import catalog_for
    from rag.store import ChromaStore

    try:
        try:
            config = IndexConfig.from_django()
            store = ChromaStore(config, create=False)
            catalog = catalog_for(config, store)
        except (ValueError, OSError, RuntimeError, ImportError):
            raise no_index_error() from None
        data = search_knowledge(store, LazyQueryEmbeddings(config), catalog, body.question, body.item_id or None, body.top_k)
    except KnowledgeSearchError as error:
        return _json({"ok": False, "error": {"code": error.code, "message": error.message}}, error.status)
    return {"ok": True, "data": data}


@app.get("/api/conversations/")
def conversations(mode: str | None = None, item_id: str | None = None, page: int = 1):
    queryset = Conversation.objects.all()
    if mode:
        queryset = queryset.filter(mode=mode)
    if item_id:
        queryset = queryset.filter(Q(item_id=item_id) | Q(turns__observed_item_id=item_id)).distinct()
    return _page(queryset, page)


@app.get("/api/conversations/{conversation_id}/")
def conversation_detail(conversation_id: uuid.UUID):
    conversation = Conversation.objects.filter(id=conversation_id).first()
    if conversation is None:
        raise HTTPException(404, "대화를 찾을 수 없습니다.")
    return _conversation(conversation)


@app.get("/api/conversations/{conversation_id}/turns/")
def conversation_turns(conversation_id: uuid.UUID, page: int = 1):
    conversation = Conversation.objects.filter(id=conversation_id).first()
    if conversation is None:
        raise HTTPException(404, "대화를 찾을 수 없습니다.")
    return _page(conversation.turns.all(), page, turn=True)


def _conversation(row: Conversation) -> dict:
    return {"id": str(row.id), "item_id": row.item_id, "mode": row.mode, "created_at": row.created_at, "updated_at": row.updated_at}


def _turn(row: ChatTurn) -> dict:
    return {
        "id": str(row.id),
        "conversation_id": str(row.conversation_id),
        "request_id": str(row.request_id),
        "observed_item_id": row.observed_item_id,
        "question": row.question,
        "allow_external": row.allow_external,
        "status": row.status,
        "result": row.result,
        "error_code": row.error_code,
        "created_at": row.created_at,
        "finished_at": row.finished_at,
    }


def _page(queryset, page: int, turn: bool = False) -> dict:
    paginator = Paginator(queryset, 20)
    current = paginator.get_page(page)
    rows = [_turn(item) if turn else _conversation(item) for item in current.object_list]
    return {"count": paginator.count, "page": current.number, "results": rows}


def _json(payload, status: int):
    from fastapi.responses import JSONResponse
    return JSONResponse(payload, status_code=status)
