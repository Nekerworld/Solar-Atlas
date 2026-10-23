// Keep evidence IDs in the response for validation; expose document links to readers.
export function safeSourceUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function presentAnswer(result) {
  const sources = (Array.isArray(result.sources) ? result.sources : []).filter(source => source && safeSourceUrl(source.url));
  const sourceById = new Map();
  for (const source of sources) {
    if (typeof source.evidence_id === "string" && !sourceById.has(source.evidence_id)) sourceById.set(source.evidence_id, source);
  }
  const numbers = new Map();
  const parts = [];
  function cite(ids) {
    return [...new Set(ids)].filter(id => sourceById.has(id)).map(id => {
      if (!numbers.has(id)) numbers.set(id, numbers.size + 1);
      return { evidenceId: id, number: numbers.get(id) };
    });
  }
  const statements = Array.isArray(result.statements)
    ? result.statements.filter((statement) => statement && typeof statement.text === "string" && statement.text.trim()) : [];
  let answer;
  if (typeof result.display_answer === "string" && result.display_answer.trim()) {
    answer = result.display_answer;
  } else if (statements.length && result.coverage !== "insufficient") {
    const lines = statements.map((statement) => statement.text);
    if (result.coverage === "partial") lines.push("현재 근거로는 질문의 일부만 답변할 수 있습니다.");
    const missing = [...new Set((result.missing_information || []).filter((value) => typeof value === "string" && value.trim()))];
    if (result.coverage !== "sufficient" && missing.length) lines.push("부족한 정보: " + missing.join("; "));
    answer = lines.join("\n\n");
  } else {
    // Older saved turns can retain explicit evidence markers.
    answer = result.answer || "";
  }
  // Locate exact validated statements in the displayed response. Preserve server
  // introductions/endings and never guess a source from the sentence's meaning.
  let cursor = 0;
  const spans = [];
  for (const statement of statements) {
    const start = answer.indexOf(statement.text, cursor);
    if (start < 0) { spans.length = 0; break; }
    spans.push({ start, end: start + statement.text.length, statement });
    cursor = start + statement.text.length;
  }
  if (spans.length) {
    cursor = 0;
    for (const span of spans) {
      if (span.start > cursor) parts.push({ text: answer.slice(cursor, span.start), citations: [] });
      parts.push({ text: span.statement.text, citations: cite(Array.isArray(span.statement.evidence_ids) ? span.statement.evidence_ids : []) });
      cursor = span.end;
    }
    if (cursor < answer.length) parts.push({ text: answer.slice(cursor), citations: [] });
  } else {
    // Older turns may retain explicit evidence markers but no statements.
    cursor = 0;
    for (const match of answer.matchAll(/\[(M\d+|C\d+)\]/g)) {
      if (!sourceById.has(match[1])) continue;
      parts.push({ text: answer.slice(cursor, match.index), citations: cite([match[1]]) });
      cursor = match.index + match[0].length;
    }
    parts.push({ text: answer.slice(cursor), citations: [] });
  }
  const cards = [];
  const seenItems = new Set();
  if (result.response_mode === "discovery") for (const card of Array.isArray(result.cards) ? result.cards : []) {
    if (!card || !/^Q[1-9][0-9]*$/.test(card.item_id || "") || seenItems.has(card.item_id)
        || typeof card.name !== "string" || !card.name.trim() || typeof card.reason !== "string" || !card.reason.trim()) continue;
    const citations = cite(Array.isArray(card.evidence_ids) ? card.evidence_ids : []);
    if (!citations.length) continue;
    seenItems.add(card.item_id);
    cards.push({ itemId: card.item_id, name: card.name, reason: card.reason, citations });
  }
  const numbered = numbers.size > 0;
  const hasExplicitMapping = result.response_mode === "discovery" || spans.some(span => Array.isArray(span.statement.evidence_ids));
  const displayedSources = numbered ? [...numbers.keys()].map(id => sourceById.get(id)) : hasExplicitMapping ? [] : sources;
  const groups = new Map();
  for (const source of displayedSources) {
    const href = safeSourceUrl(source.url);
    if (!href) continue;
    const url = new URL(href);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || key === "fbclid") url.searchParams.delete(key);
    }
    // Article identity is independent of the cited section or revision URL.
    const wiki = /(^|\.)wikipedia\.org$/i.test(url.hostname);
    const pageId = source.document_id?.match(/^(?:ko|en)wiki:(\d+)$/)?.[1] || url.searchParams.get("curid");
    const key = wiki && pageId ? `${url.hostname}:page:${pageId}` : url.href;
    if (!groups.has(key)) groups.set(key, {
      key, url: url.href, title: source.title || "참고 문서", wiki, sections: [], quotes: [], count: 0, translated: false, originalPassages: [], evidence: [],
    });
    const group = groups.get(key);
    group.count += 1;
    if (numbers.has(source.evidence_id)) group.evidence.push({
      evidenceId: source.evidence_id, number: numbers.get(source.evidence_id),
      section: source.section || "", quote: source.quote || "",
      kind: source.kind || "document",
    });
    group.translated ||= source.is_translation === true;
    for (const passage of source.original_passages || []) {
      if (typeof passage.text === "string" && !group.originalPassages.includes(passage.text)) group.originalPassages.push(passage.text);
    }
    if (source.section && !group.sections.includes(source.section)) group.sections.push(source.section);
    if (source.quote && !group.quotes.includes(source.quote)) group.quotes.push(source.quote);
  }
  // Plain text remains available for body mentions and existing consumers.
  answer = parts.map(part => part.text).join("");
  return { answer, parts, cards, documents: [...groups.values()], evidenceCount: displayedSources.length,
    noSources: !displayedSources.length && !["conversation", "clarification"].includes(result.response_mode)
      && !result.needs_clarification };

}
