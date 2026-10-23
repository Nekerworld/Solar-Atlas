import { computed, onBeforeUnmount, onMounted, reactive, shallowRef, watch } from "vue";
import { CHAT_STORAGE_KEY, ChatError, loadConversation, loadConversationTurns, sendChat } from "../api/chat";
import { parseHistory, mergeTurns, validId } from "../api/chatHistory";
import { presentAnswer } from "../api/answerPresentation";

const validItem = id => /^Q[1-9][0-9]*$/.test(id || "");
const scopeKey = (mode, id) => mode === "item" ? `item:${id}` : "global";
function makeView(mode="global", itemId="", activeKey=null) {
  return reactive({mode,scopeItem:itemId,activeKey,draft:"",turns:[],page:1,hasOlder:false,
    restoring:false,olderLoading:false,historyError:"",missing:false,loaded:false});
}

export function useChatSession(observedBody, onUpdate = () => {}) {
  const current=shallowRef(makeView());
  const scopeViews=new Map([["global",current.value]]), entryViews=new Map(), controllers=new Set();
  let disposed=false,ready=false,savedScopes={},savedDrafts={};
  const state=reactive({entries:[],expanded:false,historyOpen:false,pending:false,storageError:""});
  // Expose the existing UI contract, backed by independently owned view state.
  for(const field of ["mode","scopeItem","activeKey","draft","turns","page","hasOlder","restoring","olderLoading","historyError","missing"])
    Object.defineProperty(state,field,{enumerable:true,get:()=>current.value[field],set:value=>{current.value[field]=value;}});
  const active=computed(()=>state.entries.find(entry=>entry.key===state.activeKey));
  const currentPending=computed(()=>state.turns.some(row=>row.state==="pending"));
  const blocked=computed(()=>state.pending || state.restoring || state.olderLoading);
  const unresolved=computed(()=>state.turns.some(row=>row.state==="interrupted" || (row.state==="error" && row.retrySame)));
  const canSend=computed(()=>!blocked.value && !unresolved.value && !state.missing && !!state.draft.trim());

  function persist() {
    if(!ready || disposed)return;
    const scopes={...savedScopes},drafts={...savedDrafts};
    for(const [key,view] of scopeViews){scopes[key]=view.activeKey;drafts[key]=view.draft;}
    try {
      localStorage.setItem(CHAT_STORAGE_KEY,JSON.stringify({version:2,mode:state.mode,active:state.activeKey,entries:state.entries,scopes,drafts}));
      state.storageError="";
    } catch {state.storageError="대화 목록을 이 브라우저에 저장하지 못했어요. 새로고침하면 목록이 유지되지 않을 수 있어요.";}
  }
  function remember(entry){entry.updatedAt=new Date().toISOString();state.entries.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));persist();}
  function notify(view,force=false){if(!disposed && current.value===view)onUpdate(force);}
  function markRead(){if(active.value?.unread){active.value.unread=false;persist();}}
  function presentation(result){return {...presentAnswer(result),warnings:Array.isArray(result.warnings)?result.warnings:[]};}
  function fromTurn(turn,entry,fallbackItem){
    const itemId=turn.observed_item_id ?? fallbackItem ?? entry.itemId;
    return {key:turn.id,requestId:turn.request_id,question:turn.question,createdAt:turn.created_at,itemId,observation:"",
      state:turn.status==="completed"?"completed":turn.status==="processing"?"interrupted":"error",
      answer:turn.status==="completed"?presentation(turn.result || {}):null,
      error:turn.status==="processing"?"이전 요청의 답변 상태를 확인해주세요.":"이 질문의 답변을 완료하지 못했어요.",
      retrySame:turn.status==="processing",payload:{item_id:itemId,mode:entry.mode,question:turn.question,
        conversation_id:entry.conversationId,request_id:turn.request_id,allow_external:turn.allow_external!==false}};
  }
  function journalRow(pending,entry){return {key:pending.payload.request_id,requestId:pending.payload.request_id,
    question:pending.payload.question,createdAt:pending.createdAt || new Date().toISOString(),itemId:pending.payload.item_id,
    observation:pending.observation || "",state:"interrupted",answer:null,error:"전송했던 질문의 답변 상태를 확인해주세요.",
    retrySame:pending.retrySame!==false,payload:{...pending.payload,mode:entry.mode}};}
  function pageRows(page,entry,fallbackItem){
    if(!Array.isArray(page.results))throw new ChatError("대화 기록을 읽지 못했어요.");
    return page.results.filter(turn=>validId(turn.request_id) && typeof turn.question==="string" &&
      !entry.hiddenRequests.includes(turn.request_id)).reverse().map(turn=>fromTurn(turn,entry,fallbackItem));
  }
  async function loadView(entry,view){
    if(view.loaded || view.restoring)return;
    view.restoring=true;view.historyError="";
    const controller=new AbortController();controllers.add(controller);
    try {
      let rows=[],hasOlder=false;
      if(entry.conversationId){
        const [meta,page]=await Promise.all([loadConversation(entry.conversationId,controller.signal),loadConversationTurns(entry.conversationId,1,controller.signal)]);
        if((meta.mode || "global")!==entry.mode || (entry.mode==="item" && meta.item_id!==entry.itemId))
          throw new ChatError("저장된 대화의 모드 또는 천체 정보가 달라요.");
        rows=pageRows(page,entry,meta.item_id);hasOlder=!!page.next;
      }
      if(disposed)return;
      if(entry.pending){
        const existing=rows.find(row=>row.requestId===entry.pending.payload.request_id);
        if(existing){if(existing.state==="completed")entry.pending=null;else existing.observation=entry.pending.observation || "";}
        else rows=mergeTurns([journalRow(entry.pending,entry)],rows);
      }
      view.turns=rows;view.page=1;view.hasOlder=hasOlder;view.missing=false;view.loaded=true;persist();notify(view,true);
    } catch(error){if(error.name!=="AbortError")view.historyError=error.message || "기록을 불러오지 못했어요. 다시 선택해주세요.";}
    finally{view.restoring=false;controllers.delete(controller);}
  }
  function bind(view,expand){
    current.value=view;scopeViews.set(scopeKey(view.mode,view.scopeItem),view);
    state.historyOpen=false;
    if(expand)state.expanded=true;
    if(state.expanded)markRead();
    persist();notify(view,true);
  }
  async function restore(entry,{expand=true}={}){
    if(!entry)return;
    let view=entryViews.get(entry.key);
    if(!view){view=makeView(entry.mode || "global",entry.mode==="item"?entry.itemId:"",entry.key);entryViews.set(entry.key,view);}
    bind(view,expand);await loadView(entry,view);
  }
  async function activateScope(mode,itemId=""){
    const key=scopeKey(mode,itemId);
    let view=scopeViews.get(key);
    if(view){bind(view,false);const entry=state.entries.find(e=>e.key===view.activeKey);if(entry)await loadView(entry,view);return;}
    const hasSaved=Object.hasOwn(savedScopes,key);
    const entry=hasSaved ? state.entries.find(e=>e.key===savedScopes[key]) :
      state.entries.find(e=>scopeKey(e.mode,e.itemId)===key);
    if(entry){
      view=entryViews.get(entry.key);
      if(!view){view=makeView(mode,itemId,entry.key);entryViews.set(entry.key,view);}
    } else view=makeView(mode,itemId);
    // Persisted drafts belong to the last selected conversation of this scope.
    if(savedDrafts[key])view.draft=savedDrafts[key];
    delete savedDrafts[key];
    bind(view,false);
    if(entry)await loadView(entry,view);
  }
  async function switchMode(itemMode){
    const mode=itemMode && validItem(observedBody.value.id)?"item":"global";
    const itemId=mode==="item"?observedBody.value.id:"";
    if(mode===state.mode && itemId===state.scopeItem)return;
    persist();await activateScope(mode,itemId);persist();
  }
  async function openItem(itemId){
    if(!validItem(itemId) || disposed)return;
    persist();state.expanded=true;
    await activateScope("item",itemId);
    persist();
  }
  async function loadOlder(){
    const view=current.value,entry=active.value;
    if(blocked.value || !view.hasOlder || !entry?.conversationId)return;
    view.olderLoading=true;view.historyError="";
    const controller=new AbortController();controllers.add(controller);
    try {
      const page=await loadConversationTurns(entry.conversationId,view.page+1,controller.signal);
      if(disposed)return;
      view.turns=mergeTurns(pageRows(page,entry,entry.itemId),view.turns);view.page++;view.hasOlder=!!page.next;
      if(entry.pending && view.turns.some(row=>row.requestId===entry.pending.payload.request_id && row.state==="completed")){entry.pending=null;persist();}
    } catch(error){if(error.name!=="AbortError")view.historyError=error.message;}
    finally{view.olderLoading=false;controllers.delete(controller);}
  }
  function newConversation(){
    if(blocked.value)return;
    const view=makeView(state.mode,state.scopeItem);view.loaded=true;
    bind(view,true);
  }
  async function submit(retryRow=null){
    if(blocked.value || state.missing || (!retryRow && !canSend.value))return;
    const view=current.value;
    let row=retryRow,entry=active.value;
    if(!row){
      const selected=observedBody.value,question=view.draft.trim();
      if(!entry){
        const record={key:crypto.randomUUID(),conversationId:null,title:question.slice(0,80),mode:view.mode,
          itemId:view.mode==="item"?view.scopeItem:selected.id,updatedAt:new Date().toISOString(),hiddenRequests:[],pending:null,unread:false};
        state.entries.unshift(record);view.activeKey=record.key;entry=active.value;entryViews.set(entry.key,view);
      }
      const itemId=view.mode==="item"?view.scopeItem:selected.id;
      view.turns.push({key:crypto.randomUUID(),requestId:crypto.randomUUID(),question,createdAt:new Date().toISOString(),
        itemId,observation:selected.name,answer:null,error:"",retrySame:false});
      row=view.turns.at(-1);
      row.payload={item_id:itemId,mode:entry.mode,question,conversation_id:entry.conversationId,request_id:row.requestId,allow_external:true};
      view.draft="";
    } else {
      if(!view.turns.includes(row) || !entry)return;
      if(!row.retrySame){entry.hiddenRequests.push(row.requestId);row.requestId=crypto.randomUUID();
        row.payload={...row.payload,mode:entry.mode,request_id:row.requestId,conversation_id:entry.conversationId};}
    }
    view.loaded=true;state.expanded=true;state.historyOpen=false;state.pending=true;entry.unread=false;
    row.state="pending";row.error="";row.interims=[];
    row.progress="질문을 접수하고 있어요…";
    entry.pending={payload:{...row.payload},createdAt:row.createdAt,observation:row.observation,retrySame:true};
    remember(entry);notify(view,true);
    const controller=new AbortController();controllers.add(controller);
    try {
      const result=await sendChat(row.payload,controller.signal,event=>{
        if(disposed || row.state!=="pending")return;
        if(event.stage==="interim"){
          if(!row.interims.some(item=>item.kind===event.kind || item.message===event.message))row.interims.push({kind:event.kind,message:event.message});
        }else row.progress=event.message;
        notify(view,false);
      });
      if(disposed)return;
      if(result.item_id!==row.payload.item_id || typeof result.answer!=="string" || result.status!=="completed" ||
          !validId(result.conversation_id) || (entry.mode==="item" && result.mode!=="item"))
        throw new ChatError("답변 정보를 읽지 못했어요. 다시 확인해주세요.",{retryable:true});
      entry.conversationId=result.conversation_id;row.answer=presentation(result);row.state="completed";row.retrySame=false;entry.pending=null;
      entry.unread=current.value!==view || !state.expanded;
      remember(entry);notify(view,false);
    } catch(error){
      if(error.name==="AbortError")return;
      row.state="error";row.error=error.message || "답변을 불러오지 못했어요.";row.retrySame=error.retryable===true;
      if(validId(error.data?.conversation_id))entry.conversationId=error.data.conversation_id;
      if(entry.pending)entry.pending.retrySame=row.retrySame;
      if(error.data?.error?.code==="conversation_not_found"){view.missing=true;row.error+=" 새 대화를 시작해주세요.";}
      remember(entry);notify(view,false);
    } finally{state.pending=false;controllers.delete(controller);}
  }
  watch(()=>observedBody.value.id,id=>{if(ready && state.mode==="item" && validItem(id) && id!==state.scopeItem)activateScope("item",id);});
  watch(()=>[state.draft,state.mode,state.scopeItem],persist);
  onMounted(async()=>{
    let saved;
    try{saved=parseHistory(localStorage.getItem(CHAT_STORAGE_KEY));}catch{saved={entries:[],active:null};}
    state.entries=saved.entries;savedScopes=saved.scopes || {};savedDrafts=saved.drafts || {};
    if(!saved.scopes && saved.active)savedScopes.global=saved.active;
    // Remove the initial placeholder so first load can select persisted history.
    scopeViews.clear();ready=true;
    await activateScope(saved.mode==="item" && validItem(observedBody.value.id)?"item":"global",saved.mode==="item"?observedBody.value.id:"");
    persist();
  });
  onBeforeUnmount(()=>{persist();disposed=true;for(const controller of controllers)controller.abort();});
  return {state,active,blocked,currentPending,unresolved,canSend,submit,restore,loadOlder,newConversation,switchMode,openItem,markRead};
}
