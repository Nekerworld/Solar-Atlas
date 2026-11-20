<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { openObservation, showGroundPlan, showSolar, store } from "../data/store";
import { createConversation, deleteLog, deletePlan, getPlan, listLogSessions, listPlans, loadEvents, loadLog, savePlan, sendMessage, updatePlan } from "../planner/api";
import PlaceMap from "../components/PlaceMap.vue";
import VisibilitySchedule from "../components/VisibilitySchedule.vue";
import { failureNotices, progressSteps, sourceRows, toolHistory } from "../planner/presentation";

import { TARGET_NAMES_KO, VISIBILITY_RULES } from "../utils/visibility";

const EXAMPLES = [
  "목성은 얼마나 큰 행성이야?",
  "이번 토요일 20시에 서울숲에서 목성을 1시간 보고 싶어.",
  "오늘 21시에 남산에서 목성을 1시간 봐 줘.",
  "오늘 밤 집 앞에서 목성을 보고 싶어. 고도 80도 이상, 구름 0%, 이동 10분 이내.",
  "이번 토요일 서울숲에서 목성 관측 계획 짜 줘.",
  "이 플래너 어떻게 써?",
];
const GROUPS = [
  ["target_id", "date_start", "date_end", "preferred_time_start", "preferred_time_end"],
  ["search_region", "place_query"],
  ["max_travel_minutes", "min_altitude_deg", "max_cloud_cover_pct", "max_precipitation_probability_pct", "origin_name", "transport_mode"],
];
const LABELS = {
  baseline: "기준", preference: "선호", constraint: "제약",
  target_id: "천체", date_start: "날짜", date_end: "종료 날짜", preferred_time_start: "시작", preferred_time_end: "종료",
  search_region: "지역", place_query: "장소 유형", max_travel_minutes: "이동시간", min_altitude_deg: "최저 고도",
  max_cloud_cover_pct: "구름", max_precipitation_probability_pct: "강수확률", origin_name: "출발지", transport_mode: "이동 수단",
};
const draft = ref("");
const conversationId = ref("");
const messages = ref([]);
const result = ref(null);
const events = ref([]);
const plans = ref([]);
const sessions = ref([]);
const activeLog = ref([]);
const error = ref("");
const busy = ref(false);
const tab = computed({
  get: () => store.planner.tab,
  set: (value) => { store.planner.tab = value; },
});
const editId = ref("");
const editPlace = ref("");
const detail = ref(null);
const manual = ref({ place_name: "서울숲", start_at: "2026-11-21T20:00", end_at: "2026-11-21T21:00" });

const constraints = computed(() => result.value?.constraints || { baseline: {}, preference: {}, constraint: {}, empty: GROUPS.flat() });
const replans = computed(() => events.value.filter((item) => item.type === "replan_started"));
const emptyNames = computed(() => constraints.value.empty || []);
const steps = computed(() => progressSteps(events.value));
const tools = computed(() => toolHistory(events.value));
const notices = computed(() => failureNotices(result.value?.tool_summaries || []));
const sources = computed(() => sourceRows(result.value?.sources || []));
const candidates = computed(() => result.value?.candidates || []);
// 답변 아래 구분선 밑에 같은 폭으로 나란히 놓는 접이식 기록. 근거 문서는 있을 때만 나온다.
const openDrops = ref({});
const drops = computed(() => [
  { key: "steps", label: "진행", count: steps.value.length },
  { key: "tools", label: "Tool 호출 이력", count: tools.value.length },
  { key: "replans", label: "재계획", count: replans.value.length },
  ...(sources.value.length ? [{ key: "sources", label: "근거 문서", count: sources.value.length }] : []),
  { key: "candidates", label: "후보", count: candidates.value.length },
]);
const STATE_TEXT = { ok: "성공", failed: "실패", running: "진행 중", reused: "이전 결과 재사용" };

// 입력창이 비어 있는 동안 예시 질문이 일정 간격으로 부드럽게 바뀌는 플레이스홀더.
const PLACEHOLDER_MS = 4500;
const placeholderIndex = ref(0);
let placeholderTimer;
const scroller = ref(null);

onMounted(() => {
  refreshPlans();
  if (tab.value === "logs") openLogs();
  placeholderTimer = setInterval(() => { placeholderIndex.value = (placeholderIndex.value + 1) % EXAMPLES.length; }, PLACEHOLDER_MS);
});
onBeforeUnmount(() => clearInterval(placeholderTimer));
// 새 메시지·진행 표시가 생기면 대화 끝으로 내린다.
watch(() => [messages.value.length, busy.value, events.value.length], async () => {
  await nextTick();
  if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight;
});

