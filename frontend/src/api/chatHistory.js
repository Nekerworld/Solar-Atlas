const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validId = value => typeof value === "string" && UUID.test(value);
export function parseHistory(value) {
  try {
    const data = JSON.parse(value);
    const entries = (Array.isArray(data?.entries) ? data.entries : []).filter(entry =>
      validId(entry?.key) && (!entry.conversationId || validId(entry.conversationId)) && typeof entry.title === "string");
    const seen = new Set();
    const clean = entries.filter(entry => !seen.has(entry.key) && seen.add(entry.key)).map(entry => ({
      key:entry.key, conversationId:entry.conversationId || null, title:entry.title.slice(0,100),
      itemId:typeof entry.itemId === "string" ? entry.itemId : "",
      mode:entry.mode === "item" && /^Q[1-9][0-9]*$/.test(entry.itemId) ? "item" : "global",
      unread:entry.unread === true,
      updatedAt:typeof entry.updatedAt === "string" ? entry.updatedAt : "",
      hiddenRequests:Array.isArray(entry.hiddenRequests) ? entry.hiddenRequests.filter(validId) : [],
      pending:validPending(entry.pending) ? entry.pending : null,
    }));
    const result = {entries:clean, active:clean.some(entry=>entry.key===data.active) ? data.active : null};
    if (data?.version === 2) {
      const validScope = key => key === "global" || /^item:Q[1-9][0-9]*$/.test(key);
      result.mode = data.mode === "item" ? "item" : "global";
      result.scopes = Object.fromEntries(Object.entries(data.scopes || {}).filter(([key,value]) => validScope(key) &&
        (value === null || clean.some(entry => entry.key === value && (entry.mode === "item" ? `item:${entry.itemId}` : "global") === key))));
      result.drafts = Object.fromEntries(Object.entries(data.drafts || {}).filter(([key,value]) => validScope(key) && typeof value === "string").map(([key,value]) => [key,value.slice(0,2000)]));
    }
    return result;
  } catch { return {entries:[],active:null}; }
}
function validPending(pending) {
  const p=pending?.payload;
  return p && validId(p.request_id) && (!p.conversation_id || validId(p.conversation_id)) &&
    typeof p.question === "string" && p.question.length <= 2000 && typeof p.item_id === "string";
}
export function mergeTurns(older, current) {
  const rows = new Map();
  for (const row of [...older,...current]) {
    const existing=rows.get(row.requestId);
    // A canonical completed turn wins over an interrupted local journal entry.
    if (existing?.state==="completed" && row.state!=="completed") continue;
    rows.set(row.requestId,row);
  }
  return [...rows.values()].sort((a,b) => {
    // DRF may return +09:00 while browser timestamps use Z. Compare instants.
    const delta=Date.parse(a.createdAt)-Date.parse(b.createdAt);
    return (Number.isFinite(delta) && delta!==0) ? delta : a.key.localeCompare(b.key);
  });
}
