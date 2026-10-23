<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import RocketIcon from "./RocketIcon.vue";

const props = defineProps({ state: String, panelOpen: Boolean, message: String });
const layer = ref(), carrier = ref();
const phase = ref("idle"), exitStart = ref("0px");
const waiting = computed(() => props.state === "pending");
let timer;
function stop() { clearTimeout(timer); phase.value = "idle"; }
function reducedMotion() { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
watch(() => [props.state, props.panelOpen], ([state, open], previous = []) => {
  const [oldState] = previous;
  if (!open) return stop();
  if (state === "pending") {
    if (phase.value === "idle") phase.value = reducedMotion() ? "cruising" : "entering";
    return;
  }
  if (oldState === "pending" && state === "completed" && carrier.value && !reducedMotion()) {
    // Capture the actual position, including during entry. Fast replies never
    // jump the ship to the centre or delay the answer. No external overlay.
    exitStart.value = `${carrier.value.getBoundingClientRect().left - layer.value.getBoundingClientRect().left}px`;
    phase.value = "departing";
    timer = setTimeout(stop, 650);
  } else stop();
}, { immediate: true });
function entered(event) {
  if (event.target === carrier.value && phase.value === "entering") phase.value = "cruising";
}
onBeforeUnmount(stop);
</script>

<template>
  <div v-if="phase !== 'idle'" ref="layer" class="atlas-flight-layer" :class="phase"
       :style="{'--exit-start':exitStart}" aria-hidden="true">
    <div class="atlas-starfield"><span class="atlas-stars"></span><span class="atlas-stars atlas-stars-distant"></span></div>
    <div ref="carrier" class="atlas-ship-carrier" @animationend="entered">
      <div class="atlas-ship-drift"><span class="atlas-engine-trail"></span><RocketIcon class="atlas-spaceship" /></div>
    </div>
  </div>
  <p v-if="waiting && panelOpen" class="atlas-flight-status" role="status">{{ message || "답변을 준비하고 있어요…" }}</p>
</template>

<style scoped>
.atlas-flight-layer{position:absolute;inset:0;z-index:0;overflow:hidden;border-radius:inherit;pointer-events:none;}
.atlas-starfield{position:absolute;inset:0;opacity:.65;transition:opacity .4s ease;mask-image:linear-gradient(transparent,#000 22%,#000 85%,transparent);}
.atlas-stars{position:absolute;inset:0 -180px 0 0;background-image:radial-gradient(circle,#fff9 .8px,transparent 1.3px),radial-gradient(circle,#fffc 1px,transparent 1.5px);background-size:90px 67px,180px 113px;background-position:23px 19px,112px 51px;animation:atlas-star-drift 5s linear infinite;}
.atlas-stars-distant{opacity:.35;background-size:90px 101px,180px 73px;background-position:63px 49px,9px 6px;animation-duration:10s;}
.atlas-ship-carrier{position:absolute;left:calc(50% - 40px);top:50%;margin-top:-20px;width:80px;height:40px;will-change:left;}
.entering .atlas-ship-carrier{animation:atlas-enter 1.8s cubic-bezier(.2,.5,.25,1) both;}
.departing .atlas-ship-carrier{animation:atlas-horizontal-exit .65s cubic-bezier(.55,0,.9,.4) both;}
.atlas-ship-drift{position:relative;width:100%;height:100%;}
.cruising .atlas-ship-drift{animation:atlas-cruise 3.6s ease-in-out infinite;}
.atlas-spaceship{position:relative;display:block;width:80px;height:40px;filter:drop-shadow(0 0 8px #ffffff0a);}
.atlas-spaceship :deep(.rocket-flame){transform-origin:23px 20px;animation:atlas-thrust .6s ease-in-out infinite alternate;}
.atlas-engine-trail{position:absolute;right:calc(100% - 24px);top:18px;width:82px;height:4px;background:linear-gradient(90deg,transparent,#fd7e1444,#ffd2a5aa);filter:blur(1px);opacity:.65;}
.departing .atlas-engine-trail{width:145px;opacity:1;transition:width .15s ease;}
.departing .atlas-spaceship :deep(.rocket-flame){animation:none;transform:scaleX(1.6);}
.departing .atlas-starfield{opacity:0;transition-delay:.25s;}
.atlas-flight-status{position:absolute;z-index:2;left:18px;right:18px;bottom:9px;margin:0;text-align:center;font-size:11px;line-height:1.6;color:#aeb9c9;pointer-events:none;}
@keyframes atlas-enter{from{left:-100px}to{left:calc(50% - 40px)}}
@keyframes atlas-horizontal-exit{from{left:var(--exit-start)}to{left:calc(100% + 160px)}}
@keyframes atlas-star-drift{to{transform:translateX(-180px)}}
@keyframes atlas-cruise{0%,100%{transform:translate(0,0)}25%{transform:translate(2px,-2px)}50%{transform:translate(-1px,1px)}75%{transform:translate(-2px,-1px)}}
@keyframes atlas-thrust{to{transform:scaleX(.8);opacity:.75}}
@media(max-width:700px){.atlas-flight-status{left:12px;right:12px;font-size:10px}}
@media(prefers-reduced-motion:reduce){.atlas-stars,.atlas-ship-carrier,.atlas-ship-drift,.atlas-spaceship :deep(.rocket-flame){animation:none!important}.atlas-starfield{transition:none}}
</style>
