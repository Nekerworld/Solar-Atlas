import { TARGET_NAMES_KO, visibilityWindows } from "../utils/visibility";

const STORAGE_PREFIX = "solar-atlas:pages:v1";
const TARGET_ALIASES = {
  mercury: ["수성", "mercury"], venus: ["금성", "venus"], moon: ["달", "moon"],
  mars: ["화성", "mars"], jupiter: ["목성", "jupiter"], saturn: ["토성", "saturn"],
  uranus: ["천왕성", "uranus"], neptune: ["해왕성", "neptune"],
};
const BUILTIN_PLACES = [
  { name: "서울숲", latitude: 37.5444, longitude: 127.0374 },
  { name: "남산", latitude: 37.5512, longitude: 126.9882 },
  { name: "한강공원", latitude: 37.5284, longitude: 126.9345 },
  { name: "서울", latitude: 37.5665, longitude: 126.9780 },
];
const memory = new Map();

function read(key, fallback) {
  try {
    const value = localStorage.getItem(`${STORAGE_PREFIX}:${key}`);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return memory.has(key) ? memory.get(key) : fallback;
  }
}
function write(key, value) {
  memory.set(key, value);
  try { localStorage.setItem(`${STORAGE_PREFIX}:${key}`, JSON.stringify(value)); } catch { /* memory fallback */ }
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function nowIso() {
  return new Date().toISOString();
}
function event(sequence, stage, type, extra = {}) {
  return { sequence, stage, type, created_at: nowIso(), ...extra };
}

// crypto.randomUUID는 https/localhost에서만 있어서, 없을 때는 getRandomValues로 만든다.
export function newRequestId() {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof c?.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function targetFrom(text, selected) {
  const lower = text.toLowerCase();
  return Object.entries(TARGET_ALIASES).find(([, aliases]) => aliases.some((name) => lower.includes(name)))?.[0]
    || selected || "jupiter";
}

function dateFrom(text) {
  const now = new Date();
  const explicit = text.match(/(20\d{2})[-./년]\s*(\d{1,2})[-./월]\s*(\d{1,2})/);
  if (explicit) return new Date(Number(explicit[1]), Number(explicit[2]) - 1, Number(explicit[3]));
  const result = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (text.includes("모레")) result.setDate(result.getDate() + 2);
  else if (text.includes("내일")) result.setDate(result.getDate() + 1);
  else {
    const names = ["일", "월", "화", "수", "목", "금", "토"];
    const wanted = names.findIndex((name) => text.includes(`${name}요일`));
    if (wanted >= 0) {
      let delta = (wanted - result.getDay() + 7) % 7;
      if (delta === 0 && text.includes("이번")) delta = 7;
      result.setDate(result.getDate() + delta);
    }
  }
  return result;
}

function timeFrom(text, date) {
  const match = text.match(/(?:오전|오후)?\s*(\d{1,2})(?:시|:)(?:\s*(\d{1,2})분?)?/);
  let hour = match ? Number(match[1]) : 21;
  const minute = match?.[2] ? Number(match[2]) : 0;
  if (match && text.slice(Math.max(0, match.index - 3), match.index + match[0].length).includes("오후") && hour < 12) hour += 12;
  const result = new Date(date);
  result.setHours(hour, minute, 0, 0);
  return result;
}

function durationHours(text) {
  return Math.max(0.5, Math.min(6, Number(text.match(/(\d+(?:\.\d+)?)\s*시간/)?.[1] || 1)));
}

function parse(text, selectedTargetId) {
  const target = targetFrom(text, selectedTargetId);
  const date = dateFrom(text);
  const start = timeFrom(text, date);
  const duration = durationHours(text);
  const minAltitude = Number(text.match(/고도\s*(\d+)/)?.[1] || 15);
  const maxCloud = Number(text.match(/구름\s*(\d+)/)?.[1] || 50);
  const place = BUILTIN_PLACES.find((item) => text.includes(item.name));
  const placeMatch = text.match(/(?:에서|장소는?)\s*([가-힣A-Za-z0-9 ]{2,20}?)(?:에서|으?로|을|를|에|,|\.|$)/);
  return {
    target, start, end: new Date(start.getTime() + duration * 3600000), duration,
    minAltitude, maxCloud, place, placeQuery: place?.name || placeMatch?.[1]?.trim() || "서울",
  };
}

async function geocode(query) {
  const builtIn = BUILTIN_PLACES.find((item) => query.includes(item.name));
  if (builtIn) return builtIn;
  try {
    const params = new URLSearchParams({ q: query, format: "jsonv2", limit: "1", "accept-language": "ko" });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error();
    const [item] = await response.json();
    if (item) return { name: item.display_name.split(",")[0], latitude: Number(item.lat), longitude: Number(item.lon) };
  } catch {
    // 공개 지오코딩이 막히면 서울 좌표로 계산을 계속한다.
  }
  return { ...BUILTIN_PLACES.at(-1), fallback: true };
}

async function weather(latitude, longitude, start) {
  try {
    const params = new URLSearchParams({
      latitude: String(latitude), longitude: String(longitude),
      hourly: "cloud_cover,precipitation_probability,precipitation",
      timezone: "Asia/Seoul", forecast_days: "16",
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!response.ok) throw new Error();
    const data = await response.json();
    const target = start.getTime();
    let index = 0, distance = Infinity;
    data.hourly.time.forEach((value, candidate) => {
      const delta = Math.abs(new Date(value).getTime() - target);
      if (delta < distance) { distance = delta; index = candidate; }
    });
    return {
      cloud: data.hourly.cloud_cover[index],
      rainProbability: data.hourly.precipitation_probability[index],
      precipitation: data.hourly.precipitation[index],
    };
  } catch {
    return null;
  }
}

export function createConversation() {
  const id = newRequestId();
  const conversations = read("conversations", {});
  conversations[id] = { id, events: [], messages: [], created_at: nowIso() };
  write("conversations", conversations);
  return Promise.resolve({ id });
}

async function knowledgeAnswer(text, target) {
  const name = TARGET_NAMES_KO[target] || text;
  try {
    const params = new URLSearchParams({
      origin: "*", action: "query", format: "json", generator: "search",
      gsrsearch: `${name} 천문학`, gsrlimit: "3", prop: "extracts|info",
      exintro: "1", explaintext: "1", inprop: "url",
    });
    const response = await fetch(`https://ko.wikipedia.org/w/api.php?${params}`);
    if (!response.ok) throw new Error();
    const pages = Object.values((await response.json()).query?.pages || {});
    const first = pages[0];
    return {
      message: first?.extract?.slice(0, 700) || `${name}에 대한 공개 문서를 찾지 못했습니다.`,
      sources: pages.map((page, index) => ({
        rank: index + 1, title: page.title, source_url: page.fullurl, snippet: page.extract?.slice(0, 180) || "",
      })),
    };
  } catch {
    return { message: `${name}은 Solar Atlas에서 위치와 관측 가능 시간을 계산할 수 있는 천체입니다. 현재 공개 지식 API에 연결하지 못했습니다.`, sources: [] };
  }
}

function analysisConstraints(parsed) {
  const day = parsed.start.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  return {
    baseline: {
      target_id: parsed.target, date_start: day, date_end: day,
      preferred_time_start: parsed.start.toTimeString().slice(0, 5), preferred_time_end: parsed.end.toTimeString().slice(0, 5),
    },
    preference: { search_region: parsed.placeQuery, place_query: parsed.placeQuery },
    constraint: { min_altitude_deg: parsed.minAltitude, max_cloud_cover_pct: parsed.maxCloud },
    empty: ["max_travel_minutes", "max_precipitation_probability_pct", "origin_name", "transport_mode"],
  };
}

export async function sendMessage(conversationId, text, selectedTargetId) {
  const conversations = read("conversations", {});
  const conversation = conversations[conversationId] || { id: conversationId, events: [], messages: [] };
  const parsed = parse(text, selectedTargetId);
  const sequence = [];
  sequence.push(event(1, "analyze_request", "request_analyzed"));
  const knowledgeOnly = /얼마나|무엇|뭐야|알려|특징|크기|거리|왜/.test(text) && !/관측|계획|보고|장소|에서/.test(text);
  if (knowledgeOnly) {
    sequence.push(event(2, "execute_tools", "tool_call_requested", { tool_name: "search_knowledge" }));
    const answer = await knowledgeAnswer(text, parsed.target);
    sequence.push(event(3, "execute_tools", "tool_call_completed", { tool_name: "search_knowledge", duration_ms: 0, payload: { ok: true } }));
    sequence.push(event(4, "generate_response", "response_generated"));
    const result = {
      status: "COMPLETED", intent: "KNOWLEDGE", constraints: analysisConstraints(parsed),
      message: answer.message, sources: answer.sources, candidates: [], tool_summaries: [{ tool: "search_knowledge", ok: true }],
    };
    conversation.events = sequence;
    conversation.messages.push({ role: "user", content: text }, { role: "assistant", content: result.message });
    conversations[conversationId] = conversation; write("conversations", conversations); write(`log:${conversationId}`, sequence);
    return result;
  }

  sequence.push(event(2, "plan_tasks", "tasks_planned"));
  sequence.push(event(3, "execute_tools", "tool_call_requested", { tool_name: "search_places" }));
  const place = await geocode(parsed.placeQuery);
  sequence.push(event(4, "execute_tools", "tool_call_completed", { tool_name: "search_places", duration_ms: 0, payload: { ok: true } }));
  sequence.push(event(5, "execute_tools", "tool_call_requested", { tool_name: "get_ephemeris" }));
  const windows = visibilityWindows({
    bodyId: parsed.target, latitude: place.latitude, longitude: place.longitude,
    from: new Date(Math.min(parsed.start.getTime(), Date.now())), days: 16, stepMinutes: 10,
  });
  const overlapping = windows.find((window) => window.start <= parsed.end && window.end >= parsed.start);
  const chosen = overlapping || windows.find((window) => window.start >= parsed.start) || windows[0];
  sequence.push(event(6, "execute_tools", "tool_call_completed", { tool_name: "get_ephemeris", duration_ms: 0, payload: { ok: Boolean(chosen), error_code: chosen ? null : "EPHEMERIS_UNAVAILABLE" } }));
  sequence.push(event(7, "execute_tools", "tool_call_requested", { tool_name: "get_weather" }));
  const forecast = await weather(place.latitude, place.longitude, chosen?.peak || parsed.start);
  sequence.push(event(8, "execute_tools", "tool_call_completed", { tool_name: "get_weather", duration_ms: 0, payload: { ok: Boolean(forecast), error_code: forecast ? null : "FORECAST_UNAVAILABLE" } }));
  sequence.push(event(9, "evaluate_candidates", "candidates_evaluated"));

  const observationStart = chosen ? new Date(Math.max(chosen.start, parsed.start)) : parsed.start;
  const observationEnd = chosen ? new Date(Math.min(chosen.end, observationStart.getTime() + parsed.duration * 3600000)) : parsed.end;
  const altitude = chosen?.peakAltitude ?? null;
  const altitudeOk = altitude != null && altitude >= parsed.minAltitude;
  const cloudOk = forecast?.cloud == null || forecast.cloud <= parsed.maxCloud;
  const status = chosen && altitudeOk && cloudOk ? "SUITABLE" : chosen ? "UNSUITABLE" : "UNVERIFIED";
  const candidate = {
    candidate_id: newRequestId(), target_id: parsed.target, name: place.name,
    latitude: place.latitude, longitude: place.longitude,
    observation_start: observationStart.toISOString(), observation_end: observationEnd.toISOString(),
    status, score: Math.round((altitude || 0) - (forecast?.cloud || 0) / 4),
    checks: [
      { field: "altitude", value: altitude == null ? null : Number(altitude.toFixed(1)), unit: "°", threshold: parsed.minAltitude, status: altitudeOk ? "MET" : altitude == null ? "UNKNOWN" : "UNMET" },
      { field: "cloud_cover", value: forecast?.cloud ?? null, unit: "%", threshold: parsed.maxCloud, status: forecast?.cloud == null ? "UNKNOWN" : cloudOk ? "MET" : "UNMET" },
      { field: "precipitation_probability", value: forecast?.rainProbability ?? null, unit: "%", threshold: 50, status: forecast?.rainProbability == null ? "UNKNOWN" : forecast.rainProbability <= 50 ? "MET" : "UNMET" },
    ],
  };
  sequence.push(event(10, "generate_response", "response_generated"));
  const targetName = TARGET_NAMES_KO[parsed.target] || parsed.target;
  const result = {
    status: "COMPLETED", intent: "PLAN", constraints: analysisConstraints(parsed), candidates: [candidate], sources: [],
    message: `${place.name}에서 ${targetName} 관측 후보를 계산했습니다. ${status === "SUITABLE" ? "입력한 조건에 적합합니다." : status === "UNSUITABLE" ? "일부 조건이 맞지 않아 아래 판정을 확인해 주세요." : "예보 범위 밖이라 천문 조건만 확인했습니다."}${place.fallback ? " 장소 검색 결과가 없어 서울 좌표를 사용했습니다." : ""}`,
    tool_summaries: [
      { tool: "search_places", ok: true }, { tool: "get_ephemeris", ok: Boolean(chosen), error: chosen ? null : { code: "EPHEMERIS_UNAVAILABLE" } },
      { tool: "get_weather", ok: Boolean(forecast), error: forecast ? null : { code: "FORECAST_UNAVAILABLE" } },
    ],
  };
  conversation.events = sequence;
  conversation.messages.push({ role: "user", content: text }, { role: "assistant", content: result.message });
  conversations[conversationId] = conversation; write("conversations", conversations); write(`log:${conversationId}`, sequence);
  return result;
}

export function loadEvents(conversationId) {
  const conversation = read("conversations", {})[conversationId];
  return Promise.resolve({ events: clone(conversation?.events || []) });
}

export function listPlans() {
  return Promise.resolve({ items: clone(read("plans", [])) });
}

export function getPlan(id) {
  const plan = read("plans", []).find((item) => item.id === id);
  if (!plan) return Promise.reject(new Error("저장된 계획을 찾지 못했습니다."));
  return Promise.resolve(clone(plan));
}

export function savePlan(plan) {
  const plans = read("plans", []);
  const item = {
    ...plan, id: newRequestId(), target_name: TARGET_NAMES_KO[plan.target_id] || plan.target_id,
    created_at: nowIso(), latitude: plan.latitude ?? null, longitude: plan.longitude ?? null,
  };
  const start = new Date(item.start_at).getTime(), end = new Date(item.end_at).getTime();
  const warnings = plans.some((entry) => new Date(entry.start_at).getTime() < end && new Date(entry.end_at).getTime() > start)
    ? ["OVERLAPPING_PLAN"] : [];
  plans.unshift(item); write("plans", plans);
  return Promise.resolve({ ...clone(item), warnings });
}

export function updatePlan(id, plan) {
  const plans = read("plans", []);
  const index = plans.findIndex((item) => item.id === id);
  if (index < 0) return Promise.reject(new Error("저장된 계획을 찾지 못했습니다."));
  plans[index] = { ...plans[index], ...plan, id, target_name: TARGET_NAMES_KO[plan.target_id] || plan.target_id };
  write("plans", plans);
  return Promise.resolve(clone(plans[index]));
}

export function deletePlan(id) {
  write("plans", read("plans", []).filter((item) => item.id !== id));
  return Promise.resolve({ ok: true });
}

export function listLogSessions() {
  const ids = Object.keys(read("conversations", {})).filter((id) => read(`log:${id}`, []).length);
  return Promise.resolve({ sessions: ids });
}

export function loadLog(sessionId) {
  return Promise.resolve({ events: clone(read(`log:${sessionId}`, [])) });
}

export function deleteLog(sessionId) {
  write(`log:${sessionId}`, []);
  return Promise.resolve({ ok: true });
}
