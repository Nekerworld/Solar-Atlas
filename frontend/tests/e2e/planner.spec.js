import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

// 실제 production build를 정적 서버 없이 라우트 가로채기로 서빙하고, 플래너 API(8001)는 대표 응답으로 대체한다.
// 실행: npm run build -- --base=/ 후 npx playwright test tests/e2e/planner.spec.js
const PLANNER = "http://127.0.0.1:8001";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
};

const EVENTS = [
  { sequence: 1, type: "stage_entered", stage: "analyze_request", tool_name: null, payload: {}, duration_ms: null },
  { sequence: 2, type: "tool_call_requested", stage: "execute_tools", tool_name: "search_places", payload: {}, duration_ms: null },
  { sequence: 3, type: "tool_call_completed", stage: "execute_tools", tool_name: "search_places", payload: { ok: false, error_code: "MISSING_API_KEY" }, duration_ms: 12 },
  { sequence: 4, type: "tool_call_requested", stage: "execute_tools", tool_name: "get_weather", payload: {}, duration_ms: null },
  { sequence: 5, type: "tool_call_completed", stage: "execute_tools", tool_name: "get_weather", payload: { ok: true }, duration_ms: 320 },
  { sequence: 6, type: "replan_started", stage: "replan_tasks", tool_name: null, payload: { replan_count: 1, axis: "time", reason: "충족 후보가 없습니다." }, duration_ms: null },
  { sequence: 7, type: "tool_result_reused", stage: "execute_tools", tool_name: "get_place_details", payload: {}, duration_ms: null },
];

const PLAN_RESPONSE = {
  state: "COMPLETED",
  message: "장소 검색 API 키가 서버에 없어 후보를 확인하지 못했습니다.",
  intent: "plan_observation",
  constraints: { baseline: { target_id: "jupiter" }, preference: { search_region: "서울숲" }, constraint: {}, empty: ["date_start"] },
  tasks: ["search_places", "get_weather"],
  tool_summaries: [
    { tool: "search_places", ok: false, error: { code: "MISSING_API_KEY", message: "GOOGLE_MAPS_API_KEY가 설정되지 않았습니다." } },
    { tool: "get_weather", ok: true, error: null },
  ],
  candidates: [],
  sources: [],
};

const KNOWLEDGE_RESPONSE = {
  state: "COMPLETED",
  message: "색인된 문서에서 찾은 근거입니다.",
  intent: "ask_knowledge",
  constraints: { baseline: {}, preference: {}, constraint: {}, empty: [] },
  tasks: ["search_knowledge"],
  tool_summaries: [{ tool: "search_knowledge", ok: true, error: null }],
  candidates: [],
  sources: [
    { rank: 1, title: "목성", section: "개요", source_url: "https://ko.wikipedia.org/wiki/%EB%AA%A9%EC%84%B1", snippet: "목성은 태양계에서 가장 큰 행성이다." },
    { rank: 2, title: "위험", section: "", source_url: "javascript:alert(1)", snippet: "링크가 열리면 안 된다." },
  ],
};

async function serveDist(page) {
  const root = path.resolve("dist");
  await page.route("http://solar-system.test/**", async (route) => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    const file = path.resolve(root, pathname === "/" ? "./index.html" : "." + pathname);
    if (!file.startsWith(root + path.sep)) return route.fulfill({ status: 403 });
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml" };
    try {
      await route.fulfill({ body: await readFile(file), contentType: mime[path.extname(file)] ?? "application/octet-stream" });
    } catch {
      await route.fulfill({ status: 404 });
    }
  });
}

async function mockPlanner(page, { messageBody, delayMs = 0 }) {
  await page.route(`${PLANNER}/**`, async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const json = (body) => route.fulfill({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname === "/api/conversations" && request.method() === "POST") return json({ id: "c1" });
    if (pathname === "/api/conversations/c1/messages") {
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return json(messageBody);
    }
    if (pathname === "/api/conversations/c1/events") return json({ session_id: "c1", events: messageBody === PLAN_RESPONSE ? EVENTS : [] });
    if (pathname === "/api/plans") return json({ items: [] });
    return json({});
  });
}

