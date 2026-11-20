<script setup>
import { computed, onBeforeUnmount, onMounted } from "vue";
import { acceptsPauseShortcut } from "../utils/simulationControls";
import { clampSpeedStep, SKY_SPEEDS } from "../utils/skySpeed";
import { onAtlasKey, resetSkySettings, setSkySetting, skySettings } from "../scene/atlasSky";
import { resetSkyVisibility } from "../scene/skyVisibility";

// 태양계 화면의 SettingsPanel(속도 슬라이더 + 표시 토글)과 같은 모양의 천구용 조작부.
const props = defineProps({ modelValue: { type: Number, default: 0 } });
const emit = defineEmits(["update:modelValue", "reset"]);
const step = computed(() => clampSpeedStep(props.modelValue));
const current = computed(() => SKY_SPEEDS[step.value]);
const paused = computed(() => step.value === 0);
let resumeStep = 2;

function setStep(value) {
  const next = clampSpeedStep(value);
  if (next > 0) resumeStep = next;
  emit("update:modelValue", next);
}
function togglePause() { setStep(paused.value ? resumeStep : 0); }
function reset() {
  resetSkySettings();
  resetSkyVisibility();
  setStep(0);
  emit("reset");
}
function reflectPointer(event) {
  const button = event.target.closest?.(".simulation-display-row button");
  if (!button || event.pointerType === "touch") return;
  const bounds = button.getBoundingClientRect();
  button.style.setProperty("--glass-x", `${Math.round(event.clientX - bounds.left)}px`);
  button.style.setProperty("--glass-y", `${Math.round(event.clientY - bounds.top)}px`);
}
function pauseShortcut(event) {
  if (!acceptsPauseShortcut(event)) return;
  event.preventDefault();
  togglePause();
}
let stopKey;
onMounted(() => {
  window.addEventListener("keydown", pauseShortcut);
  // 천구(iframe)에 초점이 있을 때의 스페이스바
  stopKey = onAtlasKey(({ code }) => { if (code === "Space") togglePause(); });
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", pauseShortcut);
  stopKey?.();
});

const toggles = [
  { key: "labels", label: "라벨", title: "천체 이름표 표시·숨김", icon: ["M4 5h16M12 5v14M8 19h8"] },
  { key: "orbits", label: "궤도", title: "궤도선 표시·숨김", icon: ["M2 12a10 5 0 1 0 20 0 10 5 0 1 0-20 0", "M12 12h.01"] },
  { key: "asterisms", label: "별자리", title: "별자리선 표시·숨김", icon: ["M4 18 9 9l5 6 6-10", "M4 18h.01M9 9h.01M14 15h.01M20 5h.01"] },
  { key: "clouds", label: "구름", title: "구름 표시·숨김", icon: ["M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7Z"] },
  { key: "grid", label: "격자", title: "적도 좌표격자 표시·숨김", icon: ["M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0", "M3 12h18M12 3v18M5.5 6.5q6.5 3 13 0M5.5 17.5q6.5-3 13 0"] },
];
</script>

<template>
  <aside class="simulation-controls" aria-label="천구 조작" @pointerdown.stop @click.stop @wheel.stop>
    <div class="simulation-speed-row" role="group" aria-label="시간 속도">
      <output class="simulation-speed-status" :class="{'is-paused':paused}" aria-live="polite" :aria-label="paused ? '현재 속도: 일시정지' : `현재 속도: ${current.name}`" :title="paused ? '일시정지 · 스페이스바로 재개' : `${current.name} · 스페이스바로 일시정지`">{{ current.label }}</output>
      <button type="button" class="speed-step" aria-label="시간 속도 줄이기" title="속도 줄이기" :disabled="step===0" @click="setStep(step-1)">−</button>
      <input class="simulation-speed-slider" type="range" min="0" :max="SKY_SPEEDS.length-1" step="1"
        aria-label="시간 속도 조절" :aria-valuetext="current.name" :value="step"
        :style="{'--range-progress':`${step/(SKY_SPEEDS.length-1)*100}%`}" @input="setStep(Number($event.target.value))" />
      <button type="button" class="speed-step" aria-label="시간 속도 높이기" title="속도 높이기" :disabled="step===SKY_SPEEDS.length-1" @click="setStep(step+1)">+</button>
    </div>
    <div class="simulation-display-row" role="group" aria-label="화면 표시 설정" @pointermove="reflectPointer">
      <button v-for="item in toggles" :key="item.key" type="button" class="display-toggle" :class="{'is-active':skySettings[item.key]}" :aria-pressed="skySettings[item.key]" :title="item.title" @click="setSkySetting(item.key, !skySettings[item.key])">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path v-for="path in item.icon" :key="path" :d="path"/></svg><span>{{ item.label }}</span>
      </button>
      <button type="button" class="display-reset" aria-label="설정 초기화" title="천구 표시 설정과 시간 속도를 처음 상태로" @click="reset">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10a8 8 0 1 1 2 8M4 4v6h6"/></svg><span>리셋</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
