// 별자리 그림: 별자리 이름표에 마우스를 올리면 그 별자리의 그림이 선 뒤에 희미하게 떠서, 이름의 유래를 알 수 있게 한다.
//
// 그림과 위치 맞춤은 Stellarium 'modern' 별자리 문화권(Free Art License)의 것이다. 그림마다 그림 위 세 점과
// 그 점에 놓인 밝은 별(히파르코스 번호)이 짝지어져 있다(constellationArt.json).
// 세 짝으로 그림 픽셀 → 하늘의 접평면(별자리 중심에서 본 gnomonic 투영) 아핀 변환을 풀고,
// 그림 전체를 하늘 위의 잘게 나눈 격자 면으로 놓는다. 별과 같은 천구 좌표계(scene.asterisms) 아래에 두므로
// 시간이 흐르고 시선이 움직여도 별에 붙어 따라 돈다.
// 그리는 방식은 경계선(constellationBounds.js)과 같다(카메라 이동은 무시하고 회전만 따르며, 먼 면 바로 안쪽에 고정).
// 그림은 검은 바탕의 흑백이라 밝기를 투명도로 쓴다.
import {sceneReferred} from 'atlas/scene/hdr.js'
import {overlay} from 'atlas/shared.js'
import entries from './constellationArt.json'

