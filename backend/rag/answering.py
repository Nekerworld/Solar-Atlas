"""Select grounded evidence, generate cited statements, resolve stored sources.

These independent functions can later become LangGraph nodes. No graph or web
collection is executed here. Structural citation validation is deterministic;
semantic relevance and entailment still depend on the model and evaluation.
"""
import re
import json
import logging
from urllib.parse import urlparse
from .persona import ATLAS_VOICE


COVERAGES = {"insufficient": 0, "partial": 1, "sufficient": 2}
SELECT_PROMPT = """Select only excerpts DIRECTLY useful for answering the question.
Split multi-part questions conceptually: a comparison needs evidence for BOTH sides.
Similarity ranking is not proof of relevance. Exclude mythology when the question
is about physical processes. M1... are item metadata, C1... are source chunks. The observed item_id is context only; answer the actual question across the supplied subjects. Never substitute a different body for a named target.
Return {"coverage":"sufficient|partial|insufficient",
"missing_information":["question-specific gaps, not speculative answers"],
"selected":[{"evidence_id":"C1", "quote":"exact nonempty substring of that candidate's text"}]}.
Select at most max_evidence excerpts, one per ID. Copy quotes EXACTLY, including spaces.
Use sufficient only if the selected excerpts cover every requested part. Use partial
if they support only part; insufficient if no direct answer is supported. Do not
select a vague occurrence of the item's name as evidence. Never invent IDs or facts.
"""
ANSWER_PROMPT = ATLAS_VOICE + """Answer the question using ONLY the selected evidence excerpts.
The full item_profile is basic context; factual answer statements must be supported
by the selected quotes and cite their evidence IDs. Never use unselected passages
or your own knowledge to fill gaps. Do not claim that missing data means something
does not exist. Distinguish evidence gaps from scientific uncertainty.
Return {"coverage":"sufficient|partial|insufficient",
"missing_information":["unanswered parts of the question"],
"statements":[{"text":"one concise Korean explanation supported by the cited quotes",
"evidence_ids":["C1"]}]}.
Every statement needs at least one selected evidence ID. No URLs, titles invented
as sources, Markdown citation markers, or evidence IDs inside text; the server
adds citations and looks up real sources. If insufficient, return statements=[].
Do not upgrade the supplied evidence coverage. Preserve uncertainty and avoid
unrelated numerical facts. Do not include uncited introductions or conclusions.
Keep units, reference conditions and measurement dates attached to numbers. Do
not present an undated time-varying measurement as a current exact value. Omit
optional unstable numbers if their context cannot be verified; explain a material
limitation briefly. Distinguish fixed reference proportions from variable
components rather than mixing them into one sample. Do not invent qualifications
that are absent from the selected evidence.
answer_guidance describes the requested scope and distinctions identified during
evidence assessment; it is NOT an independent factual source. Preserve material
definitions, conditions and qualifications when composing the answer, rather
than dropping them and selecting only one of several different interpretations.
Verify every guidance claim against the selected quotes; quotes take precedence.
Answer the requested claim with the minimum necessary scope. Do not add unasked
uniqueness, rankings or population-wide exclusivity merely because an incidental
source phrase contains them. A narrow property explanation does not require an
assertion that no other object has that property.
For context-dependent follow-ups, name the resolved subject once so the user can
tell what the answer refers to. History and observed_body explain references,
not scientific facts; an explicit current-view reference uses observed_body,
while a reference to an earlier discussed subject uses the conversation context.
"""


def _coverage(value):
    if not isinstance(value, str) or value not in COVERAGES:
        raise ValueError("Invalid model coverage field.")
    return value


def _plain(value, limit=2000):
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        return None
    if re.search(r"https?://|www\.|\[[^\]]*\]", value, re.I):
        return None
    return value.strip()


def _missing(value):
    if not isinstance(value, list):
        raise ValueError("missing_information must be a list.")
    return list(dict.fromkeys(v for x in value[:8] if (v := _plain(x, 400))))


