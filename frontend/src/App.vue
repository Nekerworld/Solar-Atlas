<script setup>
import { computed, defineAsyncComponent, ref } from "vue";
import SolarCanvas from "./components/SolarCanvas.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import LoadingScreen from "./components/LoadingScreen.vue";
// Keep backend-dependent chat unmounted in the default static deployment.
const atlasEnabled = import.meta.env.VITE_ENABLE_ATLAS === "true";
const ChatDock = atlasEnabled
  ? defineAsyncComponent(() => import("./components/ChatDock.vue"))
  : null;
import BodyPicker from "./components/BodyPicker.vue";
import ZoomControl from "./components/ZoomControl.vue";
import InfoPanel from "./components/InfoPanel.vue";
import { store } from "./data/store";
const loading = ref(true);
const revealing = ref(true);
const stage = ref("textures");
const error = ref(false);
const attempt = ref(0);
const shell = ref();
function retry() {
  error.value = false;
  loading.value = true;
  revealing.value = true;
  stage.value = "textures";
  attempt.value++;
}
function reveal() { revealing.value = false; shell.value?.focus({preventScroll:true}); }
const distance = computed(() => store.appSettings.cameraDistance.toLocaleString(undefined, {maximumFractionDigits:0}));
</script>

<template>
  <div ref="shell" class="application-shell" tabindex="-1" :inert="loading || revealing" :aria-busy="loading">
    <SolarCanvas :key="attempt" @loaded="loading = false" @progress="stage = $event" @failed="error = true" />
    <template v-if="!loading">
      <div v-if="store.userSettings.actualScale" class="distance-card"
        :style="{ left: store.userSettings.showDebugInfo ? '85px' : '6px' }">{{ distance }} km</div>
      <SettingsPanel />
      <ZoomControl />
      <InfoPanel />
      <BodyPicker />
      <ChatDock v-if="atlasEnabled" />
    </template>
  </div>
  <Transition name="launch" @after-leave="reveal">
    <LoadingScreen v-if="loading" :stage="stage" :error="error" @retry="retry" />
  </Transition>
</template>
