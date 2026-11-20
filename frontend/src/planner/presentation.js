// 플래너 화면 표시 규칙. 화면에는 오류 코드의 안내문만 보이고 서버가 준 상세 내용은 그대로 노출하지 않는다.

export const ERROR_GUIDE = {
  MISSING_API_KEY: "서버에 필요한 API 키가 설정되어 있지 않습니다. 서버 환경변수 설정을 확인해 주세요.",
  AUTH_FAILED: "외부 API 인증에 실패했습니다. 키와 사용 설정을 확인해 주세요.",
  API_TIMEOUT: "외부 API 응답 시간이 초과되었습니다. 잠시 뒤 다시 시도해 주세요.",
  EXTERNAL_API_ERROR: "외부 서비스 호출에 실패했습니다. 잠시 뒤 다시 시도해 주세요.",
  NO_RESULT: "조건에 맞는 결과를 찾지 못했습니다.",
  NO_INDEX: "색인이 없어 지식 검색을 할 수 없습니다.",
  KNOWLEDGE_UNAVAILABLE: "지식 검색 서버에 연결하지 못했습니다. 서버가 켜져 있는지 확인해 주세요.",
  FORECAST_UNAVAILABLE: "요청한 기간의 날씨 예보가 없습니다.",
  EPHEMERIS_UNAVAILABLE: "천문력을 확인하지 못했습니다.",
  TOOL_DISABLED: "이 기능은 현재 설정에서 꺼져 있습니다.",
  INVALID_INPUT: "요청 값이 올바르지 않습니다.",
};

export function errorGuide(code) {
  return ERROR_GUIDE[code] || "처리 중 문제가 생겼습니다. 다시 시도해 주세요.";
}

export const TOOL_LABELS = {
  search_places: "장소 검색",
  get_place_details: "장소 상세",
  get_ephemeris: "천문력",
  get_weather: "날씨",
  get_route: "이동시간",
  search_knowledge: "지식 검색",
};

export const STAGE_LABELS = {
  analyze_request: "요청 분석",
  validate_information: "정보 확인",
  ask_clarification: "추가 질문",
  plan_tasks: "작업 계획",
  execute_tools: "Tool 실행",
  evaluate_candidates: "후보 판정",
  replan_tasks: "재계획",
  generate_response: "응답 생성",
};

export function toolLabel(name) {
  return TOOL_LABELS[name] || name || "";
}

// 단계 진행 목록. 재계획이 시작된 지점은 replan=true로 구분한다.
export function progressSteps(events = []) {
  return events
    .filter((event) => !String(event.type).startsWith("tool_"))
    .map((event) => ({
      sequence: event.sequence,
      stage: STAGE_LABELS[event.stage] || event.stage,
      type: event.type,
      replan: event.type === "replan_started" || event.type === "replan_completed",
      failed: event.type === "execution_failed",
    }));
}

// Tool 호출 이력. 요청만 있고 완료가 없으면 진행 중으로 본다.
export function toolHistory(events = []) {
  const rows = [];
  const pending = new Map();
  for (const event of events) {
    if (event.type === "tool_call_requested") {
      const row = { sequence: event.sequence, tool: event.tool_name, label: toolLabel(event.tool_name), state: "running", durationMs: null, errorCode: null, guide: "" };
      pending.set(event.tool_name, row);
      rows.push(row);
    } else if (event.type === "tool_call_completed") {
      const row = pending.get(event.tool_name) || { sequence: event.sequence, tool: event.tool_name, label: toolLabel(event.tool_name) };
      if (!pending.has(event.tool_name)) rows.push(row);
      pending.delete(event.tool_name);
      const ok = event.payload?.ok === true;
      row.state = ok ? "ok" : "failed";
      row.durationMs = event.duration_ms ?? null;
      row.errorCode = ok ? null : event.payload?.error_code || null;
      row.guide = ok ? "" : errorGuide(row.errorCode);
    } else if (event.type === "tool_result_reused") {
      rows.push({ sequence: event.sequence, tool: event.tool_name, label: toolLabel(event.tool_name), state: "reused", durationMs: null, errorCode: null, guide: "" });
    }
  }
  return rows;
}

// 응답의 tool_summaries에서 실패한 Tool의 안내문을 중복 없이 모은다.
export function failureNotices(toolSummaries = []) {
  const seen = new Set();
  const notices = [];
  for (const item of toolSummaries) {
    if (item?.ok !== false) continue;
    const code = item.error?.code || "EXTERNAL_API_ERROR";
    const key = `${item.tool}:${code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    notices.push({ tool: item.tool, label: toolLabel(item.tool), code, guide: errorGuide(code) });
  }
  return notices;
}

// 출처 링크는 http(s)만 허용한다.
export function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

export function sourceRows(sources = []) {
  return sources.map((source) => ({
    rank: source.rank,
    title: [source.title, source.section].filter(Boolean).join(" / ") || source.item_name || "문서",
    url: safeUrl(source.source_url),
    snippet: source.snippet || "",
  }));
}