async function refreshPlans() {
  try {
    plans.value = (await listPlans()).items || [];
  } catch (cause) {
    error.value = cause.message;
  }
}

async function openDetail(id) {
  error.value = "";
  if (detail.value?.id === id) {
    detail.value = null;
    return;
  }
  const listed = plans.value.find((plan) => plan.id === id) || null;
  try {
    detail.value = await getPlan(id);
  } catch (cause) {
    // 실행 중인 서버가 상세 경로를 모르는 옛 버전이어도, 이미 받아 둔 목록 항목(같은 PlanOut)으로 같은 정보를 보여 준다.
    detail.value = listed;
    if (!listed) error.value = cause.message;
  }
}

async function ask() {
  // 입력이 비어 있으면 지금 보이는 예시 질문(플레이스홀더)을 그대로 보낸다.
  await send(draft.value.trim() || EXAMPLES[placeholderIndex.value]);
}

// from이 있으면 그 번째 메시지부터 화면의 대화를 지우고 새로 보낸다(수정·다시 생성). 서버 대화는 이어서 쌓인다.
async function send(text, from = null) {
  if (!text || busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    if (!conversationId.value) conversationId.value = (await createConversation()).id;
    if (from !== null) messages.value.splice(from);
    messages.value.push({ role: "user", content: text });
    const response = await sendMessage(conversationId.value, text, store.planner.selectedTargetId);
    result.value = response;
    messages.value.push({ role: "assistant", content: response.message });
    events.value = (await loadEvents(conversationId.value)).events || [];
    if (from === null) draft.value = "";
  } catch (cause) {
    error.value = cause.message;
    events.value = conversationId.value ? ((await loadEvents(conversationId.value).catch(() => ({ events: [] }))).events || []) : events.value;
  } finally {
    busy.value = false;
  }
}

// 메시지 아래 단추: 복사(모두), 수정(내 메시지), 다시 생성(마지막 답변).
const copiedIndex = ref(-1);
let copiedTimer;
async function copyMessage(index) {
  const text = messages.value[index]?.content || "";
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // 클립보드 권한이 없을 때(비보안 주소 등)는 선택 복사로 대신한다.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(area);
    area.select();
    try { document.execCommand("copy"); } finally { area.remove(); }
  }
  copiedIndex.value = index;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => { copiedIndex.value = -1; }, 1500);
}
onBeforeUnmount(() => clearTimeout(copiedTimer));

const editingIndex = ref(-1);
const editDraft = ref("");
function startEdit(index) {
  if (busy.value) return;
  editingIndex.value = index;
  editDraft.value = messages.value[index].content;
}
function cancelEdit() {
  editingIndex.value = -1;
}
async function submitEdit() {
  const text = editDraft.value.trim();
  const index = editingIndex.value;
  if (!text || index < 0 || busy.value) return;
  editingIndex.value = -1;
  await send(text, index);
}
function onEditKeydown(event) {
  if (event.key === "Escape") {
    cancelEdit();
    return;
  }
  if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  submitEdit();
}
// 마지막 답변만 다시 만든다: 바로 앞의 내 메시지를 그대로 다시 보낸다.
const lastAnswer = computed(() => {
  const last = messages.value.length - 1;
  return last > 0 && messages.value[last].role === "assistant" ? last : -1;
});
function regenerate() {
  const index = lastAnswer.value;
  if (index < 1 || busy.value) return;
  send(messages.value[index - 1].content, index - 1);
}

// Enter는 보내기, Shift+Enter는 줄바꿈. 한글 조합 중의 Enter(조합 확정)는 보내지 않는다.
function onComposerKeydown(event) {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  ask();
}

async function keep(plan) {
  error.value = "";
  const saved = await savePlan({
    target_id: plan.target_id || store.planner.selectedTargetId || "jupiter",
    place_name: plan.name,
    place_id: plan.candidate_id,
    latitude: plan.latitude,
    longitude: plan.longitude,
    start_at: plan.observation_start,
    end_at: plan.observation_end,
    status: plan.status,
    summary: result.value?.message || "",
  });
  if (saved.warnings?.length) error.value = "겹치는 계획이 있어 경고만 남기고 저장했습니다.";
  await refreshPlans();
  tab.value = "plans";
}

async function rename(plan) {
  await updatePlan(plan.id, {
    target_id: plan.target_id,
    place_name: editPlace.value || plan.place_name,
    place_id: plan.place_id,
    latitude: plan.latitude,
    longitude: plan.longitude,
    start_at: plan.start_at,
    end_at: plan.end_at,
    status: plan.status,
  });
  editId.value = "";
  await refreshPlans();
}