def _source(metadata, item_id, profile=False):
    if metadata.get("item_id") != item_id:
        raise ValueError("Evidence belongs to a different item.")
    url = metadata.get("source_url", "")
    parsed = urlparse(url)
    title = metadata.get("name_ko") if profile else metadata.get("title")
    if not title or parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Evidence is missing a stored title/source URL. Re-index this item.")
    return {
        "title": title,
        "url": url,
        "document_id": metadata.get("own_document_id" if profile else "document_id", ""),
        "section": "천체 메타데이터" if profile else metadata.get("section", ""),
        "revision_id": metadata.get("revision_id", ""),
        "revision_url": metadata.get("revision_url", ""),
        "license_url": metadata.get("license_url", ""),
        "kind": "metadata" if profile else "document",
        "is_translation": bool(metadata.get("is_translation", False)),
        "source_language": metadata.get("source_language", ""),
        "translation_model": metadata.get("translation_model", ""),
        "original_passages": json.loads(metadata.get("original_passages") or "[]"),
    }


def evidence_candidates(retrieval):
    profiles = retrieval.get("profiles")
    if profiles is None:
        profiles = [retrieval["profile"]]
    candidates = []
    for number, profile in enumerate(profiles, 1):
        owner = profile["metadata"]["item_id"]
        candidates.append({"evidence_id": f"M{number}", "text": profile["text"],
            "record_id": owner, "item_id": owner,
            "source": {**_source(profile["metadata"], owner, profile=True), "item_id": owner}})
    for number, chunk in enumerate(retrieval["chunks"], 1):
        owner = chunk["metadata"].get("item_id", retrieval["item_id"])
        candidates.append({"evidence_id": f"C{number}", "text": chunk["text"],
            "record_id": chunk["id"], "item_id": owner,
            "source": {**_source(chunk["metadata"], owner), "item_id": owner}})
    return candidates


def select_evidence(retrieval, model, max_evidence=8):
    if not 1 <= max_evidence <= 12:
        raise ValueError("max_evidence must be between 1 and 12.")
    candidates = evidence_candidates(retrieval)
    lookup = {c["evidence_id"]: c for c in candidates}
    result = model.json(SELECT_PROMPT, {
        "item_id": retrieval["item_id"], "question": retrieval["question"],
        "max_evidence": max_evidence,
        # Actual URLs are resolved by code, never generated by the model.
        "candidates": [{"evidence_id": c["evidence_id"], "item_id": c["item_id"], "title": c["source"]["title"],
                        "section": c["source"]["section"], "text": c["text"]} for c in candidates],
    })
    coverage = _coverage(result.get("coverage"))
    missing = _missing(result.get("missing_information"))
    if not isinstance(result.get("selected"), list):
        raise ValueError("Evidence selection must contain a selected list.")
    selected, seen, rejected = [], set(), 0
    for entry in result["selected"]:
        if not isinstance(entry, dict):
            rejected += 1
            continue
        evidence_id, quote = entry.get("evidence_id"), entry.get("quote")
        if not isinstance(evidence_id, str) or evidence_id not in lookup or not isinstance(quote, str):
            rejected += 1
            continue
        quote = quote.strip()
        candidate = lookup[evidence_id]
        if not quote or quote not in candidate["text"]:
            logging.getLogger("rag.timing").info("[EVIDENCE REJECT] id=%s title=%r reason=quote_not_exact",
                evidence_id, candidate["source"]["title"])
            rejected += 1
            continue
        if evidence_id in seen:
            continue
        if len(selected) == max_evidence:
            rejected += 1
            continue
        seen.add(evidence_id)
        selected.append({
            "evidence_id": evidence_id, "quote": quote,
            "record_id": candidate["record_id"], "source": candidate["source"],
        })
    if not selected or coverage == "insufficient":
        coverage = "insufficient"
        selected = []
    elif rejected or missing:
        coverage = min(coverage, "partial", key=COVERAGES.get)
    if coverage != "sufficient" and not missing:
        missing = ["질문의 모든 부분을 설명할 만큼 정보를 확인하지 못했어요."]
    return {"coverage": coverage, "missing_information": missing,
            "evidence": selected, "rejected_evidence": rejected}


