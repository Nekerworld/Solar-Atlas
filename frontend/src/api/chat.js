const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

export class ChatError extends Error {
  constructor(message, { retryable = false, data = null } = {}) {
    super(message);
    this.name = "ChatError";
    this.retryable = retryable;
    this.data = data;
  }
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { Accept: "application/json", ...options.headers },
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ChatError("서버에 연결하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.", { retryable: true });
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ChatError("서버 응답을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.", { retryable: true });
  }
  if (!response.ok) {
    const message = data.error?.message || data.question?.[0] || "질문을 처리하지 못했습니다. 다시 시도해 주세요.";
    throw new ChatError(message, {
      retryable: response.status >= 500 && data.status !== "failed",
      data,
    });
  }
  return data;
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

export async function sendChat(payload, signal, onProgress = () => {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}/api/chat/stream/`, {
      method: "POST", signal,
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ChatError("서버에 연결하지 못했습니다. 같은 요청으로 다시 확인해 주세요.", { retryable: true });
  }
  if (!response.ok || !response.headers.get("content-type")?.includes("text/event-stream")) {
    let data;
    try { data = await response.json(); } catch { data = null; }
    throw new ChatError(data?.error?.message || data?.question?.[0] || "진행 상태 응답을 읽지 못했습니다.", {
      retryable: response.status >= 500, data,
    });
  }
  if (!response.body) throw new ChatError("스트림을 열지 못했습니다.", { retryable: true });
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "", first = null;
  try {
    while (!first) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        let event = "message";
        const dataLines = [];
        for (const line of frame.split(/\r?\n/)) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
        }
        if (!dataLines.length) continue; // Heartbeat comment, not a status change.
        const message = JSON.parse(dataLines.join("\n"));
        if (event === "status") {
          if (typeof message.message === "string") onProgress(message);
        } else if (event === "result" || event === "error") {
          const data = message.payload;
          if (event === "error" || message.http_status >= 400) {
            throw new ChatError(data?.error?.message || "질문 처리를 완료하지 못했습니다.", {
              retryable: message.http_status >= 500 && data?.status !== "failed", data,
            });
          }
          first = data;
          break;
        }
      }
      if (first) break;
      if (done) throw new ChatError("연결이 끊겼습니다. 같은 요청으로 다시 확인해 주세요.", { retryable: true });
      if (buffer.length > 4 * 1024 * 1024) throw new ChatError("서버 응답이 너무 큽니다.", { retryable: true });
    }
  } catch (error) {
    if (error instanceof ChatError || error.name === "AbortError") throw error;
    throw new ChatError("진행 상태 연결이 끊겼습니다. 같은 요청으로 다시 확인해 주세요.", { retryable: true });
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (first.status !== "processing") return first;
  // A retry of the same request can return 202 while the original still runs.
  // Poll saved turns without sending another model request.
  if (!first.conversation_id) throw new ChatError("대화 정보를 읽지 못했습니다.", { retryable: true });
  const deadline = Date.now() + 5 * 60 * 1000;
  while (!signal.aborted) {
    if (Date.now() > deadline) {
      throw new ChatError("아직 답변을 처리하고 있습니다. 잠시 후 다시 확인해 주세요.", { retryable: true, data: first });
    }
    await wait(2500, signal);
    const page = await request(`/api/conversations/${encodeURIComponent(first.conversation_id)}/turns/`, { signal });
    const turn = page.results?.find((entry) => entry.request_id === payload.request_id);
    if (!turn || turn.status === "processing") continue;
    if (turn.status === "failed") {
      throw new ChatError("답변 처리를 완료하지 못했습니다. 다시 시도해 주세요.", { data: first });
    }
    return {
      ...turn.result, status: turn.status,
      conversation_id: first.conversation_id, turn_id: turn.id, request_id: turn.request_id,
    };
  }
  throw new DOMException("Aborted", "AbortError");
}

export function loadCelestialObjects(signal) {
  return request("/api/celestial-objects/", { signal });
}

// Fetch saved history only; these endpoints never invoke the language model.
export function loadConversation(id, signal) {
  return request(`/api/conversations/${encodeURIComponent(id)}/`, {signal});
}
export function loadConversationTurns(id, page = 1, signal) {
  return request(`/api/conversations/${encodeURIComponent(id)}/turns/?page=${page}`, {signal});
}
export const CHAT_STORAGE_KEY = `solar-atlas:chat:v1:${API_BASE}`;
