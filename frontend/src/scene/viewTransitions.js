// 화면(태양계·플래너·지상)을 오갈 때의 화면 연출.
//
// 지상 천구가 나오고 들어가는 전환은 "내려가고 올라가는" 줌이고, 플래너가 열리고 닫히는 전환은 "누른 자리에서 번지는" 원형이다.
//   태양계 → 지상  dive    태양계 화면이 지구 쪽으로 다가가고, 대기 글로우가 번지는 사이 지평선이 올라오며 하늘이 펼쳐진다.
//   플래너 → 지상  iris    누른 자리에서 원형으로 번지며 하늘이 열린다. 계획이 있으면 GroundView가 시계를 계획 시각까지 돌린다.
//   지상 → 태양계  ascend  하늘이 아래로 물러나며 글로우가 번지고, 태양계 화면이 멀어지며 돌아온다(dive를 거꾸로).
//   태양계·지상 → 플래너  플래너가 누른 자리에서 원형으로 열린다(지상 천구는 그 밑에 그대로 남는다).
//   플래너 → 태양계  플래너가 누른 자리로 원형으로 닫힌다.
//
// 연출은 Web Animations(transform·opacity·clip-path)만 쓰고 끝나면 모두 걷어 낸다. 연출 중에는 투명한 덮개가 입력을 막아
// 조작이 꼬이지 않게 한다. prefers-reduced-motion이면 짧은 페이드만 쓴다.

import { animateAtlas, atlasReady, showAtlas } from "./atlasSky";

export const DIVE_MS = 1500;
export const IRIS_MS = 1000;
export const PLANNER_MS = 800;
export const ASCEND_MS = 1400;
export const CLOCK_JUMP_MS = 1600;
const FADE_MS = 200;

let overlay = null;
let animations = [];
let jumpToken = 0;
let hideTimer = 0;