// 이 파일(sky/ground.html) 기준 위치
const ART_URL = '../constellation-art/'
// 호버했을 때 그림이 가장 진해지는 정도, 나타나고 사라지는 데 걸리는 시간
const MAX_OPACITY = 0.3
const FADE_MS = 240
// 그림 밝기를 올리는 정도(원본은 어두운 회색조라 그대로는 거의 보이지 않는다)
const GAIN = 2.4
const TINT = 0xa9cdff
// 그림 한 변을 이만큼으로 쪼갠 격자 면(넓은 별자리에서 투영이 휘는 것을 따라간다)
const SEGMENTS = 16

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 dir = mat3(viewMatrix) * (mat3(modelMatrix) * position);
  vec4 clipPos = projectionMatrix * vec4(dir, 1.0);
  clipPos.z = clipPos.w * 0.9996;
  gl_Position = clipPos;
}
`
const FRAG = `
uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uGain;
varying vec2 vUv;
void main() {
  float luma = texture2D(uMap, vUv).r;
  gl_FragColor = vec4(uColor, clamp(luma * uGain, 0.0, 1.0) * uOpacity);
}
`

const unit = ([x, y, z]) => {
  const length = Math.hypot(x, y, z)
  return [x / length, y / length, z / length]
}
const dot = (a, b) => (a[0] * b[0]) + (a[1] * b[1]) + (a[2] * b[2])
const cross = (a, b) => [
  (a[1] * b[2]) - (a[2] * b[1]),
  (a[2] * b[0]) - (a[0] * b[2]),
  (a[0] * b[1]) - (a[1] * b[0]),
]

/**
 * 세 점의 짝(픽셀 → 평면)으로 아핀 변환 [m00, m01, m02, m10, m11, m12]를 푼다(x' = m00·x + m01·y + m02).
 *
 * @param {number[][]} from [[x, y]] 셋
 * @param {number[][]} to [[x, y]] 셋
 * @returns {number[]|null} 세 점이 한 직선 위면 null
 */
export function solveAffine(from, to) {
  const [[x0, y0], [x1, y1], [x2, y2]] = from
  const det = (x0 * (y1 - y2)) - (y0 * (x1 - x2)) + ((x1 * y2) - (x2 * y1))
  if (Math.abs(det) < 1e-9) {
    return null
  }
  const solve = (v0, v1, v2) => [
    ((v0 * (y1 - y2)) + (v1 * (y2 - y0)) + (v2 * (y0 - y1))) / det,
    ((v0 * (x2 - x1)) + (v1 * (x0 - x2)) + (v2 * (x1 - x0))) / det,
    ((v0 * ((x1 * y2) - (x2 * y1))) + (v1 * ((x2 * y0) - (x0 * y2))) + (v2 * ((x0 * y1) - (x1 * y0)))) / det,
  ]
  return [...solve(to[0][0], to[1][0], to[2][0]), ...solve(to[0][1], to[1][1], to[2][1])]
}

/**
 * 그림의 격자 점들이 놓일 하늘 방향(단위 벡터)을 구한다.
 *
 * @param {{size: number, anchors: number[][]}} entry 그림 한 장의 자료
 * @param {Array<number[]>} stars 세 기준별의 방향(단위 벡터), entry.anchors와 같은 순서
 * @param {number} [segments]
 * @returns {{positions: number[], uvs: number[], indices: number[]}|null}
 */
export function artMesh(entry, stars, segments = SEGMENTS) {
  const center = unit([
    stars[0][0] + stars[1][0] + stars[2][0],
    stars[0][1] + stars[1][1] + stars[2][1],
    stars[0][2] + stars[1][2] + stars[2][2],
  ])
  const helper = Math.abs(center[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1]
  const e1 = unit(cross(helper, center))
  const e2 = cross(center, e1)
  const plane = stars.map((s) => {
    const k = dot(s, center)
    return [dot(s, e1) / k, dot(s, e2) / k]
  })
  const m = solveAffine(entry.anchors.map(([x, y]) => [x, y]), plane)
  if (!m) {
    return null
  }
  const positions = []
  const uvs = []
  const side = segments + 1
  for (let j = 0; j <= segments; j++) {
    for (let i = 0; i <= segments; i++) {
      const px = (i / segments) * entry.size
      const py = (j / segments) * entry.size
      const a = (m[0] * px) + (m[1] * py) + m[2]
      const b = (m[3] * px) + (m[4] * py) + m[5]
      const d = unit([
        center[0] + (a * e1[0]) + (b * e2[0]),
        center[1] + (a * e1[1]) + (b * e2[1]),
        center[2] + (a * e1[2]) + (b * e2[2]),
      ])
      positions.push(d[0], d[1], d[2])
      uvs.push(i / segments, 1 - (j / segments))
    }
  }
  const indices = []
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = (j * side) + i
      indices.push(a, a + 1, a + side, a + 1, a + side + 1, a + side)
    }
  }
  return {positions, uvs, indices}
}

/**
 * 별자리 그림 컨트롤러.
 *
 * @param {object} c 만들어진 천구 엔진(c.three가 엔진의 three)
 * @returns {{update: (nowMs: number, name: string|null) => void}}
 */
export function createConstellationArt(c) {
  const T = c.three
  const meshes = new Map() // 별자리 이름 → {mesh, uniforms}
  const missing = new Set() // 만들 수 없는 별자리(자료 없음·기준별 없음)
  let last = 0

  function build(name, asterisms) {
    const entry = entries[name]
    const catalog = asterisms.stars?.catalog
    if (!entry || !catalog) {
      return null
    }
    const stars = []
    for (const [, , hip] of entry.anchors) {
      const star = catalog.starByHip.get(hip)
      if (!star) {
        return null
      }
      stars.push(unit([star.x, star.y, star.z]))
    }
    const data = artMesh(entry, stars)
    if (!data) {
      return null
    }
    const geometry = new T.BufferGeometry()
    geometry.setAttribute('position', new T.Float32BufferAttribute(data.positions, 3))
    geometry.setAttribute('uv', new T.Float32BufferAttribute(data.uvs, 2))
    geometry.setIndex(data.indices)
    const texture = new T.TextureLoader().load(new URL(ART_URL + entry.file, location.href).href)
    const uniforms = {
      uMap: {value: texture},
      uColor: {value: new T.Color(TINT)},
      uOpacity: {value: 0},
      uGain: {value: GAIN},
    }
    const material = sceneReferred(new T.ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: true,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
      side: T.DoubleSide,
    }))
    const mesh = new T.Mesh(geometry, material)
    mesh.name = `ConstellationArt ${name}`
    mesh.frustumCulled = false
    mesh.visible = false
    // 별자리선·이름표보다 먼저(뒤에) 그린다.
    mesh.renderOrder = -3
    mesh.raycast = () => undefined
    overlay(mesh)
    asterisms.add(mesh)
    return {mesh, uniforms}
  }

  return {
    /**
     * 매 프레임: 올려 둔 별자리의 그림은 서서히 나타나고, 나머지는 서서히 사라진다.
     *
     * @param {number} nowMs
     * @param {string|null} name 마우스가 올라간 별자리(없으면 null)
     */
    update(nowMs, name) {
      const step = last ? Math.min(100, nowMs - last) / FADE_MS : 0
      last = nowMs
      const asterisms = c.scene.asterisms
      if (name && asterisms && !meshes.has(name) && !missing.has(name)) {
        const made = build(name, asterisms)
        if (made) {
          meshes.set(name, made)
        } else {
          missing.add(name)
        }
      }
      for (const [key, {mesh, uniforms}] of meshes) {
        const goal = key === name ? MAX_OPACITY : 0
        const current = uniforms.uOpacity.value
        const next = current < goal ? Math.min(goal, current + (step * MAX_OPACITY)) : Math.max(goal, current - (step * MAX_OPACITY))
        uniforms.uOpacity.value = next
        mesh.visible = next > 0.003
      }
    },
  }
}
