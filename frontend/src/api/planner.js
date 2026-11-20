const base = (import.meta.env.VITE_PLANNER_BASE_URL || "http://127.0.0.1:8001").replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const text = await response.text();
  let data = null;
  if (text) data = JSON.parse(text);
  if (!response.ok) {
    const detail = data?.detail;
    const message = typeof detail === "string" ? detail : data?.error?.message || "플래너 요청에 실패했습니다.";
    throw new Error(message);
  }
  return data;
}

export function createConversation() {
  return request("/api/conversations", { method: "POST" });
}

export function sendMessage(conversationId, body) {
  return request(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listPlans() {
  return request("/api/plans");
}

export function createPlan(body) {
  return request("/api/plans", { method: "POST", body: JSON.stringify(body) });
}

export function updatePlan(planId, body) {
  return request(`/api/plans/${planId}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deletePlan(planId) {
  return request(`/api/plans/${planId}`, { method: "DELETE" });
}

export function listLogSessions() {
  return request("/api/logs/sessions");
}

export function getLog(sessionId) {
  return request(`/api/logs/sessions/${sessionId}`);
}

export function deleteLog(sessionId) {
  return request(`/api/logs/sessions/${sessionId}`, { method: "DELETE" });
}

export async function postSky(body) {
  const response = await fetch(`${base}/api/sky`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (response.status === 422) {
    const detail = data?.detail;
    throw new Error(typeof detail === "string" ? detail : "관측 조건을 확인해 주세요.");
  }
  return data;
}

/** 천구에 올릴 소천체의 적경·적위 표(JPL Horizons, 백엔드가 대신 호출·캐시한다). */
export function getSkyBodies({ start, hours = 720, stepMinutes = 120 }) {
  const query = new URLSearchParams({ start, hours: String(hours), step_minutes: String(stepMinutes) });
  return request(`/api/sky/bodies?${query}`);
}

/** 소천체 한 개의 궤도선(타원, xyz AU). 위성은 모행성 중심, 나머지는 태양 중심. */
export function getSkyOrbit({ body, epoch }) {
  const query = new URLSearchParams({ body, epoch });
  return request(`/api/sky/orbit?${query}`);
}
