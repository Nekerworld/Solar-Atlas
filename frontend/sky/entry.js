// Solar Atlas 지상 모드의 천구 엔진.
//
// 천구 엔진의 메인 클래스를
// React 셸 없이 띄우는 진입점이다. build.mjs가 별도 번들(public/sky/)로 만들고,
// Vue 앱(src/scene/atlasSky.js)이 iframe으로 올려 postMessage로만 제어한다.
// 따라서 Vue 앱의 three(0.140)와 천구 엔진의 three(0.171)가 섞이지 않고,
// 천구 엔진의 전역(window.c, location.hash, 키 입력)도 이 iframe 안에 갇힌다.
//
// 부팅 방식은 천구 엔진의 sky guest(js/sky/sky.js)를 따르되 NetGL 대신 자체 렌더러를 쓴다.
//
// 부모 → 이 페이지
//   {type:'atlas:view', lat, lon, alt, timeMs, azimuth?, altitude?}  장소·시각(·시선) 설정. 시선은 부드럽게 돌아간다
//   {type:'atlas:aim', azimuth, altitude}                           시선만 부드럽게 돌린다
//   {type:'atlas:clock', factor}                                    시간 흐름 배율(0이면 멈춤). 시간은 이 페이지가 프레임마다 흘린다
//   {type:'atlas:active', value}                                    그림 그리기 시작/중지
//   {type:'atlas:settings', settings:{p,l,o,a,i,e,x}}               표시 설정(천구 엔진 설정 문자: 이름표·궤도·별자리선·구름·격자)
//   {type:'atlas:bodies', startMs, stepMs, count, bodies:[{id,ko,en,category,parent,ra,dec,...}]}  소천체의 Horizons 적경·적위 표(skyBodies.js)
//   {type:'atlas:orbit', id, center, points}                         소천체의 궤도선(타원, AU). 클릭한 천체가 요청한다
// 이 페이지 → 부모
//   {type:'atlas:progress', stage}   'engine' → 'earth' → 'sky'
//   {type:'atlas:ready'}             지구 위에 서서 첫 화면을 그릴 수 있음
//   {type:'atlas:gaze', azimuth, altitude}   시선이 바뀔 때마다(프레임마다)
//   {type:'atlas:time', timeMs}      천구의 시각이 바뀌면(초당 5번 안팎)
//   {type:'atlas:pick', pick: {kind, name, label}|null, x, y}  천구에서 이름표가 붙은 천체를 클릭(label은 한국어 이름, 빈 곳이면 pick은 null)
//   {type:'atlas:key', code}         스페이스바(시간 멈춤·재개는 부모가 한다)
//   {type:'atlas:need-orbit', id, timeMs}  클릭한 소천체의 궤도 요소가 필요하다
//   {type:'atlas:error', message}
import SkyEngine from 'atlas-engine'
import useStore from 'atlas/store/useStore.js'
import {targets} from 'atlas/shared.js'
import {labelBoxes} from 'atlas/scene/labelPick.js'
import {koName, koreanizeCanvasText} from './koNames.js'
import {darkenNightSky, loadGroundTexture, placeGroundPatch, plainGround, skyLightFactor, updateGroundLight} from './ground.js'
import {horizonCoverDeg} from './horizon.js'
import {createSkyOverlay} from './skyBodies.js'
import {addConstellationBounds} from './constellationBounds.js'
import {createConstellationArt} from './constellationArt.js'
import {placeSkyReadability} from './starReadability.js'

// 이름표(별·별자리·천체)가 캔버스에 글자를 그리기 전에, 영어 이름을 한국어로 바꾸게 해 둔다.
koreanizeCanvasText()

// 천구 엔진이 쓰는 three. 이 파일이 three를 직접 import하면 번들에 다른 사본이 끼어
// 그 사본의 텍스처를 천구 엔진의 렌더러가 읽지 못하므로, 생성 뒤 c.three로만 쓴다.
let T = null
const ignore = () => undefined
const parentWindow = window.parent
const post = (message) => parentWindow.postMessage(message, location.origin)

// 이 iframe의 주소·히스토리는 부모와 한 세션 기록을 공유하므로 건드리지 않는다.
history.pushState = history.replaceState.bind(history)
SkyEngine.prototype._schedulePermalinkUpdate = ignore

const DEG = Math.PI / 180
const EYE_HEIGHT_M = 2
const READY_WAIT_MS = 45000

/**
 * @param {Function} test 참이 될 때까지 기다리는 조건
 * @param {number} timeoutMs 이 시간이 지나면 거짓인 채로 끝낸다
 * @returns {Promise<boolean>} 조건이 참이 되었는지
 */
function until(test, timeoutMs) {
  return new Promise((resolve) => {
    const started = performance.now()
    const poll = setInterval(() => {
      const ok = Boolean(test())
      if (ok || performance.now() - started > timeoutMs) {
        clearInterval(poll)
        resolve(ok)
      }
    }, 100)
  })
}

