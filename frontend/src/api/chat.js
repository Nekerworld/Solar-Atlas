import targetCatalog from "../../../catalog/solar_targets.json";

export class ChatError extends Error {
  constructor(message, { retryable = false, data = null } = {}) {
    super(message);
    this.name = "ChatError";
    this.retryable = retryable;
    this.data = data;
  }
}

const DATA_KEY = "solar-atlas:pages:chat-data:v1";
const targetById = new Map(targetCatalog.targets.map((target) => [target.id, target]));
const memory = { conversations: {} };

function loadData() {
  try { return JSON.parse(localStorage.getItem(DATA_KEY)) || memory; } catch { return memory; }
}
function saveData(data) {
  memory.conversations = data.conversations;
  try { localStorage.setItem(DATA_KEY, JSON.stringify(data)); } catch { /* memory fallback */ }
}
function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (letter) => {
    const value = Math.random() * 16 | 0;
    return (letter === "x" ? value : (value & 3) | 8).toString(16);
  });
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

function targetTerms(payload) {
  const target = targetById.get(payload.item_id);
  if (target) return { title: target.name_ko, query: `${target.name_ko} 천문학`, target };
  const words = payload.question.replace(/[?!.]/g, " ").trim().split(/\s+/).filter((word) => word.length > 1);
  return { title: words.slice(0, 3).join(" ") || "태양계", query: `${words.slice(0, 4).join(" ")} 천문학`, target: null };
}

async function wikiSearch(query, signal) {
  try {
    const params = new URLSearchParams({
      origin: "*", action: "query", format: "json", generator: "search", gsrsearch: query,
      gsrlimit: "4", prop: "extracts|info", exintro: "1", explaintext: "1", inprop: "url",
    });
    const response = await fetch(`https://ko.wikipedia.org/w/api.php?${params}`, { signal });
    if (!response.ok) throw new Error();
    return Object.values((await response.json()).query?.pages || {});
  } catch (error) {
    if (error.name === "AbortError") throw error;
    return [];
  }
}

export async function sendChat(payload, signal, onProgress = () => {}) {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  onProgress({ stage: "search", message: "공개 천문 자료를 찾고 있어요…" });
  await wait(120, signal);
  const terms = targetTerms(payload);
  const pages = await wikiSearch(terms.query, signal);
  onProgress({ stage: "compose", message: "찾은 근거를 정리하고 있어요…" });
  const first = pages[0];
  const fallback = terms.target
    ? `${terms.title}은 Solar Atlas의 3D 태양계와 관측 플래너에서 위치와 관측 가능 시간을 확인할 수 있습니다. 공개 문서 연결이 없어 일반 안내만 제공합니다.`
    : "질문과 관련된 공개 천문 문서를 찾지 못했습니다. 천체 이름을 포함해 다시 질문해 주세요.";
  const answer = first?.extract?.trim().slice(0, 1200) || fallback;
  const sources = pages.map((page, index) => ({
    evidence_id: `C${index + 1}`, title: page.title, url: page.fullurl,
    quote: page.extract?.slice(0, 240) || "", kind: "document",
    document_id: `kowiki:${page.pageid}`,
  }));
  const result = {
    status: "completed", mode: payload.mode || "global", item_id: payload.item_id || "",
    answer, display_answer: answer, response_mode: "answer", coverage: sources.length ? "partial" : "insufficient",
    sources, warnings: sources.length ? ["Wikipedia 공개 자료를 바탕으로 요약한 정적 배포 답변입니다."] : [],
    conversation_id: payload.conversation_id || uuid(), turn_id: uuid(), request_id: payload.request_id,
  };
  const data = loadData();
  const conversation = data.conversations[result.conversation_id] || {
    id: result.conversation_id, mode: result.mode, item_id: result.item_id, turns: [],
  };
  conversation.turns.push({
    id: result.turn_id, request_id: payload.request_id, question: payload.question,
    created_at: new Date().toISOString(), observed_item_id: payload.item_id,
    allow_external: true, status: "completed", result,
  });
  data.conversations[result.conversation_id] = conversation;
  saveData(data);
  return result;
}

export function loadCelestialObjects() {
  return Promise.resolve(targetCatalog.targets);
}

export function loadConversation(id) {
  const conversation = loadData().conversations[id];
  if (!conversation) return Promise.reject(new ChatError("저장된 대화를 찾지 못했어요."));
  return Promise.resolve({ id, mode: conversation.mode, item_id: conversation.item_id });
}
export function loadConversationTurns(id, page = 1) {
  const conversation = loadData().conversations[id];
  if (!conversation) return Promise.reject(new ChatError("저장된 대화를 찾지 못했어요."));
  const size = 20;
  const newest = [...conversation.turns].reverse();
  const start = (page - 1) * size;
  return Promise.resolve({ results: newest.slice(start, start + size), next: start + size < newest.length ? page + 1 : null });
}
export const CHAT_STORAGE_KEY = "solar-atlas:chat:v3:github-pages";
