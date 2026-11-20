import { describe, expect, it } from "vitest";
import { errorGuide, failureNotices, progressSteps, safeUrl, sourceRows, toolHistory } from "../../src/planner/presentation";

const events = [
  { sequence: 1, type: "stage_entered", stage: "analyze_request", payload: {} },
  { sequence: 2, type: "tool_call_requested", stage: "execute_tools", tool_name: "get_weather", payload: {} },
  { sequence: 3, type: "tool_call_completed", stage: "execute_tools", tool_name: "get_weather", duration_ms: 320, payload: { ok: true } },
  { sequence: 4, type: "tool_call_requested", stage: "execute_tools", tool_name: "get_ephemeris", payload: {} },
  { sequence: 5, type: "tool_call_completed", stage: "execute_tools", tool_name: "get_ephemeris", duration_ms: 910, payload: { ok: false, error_code: "EPHEMERIS_UNAVAILABLE" } },
  { sequence: 6, type: "replan_started", stage: "replan_tasks", payload: { replan_count: 1 } },
  { sequence: 7, type: "tool_result_reused", stage: "execute_tools", tool_name: "get_place_details", payload: {} },
  { sequence: 8, type: "tool_call_requested", stage: "execute_tools", tool_name: "search_places", payload: {} },
];

describe("planner presentation", () => {
  it("lists tool calls in order with duration and failure guide", () => {
    const rows = toolHistory(events);
    expect(rows.map((row) => [row.tool, row.state])).toEqual([
      ["get_weather", "ok"],
      ["get_ephemeris", "failed"],
      ["get_place_details", "reused"],
      ["search_places", "running"],
    ]);
    expect(rows[0].durationMs).toBe(320);
    expect(rows[1].errorCode).toBe("EPHEMERIS_UNAVAILABLE");
    expect(rows[1].guide).toBe(errorGuide("EPHEMERIS_UNAVAILABLE"));
  });

  it("keeps tool events out of the stage list and marks the replan point", () => {
    const steps = progressSteps(events);
    expect(steps.some((step) => step.type.startsWith("tool_"))).toBe(false);
    expect(steps.find((step) => step.type === "replan_started").replan).toBe(true);
    expect(steps.find((step) => step.type === "stage_entered").replan).toBe(false);
  });

  it("shows a guide for a missing API key without raw detail", () => {
    const notices = failureNotices([
      { tool: "search_places", ok: false, error: { code: "MISSING_API_KEY", message: "GOOGLE_MAPS_API_KEY가 설정되지 않았습니다." } },
      { tool: "search_places", ok: false, error: { code: "MISSING_API_KEY", message: "again" } },
      { tool: "get_weather", ok: true, error: null },
    ]);
    expect(notices).toHaveLength(1);
    expect(notices[0].guide).toContain("API 키");
    expect(JSON.stringify(notices)).not.toContain("GOOGLE_MAPS_API_KEY");
  });

  it("falls back to a generic guide for unknown codes", () => {
    expect(errorGuide("SOMETHING_ELSE")).toContain("다시 시도");
  });

  it("only links http and https sources", () => {
    expect(safeUrl("https://ko.wikipedia.org/wiki/목성")).toContain("https://ko.wikipedia.org");
    expect(safeUrl("javascript:alert(1)")).toBe("");
    expect(safeUrl("")).toBe("");
    const rows = sourceRows([{ rank: 1, title: "목성", section: "개요", source_url: "javascript:alert(1)", snippet: "발췌" }]);
    expect(rows[0].url).toBe("");
    expect(rows[0].title).toBe("목성 / 개요");
  });
});

import { newRequestId } from "../../src/planner/api";
import { vi } from "vitest";

describe("newRequestId", () => {
  it("crypto.randomUUID가 없어도 UUID 형식의 값을 만든다", () => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes) => bytes.fill(7) });
    expect(newRequestId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    vi.unstubAllGlobals();
  });
  it("crypto가 아예 없어도 값을 만든다", () => {
    vi.stubGlobal("crypto", undefined);
    expect(newRequestId()).toHaveLength(36);
    vi.unstubAllGlobals();
  });
});