/* SettingsPanel(태양계)의 디자인 그대로. 항목이 6개라 3열 2줄로 두고, 밝은 낮하늘에서도 읽히도록 바탕만 살짝 어둡게 깐다. */
.simulation-controls { --control-radius:18px;--control-border:1px;--option-padding:7px;position:fixed;top:18px;right:20px;width:300px;max-width:calc(100vw - 40px);z-index:90;display:grid;gap:9px;color:#c1c2ce;pointer-events:auto; }
.simulation-speed-row,.simulation-display-row { display:grid;align-items:center;gap:8px;padding:9px;background:#0b0e1659;border:var(--control-border) solid #ffffff75;border-radius:var(--control-radius);backdrop-filter:blur(5px); }
.simulation-speed-row { grid-template-columns:66px 28px minmax(0,1fr) 28px;min-height:48px; }
.simulation-speed-status { display:grid;place-items:center;height:28px;border-radius:7px;background:#fd7e1418;color:#ffc38f;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;user-select:none;white-space:nowrap; }
.simulation-speed-status.is-paused { background:#ffffff0b;color:#b4b7c5; }
.speed-step { display:grid;place-items:center;width:28px;height:28px;border:1px solid #ffffff16;border-radius:7px;background:#ffffff06;color:#d7d9e2;font-size:19px;line-height:1;padding:0; }
.speed-step:hover:enabled { color:#ffc38f;background:#fd7e1418;border-color:#fd7e1440; }
.speed-step:disabled { opacity:.3; }
.simulation-speed-slider { appearance:none;min-width:0;width:100%;height:5px;margin:0;padding:0;border:0;border-radius:5px;background:linear-gradient(to right,#fd7e14 var(--range-progress),#373a40 var(--range-progress));cursor:pointer;touch-action:pan-y; }
.simulation-speed-slider::-webkit-slider-thumb { appearance:none;width:15px;height:15px;border:2px solid #fd7e14;background:#f3e9df;border-radius:50%; }
.simulation-speed-slider::-moz-range-thumb { width:11px;height:11px;border:2px solid #fd7e14;background:#f3e9df;border-radius:50%; }
.simulation-display-row { grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding:var(--option-padding); }
.simulation-display-row button { position:relative;isolation:isolate;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;min-width:0;height:52px;border:1px solid #ffffff08;border-radius:calc(var(--control-radius) - var(--option-padding) - var(--control-border));background:#ffffff03;color:#a3a9b8;font-size:10px;white-space:nowrap;transform:scale(1);transition:transform 360ms cubic-bezier(.2,1.55,.4,1),color 240ms ease,border-color 280ms ease,box-shadow 280ms ease; }
.simulation-display-row button>svg,.simulation-display-row button>span { position:relative;z-index:2;pointer-events:none; }
.simulation-display-row button::before,.simulation-display-row button::after { content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none; }
.simulation-display-row button::before { z-index:0;background:#eeeff4;box-shadow:inset 0 1px 0 #ffffff80;opacity:0;transform:translateY(13%) scaleY(.8);transform-origin:center bottom;transition:opacity 280ms ease,transform 400ms cubic-bezier(.2,.8,.2,1); }
.simulation-display-row button::after { z-index:1;border:1px solid #ffffff30;background:radial-gradient(ellipse 70px 40px at var(--glass-x,50%) var(--glass-y,0px),#ffffff35,transparent 78%);opacity:0;transition:opacity 220ms ease; }
.simulation-display-row svg { width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round; }
.simulation-display-row .display-toggle.is-active { color:#171a22;border-color:#eeeff4;box-shadow:0 3px 10px #0003; }
.simulation-display-row .display-toggle.is-active::before { opacity:1;transform:translateY(0) scaleY(1); }
.simulation-display-row button:focus-visible::after { opacity:.8; }
.simulation-display-row button:active { transform:scale(.94);transition:transform 70ms ease-out,color 140ms ease,border-color 140ms ease,box-shadow 140ms ease; }
.simulation-display-row button:active::after { opacity:1;transition:opacity 60ms ease; }
.simulation-display-row .display-reset { color:#c1c5d1; }
.simulation-display-row .display-reset:active { color:#ffc38f;border-color:#fd7e1455; }
@media(hover:hover) and (pointer:fine) {
  .simulation-display-row button:hover { color:#e4dfd8;border-color:#ffffff45; }
  .simulation-display-row button:hover::after { opacity:.75; }
  .simulation-display-row .display-toggle.is-active:hover { color:#171a22;border-color:#ffffff; }
  .simulation-display-row .display-reset:hover { color:#ffc38f; }
}
@media(prefers-reduced-motion:reduce) {
  .simulation-display-row button,.simulation-display-row button::before,.simulation-display-row button::after { transition:none; }
  .simulation-display-row button:active,.simulation-display-row button::before { transform:none; }
}
.simulation-controls button:focus-visible,.simulation-speed-slider:focus-visible { outline:2px solid #fd7e14;outline-offset:3px; }
@media(max-width:700px) { .simulation-controls { top:174px;right:12px;width:270px;max-width:calc(100vw - 80px);gap:7px; }.simulation-display-row button { height:46px; } }
</style>
