import { test, expect } from "@playwright/test";

test("static deployment loads without backend or Atlas", async ({ page }) => {
  const apiRequests = [], failures = [], errors = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname.startsWith("/api/") || request.url().includes(":8000"))
      apiRequests.push(request.url());
  });
  page.on("response", response => { if (response.url().startsWith("http://127.0.0.1:4173/") && response.status() >= 400) failures.push(response.url()); });
  page.on("requestfailed", request => {
    if (request.url().startsWith("http://127.0.0.1:4173/")) failures.push(request.url());
  });
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", route => route.abort());
  await page.goto("/Solar-Atlas/");
  await expect(page.locator(".loading-screen")).toHaveCount(0, { timeout: 90000 });
  await expect(page.locator(".application-shell")).not.toHaveAttribute("inert");
  await expect(page.locator(".solar-viewport canvas")).toBeVisible();
  await expect(page.locator(".chat-dock")).toHaveCount(0);
  await page.locator('button[aria-controls="body-group-planet"]').click();
  await page.getByRole("button", { name: "지구로 이동", exact: true }).click();
  await expect(page.locator(".body-current")).toContainText("지구");
  await page.getByRole("button", { name: "프로젝트 정보 및 출처 열기" }).click();
  const credits = page.getByRole("link", { name: "자연 천체 모델 · 표면 표현" });
  await expect(credits).toHaveAttribute("href", "/Solar-Atlas/assets/models/natural/CREDITS.html");
  expect((await page.request.get(await credits.getAttribute("href"))).ok()).toBe(true);
  expect(apiRequests).toEqual([]);
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});
