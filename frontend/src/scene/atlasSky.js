// 지상 모드의 천구: 천구 엔진 엔진(frontend/sky, 별도 번들)을 iframe으로 올려 제어한다.
//
// Solar Atlas를 처음 열 때 preloadAtlas()가 iframe을 로딩 화면 뒤에 만들고, 지구 위에서 첫 하늘을
// 그릴 수 있을 때까지(구름의 첫 장까지) 모든 로딩을 그때 끝낸다. 끝나면 iframe은 다시 숨긴다.
// 이후 지상 모드는 이 iframe을 보여 주기만 한다. 앱 쪽 three(0.140)와 천구 엔진의 three는 섞이지 않는다.

import { reactive } from "vue";

const FRAME_URL = `${import.meta.env.BASE_URL}sky/ground.html`;
// 엔진이 첫 신호(engine)도 보내지 않으면 번들이 없는 것으로 본다.
const BOOT_SIGNAL_MS = 5000;
const READY_TIMEOUT_MS = 120000;

const HIDDEN = "position:fixed;inset:0;width:100%;height:100%;border:0;opacity:0;pointer-events:none;z-index:-1;";
const SHOWN = "position:fixed;inset:0;width:100%;height:100%;border:0;opacity:1;pointer-events:auto;z-index:70;";
// 준비 중에는 로딩 화면(z-index 200) 뒤에서 실제 크기로 그린다. 투명하게 숨기면 브라우저가 프레임을 건너뛰어 구름이 만들어지지 않는다.
const WARM = "position:fixed;inset:0;width:100%;height:100%;border:0;opacity:1;pointer-events:none;z-index:1;";

let frame = null;
let loading = null;
let ready = false;
let lastView = null;
let lastClock = 0;
// 소천체 표(skyBodies.js가 보낸 것)와 지금까지 받은 궤도선. 천구가 준비되면(또 다시 보일 때) 다시 보낸다.
let lastBodies = null;
// 숨길 분류·천체(skyVisibility.js가 보낸 것)
let lastVisibility = null;
const lastOrbits = new Map();
const orbitRequestListeners = new Set();
const gazeListeners = new Set();
const timeListeners = new Set();
const pickListeners = new Set();
const keyListeners = new Set();

// 지상 천구의 표시 설정(태양계 화면과는 따로 가진다). 천구가 준비되기 전에 바꿔도 준비되면 그대로 적용한다.
export const SKY_SETTING_DEFAULTS = Object.freeze({ labels: true, orbits: false, asterisms: true, clouds: true, grid: false });
export const skySettings = reactive({ ...SKY_SETTING_DEFAULTS });
// 천구 엔진의 설정 문자: p 행성 이름표, l 별 이름표, o 궤도, a 별자리선, i 지구 구름, e 적도 좌표격자.
function settingLetters() {
  return { p: skySettings.labels, l: skySettings.labels, o: skySettings.orbits, a: skySettings.asterisms,
    i: skySettings.clouds, e: skySettings.grid, x: false };
}
function postSettings() {
  post({ type: "atlas:settings", settings: settingLetters() });
}

function post(message) {
  frame?.contentWindow?.postMessage(message, window.location.origin);
}

function onMessage(event) {
  if (!frame || event.source !== frame.contentWindow || event.origin !== window.location.origin) return;
  if (event.data?.type === "atlas:gaze") {
    for (const listener of gazeListeners) listener(event.data);
  } else if (event.data?.type === "atlas:time") {
    for (const listener of timeListeners) listener(event.data);
  } else if (event.data?.type === "atlas:pick") {
    for (const listener of pickListeners) listener(event.data);
  } else if (event.data?.type === "atlas:key") {
    for (const listener of keyListeners) listener(event.data);
  } else if (event.data?.type === "atlas:need-orbit") {
    for (const listener of orbitRequestListeners) listener(event.data);
  }
}

function dispose() {
  frame?.remove();
  frame = null;
  ready = false;
  loading = null;
  window.removeEventListener("message", onMessage);
}

