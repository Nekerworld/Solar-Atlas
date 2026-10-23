import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PerspectiveCamera, Vector3 } from "three";
test.beforeEach(async ({ page }) => {
  // Serve the real production build through Playwright's request interception.
  // This avoids Windows sandbox loopback restrictions without changing app code.
  const root = path.resolve("dist");
  await page.route("http://solar-system.test/**", async (route) => {
    const pathname = decodeURIComponent(
      new URL(route.request().url()).pathname,
    );
    const file = path.resolve(
      root,
      pathname === "/" ? "./index.html" : "." + pathname,
    );
    if (!file.startsWith(root + path.sep)) {
      await route.fulfill({ status: 403 });
      return;
    }
    const mime = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".jpeg": "image/jpeg",
      ".jpg": "image/jpeg",
      ".png": "image/png",
      ".svg": "image/svg+xml",
    };
    try {
      await route.fulfill({
        body: await readFile(file),
        contentType: mime[path.extname(file)] ?? "application/octet-stream",
      });
    } catch {
      await route.fulfill({ status: 404 });
    }
  });
  // Deterministic phases; the shipped app still uses the original random phase.
  await page.addInitScript(() => {
    let n = 0;
    Math.random = () => 0.01 + ++n / 1e9;
  });
});
test("automatic loading screen, settings, focus, scale and persistence", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".loading-screen")).toBeVisible();
  await expect(page.getByRole("heading", {name:"SOLAR ATLAS"})).toBeVisible();
  await expect(page.getByRole("button", {name:"Jump in!"})).toHaveCount(0);
  await expect(page.locator(".loading-screen")).toHaveCount(0,{timeout:60000});
  await expect(page.locator(".application-shell")).not.toHaveAttribute("inert");
  await expect(page.locator("canvas").first()).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Fullscreen", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator('input[name="focused-body"][value="Mars"]'),
  ).toBeChecked();
  await page.screenshot({ path: "work/vue-default.png" });
  await page.locator('button[aria-controls="body-group-planet"]').click();
  await page.locator('input[name="focused-body"][value="Earth"]').check();
  await expect(
    page.locator('input[name="focused-body"][value="Earth"]'),
  ).toBeChecked();
  await page.getByRole("checkbox", { name: "Labels", exact: true }).uncheck();
  await expect(page.locator(".canvas-body-object:visible")).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Labels", exact: true }).check();
  await page.getByRole("checkbox", { name: "Orbits", exact: true }).uncheck();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("showOrbitPaths")))
    .toBe("false");
  await page.getByRole("slider", { name: "Simulation speed" }).fill("0");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("timeSpeedModifier")))
    .toBe("0");
  await page.locator('.canvas-body-object[data-body="Earth"] p').click();
  await page
    .getByRole("checkbox", { name: "Actual scale", exact: true })
    .check();
  await expect(page.locator(".distance-card")).toContainText("km");
  await page.locator('button[aria-controls="body-group-moon"]').click();
  await page.locator('input[name="focused-body"][value="Moon"]').check();
  await page
    .getByRole("checkbox", { name: "Actual scale", exact: true })
    .uncheck();
  await expect(page.locator(".distance-card")).toHaveCount(0);
  await expect(page.getByRole("button", { name:"Help", exact:true })).toHaveCount(0);
  await expect(page.getByRole("button", { name:"About", exact:true })).toHaveCount(0);
  const info = page.getByRole("button", { name:"프로젝트 정보 및 출처 열기" });
  await info.click();
  await expect(page.getByRole("dialog", {name:"이 여정에 함께한 자료"})).toBeVisible();
  await expect(page.getByRole("link", {name:"자연 천체 모델 · 표면 표현"})).toHaveAttribute("href","/assets/models/natural/CREDITS.html");
  await page.keyboard.press("Escape");
  await expect(info).toBeFocused();
  await expect(page.getByRole("slider", {name:"관찰 거리: 위로 확대, 아래로 축소"})).toBeVisible();
  await page.getByRole("button", { name: "Reset settings" }).click();
  await expect(
    page.locator('input[name="focused-body"][value="Mars"]'),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Orbits", exact: true }),
  ).toBeChecked();
  await page.locator('input[name="focused-body"][value="Jupiter"]').check();
  await page.reload();
  await expect(page.locator(".loading-screen")).toHaveCount(0,{timeout:60000});
  await expect(page.locator('input[name="quality"]')).toHaveCount(0);
  await expect(
    page.locator('input[name="focused-body"][value="Jupiter"]'),
  ).toBeChecked();
  expect(errors).toEqual([]);
});
test("automatic startup and keyboard settings work on mobile", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".loading-screen")).toHaveCount(0,{timeout:60000});
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("checkbox", {name:"Labels",exact:true})).toBeHidden();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("checkbox", {name:"Labels",exact:true})).toBeVisible();
  await page.reload();
  await expect(page.locator(".loading-screen")).toHaveCount(0,{timeout:60000});
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("canvas").first()).toHaveJSProperty(
    "clientWidth",
    390,
  );
  await expect(
    page.getByRole("checkbox", { name: "Labels", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "work/vue-mobile.png" });
});
test("restores the original hidden debug setting and supports mesh selection", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("showDebugInfo", "true");
    localStorage.setItem("actualScale", "true");
    localStorage.setItem("timeSpeedModifier", "0");
  });
  await page.goto("/");
  await expect(page.locator(".loading-screen")).toHaveCount(0,{timeout:60000});
  await expect(page.locator('[data-testid="debug-stats"]')).toBeVisible();
  await expect(page.locator(".distance-card")).toHaveCSS("left", "85px");
  await page
    .getByRole("checkbox", { name: "Actual scale", exact: true })
    .uncheck();
  await page.getByRole("radio", { name: "Sun", exact: true }).check();
  await page.getByRole("checkbox", { name: "Labels", exact: true }).uncheck();
  // Wait for the original controls/focus update order to settle, then click the
  // rendered Mercury mesh using its known, paused illustrative world position.
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let remaining = 4;
        const frame = () => {
          if (--remaining === 0) resolve();
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
  );
  const camera = new PerspectiveCamera(50, 1280 / 900, 50, 15000000);
  camera.position.set(-400000, 125000, 400000);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const mercury = new Vector3(200000, 0, 0).project(camera);
  await page
    .locator("canvas")
    .first()
    .click({
      position: { x: mercury.x * 640 + 640, y: -mercury.y * 450 + 450 },
    });
  await expect(
    page.getByRole("radio", { name: "Mercury", exact: true }),
  ).toBeChecked();
  await page.screenshot({ path: "work/vue-debug.png" });
});
