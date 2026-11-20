const base = import.meta.env.VITE_PLANNER_BASE_URL || "http://127.0.0.1:8001";

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

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${base}${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
  } catch {
    // 브라우저가 주는 네트워크 오류 문장은 그대로 보여 주지 않는다.
    throw new Error("플래너 서버에 연결하지 못했습니다. 서버가 켜져 있는지 확인해 주세요.");
  }
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("플래너 서버 응답을 읽지 못했습니다.");
  }
  if (!response.ok) {
    const message = typeof body?.detail === "string" ? body.detail : "요청을 처리하지 못했습니다.";
    throw new Error(message);
  }
  return body;
}

export function createConversation() {
  return request("/api/conversations", { method: "POST" });
}

export function sendMessage(conversationId, text, selectedTargetId) {
  return request(`/api/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      text,
      request_id: newRequestId(),
      selected_target_id: selectedTargetId || null,
    }),
  });
}

export function loadEvents(conversationId) {
  return request(`/api/conversations/${conversationId}/events`);
}

export function listPlans() {
  return request("/api/plans");
}

export function getPlan(id) {
  return request(`/api/plans/${id}`);
}

export function savePlan(plan) {
  return request("/api/plans", { method: "POST", body: JSON.stringify(plan) });
}

export function updatePlan(id, plan) {
  return request(`/api/plans/${id}`, { method: "PATCH", body: JSON.stringify(plan) });
}

export function deletePlan(id) {
  return request(`/api/plans/${id}`, { method: "DELETE" });
}

export function listLogSessions() {
  return request("/api/logs/sessions");
}

export function loadLog(sessionId) {
  return request(`/api/logs/sessions/${sessionId}`);
}

export function deleteLog(sessionId) {
  return request(`/api/logs/sessions/${sessionId}`, { method: "DELETE" });
}
