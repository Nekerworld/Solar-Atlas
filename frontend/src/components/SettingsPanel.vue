<script setup>
import { computed, onMounted, onBeforeUnmount } from "vue";
import { resetUserSettings, setSimulationSpeed, toggleSimulationPause, store } from "../data/store";
import { adjustSpeed, speedLabel, acceptsPauseShortcut } from "../utils/simulationControls";
const speed = computed(() => store.userSettings.timeSpeedModifier);
const label = computed(() => speedLabel(speed.value));
const paused = computed(() => speed.value === 0);
function reflectPointer(event) {
  const button=event.target.closest?.(".simulation-display-row button");
  if(!button || event.pointerType === "touch")return;
  const bounds=button.getBoundingClientRect();
  button.style.setProperty("--glass-x",`${Math.round(event.clientX-bounds.left)}px`);
  button.style.setProperty("--glass-y",`${Math.round(event.clientY-bounds.top)}px`);
}
function changeSpeed(direction) { setSimulationSpeed(adjustSpeed(speed.value,direction)); }
function pauseShortcut(event) {
  if (!acceptsPauseShortcut(event) || document.querySelector('dialog[open], [aria-modal="true"], .application-shell[inert]')) return;
  event.preventDefault();
  toggleSimulationPause();
}
onMounted(() => window.addEventListener("keydown",pauseShortcut));
onBeforeUnmount(() => window.removeEventListener("keydown",pauseShortcut));
</script>
<template>
  <aside class="simulation-controls" aria-label="시뮬레이션 조작" @pointerdown.stop @click.stop @wheel.stop>
    <div class="simulation-speed-row" role="group" aria-label="시뮬레이션 속도">
      <output class="simulation-speed-status" :class="{'is-paused':paused}" aria-live="polite" :aria-label="paused ? '현재 속도: 일시정지' : `현재 속도: ${label}`" :title="paused ? '일시정지 · 스페이스바로 재개' : `${label} · 스페이스바로 일시정지`">{{ label }}</output>
      <button type="button" class="speed-step" aria-label="시뮬레이션 속도 줄이기" title="속도 줄이기 · −0.05" :disabled="speed===0" @click="changeSpeed(-1)">−</button>
      <input id="simulation-speed" class="simulation-speed-slider" type="range" min="0" max="1000" step="1"
        aria-label="시뮬레이션 속도 조절" :aria-valuetext="paused ? '일시정지' : `${label}, 슬라이더 ${Math.round(speed*100)}%`"
        :value="speed*1000" :style="{'--range-progress':`${speed*100}%`}" @input="setSimulationSpeed(Number($event.target.value)/1000)" />
      <button type="button" class="speed-step" aria-label="시뮬레이션 속도 높이기" title="속도 높이기 · +0.05" :disabled="speed===1" @click="changeSpeed(1)">+</button>
    </div>
    <div class="simulation-display-row" role="group" aria-label="화면 표시 설정" @pointermove="reflectPointer">
      <button type="button" class="display-toggle" :class="{'is-active':store.userSettings.showLabels}" :aria-pressed="store.userSettings.showLabels" title="천체 이름표 표시·숨김" @click="store.userSettings.showLabels=!store.userSettings.showLabels">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M12 5v14M8 19h8"/></svg><span>라벨</span>
      </button>
      <button type="button" class="display-toggle" :class="{'is-active':store.userSettings.showOrbitPaths}" :aria-pressed="store.userSettings.showOrbitPaths" title="궤도선 표시·숨김" @click="store.userSettings.showOrbitPaths=!store.userSettings.showOrbitPaths">
        <svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-35 12 12)"/><circle cx="12" cy="12" r="1.4"/></svg><span>궤도</span>
      </button>
      <button type="button" class="display-toggle" :aria-pressed="store.userSettings.actualScale" aria-label="실제 크기" :class="{'is-active':store.userSettings.actualScale}" :title="store.userSettings.actualScale ? '실제 크기 모드 · 끄면 탐색 모드' : '탐색 모드 · 켜면 실제 크기'" @click="store.userSettings.actualScale=!store.userSettings.actualScale">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5M9 12h6M12 9v6"/></svg><span>실제 크기</span>
      </button>
      <button type="button" class="display-reset" aria-label="설정 초기화" title="기존 Reset settings와 동일하게 모든 시뮬레이션 설정 초기화" @click="resetUserSettings">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10a8 8 0 1 1 2 8M4 4v6h6"/></svg><span>리셋</span>
      </button>
    </div>
  </aside>
