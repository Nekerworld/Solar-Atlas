"""Balanced and document-focused retrieval for model-planned context."""
import math
from .scoped_retrieval import retrieve_scoped, merge_retrieval


def retrieve_context(store, embeddings, catalog, observed_id, context, top_k):
    # Always include unfiltered global results. Extra per-target results prevent a
    # single article from occupying the whole evidence window in comparisons.
    result = retrieve_scoped(store, embeddings, catalog, observed_id, context["search_question"], None, top_k)
    targets = context["target_ids"]
    if targets:
        balanced = retrieve_scoped(store, embeddings, catalog, observed_id, context["search_question"], targets, 2)
        result = merge_retrieval(balanced, result)
    result["target_ids"] = targets
    return result


def prioritize_collected(retrieval, store, embeddings, documents, question):
    """Search accepted documents directly, including unchanged indexed pages."""
    preferred, seen = [], set()
    for document in documents[:4]:
        owner, doc_id = document.get("item_id"), document.get("document_id")
        if not owner or not doc_id or (owner, doc_id) in seen:
            continue
        seen.add((owner, doc_id))
        where = {"$and": [{"item_id": owner}, {"document_id": doc_id}]}
        if document.get("parser_version"):
            where["$and"].append({"parser_version": document["parser_version"]})
        count = len(store.documents.get(where=where, include=[])["ids"])
        if not count:
            continue
        found = store.documents.query(where=where, query_embeddings=[embeddings.embed_query(question)],
            n_results=min(count, 4), include=["documents", "metadatas", "distances"])
        for key, text, meta, distance in zip(found["ids"][0], found["documents"][0],
                                           found["metadatas"][0], found["distances"][0]):
            if (text and meta and meta.get("item_id") == owner and meta.get("document_id") == doc_id
                    and math.isfinite(distance)):
                preferred.append({"id": key, "text": text, "metadata": meta, "distance": float(distance)})
    result = dict(retrieval)
    result["chunks"] = list({chunk["id"]: chunk for chunk in [*preferred, *retrieval["chunks"]]}.values())
    return result