export function reducedMotion() {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/** 지상 화면이 떠날 때 천구를 계속 보여 줘야 하는 시간(ms). 연출이 없으면 0. */
export function groundLeaveMs({ to }) {
  if (!atlasReady() || (to !== "solar" && to !== "planner")) return 0;
  if (reducedMotion()) return FADE_MS;
  return to === "solar" ? ASCEND_MS : PLANNER_MS;
}

/** 플래너가 지상으로 가며 떠날 때, 하늘이 열리는 동안 플래너를 남겨 둘 시간(ms). */
export function plannerHoldMs() {
  if (!atlasReady()) return 0;
  return reducedMotion() ? FADE_MS : IRIS_MS;
}

/**
 * 천구를 숨긴다. 떠나는 연출이 있으면(ms > 0) 그 연출이 끝나는 대로 leaveGround가 숨기고, 여기서는 훅이 불리지 않은
 * 경우를 대비한 안전장치만 건다(연출이 끝나기 전에 숨기면 플래너·태양계가 열리는 사이 하늘이 먼저 사라진다).
 */
export function hideAtlasAfter(ms) {
  clearTimeout(hideTimer);
  if (ms > 0) hideTimer = setTimeout(() => showAtlas(false), ms + GATE_TIMEOUT_MS + 1000);
  else showAtlas(false);
}

/** 대기 중인 천구 숨김을 취소한다(지상 화면이 다시 열렸을 때). */
export function cancelAtlasHide() {
  clearTimeout(hideTimer);
}

/** 천구를 지금 바로 숨긴다. 연출이 걸어 둔 것을 걷어 내기 전에 불러야, 걷는 순간 하늘이 잠깐 다시 보이지 않는다. */
function hideAtlasNow() {
  clearTimeout(hideTimer);
  showAtlas(false);
}

// 지상에서 플래너로 갈 때는 두 훅(지상이 떠나는 훅, 플래너가 열리는 훅)이 서로를 기다려야 한다.
// 지상은 플래너가 다 열린 뒤에 사라지고, 플래너는 지상이 완전히 사라진 뒤에 제자리(z-index)로 돌아간다.
// 고정 시간으로 맞추면 프레임이 늦는 기기에서 어긋나 지상 화면이 잠깐 비친다. 전환 번호별로 문을 만든다.
const gates = new Map();
function gate(key) {
  let found = gates.get(key);
  if (!found) {
    let open;
    const promise = new Promise((resolve) => { open = resolve; });
    found = { promise, open };
    gates.set(key, found);
  }
  return found;
}
const GATE_TIMEOUT_MS = 5000;
const waitGate = (key) => Promise.race([gate(key).promise, new Promise((resolve) => setTimeout(resolve, GATE_TIMEOUT_MS))]);

function track(animation) {
  if (animation) animations.push(animation);
  return animation;
}

function makeOverlay() {
  overlay?.remove();
  overlay = document.createElement("div");
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.cssText = "position:fixed;inset:0;z-index:300;pointer-events:auto;overflow:hidden;";
  document.body.appendChild(overlay);
  return overlay;
}

/** 연출이 걸어 둔 애니메이션과 덮개를 걷어 낸다(시계 점프는 건드리지 않는다). */
function clearVisuals() {
  for (const animation of animations) animation.cancel();
  animations = [];
  overlay?.remove();
  overlay = null;
}

/** 진행 중인 연출과 시계 점프를 멈추고 덮개를 치운다. */
export function cancelGroundEntry() {
  jumpToken += 1;
  clearVisuals();
}

function settled(list) {
  return Promise.allSettled(list.filter(Boolean).map((animation) => animation.finished));
}

function fade(target, from, to) {
  return track(target.animate([{ opacity: from }, { opacity: to }], { duration: FADE_MS, fill: "forwards" }));
}

function glowLayer(cover, duration) {
  const glow = document.createElement("div");
  glow.style.cssText = "position:absolute;left:50%;top:50%;width:140vmax;height:140vmax;margin:-70vmax 0 0 -70vmax;border-radius:50%;"
    + "background:radial-gradient(circle,#fffffff0 0%,#a9d4ffa6 18%,#4f86e659 38%,#14327800 62%);opacity:0;will-change:transform,opacity;";
  cover.appendChild(glow);
  return track(glow.animate(
    [{ transform: "scale(0.05)", opacity: 0 }, { transform: "scale(0.55)", opacity: 0.95, offset: 0.42 }, { transform: "scale(1.15)", opacity: 0 }],
    { duration, easing: "ease-in-out" },
  ));
}

const solarViewport = () => document.querySelector(".solar-viewport");
const solarControls = () => document.querySelectorAll(".application-shell > :not(.solar-viewport)");

/** 점(없으면 화면 가운데)에서 가장 먼 모서리까지의 거리로 원을 정한다. */
function circleAt(point) {
  const x = Number.isFinite(point?.x) ? point.x : window.innerWidth / 2;
  const y = Number.isFinite(point?.y) ? point.y : window.innerHeight / 2;
  return { x, y, radius: Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 4 };
}

function ringLayer(cover, { x, y, radius }, color) {
  const ring = document.createElement("div");
  ring.style.cssText = `position:absolute;left:${x - radius}px;top:${y - radius}px;width:${radius * 2}px;height:${radius * 2}px;`
    + `box-sizing:border-box;border-radius:50%;border:2px solid ${color}cc;box-shadow:0 0 24px ${color}73,inset 0 0 40px ${color}40;`
    + "will-change:transform,opacity;";
  cover.appendChild(ring);
  return ring;
}

const clip = (c, r) => `circle(${r}px at ${c.x}px ${c.y}px)`;

// ── 지상 모드로 들어올 때 ────────────────────────────────────────────

function dive(root) {
  const cover = makeOverlay();
  const main = [glowLayer(cover, DIVE_MS)];
  // 태양계 화면: 지구 쪽으로 빠르게 다가가며(점점 빨라진다) 조작부는 먼저 사라진다. 하늘이 완전히 덮은 뒤에 걷어 낸다.
  const viewport = solarViewport();
  if (viewport) {
    track(viewport.animate([{ transform: "scale(1)" }, { transform: "scale(8)" }],
      { duration: 1000, easing: "cubic-bezier(.55,0,1,.6)", fill: "forwards" }));
  }
  for (const element of solarControls()) {
    track(element.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 350, fill: "forwards" }));
  }
  // 하늘: 아래에서 올라오며 펼쳐진다.
  main.push(track(animateAtlas(
    [{ opacity: 0, transform: "scale(1.3) translateY(10%)" }, { opacity: 1, transform: "scale(1) translateY(0)" }],
    { duration: 900, delay: 500, easing: "cubic-bezier(.2,.7,.2,1)", fill: "backwards" },
  )));
  if (root) main.push(track(root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 1000, fill: "backwards" })));
  return settled(main);
}

