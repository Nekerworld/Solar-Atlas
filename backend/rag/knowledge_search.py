"""F3022 지식 검색. 질문으로 2차 Chroma를 검색해 근거와 출처만 반환한다.

답변은 만들지 않는다. 질문 임베딩에만 GMS를 쓰고, 오류 상세는 밖으로 내보내지 않는다.
"""
from __future__ import annotations

from .scoped_retrieval import retrieve_scoped

SNIPPET_CHARS = 600
MAX_TOP_K = 10


class KnowledgeSearchError(Exception):
    def __init__(self, code: str, message: str, status: int):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


class LazyQueryEmbeddings:
    """색인이 없으면 키가 없어도 임베딩 클라이언트를 만들지 않는다."""

    def __init__(self, config):
        self.config = config

    def embed_query(self, text: str):
        from .embeddings import GMSEmbeddings

        return GMSEmbeddings(self.config).embed_query(text)


def _snippet(text: str, limit: int = SNIPPET_CHARS) -> str:
    flat = " ".join((text or "").split())
    return flat if len(flat) <= limit else flat[:limit].rstrip() + "..."


def no_index_error() -> KnowledgeSearchError:
    return KnowledgeSearchError("NO_INDEX", "색인이 없어 지식 검색을 할 수 없습니다.", 503)


def search_knowledge(store, embeddings, catalog: dict, question: str, item_id: str | None = None, top_k: int = 5) -> dict:
    question = (question or "").strip()
    if not question:
        raise KnowledgeSearchError("INVALID_INPUT", "질문이 비어 있습니다.", 422)
    if not 1 <= top_k <= MAX_TOP_K:
        raise KnowledgeSearchError("INVALID_INPUT", f"top_k는 1부터 {MAX_TOP_K} 사이여야 합니다.", 422)
    item_id = (item_id or "").strip() or None
    if item_id is not None:
        entry = catalog.get(item_id)
        if entry is None or not entry.get("indexed"):
            raise no_index_error()
    elif not any(entry.get("indexed") for entry in catalog.values()):
        raise no_index_error()
    try:
        result = retrieve_scoped(store, embeddings, catalog, item_id, question, [item_id] if item_id else None, top_k)
    except Exception:
        raise KnowledgeSearchError("EXTERNAL_API_ERROR", "지식 검색에 실패했습니다.", 502) from None
    sources = []
    for chunk in result.get("chunks") or []:
        meta = chunk.get("metadata") or {}
        owner = meta.get("item_id")
        sources.append({
            "rank": chunk.get("rank", len(sources) + 1),
            "item_id": owner,
            "item_name": (catalog.get(owner) or {}).get("name"),
            "title": meta.get("title"),
            "section": meta.get("section"),
            "source_url": meta.get("source_url"),
            "revision_id": meta.get("revision_id"),
            "distance": round(float(chunk.get("distance", 0.0)), 4),
            "snippet": _snippet(chunk.get("text")),
        })
    if not sources:
        raise KnowledgeSearchError("NO_RESULT", "질문과 관련된 근거 문서를 찾지 못했습니다.", 404)
    return {"question": question, "item_id": item_id, "sources": sources}
