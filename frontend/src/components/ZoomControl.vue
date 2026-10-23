<script setup>
import { computed } from "vue";
import { store } from "../data/store";
import { zoomPosition, zoomDistance } from "../scene/zoomScale";
const position = computed(() => zoomPosition(store.appSettings.cameraDistance,
  store.appSettings.zoomMinDistance, store.appSettings.zoomMaxDistance));
// Four evenly spaced logarithmic landmarks, not visibility/category toggles.
const stops = [
  { position:0, label:"근접 관찰", icon:"artifact" },
  { position:1/3, label:"위성 관찰 범위", icon:"moon" },
  { position:2/3, label:"행성계 관찰 범위", icon:"planet" },
  { position:1, label:"넓은 태양계 시야", icon:"sun" },
];
const paths = {
  artifact:["m9 8 7 7-3 3-7-7z","m3 2 4 4-3 3-4-4z","m18 15 5 5-3 3-5-5z","m16 4 4-2-2 4-3 1-1 3-2-2 3-1z"],
  moon:["M20 15.1A8.5 8.5 0 0 1 8.9 4a8.5 8.5 0 1 0 11.1 11.1Z"],
  planet:["M17.9 9a6.5 6.5 0 0 0-12.1 4.7","M6.1 15a6.5 6.5 0 0 0 12.1-4.7","M3 15.8c-4.1-.3.4-4.7 7.4-7.3S24 5.8 21 9.4c-2.4 2.8-8.9 6-14.1 6.6-1.7.2-3 .1-3.9-.2Z"],
  sun:["M12 1v3m0 16v3M1 12h3m16 0h3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1","M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z"],
};
function setZoom(value) {
  store.appSettings.zoomRequest = { position:value };
}
const distanceLabel = computed(() => store.userSettings.actualScale
  ? `${store.appSettings.cameraDistance.toLocaleString("ko-KR",{maximumFractionDigits:2})} km`
  : "관찰 거리");
function stopTitle(stop) {
  if (!store.userSettings.actualScale) return stop.label;
  const distance=zoomDistance(stop.position,store.appSettings.zoomMinDistance,store.appSettings.zoomMaxDistance);
  return `${stop.label} · ${distance.toLocaleString("ko-KR",{maximumFractionDigits:1})} km`;
}
</script>

<template>
  <aside class="zoom-control" aria-label="확대 및 축소" @pointerdown.stop @click.stop @wheel.stop>
    <span class="zoom-caption" aria-hidden="true"></span>
    <div class="zoom-rail">
      <div class="zoom-ticks" aria-hidden="true"></div>
      <div class="zoom-track" aria-hidden="true"><span :style="{height:`${position*100}%`}"></span></div>
      <input type="range" class="zoom-input" min="0" max="1000" step="1"
        :value="Math.round(position*1000)" aria-label="관찰 거리: 위로 확대, 아래로 축소" aria-orientation="vertical"
        :title="distanceLabel" :aria-valuetext="`${Math.round((1-position)*100)}% 확대 · ${distanceLabel}`" :disabled="store.appSettings.focusingBody"
        @input="setZoom(Number($event.target.value)/1000)" />
      <button v-for="stop in stops" :key="stop.icon" class="zoom-landmark"
        :style="{top:`${stop.position*100}%`}" :title="stopTitle(stop)" :aria-label="stopTitle(stop)"
        :disabled="store.appSettings.focusingBody" @click="setZoom(stop.position)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path v-for="path in paths[stop.icon]" :key="path" :d="path" />
        </svg>
      </button>
    </div>
    <span class="zoom-direction" aria-hidden="true">−</span>
  </aside>
</template>
