// 지상 천구의 땅.
//
// 지구 표면의 큰 지도(약 80MB)는 쓰지 않는다. 먼 땅은 한 색(보도블록의 평균색)으로 두고, 발밑에는 관측 지점에
// 접하는 평평한 원판(반지름 30km)에 도시 보도블록 무늬(public/assets/city_pavement.jpg)를 깐다. 무늬는
// 멀어질수록 평균색으로 흐려져서 원판 가장자리와 그 너머의 지구 표면이 이음매 없이 이어지고, 해가 지면 지구 표면과
// 같은 빛 계산으로 함께 어두워진다. 원판 둘레에는 노이즈로 만든 산맥 지평선(horizon.js)을 세운다.
// 천구 엔진의 three를 쓰기 위해 c.three로만 만든다.

import {placeHorizon} from './horizon.js'

// 텍스처 한 장(이어 붙여도 이음매가 없다)이 덮는 땅의 한 변(m)
const TILE_METERS = 0.8
const PATCH_RADIUS_M = 30000
// 보도블록 사진이 어둡게 보이지 않게 올리는 정도(가까운 땅과 먼 땅 모두)
const ALBEDO_GAIN = 1.3
// 이 파일(sky/ground.html) 기준 위치: 텍스처는 다른 천체 텍스처와 같은 public/assets 폴더에 둔다.
const TEXTURE_URL = '../assets/city_pavement.jpg'
// 먼 땅으로 흐려지는 거리(m)
const FADE_NEAR_M = 6
const FADE_FAR_M = 1500

// 태양 고도(도)에 따라 땅이 하늘빛·별빛을 받아 화면에 보이는 정도(흰색 땅 기준 표시 밝기). 직접 햇빛은 장면의
// 조명이 따로 계산하므로, 이것은 해가 낮거나 진 때에도 땅이 까맣게 사라지지 않고 어슴푸레 알아볼 수 있게 하는 값이다.
// 천구 엔진은 하늘 밝기에 맞춰 노출을 크게 바꾸므로(한낮 4e-5, 밤 80), 노출로 나눠 표시 밝기를 맞춘다.
const SKYLIGHT_DISPLAY_BY_SUN_ALTITUDE = [[-18, 0.3], [-12, 0.35], [-6, 0.45], [-3, 0.5], [0, 0.4], [10, 0.3], [25, 0.25]]

let groundPixel = null
let noLights = null
let tile = null
// 땅 무늬의 평균색(선형 값과 sRGB 바이트)
const mean = {linear: [0, 0, 0], srgb: [0, 0, 0]}

function pixel(T, rgba, srgb) {
  const texture = new T.DataTexture(rgba, 1, 1)
  if (srgb) {
    texture.colorSpace = T.SRGBColorSpace
  }
  texture.needsUpdate = true
  return texture
}

const toLinear = (byte) => {
  const s = byte / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const toSrgbByte = (value) => {
  const s = value <= 0.0031308 ? value * 12.92 : (1.055 * (value ** (1 / 2.4))) - 0.055
  return Math.round(Math.min(1, Math.max(0, s)) * 255)
}

/**
 * 도시 바닥 무늬를 내려받아 반복 텍스처로 만든다(땅을 처음 놓기 전에 한 번 기다린다). 평균색도 여기서 구한다.
 *
 * @param {object} c 천구 엔진
 */
export async function loadGroundTexture(c) {
  if (tile) {
    return
  }
  const T = c.three
  const image = new Image()
  image.src = new URL(TEXTURE_URL, location.href).href
  try {
    await image.decode()
  } catch (error) {
    throw new Error(`땅 텍스처(${TEXTURE_URL})를 불러오지 못했습니다.`, {cause: error})
  }
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d', {willReadFrequently: true})
  context.drawImage(image, 0, 0)
  const {data} = context.getImageData(0, 0, canvas.width, canvas.height)
  const sum = [0, 0, 0]
  const count = canvas.width * canvas.height
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 3; k++) {
      sum[k] += toLinear(data[(i * 4) + k])
    }
  }
  mean.linear = sum.map((total) => total / count)
  mean.srgb = mean.linear.map(toSrgbByte)

  const texture = new T.Texture(canvas)
  texture.colorSpace = T.SRGBColorSpace
  texture.wrapS = texture.wrapT = T.RepeatWrapping
  texture.magFilter = T.LinearFilter
  texture.minFilter = T.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = c.ui.renderer.capabilities.getMaxAnisotropy()
  const repeat = (2 * PATCH_RADIUS_M) / TILE_METERS
  texture.repeat.set(repeat, repeat)
  texture.needsUpdate = true
  tile = texture
}

