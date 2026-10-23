"""Section-aware character chunks. No HTML or source JSON is embedded."""
import html
import re
from itertools import groupby


EXCLUDED_SECTIONS = {
    "각주", "주석", "참고 문헌", "참고문헌", "외부 링크", "외부링크",
    "같이 보기", "같이보기", "출처", "더 읽기",
    "References", "Notes", "Footnotes", "Bibliography", "External links", "See also", "Further reading", "Sources",
}
CHUNKER_VERSION = "section-paragraph-v1"


def clean_text(text):
    text = html.unescape(text)
    # MediaWiki sometimes exposes style rules as text. Keep scientific formulae.
    text = re.sub(r"\.mw-parser-output[^{}]*\{[^{}]*\}", " ", text)
    text = text.replace("\u200b", "").replace("\xa0", " ")
    text = re.sub(r"\[(?:\d+(?:\s*,\s*\d+)*|편집)\]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def chunk_document(document, size, overlap):
    if size <= 0 or not 0 <= overlap < size:
        raise ValueError("Invalid chunk size/overlap.")
    paragraphs = document.get("paragraphs")
    if not isinstance(paragraphs, list) or not paragraphs:
        raise ValueError(f"No paragraphs: {document.get('document_id')}")
    translated = document.get("translation", {}).get("status") == "verified"
    cleaned = []
    for paragraph in paragraphs:
        section = str(paragraph.get("section") or "개요").strip()
        if any(part.strip() in EXCLUDED_SECTIONS for part in re.split(r"\s*[>/]\s*", section)):
            continue
        if translated and not paragraph.get("translated_text"):
            raise ValueError("Verified translation is missing a paragraph")
        text = clean_text(paragraph.get("translated_text") if translated else paragraph.get("text", ""))
        if translated:
            section = str(paragraph.get("translated_section") or section)
        if text:
            cleaned.append((section, str(paragraph["id"]), text))

    chunks = []
    # Only consecutive paragraphs of the same section are combined.
    for section, entries in groupby(cleaned, key=lambda p: p[0]):
        parts, spans, cursor = [], [], 0
        for _, paragraph_id, text in entries:
            if parts:
                cursor += 2
            spans.append((cursor, cursor + len(text), paragraph_id))
            parts.append(text)
            cursor += len(text)
        body = "\n\n".join(parts)
        start = 0
        while start < len(body):
            end = min(start + size, len(body))
            if end < len(body):
                # Prefer paragraph boundaries, then sentence/word boundaries.
                lower = start + max(size // 2, overlap + 1)
                if lower < end:
                    boundary = body.rfind("\n\n", lower, end)
                    if boundary >= 0:
                        end = boundary + 2
                    else:
                        boundary = body.rfind(" ", lower, end)
                        if boundary >= 0:
                            end = boundary + 1
            text = body[start:end].strip()
            if text:
                chunks.append({
                    "text": text,
                    "section": section,
                    "paragraph_ids": [pid for a, b, pid in spans if a < end and b > start],
                    "chunk_index": len(chunks),
                })
            if end == len(body):
                break
            start = max(start + 1, end - overlap)
    return chunks
