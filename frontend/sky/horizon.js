// 지상 천구의 산맥 지평선.
//
// 땅 원판(ground.js)의 가장자리가 곧은 선으로 보이지 않게, 관측자 둘레에 거리가 다른 산줄기를 겹겹이 세운다.
// 산줄기는 노이즈(값 잡음을 겹쳐 쌓고 일부는 뾰족하게 접은 것)로 높이를 정한 둥근 벽이고, 멀수록 높고 흐리다.
// 장소(위도·경도)가 바뀌면 산 모양도 바뀐다. 벽은 땅 원판의 자식이라 원판과 함께 움직이고(x 동쪽, y 북쪽,
// z 위), 땅과 같은 빛 계산과 하늘빛(uSkylight)을 쓴다. 천구 엔진의 three를 쓰기 위해 c.three로만 만든다.

// 산줄기(가까운 것부터 그리지 않아도 깊이로 가려진다): 거리, 가장 높은 곳과 낮은 곳의 높이(m), 하늘빛에 흐려지는 정도
const RANGES = [
  {radius: 29000, height: 2100, minHeight: 150, haze: 0.3, seed: 11},
  {radius: 19000, height: 1000, minHeight: 75, haze: 0.14, seed: 23},
  {radius: 9500, height: 400, minHeight: 40, haze: 0.05, seed: 37},
]
const SEGMENTS = 1440
// 벽은 땅 아래까지 내려 틈이 없게 한다.
const BASE_DEPTH_M = 500

// 숲과 바위, 멀리 흐려지는 색(sRGB 바이트)
const FOREST = [40, 56, 40]
const ROCK = [88, 80, 74]
const HAZE = [150, 165, 188]

const toLinear = (byte) => {
  const s = byte / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const mix = (a, b, t) => a + ((b - a) * t)
const smooth = (a, b, t) => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)))
  return k * k * (3 - (2 * k))
}