/**
 * 천구를 숨긴 채 미리 불러온다. 이미 불러왔거나 불러오는 중이면 같은 약속을 돌려준다.
 *
 * @param {(stage: string) => void} [onProgress] 'engine' → 'earth' → 'sky'
 * @returns {Promise<boolean>} 준비되었는지(번들이 없거나 실패하면 false, 앱은 계속 열린다)
 */
export function preloadAtlas(onProgress = () => {}) {
  if (loading) return loading;
  // 번들이 없을 때 호스트가 index.html을 대신 돌려주면 이 앱이 iframe 안에서 또 떠 자기 자신을 겹겹이 올린다.
  if (window.self !== window.top) return Promise.resolve(false);
  loading = new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(bootTimer);
      clearTimeout(readyTimer);
      window.removeEventListener("message", onBoot);
      ready = ok;
      if (!ok) dispose();
      else {
        frame.style.cssText = HIDDEN;
        replaySky();
      }
      resolve(ok);
    };
    function onBoot(event) {
      if (!frame || event.source !== frame.contentWindow || event.origin !== window.location.origin) return;
      const data = event.data;
      if (data?.type === "atlas:progress") {
        clearTimeout(bootTimer);
        if (data.stage === "engine") postSettings();
        onProgress(data.stage);
      } else if (data?.type === "atlas:ready") finish(true);
      else if (data?.type === "atlas:error") finish(false);
    }
    const bootTimer = setTimeout(() => finish(false), BOOT_SIGNAL_MS);
    const readyTimer = setTimeout(() => finish(false), READY_TIMEOUT_MS);
    window.addEventListener("message", onBoot);
    window.addEventListener("message", onMessage);
    frame = document.createElement("iframe");
    frame.title = "Solar Atlas 지상 천구";
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = WARM;
    frame.src = FRAME_URL;
    document.body.appendChild(frame);
  });
  return loading;
}

function replaySky() {
  if (lastVisibility) post({ type: "atlas:visibility", ...lastVisibility });
  if (lastBodies) post({ type: "atlas:bodies", ...lastBodies });
  for (const orbit of lastOrbits.values()) post({ type: "atlas:orbit", ...orbit });
}

/**
 * 소천체의 적경·적위 표를 천구에 보낸다(천구가 준비되기 전이면 준비된 뒤에 보낸다).
 *
 * @param {{startMs: number, stepMs: number, count: number, bodies: object[]}} table
 */
export function setAtlasBodies(table) {
  lastBodies = table;
  if (ready) post({ type: "atlas:bodies", ...table });
}

/**
 * 천구에서 숨길 분류와 천체를 보낸다(천구가 준비되기 전이면 준비된 뒤에 보낸다).
 *
 * @param {{categories: string[], ids: string[]}} hidden 숨길 분류 키와 개별 천체 id
 */
export function setAtlasVisibility(hidden) {
  lastVisibility = hidden;
  if (ready) post({ type: "atlas:visibility", ...hidden });
}

/**
 * 소천체 한 개의 궤도선을 천구에 보낸다.
 *
 * @param {{id: string, center: string, points: number[]}} orbit
 */
export function setAtlasOrbit(orbit) {
  lastOrbits.set(orbit.id, orbit);
  if (ready) post({ type: "atlas:orbit", ...orbit });
}

/**
 * 천구에서 소천체를 클릭했을 때 그 궤도 요소를 달라는 요청을 받는다.
 *
 * @param {(event: {id: string, timeMs: number}) => void} listener
 * @returns {() => void} 구독 해제
 */
export function onAtlasOrbitRequest(listener) {
  orbitRequestListeners.add(listener);
  return () => orbitRequestListeners.delete(listener);
}

/** @returns {boolean} 천구가 준비되어 보여 줄 수 있는지 */
export function atlasReady() {
  return ready;
}

/**
 * 천구를 화면에 보이거나 숨긴다. 숨기면 그리기도 멈춰 GPU를 쓰지 않는다.
 *
 * @param {boolean} visible
 */
export function showAtlas(visible) {
  if (!frame || !ready) return;
  frame.style.cssText = visible ? SHOWN : HIDDEN;
  frame.tabIndex = visible ? 0 : -1;
  frame.setAttribute("aria-hidden", String(!visible));
  post({ type: "atlas:active", value: visible });
  if (visible) {
    postSettings();
    if (lastView) post({ type: "atlas:view", ...lastView });
    post({ type: "atlas:clock", factor: lastClock });
    frame.focus();
  }
}

