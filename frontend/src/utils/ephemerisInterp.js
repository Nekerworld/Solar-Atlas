// 천구의 소천체 위치(Horizons 적경·적위 표)를 시각 사이로 보간하고 천구 좌표로 바꾸는 순수 함수들.
// Vue 앱(탐색·시선 이동)과 천구 엔진 iframe(마커 위치)이 같은 계산을 쓰도록 한 곳에 둔다.

const DEG = Math.PI / 180;
const OBLIQUITY_J2000 = 23.4392911 * DEG;

/**
 * 표의 한 구간: 시작 시각(ms)에서 stepMs 간격으로 count개.
 *
 * @typedef {{startMs: number, stepMs: number, count: number}} EphemerisWindow
 */

/**
 * 표 안의 소수 위치(표본 번호). 표 밖이면 가장자리로 자른다.
 *
 * @param {EphemerisWindow} window
 * @param {number} timeMs
 * @returns {number} 0 이상 count-1 이하
 */
export function windowIndex(window, timeMs) {
  const index = (timeMs - window.startMs) / window.stepMs;
  return Math.min(window.count - 1, Math.max(0, index));
}

/**
 * 이 시각을 표가 (가장자리에서 marginSteps 표본 이상 떨어져) 덮는지.
 *
 * @param {EphemerisWindow|null} window
 * @param {number} timeMs
 * @param {number} [marginSteps]
 * @returns {boolean}
 */
export function windowCovers(window, timeMs, marginSteps = 0) {
  if (!window) return false;
  const index = (timeMs - window.startMs) / window.stepMs;
  return index >= marginSteps && index <= window.count - 1 - marginSteps;
}

function catmullRom(p0, p1, p2, p3, u) {
  return 0.5 * ((2 * p1) + ((-p0 + p2) * u) + (((2 * p0) - (5 * p1) + (4 * p2) - p3) * u * u)
    + ((-p0 + (3 * p1) - (3 * p2) + p3) * u * u * u));
}

// 적경은 360도에서 감기므로 기준 표본 가까이로 펴서 보간한다.
function unwrap(value, reference) {
  return reference + ((((value - reference + 540) % 360) + 360) % 360) - 180;
}

/**
 * 균일한 간격의 표에서 3차(Catmull-Rom)로 보간한 적경·적위.
 *
 * @param {number[]} ra 도
 * @param {number[]} dec 도
 * @param {number} index 소수 표본 번호(windowIndex)
 * @returns {{ra: number, dec: number}} 적경은 0~360
 */
export function interpolateRaDec(ra, dec, index) {
  const last = ra.length - 1;
  const i = Math.min(last - 1, Math.max(0, Math.floor(index)));
  const u = Math.min(1, Math.max(0, index - i));
  const at = (k) => Math.min(last, Math.max(0, k));
  const base = ra[i];
  const r = [at(i - 1), i, at(i + 1), at(i + 2)].map((k) => unwrap(ra[k], base));
  const d = [at(i - 1), i, at(i + 1), at(i + 2)].map((k) => dec[k]);
  return {
    ra: ((catmullRom(r[0], r[1], r[2], r[3], u) % 360) + 360) % 360,
    dec: Math.max(-90, Math.min(90, catmullRom(d[0], d[1], d[2], d[3], u))),
  };
}

/**
 * 한 천체의 그 시각 적경·적위.
 *
 * @param {{ra: number[], dec: number[]}} body
 * @param {EphemerisWindow} window
 * @param {number} timeMs
 * @returns {{ra: number, dec: number}}
 */
export function bodyRaDecAt(body, window, timeMs) {
  return interpolateRaDec(body.ra, body.dec, windowIndex(window, timeMs));
}

/**
 * 적도 좌표(J2000)를 천구 엔진 장면의 좌표(J2000 황도 기준축: X 춘분점, Y 황도 북극)의 단위 벡터로.
 * 천구 엔진의 적도 격자가 북극을 (0, cos ε, -sin ε)에 두는 것과 같은 규약이다.
 *
 * @param {number} raDeg
 * @param {number} decDeg
 * @returns {[number, number, number]}
 */
export function equatorialToScene(raDeg, decDeg) {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  const x = Math.cos(dec) * Math.cos(ra);
  const y = Math.cos(dec) * Math.sin(ra);
  const z = Math.sin(dec);
  const ye = (y * Math.cos(OBLIQUITY_J2000)) + (z * Math.sin(OBLIQUITY_J2000));
  const ze = (-y * Math.sin(OBLIQUITY_J2000)) + (z * Math.cos(OBLIQUITY_J2000));
  return [x, ze, -ye];
}

/**
 * 두 방향 사이의 각(도).
 *
 * @param {[number, number, number]} a 단위 벡터
 * @param {[number, number, number]} b 단위 벡터
 * @returns {number}
 */
export function angleBetweenDeg(a, b) {
  const dot = (a[0] * b[0]) + (a[1] * b[1]) + (a[2] * b[2]);
  return Math.acos(Math.max(-1, Math.min(1, dot))) / DEG;
}
