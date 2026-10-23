import { expect, test } from "@playwright/test";
import { build } from "vite";
import vue from "@vitejs/plugin-vue";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("test-results/atlas-ui-build");
test.beforeAll(async () => {
  await build({ configFile: false, plugins: [vue()], logLevel: "error", build: {
    outDir: root, emptyOutDir: true, rollupOptions: { input: path.resolve("tests/ui/atlas.html") },
  } });
});
test.beforeEach(async ({ page }) => {
  await page.route("https://atlas.test/**", async route => {
    const pathname = new URL(route.request().url()).pathname;
    const file = path.resolve(root, "." + (pathname === "/" ? "/tests/ui/atlas.html" : pathname));
    if (!file.startsWith(root + path.sep)) return route.fulfill({ status: 403 });
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
    await route.fulfill({ body: await readFile(file), contentType: mime[path.extname(file)] });
  });
});

async function prepare(page, { error = false } = {}) {
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  await page.route("**/api/chat/stream/", async route => {
    const payload = route.request().postDataJSON();
    await ready;
    if (error) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "연결을 확인해주세요." } }) });
    const result = { status: "completed", item_id: payload.item_id, conversation_id: "11111111-1111-4111-8111-111111111111",
      answer: "목성은 태양계에서 가장 무거운 행성이에요.", coverage: "sufficient", sources: [] };
    const frames = [
      'event: status\ndata: {"stage":"interim","kind":"acknowledge","message":"행성들의 질량을 확인하고 있어요."}\n\n',
      `event: result\ndata: ${JSON.stringify({ http_status: 200, payload: result })}\n\n`,
    ].join("");
    return route.fulfill({ contentType: "text/event-stream", body: frames });
  });
  await page.goto("https://atlas.test/");
  await page.getByRole("textbox", { name: "선택한 천체에 질문하기" }).fill("가장 무거운 행성은?");
  await page.getByRole("button", { name: "질문 보내기" }).click();
  await expect(page.locator(".atlas-flight-layer")).toBeVisible();
  return release;
}

test("ship enters from left, cruises centrally, and exits horizontally inside the panel", async ({ page }) => {
  const release = await prepare(page);
  const early = await page.locator(".atlas-ship-carrier").boundingBox();
  await expect(page.locator(".atlas-flight-layer.cruising")).toBeVisible();
  const panel = await page.locator(".chat-answer").boundingBox();
  const ship = await page.locator(".atlas-ship-carrier").boundingBox();
  expect(ship.x).toBeGreaterThan(early.x);
  expect(Math.abs(ship.x + ship.width / 2 - panel.x - panel.width / 2)).toBeLessThan(2);
  expect(Math.abs(ship.y + ship.height / 2 - panel.y - panel.height / 2)).toBeLessThan(2);
  await expect(page.locator(".atlas-ship-drift")).toHaveCSS("animation-name", /atlas-cruise/);
  const star = () => page.locator(".atlas-stars").first().evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41);
  const starX = await star();
  await page.waitForTimeout(160);
  expect(await star()).toBeLessThan(starX);
  await page.screenshot({ path: "test-results/atlas-waiting.png" });
  release();
  await expect(page.locator(".chat-final-answer")).toContainText("목성");
  await expect(page.locator(".chat-answer > .atlas-flight-layer.departing")).toBeVisible();
  await expect(page.locator(".atlas-flight-layer")).toHaveCSS("pointer-events", "none");
  await expect(page.locator(".atlas-flight-layer")).toHaveCSS("overflow", "hidden");
  await expect(page.locator("body > .atlas-flight-layer, body > .atlas-rocket-departure")).toHaveCount(0);
  const start = await page.locator(".atlas-ship-carrier").boundingBox();
  await page.waitForTimeout(220);
  const flying = await page.locator(".atlas-ship-carrier").boundingBox();
  expect(flying.x).toBeGreaterThan(start.x);
  expect(Math.abs(flying.y - start.y)).toBeLessThan(2);
  await expect(page.locator(".chat-interim-text")).toContainText("질량을 확인");
  await expect(page.locator(".atlas-flight-layer")).toHaveCount(0);
});

test("collapsed panel stays closed and shows arrival without a launch", async ({ page }) => {
  const release = await prepare(page);
  await page.getByRole("button", { name: "대화 접기" }).click();
  await expect(page.getByRole("button", { name: "답변 준비 중 · 대화 펼치기" })).toBeVisible();
  release();
  await expect(page.getByRole("button", { name: /답변 도착 · 대화 펼치기/ })).toBeVisible();
  await expect(page.locator(".chat-answer")).toBeHidden();
  await expect(page.locator(".atlas-flight-layer")).toHaveCount(0);
  await page.getByRole("button", { name: /답변 도착 · 대화 펼치기/ }).click();
  await expect(page.locator(".chat-final-answer")).toBeVisible();
  await expect(page.locator(".atlas-flight-layer")).toHaveCount(0);
});

test("reduced motion keeps the rocket still and skips departure", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const release = await prepare(page);
  await expect(page.locator(".atlas-ship-drift")).toHaveCSS("animation-name", "none");
  await expect(page.locator(".atlas-stars").first()).toHaveCSS("animation-name", "none");
  release();
  await expect(page.locator(".chat-final-answer")).toBeVisible();
  await expect(page.locator(".atlas-flight-layer")).toHaveCount(0);
});

test("failure stops the flight and keeps retry available", async ({ page }) => {
  const release = await prepare(page, { error: true });
  release();
  await expect(page.locator(".chat-error")).toContainText("연결을 확인");
  await expect(page.locator(".atlas-ship-carrier")).toHaveCount(0);
  await expect(page.locator(".atlas-flight-layer")).toHaveCount(0);
  await expect(page.locator(".chat-error button").first()).toBeEnabled();
});

test("mobile launch is cancelled cleanly if the panel is closed mid-flight", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const release = await prepare(page);
  await expect(page.locator(".atlas-flight-layer.cruising")).toBeVisible();
  await page.screenshot({ path: "test-results/atlas-mobile-waiting.png" });
  release();
  await expect(page.locator(".atlas-flight-layer.departing")).toBeVisible();
  await page.getByRole("button", { name: "대화 접기" }).click();
  await expect(page.locator(".atlas-flight-layer")).toHaveCount(0);
  await expect(page.locator(".chat-answer")).toBeHidden();
  await page.getByRole("button", { name: /대화 펼치기/ }).click();
  await expect(page.locator(".chat-final-answer")).toBeVisible();
  await expect(page.locator(".atlas-flight-layer")).toHaveCount(0);
});

test("a fast reply exits from its entry position without waiting for cruise", async ({ page }) => {
  const release = await prepare(page);
  release();
  await expect(page.locator(".chat-final-answer")).toBeVisible();
  await expect(page.locator(".atlas-flight-layer.departing")).toBeVisible();
  await expect(page.locator(".atlas-flight-layer")).toHaveCount(0);
});
