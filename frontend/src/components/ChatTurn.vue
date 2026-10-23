<script setup>
import { computed, nextTick, ref } from "vue";
const props=defineProps({row:{type:Object,required:true},last:Boolean,busy:Boolean,missing:Boolean,
  findMentions:{type:Function,required:true},observation:{type:String,default:""}});
defineEmits(["navigate","retry","ask-again","select-item"]);
function travelLabel(label) {
  const code=label.charCodeAt(label.length-1)-0xac00;
  const final=code>=0 && code<=11171 ? code%28 : 0;
  return `${label}${final && final!==8 ? "으로" : "로"} 이동 ↗`;
}
const sourcesPanel = ref(null);
const evidenceElements = new Map();
function registerEvidence(number, element) {
  if (element) evidenceElements.set(number, element);
  else evidenceElements.delete(number);
}
async function showEvidence(number) {
  if (!sourcesPanel.value) return;
  sourcesPanel.value.open = true;
  await nextTick();
  const element = evidenceElements.get(number);
  element?.focus({ preventScroll: true });
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  element?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
}
const questionBodies=computed(()=>props.findMentions(props.row.question));
const answerBodies=computed(()=>props.findMentions(props.row.answer?.answer));
</script>
<template>
  <article class="chat-turn">
    <div class="chat-message chat-message-user">
      <div class="chat-message-label">나<span v-if="observation"></span></div>
      <p class="chat-message-text">{{ row.question }}</p>
      <div v-if="questionBodies.length" class="chat-body-links" aria-label="질문에서 언급한 천체">
        <button v-for="body in questionBodies" :key="body.name" type="button" @click="$emit('navigate',body.name)">{{ travelLabel(body.label) }}</button>
      </div>
    </div>
    <div class="chat-message chat-message-assistant">
      <div class="chat-message-label">✦ Atlas · 아틀라스</div>
      <p v-for="(interim,index) in row.interims || []" :key="interim.kind || index" class="chat-message-text chat-interim-text">{{ interim.message }}</p>
      <div v-if="row.state==='completed' && row.answer" class="chat-final-answer">
        <p class="chat-message-text"><template v-if="row.answer.parts"><template v-for="(part,index) in row.answer.parts" :key="index">{{ part.text }}<button v-for="citation in part.citations" :key="citation.evidenceId" type="button" class="chat-citation" :aria-label="`근거 ${citation.number} 보기`" @click.stop="showEvidence(citation.number)">[{{ citation.number }}]</button></template></template><template v-else>{{ row.answer.answer }}</template></p>
        <div v-if="row.answer.cards?.length" class="chat-discovery-cards" aria-label="조건에 맞는 천체">
          <article v-for="card in row.answer.cards" :key="card.itemId" class="chat-discovery-card" @click.stop="$emit('select-item',card.itemId)">
            <button type="button" class="chat-discovery-select" :aria-label="`${card.name} 전용 대화로 이동`" @click.stop="$emit('select-item',card.itemId)">
              <strong>{{ card.name }}</strong><span>전용 대화로 이동 ↗</span>
            </button>
            <p>{{ card.reason }}<button v-for="citation in card.citations" :key="citation.evidenceId" type="button" class="chat-citation" :aria-label="`근거 ${citation.number} 보기`" @click.stop="showEvidence(citation.number)">[{{ citation.number }}]</button></p>
          </article>
        </div>
        <div v-if="answerBodies.length" class="chat-body-links" aria-label="답변에서 언급한 천체">
          <button v-for="body in answerBodies" :key="body.name" type="button" @click="$emit('navigate',body.name)">{{ travelLabel(body.label) }}</button>
        </div>
        <p v-for="(warning,index) in row.answer.warnings" :key="index" class="chat-warning">{{ warning }}</p>
        <p v-if="row.answer.noSources" class="chat-warning">이 답변에 연결된 출처는 없어요.</p>
        <details v-if="row.answer.documents.length" ref="sourcesPanel" class="chat-sources">
          <summary>출처 {{ row.answer.documents.length }}개 · 인용 근거 {{ row.answer.evidenceCount }}개</summary>
          <div v-for="document in row.answer.documents" :key="document.key" class="chat-source-excerpt">
            <a :href="document.url" target="_blank" rel="noopener noreferrer">{{ document.title }} ↗</a>
            <p v-if="document.sections.length">{{ document.sections.join(", ") }}</p>
            <p v-if="document.translated">영문 위키백과 · 한국어 기계 번역 근거</p>
            <template v-if="document.evidence?.length">
              <div v-for="evidence in document.evidence" :key="evidence.number" :ref="element => registerEvidence(evidence.number,element)" tabindex="-1" class="chat-numbered-evidence" :aria-label="`근거 ${evidence.number}`">
                <p><strong>[{{ evidence.number }}]</strong> {{ evidence.section }}<span v-if="evidence.kind==='metadata'"> · 천체 메타데이터</span></p>
                <blockquote v-if="evidence.quote">{{ evidence.quote }}</blockquote>
              </div>
            </template>
            <template v-else><blockquote v-for="quote in document.quotes" :key="quote">{{ quote }}</blockquote></template>
            <details v-if="document.originalPassages.length">
              <summary>대응 영어 원문 문단 보기</summary>
              <blockquote v-for="original in document.originalPassages" :key="original">{{ original }}</blockquote>
            </details>
          </div>
        </details>
      </div>
      <div v-else-if="row.state!=='pending'" class="chat-error">
        <p>{{ row.error || "답변을 완료하지 못했어요." }}</p>
        <button v-if="last && !missing" type="button" :disabled="busy" @click="$emit('retry',row)">{{ row.retrySame ? "답변 상태 확인" : "다시 시도" }}</button>
        <button v-else-if="!missing" type="button" :disabled="busy" @click="$emit('ask-again',row.question)">입력창에서 다시 질문</button>
      </div>
    </div>
  </article>
