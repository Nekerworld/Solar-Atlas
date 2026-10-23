import { expect, test } from "@playwright/test";
import { build } from "vite";
import vue from "@vitejs/plugin-vue";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

const root=path.resolve("test-results/discovery-ui-build");
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
      if(p.question==="고리가 있는 행성 찾아줘") Object.assign(result,{
        response_mode:"discovery",answer:"조건에 맞는 천체들이에요.",
        discovery:{conditions:["고리가 있는 행성"],result_ids:["Q193"]},
        cards:[{item_id:"Q193",name:"토성",reason:"고리가 있다는 근거를 확인했어요.",evidence_ids:["D0_C1"]}],
        sources:[{evidence_id:"D0_C1",title:"토성",document_id:"kowiki:1",url:"https://ko.wikipedia.org/?curid=1",quote:"토성의 고리",section:"고리"}]});
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
  return {requests,hold(){gate=new Promise(resolve=>{release=resolve;});},release(){release();}};
}

test("condition cards keep evidence, restore item history and survive reload",async({page})=>{
 const api=await setup(page);
 const input=page.getByRole("textbox",{name:"선택한 천체에 질문하기"});
 await input.fill("고리가 있는 행성 찾아줘");await page.getByRole("button",{name:"질문 보내기"}).click();
 const card=page.getByRole("button",{name:"토성 전용 대화로 이동"});await expect(card).toBeVisible();
 await expect(page.locator(".chat-discovery-card")).toContainText("고리가 있다는 근거");
 await page.getByRole("button",{name:"근거 1 보기"}).click();await expect(page.locator(".chat-numbered-evidence")).toBeVisible();
 await input.fill("그중 더 좁혀줘");await card.click();
 await expect(page.getByRole("checkbox",{name:"토성에 대해 물어보기"})).toBeChecked();
 await expect(page.locator(".chat-body-badge")).toHaveText("토성");
 expect(api.requests).toHaveLength(1);
 await input.fill("토성에 대해 설명해줘");await page.getByRole("button",{name:"질문 보내기"}).click();
 await expect(page.locator(".chat-final-answer")).toContainText("토성에 대해 설명해줘의 답변");
 const itemConversation=api.requests[1];expect(itemConversation.mode).toBe("item");expect(itemConversation.item_id).toBe("Q193");
 await page.getByRole("checkbox",{name:"토성에 대해 물어보기"}).uncheck();
 await expect(card).toBeVisible();await expect(input).toHaveValue("그중 더 좁혀줘");
 await card.click();await expect(page.locator(".chat-final-answer")).toContainText("토성에 대해 설명해줘의 답변");
 expect(api.requests).toHaveLength(2);
 await page.reload();await page.getByRole("button",{name:"대화 펼치기"}).click();
 await page.getByRole("checkbox").uncheck();await expect(card).toBeVisible();
 await expect(page.locator(".chat-discovery-card .chat-citation")).toHaveText("[1]");
 await page.screenshot({path:"test-results/discovery-cards.png",animations:"disabled"});
});

test("fold controls stay on the left and retain keyboard focus at both widths",async({page})=>{
 const api=await setup(page);
 for(const width of [1280,390]){
  await page.setViewportSize({width,height:900});
  const expand=page.getByRole("button",{name:"대화 펼치기",exact:true});
  await expect(expand).toContainText("🔼");
  await expand.click();
  const fold=page.getByRole("button",{name:"대화 접기",exact:true});
  await expect(fold).toBeFocused();await expect(fold).toContainText("🔽");
  const header=page.locator(".chat-answer-header");
  const title=await header.getByRole("heading").boundingBox();const left=await fold.boundingBox();
  const actions=await header.getByRole("button",{name:"이전 대화"}).boundingBox();
  expect(left.x).toBeGreaterThan(title.x+title.width);expect(left.x+left.width).toBeLessThanOrEqual(actions.x);
  await fold.press("Enter");await expect(expand).toBeFocused();
  const compact=await expand.boundingBox();const history=await page.locator(".chat-compact-actions").getByRole("button",{name:"이전 대화"}).boundingBox();
  expect(compact.x+compact.width).toBeLessThanOrEqual(history.x);
 }
 expect(api.requests).toHaveLength(0);
 await page.screenshot({path:"test-results/atlas-fold-mobile.png",animations:"disabled"});
});
