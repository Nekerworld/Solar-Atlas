"""Preserve linked table notes that qualify numerical data, without new HTTP calls."""
from bs4 import BeautifulSoup

PARSER_VERSION = "table-context-v2"


def preserve_table_context(document):
    raw = document.get("raw_html")
    if not isinstance(raw, str):
        return document
    soup = BeautifulSoup(raw, "html.parser")
    tables = []
    for table in soup.select("table.infobox, table.wikitable"):
        notes = []
        for anchor in table.select('sup.reference a[href^="#"]'):
            node = soup.find(id=anchor.get("href", "")[1:])
            if node is None:
                continue
            text = node.get_text(" ", strip=True).lstrip("↑ ")[:600]
            if text and text not in notes:
                notes.append(text)
        tables.append((table.get_text(" ", strip=True), notes[:8]))
    paragraphs = []
    for paragraph in document["paragraphs"]:
        paragraph = dict(paragraph)
        if paragraph.get("kind") == "table":
            for text, notes in tables:
                if paragraph["text"] in text and notes:
                    paragraph["text"] += "\n표의 조건과 주석: " + " / ".join(notes)
                    break
        paragraphs.append(paragraph)
    return {**document, "paragraphs": paragraphs,
            "content": "\n\n".join(p["text"] for p in paragraphs), "parser_version": PARSER_VERSION}
