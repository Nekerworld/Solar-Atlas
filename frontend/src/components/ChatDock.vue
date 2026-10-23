<script setup>
import { computed, nextTick, ref, watch } from "vue";
import { focusBody, revealBody, solarSystemData, store } from "../data/store";
import { flattenBodies } from "../data/bodyCatalog";
import targetCatalog from "../../../catalog/solar_targets.json";
import { createMentionFinder } from "../api/chatNavigation";
import { useChatSession } from "../composables/useChatSession";
import ChatTurn from "./ChatTurn.vue";
import RocketLoading from "./RocketLoading.vue";
import ChatScopeToggle from "./ChatScopeToggle.vue";

const allBodies=flattenBodies(solarSystemData.real);
const registry=new Map(allBodies.map(body=>[body.name,body]));
const targets=new Map(targetCatalog.targets.map(body=>[body.frontend_name,body]));
const targetLabels=new Map(targetCatalog.targets.map(body=>[body.id,body.name_ko]));
const body=computed(()=>({id:targets.get(store.userSettings.focusedBody)?.id || "",
  name:registry.get(store.userSettings.focusedBody)?.displayName || "태양계"}));
const visualTargets=allBodies.filter(body=>body.wikidataId).map(body=>({frontend_name:body.name,name_ko:body.displayName,aliases:body.aliases || []}));
const findMentions=createMentionFinder(allBodies,[...targetCatalog.targets,...visualTargets]);
const expandButton=ref(),collapseButton=ref();
const input=ref(),answerScroll=ref(),composing=ref(false),followBottom=ref(true),unread=ref(false);
function scrollBottom(force=false) {
  nextTick(()=>{
    if(force || followBottom.value) {
      const el=answerScroll.value;if(el)el.scrollTop=el.scrollHeight;
      followBottom.value=true;unread.value=false;
    } else unread.value=true;
  });
}
const {state,active,blocked,currentPending,unresolved,canSend,submit,restore,loadOlder,newConversation,switchMode,openItem,markRead}=useChatSession(body,scrollBottom);
const arrived=computed(()=>active.value?.unread===true);
const flightTurn=computed(()=>state.turns.at(-1));
watch(()=>[state.expanded,state.activeKey],()=>{if(state.expanded)markRead();});
const entries=computed(()=>[...state.entries].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));
const globalEntries=computed(()=>entries.value.filter(entry=>entry.mode!=="item"));
const hasItemHistory=computed(()=>entries.value.some(entry=>entry.mode==="item" && entry.itemId===body.value.id));
const itemGroups=computed(()=>{
  const groups=new Map();
  for(const entry of entries.value.filter(entry=>entry.mode==="item")) {
    if(!groups.has(entry.itemId))groups.set(entry.itemId,{id:entry.itemId,name:targetLabels.get(entry.itemId) || entry.itemId,entries:[]});
    groups.get(entry.itemId).entries.push(entry);
  }
  return [...groups.values()];
});
async function selectHistory(entry){
  if(entry.mode==="item"){
    const target=targetCatalog.targets.find(target=>target.id===entry.itemId);
    if(target)navigate(target.frontend_name);
  }
  await restore(entry);
}
function onScroll() {
  const el=answerScroll.value;if(!el)return;
  followBottom.value=el.scrollHeight-el.clientHeight-el.scrollTop<50;
  if(followBottom.value)unread.value=false;
}
function togglePanel() {
  state.expanded=!state.expanded;
  if(state.expanded){scrollBottom(true);nextTick(()=>collapseButton.value?.focus());}
}
function collapsePanel() {
  state.expanded=false;
  nextTick(()=>expandButton.value?.focus());
}
function toggleHistory() {state.historyOpen=!state.historyOpen;state.expanded=true;}
function startNew() {newConversation();followBottom.value=true;unread.value=false;nextTick(()=>input.value?.focus());}
async function older() {
  const el=answerScroll.value,height=el?.scrollHeight || 0,top=el?.scrollTop || 0;
  followBottom.value=false;await loadOlder();await nextTick();
  if(el)el.scrollTop=top+el.scrollHeight-height;
}
function navigate(name) {
  const target=registry.get(name);if(!target)return;
  revealBody(name);
  focusBody(name);
}
async function selectItem(itemId) {
  const target=targetCatalog.targets.find(target=>target.id===itemId);
  if(!target || !registry.has(target.frontend_name))return;
  // Scope activation owns the saved draft/history; camera movement must not
  // create a turn or copy the discovery conversation into the item's history.
  navigate(target.frontend_name);
  await openItem(itemId);
  followBottom.value=true;unread.value=false;
  nextTick(()=>input.value?.focus());
}
function askAgain(question) {state.draft=question;input.value?.focus();}
function enter(event) {
  event.preventDefault();
  if(event.isComposing || event.keyCode===229 || composing.value)return;
  submit();
}
function dateLabel(value) {
  const date=new Date(value);return Number.isNaN(date.getTime())?"":date.toLocaleString("ko-KR",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
}
watch(()=>store.userSettings.focusedBody,()=>{composing.value=false;});
</script>
<template>
  <section class="chat-dock" aria-label="천체 질문" @pointerdown.stop @click.stop @wheel.stop>
    <div class="chat-stack">
      <article id="atlas-conversation-panel" v-show="state.expanded" class="chat-answer" :class="{'chat-flight-active':currentPending}" aria-label="태양계 대화">
        <RocketLoading :key="flightTurn?.key || 'idle'" :state="flightTurn?.state" :panel-open="state.expanded" :message="flightTurn?.progress" />
        <header class="chat-answer-header">
          <div class="chat-title-group">
            <h2>Atlas · 아틀라스</h2>
            <button ref="collapseButton" type="button" class="chat-panel-toggle" aria-label="대화 접기" aria-expanded="true" aria-controls="atlas-conversation-panel" @click="collapsePanel">
              <span class="chat-toggle-emoji" aria-hidden="true">🔽</span><span>대화 접기</span>
            </button>
            <span v-if="currentPending" class="chat-header-status">답변 준비 중</span>
          </div>
          <div class="chat-actions">
            <button type="button" :aria-expanded="state.historyOpen" aria-controls="chat-history" @click="toggleHistory">이전 대화</button>
            <button type="button" :disabled="blocked" @click="startNew">새 대화</button>
          </div>
        </header>
        <ChatScopeToggle :name="body.name" :checked="state.mode==='item'" :has-history="hasItemHistory" :disabled="!body.id" @change="switchMode" />
        <div v-if="state.historyOpen" id="chat-history" class="chat-history">
          <p class="chat-history-caption">이 브라우저에서 시작한 대화</p>
          <p v-if="!entries.length" class="chat-empty">아직 저장된 대화가 없어요.</p>
          <details v-if="globalEntries.length" class="chat-history-group" open>
            <summary>통합 대화 <span>{{ globalEntries.length }}개</span><span v-if="globalEntries.some(entry=>entry.unread)" class="chat-history-arrival">답변 도착</span></summary>
            <button v-for="entry in globalEntries" :key="entry.key" type="button" class="chat-history-entry"
              :class="{selected:active?.key===entry.key}" :disabled="state.restoring || state.olderLoading" @click="selectHistory(entry)">
              <span>{{ entry.title }}<small v-if="entry.unread" class="chat-history-arrival"> · 답변 도착</small></span><time>{{ dateLabel(entry.updatedAt) }}</time>
            </button>
          </details>
          <p v-if="itemGroups.length" class="chat-history-caption chat-history-section">천체별 대화</p>
          <details v-for="group in itemGroups" :key="group.id" class="chat-history-group" :open="state.mode==='item' && state.scopeItem===group.id">
            <summary>{{ group.name }} <span>{{ group.entries.length }}개</span><span v-if="group.entries.some(entry=>entry.unread)" class="chat-history-arrival">답변 도착</span></summary>
            <button v-for="entry in group.entries" :key="entry.key" type="button" class="chat-history-entry"
              :class="{selected:active?.key===entry.key}" :disabled="state.restoring || state.olderLoading" @click="selectHistory(entry)">
              <span>{{ entry.title }}<small v-if="entry.unread" class="chat-history-arrival"> · 답변 도착</small></span><time>{{ dateLabel(entry.updatedAt) }}</time>
            </button>
          </details>
        </div>
        <div v-if="state.restoring" class="chat-notice" role="status">이전 대화를 불러오고 있어요…</div>
        <p v-if="state.historyError" class="chat-notice chat-notice-error" role="alert">{{ state.historyError }}</p>
        <p v-if="state.storageError" class="chat-notice chat-notice-error" role="alert">{{ state.storageError }}</p>
        <div ref="answerScroll" class="chat-answer-scroll" role="log" aria-label="질문과 답변 기록" aria-live="polite" aria-relevant="additions" @scroll="onScroll">
          <button v-if="state.hasOlder" type="button" class="chat-older" :disabled="blocked" @click="older">{{ state.olderLoading ? "불러오는 중…" : "이전 메시지 더 보기" }}</button>
          <p v-if="!state.turns.length && !state.restoring" class="chat-empty">안녕하세요, 함께 태양계를 탐험할 AI 비서 아틀라스예요.<br />어떤 천체가 궁금한가요?</p>
          <ChatTurn v-for="(row,index) in state.turns" :key="row.key" :row="row" :last="index===state.turns.length-1"
            :busy="blocked" :missing="state.missing" :find-mentions="findMentions" :observation="row.observation || targetLabels.get(row.itemId) || ''"
            @navigate="navigate" @select-item="selectItem" @retry="submit" @ask-again="askAgain" />
        </div>
        <button v-if="unread && state.expanded" type="button" class="chat-new-response" @click="scrollBottom(true)">최근 메시지로 이동 ↓</button>
      </article>
      <form class="chat-search" aria-label="질문 입력" @submit.prevent="!composing && submit()">
        <div v-if="!state.expanded" class="chat-compact-actions">
          <button ref="expandButton" type="button" class="chat-panel-toggle" :class="{'chat-arrived':arrived}" :aria-label="currentPending ? '답변 준비 중 · 대화 펼치기' : arrived ? '답변 도착 · 대화 펼치기' : '대화 펼치기'" aria-expanded="false" aria-controls="atlas-conversation-panel" @click="togglePanel">
            <span class="chat-toggle-emoji" aria-hidden="true">🔼</span><span>대화 펼치기</span><span v-if="arrived" class="chat-toggle-arrival" aria-hidden="true">✦</span>
          </button>
          <button type="button" @click="toggleHistory">이전 대화</button>
          <button type="button" :disabled="blocked" @click="startNew">새 대화</button>
        </div>
        <ChatScopeToggle v-if="!state.expanded" :name="body.name" :checked="state.mode==='item'" :has-history="hasItemHistory" :disabled="!body.id" @change="switchMode" />
        <div class="chat-input-row">
          <span class="chat-body-badge">{{ body.name }}</span>
          <label class="chat-sr-only" for="celestial-question">선택한 천체에 질문하기</label>
          <input id="celestial-question" ref="input" v-model="state.draft" type="text" name="question" maxlength="2000" autocomplete="off"
            placeholder="아틀라스에게 물어보세요" aria-describedby="chat-input-hint"
            @compositionstart="composing=true" @compositionend="composing=false" @keydown.enter="enter" />
          <button class="chat-send" type="submit" :disabled="!canSend || composing" aria-label="질문 보내기" title="질문 보내기">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
        <p v-if="state.pending && !currentPending" class="chat-input-hint">다른 대화의 답변을 준비하고 있어요. 완료되면 질문을 보낼 수 있어요.</p>
        <p id="chat-input-hint" class="chat-input-hint" :class="{'chat-sr-only':!unresolved && !state.missing}">{{ state.missing ? "새 대화를 시작해주세요." : unresolved ? "이전 질문의 답변 상태를 확인하거나 새 대화를 시작해주세요." : "현재 관찰 대상과 대화 맥락을 함께 참고합니다." }}</p>
      </form>
    </div>
  </section>
</template>
<style scoped>
.chat-dock {position:fixed;left:24px;right:24px;bottom:max(20px,env(safe-area-inset-bottom));z-index:20;display:flex;justify-content:center;pointer-events:none;}
.chat-stack {width:100%;max-width:760px;display:flex;flex-direction:column;gap:10px;pointer-events:auto;color:#e9e9ed;}
.chat-search,.chat-answer {background:#181a20ef;border:1px solid #ffffff21;border-radius:16px;box-shadow:0 12px 44px #0006;backdrop-filter:blur(18px);}
.chat-answer {position:relative;isolation:isolate;overflow:hidden;display:flex;flex-direction:column;max-height:calc(100dvh - 180px);}
.chat-flight-active .chat-answer-scroll,.chat-answer:has(.atlas-flight-layer) .chat-answer-scroll {min-height:230px;padding-bottom:36px;}
.chat-answer-header,.chat-answer-scroll,.chat-history,.chat-notice,.chat-new-response {position:relative;z-index:1;}
.chat-answer-header {flex-shrink:0;display:flex;justify-content:space-between;align-items:center;gap:8px;min-height:48px;padding:9px 14px;border-bottom:1px solid #ffffff10;}
.chat-answer-header h2 {font-size:12px;font-weight:500;color:#d3cfcc;}
.chat-answer-header h2>span:first-child {color:#ffa45e;}
.chat-header-status {font-size:10px;color:#a7a6ad;}
.chat-actions,.chat-compact-actions {display:flex;align-items:center;gap:6px;}
.chat-actions button,.chat-compact-actions button {border:0;border-radius:6px;background:transparent;color:#a7aab7;padding:5px 7px;font-size:11px;white-space:nowrap;}
.chat-actions button:hover,.chat-compact-actions button:hover {background:#ffffff09;color:#ffbd88;}
.chat-actions button:disabled,.chat-compact-actions button:disabled {opacity:.35;cursor:default;}
 .chat-title-group { display:flex;align-items:center;gap:9px;min-width:0; }
.chat-title-group h2 { white-space:nowrap; }
.chat-actions { flex-shrink:0; }
.chat-title-group .chat-panel-toggle,.chat-compact-actions .chat-panel-toggle { display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:30px;padding:4px 8px;border:1px solid #fd7e1438;border-radius:8px;background:#fd7e140a;color:#d9c4b2;font-size:11px;white-space:nowrap;transition:background 150ms,border-color 150ms,transform 150ms; }
.chat-title-group .chat-panel-toggle:hover,.chat-compact-actions .chat-panel-toggle:hover { background:#fd7e141c;border-color:#fd7e1470;color:#ffcca3; }
.chat-panel-toggle:active { transform:scale(.97); }
.chat-panel-toggle:focus-visible { outline:2px solid #fd7e14;outline-offset:2px; }
.chat-toggle-emoji { font-size:12px;line-height:1; }
.chat-toggle-arrival { color:#ffc38f; }
@media(max-width:700px) { .chat-title-group {gap:5px;}.chat-title-group h2 {font-size:10px;}.chat-title-group .chat-panel-toggle,.chat-compact-actions .chat-panel-toggle {padding:4px 5px;gap:3px;font-size:10px;} }
@media(prefers-reduced-motion:reduce) { .chat-panel-toggle {transition:none!important;}.chat-panel-toggle:active{transform:none;} }
.chat-answer-scroll {min-height:50px;max-height:min(48dvh,440px);overflow-y:auto;padding:16px 18px;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#555a6a transparent;}
.chat-history {max-height:160px;overflow-y:auto;padding:12px;border-bottom:1px solid #ffffff10;overscroll-behavior:contain;}
.chat-history-caption {font-size:10px;color:#89919f;margin:0 0 8px;}
.chat-history-section {margin-top:12px;}
.chat-history-group {margin-bottom:5px;}
.chat-history-group>summary {cursor:pointer;padding:6px 3px;color:#bbc1cc;font-size:11px;}
.chat-history-group>summary>span {margin-left:7px;font-size:10px;color:#8b94a5;}
.chat-history-group .chat-history-arrival {color:#ffc38f;font-size:9px;}
.chat-history-entry {display:flex;align-items:center;justify-content:space-between;gap:16px;text-align:left;width:100%;padding:9px;border:1px solid transparent;border-radius:7px;color:#c9cbd4;background:transparent;font-size:12px;}
.chat-history-entry>span {white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.chat-history-entry time {font-size:10px;color:#7f8795;flex-shrink:0;}
.chat-history-entry:hover,.chat-history-entry.selected {border-color:#fd7e1430;background:#fd7e140b;}
.chat-history-entry:disabled {opacity:.5;cursor:default;}
.chat-empty {color:#8c94a3;font-size:12px;line-height:1.8;padding:8px 0;}
.chat-notice {padding:10px 16px;font-size:12px;color:#aeb5c1;}
.chat-notice-error {color:#eac1ac;}
.chat-older {display:block;margin:0 auto 20px;border:1px solid #ffffff1a;border-radius:8px;padding:6px 12px;background:transparent;color:#aeb4c2;font-size:11px;}
.chat-new-response {display:block;margin:0 auto 12px;border:1px solid #fd7e1444;border-radius:18px;padding:5px 12px;background:#27232a;color:#ffc38f;font-size:11px;}
.chat-search {padding:10px 10px 8px 14px;}
.chat-compact-actions {justify-content:flex-end;margin:-3px 0 4px;}
.chat-compact-actions button:first-child {margin-right:auto;}
.chat-compact-actions button:first-child {display:flex;align-items:center;gap:4px;}
.chat-compact-actions button.chat-arrived {color:#ffc38f;}
.chat-input-row {display:flex;align-items:center;gap:12px;min-width:0;}
.chat-body-badge {flex-shrink:0;max-width:36%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:500;color:#ffc38f;background:#fd7e141a;padding:5px 9px;border-radius:7px;}
.chat-input-row input {flex:1;min-width:0;width:100%;border:0;background:none;padding:10px 0;color:#f4f4f5;font-size:14px;outline-offset:3px;}
.chat-input-row input::placeholder {color:#989aa8;}
.chat-send {flex-shrink:0;width:38px;height:38px;display:grid;place-items:center;border:0;border-radius:11px;background:#fd7e14;color:#1a1008;}
.chat-send svg {width:21px;height:21px;}
.chat-send:hover:enabled {background:#ff9c4b;}
.chat-send:disabled {background:#ffffff12;color:#777b88;}
.chat-input-hint {font-size:11px;color:#b2a591;padding:5px 0 0;}
.chat-sr-only {position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;}
@media(max-width:920px) {.chat-dock{left:76px;}}
@media(max-width:700px) {.chat-dock{left:64px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));}.chat-search{padding-left:10px;}.chat-input-row{gap:7px;}.chat-input-row input{font-size:16px;}.chat-body-badge{font-size:11px;padding:5px 6px;}.chat-answer-scroll{max-height:38dvh;padding:13px;}.chat-answer-header{padding:8px;}.chat-actions{gap:0;}.chat-actions button{font-size:10px;padding:5px;}.chat-header-status{display:none;}.chat-history-entry{gap:6px;}.chat-history-entry time{display:none;}}
</style>