function iris(root, point) {
  const circle = circleAt(point);
  const cover = makeOverlay();
  const ring = ringLayer(cover, circle, "#ffce96");
  const easing = "cubic-bezier(.45,.05,.2,1)";
  const main = [];
  main.push(track(ring.animate(
    [{ transform: "scale(0)", opacity: 1 }, { transform: "scale(0.7)", opacity: 0.9, offset: 0.7 }, { transform: "scale(1)", opacity: 0 }],
    { duration: IRIS_MS, easing },
  )));
  main.push(track(animateAtlas(
    [{ clipPath: clip(circle, 0) }, { clipPath: clip(circle, circle.radius) }],
    { duration: IRIS_MS, easing, fill: "backwards" },
  )));
  if (root) main.push(track(root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 600, fill: "backwards" })));
  return settled(main);
}

/**
 * 지상 모드에 들어오는 연출을 재생한다. 천구를 보이게 한 직후(같은 틱)에 불러야 첫 프레임이 깜빡이지 않는다.
 *
 * @param {{from: string, point: {x: number, y: number}|null, root: HTMLElement|null}} options
 * @returns {Promise<void>} 연출이 끝나면(연출이 없으면 바로) 이행
 */
export async function playGroundEntry({ from, point, root }) {
  clearVisuals();
  if (!atlasReady() || (from !== "solar" && from !== "planner")) return;
  if (reducedMotion()) {
    await settled([track(animateAtlas([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, fill: "backwards" }))]);
    return;
  }
  await (from === "solar" ? dive(root) : iris(root, point));
  clearVisuals();
}

// ── 지상 모드에서 나갈 때 ────────────────────────────────────────────

function ascend(root) {
  const cover = makeOverlay();
  const main = [glowLayer(cover, ASCEND_MS)];
  if (root) main.push(track(root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 350, fill: "forwards" })));
  // 하늘: 아래로 물러나며 사라진다.
  main.push(track(animateAtlas(
    [{ opacity: 1, transform: "scale(1) translateY(0)" }, { opacity: 0, transform: "scale(1.3) translateY(10%)" }],
    { duration: 900, easing: "cubic-bezier(.6,0,.8,.4)", fill: "forwards" },
  )));
  // 태양계 화면: 하늘이 걷히는 사이 지구에서 멀어지며 제자리로 돌아온다.
  const viewport = solarViewport();
  if (viewport) {
    main.push(track(viewport.animate([{ transform: "scale(8)" }, { transform: "scale(1)" }],
      { duration: 1000, delay: 300, easing: "cubic-bezier(0,.4,.45,1)", fill: "backwards" })));
  }
  for (const element of solarControls()) {
    main.push(track(element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 900, fill: "backwards" })));
  }
  return settled(main);
}

/**
 * 지상 화면이 떠나는 동안 붙잡아 둘 때 쓴다(Transition의 leave 훅). 태양계로 가면 올라가는 연출을 하고, 플래너로 가면
 * 플래너가 위에서 열리는 동안 그대로 남아 있는다.
 *
 * @param {HTMLElement} element 지상 화면의 루트
 * @param {() => void} done
 * @param {{to: string}} transition
 */
export async function leaveGround(element, done, transition) {
  const toPlanner = transition.to === "planner";
  const wait = groundLeaveMs(transition);
  if (!wait) {
    done();
    if (toPlanner) gate(`${transition.id}:gone`).open();
    return;
  }
  element.setAttribute("inert", "");
  if (toPlanner) {
    // 플래너가 위에서 다 열릴 때까지 그대로 둔다(열리는 시간이 기기마다 다르다).
    await waitGate(`${transition.id}:opened`);
  } else if (!reducedMotion()) {
    await ascend(element);
  } else {
    await settled([fade(element, 1, 0)]);
  }
  hideAtlasNow(); // 걷어 내기 전에 먼저 숨긴다
  if (!toPlanner) clearVisuals();
  done();
  if (toPlanner) gate(`${transition.id}:gone`).open();
}