function groundTile() {
  if (!tile) {
    throw new Error('땅 텍스처를 아직 불러오지 못했습니다(loadGroundTexture).')
  }
  return tile
}

function plainMaterial(m) {
  let changed = m.map !== groundPixel
  m.map = groundPixel
  for (const key of ['bumpMap', 'normalMap', 'roughnessMap', 'metalnessMap']) {
    changed ||= m[key] !== null
    m[key] = null
  }
  if (m.userData.uNightMap && m.userData.uNightMap.value !== noLights) {
    m.userData.uNightMap.value = noLights
  }
  if (changed) {
    m.needsUpdate = true
  }
}

/** 지구 표면의 지도를 평균색 한 점으로 바꾼다(지도가 다시 설정되어도 그리기 전에 바꾼다). */
export function plainGround(c) {
  const T = c.three
  groundTile()
  groundPixel ??= pixel(T, new Uint8Array([...mean.srgb, 255]), true)
  noLights ??= pixel(T, new Uint8Array([0, 0, 0, 255]), false)
  c.scene.objects.earth?.traverse((o) => {
    if (o.name !== 'planet surface' || !o.material || o.userData.plainGround) {
      return
    }
    o.userData.plainGround = true
    const before = o.onBeforeRender
    o.onBeforeRender = function(...args) {
      plainMaterial(this.material)
      return before.apply(this, args)
    }
    plainMaterial(o.material)
  })
}

function patchMaterial(c) {
  const T = c.three
  const material = new T.MeshStandardMaterial({map: groundTile(), roughness: 1, metalness: 0})
  const uMean = {value: new T.Vector3(...mean.linear)}
  material.userData.uSkylight = {value: 0}
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGroundMean = uMean
    shader.uniforms.uSkylight = material.userData.uSkylight
    shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec3 uGroundMean;
          uniform float uSkylight;
          float groundHash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }
          float groundNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - (2.0 * f));
            return mix(mix(groundHash(i), groundHash(i + vec2(1.0, 0.0)), f.x),
                mix(groundHash(i + vec2(0.0, 1.0)), groundHash(i + vec2(1.0, 1.0)), f.x), f.y);
          }`)
        .replace('#include <map_fragment>', `
          #ifdef USE_MAP
            vec3 nearGround = texture2D(map, vMapUv).rgb;
            // 몇 미터 크기로 번지는 얼룩(물기·때)으로 같은 무늬의 반복을 가린다.
            vec2 meters = vMapUv * ${TILE_METERS.toFixed(3)};
            float stain = (0.6 * groundNoise(meters / 1.7)) + (0.4 * groundNoise(meters / 6.5));
            nearGround *= 0.7 + (0.6 * stain);
            float groundDistance = length(vViewPosition);
            diffuseColor.rgb *= ${ALBEDO_GAIN.toFixed(2)} * mix(nearGround, uGroundMean, smoothstep(${FADE_NEAR_M.toFixed(1)}, ${FADE_FAR_M.toFixed(1)}, groundDistance));
            totalEmissiveRadiance += diffuseColor.rgb * uSkylight;
          #endif`)
  }
  material.customProgramCacheKey = () => 'solar-atlas-ground-patch'
  return material
}

/**
 * 관측 지점에 접하는 도시 바닥 원판과 산맥 지평선을 지구에 붙인다(이미 있으면 옮긴다).
 *
 * @param {object} c 천구 엔진
 * @param {{lat: number, lon: number, alt: number}} site
 * @param {{up: object, north: object, east: object}} axes 지점의 지평 좌표축(천체 고정 좌표계)
 */
