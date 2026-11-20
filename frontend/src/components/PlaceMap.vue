<script setup>
import { computed, onMounted, ref } from "vue";
import { requestUserLocation, userLocation } from "../data/userLocation";
import { EMBED_KEY, TRAVEL_MODES, embedDirectionsUrl, embedPlaceUrl, hasCoordinates, openMapsUrl } from "../planner/maps";

const props = defineProps({ plan: { type: Object, required: true } });

const wanted = ref("place");
const mode = ref("driving");

// 길찾기는 브라우저가 실제로 알려 준 위치(status ok)가 있을 때만 켠다. 거부·실패 때 서울 기본값으로 대신하지 않는다.
const located = computed(() => userLocation.status === "ok" && Number.isFinite(userLocation.latitude));
const origin = computed(() => (located.value ? { latitude: userLocation.latitude, longitude: userLocation.longitude } : null));
const pending = computed(() => userLocation.status === "pending");

const placeUrl = computed(() => embedPlaceUrl(props.plan));
const routeUrl = computed(() => embedDirectionsUrl(props.plan, origin.value, mode.value));
// 위치를 잃으면(다시 가져오다 실패 등) 길찾기는 저절로 위치 보기로 돌아간다.
const view = computed(() => (wanted.value === "route" && located.value ? "route" : "place"));
const src = computed(() => (view.value === "route" ? routeUrl.value : placeUrl.value));
const link = computed(() => openMapsUrl(props.plan));
const noPlace = computed(() => !props.plan.place_id && !hasCoordinates(props.plan) && !String(props.plan.place_name || "").trim());

const routeNote = computed(() => {
  if (located.value) return "";
  if (pending.value) return "내 현재 위치를 가져오는 중입니다. 브라우저의 위치 권한 요청을 허용해 주세요.";
  return "내 현재 위치를 받지 못해 길찾기를 쓸 수 없습니다. 브라우저의 위치 권한을 허용한 뒤 다시 가져와 주세요.";
});

function choose(next) {
  if (next === "route" && !located.value) return;
  wanted.value = next;
}

async function retry() {
  await requestUserLocation({ force: true });
}

onMounted(() => requestUserLocation());
</script>

<template>
  <section class="place-map" aria-label="장소 지도">
    <header class="head">
      <h2>{{ plan.place_name }}</h2>
      <p v-if="hasCoordinates(plan)" class="coords">위도 {{ Number(plan.latitude).toFixed(5) }} · 경도 {{ Number(plan.longitude).toFixed(5) }}</p>
      <p v-else class="coords">저장된 좌표가 없어 장소 이름으로 찾습니다.</p>
    </header>
    <div class="tabs" role="group" aria-label="지도 보기">
      <button type="button" :class="{ current: view === 'place' }" :aria-pressed="view === 'place'" @click="choose('place')">위치</button>
      <button
        type="button"
        :class="{ current: view === 'route' }"
        :aria-pressed="view === 'route'"
        :disabled="!located"
        :title="located ? '' : routeNote"
        @click="choose('route')"
      >길찾기</button>
      <span v-if="view === 'route'" class="modes" role="group" aria-label="이동 수단">
        <button v-for="item in TRAVEL_MODES" :key="item.id" type="button" :class="{ current: mode === item.id }" :aria-pressed="mode === item.id" @click="mode = item.id">{{ item.label }}</button>
      </span>
    </div>
    <p v-if="!located" class="hint" role="status">
      {{ routeNote }}
      <button type="button" class="text" :disabled="pending" @click="retry">내 위치 다시 가져오기</button>
    </p>
    <p v-else-if="view === 'route'" class="hint">출발지는 내 현재 위치입니다.</p>
    <iframe
      v-if="src"
      :key="src"
      class="frame"
      :src="src"
      :title="view === 'route' ? `내 위치에서 ${plan.place_name}까지 길찾기` : `${plan.place_name} 위치`"
      loading="lazy"
      allowfullscreen
      referrerpolicy="no-referrer-when-downgrade"
    ></iframe>
    <p v-else-if="noPlace" class="empty">지도에 표시할 장소가 없습니다.</p>
    <p v-else-if="!EMBED_KEY" class="empty">
      지도 임베드 키(VITE_GOOGLE_MAPS_EMBED_KEY)가 설정되지 않아 지도를 표시하지 못합니다.
    </p>
    <p v-if="link" class="open"><a :href="link" target="_blank" rel="noopener noreferrer">Google 지도에서 열기</a></p>
  </section>
</template>

<style scoped>
.place-map { display: flex; flex-direction: column; gap: 10px; height: 100%; min-height: 0; padding: 20px 28px 16px; }
.head h2 { margin: 0; font-size: 18px; font-weight: 600; color: #fff; }
.coords { margin: 4px 0 0; color: #8b919e; font-size: 12px; }
.tabs { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.tabs > button, .modes button { padding: 5px 14px; border: 1px solid #ffffff24; border-radius: 999px; background: transparent; color: #c5cad6; font: inherit; font-size: 13px; cursor: pointer; }
.tabs > button:hover:enabled, .modes button:hover { background: #ffffff14; color: #fff; }
.tabs button.current { border-color: #fd7e14; background: #fd7e1418; color: #fff; }
.tabs > button:disabled { opacity: 0.4; cursor: not-allowed; }
.modes { display: inline-flex; gap: 6px; margin-left: 8px; padding-left: 12px; border-left: 1px solid #ffffff1f; }
.hint { margin: 0; color: #9aa3b5; font-size: 12px; line-height: 1.55; }
.text { border: 0; background: none; padding: 0 0 0 8px; color: #fd7e14; font: inherit; cursor: pointer; }
.text:disabled { color: #8b919e; cursor: default; }
.frame { flex: 1; min-height: 280px; width: 100%; border: 0; border-radius: 12px; background: #11151f; }
.empty { margin: 0; padding: 18px; border: 1px dashed #ffffff24; border-radius: 12px; color: #9aa3b5; font-size: 13px; }
.open { margin: 0; font-size: 12px; }
.open a { color: #9aa3b5; }
</style>