def generate_answer(retrieval, selection, model, *, guidance=None):
    coverage = selection["coverage"]
    missing = list(selection["missing_information"])
    warnings = []
    if selection["rejected_evidence"]:
        warnings.append("출처와 정확히 맞지 않는 내용은 설명에서 제외했어요.")
    statements, rejected = [], 0
    lookup = {e["evidence_id"]: e for e in selection["evidence"]}
    if coverage != "insufficient" and lookup:
        result = model.json(ANSWER_PROMPT, {
            "item_id": retrieval["item_id"], "question": retrieval["question"],
            "item_profile": retrieval["profile"]["text"],
            "evidence_coverage": coverage, "missing_information": missing,
            "answer_guidance": guidance or {},
            "evidence": [{"evidence_id": e["evidence_id"], "quote": e["quote"]}
                         for e in selection["evidence"]],
        })
        coverage = min(coverage, _coverage(result.get("coverage")), key=COVERAGES.get)
        missing = list(dict.fromkeys(missing + _missing(result.get("missing_information"))))
        if not isinstance(result.get("statements"), list):
            raise ValueError("Answer must contain a statements list.")
        if coverage != "insufficient":
            for statement in result["statements"]:
                if not isinstance(statement, dict):
                    rejected += 1
                    continue
                text = _plain(statement.get("text"))
                ids = statement.get("evidence_ids")
                if not text or not isinstance(ids, list) or not ids or any(
                    not isinstance(eid, str) or eid not in lookup for eid in ids
                ):
                    logging.getLogger("rag.timing").info("[STATEMENT REJECT] reason=%s evidence_ids=%r",
                        "invalid_text" if not text else "invalid_or_unselected_evidence_ids", ids)
                    rejected += 1
                    continue
                statements.append({"text": text, "evidence_ids": list(dict.fromkeys(ids))})
    if not statements:
        coverage = "insufficient"
    elif rejected or missing:
        coverage = min(coverage, "partial", key=COVERAGES.get)
    if rejected:
        warnings.append(f"출처를 확인하지 못한 설명 {rejected}개는 답변에서 제외했어요.")
    if coverage != "sufficient" and not missing:
        missing = ["질문의 모든 부분을 설명할 만큼 정보를 확인하지 못했어요."]

    sources, used = [], set()
    lines = []
    for statement in statements:
        citations = " ".join(f"[{eid}]" for eid in statement["evidence_ids"])
        lines.append(f"{statement['text']} {citations}")
        for eid in statement["evidence_ids"]:
            if eid not in used:
                used.add(eid)
                evidence = lookup[eid]
                sources.append({"evidence_id": eid, **evidence["source"],
                                "record_id": evidence["record_id"], "quote": evidence["quote"]})
    if coverage == "insufficient":
        lines = ["아직 이 질문에 답할 만큼 확실한 정보를 확인하지 못했어요."]
        sources = []
    elif coverage == "partial":
        lines.append("여기까지는 확인했어요. 다만 질문의 나머지 부분은 더 확인이 필요해요.")
    if coverage != "sufficient":
        lines.append("더 확인이 필요한 내용: " + "; ".join(missing))
    return {
        "item_id": retrieval["item_id"], "question": retrieval["question"],
        "coverage": coverage, "answer": "\n\n".join(lines),
        "statements": statements, "sources": sources,
        "missing_information": missing, "warnings": warnings,
        "selected_evidence": selection["evidence"],
        "retrieved_chunks": len(retrieval["chunks"]),
    }


def answer_from_retrieval(retrieval, model, max_evidence=8):
    selection = select_evidence(retrieval, model, max_evidence)
    return generate_answer(retrieval, selection, model)