/**
 * 관측 지점의 지평 좌표계 축. 천체 고정 좌표계(+Y 북극, +X 그리니치, 동쪽은 -Z 쪽)에서
 * coords.js latLngAltToBodyFixed와 같은 규약이다.
 *
 * @param {number} lat 도
 * @param {number} lon 도
 * @returns {{up: object, north: object, east: object}}
 */
function horizonAxes(lat, lon) {
  const p = lat * DEG
  const l = lon * DEG
  return {
    up: new T.Vector3(Math.cos(p) * Math.cos(l), Math.sin(p), -Math.cos(p) * Math.sin(l)),
    north: new T.Vector3(-Math.sin(p) * Math.cos(l), Math.cos(p), Math.sin(p) * Math.sin(l)),
    east: new T.Vector3(-Math.sin(l), 0, -Math.cos(l)),
  }
}

/**
 * 방위각(북 0°, 동 90°)·고도각 방향을 바라보는 카메라 자세.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {number} azimuth 도
 * @param {number} altitude 도
 * @param {object} out three Quaternion
 * @returns {object} out
 */
function lookQuaternion(lat, lon, azimuth, altitude, out) {
  const {up, north, east} = horizonAxes(lat, lon)
  const az = azimuth * DEG
  const alt = Math.max(-89.9, Math.min(89.9, altitude)) * DEG
  const forward = new T.Vector3()
      .addScaledVector(north, Math.cos(alt) * Math.cos(az))
      .addScaledVector(east, Math.cos(alt) * Math.sin(az))
      .addScaledVector(up, Math.sin(alt))
      .normalize()
  // 카메라는 -Z를 보고 +Y가 위다.
  const back = forward.clone().negate()
  const right = new T.Vector3().crossVectors(up, back).normalize()
  const top = new T.Vector3().crossVectors(back, right)
  return out.setFromRotationMatrix(new T.Matrix4().makeBasis(right, top, back))
}

let c = null
// 소천체·황도선·궤도 정책(skyBodies.js). 표는 엔진이 뜨기 전에 와도 기억했다가 만들어지면 넘긴다.
let sky = null
let pendingBodies = null
let pendingOrbits = []
let pendingVisibility = null
// 부모가 정한 표시 설정. 엔진이 뜨기 전에 와도 기억했다가 부팅 때 적용한다.
// 라벨·별자리·구름은 켜 두고, 궤도·격자는 끈다. 구름(i)은 엔진에는 켜 둔 채 아래에서 따로 페이드한다.
const wanted = {p: true, l: true, o: false, a: true, i: true, e: false, x: false}
let site = null
let siteKey = ''
let active = false

// 시간 흐름 배율(0이면 멈춤). 초당 10분 이상으로 흐르면 구름·월별 지도처럼 시간마다 새로 만드는 무거운
// 일을 쉬고 구름 부피를 낮은 해상도로 그려서 프레임을 지킨다.
const FAST_CLOCK_FACTOR = 600
let clockFactor = 0
let lastTimeReportMs = 0
let lastReportedTime = NaN

// 프로그램이 시선을 돌릴 때의 움직임, 마지막으로 알린 시선
let tween = null
// 천체를 클릭했을 때의 살짝 확대: 클릭한 점의 하늘이 그 자리에 머무르게 시야각만 줄인다(가운데로 끌지 않는다)
let zoomAnim = null
let lastGaze = {azimuth: NaN, altitude: NaN}

// 이름표 위에 마우스를 올렸을 때의 강조
const HOVER_SLOP_PX = 8
const HOVER_EVERY_MS = 80
let pointer = null
let lastHoverMs = 0
let hoverBox = null
// 마우스가 올라간 별자리 이름표의 별자리(그 그림을 선 뒤에 희미하게 띄운다)
let hoverArtName = null
let constellationArt = null

// 다른 표시 토글(fade.js, 400ms)과 같이 구름도 켜고 끌 때 서서히 나온다. 엔진의 구름 스위치는
// 바로 숨기므로, 엔진에는 켜 둔 채 껍질 투명도와 부피 노출만 이 값으로 곱한다.
const CLOUD_FADE_MS = 400
let cloudGoal = 1
let cloudOpacity = 1
let cloudFrom = 1
let cloudStarted = 0

function setCloudGoal(on) {
  const goal = on ? 1 : 0
  if (goal === cloudGoal) {
    return
  }
  cloudFrom = cloudOpacity
  cloudGoal = goal
  cloudStarted = performance.now()
}

function stepCloudFade(now) {
  if (cloudOpacity === cloudGoal) {
    return
  }
  const t = Math.min(1, (now - cloudStarted) / CLOUD_FADE_MS)
  const eased = t * t * (3 - (2 * t))
  cloudOpacity = cloudFrom + ((cloudGoal - cloudFrom) * eased)
  if (t >= 1) {
    cloudOpacity = cloudGoal
  }
}

let cloudShell = null