async function addManual() {
  error.value = "";
  const saved = await savePlan({
    target_id: store.planner.selectedTargetId || "jupiter",
    place_name: manual.value.place_name,
    start_at: new Date(manual.value.start_at).toISOString(),
    end_at: new Date(manual.value.end_at).toISOString(),
    status: "UNVERIFIED",
  });
  if (saved.warnings?.length) error.value = "같은 시각과 겹칩니다. 경고만 남기고 저장했습니다.";
  await refreshPlans();
}

async function removePlan(id) {
  await deletePlan(id);
  await refreshPlans();
}

async function openLogs() {
  tab.value = "logs";
  sessions.value = (await listLogSessions()).sessions || [];
}

async function openSession(id) {
  activeLog.value = (await loadLog(id)).events || [];
}

function valueOf(group, name) {
  return constraints.value[group]?.[name] ?? "";
}

// 천구·태양계 상단과 같은 채워진 흰색 아이콘.
const ICONS = {
  solar: [
    "M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z",
    "M10.5 0h3v5h-3Zm0 19h3v5h-3ZM0 10.5h5v3H0Zm19 0h5v3h-5ZM2.5 4.6l2.1-2.1L8 5.9 5.9 8Zm13.5 13.5 2.1-2.1 3.4 3.4-2.1 2.1ZM2.5 19.4l3.4-3.4L8 18.1l-3.4 3.4ZM16 5.9l3.4-3.4 2.1 2.1L18.1 8Z",
  ],
  ground: [
    "M12 1.5c3.4 2.2 5.2 5.6 5.2 9.6 0 1.6-.3 3.1-.8 4.5H7.6c-.5-1.4-.8-2.9-.8-4.5 0-4 1.8-7.4 5.2-9.6Zm0 5.2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z",
    "M6.6 14.6 3.5 17.7c-.3.3-.4.7-.2 1.1l1 2.2 3-1.6c-.6-1.1-.9-2.4-.9-3.8l0-.9ZM17.4 14.6l3.1 3.1c.3.3.4.7.2 1.1l-1 2.2-3-1.6c.6-1.1.9-2.4.9-3.8l-.2-1ZM9.3 17.5h5.4L12 22.5l-2.7-5Z",
  ],
  planner: ["M7 2h2v2h6V2h2v2h2.5A1.5 1.5 0 0 1 21 5.5v15a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 20.5v-15A1.5 1.5 0 0 1 4.5 4H7V2ZM5 10v10h14V10H5Zm2 2h4v4H7v-4Z"],
};
const GROUP_KEYS = ["baseline", "preference", "constraint"];
const GROUP_TITLES = ["기준", "선호", "제약"];
// 요청 분석에서 값이 채워진 칸만 모은다(F3005: 기준·선호·제약과 빈 칸을 화면에 보인다).
const analysis = computed(() => GROUPS.map((names, index) => ({
  title: GROUP_TITLES[index],
  filled: names.map((name) => ({ name, value: valueOf(GROUP_KEYS[index], name) })).filter((entry) => entry.value !== ""),
})));

function sky(plan) {
  showGroundPlan({
    targetId: store.planner.selectedTargetId || "jupiter",
    targetName: plan.name,
    latitude: plan.latitude,
    longitude: plan.longitude,
    start: plan.observation_start || plan.start_at,
    end: plan.observation_end || plan.end_at,
    placeName: plan.name || plan.place_name,
    cloud: (plan.checks || []).find((item) => item.field === "cloud_cover")?.value,
    rain: (plan.checks || []).find((item) => item.field === "precipitation_probability")?.value,
  });
}

const scheduleTarget = computed(() => (VISIBILITY_RULES[store.planner.selectedTargetId] ? store.planner.selectedTargetId : ""));
// 천체를 고른 채 들어오면 대화 탭이 반으로 나뉘어 왼쪽은 대화, 오른쪽은 보이는 일정이 열린다.
const split = computed(() => Boolean(scheduleTarget.value));
// 계획 탭에서 상세를 열면 오른쪽에 그 장소의 구글 지도가 열린다(화면을 반으로 나눈다).
const mapOpen = computed(() => tab.value === "plans" && Boolean(detail.value));
const halved = computed(() => split.value || mapOpen.value);
const SEOUL_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
const SEOUL_CLOCK = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// 보이는 일정의 한 구간으로 계획 요청 문장을 채운다. 지역은 사용자가 이어서 말한다.
function draftFromWindow(window) {
  const name = TARGET_NAMES_KO[scheduleTarget.value];
  const hours = Math.min(2, Math.max(1, Math.round((window.end - window.start) / 3600000)));
  const startAt = window.ongoing ? window.peak : window.start;
  draft.value = `${SEOUL_DAY.format(startAt)} ${SEOUL_CLOCK.format(startAt)}에 집 앞에서 ${name}을 ${hours}시간 보고 싶어.`;
  tab.value = "chat";
}

