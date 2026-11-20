// 별자리 경계선(IAU 88개 별자리의 경계, J2000 적경·적위).
//
// 천구 엔진에는 경계선이 없으므로, 적도 좌표격자 그룹(scene.grids.equatorial)의 자식으로 붙인다.
// 그러면 격자를 켜고 끌 때(페이드 포함) 경계선도 함께 나타나고 사라지며, 적도 좌표계로 놓이는 방향도 같다.
// 그리는 방식은 격자와 같다(카메라 이동은 무시하고 회전만 따르며, 깊이를 먼 면 바로 안쪽에 고정).
// 격자보다 옅은 푸른 회색 실선이다.
//
// 데이터: constellationBounds.json은 d3-celestial(BSD-3-Clause, https://github.com/ofrohn/d3-celestial)의
// data/constellations.bounds.json에서 소수 둘째 자리까지만 남긴 것이다. 원본은 Davenhall & Leggett(1989,
// CDS VI/49)의 IAU 경계를 J2000으로 옮긴 자료다. 각 고리는 [적경°, 적위°] 꼭짓점의 닫힌 목록이다.
import {sceneReferred} from 'atlas/scene/hdr.js'
import {overlay} from 'atlas/shared.js'
import rings from './constellationBounds.json'

const DEG = Math.PI / 180
const COLOR = 0x8fa6d4
const OPACITY = 0.4
// 경계는 적위선(작은 원)을 따라 길게 이어지는 변이 있어 꼭짓점만 이으면 휜다. 적경·적위에서 이만큼씩 잘라 잇는다.
const STEP_DEG = 1

const VERT = `
void main() {
  vec3 dir = mat3(viewMatrix) * (mat3(modelMatrix) * position);
  vec4 clipPos = projectionMatrix * vec4(dir, 1.0);
  clipPos.z = clipPos.w * 0.9997;
  gl_Position = clipPos;
}
`
const FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
void main() {
  gl_FragColor = vec4(uColor, uOpacity);
}
`

/**
 * 격자와 같은 규약의 단위 구 위 점: 적경 L, 적위 φ → (cosφ·cosL, sinφ, -cosφ·sinL).
 *
 * @param {number} raDeg
 * @param {number} decDeg
 * @param {number[]} out 좌표를 이어 붙일 배열
 */
function pushPoint(raDeg, decDeg, out) {
  const ra = raDeg * DEG
  const dec = decDeg * DEG
  const cd = Math.cos(dec)
  out.push(cd * Math.cos(ra), Math.sin(dec), -cd * Math.sin(ra))
}

/**
 * 이웃한 두 별자리가 공유하는 변은 한 번만 그리도록 변마다 키를 만든다.
 *
 * @param {number[]} a [ra, dec]
 * @param {number[]} b [ra, dec]
 * @returns {string}
 */
function edgeKey(a, b) {
  const p = `${a[0].toFixed(2)},${a[1].toFixed(2)}`
  const q = `${b[0].toFixed(2)},${b[1].toFixed(2)}`
  return p < q ? `${p}|${q}` : `${q}|${p}`
}

/**
 * 경계선 위치 목록(LineSegments 쌍)을 만든다.
 *
 * @returns {number[]}
 */
export function boundaryPositions() {
  const positions = []
  const seen = new Set()
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1]
      const b = ring[i]
      const key = edgeKey(a, b)
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      // 적경은 짧은 쪽으로 돈다(0°/360° 경계를 가로지르는 변).
      let dRa = b[0] - a[0]
      if (dRa > 180) {
        dRa -= 360
      } else if (dRa < -180) {
        dRa += 360
      }
      const dDec = b[1] - a[1]
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dRa), Math.abs(dDec)) / STEP_DEG))
      for (let s = 0; s < steps; s++) {
        pushPoint(a[0] + (dRa * s / steps), a[1] + (dDec * s / steps), positions)
        pushPoint(a[0] + (dRa * (s + 1) / steps), a[1] + (dDec * (s + 1) / steps), positions)
      }
    }
  }
  return positions
}

/**
 * 적도 좌표격자 그룹에 별자리 경계선을 붙인다.
 *
 * @param {object} c 천구 엔진(c.three가 엔진의 three, c.scene.grids가 격자)
 * @returns {boolean} 붙였는지(격자가 없으면 false)
 */
export function addConstellationBounds(c) {
  const grid = c.scene?.grids?.equatorial
  if (!grid) {
    return false
  }
  const T = c.three
  const geometry = new T.BufferGeometry()
  geometry.setAttribute('position', new T.Float32BufferAttribute(boundaryPositions(), 3))
  const material = sceneReferred(new T.ShaderMaterial({
    uniforms: {uColor: {value: new T.Color(COLOR)}, uOpacity: {value: OPACITY}},
    vertexShader: VERT,
    fragmentShader: FRAG,
    depthTest: true,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
  }))
  const lines = new T.LineSegments(geometry, material)
  lines.name = 'ConstellationBounds'
  lines.frustumCulled = false
  // 격자 선과 같은 순서로 그린다(은하수 뒤, 불투명 물체 앞).
  lines.renderOrder = -1
  overlay(lines)
  grid.add(lines)
  return true
}