/** 구름 껍질에 페이드를 한 번 건다. */
function installCloudFade() {
  if (cloudShell?.userData?.atlasFadeHook) {
    return
  }
  let shell = null
  c?.scene?.objects?.earth?.traverse((object) => {
    if (!shell && object.name === 'clouds') {
      shell = object
    }
  })
  if (!shell) {
    return
  }
  cloudShell = shell
  shell.userData.atlasFadeHook = true
  shell.userData.atlasFade = cloudOpacity
  const pre = shell.preAnimCb
  shell.preAnimCb = function fadeCloudShell(time) {
    pre?.call(this, time)
    this.visible = (this.userData.atlasFade ?? 1) > 0.004
  }
  const before = shell.onBeforeRender
  shell.onBeforeRender = function fadeCloudOpacity(...args) {
    before?.call(this, ...args)
    const fade = this.userData.atlasFade ?? 1
    const opacity = this.material?.uniforms?.uOpacity
    if (opacity && fade < 1) {
      opacity.value *= fade
    }
  }
  const ui = c.ui
  if (ui && !ui._atlasCloudFade) {
    ui._atlasCloudFade = true
    const draw = ui._drawCloudVolume.bind(ui)
    ui._drawCloudVolume = function fadeCloudVolume() {
      draw()
      const fade = shell.userData.atlasFade ?? 1
      const exposure = ui._atmMesh?.material?.uniforms?.uCloudExposure
      if (exposure && fade < 1) {
        exposure.value *= fade
      }
    }
  }
}

function applyWanted() {
  if (!c?.scene?.objects?.earth) {
    return
  }
  // 엔진의 구름 스위치는 페이드가 없다. 보이기는 유지하고 투명도만 바꾼다.
  c.scene.applySettings({...wanted, i: true})
  setCloudGoal(wanted.i !== false)
  installCloudFade()
}

/** @returns {object|null} 구름 부피를 그리는 CloudVolume */
function cloudVolume() {
  let found = null
  c.scene.objects.earth?.traverse((o) => {
    if (!found && o.userData?.volume) {
      found = o.userData.volume
    }
  })
  return found
}

/** 시간이 빠르게 흐를 때만 무거운 일을 줄인다. */
function applyFastClock() {
  const fast = Math.abs(clockFactor) >= FAST_CLOCK_FACTOR
  const volume = cloudVolume()
  if (!volume) {
    return
  }
  volume.fullScale ??= volume.options.scale
  volume.options.scale = fast ? Math.min(volume.fullScale, 0.25) : volume.fullScale
  const map = volume.cloudMap
  if (map) {
    // 하루마다 구름 지도를 새로 받아 합치는 일은 시간이 빠를 때 계속 끼어들어 프레임을 끊는다.
    map.fullUpdate ??= map.update
    map.update = fast ? () => undefined : map.fullUpdate
  }
}

/** @param {number} factor 시간 흐름 배율. 0이면 멈춘다. */
function setClock(factor) {
  clockFactor = Number.isFinite(factor) ? factor : 0
  if (!c) {
    return
  }
  c.time.timeScale = clockFactor || 1
  c.time.isPaused = clockFactor === 0 || !active
  c.time.lastUpdate = Date.now()
  // 멈추거나 배율이 바뀐 순간의 시각을 곧바로 알린다.
  lastReportedTime = NaN
  lastTimeReportMs = 0
  applyFastClock()
}

/**
 * @param {object} view {lat, lon, alt, timeMs, azimuth, altitude}
 */
function applyView(view) {
  const {lat, lon} = view
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(view.timeMs)) {
    return
  }
  const alt = view.alt ?? 0
  c.time.setTime(view.timeMs)
  c.time.lastUpdate = Date.now()
  const key = `${lat},${lon},${alt}`
  const aimed = Number.isFinite(view.azimuth) && Number.isFinite(view.altitude)
  const moved = key !== siteKey
  if (moved) {
    siteKey = key
    site = {lat, lon, alt}
    tween = null
    stand()
    if (!aimed) {
      // 장소가 바뀌면 남쪽(남반구는 북쪽)을 향해 비스듬히 올려다본다.
      lookQuaternion(lat, lon, lat >= 0 ? 180 : 0, 30, c.ui.camera.quaternion)
    }
  }
  if (aimed) {
    if (moved) {
      lookQuaternion(lat, lon, view.azimuth, view.altitude, c.ui.camera.quaternion)
    } else {
      startAim(view.azimuth, view.altitude)
    }
  }
}

/** 지구 위에 서 있게 한다. 다른 곳으로 끌려가 있으면 되돌린다. */
function stand() {
  c.scene.land('earth', site.lat, site.lon, site.alt + EYE_HEIGHT_M, {instant: true})
  plainGround(c)
  placeGroundPatch(c, site, horizonAxes(site.lat, site.lon))
  applyFastClock()
  targets.track = false
  targets.tween = null
  c.ui._approach = null
}

/** @returns {boolean} 지금 지구 위에 서 있는지 */
function standing() {
  return Boolean(targets.landed) && c.ui.camera.platform.parent === c.scene.objects.earth
}

/**
 * 지금 카메라가 바라보는 방위각·고도각(도). 끌어서 돌리면 카메라 자신의 축으로 돌아 지평선이
 * 기울기 때문에, 이 값으로 자세를 다시 세워 지평선을 수평으로 유지한다.
 *
 * @returns {{azimuth: number, altitude: number}}
 */