function skyFromWindow({ window, location }) {
  showGroundPlan({
    targetId: scheduleTarget.value,
    targetName: TARGET_NAMES_KO[scheduleTarget.value],
    latitude: location.latitude,
    longitude: location.longitude,
    start: window.peak.toISOString(),
    end: window.end.toISOString(),
    placeName: location.isDefault ? "서울(기본값)" : "내 현재 위치",
  });
}
</script>

<template>
  <main class="planner" :class="{ 'is-chat': tab === 'chat' }">
    <header class="top">
      <nav class="modes" aria-label="화면 이동">
        <button type="button" class="mode" @click="showSolar">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path v-for="path in ICONS.solar" :key="path" :d="path" /></svg>
          <span>태양계</span>
        </button>
        <button type="button" class="mode" @click="openObservation('Earth')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path v-for="path in ICONS.ground" :key="path" :d="path" /></svg>
          <span>플라네타리움</span>
        </button>
        <h1 class="mode current" aria-current="page">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path v-for="path in ICONS.planner" :key="path" :d="path" fill-rule="evenodd" /></svg>
          <span>관측 플래너</span>
        </h1>
      </nav>
      <p v-if="store.planner.selectedTargetName" class="picked">선택 천체 {{ TARGET_NAMES_KO[store.planner.selectedTargetId] || store.planner.selectedTargetName }}</p>
      <nav class="pages" aria-label="플래너 구역">
        <button type="button" :aria-pressed="tab === 'chat'" :class="{ current: tab === 'chat' }" @click="tab = 'chat'">대화</button>
        <button type="button" :aria-pressed="tab === 'plans'" :class="{ current: tab === 'plans' }" @click="tab = 'plans'; refreshPlans()">계획</button>
        <button type="button" :aria-pressed="tab === 'logs'" :class="{ current: tab === 'logs' }" @click="openLogs">로그</button>
      </nav>
    </header>
    <p v-if="error" class="notice" role="alert">{{ error }}</p>
    <div class="body" :class="{ chatting: tab === 'chat', split: halved }">
    <section v-if="tab === 'chat'" class="chat">
      <div ref="scroller" class="chat-scroll">
      <div class="chat-inner">
      <div class="thread">
        <div v-for="(message, index) in messages" :key="index" class="msg" :class="message.role">
          <div v-if="editingIndex === index" class="edit">
            <textarea v-model="editDraft" rows="3" aria-label="메시지 수정" @keydown="onEditKeydown" />
            <p class="edit-actions">
              <button type="button" class="text" @click="cancelEdit">취소</button>
              <button type="button" class="send small" :disabled="!editDraft.trim()" @click="submitEdit">보내기</button>
            </p>
          </div>
          <template v-else>
            <article :class="message.role">{{ message.content }}</article>
            <p class="msg-actions">
              <button v-if="message.role === 'user'" type="button" class="icon" title="수정" aria-label="수정" :disabled="busy" @click="startEdit(index)">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25ZM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z" /></svg>
              </button>
              <button type="button" class="icon" :class="{ done: copiedIndex === index }" :title="copiedIndex === index ? '복사됨' : '복사'" :aria-label="copiedIndex === index ? '복사됨' : '복사'" @click="copyMessage(index)">
                <svg v-if="copiedIndex !== index" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H5a2 2 0 0 0-2 2v13h2V3h11V1Zm3 4H9a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H9V7h10v14Z" /></svg>
                <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z" /></svg>
              </button>
              <button v-if="index === lastAnswer" type="button" class="icon" title="다시 생성" aria-label="다시 생성" :disabled="busy" @click="regenerate">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35Z" /></svg>
              </button>
            </p>
          </template>
        </div>
      </div>
      <div v-if="messages.length || busy" class="turn">
        <div v-if="result" class="analysis" aria-label="요청 분석">
          <p v-for="group in analysis" :key="group.title">
            <span class="k">{{ group.title }}</span>
            <span v-if="!group.filled.length" class="none">없음</span>
            <span v-for="entry in group.filled" :key="entry.name" class="v">{{ LABELS[entry.name] }} {{ entry.value }}</span>
          </p>
          <p v-if="emptyNames.length" class="none">비어 있는 칸 {{ emptyNames.map((name) => LABELS[name] || name).join(", ") }}</p>
        </div>
        <div class="record">
          <p v-if="busy" role="status" class="status">처리 중입니다. 단계가 끝나는 대로 아래에 표시됩니다.</p>
          <p v-if="!events.length && !busy" class="quiet">아직 실행 기록이 없습니다. 응답이 끊겨도 저장된 로그를 다시 읽습니다.</p>
          <!-- 긴 기록은 접어 두고, 같은 폭의 단추 한 줄로 늘어놓는다. 눌러서 펼친다. -->
          <div class="drops" role="group" aria-label="실행 기록">
            <button
              v-for="drop in drops"
              :key="drop.key"
              type="button"
              class="drop"
              :class="{ open: openDrops[drop.key] }"
              :aria-expanded="Boolean(openDrops[drop.key])"
              :aria-controls="`drop-${drop.key}`"
              @click="openDrops[drop.key] = !openDrops[drop.key]"
            >
              <span class="drop-name">{{ drop.label }}</span>
              <span class="drop-count">{{ drop.count }}</span>
              <svg class="drop-caret" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4.2 6 8l4-3.8" /></svg>
            </button>
          </div>
          <p v-for="notice in notices" :key="`${notice.tool}-${notice.code}`" class="notice" role="alert">{{ notice.label }}: {{ notice.guide }}</p>
          <section v-if="openDrops.steps" id="drop-steps" class="drop-panel" aria-label="진행">
            <p v-if="!steps.length" class="quiet">아직 진행 기록이 없습니다.</p>
            <ol>
              <li v-for="step in steps" :key="step.sequence" :class="{ replan: step.replan, failed: step.failed }">
                {{ step.sequence }}. {{ step.stage }} {{ step.type }}<span v-if="step.replan"> · 재계획 지점</span>
              </li>
            </ol>
          </section>
          <section v-if="openDrops.tools" id="drop-tools" class="drop-panel" aria-label="Tool 호출 이력">
            <p v-if="!tools.length" class="quiet">호출한 Tool이 없습니다.</p>
            <ol class="tools">
              <li v-for="row in tools" :key="row.sequence" :class="row.state">
                {{ row.label }} ({{ row.tool }}) · {{ STATE_TEXT[row.state] }}<span v-if="row.durationMs != null"> · {{ row.durationMs }}ms</span>
                <span v-if="row.guide"> · {{ row.guide }}</span>
              </li>
            </ol>
          </section>
          <section v-if="openDrops.replans" id="drop-replans" class="drop-panel" aria-label="재계획">
            <p v-if="!replans.length" class="quiet">재계획 없음</p>
            <ol>
              <li v-for="item in replans" :key="item.sequence">{{ item.payload.replan_count }}회 · {{ item.payload.axis }} · {{ item.payload.reason }}</li>
            </ol>
          </section>
          <section v-if="openDrops.sources && sources.length" id="drop-sources" class="drop-panel" aria-label="근거 문서">
            <article v-for="source in sources" :key="source.rank" class="candidate">
              <h3>[{{ source.rank }}] {{ source.title }}</h3>
              <p>{{ source.snippet }}</p>
              <a v-if="source.url" :href="source.url" target="_blank" rel="noopener noreferrer">출처 열기</a>
            </article>
          </section>
          <section v-if="openDrops.candidates" id="drop-candidates" class="drop-panel" aria-label="후보">
            <p v-if="!candidates.length" class="quiet">후보가 없습니다.</p>
            <article v-for="candidate in candidates" :key="candidate.candidate_id" class="candidate">
              <h3>{{ candidate.name }} · {{ candidate.status }}</h3>
              <p v-for="check in candidate.checks || []" :key="check.field">{{ check.field }} {{ check.value }} {{ check.unit }} / 기준 {{ check.threshold }} {{ check.status }}</p>
              <p class="actions">
                <button v-if="candidate.observation_start" type="button" class="text" @click="keep(candidate)">계획으로 저장</button>
                <button v-if="candidate.latitude != null" type="button" class="sky" @click="sky(candidate)">천구에서 보기</button>
              </p>
            </article>
          </section>
        </div>
      </div>
      </div>
      </div>
      <form class="composer" @submit.prevent="ask">
        <div class="compose-row">
          <div class="field">
            <textarea v-model="draft" rows="2" aria-label="관측 요청" @keydown="onComposerKeydown" />
            <Transition name="ph" mode="out-in">
              <span v-if="!draft.trim()" :key="placeholderIndex" class="placeholder" aria-hidden="true">{{ EXAMPLES[placeholderIndex] }}</span>
            </Transition>
          </div>
          <button type="submit" class="send" :disabled="busy">{{ busy ? "처리 중" : "보내기" }}</button>
        </div>
      </form>
    </section>
    <div v-if="tab !== 'chat'" class="pane">
    <section v-if="tab === 'plans'" class="sheet">
      <form class="manual" @submit.prevent="addManual">
        <input v-model="manual.place_name" aria-label="저장할 장소" />
        <input v-model="manual.start_at" aria-label="시작" type="datetime-local" />
        <input v-model="manual.end_at" aria-label="종료" type="datetime-local" />
        <button type="submit" class="text">미검증이어도 저장</button>
      </form>
      <article v-for="plan in plans" :key="plan.id">
        <h2>{{ plan.target_name }} · {{ plan.place_name }}</h2>
        <p>{{ plan.start_at }} – {{ plan.end_at }} · {{ plan.status }}</p>
        <dl v-if="detail?.id === plan.id">
          <div><dt>천체</dt><dd>{{ detail.target_name }} ({{ detail.target_id }})</dd></div>
          <div><dt>장소</dt><dd>{{ detail.place_name }}</dd></div>
          <div><dt>좌표</dt><dd>{{ detail.latitude ?? "없음" }}, {{ detail.longitude ?? "없음" }}</dd></div>
          <div><dt>시작</dt><dd>{{ detail.start_at }}</dd></div>
          <div><dt>종료</dt><dd>{{ detail.end_at }}</dd></div>
          <div><dt>상태</dt><dd>{{ detail.status }}</dd></div>
          <div><dt>생성</dt><dd>{{ detail.created_at }}</dd></div>
        </dl>
        <input v-if="editId === plan.id" v-model="editPlace" aria-label="장소 이름" />
        <p class="actions">
          <button type="button" class="text" @click="openDetail(plan.id)">{{ detail?.id === plan.id ? "상세 닫기" : "상세" }}</button>
          <button type="button" class="text" @click="editId === plan.id ? rename(plan) : (editId = plan.id, editPlace = plan.place_name)">{{ editId === plan.id ? "수정 반영" : "이름 수정" }}</button>
          <button type="button" class="text" @click="removePlan(plan.id)">삭제</button>
          <button type="button" class="sky" @click="sky(plan)">천구에서 보기</button>
        </p>
      </article>
      <p v-if="!plans.length" class="quiet">저장된 계획이 없습니다.</p>
    </section>
    <section v-if="tab === 'logs'" class="sheet">
      <p v-for="session in sessions" :key="session" class="log-row">
        <button type="button" class="text" @click="openSession(session)">{{ session }}</button>
        <button type="button" class="text" @click="deleteLog(session).then(openLogs)">로그 삭제</button>
      </p>
      <ol class="record">
        <li v-for="event in activeLog" :key="event.sequence">
          {{ event.sequence }}. {{ event.stage }} {{ event.type }}<span v-if="event.tool_name"> · {{ event.tool_name }}</span><span v-if="event.duration_ms != null"> · {{ event.duration_ms }}ms</span>
        </li>
      </ol>
    </section>
    </div>
    <aside v-if="mapOpen" class="content" aria-label="장소 지도">
      <PlaceMap :key="detail.id" :plan="detail" />
    </aside>
    <aside v-else-if="split" class="content" aria-label="내 위치에서 보이는 일정">
      <VisibilitySchedule :target-id="scheduleTarget" @plan="draftFromWindow" @sky="skyFromWindow" />
    </aside>
    </div>
    <footer class="credits">
      데이터 출처:
      장소 <a href="https://developers.google.com/maps/documentation/places/web-service" target="_blank" rel="noopener noreferrer">Google Maps Platform</a> ·
      천체 위치 <a href="https://ssd.jpl.nasa.gov/horizons/" target="_blank" rel="noopener noreferrer">NASA JPL Horizons</a> ·
      날씨 <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo.com</a> (CC BY 4.0)
    </footer>
  </main>
