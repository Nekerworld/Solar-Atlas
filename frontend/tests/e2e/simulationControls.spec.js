import {expect,test} from "@playwright/test";
import {build} from "vite";
import vue from "@vitejs/plugin-vue";
import {readFile} from "node:fs/promises";
import path from "node:path";
const root=path.resolve("test-results/controls-ui-build");
test.beforeAll(async()=>{await build({configFile:false,plugins:[vue()],logLevel:"error",build:{outDir:root,emptyOutDir:true,rollupOptions:{input:path.resolve("tests/ui/controls.html")}}});});
async function setup(page){
 await page.route("https://controls.test/**",async route=>{
  const pathname=new URL(route.request().url()).pathname;
  const file=path.resolve(root,"."+(pathname==="/"?"/tests/ui/controls.html":pathname));
  if(!file.startsWith(root+path.sep))return route.fulfill({status:403});
  await route.fulfill({body:await readFile(file),contentType:({".html":"text/html",".js":"text/javascript",".css":"text/css"})[path.extname(file)]});
 });
 await page.goto("https://controls.test/");
}
const speed=page=>page.locator("#controls-state");
async function setSpeed(page,value){await page.getByRole("slider",{name:"시뮬레이션 속도 조절"}).fill(String(value));}
async function blur(page){await page.evaluate(()=>document.activeElement?.blur());}
test("continuous slider, step controls, display toggles and original reset",async({page})=>{
 await setup(page);await expect(speed(page)).toHaveAttribute("data-speed","0.25");
 await expect(page.locator(".simulation-speed-status")).toHaveText("x2");
 await setSpeed(page,333);await page.getByRole("button",{name:"시뮬레이션 속도 높이기"}).click();
 await expect(speed(page)).toHaveAttribute("data-speed","0.383");
 await page.getByRole("button",{name:"시뮬레이션 속도 줄이기"}).click();await expect(speed(page)).toHaveAttribute("data-speed","0.333");
 await setSpeed(page,0);await expect(page.locator(".simulation-speed-status")).toHaveText("⏸");
 await expect(page.getByRole("button",{name:"시뮬레이션 속도 줄이기"})).toBeDisabled();
 await setSpeed(page,1000);await expect(page.locator(".simulation-speed-status")).toHaveText("x5");
 await expect(page.getByRole("button",{name:"시뮬레이션 속도 높이기"})).toBeDisabled();
 await page.getByRole("button",{name:"라벨",exact:true}).click();await expect(page.getByRole("button",{name:"라벨",exact:true})).toHaveAttribute("aria-pressed","false");
 await page.getByRole("button",{name:"궤도",exact:true}).click();await page.getByRole("button",{name:"실제 크기",exact:true}).click();
 await expect(page.getByRole("button",{name:"실제 크기",exact:true})).toHaveAttribute("aria-pressed","true");
 await page.getByRole("button",{name:"설정 초기화"}).click();await expect(speed(page)).toHaveAttribute("data-speed","0.25");
 await expect(page.getByRole("button",{name:"라벨",exact:true})).toHaveAttribute("aria-pressed","true");
 await expect(page.getByRole("button",{name:"궤도",exact:true})).toHaveAttribute("aria-pressed","true");
 await expect(page.getByRole("button",{name:"실제 크기",exact:true})).toHaveAttribute("aria-pressed","false");
 await expect(speed(page)).toHaveAttribute("data-focus","Mars");
 await expect(page.locator(".settings-panel")).toHaveCount(0);
 const surfaces=await page.locator(".simulation-speed-row,.simulation-display-row,.zoom-control").evaluateAll(elements=>elements.map(element=>{
  const style=getComputedStyle(element);return [style.backgroundColor,style.borderTopColor,style.borderTopWidth,style.borderRadius,style.backdropFilter];
 }));
 expect(surfaces).toHaveLength(3);expect(surfaces[0]).toEqual(surfaces[1]);expect(surfaces[0]).toEqual(surfaces[2]);
 await page.screenshot({path:"test-results/simulation-controls.png",animations:"disabled"});
});
test("space pauses and resumes exact speed without interfering with input and buttons",async({page})=>{
 await setup(page);await setSpeed(page,537);await blur(page);await page.keyboard.press("Space");
 await expect(speed(page)).toHaveAttribute("data-speed","0");await page.keyboard.press("Space");await expect(speed(page)).toHaveAttribute("data-speed","0.537");
 await page.keyboard.down("Space");await page.keyboard.down("Space");await page.keyboard.up("Space");
 await expect(speed(page)).toHaveAttribute("data-speed","0");await page.keyboard.press("Space");
 const input=page.getByRole("textbox",{name:"선택한 천체에 질문하기"});await input.fill("고리");await input.press("End");await input.press("Space");
 await expect(input).toHaveValue("고리 ");await expect(speed(page)).toHaveAttribute("data-speed","0.537");
 await page.getByRole("button",{name:"라벨",exact:true}).focus();await page.keyboard.press("Space");
 await expect(speed(page)).toHaveAttribute("data-speed","0.537");await expect(page.getByRole("button",{name:"라벨",exact:true})).toHaveAttribute("aria-pressed","false");
 await page.evaluate(()=>document.querySelector("#test-modal").showModal());await page.keyboard.press("Space");await expect(speed(page)).toHaveAttribute("data-speed","0.537");
 await page.evaluate(()=>document.querySelector("#test-modal").close());
});
test("responsive placement avoids the central toolbar",async({page})=>{
 await setup(page);
 for(const width of [1440,1024,390]){
  await page.setViewportSize({width,height:900});
  const panel=await page.locator(".simulation-controls").boundingBox();const nav=await page.locator(".body-navigation").boundingBox();
  expect(panel.x).toBeGreaterThanOrEqual(0);expect(panel.x+panel.width).toBeLessThanOrEqual(width);
  expect(panel.y>=nav.y+nav.height || panel.x>=nav.x+nav.width).toBe(true);
 }
 await page.screenshot({path:"test-results/simulation-controls-mobile.png",animations:"disabled"});
});