function lattice(x, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(seed, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** 한 바퀴(t 0~1)가 이어지는 값 잡음, 0~1. */
function ringNoise(t, cells, seed) {
  const x = t * cells
  const x0 = Math.floor(x)
  const f = x - x0
  const s = f * f * (3 - (2 * f))
  const a = lattice(x0 % cells, seed)
  const b = lattice((x0 + 1) % cells, seed)
  return a + ((b - a) * s)
}

/** 한 바퀴 위치 t에서의 산 높이 비율(0~1): 큰 줄기 위에 작은 봉우리와 능선이 겹친다. */
function ridgeShape(t, seed) {
  let rolling = 0
  let sharp = 0
  let norm = 0
  let amplitude = 1
  for (let octave = 0; octave < 9; octave++) {
    const n = ringNoise(t, 3 * (2 ** octave), seed + (octave * 7))
    rolling += amplitude * n
    sharp += amplitude * (1 - Math.abs((2 * n) - 1))
    norm += amplitude
    amplitude *= 0.62
  }
  const v = ((0.3 * rolling) + (0.7 * sharp)) / norm
  const shape = smooth(0.4, 0.66, v) ** 1.25
  // 큰 산군과 낮은 고개가 번갈아 나오게 한다.
  const massif = 0.45 + (0.55 * smooth(0.25, 0.75, ringNoise(t, 4, seed + 101)))
  return shape * massif
}

/**
 * 산줄기 한 바퀴의 마루 높이(m). 메쉬를 만들 때와 이름표가 가려졌는지 볼 때 같은 값을 쓴다.
 *
 * @param {{radius: number, height: number, minHeight: number, seed: number}} range
 * @param {number} seed 장소에 따라 바뀌는 값
 * @returns {Float32Array} SEGMENTS개. 0번이 동쪽, 늘어나는 방향이 북쪽
 */
function crestHeights(range, seed) {
  const shapes = []
  for (let i = 0; i < SEGMENTS; i++) {
    shapes.push(ridgeShape(i / SEGMENTS, range.seed + (seed % 997)))
  }
  // 잡음이 만드는 수직 절벽을 없애도록 이웃 몇 칸과 평균 낸다(봉우리의 날은 남는다).
  const raw = [...shapes]
  for (let i = 0; i < SEGMENTS; i++) {
    let sum = 0
    for (let k = -2; k <= 2; k++) {
      sum += raw[(i + k + SEGMENTS) % SEGMENTS]
    }
    shapes[i] = sum / 5
  }
  // 장소에 따라 노이즈의 분포가 크게 다르므로, 낮은 곳과 가장 높은 봉우리가 늘 같은 범위를 쓰게 늘려 맞춘다.
  const sorted = [...shapes].sort((a, b) => a - b)
  const low = sorted[Math.floor(0.08 * (SEGMENTS - 1))]
  const high = sorted[Math.floor(0.99 * (SEGMENTS - 1))]
  const heights = new Float32Array(SEGMENTS)
  for (let i = 0; i < SEGMENTS; i++) {
    const stretched = Math.min(1, Math.max(0, (shapes[i] - low) / Math.max(high - low, 1e-6)))
    heights[i] = range.minHeight + ((range.height - range.minHeight) * stretched)
  }
  return heights
}

/** 장소마다 다른 산 모양을 위한 씨앗 */
function siteSeed(site) {
  return Math.imul(Math.round(site.lat * 50), 73856093) ^ Math.imul(Math.round(site.lon * 50), 19349663)
}

// 장소마다 산줄기 높이를 한 번만 만든다(그릴 때와 같은 식).
let coverCache = {key: 0, profiles: []}

function coverProfiles(site) {
  const key = siteSeed(site)
  if (coverCache.key === key && coverCache.profiles.length) {
    return coverCache.profiles
  }
  coverCache = {
    key,
    profiles: RANGES.map((range) => ({radius: range.radius, heights: crestHeights(range, Math.abs(key))})),
  }
  return coverCache.profiles
}

/**
 * 그 방위에서 땅과 산맥이 가리는 고도(도). 평평한 지평선은 0°이고, 그 방향에서 가장 높이 보이는 산마루가 더 높으면 그 각이다.
 * 메쉬의 각은 동쪽(0)에서 북쪽으로 늘어나고, 방위각은 북쪽 0°·동쪽 90°이다.
 *
 * @param {number} azimuthDeg 방위각(도)
 * @param {{lat: number, lon: number}} site
 * @param {number} [eyeHeightM=2] 지면에서 눈까지의 높이
 * @returns {number} 도
 */
export function horizonCoverDeg(azimuthDeg, site, eyeHeightM = 2) {
  const theta = ((Math.PI / 2) - (azimuthDeg * Math.PI / 180))
  const turn = ((theta % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI)
  const f = (turn / (2 * Math.PI)) * SEGMENTS
  const i0 = Math.floor(f) % SEGMENTS
  const i1 = (i0 + 1) % SEGMENTS
  const blend = f - Math.floor(f)
  let cover = 0
  for (const profile of coverProfiles(site)) {
    const height = profile.heights[i0] + ((profile.heights[i1] - profile.heights[i0]) * blend)
    cover = Math.max(cover, Math.atan2(height - eyeHeightM, profile.radius) * 180 / Math.PI)
  }
  return cover
}

function ridgeGeometry(T, range, seed, groundColor) {
  const count = SEGMENTS + 1
  const heights = new Float32Array(count)
  const crest = crestHeights(range, seed)
  for (let i = 0; i < count; i++) {
    heights[i] = crest[i % SEGMENTS]
  }
  // 한 지점마다 세 줄: 땅 아래, 땅 높이, 산마루. 아래 두 줄은 땅의 색·법선(위쪽)과 같아서, 벽이 땅과 만나는
  // 곳에 선이 생기지 않고 기슭이 평지로 이어진다. 산마루만 비탈에 맞춘 법선과 숲·바위 색을 갖는다.
  const rows = 3
  const positions = new Float32Array(count * rows * 3)
  const normals = new Float32Array(count * rows * 3)
  const colors = new Float32Array(count * rows * 3)
  const forest = FOREST.map(toLinear)
  const rock = ROCK.map(toLinear)
  const haze = HAZE.map(toLinear)
  const step = (2 * Math.PI * range.radius) / SEGMENTS
  for (let i = 0; i < count; i++) {
    const angle = (i / SEGMENTS) * 2 * Math.PI
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    // 이웃 몇 칸을 걸쳐 기울기를 구해 줄무늬가 지지 않게 한다.
    const span = 3
    const before = heights[(i + SEGMENTS - span) % SEGMENTS]
    const after = heights[(i + span) % SEGMENTS]
    const slope = (after - before) / (2 * span * step)
    const nx = (-cos * 0.8) + (sin * slope * 0.9)
    const ny = (-sin * 0.8) - (cos * slope * 0.9)
    const nz = 0.55
    const length = Math.hypot(nx, ny, nz)
    const fraction = (heights[i] - range.minHeight) / (range.height - range.minHeight)
    for (let row = 0; row < rows; row++) {
      const k = ((i * rows) + row) * 3
      positions[k] = range.radius * cos
      positions[k + 1] = range.radius * sin
      positions[k + 2] = [-BASE_DEPTH_M, 0, heights[i]][row]
      const crest = row === 2
      normals[k] = crest ? nx / length : 0
      normals[k + 1] = crest ? ny / length : 0
      normals[k + 2] = crest ? nz / length : 1
      for (let channel = 0; channel < 3; channel++) {
        // 위로 갈수록 바위, 멀리 있는 줄기일수록 하늘빛에 흐려진다.
        const top = mix(mix(forest[channel], rock[channel], 0.3 + (0.7 * fraction)), haze[channel], range.haze)
        colors[k + channel] = crest ? top : groundColor[channel]
      }
    }
  }
  const indices = []
  for (let i = 0; i < SEGMENTS; i++) {
    for (let row = 0; row < rows - 1; row++) {
      const a = ((i * rows) + row)
      const b = a + 1
      const c = a + rows
      const d = c + 1
      // 안쪽(관측자 쪽)에서 볼 때 반시계가 앞면이다.
      indices.push(a, b, c, b, d, c)
    }
  }
  const geometry = new T.BufferGeometry()
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new T.BufferAttribute(normals, 3))
  geometry.setAttribute('color', new T.BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  return geometry
}

function ridgeMaterial(T, skylight) {
  const material = new T.MeshStandardMaterial({vertexColors: true, roughness: 1, metalness: 0})
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSkylight = skylight
    shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uSkylight;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uSkylight;')
  }
  material.customProgramCacheKey = () => 'solar-atlas-ground-ridge'
  return material
}

/**
 * 땅 원판 둘레에 산맥 지평선을 세운다(장소가 바뀌었을 때만 모양을 다시 만든다).
 *
 * @param {object} c 천구 엔진
 * @param {object} patch 땅 원판(ground.js). 하늘빛 uniform(`userData.uSkylight`)을 함께 쓴다.
 * @param {{lat: number, lon: number}} site
 * @param {number[]} groundColor 땅의 평균색(선형 RGB, 조명 전): 산 기슭을 땅과 같은 색으로 잇는다.
 */
export function placeHorizon(c, patch, site, groundColor) {
  const T = c.three
  const key = siteSeed(site)
  if (patch.userData.horizonKey === key) {
    return
  }
  let group = patch.userData.horizon
  if (!group) {
    group = new T.Group()
    group.name = 'horizon'
    const material = ridgeMaterial(T, patch.material.userData.uSkylight)
    group.userData.material = material
    patch.userData.horizon = group
    patch.add(group)
  }
  for (const mesh of [...group.children]) {
    mesh.geometry.dispose()
    group.remove(mesh)
  }
  for (const range of RANGES) {
    const mesh = new T.Mesh(ridgeGeometry(T, range, Math.abs(key), groundColor), group.userData.material)
    mesh.name = 'horizon ridge'
    mesh.frustumCulled = false
    mesh.renderOrder = 1
    group.add(mesh)
  }
  patch.userData.horizonKey = key
}