function currentGaze() {
  const {up, north, east} = horizonAxes(site.lat, site.lon)
  const forward = new T.Vector3(0, 0, -1).applyQuaternion(c.ui.camera.quaternion)
  const altitude = Math.asin(Math.max(-1, Math.min(1, forward.dot(up)))) / DEG
  const azimuth = (Math.atan2(forward.dot(east), forward.dot(north)) / DEG + 360) % 360
  return {azimuth, altitude}
}

/**
 * 시선을 그 방향으로 부드럽게 돌린다(처음엔 빠르게, 끝에서 천천히). 사용자가 끌기 시작하면 멈춘다.
 *
 * @param {number} azimuth 도
 * @param {number} altitude 도
 */
function startAim(azimuth, altitude) {
  const from = currentGaze()
  const delta = ((azimuth - from.azimuth + 540) % 360) - 180
  const rise = altitude - from.altitude
  const span = Math.max(Math.abs(delta), Math.abs(rise))
  tween = {
    azimuth: from.azimuth, altitude: from.altitude, delta, rise,
    started: performance.now(), duration: Math.min(700, 250 + (span * 4)),
  }
}

/** 시선이 바뀌었으면 부모에 알린다(프레임마다 불러도 된다). */
function reportGaze(gaze) {
  // 처음(NaN)에는 무조건 알린다.
  const sameAz = Math.abs(((gaze.azimuth - lastGaze.azimuth + 540) % 360) - 180) < 0.02
  const sameAlt = Math.abs(gaze.altitude - lastGaze.altitude) < 0.02
  if (sameAz && sameAlt) {
    return
  }
  lastGaze = gaze
  post({type: 'atlas:gaze', azimuth: gaze.azimuth, altitude: gaze.altitude})
}

/** 천구의 시각이 바뀌었으면 초당 5번까지 부모에 알린다. */
function reportTime(nowMs) {
  const timeMs = c.time.simTime
  if (nowMs - lastTimeReportMs < 200 || timeMs === lastReportedTime) {
    return
  }
  lastTimeReportMs = nowMs
  lastReportedTime = timeMs
  post({type: 'atlas:time', timeMs})
}

let rayRight = null
let rayTop = null
let rayBack = null
let rayDir = null

/**
 * 화면의 한 점이 가리키는 방위각·고도각(도). 화면 중심은 카메라가 보는 방향이다.
 *
 * @param {number} x CSS px
 * @param {number} y CSS px
 * @param {DOMRect} rect 캔버스
 * @param {{up: object, north: object, east: object}} axes
 * @returns {{azimuth: number, altitude: number}}
 */
function directionAt(x, y, rect, axes) {
  rayRight ??= new T.Vector3()
  rayTop ??= new T.Vector3()
  rayBack ??= new T.Vector3()
  rayDir ??= new T.Vector3()
  const nx = ((x - rect.left) / rect.width) * 2 - 1
  const ny = 1 - (((y - rect.top) / rect.height) * 2)
  const tanV = Math.tan((c.ui.camera.fov * DEG) / 2)
  const tanH = tanV * (rect.width / Math.max(rect.height, 1))
  const q = c.ui.camera.quaternion
  rayDir.set(0, 0, 0)
      .addScaledVector(rayRight.set(1, 0, 0).applyQuaternion(q), nx * tanH)
      .addScaledVector(rayTop.set(0, 1, 0).applyQuaternion(q), ny * tanV)
      .addScaledVector(rayBack.set(0, 0, 1).applyQuaternion(q), -1)
      .normalize()
  const altitude = Math.asin(Math.max(-1, Math.min(1, rayDir.dot(axes.up)))) / DEG
  const azimuth = (Math.atan2(rayDir.dot(axes.east), rayDir.dot(axes.north)) / DEG + 360) % 360
  return {azimuth, altitude}
}

/**
 * 이름표 전체가 지평선·산맥 아래에 있는지. 글자 맨 위 몇 점이 모두 그 방위의 산마루보다 낮으면 완전히 가려진 것이다.
 * 한 점이라도 산마루 위에 있으면 일부가 보이므로 선택할 수 있다.
 *
 * @param {{left: number, top: number, width: number}} box
 * @param {DOMRect} rect
 * @param {{up: object, north: object, east: object}} axes
 * @returns {boolean}
 */
function fullyBehindGround(box, rect, axes) {
  const y = box.top
  for (let step = 0; step <= 3; step++) {
    const {azimuth, altitude} = directionAt(box.left + ((box.width * step) / 3), y, rect, axes)
    if (altitude >= horizonCoverDeg(azimuth, site, EYE_HEIGHT_M)) {
      return false
    }
  }
  return true
}

/**
 * 화면의 한 점에 있는 이름표(이름표 글자 상자에 몇 픽셀 여유를 둔다).
 * 지평선과 산맥에 글자 전체가 가려진 이름표는 고르지 않는다.
 *
 * @param {number} x CSS px
 * @param {number} y CSS px
 * @returns {object|null} labelBoxes의 상자(target 포함)
 */