</template>
<style scoped>
.chat-turn { display:grid;gap:12px;margin:0 0 24px; }
.chat-turn:last-child { margin-bottom:0; }
.chat-message { max-width:94%;min-width:0; }
.chat-message-user { justify-self:end;background:#fd7e1415;border:1px solid #fd7e1429;border-radius:14px 14px 3px 14px;padding:12px 15px; }
.chat-message-assistant { justify-self:start;padding:3px 2px; }
.chat-message-label { display:flex;flex-wrap:wrap;gap:7px;font-size:11px;color:#d3b99d;margin-bottom:7px; }
.chat-message-label span { color:#8c919f;font-size:10px; }
.chat-message-assistant .chat-message-label { color:#e0c8b0; }
.chat-message-text { font-size:14px;line-height:1.85;white-space:pre-wrap;overflow-wrap:anywhere; }
.chat-discovery-cards { display:grid;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:9px;margin-top:14px; }
.chat-discovery-card { border:1px solid #fd7e1430;border-radius:11px;background:#fd7e1408;padding:11px 12px;min-width:0;cursor:pointer; }
.chat-discovery-select { width:100%;display:flex;justify-content:space-between;align-items:center;gap:12px;border:0;background:transparent;color:#ffc38f;text-align:left;padding:0;cursor:pointer; }
.chat-discovery-select strong { font-size:13px;font-weight:500; }
.chat-discovery-select span { font-size:10px;color:#a8a9b3; }
.chat-discovery-select:hover span { color:#ffc38f; }
.chat-discovery-select:focus-visible { outline:2px solid #fd7e14;outline-offset:4px;border-radius:3px; }
.chat-discovery-card>p { font-size:12px;line-height:1.7;color:#c3c6d1;margin-top:7px;overflow-wrap:anywhere; }
.chat-citation { display:inline;padding:0 2px;margin-left:3px;border:0;border-radius:3px;background:transparent;color:#ffc38f;font:inherit;font-size:.85em;cursor:pointer; }
.chat-citation:hover { background:#fd7e1425; }
.chat-citation:focus-visible,.chat-numbered-evidence:focus { outline:2px solid #fd7e14;outline-offset:3px; }
.chat-numbered-evidence { margin-top:10px;border-radius:4px;scroll-margin:12px; }
.chat-numbered-evidence strong { color:#ffc38f; }
.chat-interim-text { margin-bottom:12px; }
.chat-body-links { display:flex;flex-wrap:wrap;gap:6px;margin-top:11px; }
.chat-body-links button,.chat-error button { border:1px solid #fd7e1440;border-radius:7px;padding:5px 9px;background:#fd7e140c;color:#ffc38f;font-size:11px; }
.chat-body-links button:hover { background:#fd7e1425; }
.chat-body-links button:focus-visible,.chat-error button:focus-visible { outline:2px solid #fd7e14;outline-offset:2px; }
.chat-final-answer { animation:atlas-answer-in .2s ease-out; }
.chat-error { font-size:13px;color:#edbcae;line-height:1.7; }
.chat-error button { margin-top:10px; }
.chat-error button:disabled { opacity:.4;cursor:default; }
.chat-warning { font-size:12px;color:#cfbb9f;margin-top:9px; }
.chat-sources { margin-top:13px;padding-top:10px;border-top:1px solid #ffffff10;font-size:11px;color:#969daa; }
.chat-sources summary { cursor:pointer;width:fit-content; }
.chat-source-excerpt { margin-top:12px;overflow-wrap:anywhere; }
.chat-source-excerpt a { color:#ffc38f; }
.chat-source-excerpt blockquote { margin:7px 0;padding-left:10px;border-left:2px solid #fd7e1444;white-space:pre-wrap; }
@keyframes atlas-answer-in { from {opacity:0;transform:translateY(3px)} to {opacity:1;transform:none} }
@media(prefers-reduced-motion:reduce) { .chat-final-answer { animation:none; } }
</style>
