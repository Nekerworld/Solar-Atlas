import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createConversation, deletePlan, listPlans, loadEvents, savePlan, sendMessage,
} from "../../src/planner/api";
import { loadConversation, loadConversationTurns, sendChat } from "../../src/api/chat";

function json(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

describe("GitHub Pages browser adapters", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn((url) => {
      if (String(url).includes("open-meteo.com")) {
        return json({ hourly: {
          time: ["2026-11-21T20:00"], cloud_cover: [12],
          precipitation_probability: [5], precipitation: [0],
        } });
      }
      return json({ query: { pages: {
        1: { pageid: 1, title: "목성", fullurl: "https://ko.wikipedia.org/wiki/목성", extract: "목성은 태양계에서 가장 큰 행성이다." },
      } } });
    }));
  });

  it("calculates a planner candidate and stores plans locally", async () => {
    const { id } = await createConversation();
    const result = await sendMessage(id, "2026-11-21 20시에 서울숲에서 목성을 1시간 보고 싶어.", "jupiter");
    expect(result.status).toBe("COMPLETED");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ name: "서울숲", target_id: "jupiter" });
    expect((await loadEvents(id)).events.some((event) => event.tool_name === "get_weather")).toBe(true);

    const candidate = result.candidates[0];
    const saved = await savePlan({
      target_id: candidate.target_id, place_name: candidate.name,
      latitude: candidate.latitude, longitude: candidate.longitude,
      start_at: candidate.observation_start, end_at: candidate.observation_end, status: candidate.status,
    });
    expect((await listPlans()).items.some((plan) => plan.id === saved.id)).toBe(true);
    await deletePlan(saved.id);
  });

  it("answers Atlas questions from public documents and restores local history", async () => {
    const controller = new AbortController();
    const result = await sendChat({
      item_id: "Q5", mode: "item", question: "목성의 특징을 알려줘",
      conversation_id: null, request_id: crypto.randomUUID(), allow_external: true,
    }, controller.signal);
    expect(result.status).toBe("completed");
    expect(result.answer).toContain("가장 큰 행성");
    expect(result.sources[0].url).toContain("wikipedia.org");
    expect((await loadConversation(result.conversation_id)).mode).toBe("item");
    expect((await loadConversationTurns(result.conversation_id)).results).toHaveLength(1);
  });
});