function labelAt(x, y) {
  const canvas = c.ui.renderer.domElement
  const pixelRatio = c.ui.renderer.getPixelRatio?.() ?? 1
  const rect = canvas.getBoundingClientRect()
  const boxes = labelBoxes(c.ui.scene, c.ui.camera, rect, pixelRatio)
  const axes = site && rect.height > 0 ? horizonAxes(site.lat, site.lon) : null
  let best = null
  let bestDist = Infinity
  for (const b of boxes) {
    if (x < b.left - HOVER_SLOP_PX || x > b.left + b.width + HOVER_SLOP_PX ||
        y < b.top - HOVER_SLOP_PX || y > b.top + b.height + HOVER_SLOP_PX) {
      continue
    }
    if (axes && fullyBehindGround(b, rect, axes)) {
      continue
    }
    const dx = x - (b.left + (b.width / 2))
    const dy = y - (b.top + (b.height / 2))
    const dist = (dx * dx) + (dy * dy)
    if (dist < bestDist || (dist === bestDist && b.depth < best.depth)) {
      best = b
      bestDist = dist
    }
  }
  return best
}

function ensureHoverBox() {
  if (hoverBox) {
    return hoverBox
  }
  hoverBox = document.body.appendChild(document.createElement('div'))
  hoverBox.style.cssText = 'position:fixed;display:none;pointer-events:none;z-index:5;box-sizing:border-box;' +
      'border:2px solid #ffd27a;border-radius:7px;background:rgba(255,210,122,0.16);' +
      'box-shadow:0 0 10px 2px rgba(255,210,122,0.55)'
  return hoverBox
}

// 이름표 칸은 글자의 em 윗변에서 시작해, 실제로 칠해진 글자(잉크)는 그보다 몇 픽셀 아래에 놓인다. 칸 전체를 감싸면
// 강조 테두리 안에서 글자가 아래·한쪽으로 쏠려 보이므로, 이름표 캔버스에서 잉크가 있는 영역을 한 번 읽어 두고
// 그 영역을 기준으로 상자를 그린다. 이름표는 만들어진 뒤 바뀌지 않아 시트·번호별로 캐시한다.
const inkCache = new WeakMap()

/**
 * @param {{sheet: object, index: number}} box labelBoxes의 상자
 * @returns {{left: number, top: number, right: number, bottom: number}|null} 칸 안 잉크 범위(시트 캔버스 픽셀)
 */
function inkOf(box) {
  const {sheet, index} = box
  let cache = inkCache.get(sheet)
  if (!cache) {
    cache = new Map()
    inkCache.set(sheet, cache)
  }
  if (cache.has(index)) {
    return cache.get(index)
  }
  let ink = null
  try {
    const size = sheet.size
    const coords = sheet.spriteCoords
    const side = Math.round(coords[(4 * index) + 2] * size)
    const x = Math.round(coords[4 * index] * size)
    const y = Math.round((1 - coords[(4 * index) + 1] - coords[(4 * index) + 3]) * size)
    // 한 줄 짧은 글자는 잉크 아랫부분이 칸 밖으로 조금 내려가므로 몇 줄 더 읽는다.
    const rows = Math.min(sheet.canvas.height - y, side + 4)
    const cols = Math.min(sheet.canvas.width - x, side)
    if (side > 0 && rows > 0 && cols > 0) {
      const data = sheet.ctx.getImageData(x, y, cols, rows).data
      let top = -1
      let bottom = -1
      let left = cols
      let right = -1
      for (let row = 0; row < rows; row++) {
        let any = false
        for (let col = 0; col < cols; col++) {
          if (data[(((row * cols) + col) * 4) + 3] > 24) {
            any = true
            left = Math.min(left, col)
            right = Math.max(right, col)
          }
        }
        if (any) {
          top = top < 0 ? row : top
          bottom = row
        } else if (top >= 0) {
          break // 잉크가 끝났다(아래 줄 이름표의 잉크는 읽지 않는다)
        }
      }
      if (top >= 0 && right >= left) {
        ink = {left, top, right: right + 1, bottom: bottom + 1}
      }
    }
  } catch {
    ink = null
  }
  cache.set(index, ink)
  return ink
}

/**
 * 호버 강조 상자를 글자(잉크) 기준으로 가운데 맞춘다.
 *
 * @param {object} hit labelBoxes의 상자
 * @param {number} pixelRatio
 * @returns {{left: number, top: number, width: number, height: number}} CSS px
 */
function textBox(hit, pixelRatio) {
  const ink = inkOf(hit)
  if (!ink) {
    return {left: hit.left, top: hit.top, width: hit.width, height: hit.height}
  }
  const k = (hit.sheet.scales?.[hit.index] ?? 1) / pixelRatio
  return {
    left: hit.left + (ink.left * k),
    top: hit.top + (ink.top * k),
    width: (ink.right - ink.left) * k,
    height: (ink.bottom - ink.top) * k,
  }
}