async function openPlanner(page) {
  await page.addInitScript(() => {
    let n = 0;
    Math.random = () => 0.01 + ++n / 1e9;
  });
  await page.goto("/");
  await expect(page.locator(".loading-screen")).toHaveCount(0, { timeout: 60000 });
  // 태양계 화면에는 천체별 관측 버튼이 없다. 지상 관측(천구)에서 플래너로 들어간다.
  await page.getByRole("button", { name: "지상 관측" }).click();
  await page.getByRole("button", { name: "플래너로" }).click();
  await expect(page.getByRole("heading", { name: "관측 플래너" })).toBeVisible();
}

async function ask(page, text) {
  await page.getByLabel("관측 요청").fill(text);
  await page.getByRole("button", { name: "보내기" }).click();
}

test.beforeEach(async ({ page }) => {
  await serveDist(page);
});

test("progress, tool history, replan point and API key guidance", async ({ page }) => {
  await mockPlanner(page, { messageBody: PLAN_RESPONSE, delayMs: 700 });
  await openPlanner(page);
  await ask(page, "이번 토요일 서울숲에서 목성 관측 계획 짜 줘.");
  await expect(page.locator("p.status")).toContainText("처리 중");
  await expect(page.locator("p.status")).toHaveCount(0);

  // 진행·Tool 호출 이력·재계획은 접혀 있다가 단추를 눌러 펼친다.
  await page.getByRole("button", { name: /^진행/ }).click();
  await page.getByRole("button", { name: /^Tool 호출 이력/ }).click();
  const tools = page.locator("ol.tools li");
  await expect(tools).toHaveCount(3);
  await expect(tools.nth(0)).toContainText("장소 검색");
  await expect(tools.nth(0)).toContainText("실패");
  await expect(tools.nth(0)).toContainText("API 키");
  await expect(tools.nth(1)).toContainText("성공");
  await expect(tools.nth(1)).toContainText("320ms");
  await expect(tools.nth(2)).toContainText("이전 결과 재사용");
  await expect(page.locator("li.replan")).toContainText("재계획 지점");
  await expect(page.getByRole("alert").filter({ hasText: "장소 검색" })).toContainText("서버에 필요한 API 키");
  // 서버가 준 설정 이름은 화면에 그대로 나오지 않는다.
  await expect(page.locator("body")).not.toContainText("GOOGLE_MAPS_API_KEY가 설정되지 않았습니다");
});

test("knowledge answer shows sources and only http(s) links", async ({ page }) => {
  await mockPlanner(page, { messageBody: KNOWLEDGE_RESPONSE });
  await openPlanner(page);
  await ask(page, "목성은 얼마나 큰 행성이야?");
  await page.getByRole("button", { name: /^근거 문서/ }).click();
  await expect(page.getByRole("heading", { name: /\[1\] 목성/ })).toBeVisible();
  const links = page.getByRole("link", { name: "출처 열기" });
  await expect(links).toHaveCount(1);
  await expect(links.first()).toHaveAttribute("href", /^https:\/\/ko\.wikipedia\.org\//);
  await page.getByRole("button", { name: /^Tool 호출 이력/ }).click();
  await expect(page.getByText("호출한 Tool이 없습니다.")).toBeVisible();
});

test("planner server down shows a plain notice", async ({ page }) => {
  await page.route(`${PLANNER}/**`, (route) => route.abort());
  await openPlanner(page);
  await ask(page, "이번 토요일 서울숲에서 목성 관측 계획 짜 줘.");
  await expect(page.getByRole("alert")).toContainText("플래너 서버에 연결하지 못했습니다");
  await expect(page.getByRole("alert")).not.toContainText("Failed to fetch");
});
