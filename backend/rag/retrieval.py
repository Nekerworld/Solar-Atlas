"""Item-scoped retrieval, reusable by a future LangGraph search node."""
from .timing import measure
import math
import re


def retrieve(store, embeddings, item_id, question, top_k=5):
    item_id = item_id.strip()
    question = question.strip()
    if not item_id or not question:
        raise ValueError("item_id and question must not be empty.")
    if not 1 <= top_k <= 20:
        raise ValueError("top_k must be between 1 and 20.")

    with measure('chroma.profile_get'):
        profile = store.profiles.get(ids=[item_id], include=["documents", "metadatas"])
    if not profile["ids"]:
        raise ValueError(f"{item_id} is not indexed. Run index_solar --only {item_id} first.")
    profile_metadata = (profile.get("metadatas") or [None])[0] or {}
    profile_text = (profile.get("documents") or [None])[0]
    if profile_metadata.get("item_id") != item_id or not profile_text:
        raise ValueError(f"{item_id}: invalid stored item metadata. Re-index this item.")

    # Check before spending an embedding request. Never create collections here.
    with measure('chroma.document_ids_get'):
        available = store.documents.get(where={"item_id": item_id}, include=[])
    count = len(available["ids"])
    if not count:
        raise ValueError(f"{item_id} has no indexed chunks. Re-index this item.")

    with measure('embedding.query'):
        query_vector = embeddings.embed_query(question)
    with measure('chroma.vector_query'):
        found = store.documents.query(
            query_embeddings=[query_vector],
            n_results=min(count, top_k * 3),
            where={"item_id": item_id},
            include=["documents", "metadatas", "distances"],
        )
    ids = found["ids"][0]
    texts = found["documents"][0]
    metadatas = found["metadatas"][0]
    distances = found["distances"][0]
    if not (len(ids) == len(texts) == len(metadatas) == len(distances)):
        raise ValueError("Chroma returned inconsistent search results.")
    chunks, seen_ids, seen_texts = [], set(), set()
    candidates = sorted(zip(ids, texts, metadatas, distances), key=lambda row: row[3])
    for chunk_id, text, metadata, distance in candidates:
        metadata = metadata or {}
        if metadata.get("item_id") != item_id:
            raise ValueError("Search returned a chunk from a different item.")
        if not text or not math.isfinite(distance):
            raise ValueError("Chroma returned an empty chunk or invalid distance.")
        normalized = re.sub(r"\s+", " ", text).strip()
        if chunk_id in seen_ids or normalized in seen_texts:
            continue
        seen_ids.add(chunk_id)
        seen_texts.add(normalized)
        chunks.append({
            "rank": len(chunks) + 1,
            "id": chunk_id,
            "distance": float(distance),
            "text": text,
            "metadata": metadata,
        })
        if len(chunks) == top_k:
            break
    return {
        "item_id": item_id,
        "question": question,
        "profile": {"text": profile_text, "metadata": profile_metadata},
        "indexed_chunks": count,
        "top_k": top_k,
        "chunks": chunks,
    }
