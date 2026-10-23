"""Balanced multi-item retrieval and unfiltered global Chroma search."""
import math
import re
from .timing import timed


def catalog_for(config, store):
    from .dataset import read_json
    items = read_json(config.data_dir / "celestial_objects.json")
    catalog = {item["id"]: {"id": item["id"], "name": item["name_ko"],
               "type": item.get("type", ""), "indexed": False} for item in items}
    for item in items:
        aliases = item.get("aliases", {})
        names = [item.get("name_en", "")]
        if isinstance(aliases, dict):
            names.extend(name for values in aliases.values() if isinstance(values, list) for name in values if isinstance(name, str))
        catalog[item["id"]]["aliases"] = [name for name in names if name]
    stored = store.profiles.get(include=["metadatas"])
    for key, metadata in zip(stored["ids"], stored["metadatas"]):
        catalog.setdefault(key, {"id": key, "name": (metadata or {}).get("name_ko", key), "type": ""})
        catalog[key]["indexed"] = True
    return catalog


@timed("retrieve.scoped")
def retrieve_scoped(store, embeddings, catalog, observed_id, question, targets=None, top_k=12):
    ids = list(dict.fromkeys(targets or []))
    profile_rows = store.profiles.get(ids=ids, include=["documents", "metadatas"]) if ids else store.profiles.get(include=["documents", "metadatas"])
    profiles = [{"text": text, "metadata": meta} for text, meta in
                zip(profile_rows["documents"], profile_rows["metadatas"]) if text and meta]
    chunks = []
    def query(where, limit):
        count = len(store.documents.get(where=where, include=[])["ids"]) if where else store.documents.count()
        if not count:
            return []
        options = {"query_embeddings": [embeddings.embed_query(question)], "n_results": min(count, limit * 3),
                   "include": ["documents", "metadatas", "distances"]}
        if where:
            options["where"] = where
        found = store.documents.query(**options)
        selected, seen = [], set()
        rows = zip(found["ids"][0], found["documents"][0], found["metadatas"][0], found["distances"][0])
        for key, text, meta, distance in sorted(rows, key=lambda row: row[3]):
            meta = meta or {}
            owner = meta.get("item_id")
            if owner not in catalog or (where and owner != where["item_id"]):
                continue
            if not text or not math.isfinite(distance):
                continue
            normalized = (owner, re.sub(r"\s+", " ", text).strip())
            if normalized in seen:
                continue
            seen.add(normalized)
            selected.append({"id": key, "text": text, "metadata": meta, "distance": float(distance)})
            if len(selected) == limit:
                break
        return selected
    if ids:
        per_item = max(1, min(top_k, 20))
        for item in ids:
            chunks.extend(query({"item_id": item}, per_item))
    else:
        chunks = query(None, min(top_k, 20))
        # Include only owners of relevant results, plus observed context, in prompt.
        owners = {chunk["metadata"]["item_id"] for chunk in chunks}
        profiles = [p for p in profiles if p["metadata"].get("item_id") in owners]
    for rank, chunk in enumerate(chunks, 1):
        chunk["rank"] = rank
    context_ids = ids or list(dict.fromkeys(chunk["metadata"]["item_id"] for chunk in chunks))
    context = "\n\n".join(p["text"] for p in profiles) or "대상: " + ", ".join(catalog[i]["name"] for i in context_ids)
    return {"item_id": observed_id, "question": question, "profiles": profiles,
            "profile": {"text": context, "metadata": {}}, "chunks": chunks,
            "target_ids": ids, "top_k": top_k, "indexed_chunks": len(chunks)}


def merge_retrieval(first, second):
    result = {**second}
    chunks = {chunk["id"]: chunk for chunk in first["chunks"]}
    chunks.update({chunk["id"]: chunk for chunk in second["chunks"]})
    profiles = {p["metadata"]["item_id"]: p for p in first["profiles"]}
    profiles.update({p["metadata"]["item_id"]: p for p in second["profiles"]})
    result["chunks"] = list(chunks.values())
    result["profiles"] = list(profiles.values())
    result["profile"] = {"text": "\n\n".join(p["text"] for p in profiles.values()), "metadata": {}}
    return result
