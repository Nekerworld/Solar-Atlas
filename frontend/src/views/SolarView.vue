<script setup>
import { computed, defineAsyncComponent, onMounted, ref, watch } from "vue";
import SolarCanvas from "../components/SolarCanvas.vue";
import SettingsPanel from "../components/SettingsPanel.vue";
import LoadingScreen from "../components/LoadingScreen.vue";
import BodyPicker from "../components/BodyPicker.vue";
import GroundLauncher from "../components/GroundLauncher.vue";
import ZoomControl from "../components/ZoomControl.vue";
import InfoPanel from "../components/InfoPanel.vue";
import { store } from "../data/store";
import { preloadAtlas } from "../scene/atlasSky";

const atlasEnabled = import.meta.env.VITE_ENABLE_ATLAS === "true";
const ChatDock = atlasEnabled
  ? defineAsyncComponent(() => import("../components/ChatDock.vue"))
  : null;
const loading = ref(true);
const revealing = ref(true);
const solarStage = ref("textures");
const solarLoaded = ref(false);
// 지상 모드의 천구(천구 엔진)도 맨 처음 로딩에서 함께 준비한다. 준비하지 못해도 앱은 열린다.
const skyReady = ref(false);
const stage = computed(() => (solarStage.value === "frame" && !skyReady.value ? "sky" : solarStage.value));
const error = ref(false);
const attempt = ref(0);
const shell = ref();
// 캐시 때문에 준비가 한 프레임 만에 끝나도 로딩 화면이 지나가게 두지 않는다.
const MIN_LOADING_MS = 1200;
let loadingStarted = performance.now();
let loadingToken = 0;
function retry() {
  error.value = false;
  loading.value = true;
  revealing.value = true;
  solarStage.value = "textures";
  solarLoaded.value = false;
  loadingStarted = performance.now();
  attempt.value++;
  loadSky();
}
function loadSky() {
  skyReady.value = false;
  preloadAtlas().then(() => { skyReady.value = true; });
}
watch([solarLoaded, skyReady], ([solar, sky]) => {
  if (!(solar && sky)) return;
  const token = ++loadingToken;
  const wait = Math.max(0, MIN_LOADING_MS - (performance.now() - loadingStarted));
  setTimeout(() => {
    if (token === loadingToken && solarLoaded.value && skyReady.value) loading.value = false;
  }, wait);
});
onMounted(loadSky);
function reveal() { revealing.value = false; shell.value?.focus({ preventScroll: true }); }
const distance = computed(() => store.appSettings.cameraDistance.toLocaleString(undefined, { maximumFractionDigits: 0 }));
</script>

<template>
  <div ref="shell" class="application-shell" tabindex="-1" :inert="loading || revealing" :aria-busy="loading">
    <SolarCanvas :key="attempt" @loaded="solarLoaded = true" @progress="solarStage = $event" @failed="error = true" />
    <template v-if="!loading">
      <div v-if="store.userSettings.actualScale" class="distance-card"
        :style="{ left: store.userSettings.showDebugInfo ? '85px' : '6px' }">{{ distance }} km</div>
      <SettingsPanel />
      <ZoomControl />
      <InfoPanel />
      <BodyPicker />
      <GroundLauncher />
      <ChatDock v-if="atlasEnabled" />
    </template>
  </div>
  <Transition name="launch" @after-leave="reveal">
    <LoadingScreen v-if="loading" :stage="stage" :error="error" @retry="retry" />
  </Transition>
</template>