export function placeGroundPatch(c, site, axes) {
  const T = c.three
  const earth = c.scene.objects.earth
  if (!earth) {
    return
  }
  let patch = earth.userData.groundPatch
  if (!patch) {
    patch = new T.Mesh(new T.CircleGeometry(PATCH_RADIUS_M, 96), patchMaterial(c))
    patch.name = 'ground patch'
    patch.frustumCulled = false
    patch.renderOrder = 1
    earth.userData.groundPatch = patch
    earth.add(patch)
  }
  const radius = earth.props.radius.scalar + (site.alt ?? 0)
  patch.position.copy(axes.up).multiplyScalar(radius)
  // 원판은 XY 평면에 놓이고 +Z가 위: x 동쪽, y 북쪽, z 위.
  patch.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(axes.east, axes.north, axes.up))
  placeHorizon(c, patch, site, mean.linear.map((value) => value * ALBEDO_GAIN))
  patch.updateMatrixWorld(true)
}

let sunVector = null

/** 태양 고도(도)에서의 표시 밝기(로그로 이어 붙인다). */
function skylightDisplay(altitudeDeg) {
  const table = SKYLIGHT_DISPLAY_BY_SUN_ALTITUDE
  if (altitudeDeg <= table[0][0]) {
    return table[0][1]
  }
  for (let i = 1; i < table.length; i++) {
    if (altitudeDeg <= table[i][0]) {
      const [a0, v0] = table[i - 1]
      const [a1, v1] = table[i]
      const t = (altitudeDeg - a0) / (a1 - a0)
      return Math.exp(Math.log(v0) + ((Math.log(v1) - Math.log(v0)) * t))
    }
  }
  return table[table.length - 1][1]
}

/**
 * 태양이 낮거나 진 때에도 땅이 알아볼 만큼 하늘빛을 받게 한다(프레임마다 부른다).
 *
 * @param {object} c 천구 엔진
 * @param {object} up 관측 지점의 위 방향(천체 고정 좌표계)
 */
export function updateGroundLight(c, up) {
  const altitude = sunAltitude(c, up)
  const patch = c.scene.objects.earth?.userData.groundPatch
  if (altitude === null || !patch) {
    return
  }
  const exposure = c.ui.renderer.toneMappingExposure
  patch.material.userData.uSkylight.value = exposure > 0 ? skylightDisplay(altitude) / exposure : 0
}

/**
 * 관측 지점에서 본 태양 고도(도). 땅 조각이 아직 없으면 null.
 *
 * @param {object} c 천구 엔진
 * @param {object} [up] 관측 지점의 위 방향(천체 고정 좌표계). 없으면 땅 조각 위치에서 구한다
 * @returns {?number}
 */
function sunAltitude(c, up) {
  const earth = c.scene.objects.earth
  const patch = earth?.userData.groundPatch
  const world = c.scene.worldGroup
  if (!patch || !world) {
    return null
  }
  sunVector ??= new c.three.Vector3()
  // 태양은 월드 그룹의 원점에 있다. 지구 좌표계로 옮겨 관측 지점에서 본 방향을 구한다.
  world.getWorldPosition(sunVector)
  earth.worldToLocal(sunVector)
  sunVector.sub(patch.position).normalize()
  const zenith = up ?? patch.position.clone().normalize()
  return Math.asin(Math.max(-1, Math.min(1, sunVector.dot(zenith)))) * 180 / Math.PI
}

// 이 고도보다 낮으면 하늘에 태양빛이 없다(천문박명이 끝나는 -18°). 항해박명 끝(-12°)부터 서서히 줄인다.
const SKY_SUN_FULL_ALT = -12
const SKY_SUN_NONE_ALT = -18

/** @param {number} altitude 태양 고도(도) @returns {number} 0(태양빛 없음)~1 */
export function skySunFactor(altitude) {
  const t = Math.min(1, Math.max(0, (altitude - SKY_SUN_NONE_ALT) / (SKY_SUN_FULL_ALT - SKY_SUN_NONE_ALT)))
  return t * t * (3 - (2 * t))
}