</template>
<style scoped>
.simulation-controls { --control-radius:18px;--control-border:1px;--option-padding:7px;position:fixed;top:18px;right:20px;width:300px;max-width:calc(100vw - 40px);z-index:30;display:grid;gap:9px;color:#c1c2ce; }
.simulation-speed-row,.simulation-display-row { display:grid;align-items:center;gap:8px;padding:9px;background:transparent;border:var(--control-border) solid #ffffff75;border-radius:var(--control-radius);backdrop-filter:blur(5px); }
.simulation-speed-row { grid-template-columns:44px 28px minmax(0,1fr) 28px;min-height:48px; }
.simulation-speed-status { display:grid;place-items:center;height:28px;border-radius:7px;background:#fd7e1418;color:#ffc38f;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;user-select:none; }
.simulation-speed-status.is-paused { background:#ffffff0b;color:#b4b7c5; }
.speed-step { display:grid;place-items:center;width:28px;height:28px;border:1px solid #ffffff16;border-radius:7px;background:#ffffff06;color:#d7d9e2;font-size:19px;line-height:1; }
.speed-step:hover:enabled { color:#ffc38f;background:#fd7e1418;border-color:#fd7e1440; }
.speed-step:disabled { opacity:.3; }
.simulation-speed-slider { appearance:none;min-width:0;width:100%;height:5px;margin:0;border-radius:5px;background:linear-gradient(to right,#fd7e14 var(--range-progress),#373a40 var(--range-progress));cursor:pointer;touch-action:pan-y; }
.simulation-speed-slider::-webkit-slider-thumb { appearance:none;width:15px;height:15px;border:2px solid #fd7e14;background:#f3e9df;border-radius:50%; }
.simulation-speed-slider::-moz-range-thumb { width:11px;height:11px;border:2px solid #fd7e14;background:#f3e9df;border-radius:50%; }
.simulation-display-row { grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;padding:var(--option-padding); }
/* Each option owns a glass layer; independent toggles never share a moving pill. */
.simulation-display-row button { position:relative;isolation:isolate;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;min-width:0;height:52px;border:1px solid #ffffff08;border-radius:calc(var(--control-radius) - var(--option-padding) - var(--control-border));background:#ffffff03;color:#818899;font-size:10px;white-space:nowrap;transform:scale(1);transition:transform 360ms cubic-bezier(.2,1.55,.4,1),color 240ms ease,border-color 280ms ease,box-shadow 280ms ease; }
.simulation-display-row button>svg,.simulation-display-row button>span { position:relative;z-index:2;pointer-events:none; }
.simulation-display-row button::before,.simulation-display-row button::after { content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none; }
/* Selection fills upward, then fades gently when deselected. No animated blur. */
.simulation-display-row button::before { z-index:0;background:#eeeff4;box-shadow:inset 0 1px 0 #ffffff80;opacity:0;transform:translateY(13%) scaleY(.8);transform-origin:center bottom;transition:opacity 280ms ease,transform 400ms cubic-bezier(.2,.8,.2,1); }
/* Reflection follows the pointer within this small control only. */
.simulation-display-row button::after { z-index:1;border:1px solid #ffffff30;background:radial-gradient(ellipse 70px 40px at var(--glass-x,50%) var(--glass-y,0px),#ffffff35,transparent 78%);opacity:0;transition:opacity 220ms ease; }
.simulation-display-row svg { width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round; }
.simulation-display-row .display-toggle.is-active { color:#171a22;border-color:#eeeff4;box-shadow:0 3px 10px #0003; }
.simulation-display-row .display-toggle.is-active::before { opacity:1;transform:translateY(0) scaleY(1); }
.simulation-display-row button:focus-visible::after { opacity:.8; }
.simulation-display-row button:active { transform:scale(.94);transition:transform 70ms ease-out,color 140ms ease,border-color 140ms ease,box-shadow 140ms ease; }
.simulation-display-row button:active::after { opacity:1;transition:opacity 60ms ease; }
.simulation-display-row .display-reset { color:#a1a7b5; }
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
@media(max-width:1250px) { .simulation-controls { top:174px; } }
@media(max-width:700px) { .simulation-controls { top:174px;right:12px;width:270px;max-width:calc(100vw - 80px);gap:7px; }.simulation-display-row button { height:46px; } }
</style>
