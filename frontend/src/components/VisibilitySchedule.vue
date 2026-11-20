<script setup>
import { computed, onMounted, ref } from "vue";
import { effectiveLocation, requestUserLocation, userLocation } from "../data/userLocation";
import { compassName, TARGET_NAMES_KO, VISIBILITY_RULES, visibilityWindows } from "../utils/visibility";

const props = defineProps({ targetId: { type: String, required: true } });
const emit = defineEmits(["plan", "sky"]);

const DAYS = 7;
const now = ref(new Date());
const location = computed(() => effectiveLocation());
const rule = computed(() => VISIBILITY_RULES[props.targetId]);
const targetName = computed(() => TARGET_NAMES_KO[props.targetId] || props.targetId);
const windows = computed(() => visibilityWindows({
  bodyId: props.targetId,
  latitude: location.value.latitude,
  longitude: location.value.longitude,
  from: now.value,
  days: DAYS,
}));

const dayFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short" });
const clockFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const day = (date) => dayFormat.format(date);
const clock = (date) => clockFormat.format(date);
// 고도가 높은 날(상위 구간)만 시간 옆에 짧은 막대를 둔다. 길이는 고도에 비례하고, 칸 전체를 칠하지 않는다.
const altitudeBar = (window) => `${Math.round(16 + Math.min(1, Math.max(0, (window.peakAltitude - 15) / 55)) * 32)}px`;
const span = (window) => {
  const minutes = Math.round((window.end - window.start) / 60000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}시간 ${minutes % 60 ? `${minutes % 60}분` : ""}`.trim() : `${minutes}분`;
};
const moonNote = (window) => {
  if (window.moonFraction == null) return "";
  const percent = Math.round(window.moonFraction * 100);
  return percent >= 60 ? `달빛이 밝음(밝기 ${percent}%)` : `달빛 약함(밝기 ${percent}%)`;
};

async function refresh() {
  await requestUserLocation({ force: true });
  now.value = new Date();
}
onMounted(async () => {
  await requestUserLocation();
  now.value = new Date();
});
</script>

<template>
  <section class="schedule" aria-label="내 위치에서 보이는 일정">
    <header class="schedule-head">
      <h2>{{ targetName }} <small>앞으로 {{ DAYS }}일</small></h2>
      <p class="where">
        <template v-if="location.isDefault">기준 위치 서울(기본값, 내 위치 아님)</template>
        <template v-else>기준 위치 내 현재 위치 · 위도 {{ location.latitude.toFixed(3) }} · 경도 {{ location.longitude.toFixed(3) }}</template>
        <button type="button" class="text" :disabled="userLocation.status === 'pending'" @click="refresh">내 위치 다시 가져오기</button>
      </p>
    </header>
    <p v-if="userLocation.message && userLocation.status !== 'ok'" class="hint" role="status">{{ userLocation.message }}</p>
    <p class="hint">
      고도 {{ rule.minAltitude }}° 이상, 태양 고도 {{ rule.maxSunAltitude }}° 이하. 구름·날씨는 이 계산에 없고, 계획을 만들면 예보로 다시 판정합니다.
    </p>
    <p v-if="!windows.length" class="hint">앞으로 {{ DAYS }}일 안에 이 조건으로 보이는 시간이 없습니다.</p>
    <ol v-else>
      <li v-for="window in windows" :key="window.start.getTime()">
        <time class="day">{{ day(window.start) }}</time>
        <div class="entry">
          <p class="time-row">
            <strong class="clock">{{ window.ongoing ? "지금부터" : clock(window.start) }}<span>– {{ clock(window.end) }}</span></strong>
            <i v-if="window.recommended" class="altitude" :style="{ width: altitudeBar(window) }" :title="`가장 높을 때 ${window.peakAltitude.toFixed(0)}°`"></i>
            <span v-if="window.ongoing" class="now">지금 보임</span>
          </p>
          <p class="meta">
            약 {{ span(window) }} · {{ clock(window.peak) }}에 {{ window.peakAltitude.toFixed(0) }}° {{ compassName(window.peakAzimuth) }}쪽
            <template v-if="moonNote(window)"> · {{ moonNote(window) }}</template>
            · 날씨 미반영
          </p>
          <p class="actions">
            <button type="button" class="text" @click="emit('plan', window)">이 시간으로 계획 요청 쓰기</button>
            <button type="button" class="sky" @click="emit('sky', { window, location })">이 시간 천구에서 보기</button>
          </p>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.schedule { margin-top: 22px; padding: 16px 18px 8px; border: 1px solid #ffffff24; border-radius: 18px; background: #0b0e16; }
.schedule-head { display: flex; justify-content: space-between; gap: 16px; align-items: baseline; flex-wrap: wrap; }
h2 { margin: 0; font-size: 15px; font-weight: 600; color: #fff; }
h2 small, .hint, .where, .meta, .now { color: #8b919e; font-size: 12px; font-weight: 400; }
.where { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin: 0; }
.hint { margin: 8px 0 0; }
ol { list-style: none; margin: 12px 0 0; padding: 0; }
li { display: grid; grid-template-columns: 7.2em minmax(0, 1fr); gap: 8px 16px; align-items: start; padding: 14px 0; border-top: 1px solid #ffffff14; }
.day { padding-top: 6px; color: #c5cad6; font-size: 13px; }
.time-row { display: flex; align-items: center; gap: 10px; margin: 0; }
.clock { font-size: 26px; font-weight: 600; letter-spacing: -0.03em; color: #fff; line-height: 1.1; }
.clock span { margin-left: 8px; font-size: 15px; font-weight: 500; color: #9aa3b5; letter-spacing: 0; }
.altitude { display: block; height: 3px; border-radius: 2px; background: #fd7e14; }
.meta { margin: 6px 0 0; }
.actions { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; margin: 8px 0 0; }
button { font: inherit; cursor: pointer; }
button:disabled { opacity: 0.45; }
.text { border: 0; background: none; padding: 0; color: #c5cad6; font-size: 13px; }
.text:hover:enabled { color: #fff; }
.sky { border: 1px solid #fd7e14; border-radius: 999px; background: transparent; color: #fd7e14; padding: 5px 12px; font-size: 13px; }
.sky:hover { background: #fd7e1414; }
@media (max-width: 640px) {
  li { grid-template-columns: 1fr; gap: 4px; }
  .day { padding-top: 0; }
}
</style>