// ── 플래너가 열리고 닫힐 때 ──────────────────────────────────────────

/** 플래너가 태양계·지상 위로 누른 자리에서 원형으로 열린다. */
export async function enterPlanner(element, done, { id, from, point }) {
  if (from !== "solar" && from !== "ground") {
    done();
    return;
  }
  clearVisuals();
  element.style.zIndex = "200"; // 지상 천구(70)와 지상 화면(80) 위로
  if (reducedMotion()) {
    await settled([track(element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS }))]);
  } else {
    const circle = circleAt(point);
    const ring = ringLayer(makeOverlay(), circle, "#8fb4ff");
    const easing = "cubic-bezier(.45,.05,.2,1)";
    await settled([
      track(element.animate([{ clipPath: clip(circle, 0) }, { clipPath: clip(circle, circle.radius) }], { duration: PLANNER_MS, easing })),
      track(ring.animate([{ transform: "scale(0)", opacity: 1 }, { transform: "scale(0.7)", opacity: 0.9, offset: 0.7 }, { transform: "scale(1)", opacity: 0 }],
        { duration: PLANNER_MS, easing })),
    ]);
  }
  if (from === "ground") {
    // 지상 화면과 천구가 완전히 사라진 뒤에야 플래너를 제자리로 돌린다(그 전에는 지상 화면이 플래너 위로 비친다).
    gate(`${id}:opened`).open();
    await waitGate(`${id}:gone`);
    gates.delete(`${id}:opened`);
    gates.delete(`${id}:gone`);
  }
  clearVisuals();
  element.style.zIndex = "";
  done();
}

/**
 * 플래너가 떠난다. 지상으로 가면 하늘이 원형으로 열리는 동안 그 밑에 남아 있고, 태양계로 가면 누른 자리로 원형으로 닫힌다.
 */
export async function leavePlanner(element, done, { to, point }) {
  if (to === "ground") {
    const wait = plannerHoldMs();
    if (!wait) {
      done();
      return;
    }
    element.setAttribute("inert", "");
    await new Promise((resolve) => setTimeout(resolve, wait + 50));
    done();
    return;
  }
  if (to !== "solar") {
    done();
    return;
  }
  clearVisuals();
  element.setAttribute("inert", "");
  if (reducedMotion()) {
    await settled([fade(element, 1, 0)]);
  } else {
    const circle = circleAt(point);
    const ring = ringLayer(makeOverlay(), circle, "#8fb4ff");
    const easing = "cubic-bezier(.8,0,.55,.95)";
    await settled([
      track(element.animate([{ clipPath: clip(circle, circle.radius) }, { clipPath: clip(circle, 0) }], { duration: PLANNER_MS, easing, fill: "forwards" })),
      track(ring.animate([{ transform: "scale(1)", opacity: 0 }, { transform: "scale(0.7)", opacity: 0.9, offset: 0.3 }, { transform: "scale(0)", opacity: 1 }],
        { duration: PLANNER_MS, easing })),
    ]);
  }
  clearVisuals();
  done();
}

/**
 * 시각을 from에서 to까지 빠르게 흘려 보낸다(처음과 끝은 천천히, 가운데는 빠르게). 끝에는 정확히 to를 알린다.
 *
 * @param {{from: number, to: number, ms?: number, onFrame: (at: Date) => void}} options 시각은 ms 단위 에포크
 * @returns {Promise<boolean>} 끝까지 갔으면 true, 도중에 취소되면 false
 */
export function runClockJump({ from, to, ms = CLOCK_JUMP_MS, onFrame }) {
  const token = ++jumpToken;
  return new Promise((resolve) => {
    const started = performance.now();
    function step(now) {
      if (token !== jumpToken) {
        resolve(false);
        return;
      }
      const progress = Math.min(1, (now - started) / ms);
      const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - ((-2 * progress + 2) ** 3) / 2;
      onFrame(new Date(from + ((to - from) * eased)));
      if (progress >= 1) resolve(true);
      else requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}
