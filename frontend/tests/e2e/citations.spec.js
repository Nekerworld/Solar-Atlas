import {expect,test} from "@playwright/test";
import {build} from "vite";
import vue from "@vitejs/plugin-vue";
import {readFile} from "node:fs/promises";
import path from "node:path";
const root=path.resolve("test-results/citations-ui-build");
test.beforeAll(async()=>{await build({configFile:false,plugins:[vue()],logLevel:"error",build:{outDir:root,emptyOutDir:true,rollupOptions:{input:path.resolve("tests/ui/citations.html")}}});});
test("citations open matching evidence and support keyboard activation",async({page})=>{
 await page.route("https://citations.test/**",async route=>{
 const pathname=new URL(route.request().url()).pathname;
 const file=path.resolve(root,"."+(pathname==="/"?"/tests/ui/citations.html":pathname));
 if(!file.startsWith(root+path.sep))return route.fulfill({status:403});
 await route.fulfill({body:await readFile(file),contentType:({".html":"text/html",".js":"text/javascript",".css":"text/css"})[path.extname(file)]});
 });
 await page.goto("https://citations.test/");
 await expect(page.locator(".chat-citation")).toHaveText(["[1]","[2]","[1]"]);
 await expect(page.locator(".chat-interim-text .chat-citation")).toHaveCount(0);
 await expect(page.locator(".chat-sources")).not.toHaveAttribute("open","");
 await page.getByRole("button",{name:"근거 2 보기"}).click();
 const evidence=page.locator('.chat-numbered-evidence[aria-label="근거 2"]');
 await expect(evidence).toBeVisible();await expect(evidence).toBeFocused();
 await expect(evidence).toContainText("두 번째 실제 근거");
 await expect(page.locator(".chat-sources summary").first()).toHaveText("출처 1개 · 인용 근거 2개");
 await page.locator(".chat-sources summary").first().click();
 const first=page.getByRole("button",{name:"근거 1 보기"}).first();await first.focus();await page.keyboard.press("Enter");
 await expect(page.locator('.chat-numbered-evidence[aria-label="근거 1"]')).toBeFocused();
 await expect(page.locator(".chat-final-answer")).toContainText("나머지는 더 확인이 필요해요.");
 await page.screenshot({path:"test-results/citations.png"});
});
