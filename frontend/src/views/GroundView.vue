<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { postSky } from "../api/planner";
import { plannerContext, viewTransition } from "../data/viewMode";
import { cancelAtlasHide, cancelGroundEntry, groundLeaveMs, hideAtlasAfter, playGroundEntry, reducedMotion, runClockJump } from "../scene/viewTransitions";
import { OBSERVATION_TARGETS, openObservation, showPlanner, showSolar } from "../data/store";
import { effectiveLocation, requestUserLocation, userLocation } from "../data/userLocation";
import { aimAtlas, atlasReady, onAtlasGaze, onAtlasPick, onAtlasTime, setAtlasClock, setAtlasView, showAtlas } from "../scene/atlasSky";
import { isSkyIdHidden, skyVisibility } from "../scene/skyVisibility";
import { ensureSkyBodies, skyBodyInfo, skyBodyState, startSkyBodies, stopSkyBodies } from "../scene/skyBodies";
import { skyPhase, sunAltitudeDeg, TARGET_NAMES_KO, TWILIGHT_HELP, TWILIGHT_HELP_NOTE } from "../utils/visibility";
import { SKY_SPEEDS } from "../utils/skySpeed";
import SkyControls from "../components/SkyControls.vue";
import SkyPicker from "../components/SkyPicker.vue";

const plan = computed(() => plannerContext.plan);
const root = ref(null);
// 시계 점프 연출 중과 그 직후에는 천구가 알려 주는 시각을 무시한다(앞서 보낸 시각의 보고가 늦게 도착해 끝 시각을 덮지 않게).
let ignoreTimeUntil = 0;
const time = ref("");
const latitude = ref("37.5665");
const longitude = ref("126.9780");
const elevation = ref("0");
const placeQuery = ref("");
const places = ref([]);
const gaze = ref({ azimuth: 0, altitude: 20 });
const message = ref("");
const locationNote = ref("");
const loading = ref(false);
const snapshot = ref(null);
const stepIndex = ref(0);
const conditionsOpen = ref(false);
const pick = ref(null);
// 숨긴 천체의 정보 카드가 떠 있으면 닫는다.
watch(() => [skyVisibility.categories, skyVisibility.bodies], () => {
  const value = pick.value;
  if (value && isSkyIdHidden(value.kind === "asterism" ? `con:${value.name}` : value.name)) pick.value = null;
}, { deep: true });
let stopGaze;
let stopPick;
let stopTime;
let lastTimeSync = 0;
// 천구가 지금 보여 주는 시각(ms). 시간은 천구가 프레임마다 흘리고, 앱은 이 값으로 표시만 한다.
const simNow = ref(0);