/**
 * 태양빛이 하늘에 닿는 정도(0: 천문박명 아래 깊은 밤, 1: 항해박명 이상). 구름처럼 햇빛 없이는 보이지 않아야 할 것에 곱한다.
 * 밤에는 자동 노출이 아주 커져서, 남은 약한 빛에 비친 구름이 하늘에 하얗게 떠 보이기 때문이다.
 *
 * @param {object} c 천구 엔진
 * @returns {number}
 */
export function skyLightFactor(c) {
  const altitude = sunAltitude(c)
  return altitude === null ? 1 : skySunFactor(altitude)
}

/**
 * 밤하늘을 완전히 어둡게 한다. 천구 엔진의 대기는 태양이 한참 아래(예: -50°)에 있어도 아주 약한 빛이
 * 새는데, 자동 노출이 밤에 노출을 올려 가며 그 빛을 하늘색 얼룩으로 키운다. 태양이 천문박명 아래로 내려가면
 * 대기에 들어가는 태양 세기를 0으로 만들어(-12°~-18°에서 서서히) 하늘을 별빛과 은하수만 남긴다. 지평선에 석양처럼
 * 번져 보이는 황도광도 함께 끈다.
 *
 * @param {object} c 천구 엔진
 */
export function darkenNightSky(c) {
  const ui = c.ui
  if (ui._nightSkyDarkened || typeof ui._updateAtmUniforms !== 'function') {
    return
  }
  const original = ui._updateAtmUniforms
  ui._updateAtmUniforms = function darkened(...args) {
    const result = original.apply(this, args)
    const uniforms = this._atmMesh?.material.uniforms
    // 대기를 그리지 않는 프레임에는 원본이 세기를 건드리지 않으므로 곱하지 않는다.
    if (uniforms?.uAtmEnabled?.value === 1) {
      const altitude = sunAltitude(c)
      if (altitude !== null) {
        uniforms.uSunIntensity.value *= skySunFactor(altitude)
      }
    }
    return result
  }
  // 황도광(zodiacal light)과 은하수의 빛은 밤 노출이 커지면 지평선 쪽에서 노랗게 번져 석양처럼 보인다.
  // 도시의 밤하늘에서는 둘 다 보이지 않으므로, 황도광은 끄고 은하수 빛은 천문박명 아래에서 서서히 끈다.
  const originalNight = ui._updateNightSky
  if (typeof originalNight === 'function') {
    ui._updateNightSky = function darkNightLight(...args) {
      const result = originalNight.apply(this, args)
      const uniforms = this._atmMesh?.material.uniforms
      if (uniforms?.uZodiacalScale) {
        uniforms.uZodiacalScale.value = 0
      }
      if (uniforms?.uGalaxyScale) {
        uniforms.uGalaxyScale.value *= skyLightFactor(c)
      }
      return result
    }
  }
  // 밤하늘 빛을 그릴지는 원래 "그 빛이 지금 노출에서 보일 만큼 밝은가"로 매 프레임 정한다. 그런데 그리느냐에 따라 자동 노출의
  // 측광값이 달라져(그리면 목표 게인이 40으로 뛰고, 안 그리면 6쯤으로 내려간다), 박명 때 노출 → 그림 여부 → 노출이 서로를
  // 되먹임하며 0.5초쯤 주기로 하늘 밝기가 깜빡인다. 그림 여부를 노출이 아닌 태양 고도로만 정해 되먹임을 끊는다.
  const originalShown = ui._updateNightSkyShown
  if (typeof originalShown === 'function') {
    ui._updateNightSkyShown = function steadyNightSky(...args) {
      const result = originalShown.apply(this, args)
      const altitude = sunAltitude(c)
      if (altitude !== null) {
        this._nightSkyShown = this.hdr && altitude < NIGHT_SKY_SHOWN_ALT && !this._groundFillsView()
        const galaxy = this._milkyWay?.userData.galaxy
        if (galaxy) {
          galaxy.skip = this.hdr && !this._nightSkyShown
        }
      }
      return result
    }
  }
  ui._nightSkyDarkened = true
}

// 태양이 이 고도보다 낮으면 밤하늘 빛을 그린다(항해박명 중간). 이보다 높은 하늘은 밝아서 그 빛이 보이지 않는다.
const NIGHT_SKY_SHOWN_ALT = -9
