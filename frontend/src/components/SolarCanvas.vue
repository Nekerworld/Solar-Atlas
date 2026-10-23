<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { store } from "../data/store";
import { SolarScene } from "../scene/solarScene";
const emit = defineEmits(["loaded", "progress", "failed"]);
const host = ref();
const labels = ref();
let scene;
let unmounted = false;
onMounted(async () => {
  try {
    // Paint the loading screen before creating the WebGL context.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (unmounted) return;
    scene = new SolarScene(host.value, labels.value, () => { if (!unmounted) emit("loaded"); });
    await scene.load(stage => { if (!unmounted) emit("progress", stage); });
  } catch (error) {
    scene?.dispose();
    console.error("Solar scene initialization failed", error);
    if (!unmounted) emit("failed");
  }
});
watch(
  () => store.userSettings.actualScale,
  () => scene?.updateScale(),
);
watch(
  () => [store.userSettings.showOrbitPaths, store.userSettings.showDebugInfo, store.userSettings.categoryVisibility, store.userSettings.bodyVisibility],
  () => scene?.updateVisibility(),
  { deep: true },
);
watch(() => store.appSettings.zoomRequest, request => {
  if (request) scene?.setZoom(request.position);
});
onBeforeUnmount(() => { unmounted = true; scene?.dispose(); });
</script>

<template>
  <div
    ref="host"
    class="solar-viewport"
    aria-label="Solar system visualization"
  >
    <div ref="labels" class="body-labels"></div>
  </div>
</template>