function hideHover() {
  if (hoverBox) {
    hoverBox.style.display = 'none'
  }
  hoverArtName = null
  document.body.style.cursor = ''
  c?.ui.renderer.domElement.style.removeProperty('cursor')
}

/**
 * 마우스가 올라간 이름표를 테두리로 강조하고 커서를 선택 모양으로 바꾼다(끌고 있을 때는 하지 않는다).
 *
 * @param {number} nowMs
 */
function updateHover(nowMs) {
  if (nowMs - lastHoverMs < HOVER_EVERY_MS) {
    return
  }
  lastHoverMs = nowMs
  const hit = pointer && !pointer.dragging ? labelAt(pointer.x, pointer.y) : null
  if (!hit) {
    hideHover()
    return
  }
  hoverArtName = hit.target?.kind === 'asterism' ? hit.target.name : null
  const box = ensureHoverBox()
  box.style.display = 'block'
  const text = textBox(hit, c.ui.renderer.getPixelRatio?.() ?? 1)
  box.style.left = `${text.left - 6}px`
  box.style.top = `${text.top - 4}px`
  box.style.width = `${text.width + 12}px`
  box.style.height = `${text.height + 8}px`
  document.body.style.cursor = 'pointer'
  c.ui.renderer.domElement.style.cursor = 'pointer'
}

// 천체를 클릭하면 휠을 네 칸쯤 굴린 만큼(시야각 약 0.62배) 확대한다. 휠 한 칸은 시야각을 exp(-0.12)배 한다.
const CLICK_ZOOM_FACTOR = Math.exp(-0.12 * 4)
const CLICK_ZOOM_MS = 320

/**
 * 클릭한 점을 기준으로 시야각을 줄이기 시작한다.
 *
 * @param {number} x CSS px
 * @param {number} y CSS px
 */
function startClickZoom(x, y) {
  if (!site) {
    return
  }
  const rect = c.ui.renderer.domElement.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    return
  }
  const fov = c.ui.camera.fov
  const target = Math.max(FOV_MIN_DEG, Math.min(FOV_MAX_DEG, fov * CLICK_ZOOM_FACTOR))
  if (target >= fov) {
    return
  }
  zoomAnim = {
    x, y, rect, from: fov, to: target, started: performance.now(),
    anchor: directionAt(x, y, rect, horizonAxes(site.lat, site.lon)),
  }
}

/**
 * 시야각을 한 걸음 줄이고, 클릭한 점의 하늘이 화면의 그 자리에 있도록 시선을 조금 옮긴다.
 *
 * @param {number} nowMs
 * @param {{azimuth: number, altitude: number}} gaze 지금 시선
 * @returns {{azimuth: number, altitude: number}} 옮긴 시선
 */
function stepClickZoom(nowMs, gaze) {
  const progress = Math.min(1, (nowMs - zoomAnim.started) / CLICK_ZOOM_MS)
  const eased = 1 - ((1 - progress) ** 3)
  c.ui.setFov(zoomAnim.from + ((zoomAnim.to - zoomAnim.from) * eased))
  const now = directionAt(zoomAnim.x, zoomAnim.y, zoomAnim.rect, horizonAxes(site.lat, site.lon))
  const dAz = ((zoomAnim.anchor.azimuth - now.azimuth + 540) % 360) - 180
  const moved = {
    azimuth: (gaze.azimuth + dAz + 360) % 360,
    altitude: Math.max(-89.9, Math.min(89.9, gaze.altitude + (zoomAnim.anchor.altitude - now.altitude))),
  }
  if (progress >= 1) {
    zoomAnim = null
  }
  return moved
}

/** @param {number} nowMs */
function frame(nowMs) {
  placeSkyReadability(c)
  if (site && !standing()) {
    stand()
  }
  let gaze = null
  if (site) {
    if (tween) {
      const progress = Math.min(1, (nowMs - tween.started) / tween.duration)
      const eased = 1 - ((1 - progress) ** 3)
      gaze = {
        azimuth: (tween.azimuth + (tween.delta * eased) + 360) % 360,
        altitude: tween.altitude + (tween.rise * eased),
      }
      if (progress >= 1) {
        tween = null
      }
    } else {
      gaze = currentGaze()
      if (zoomAnim) {
        gaze = stepClickZoom(nowMs, gaze)
      }
    }
    lookQuaternion(site.lat, site.lon, gaze.azimuth, gaze.altitude, c.ui.camera.quaternion)
    updateGroundLight(c, horizonAxes(site.lat, site.lon).up)
  }
  sky?.update(c.time.simTime, c.ui.camera.fov, nowMs)
  constellationArt?.update(nowMs, hoverArtName)
  stepCloudFade(nowMs)
  installCloudFade()
  if (cloudShell) {
    // 깊은 밤에는 구름이 보이지 않는다(밤 노출이 커서 하얗게 떠 보이는 것을 막는다).
    cloudShell.userData.atlasFade = cloudOpacity * skyLightFactor(c)
  }
  c.ui.renderLoop(nowMs)
  if (gaze) {
    reportGaze(gaze)
  }
  reportTime(nowMs)
  updateHover(nowMs)
}

