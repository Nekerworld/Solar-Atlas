// 천구에 올리는 태양계 소천체(위성·왜소행성·소행성·혜성·탐사선)의 위치와 궤도선을 JPL Horizons에서 받아 온다.
//
// Horizons는 브라우저에서 바로 부를 수 없어 플래너 백엔드(/api/sky/bodies, /api/sky/orbit)가 대신 부르고 캐시한다.
// 위치는 30일 구간의 2시간 간격 표로 한 번에 받고, 시각이 구간 끝에 가까워지면 새 구간을 미리 받는다.
// 표 사이는 천구(iframe)와 탐색(SkyPicker)이 같은 보간 함수(ephemerisInterp.js)로 채운다.

import { reactive } from "vue";
import { getSkyBodies, getSkyOrbit } from "../api/planner";
import { bodyRaDecAt } from "../utils/ephemerisInterp";
import { onAtlasOrbitRequest, setAtlasBodies, setAtlasOrbit } from "./atlasSky";

const DAY_MS = 86400000;
const WINDOW_HOURS = 720;
const STEP_MINUTES = 120;
// 표는 시각보다 이만큼 앞에서 시작하고, 끝에서 이만큼(표본 수, 8일) 남으면 다음 구간을 미리 받는다.
const LEAD_DAYS = 10;
const REFETCH_MARGIN_STEPS = 8 * 12;
const RETRY_AFTER_MS = 30000;

export const SKY_BODY_CATEGORIES = [
  { key: "satellite", label: "위성" },
  { key: "dwarf", label: "왜소행성" },
  { key: "asteroid", label: "소행성" },
  { key: "comet", label: "혜성" },
  { key: "craft", label: "탐사선" },
];

export const skyBodyState = reactive({
  status: "idle", // idle | loading | ready | error
  message: "",
  orbitNote: "",
  objects: [], // SkyPicker가 쓰는 항목들
  unavailable: [],
});

let table = null; // {startMs, stepMs, count}
let bodies = new Map();
let inflight = false;
let lastFailureAt = 0;
let stopOrbitRequests = null;

function toObjects(list) {
  return list.map((body) => ({
    id: `sky:${body.id}`,
    skyId: body.id,
    ko: body.ko,
    en: body.en,
    category: body.category,
    aliases: [body.id],
    // SkyPicker가 시선을 돌릴 때 쓰는 적도 좌표(J2000). 표 밖이면 가장자리 값이다.
    equatorialAt: (date) => skyBodyEquatorial(body.id, date.getTime()),
  }));
}

/**
 * @param {string} id 소천체 id(백엔드 등록 id)
 * @param {number} timeMs
 * @returns {{ra: number, dec: number}|null} 도(J2000). 표가 없으면 null
 */
export function skyBodyEquatorial(id, timeMs) {
  const body = bodies.get(id);
  if (!body || !table) return null;
  return bodyRaDecAt(body, table, timeMs);
}

/**
 * 선택 카드에 보여 줄 소천체 정보.
 *
 * @param {string} id
 * @returns {{ko: string, category: string, distanceAu: number|null, magnitude: number|null}|null}
 */
export function skyBodyInfo(id) {
  const body = bodies.get(id);
  if (!body) return null;
  return { ko: body.ko, category: body.category, distanceAu: body.delta_au ?? null, magnitude: body.magnitude ?? null };
}

async function load(timeMs) {
  inflight = true;
  skyBodyState.status = skyBodyState.objects.length ? "ready" : "loading";
  const start = new Date(Math.floor((timeMs - (LEAD_DAYS * DAY_MS)) / DAY_MS) * DAY_MS);
  try {
    const data = await getSkyBodies({ start: start.toISOString(), hours: WINDOW_HOURS, stepMinutes: STEP_MINUTES });
    if (!data?.ok) throw new Error(data?.error?.message || "소천체 위치를 받지 못했습니다.");
    table = { startMs: Date.parse(data.start), stepMs: data.step_minutes * 60000, count: data.count };
    bodies = new Map(data.bodies.map((body) => [body.id, body]));
    skyBodyState.objects = toObjects(data.bodies);
    skyBodyState.unavailable = data.unavailable || [];
    skyBodyState.status = "ready";
    skyBodyState.message = "";
    setAtlasBodies({ ...table, bodies: data.bodies });
  } catch (error) {
    lastFailureAt = Date.now();
    skyBodyState.status = skyBodyState.objects.length ? "ready" : "error";
    skyBodyState.message = skyBodyState.objects.length
      ? ""
      : `소천체 위치를 불러오지 못했습니다(${error.message}). 플래너 백엔드가 최신 코드로 실행 중인지 확인해 주세요.`;
  } finally {
    inflight = false;
  }
}

/**
 * 이 시각의 소천체 위치가 표에 있게 한다(없거나 구간 끝이 가까우면 새 구간을 받는다). 자주 불러도 된다.
 *
 * @param {number} timeMs 천구의 시각
 */
export function ensureSkyBodies(timeMs) {
  if (!Number.isFinite(timeMs) || inflight) return;
  if (table) {
    const index = (timeMs - table.startMs) / table.stepMs;
    if (index >= 0 && index <= table.count - 1 - REFETCH_MARGIN_STEPS) return;
  }
  // 실패한 뒤에는 잠시 쉰다. 시간이 표 안이면 그 표를 계속 쓴다.
  if (lastFailureAt && Date.now() - lastFailureAt < RETRY_AFTER_MS) return;
  load(timeMs);
}

async function sendOrbit({ id, timeMs }) {
  const body = bodies.get(id);
  if (!body) return;
  try {
    const data = await getSkyOrbit({ body: id, epoch: new Date(Number.isFinite(timeMs) ? timeMs : Date.now()).toISOString() });
    if (!data?.ok) {
      skyBodyState.orbitNote = `${body.ko}: ${data?.error?.message || "궤도선을 받지 못했습니다."}`;
      return;
    }
    skyBodyState.orbitNote = "";
    setAtlasOrbit({ id, center: data.center, points: data.points });
  } catch (error) {
    skyBodyState.orbitNote = `${body.ko}: 궤도선을 받지 못했습니다(${error.message}).`;
  }
}

/** 지상 천구 화면이 열릴 때 부른다: 소천체 위치를 받고, 클릭한 천체의 궤도 요청을 처리한다. */
export function startSkyBodies(timeMs) {
  stopOrbitRequests ??= onAtlasOrbitRequest((request) => {
    skyBodyState.orbitNote = "";
    sendOrbit(request);
  });
  ensureSkyBodies(timeMs);
}

/** 화면을 닫을 때 요청 처리를 멈춘다(받아 둔 표는 다시 열 때 쓴다). */
export function stopSkyBodies() {
  stopOrbitRequests?.();
  stopOrbitRequests = null;
  skyBodyState.orbitNote = "";
}
