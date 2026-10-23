import { expect, test } from "@playwright/test";
import { build } from "vite";
import vue from "@vitejs/plugin-vue";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

const root=path.resolve("test-results/atlas-ui-build");
test.beforeAll(async()=>{await build({configFile:false,plugins:[vue()],logLevel:"error",build:{outDir:root,emptyOutDir:true,rollupOptions:{input:path.resolve("tests/ui/atlas.html")}}});});
async function setup(page){
  await page.route("https://atlas.test/**",async route=>{
    const pathname=new URL(route.request().url()).pathname;
    const file=path.resolve(root,"."+(pathname==="/"?"/tests/ui/atlas.html":pathname));
    if(!file.startsWith(root+path.sep))return route.fulfill({status:403});
    const mime={".html":"text/html",".js":"text/javascript",".css":"text/css"};
    await route.fulfill({body:await readFile(file),contentType:mime[path.extname(file)]});
  });
  const records=new Map(),requests=[];
  let gate=null,release=null;
  await page.route("**/api/**",async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==="/api/chat/stream/"){
      const p=route.request().postDataJSON();requests.push(p);
      const cid=p.conversation_id || randomUUID();
      if(!records.has(cid))records.set(cid,{id:cid,item_id:p.item_id,mode:p.mode,turns:[]});
      const waiting=gate;gate=null;if(waiting)await waiting;
      const result={status:"completed",conversation_id:cid,item_id:p.item_id,mode:p.mode,answer:`${p.question}의 답변`,coverage:"sufficient",sources:[]};
      records.get(cid).turns.unshift({id:randomUUID(),request_id:p.request_id,observed_item_id:p.item_id,question:p.question,
        status:"completed",created_at:new Date().toISOString(),result});
      return route.fulfill({contentType:"text/event-stream",body:`event: result\ndata: ${JSON.stringify({http_status:200,payload:result})}\n\n`});
    }
    const match=url.pathname.match(/\/api\/conversations\/([^/]+)\/(turns\/)?$/);
    const record=match && records.get(match[1]);
    if(!record)return route.fulfill({status:404,contentType:"application/json",body:"{}"});
    return route.fulfill({contentType:"application/json",body:JSON.stringify(match[2]?{next:null,results:record.turns}:{id:record.id,item_id:record.item_id,mode:record.mode})});
  });
  await page.goto("https://atlas.test/");
  await page.getByRole("combobox",{name:"검증용 관찰 천체"}).selectOption("Earth");
  return {requests,hold(){gate=new Promise(resolve=>{release=resolve;});},release(){release();}};
}
async function ask(page,question){
  await page.getByRole("textbox",{name:"선택한 천체에 질문하기"}).fill(question);
  await page.getByRole("button",{name:"질문 보내기"}).click();
  await expect(page.locator(".chat-final-answer").last()).toContainText(`${question}의 답변`);
}
const toggle=(page,name)=>page.getByRole("checkbox",{name:`${name}에 대해 물어보기`});

test("global chat, item chats, drafts and history groups remain independent",async({page})=>{
  const api=await setup(page);
  await ask(page,"통합 질문");
  const globalId=api.requests[0].conversation_id;
  await page.getByRole("textbox").fill("통합 초안");
  await toggle(page,"지구").check();
  await expect(page.locator(".chat-final-answer")).toHaveCount(0);
  await ask(page,"지구 질문");
  await page.getByRole("textbox").fill("지구 초안");
  await page.getByRole("combobox").selectOption("Jupiter");
  await expect(toggle(page,"목성")).toBeChecked();
  await expect(page.locator(".chat-final-answer")).toHaveCount(0);
  await ask(page,"목성 질문");
  await page.getByRole("combobox").selectOption("Earth");
  await expect(page.locator(".chat-final-answer")).toContainText("지구 질문의 답변");
  await expect(page.getByRole("textbox")).toHaveValue("지구 초안");
  await toggle(page,"지구").uncheck();
  await expect(page.locator(".chat-final-answer")).toContainText("통합 질문의 답변");
  await expect(page.getByRole("textbox")).toHaveValue("통합 초안");
  await expect(page.getByText("저장된 대화 있음",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"이전 대화",exact:true}).click();
  await expect(page.locator('[data-mode="global"]>summary')).toContainText("1개");
  await expect(page.locator('[data-item-id="Q2"]>summary')).toContainText("지구 1개");
  await expect(page.locator('[data-item-id="Q319"]>summary')).toContainText("목성 1개");
  await page.locator('[data-item-id="Q319"]>summary').click();
  await page.locator('[data-item-id="Q319"] .chat-history-entry').click();
  await expect(page.getByRole("combobox")).toHaveValue("Jupiter");
  await expect(toggle(page,"목성")).toBeChecked();
  expect(api.requests.map(p=>p.mode)).toEqual(["global","item","item"]);
  expect(globalId).toBe(null);
  await page.screenshot({path:"test-results/atlas-item-chat.png"});
});

test("completion after mode switch stays in its owner and marks the history group",async({page})=>{
  const api=await setup(page);api.hold();
  await page.getByRole("textbox").fill("대기 중 통합 질문");
  await page.getByRole("button",{name:"질문 보내기"}).click();
  await expect(page.locator(".atlas-flight-layer")).toBeVisible();
  await toggle(page,"지구").check();
  await expect(page.locator(".atlas-flight-layer")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"질문 보내기"})).toBeDisabled();
  api.release();
  await expect(page.getByText("다른 대화의 답변을 준비하고 있어요. 완료되면 질문을 보낼 수 있어요.")).toHaveCount(0);
  await expect(page.locator(".chat-final-answer")).toHaveCount(0);
  await page.getByRole("button",{name:"이전 대화",exact:true}).click();
  await expect(page.locator('[data-mode="global"]>summary')).toContainText("답변 도착");
  await toggle(page,"지구").uncheck();
  await expect(page.locator(".chat-final-answer")).toContainText("대기 중 통합 질문의 답변");
  await expect(page.locator(".atlas-flight-layer")).toHaveCount(0);
});

test("new item conversations are counted only after sending and refresh starts collapsed",async({page})=>{
  await setup(page);await toggle(page,"지구").check();
  await ask(page,"첫 지구 질문");
  await page.getByRole("button",{name:"새 대화",exact:true}).click();
  await page.getByRole("button",{name:"이전 대화",exact:true}).click();
  await expect(page.locator('[data-item-id="Q2"]>summary')).toContainText("1개");
  await ask(page,"두 번째 지구 질문");
  await page.getByRole("textbox").fill("저장할 초안");
  await page.reload();
  await expect(page.locator(".chat-answer")).toBeHidden();
  await expect(toggle(page,"지구")).toBeChecked();
  await expect(page.getByRole("textbox")).toHaveValue("저장할 초안");
  await page.getByRole("button",{name:/대화 펼치기/}).click();
  await expect(page.locator(".chat-final-answer")).toContainText("두 번째 지구 질문의 답변");
  await page.getByRole("button",{name:"이전 대화",exact:true}).click();
  await expect(page.locator('[data-item-id="Q2"]>summary')).toContainText("2개");
});