/** @param {boolean} value */
function setActive(value) {
  if (!c || active === value) {
    return
  }
  active = value
  c.ui.renderer.setAnimationLoop(value ? frame : null)
  // 숨겨 있는 동안 시간이 흘러가 버리지 않게, 그리지 않을 때는 시간도 멈춘다.
  c.time.isPaused = !value || clockFactor === 0
  c.time.lastUpdate = Date.now()
  if (!value) {
    hideHover()
  }
}

window.addEventListener('message', (event) => {
  if (event.source !== parentWindow || event.origin !== location.origin) {
    return
  }
  const message = event.data
  if (message?.type === 'atlas:view' && c) {
    applyView(message)
  } else if (message?.type === 'atlas:aim' && c && site &&
      Number.isFinite(message.azimuth) && Number.isFinite(message.altitude)) {
    startAim(message.azimuth, message.altitude)
  } else if (message?.type === 'atlas:clock') {
    setClock(Number(message.factor))
  } else if (message?.type === 'atlas:settings' && message.settings) {
    Object.assign(wanted, message.settings)
    applyWanted()
  } else if (message?.type === 'atlas:active') {
    setActive(Boolean(message.value))
  } else if (message?.type === 'atlas:bodies' && Array.isArray(message.bodies)) {
    pendingBodies = message
    sky?.setEphemeris(message)
  } else if (message?.type === 'atlas:visibility') {
    pendingVisibility = message
    sky?.setHidden(message)
  } else if (message?.type === 'atlas:orbit' && message.id) {
    if (sky) {
      sky.setOrbit(message)
    } else {
      pendingOrbits.push(message)
    }
  }
})

// 마우스 휠로 시야각을 줄이고 늘린다(위로 굴리면 확대). 천구 엔진 원본은 지표에서 휠을 쓰지 않는다.
const FOV_MIN_DEG = 0.5
const FOV_MAX_DEG = 100
window.addEventListener('wheel', (event) => {
  event.preventDefault()
  event.stopImmediatePropagation()
  if (!c) {
    return
  }
  zoomAnim = null
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1
  const factor = Math.exp(event.deltaY * unit * 0.0012)
  c.ui.setFov(Math.min(FOV_MAX_DEG, Math.max(FOV_MIN_DEG, c.ui.camera.fov * factor)))
}, {capture: true, passive: false})

// 끌거나 키로 돌리기 시작하면 프로그램이 돌리던 시선은 멈춘다. 마우스 위치는 이름표 강조에 쓴다.
window.addEventListener('pointerdown', (event) => {
  tween = null
  zoomAnim = null
  pointer = {x: event.clientX, y: event.clientY, dragging: true}
  hideHover()
}, true)
window.addEventListener('pointermove', (event) => {
  pointer = {x: event.clientX, y: event.clientY, dragging: event.buttons !== 0}
}, true)
window.addEventListener('pointerup', (event) => {
  pointer = {x: event.clientX, y: event.clientY, dragging: false}
}, true)
document.documentElement.addEventListener('pointerleave', () => {
  pointer = null
})

// 천구 엔진의 글자 단축키(o, a, l 등)는 부모의 표시 설정과 어긋나므로 막는다. 스페이스바는 부모가
// 시간 멈춤·재개에 쓰도록 알려 준다. 방향키처럼 글자가 아닌 키는 그대로 두어 시선 이동에 쓴다.
window.addEventListener('keydown', (event) => {
  if (event.key.startsWith('Arrow')) {
    tween = null
    zoomAnim = null
  }
  if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) {
    return
  }
  event.stopImmediatePropagation()
  event.preventDefault()
  if (event.code === 'Space' && !event.repeat) {
    post({type: 'atlas:key', code: 'Space'})
  }
}, true)

// 자동 노출(측광)은 태양이 화면에서 커지면 그 밝기에 맞춰 노출을 수만 배 낮춰, 하늘과 땅이 검게 변한다(우주에서 태양을
// 보는 눈 적응이다). 지상 천구에서는 하늘과 땅의 노출을 낮 기준(게인 1)으로 두고, 태양은 흰 원반으로 날아가게 한다.
// 이를 위해 측광 입력에서 태양 원반을 빼고, 측광 목표 게인이 1보다 내려가지 않게 자른다(천구 엔진 원본은 그대로).
const METER_FLOOR_GAIN = 1
// 반대로 밤하늘은 어두워질수록 노출이 수백만 배까지 올라가, 아주 희미한 별과 이름표가 한꺼번에 쏟아진다.
// 별이 알아보기 좋은 정도(게인 수십 배)에서 멈춘다.
const METER_CEIL_GAIN = 40

/** @param {object} ui 천구 엔진의 ThreeUI */
function keepDaylightExposure(ui) {
  const meterApply = ui._meterApply.bind(ui)
  ui._meterApply = (pixels, ctx) => {
    meterApply(pixels, {...ctx, luminous: []})
    if (!(ui._meterGainGoal >= METER_FLOOR_GAIN)) {
      ui._meterGainGoal = METER_FLOOR_GAIN
    } else if (ui._meterGainGoal > METER_CEIL_GAIN) {
      ui._meterGainGoal = METER_CEIL_GAIN
    }
  }
}

