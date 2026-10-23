import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createRenderer, defineComponent, h, nextTick, ref } from "vue";
vi.mock("../../src/api/chat",()=>({CHAT_STORAGE_KEY:"chat-test",sendChat:vi.fn(),loadConversation:vi.fn(),loadConversationTurns:vi.fn(),
 ChatError:class extends Error {constructor(message,options={}){super(message);Object.assign(this,options);}}}));
import { sendChat, loadConversation, loadConversationTurns } from "../../src/api/chat";
import { useChatSession } from "../../src/composables/useChatSession";
const id="11111111-1111-4111-8111-111111111111";
const renderer=createRenderer({createElement:()=>({}),createText:()=>({}),createComment:()=>({}),insert:()=>{},remove:()=>{},
 setText:()=>{},setElementText:()=>{},parentNode:()=>null,nextSibling:()=>null,patchProp:()=>{}});
let app;
function setup(observed=ref({id:"Q319",name:"목성"})){let session;app=renderer.createApp(defineComponent({setup(){session=useChatSession(observed);return()=>h("div");}}));app.mount({});return session;}
async function settle(){for(let i=0;i<8;i++){await Promise.resolve();await nextTick();}}
const result={status:"completed",conversation_id:id,item_id:"Q319",answer:"목성의 설명",coverage:"sufficient",sources:[]};
beforeEach(()=>{vi.resetAllMocks();const data=new Map();vi.stubGlobal("localStorage",{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)});});
afterEach(()=>{app?.unmount();vi.unstubAllGlobals();});
describe("conversation state and recovery",()=>{
 it("card scope activation restores the last item chat and preserves the global draft",async()=>{
   sendChat.mockImplementation(async p=>({...result,item_id:p.item_id,mode:p.mode,conversation_id:p.conversation_id || crypto.randomUUID()}));
   const s=setup();s.state.draft="조건으로 찾아줘";await s.submit();const globalKey=s.active.value.key;
   s.state.draft="그중 더 좁혀줘";
   await s.openItem("Q193");expect(s.state.mode).toBe("item");expect(s.state.scopeItem).toBe("Q193");
   expect(s.state.turns).toHaveLength(0);expect(sendChat).toHaveBeenCalledTimes(1);
   s.state.draft="토성 질문";await s.submit();const itemKey=s.active.value.key;s.state.draft="토성 초안";
   await s.switchMode(false);expect(s.active.value.key).toBe(globalKey);expect(s.state.draft).toBe("그중 더 좁혀줘");
   await s.openItem("Q193");expect(s.active.value.key).toBe(itemKey);expect(s.state.draft).toBe("토성 초안");
   expect(s.state.turns[0].question).toBe("토성 질문");expect(sendChat).toHaveBeenCalledTimes(2);
 });

 it("keeps intermediate messages in order with one final answer",async()=>{
   sendChat.mockImplementation(async(payload,signal,onProgress)=>{
     onProgress({stage:"interim",kind:"acknowledge",message:"질문을 살펴보고 있어요."});
     onProgress({stage:"interim",kind:"explore",message:"조금 더 찾아보고 있어요."});
     onProgress({stage:"interim",kind:"explore",message:"중복된 단계 안내"});
     onProgress({stage:"answer_with_evidence",message:"정리하고 있어요."});
     return result;
   });
   const s=setup();s.state.draft="목성은?";await s.submit();
   expect(s.state.turns).toHaveLength(1);
   expect(s.state.turns[0].interims.map(item=>item.kind)).toEqual(["acknowledge","explore"]);
   expect(s.state.turns[0].state).toBe("completed");
   expect(s.state.turns[0].answer.answer).toBe("목성의 설명");
 });
 it("keeps questions and answers when another question is sent",async()=>{
   sendChat.mockResolvedValue(result);const s=setup();s.state.draft="목성은?";await s.submit();s.state.draft="위성은?";await s.submit();
   expect(s.state.turns).toHaveLength(2);expect(s.state.turns[0].question).toBe("목성은?");
   expect(s.state.turns.every(row=>row.state==="completed")).toBe(true);
   expect(sendChat.mock.calls[1][0].conversation_id).toBe(id);
 });
 it("retries a disconnected request with the same ID and no duplicate user bubble",async()=>{
   sendChat.mockRejectedValueOnce(Object.assign(new Error("offline"),{retryable:true})).mockResolvedValueOnce(result);
   const s=setup();s.state.draft="목성은?";await s.submit();const requestId=s.state.turns[0].requestId;
   await s.submit(s.state.turns[0]);expect(s.state.turns).toHaveLength(1);
   expect(sendChat.mock.calls[1][0].request_id).toBe(requestId);
 });
 it("uses a new request ID after definitive failure but retains one displayed question",async()=>{
   sendChat.mockRejectedValueOnce(Object.assign(new Error("failed"),{retryable:false})).mockResolvedValueOnce(result);
   const s=setup();s.state.draft="목성은?";await s.submit();const old=s.state.turns[0].requestId;
   await s.submit(s.state.turns[0]);expect(s.state.turns).toHaveLength(1);
   expect(s.state.turns[0].requestId).not.toBe(old);expect(s.active.value.hiddenRequests).toContain(old);
 });
 it("restores saved turns on refresh without making a model request",async()=>{
   localStorage.setItem("chat-test",JSON.stringify({active:id,entries:[{key:id,conversationId:id,title:"목성",itemId:"Q319",hiddenRequests:[]}]}));
   loadConversation.mockResolvedValue({id,item_id:"Q319"});
   loadConversationTurns.mockResolvedValue({next:null,results:[{id,request_id:id,question:"목성은?",created_at:"2026-01-01",status:"completed",result}]});
   const s=setup();expect(s.state.expanded).toBe(false);
   await settle();expect(s.state.turns[0].answer.answer).toBe("목성의 설명");expect(sendChat).not.toHaveBeenCalled();
   expect(s.state.expanded).toBe(false);
   await s.restore(s.active.value);expect(s.state.expanded).toBe(true);
 });
 it("keeps integrated and item chats and their drafts independent without empty chat records",async()=>{
   sendChat.mockImplementation(async p=>({...result,item_id:p.item_id,mode:p.mode,conversation_id:p.conversation_id || crypto.randomUUID()}));
   const s=setup();s.state.draft="통합 질문";await s.submit();const globalKey=s.active.value.key;
   s.state.draft="통합 초안";await s.switchMode(true);
   expect(s.state.entries).toHaveLength(1);expect(s.state.turns).toHaveLength(0);
   s.state.draft="목성 질문";await s.submit();const itemKey=s.active.value.key;s.state.draft="목성 초안";
   expect(sendChat.mock.calls[1][0].mode).toBe("item");
   expect(sendChat.mock.calls[1][0].conversation_id).toBe(null);
   await s.switchMode(false);expect(s.active.value.key).toBe(globalKey);expect(s.state.draft).toBe("통합 초안");
   expect(s.state.turns.map(row=>row.question)).toEqual(["통합 질문"]);
   await s.switchMode(true);expect(s.active.value.key).toBe(itemKey);expect(s.state.draft).toBe("목성 초안");
 });
 it("follows body changes only in item mode and restores each body's most recent chat",async()=>{
   sendChat.mockImplementation(async p=>({...result,item_id:p.item_id,mode:p.mode,conversation_id:p.conversation_id || crypto.randomUUID()}));
   const observed=ref({id:"Q319",name:"목성"}),s=setup(observed);
   await s.switchMode(true);s.state.draft="목성 질문";await s.submit();const jupiterKey=s.active.value.key;
   observed.value={id:"Q2",name:"지구"};await settle();expect(s.state.turns).toHaveLength(0);
   s.state.draft="지구 질문";await s.submit();
   observed.value={id:"Q319",name:"목성"};await settle();expect(s.active.value.key).toBe(jupiterKey);
   expect(s.state.turns[0].question).toBe("목성 질문");
   await s.switchMode(false);s.state.draft="통합 질문";await s.submit();const key=s.active.value.key;
   observed.value={id:"Q111",name:"화성"};await settle();expect(s.active.value.key).toBe(key);
 });
 it("stores a background completion in its original chat, with unread status and no cross-chat UI update",async()=>{
   let release;sendChat.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
   const s=setup();s.state.draft="통합 질문";const pending=s.submit();const key=s.active.value.key;
   await s.switchMode(true);s.state.draft="목성 초안";await s.submit();expect(sendChat).toHaveBeenCalledTimes(1);
   release(result);await pending;
   expect(s.state.turns).toHaveLength(0);expect(s.state.draft).toBe("목성 초안");
   expect(s.state.entries.find(e=>e.key===key).unread).toBe(true);
   await s.switchMode(false);expect(s.state.turns[0].state).toBe("completed");
   expect(s.active.value.unread).toBe(false);
 });
 it("restores item mode and drafts after refresh with the panel still closed",async()=>{
   sendChat.mockImplementation(async p=>({...result,item_id:p.item_id,mode:p.mode}));
   const s=setup();await s.switchMode(true);s.state.draft="목성 질문";await s.submit();s.state.draft="이어서 쓸 초안";
   await settle();app.unmount();
   loadConversation.mockResolvedValue({id,item_id:"Q319",mode:"item"});
   loadConversationTurns.mockResolvedValue({next:null,results:[{id,request_id:id,question:"목성 질문",created_at:"2026-01-01",status:"completed",result}]});
   const restored=setup();await settle();
   expect(restored.state.mode).toBe("item");expect(restored.state.expanded).toBe(false);
   expect(restored.state.draft).toBe("이어서 쓸 초안");expect(restored.state.turns).toHaveLength(1);
 });
 it("a late history response cannot replace the newly selected scope",async()=>{
   localStorage.setItem("chat-test",JSON.stringify({active:id,entries:[{key:id,conversationId:id,title:"예전 통합",itemId:"Q319"}]}));
   let release;loadConversation.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
   loadConversationTurns.mockResolvedValue({next:null,results:[]});
   const s=setup();await s.switchMode(true);s.state.draft="목성 초안";
   release({id,item_id:"Q319",mode:"global"});await settle();
   expect(s.state.mode).toBe("item");expect(s.state.draft).toBe("목성 초안");expect(s.state.turns).toHaveLength(0);
 });
});