test("glass reflection, press recovery and independent selection respect reduced motion",async({page})=>{
 await setup(page);
 const label=page.getByRole("button",{name:"라벨",exact:true});
 const actual=page.getByRole("button",{name:"실제 크기",exact:true});
 const reset=page.getByRole("button",{name:"설정 초기화"});
 await label.hover({position:{x:12,y:12}});
 await expect.poll(()=>label.evaluate(el=>getComputedStyle(el,"::after").opacity)).toBe("0.75");
 const firstX=await label.evaluate(el=>parseFloat(el.style.getPropertyValue("--glass-x")));
 await label.hover({position:{x:30,y:12}});
 expect(await label.evaluate(el=>parseFloat(el.style.getPropertyValue("--glass-x")))).toBeGreaterThan(firstX);
 await expect.poll(()=>actual.evaluate(el=>getComputedStyle(el,"::before").opacity)).toBe("0");
 await page.mouse.down();
 await expect.poll(()=>label.evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).a)).toBeCloseTo(.94,2);
 await page.mouse.up();
 await expect.poll(()=>label.evaluate(el=>getComputedStyle(el,"::before").opacity)).toBe("0");
 await expect.poll(()=>label.evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).a)).toBeCloseTo(1,2);
 await actual.click();
 await expect.poll(()=>actual.evaluate(el=>getComputedStyle(el,"::before").opacity)).toBe("1");
 await expect(label).toHaveAttribute("aria-pressed","false");
 await reset.click();
 await expect(reset).not.toHaveAttribute("aria-pressed");
 await expect.poll(()=>reset.evaluate(el=>getComputedStyle(el,"::before").opacity)).toBe("0");
 await expect(label).toHaveAttribute("aria-pressed","true");
 await page.emulateMedia({reducedMotion:"reduce"});
 await expect(label).toHaveCSS("transition-duration","0s");
 await actual.click();await expect.poll(()=>actual.evaluate(el=>getComputedStyle(el,"::before").opacity)).toBe("1");
 await actual.hover();await page.mouse.down();await expect(actual).toHaveCSS("transform","none");await page.mouse.up();
 await label.hover();
 await page.screenshot({path:"test-results/simulation-glass.png",animations:"disabled"});
});
