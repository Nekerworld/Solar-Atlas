import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/deployment",
  workers: 1,
  timeout: 120000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    channel: "chrome",
    launchOptions: { timeout: 30000, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173/Solar-Atlas/",
    reuseExistingServer: !process.env.CI,
  },
});
