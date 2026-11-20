import { Equator, Horizon, Illumination, Observer } from "astronomy-engine";

// 관측 플래너의 "내 위치에서 보이는 일정" 미리보기 계산(astronomy-engine).
// 최종 적합성은 계획을 실행할 때 JPL Horizons가 판정한다.

export const TARGET_NAMES_KO = {
  mercury: "수성", venus: "금성", moon: "달", mars: "화성",
  jupiter: "목성", saturn: "토성", uranus: "천왕성", neptune: "해왕성",
};

const BODY_NAME = {
  mercury: "Mercury", venus: "Venus", moon: "Moon", mars: "Mars",
  jupiter: "Jupiter", saturn: "Saturn", uranus: "Uranus", neptune: "Neptune",
};

// 보이는 조건: 천체 고도 minAltitude 이상, 태양 고도 maxSunAltitude 이하(하늘이 충분히 어두움).
// 수성·금성은 박명 직후가 관측 시간이라 어둡기 조건을 느슨하게, 어두운 천왕성·해왕성은 엄격하게 둔다.
export const VISIBILITY_RULES = {
  mercury: { minAltitude: 8, maxSunAltitude: -1 },
  venus: { minAltitude: 8, maxSunAltitude: -1 },
  moon: { minAltitude: 10, maxSunAltitude: -6 },
  mars: { minAltitude: 15, maxSunAltitude: -8 },
  jupiter: { minAltitude: 15, maxSunAltitude: -8 },
  saturn: { minAltitude: 15, maxSunAltitude: -8 },
  uranus: { minAltitude: 25, maxSunAltitude: -12 },
  neptune: { minAltitude: 25, maxSunAltitude: -12 },
};

const COMPASS = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];

export function compassName(azimuthDeg) {
  return COMPASS[Math.round((((azimuthDeg % 360) + 360) % 360) / 45) % 8];
}

function altAz(body, date, observer) {
  const equator = Equator(body, date, observer, true, true);
  const horizon = Horizon(date, observer, equator.ra, equator.dec, "normal");
  return { altitude: horizon.altitude, azimuth: horizon.azimuth };
}

/** @returns {number} 태양 고도(도, 대기 굴절 포함) */
export function sunAltitudeDeg(date, latitude, longitude) {
  return altAz("Sun", date, new Observer(latitude, longitude, 0)).altitude;
}

/** 박명 세 단계의 풀이. 화면의 물음표 툴팁에 그대로 보여 준다. */
export const TWILIGHT_HELP = [
  { key: "civil", title: "상용박명 (Civil Twilight)", text: "해가 진 후에도 하늘이 비교적 밝아, 인공조명 없이 야외 활동이 가능한 시간입니다. 밝은 별과 행성이 보이기 시작합니다." },
  { key: "nautical", title: "항해박명 (Nautical Twilight)", text: "하늘이 점차 어두워져 지평선이 희미하게 보이는 시간입니다. 많은 별이 관측되기 시작합니다." },
  { key: "astronomical", title: "천문박명 (Astronomical Twilight)", text: "하늘이 거의 완전히 어두워지는 시간입니다. 희미한 별과 천체도 관측하기 좋은 환경에 가까워집니다." },
];
export const TWILIGHT_HELP_NOTE = "일몰 후 기준이며, 일출 전에는 반대 순서로 진행됩니다.";

/** @returns {{key: string, label: string}} 태양 고도에 따른 하늘 단계 */
export function skyPhase(sunAltitude) {
  if (sunAltitude > 0) return { key: "day", label: "낮" };
  if (sunAltitude > -6) return { key: "civil", label: "상용박명" };
  if (sunAltitude > -12) return { key: "nautical", label: "항해박명" };
  if (sunAltitude > -18) return { key: "astronomical", label: "천문박명" };
  return { key: "night", label: "밤" };
}

/**
 * 앞으로 days일 안에 천체가 보이는 시간대(연속 구간)를 시간순으로 돌려준다.
 * 10분 간격으로 훑으므로 경계는 약 10분 오차가 있다.
 *
 * @param {{bodyId: string, latitude: number, longitude: number, from?: Date, days?: number, stepMinutes?: number}} options
 * @returns {Array<{start: Date, end: Date, peak: Date, peakAltitude: number, peakAzimuth: number, moonFraction: number|null,
 *   score: number, recommended: boolean, ongoing: boolean}>}
 */
export function visibilityWindows({ bodyId, latitude, longitude, from = new Date(), days = 7, stepMinutes = 10 }) {
  const rule = VISIBILITY_RULES[bodyId];
  const body = BODY_NAME[bodyId];
  if (!rule || !body || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
  const observer = new Observer(latitude, longitude, 0);
  const step = stepMinutes * 60 * 1000;
  const end = from.getTime() + days * 24 * 3600 * 1000;
  const windows = [];
  let current = null;
  const close = (stop) => {
    if (!current) return;
    current.end = new Date(stop);
    windows.push(current);
    current = null;
  };
  for (let time = from.getTime(); time <= end; time += step) {
    const date = new Date(time);
    const target = altAz(body, date, observer);
    const visible = target.altitude >= rule.minAltitude && altAz("Sun", date, observer).altitude <= rule.maxSunAltitude;
    if (!visible) { close(time); continue; }
    if (!current) current = { start: date, end: date, peak: date, peakAltitude: target.altitude, peakAzimuth: target.azimuth, ongoing: time === from.getTime() };
    if (target.altitude > current.peakAltitude) Object.assign(current, { peak: date, peakAltitude: target.altitude, peakAzimuth: target.azimuth });
  }
  close(end);
  for (const window of windows) {
    window.moonFraction = bodyId === "moon" ? null : Illumination("Moon", window.peak).phase_fraction;
    const hours = (window.end - window.start) / 3600000;
    window.score = window.peakAltitude + hours * 3 - (window.moonFraction ?? 0) * 15;
    window.recommended = false;
  }
  windows.sort((a, b) => a.start - b.start);
  [...windows].sort((a, b) => b.score - a.score).slice(0, 3).forEach((window) => { window.recommended = true; });
  return windows;
}
