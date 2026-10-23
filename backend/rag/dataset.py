import hashlib
import json
from dataclasses import dataclass, field
from urllib.parse import urlparse

from .chunking import CHUNKER_VERSION, chunk_document


@dataclass(frozen=True)
class Record:
    id: str
    text: str
    metadata: dict

    @property
    def fingerprint(self):
        payload = json.dumps([self.text, self.metadata], ensure_ascii=False, sort_keys=True)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()


@dataclass
class ItemPlan:
    item_id: str
    name: str
    profile: Record
    chunks: list
    document_count: int
    warnings: list = field(default_factory=list)


def read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError) as error:
        raise ValueError(f"Cannot read {path.name}: {type(error).__name__}") from None


def unique_map(rows, key, label):
    if not isinstance(rows, list):
        raise ValueError(f"{label} must be a JSON list.")
    result = {}
    for row in rows:
        if not isinstance(row, dict) or not row.get(key):
            raise ValueError(f"Invalid {label} record: missing {key}.")
        if row[key] in result:
            raise ValueError(f"Duplicate {label} ID: {row[key]}")
        result[row[key]] = row
    return result


def build_plans(config, only=None, *, include_english_originals=False):
    items = unique_map(read_json(config.data_dir / "celestial_objects.json"), "id", "item")
    documents = unique_map(read_json(config.data_dir / "documents.json"), "document_id", "document")
    links = read_json(config.data_dir / "item_documents.json")
    if not isinstance(links, list):
        raise ValueError("item_documents.json must be a list.")
    report = read_json(config.data_dir / "collection_report.json")
    statuses = {r["item_id"]: r["status"] for r in report["items"]}
    selected = list(dict.fromkeys(only)) if only else list(items)
    unknown = set(selected) - set(items)
    if unknown:
        raise ValueError(f"Unknown item IDs: {', '.join(sorted(unknown))}")

    plans, skipped = [], []
    for item_id in selected:
        item = items[item_id]
        search_text = item.get("search_text", "").strip()
        reason = None
        warnings = []
        base_complete = statuses.get(item_id) in {"complete", "cached"}
        if not base_complete and statuses.get(item_id) == "partial":
            checkpoint = config.data_dir.parent / "items" / f"{item_id}.json"
            if checkpoint.is_file():
                state = read_json(checkpoint)
                base_complete = (
                    state.get("item_id") == item_id
                    and state.get("item", {}).get("id") == item_id
                    and state.get("bilingual_failure") is True
                    and state.get("status_before_bilingual") in {"complete", "cached"}
                    and state.get("item") == item
                )
                if base_complete:
                    warnings.append("Base collection complete; English enrichment failed. Using validated local sources.")
        if not base_complete:
            reason = "collection not complete"
        elif not search_text:
            reason = "search_text is empty"
        if reason:
            if only:
                raise ValueError(f"{item_id}: {reason}. Re-collect this item first.")
            skipped.append((item_id, reason))
            continue

        # One document may be linked through several research topics/roles.
        roles = {}
        for link in links:
            if link["item_id"] == item_id:
                roles.setdefault(link["document_id"], set()).add(link["role"])
        own_id = item.get("own_document_id")
        if own_id not in roles or "own" not in roles[own_id]:
            raise ValueError(f"{item_id}: own document link is missing.")
        chunks = []
        indexed_documents = 0
        for document_id in sorted(roles):
            if document_id not in documents:
                raise ValueError(f"Missing linked document: {document_id}")
            document = documents[document_id]
            for key in ("source_url", "revision_url", "license_url"):
                if urlparse(str(document.get(key, ""))).scheme not in {"http", "https"}:
                    raise ValueError(f"{document_id}: {key} is missing/invalid.")
            if not document.get("revision_id"):
                raise ValueError(f"{document_id}: revision_id is missing.")
            source_language = document.get("language") or ("en" if document_id.startswith("enwiki:") else "ko")
            translation = document.get("translation", {})
            if source_language == "en" and translation.get("status") != "verified":
                if include_english_originals:
                    warnings.append(f"{document_id}: indexing English original; not a verified Korean translation.")
                elif document_id == own_id:
                    raise ValueError(f"{document_id}: own source is untranslated English. Use --include-english-originals or complete translation first.")
                else:
                    warnings.append(f"{document_id}: skipped untranslated English supplement.")
                    continue
            if translation.get("status") == "verified":
                text_hash = hashlib.sha256(json.dumps(document["paragraphs"], sort_keys=True, ensure_ascii=False).encode()).hexdigest()
                if translation.get("text_hash") != text_hash:
                    raise ValueError(f"{document_id}: translated text changed after verification")
                if translation.get("model") != "gpt-6-luna" or str(translation.get("source_revision")) != str(document["revision_id"]):
                    raise ValueError(f"{document_id}: translation model/revision mismatch")
            pieces = chunk_document(document, config.chunk_size, config.chunk_overlap)
            if not pieces:
                raise ValueError(f"{document_id}: no indexable text remains.")
            indexed_documents += 1
            for piece in pieces:
                metadata = {
                    "item_id": item_id,
                    "document_id": document_id,
                    "title": document["title"],
                    "section": piece["section"],
                    "source_url": document["source_url"],
                    "revision_id": str(document["revision_id"]),
                    "revision_url": document["revision_url"],
                    "license_url": document["license_url"],
                    "role": "own" if "own" in roles[document_id] else sorted(roles[document_id])[0],
                    "roles": ",".join(sorted(roles[document_id])),
                    "paragraph_ids": json.dumps(piece["paragraph_ids"]),
                    "chunk_index": piece["chunk_index"],
                    "chunk_size": config.chunk_size,
                    "chunk_overlap": config.chunk_overlap,
                    "chunker_version": CHUNKER_VERSION,
                }
                if source_language == "en" and translation.get("status") != "verified":
                    metadata.update({"source_language": "en", "index_language": "en", "is_translation": False})
                if translation.get("status") == "verified":
                    ids = set(piece["paragraph_ids"])
                    metadata.update({
                        "source_language": "en", "index_language": "ko", "is_translation": True,
                        "translation_model": translation["model"], "translation_version": translation["version"],
                        "translation_hash": translation["signature"],
                        "original_passages": json.dumps([{"paragraph_id": p["id"], "section": p["section"], "text": p["text"]}
                            for p in document["paragraphs"] if p["id"] in ids], ensure_ascii=False),
                    })
                chunks.append(Record(
                    id=f"{item_id}:{document_id}:{piece['chunk_index']:04d}",
                    text=piece["text"], metadata=metadata,
                ))
        profile = Record(item_id, search_text, {
            "item_id": item_id,
            "name_ko": item["name_ko"],
            "name_en": item.get("name_en") or "",
            "type": item["type"],
            "parent_id": item.get("parent_id") or "",
            "own_document_id": own_id,
            "source_url": item["wikipedia_url"],
            "wikidata_url": item["wikidata_url"],
        })
        plans.append(ItemPlan(item_id, item["name_ko"], profile, chunks, indexed_documents, warnings))
    if not plans:
        raise ValueError("No completed items with searchable text to index.")
    return plans, skipped