/**
 * 보이는 천구 화면에 Web Animations 연출을 건다(지상 모드에 들어올 때의 연출용).
 *
 * @param {Keyframe[]} keyframes
 * @param {KeyframeAnimationOptions} options
 * @returns {Animation|null} 천구가 준비되지 않았으면 null
 */
export function animateAtlas(keyframes, options) {
  if (!frame || !ready) return null;
  return frame.animate(keyframes, options);
}

/**
 * 관측 장소·시각(·시선)을 천구에 반영한다.
 *
 * @param {{latitude: number, longitude: number, elevation?: number, time: Date|number,
 *   azimuth?: number, altitude?: number}} view
 */
export function setAtlasView(view) {
  lastView = {
    lat: view.latitude,
    lon: view.longitude,
    alt: view.elevation ?? 0,
    timeMs: new Date(view.time).getTime(),
    azimuth: view.azimuth,
    altitude: view.altitude,
  };
  if (ready) post({ type: "atlas:view", ...lastView });
}

/**
 * 시선만 그 방향으로 부드럽게 돌린다(장소·시각은 그대로).
 *
 * @param {{azimuth: number, altitude: number}} aim 도
 */
export function aimAtlas({ azimuth, altitude }) {
  if (lastView) lastView = { ...lastView, azimuth, altitude };
  if (ready) post({ type: "atlas:aim", azimuth, altitude });
}

/**
 * 천구의 시간 흐름 배율을 정한다(0이면 멈춤, 1은 실제 시간). 시간은 천구가 프레임마다 직접 흘리므로
 * 앱은 한 번만 알려 주면 되고, 그 사이의 시각은 onAtlasTime으로 받는다.
 *
 * @param {number} factor
 */
export function setAtlasClock(factor) {
  lastClock = Number.isFinite(factor) ? factor : 0;
  if (ready) post({ type: "atlas:clock", factor: lastClock });
}

/**
 * 천구의 시각(시뮬레이션 시각)이 바뀔 때마다(초당 5번 안팎) 받는다.
 *
 * @param {(event: {timeMs: number}) => void} listener
 * @returns {() => void} 구독 해제
 */
export function onAtlasTime(listener) {
  timeListeners.add(listener);
  return () => timeListeners.delete(listener);
}

/**
 * 사용자가 바라보는 방위각·고도각 변화를 받는다.
 *
 * @param {(gaze: {azimuth: number, altitude: number}) => void} listener
 * @returns {() => void} 구독 해제
 */
export function onAtlasGaze(listener) {
  gazeListeners.add(listener);
  return () => gazeListeners.delete(listener);
}

/**
 * 천구에서 천체 이름표를 클릭하면(빈 곳을 클릭하면 pick이 null) 받는다.
 *
 * @param {(event: {pick: {kind: string, name: string}|null, x: number, y: number}) => void} listener
 * @returns {() => void} 구독 해제
 */
export function onAtlasPick(listener) {
  pickListeners.add(listener);
  return () => pickListeners.delete(listener);
}

/**
 * 천구 표시 설정 하나를 바꾼다.
 *
 * @param {"labels"|"orbits"|"asterisms"|"clouds"|"grid"} key
 * @param {boolean} value
 */
export function setSkySetting(key, value) {
  if (!(key in SKY_SETTING_DEFAULTS)) return;
  skySettings[key] = Boolean(value);
  postSettings();
}

/** 천구 표시 설정을 처음 상태로 되돌린다. */
export function resetSkySettings() {
  Object.assign(skySettings, SKY_SETTING_DEFAULTS);
  postSettings();
}

/**
 * 천구 안에서 눌린 스페이스바를 받는다(천구는 자기 단축키를 막고 스페이스바만 알려 준다).
 *
 * @param {(event: {code: string}) => void} listener
 * @returns {() => void} 구독 해제
 */
export function onAtlasKey(listener) {
  keyListeners.add(listener);
  return () => keyListeners.delete(listener);
}