function seoulInput(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function seoulClock(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

function isoTime() {
  return time.value ? `${time.value}:00+09:00` : "";
}

// 폼의 시각은 분 단위라 초가 없다. 천구가 알려 준 시각이 폼과 같은 분이면 초까지 있는 그 시각을 쓴다.
function currentDate() {
  const stamp = simNow.value;
  if (stamp > 0 && seoulInput(new Date(stamp)) === time.value) return new Date(stamp);
  return new Date(isoTime());
}

const clockText = computed(() => seoulClock(simNow.value) || (time.value ? `${time.value.replace("T", " ")}:00` : ""));
const speedText = computed(() => (stepIndex.value > 0 ? SKY_SPEEDS[stepIndex.value].name : "일시정지"));

const coordinates = computed(() => {
  const lat = Number(latitude.value);
  const lon = Number(longitude.value);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
});

// 태양 고도로 낮·박명·밤을 보여 준다. 하늘의 밝기는 천구 엔진이 같은 시각의 태양 위치로 그린다.
const sun = computed(() => {
  const at = new Date(isoTime());
  if (!coordinates.value || Number.isNaN(at.getTime())) return null;
  const altitude = sunAltitudeDeg(at, coordinates.value.lat, coordinates.value.lon);
  return { altitude, phase: skyPhase(altitude) };
});

const minutesOfDay = computed({
  get() {
    const [hour, minute] = (time.value.split("T")[1] || "00:00").split(":").map(Number);
    return hour * 60 + minute;
  },
  set(value) {
    const total = Math.min(1439, Math.max(0, Number(value)));
    const clock = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    time.value = `${time.value.split("T")[0]}T${clock}`;
    pushView();
  },
});

function pushView(at = currentDate(), extra = {}) {
  if (!coordinates.value || Number.isNaN(at.getTime())) return;
  simNow.value = at.getTime();
  setAtlasView({
    latitude: coordinates.value.lat,
    longitude: coordinates.value.lon,
    elevation: Number(elevation.value) || 0,
    time: at,
    ...extra,
  });
}

function fillFromPlan(value) {
  if (value?.start) {
    const parsed = new Date(value.start);
    if (!Number.isNaN(parsed.getTime())) time.value = seoulInput(parsed);
  } else if (!time.value) time.value = seoulInput(new Date());
  if (Number.isFinite(Number(value?.latitude)) && Number.isFinite(Number(value?.longitude))) {
    latitude.value = String(value.latitude);
    longitude.value = String(value.longitude);
    locationNote.value = value.placeName ? `관측 장소: ${value.placeName}` : "관측 계획의 장소입니다.";
  }
  if (value?.placeName) placeQuery.value = value.placeName;
}

function checkedNumbers() {
  const lat = Number(latitude.value);
  const lon = Number(longitude.value);
  const elev = Number(elevation.value);
  if (!isoTime()) return "시각을 입력해 주세요.";
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return "위도는 -90에서 90 사이여야 합니다.";
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return "경도는 -180에서 180 사이여야 합니다.";
  if (!Number.isFinite(elev) || elev < -500 || elev > 9000) return "고도는 -500m에서 9000m 사이여야 합니다.";
  return { lat, lon, elev };
}

function untilIso() {
  if (!plan.value?.end) return null;
  const end = new Date(plan.value.end);
  const start = new Date(isoTime());
  if (Number.isNaN(end.getTime()) || Number.isNaN(start.getTime()) || end <= start) return null;
  return end.toISOString();
}

async function applySky(aim = true) {
  const checked = checkedNumbers();
  if (typeof checked === "string") {
    message.value = checked;
    return;
  }
  if (!atlasReady()) {
    message.value = "천구 엔진이 준비되지 않았습니다. 터미널에서 npm run build:sky 를 실행한 뒤 새로고침해 주세요.";
    return;
  }
  const view = { latitude: checked.lat, longitude: checked.lon, elevation: checked.elev, time: currentDate() };
  simNow.value = view.time.getTime();
  // 별·행성·태양·달은 천구 엔진이 이 시각·위치에서 바로 그린다.
  setAtlasView(view);
  loading.value = true;
  message.value = "브라우저에서 대상 천체의 고도를 계산하고 날씨를 확인하는 중입니다.";
  try {
    const data = await postSky({
      time: isoTime(),
      latitude: checked.lat,
      longitude: checked.lon,
      elevation_m: checked.elev,
      until: untilIso(),
      target_id: plan.value?.targetId || plannerContext.selectedTargetId || null,
      purpose: "sky",
    });
    if (!data.ok) {
      message.value = data.error?.message || "대상 천체의 고도를 확인하지 못했습니다. 하늘은 Solar Atlas 계산으로 표시합니다.";
      return;
    }
    snapshot.value = data;
    const target = data.bodies.find((body) => body.target_id === data.target_id);
    if (target && aim) aimAtlas({ azimuth: target.azimuth_deg, altitude: target.altitude_deg });
    const weather = data.weather?.available
      ? `구름 ${data.weather.cloud_cover_pct}% · 강수확률 ${data.weather.precipitation_probability_pct}%`
      : "예보 없음";
    message.value = `하늘과 대상 고도는 Solar Atlas·astronomy-engine 계산, 날씨는 Open-Meteo 기준입니다. ${weather}.`;
  } catch (error) {
    message.value = `${error.message} 하늘은 Solar Atlas 계산으로 표시합니다.`;
  } finally {
    loading.value = false;
  }
}

async function searchPlace() {
  if (!placeQuery.value.trim()) {
    message.value = "장소 이름을 입력해 주세요.";
    return;
  }
  try {
    const data = await postSky({
      time: isoTime() || `${seoulInput(new Date())}:00+09:00`,
      place_query: placeQuery.value.trim(),
      purpose: "place",
    });
    if (!data.ok) {
      places.value = [];
      message.value = data.error?.message || "장소를 찾지 못했습니다.";
      return;
    }
    places.value = data.places || [];
    if (places.value.length === 1) choosePlace(places.value[0]);
    else message.value = "장소가 여러 곳입니다. 이름을 고르면 좌표가 채워집니다.";
  } catch (error) {
    message.value = error.message;
  }
}

function choosePlace(place) {
  if (place.latitude == null || place.longitude == null) {
    message.value = "이 후보는 좌표가 없어 쓰지 않습니다.";
    return;
  }
  latitude.value = String(place.latitude);
  longitude.value = String(place.longitude);
  placeQuery.value = place.name || placeQuery.value;
  locationNote.value = `관측 장소: ${placeQuery.value}`;
  message.value = "좌표를 채웠습니다. 이 시각·위치로 보기를 누르면 천체를 조회합니다.";
}

function resetAim() {
  const target = snapshot.value?.bodies?.find((body) => body.target_id === snapshot.value.target_id);
  if (!target) {
    message.value = "맞출 대상 천체의 계산된 고도가 없습니다.";
    return;
  }
  aimAtlas({ azimuth: target.azimuth_deg, altitude: target.altitude_deg });
}

// 시간 흐름: 속도 단계(stepIndex)를 천구에 배율로 알려 주면 천구가 프레임마다 직접 시간을 흘리고,
// 앱은 천구가 알려 주는 시각(onAtlasTime)을 표시만 한다. 앱이 시간을 대신 흘리면 메시지와 화면 갱신이
// 천구의 그리기와 같은 스레드에서 끼어들어 프레임이 끊긴다.
function stopPlaying() {
  stepIndex.value = 0;
}

/** 천구가 다음에 알려 주는 시각을 기다린다(멈춘 순간의 정확한 시각을 받으려고). */
function nextTimeReport(timeoutMs = 400) {
  return new Promise((resolve) => {
    const stop = onAtlasTime(() => { stop(); clearTimeout(timer); resolve(); });
    const timer = setTimeout(() => { stop(); resolve(); }, timeoutMs);
  });
}

watch(stepIndex, async (value, before) => {
  setAtlasClock(SKY_SPEEDS[value].factor);
  // 멈춘 시각의 대상 고도·날씨를 다시 확인한다.
  if (value === 0 && before > 0) {
    await nextTimeReport();
    applySky(false);
  }
});

/** 탐색에서 천체를 고르면 그 방향으로 시선을 돌린다. */
function aimAt({ azimuth, altitude }) {
  aimAtlas({ azimuth, altitude });
}

function nowAt(location) {
  stopPlaying();
  latitude.value = String(location.latitude);
  longitude.value = String(location.longitude);
  time.value = seoulInput(new Date());
}

// 내 현재 위치와 현재 시각을 가져와 지금 그 자리의 하늘을 보여 준다.
async function useMyLocationNow() {
  message.value = userLocation.message;
  await requestUserLocation({ force: true });
  const location = effectiveLocation();
  nowAt(location);
  locationNote.value = location.isDefault ? "서울(기본값, 내 위치 아님)" : "내 현재 위치(브라우저 위치 정보)";
  placeQuery.value = "";
  await applySky();
  if (userLocation.status !== "ok") message.value = userLocation.message;
}

const site = computed(() => {
  const at = new Date(isoTime());
  return coordinates.value && !Number.isNaN(at.getTime())
    ? { date: at, latitude: coordinates.value.lat, longitude: coordinates.value.lon, elevation: Number(elevation.value) || 0 }
    : null;
});

function formatDistance(au) {
  if (!Number.isFinite(au)) return "";
  if (au < 0.01) return `${(au * 149597870.7).toLocaleString("ko-KR", { maximumFractionDigits: 0 })} km`;
  return `${au.toLocaleString("ko-KR", { maximumFractionDigits: au < 10 ? 2 : 1 })} AU`;
}

// 천구에서 고른 소천체(Horizons)의 거리·밝기. 거리는 받아 온 표의 첫 시각 기준이다.
function skyBodyDetail(id) {
  const info = skyBodyInfo(id);
  if (!info) return "";
  const parts = [];
  if (info.distanceAu != null) parts.push(`지구와의 거리 약 ${formatDistance(info.distanceAu)}`);
  parts.push(info.magnitude != null ? `겉보기 등급 약 ${info.magnitude.toFixed(1)}` : "밝기 정보 없음");
  return `${parts.join(" · ")} (JPL Horizons)`;
}

const bodiesNote = computed(() => {
  if (skyBodyState.orbitNote) return skyBodyState.orbitNote;
  if (skyBodyState.status === "loading") return "정적 배포에서 제공 가능한 천체 목록을 확인하는 중입니다.";
  if (skyBodyState.status === "error") return skyBodyState.message;
  if (skyBodyState.unavailable.length) return skyBodyState.unavailable[0];
  return "";
});

const pickInfo = computed(() => {
  if (!pick.value) return null;
  const id = pick.value.name.toLowerCase();
  const key = id ? id[0].toUpperCase() + id.slice(1) : "";
  const entry = pick.value.kind === "body" ? OBSERVATION_TARGETS[key] : null;
  const names = { ...TARGET_NAMES_KO, sun: "태양", earth: "지구" };
  const reason = pick.value.kind !== "body"
    ? "별과 별자리는 이번 플래너의 관측 대상이 아닙니다(행성·달 지원)."
    : entry?.reason || "이 천체는 관측 플래너 대상이 아닙니다.";
  const detail = pick.value.sky ? skyBodyDetail(pick.value.name) : "";
  return {
    title: pick.value.label || (pick.value.kind === "body" && (names[id] || key)) || pick.value.name,
    key,
    supported: Boolean(entry?.supported),
    reason,
    detail,
    left: Math.max(8, Math.min(pick.value.x, window.innerWidth - 280)),
    top: Math.max(8, Math.min(pick.value.y + 12, window.innerHeight - 150)),
  };
});

function observePicked() {
  const key = pickInfo.value?.key;
  pick.value = null;
  stopPlaying();
  if (key) openObservation(key);
}

function dismissPick(event) {
  if (event.key === "Escape") pick.value = null;
}

// 시각은 이 화면 안에서만 바뀐다. 계획 시각에서 멈춘 채 화면을 떠나면, 다음에 일반으로 들어올 때는 다시 현재 시각에서 시작한다.
async function jumpToPlanTime(target) {
  const start = new Date();
  ignoreTimeUntil = Infinity;
  time.value = seoulInput(start);
  pushView(start);
  const arrived = await runClockJump({
    from: start.getTime(),
    to: target.getTime(),
    onFrame(at) {
      time.value = seoulInput(at);
      pushView(at);
    },
  });
  ignoreTimeUntil = performance.now() + 600;
  if (!arrived) return;
  time.value = seoulInput(target);
  pushView(target);
  ensureSkyBodies(target.getTime());
  await applySky();
}

onMounted(async () => {
  cancelAtlasHide();
  window.addEventListener("keydown", dismissPick);
  setAtlasClock(0);
  fillFromPlan(plan.value);
  const hasPlanLocation = Boolean(coordinates.value) && Number.isFinite(Number(plan.value?.latitude));
  stopGaze = onAtlasGaze((value) => { gaze.value = value; });
  stopTime = onAtlasTime(({ timeMs }) => {
    if (performance.now() < ignoreTimeUntil) return;
    simNow.value = timeMs;
    ensureSkyBodies(timeMs);
    // 폼의 시각(분 단위)과 그에 딸린 계산은 흐르는 동안 초당 한 번만 고친다.
    const now = performance.now();
    if (stepIndex.value === 0 || now - lastTimeSync > 1000) {
      lastTimeSync = now;
      time.value = seoulInput(new Date(timeMs));
    }
  });
  stopPick = onAtlasPick(({ pick: value, x, y }) => { pick.value = value ? { ...value, x, y } : null; });
  showAtlas(true);
  startSkyBodies(currentDate().getTime());
  // 들어오는 연출(태양계: 지표로 내려가는 줌인, 플래너: 원형으로 열리는 하늘). 천구를 보인 직후에 건다.
  playGroundEntry({ from: viewTransition.from, point: viewTransition.point, root: root.value });
  if (hasPlanLocation) {
    // 플래너의 계획으로 들어오면 현재 시각에서 계획 시각까지 시계가 빠르게 흘러 그 시각의 하늘에서 멈춘다.
    const target = new Date(plan.value?.start);
    if (viewTransition.from === "planner" && !Number.isNaN(target.getTime()) && !reducedMotion()) {
      await jumpToPlanTime(target);
      return;
    }
    applySky();
    return;
  }
  // 계획에서 온 것이 아니면 내 현재 위치와 현재 시각에서 시작한다. 위치를 기다리는 동안 서울 하늘을 먼저 보인다.
  time.value = seoulInput(new Date());
  locationNote.value = "내 현재 위치를 확인하는 중(그동안 서울 좌표)";
  applySky();
  await useMyLocationNow();
});

watch(plan, (value) => { if (value) fillFromPlan(value); });

onBeforeUnmount(() => {
  window.removeEventListener("keydown", dismissPick);
  cancelGroundEntry();
  setAtlasClock(0);
  stopTime?.();
  stopGaze?.();
  stopPick?.();
  stopSkyBodies();
  // 태양계로 가면 올라가는 연출이, 플래너로 가면 플래너가 열리는 연출이 끝날 때까지 하늘을 남겨 둔다.
  hideAtlasAfter(groundLeaveMs(viewTransition));
});
</script>

<template>
  <section ref="root" class="ground-view" aria-label="지상 천구">
    <SkyPicker :site="site" @aim="aimAt" />
    <SkyControls v-model="stepIndex" />
    <aside class="ground-panel" aria-label="관측 조건" @pointerdown.stop @click.stop @wheel.stop>
      <div class="ground-clock" role="timer" aria-label="천구 시뮬레이션 시각">
        <small>천구 시각 (한국 표준시)</small>
        <strong>{{ clockText }}</strong>
        <span :data-running="stepIndex > 0">{{ speedText }}</span>
      </div>
      <div class="ground-nav">
        <button type="button" @click="showSolar()">태양계로</button>
        <button type="button" @click="showPlanner()">플래너로</button>
      </div>
      <div class="ground-title">
        <strong>{{ plan?.targetName || "현재 위치" }}</strong>
        <span>시선 방위 {{ gaze.azimuth.toFixed(1) }}° · 고도 {{ gaze.altitude.toFixed(1) }}°</span>
        <div v-if="sun" class="sun-row">
          <span class="sun" :data-phase="sun.phase.key">{{ sun.phase.label }} · 태양 고도 {{ sun.altitude.toFixed(1) }}°</span>
          <!-- 박명 단계에서만: 낯선 용어라 물음표에 올리면 세 단계 풀이를 보여 준다. -->
          <span v-if="TWILIGHT_HELP.some((item) => item.key === sun.phase.key)" class="help">
            <button type="button" class="help-mark" aria-label="박명 설명" aria-describedby="twilight-help">?</button>
            <span id="twilight-help" class="help-tip" role="tooltip">
              <span v-for="item in TWILIGHT_HELP" :key="item.key" class="help-item" :class="{ current: item.key === sun.phase.key }">
                <strong>{{ item.title }}</strong>{{ item.text }}
              </span>
              <span class="help-note">{{ TWILIGHT_HELP_NOTE }}</span>
            </span>
          </span>
        </div>
      </div>
      <div class="ground-nav">
        <button type="button" @click="resetAim()">시선 다시 맞추기</button>
        <button type="button" @click="useMyLocationNow()">내 위치·지금 시각으로</button>
      </div>
      <label class="slider">하루 시간 <output>{{ String(Math.floor(minutesOfDay / 60)).padStart(2, "0") }}:{{ String(minutesOfDay % 60).padStart(2, "0") }}</output>
        <input v-model.number="minutesOfDay" type="range" min="0" max="1439" step="5" aria-label="하루 중 시각" @input="stopPlaying()" />
      </label>
      <button type="button" class="fold" :aria-expanded="conditionsOpen" aria-controls="ground-conditions" @click="conditionsOpen = !conditionsOpen">
        관측 조건 {{ conditionsOpen ? "접기" : "열기" }} <small>{{ time.replace("T", " ") }}</small>
      </button>
      <form v-show="conditionsOpen" id="ground-conditions" class="conditions" @submit.prevent="applySky()">
        <label>시각 (한국 표준시)<input v-model="time" type="datetime-local" required @input="stopPlaying()" /></label>
        <label>위도<input v-model="latitude" inputmode="decimal" /></label>
        <label>경도<input v-model="longitude" inputmode="decimal" /></label>
        <label>고도 m<input v-model="elevation" inputmode="decimal" /></label>
        <label>장소<input v-model="placeQuery" type="text" /></label>
        <button type="button" @click="searchPlace">장소 찾기</button>
        <button type="submit" :disabled="loading">이 시각·위치로 보기</button>
      </form>
      <ul v-if="conditionsOpen && places.length > 1" class="places">
        <li v-for="place in places" :key="place.place_id">
          <button type="button" @click="choosePlace(place)">{{ place.name }}</button>
        </li>
      </ul>
    </aside>
    <div class="sky-space" aria-hidden="true"></div>
    <div v-if="pickInfo" class="pick-card" role="dialog" :aria-label="`${pickInfo.title} 선택`" :style="{ left: `${pickInfo.left}px`, top: `${pickInfo.top}px` }">
      <strong>{{ pickInfo.title }}</strong>
      <button v-if="pickInfo.supported" type="button" class="primary" @click="observePicked">이 천체 관측하기</button>
      <p v-if="pickInfo.detail" class="detail">{{ pickInfo.detail }}</p>
      <p v-if="!pickInfo.supported">{{ pickInfo.reason }}</p>
      <button type="button" class="close" aria-label="닫기" @click="pick = null">×</button>
    </div>
    <p class="ground-note">
      <span v-if="locationNote">위치: {{ locationNote }}. </span>{{ message }}
      <span v-if="bodiesNote" class="bodies-note"> {{ bodiesNote }}</span>
    </p>
  </section>
</template>

<style scoped>
/* 천구(천구 엔진 iframe)가 화면 전체 뒤에 깔리고, 이 화면은 조작부만 그 위에 얹는다.
   탐색(SkyPicker)과 속도·표시(SkyControls)는 태양계 화면과 같은 위치·디자인이다. */
.ground-view { position: fixed; inset: 0; z-index: 80; display: flex; flex-direction: column; color: #e7e9f2; pointer-events: none; }
.ground-panel { position: fixed; top: 18px; left: 20px; width: 320px; max-width: calc(100vw - 40px); z-index: 90; display: grid; gap: 8px; padding: 10px; border: 1px solid #ffffff75; border-radius: 18px; background: #0b0e1673; backdrop-filter: blur(5px); pointer-events: auto; }
.ground-clock { display: grid; gap: 2px; padding: 2px 4px 6px; border-bottom: 1px solid #ffffff2e; }
.ground-clock small { color: #c5cad6; font-size: 11px; }
.ground-clock strong { font-size: 20px; font-variant-numeric: tabular-nums; letter-spacing: 0.02em; color: #fff; }
.ground-clock span { justify-self: start; font-size: 11px; color: #c5cad6; }
.ground-clock span[data-running="true"] { color: #ffc38f; }
.ground-nav { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.ground-title { display: grid; gap: 3px; }
.ground-title span, .ground-note, label, .fold small { color: #c5cad6; font-size: 12px; }
.ground-note { pointer-events: auto; background: #070b16b8; backdrop-filter: blur(6px); }
.conditions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.conditions label:first-child, .conditions button { grid-column: 1 / -1; }
label { display: flex; flex-direction: column; gap: 4px; }
.slider output { color: #fff; margin-left: 6px; }
.slider input { width: 100%; padding: 0; }
input, select { border: 1px solid #ffffff33; border-radius: 8px; background: #12141c; color: #fff; padding: 6px 8px; }
button { border: 1px solid #ffffff33; border-radius: 8px; background: #12141c; color: #fff; padding: 7px 8px; font-size: 12px; }
button:hover:enabled { color: #ffc38f; border-color: #fd7e1466; }
.fold { display: flex; justify-content: space-between; align-items: center; }
.sun-row { display: flex; align-items: center; gap: 6px; }
.sun { border-radius: 999px; padding: 3px 10px; background: #ffffff1f; color: #fff !important; }
.help { position: relative; display: inline-flex; }
.help-mark { width: 18px; height: 18px; padding: 0; border-radius: 50%; border: 1px solid #ffffff80; background: #ffffff1f; color: #fff; font-size: 11px; line-height: 1; cursor: help; }
.help-tip { display: none; position: absolute; z-index: 100; left: -8px; top: calc(100% + 8px); width: 290px; max-width: calc(100vw - 60px); padding: 12px 14px; border: 1px solid #ffffff44; border-radius: 12px; background: #0b1020f5; box-shadow: 0 8px 24px #0009; font-size: 12px; line-height: 1.6; color: #c5cad6; }
.help:hover .help-tip, .help:focus-within .help-tip { display: grid; gap: 8px; }
.help-item strong { display: block; color: #fff; font-size: 12px; }
.help-item { opacity: 0.7; }
.help-item.current { opacity: 1; }
.help-item.current strong { color: #ffc38f; }
.help-note { padding-top: 8px; border-top: 1px solid #ffffff2e; color: #9aa3b5; }
.sun[data-phase="day"] { background: #3b78c9; }
.sun[data-phase="civil"] { background: #6b4ea0; }
.sun[data-phase="nautical"] { background: #b35a1f; }
.sun[data-phase="astronomical"], .sun[data-phase="night"] { background: #1a2144; }
.places { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.sky-space { flex: 1; min-height: 0; }
.ground-note { margin: 0; padding: 8px 16px 14px; }
.pick-card { position: fixed; z-index: 95; pointer-events: auto; width: 260px; display: grid; gap: 8px; padding: 12px 14px; border: 1px solid #ffffff44; border-radius: 12px; background: #0b1020ee; backdrop-filter: blur(8px); }
.pick-card p { margin: 0; color: #c5cad6; font-size: 13px; }
.pick-card .detail { color: #ffd9a8; }
.bodies-note { color: #ffd9a8; }
.pick-card .primary { background: #2c4f8a; border-color: #6aa3ff; }
.pick-card .close { position: absolute; top: 4px; right: 6px; padding: 2px 8px; border: 0; background: transparent; }
</style>