</template>

<style scoped>
/* 화면 전체를 세로로 나눈다: 위 이동 줄, 가운데 본문(내부 스크롤), 맨 아래 출처 줄. */
.planner { position: fixed; inset: 0; z-index: 60; display: flex; flex-direction: column; overflow: hidden; background: #0b0e16; color: #e7e9f0; }
.top { flex: none; display: grid; justify-items: center; gap: 6px; padding: 18px 28px 10px; }
.modes { display: flex; gap: 6px; align-items: flex-start; }
.pages { display: flex; gap: 22px; align-items: baseline; }
.pages button, .text { border: 0; background: none; padding: 0; color: #8b919e; font: inherit; cursor: pointer; }
.pages button { font-size: 15px; }
.pages button:hover, .text:hover:enabled { color: #fff; }
.pages button.current { color: #fff; font-weight: 600; }
/* 태양계·천구 상단과 같은 아이콘 단추: 흰 아이콘, 지금 있는 화면만 흰 바탕. */
.mode { min-width: 66px; display: flex; flex-direction: column; align-items: center; gap: 5px; margin: 0; padding: 9px 12px 7px; white-space: nowrap; border: 1px solid transparent; border-radius: 9px; background: transparent; color: #fff; font: inherit; font-size: 11px; font-weight: 400; line-height: 1.55; cursor: pointer; }
.mode svg { width: 23px; height: 23px; fill: currentColor; stroke: none; }
.mode:hover { background: #ffffff20; }
.mode.current { background: #fff; border-color: #fff; color: #111318; cursor: default; }
.picked { margin: 0; color: #8b919e; font-size: 12px; }
/* 대화·계획·로그 탭 공통: 천체를 고른 채 들어오면 반으로 나뉘어 왼쪽은 탭 내용, 오른쪽은 일정. 고르지 않으면 전체 폭. */
.body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr); overflow: hidden; }
.body.split { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.pane { min-width: 0; min-height: 0; overflow: auto; padding: 0 28px 16px; }
.chat { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
.chat-scroll { flex: 1; min-height: 0; overflow: auto; padding: 12px 24px 8px; }
.chat-inner { width: min(760px, 100%); margin: 0 auto; }
.content { min-width: 0; min-height: 0; overflow: auto; border-left: 1px solid #ffffff14; }
.content :deep(.schedule) { margin: 0; padding: 20px 28px 12px; border: 0; border-radius: 0; background: transparent; }
.thread { display: grid; gap: 14px; align-content: start; min-width: 0; }
.thread article { margin: 0; white-space: pre-wrap; line-height: 1.65; }
.thread article.user { max-width: min(36em, 100%); padding: 10px 14px; border-radius: 16px 16px 4px 16px; background: #fd7e1418; }
.thread article.assistant { padding: 2px 0; }
.msg { display: grid; gap: 2px; min-width: 0; }
.msg.user { justify-items: end; }
/* 메시지 아래 작은 아이콘 단추: 평소엔 흐리게, 올리거나 포커스하면 또렷하게 */
.msg-actions { display: flex; gap: 2px; margin: 0; }
.icon { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: #8b919e; cursor: pointer; opacity: 0.7; transition: opacity 0.15s, background 0.15s, color 0.15s; }
.icon svg { width: 16px; height: 16px; fill: currentColor; }
.msg:hover .icon, .icon:focus-visible { opacity: 1; }
.icon:hover:enabled { background: #ffffff14; color: #fff; }
.icon.done { color: #fd7e14; opacity: 1; }
.icon:disabled { opacity: 0.3; cursor: default; }
.edit { width: min(36em, 100%); padding: 10px 12px; border: 1px solid #fd7e1466; border-radius: 16px; background: #fd7e140d; }
.edit textarea { display: block; width: 100%; border: 0; background: transparent; color: inherit; resize: vertical; padding: 2px; font: inherit; line-height: 1.5; }
.edit textarea:focus-visible { outline: none; }
.edit-actions { display: flex; justify-content: flex-end; align-items: center; gap: 14px; margin: 6px 0 0; }
.send.small { padding: 6px 12px; border-radius: 10px; font-size: 13px; }
.turn { margin-top: 18px; }
.analysis { display: grid; gap: 4px; font-size: 13px; }
.analysis p { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 0; }
.analysis .k { width: 2.4em; color: #8b919e; font-size: 12px; }
.analysis .v { color: #fd7e14; }
.analysis .none { color: #ffffff3d; }
.sheet { margin: 22px 0 0; padding: 16px 18px; border: 1px solid #ffffff24; border-radius: 18px; background: #0b0e16; }
.record { margin-top: 14px; padding-top: 6px; border-top: 1px solid #ffffff14; font-size: 12px; color: #8b919e; }
/* 접이식 기록 단추: 같은 폭으로 한 줄에 나란히, 같은 간격으로 */
.drops { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 8px; margin-top: 8px; }
.drop { display: flex; align-items: center; justify-content: center; gap: 6px; min-width: 0; padding: 8px 10px; border: 1px solid #ffffff1f; border-radius: 10px; background: #ffffff08; color: #c5cad6; font: inherit; font-size: 12px; cursor: pointer; }
.drop:hover { background: #ffffff14; color: #fff; }
.drop.open { border-color: #fd7e1480; background: #fd7e140f; color: #fff; }
.drop-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.drop-count { flex: none; color: #8b919e; font-size: 11px; }
.drop.open .drop-count { color: #fd7e14; }
.drop-caret { flex: none; width: 10px; height: 10px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; transition: transform 0.15s; }
.drop.open .drop-caret { transform: rotate(180deg); }
.drop-panel { margin-top: 8px; padding: 8px 12px; border: 1px solid #ffffff14; border-radius: 10px; background: #ffffff05; }
.drop-panel > .quiet { margin: 0; }
.drop-panel .candidate:first-child { margin-top: 0; padding-top: 0; border-top: 0; }
.record ol { margin: 0; padding-left: 1.15em; }
.record li { margin: 2px 0; }
.record .candidate { margin: 8px 0 0; padding-top: 8px; border-top: 1px solid #ffffff14; }
.record h3 { margin: 0 0 4px; font-size: 13px; font-weight: 600; color: #e7e9f0; }
.quiet { color: #ffffff3d; }
.notice { flex: none; margin: 0; padding: 4px 28px 8px; color: #ffb4a2; font-size: 13px; text-align: center; }
.record .notice { padding: 0; margin-top: 8px; text-align: left; }
.status { color: #c5cad6; }
li.replan { color: #e7e9f0; }
.manual, .actions, .log-row { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
/* 로그: 제목은 왼쪽, 삭제는 맨 오른쪽 */
.log-row { flex-wrap: nowrap; justify-content: space-between; margin: 0; padding: 8px 0; border-top: 1px solid #ffffff14; }
.log-row:first-child { border-top: 0; }
.log-row .text:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; text-align: left; color: #c5cad6; }
.log-row .text:last-child { flex-shrink: 0; margin-left: auto; }
.manual { margin-bottom: 8px; }
.manual input, .sheet article input { border: 0; border-bottom: 1px solid #ffffff24; border-radius: 0; background: transparent; color: inherit; padding: 6px 2px; font: inherit; }
.sheet article { padding: 14px 0; border-top: 1px solid #ffffff14; }
.sheet article h2 { margin: 0; font-size: 16px; font-weight: 600; color: #fff; }
.sheet article p { margin: 4px 0 0; color: #9aa3b5; font-size: 13px; }
.sheet article dl { display: grid; gap: 4px; margin: 8px 0; font-size: 13px; }
.sheet article dl div { display: flex; gap: 8px; }
.sheet article dl dt { min-width: 3em; color: #8b919e; }
.sheet article dl dd { margin: 0; color: #fd7e14; }
.sky { border: 1px solid #fd7e14; border-radius: 999px; background: transparent; color: #fd7e14; padding: 5px 12px; font: inherit; cursor: pointer; }
.sky:hover { background: #fd7e1414; }
.composer { flex: none; width: min(760px, calc(100% - 48px)); margin: 4px auto 16px; padding: 10px 12px; border: 1px solid #ffffff24; border-radius: 18px; background: #0b0e16; }
.compose-row { display: flex; gap: 8px; align-items: flex-end; }
.field { position: relative; flex: 1; min-width: 0; }
.composer textarea { display: block; width: 100%; border: 0; background: transparent; color: inherit; resize: none; padding: 6px 2px; font: inherit; line-height: 1.5; }
.composer textarea:focus-visible { outline: none; }
/* 예시 질문: 입력이 비어 있는 동안 4.5초마다 겹쳐 흐려지며 바뀐다. */
.placeholder { position: absolute; left: 2px; right: 2px; top: 6px; color: #ffffff59; line-height: 1.5; pointer-events: none; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.ph-enter-active, .ph-leave-active { transition: opacity 600ms ease, transform 600ms ease; }
.ph-enter-from { opacity: 0; transform: translateY(5px); }
.ph-leave-to { opacity: 0; transform: translateY(-5px); }
@media (prefers-reduced-motion: reduce) { .ph-enter-active, .ph-leave-active { transition: opacity 600ms ease; } .ph-enter-from, .ph-leave-to { transform: none; } }
.send { flex-shrink: 0; border: 0; border-radius: 12px; background: #fd7e14; color: #1a1008; padding: 9px 14px; font: inherit; font-weight: 600; cursor: pointer; }
.send:disabled { opacity: 0.55; cursor: default; }
/* 출처 문구는 화면 맨 아래 */
.credits { flex: none; margin: 0; padding: 9px 16px; text-align: center; background: #0b0e16; border-top: 1px solid #ffffff14; color: #8b919e; font-size: 12px; }
.credits a { color: #9aa3b5; }
button:disabled { cursor: default; }
@media (max-width: 800px) {
  .pane { padding: 0 16px 12px; }
  .body.split { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 40%) minmax(0, 1fr); }
  .body.split .content { order: -1; border-left: 0; border-bottom: 1px solid #ffffff14; }
}
</style>