/** 첫 화면이 그려질 때까지 모두 수행하고 부모에 알린다. */
async function boot() {
  post({type: 'atlas:progress', stage: 'engine'})
  // 주소에 조각이 있으면 홈페이지 투어가 아니다.
  history.replaceState(null, '', `${location.pathname}#sun`)
  // Cesium 지도층 없이 번들된 기본 표면을 쓴다.
  for (const body of ['earth', 'moon', 'mars']) {
    useStore.getState().setBodyLayer(body, 'default')
  }
  const container = document.body.appendChild(document.createElement('div'))
  container.id = 'scene-id'
  c = new SkyEngine(useStore, container, document.createElement('div'), ignore, ignore)
  T = c.three
  keepDaylightExposure(c.ui)
  darkenNightSky(c)
  // 클릭은 이름표가 붙은 천체만 골라 부모에게 알리고, 천구 엔진 자체의 이동(더블클릭으로 천체나
  // 지표 위치로 가기)은 막아 지상에 계속 서 있게 한다.
  c.scene.onClick = (event) => {
    const hit = labelAt(event.clientX, event.clientY)
    const name = hit ? String(hit.target.name ?? '') : ''
    const own = hit?.target.sky === true
    post({type: 'atlas:pick', pick: hit ? {kind: hit.target.kind, name, label: own ? hit.target.label : koName(name), sky: own} : null,
      x: event.clientX, y: event.clientY})
    // 클릭한 천체의 궤도선만 보인다. 천체가 아닌 곳을 클릭하면 선택이 풀린다.
    sky?.select(hit && hit.target.kind === 'body' ? name : null)
    // 천체(지명이 아닌 이름표)를 클릭하면 살짝 확대한다.
    if (hit && hit.target.kind !== 'place') {
      startClickZoom(event.clientX, event.clientY)
    }
  }
  c.scene.onDblClick = ignore
  c.scene.onLabelDblClick = ignore

  if (!await until(() => c.scene?.objects?.earth?.props?.radius, READY_WAIT_MS)) {
    throw new Error('지구를 불러오지 못했습니다.')
  }
  post({type: 'atlas:progress', stage: 'earth'})
  // 시야각은 휠로 자유롭게 바꾼다(관측 기구의 시야 한계를 쓰지 않는다).
  c.ui.setFieldLimit(false)
  // 격자를 켜면 별자리 경계선이 옅게 함께 보인다.
  addConstellationBounds(c)
  // 별자리 이름표를 호버하면 그 별자리의 그림이 선 뒤에 희미하게 뜬다.
  constellationArt = createConstellationArt(c)
  sky = createSkyOverlay(c, {
    onNeedOrbit: (id) => post({type: 'atlas:need-orbit', id, timeMs: c.time.simTime}),
  })
  if (pendingBodies) {
    sky.setEphemeris(pendingBodies)
  }
  for (const orbit of pendingOrbits.splice(0)) {
    sky.setOrbit(orbit)
  }
  if (pendingVisibility) {
    sky.setHidden(pendingVisibility)
  }
  // 표시 설정은 부모가 정한 값(기본: 궤도선·확장선 끔, 이름표·별자리선·구름 켬)을 따른다.
  applyWanted()
  // 서울 기준 지금으로 먼저 서 본다. 실제 장소·시각은 부모가 곧 보낸다.
  site = {lat: 37.5665, lon: 126.978, alt: 0}
  siteKey = `${site.lat},${site.lon},0`
  c.time.setTime(Date.now())
  c.time.isPaused = true
  await loadGroundTexture(c)
  stand()
  lookQuaternion(site.lat, site.lon, 180, 30, c.ui.camera.quaternion)

  // 별 목록과 첫 도착 연출이 끝날 때까지 그리며 기다린다(별이 그려진 뒤 천구가 완성된다).
  c.ui.renderer.setAnimationLoop(frame)
  active = true
  await until(() => c._reveal?.started && c.ui._starsDrawn?.() !== false, READY_WAIT_MS)
  post({type: 'atlas:progress', stage: 'sky'})
  // 구름 노이즈와 광선 추적 셰이더는 프레임을 돌리며 만든다. 여기서 첫 장까지 그려 두지 않으면
  // 지상 모드를 처음 열 때 그 일이 몰려 수 초 동안 화면이 멈춘다.
  await until(() => {
    const volume = cloudVolume()
    if (!volume || volume.options?.off) {
      return Boolean(volume)
    }
    return volume.ready === true && volume.status?.drawn === true
  }, READY_WAIT_MS)
  // 지표의 월별 색 지도는 쓰지 않으므로(땅은 한 색) 달이 바뀔 때마다 받아 오지 않게 한다.
  c.scene.objects.earth.preAnimCb = null
  setActive(false)
  setClock(clockFactor)
  post({type: 'atlas:ready'})
}

boot().catch((error) => post({type: 'atlas:error', message: String(error?.message ?? error)}))
