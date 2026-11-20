// 지상 천구에 얹는 것들: 태양계 소천체 표시, 황도선, 클릭한 천체의 궤도선, 태양계 밖 덧붙임 제거.
//
// - 소천체(위성·왜소행성·소행성·혜성·탐사선): 천구 엔진이 모르는 천체의 하늘 위치는 부모(Vue 앱)가
//   JPL Horizons 표(적경·적위)로 보내 준다. 이 파일은 그 표를 시각 사이로 보간해 이름표 점으로 그린다.
//   이름표는 천구 엔진의 SpriteSheet라서 호버·클릭(labelPick)과 이름표 표시 설정(p)을 그대로 따른다.
// - 궤도선(o): 켜면 황도선(태양이 지나는 길)만 보이고, 천체를 클릭하면 그 천체의 궤도선 하나만 더 보인다.
//   천구 엔진이 가진 천체의 궤도는 자기 것을, 소천체는 부모가 Horizons 궤도 요소로 만든 타원을 그린다.
// - 표시 토글: 부모가 숨긴 분류·천체를 보내면(setHidden) 행성은 통째로, 소천체는 점·이름표를, 별자리는 선과 이름표를 숨긴다.
//   (별은 천구 엔진의 별 타일 안에 있어 하나씩 숨기지 않는다.)
// - 라그랑주점·궤도 영역·2026 ED138처럼 태양계 화면에 없는 것은 없앤다. 별과 별자리는 그대로 둔다.
import {OVERLAY_LAYER} from 'atlas/shared.js'
import SpriteSheet from 'atlas/scene/SpriteSheet.js'
import {newWideLineStrip} from 'atlas/scene/wideLines.js'
import {angleBetweenDeg, bodyRaDecAt, equatorialToScene} from '../src/utils/ephemerisInterp.js'

// 마커는 지구 중심에서 이 거리의 방향에 둔다. 관측자는 지구 중심에서 6400km 안이라 시차는 1.3초각 아래다.
const SKY_RADIUS_M = 1e12
const AU_M = 1.495978707e11
const ECLIPTIC_RADIUS_M = 1e12
const ECLIPTIC_POINTS = 361
const ECLIPTIC_COLOR = 0xffc94d
const ECLIPTIC_WIDTH_PX = 3.2
const ORBIT_COLOR = 0x6aa3ff
const ORBIT_WIDTH_PX = 2.6
const KIND_COLORS = {
  satellite: '#c9d6ff', dwarf: '#ffd9a8', asteroid: '#e2dccd', comet: '#9fe3ff', craft: '#9dffb0',
}
// 위성은 모행성에서 시야의 이만큼(비율) 이상 떨어져야 보인다. 가까이 붙은 위성 이름표가 행성 위에 쌓이는 것을 막는다.
const SATELLITE_MIN_SEPARATION = 0.03
const RECONCILE_MS = 500
const noRaycast = () => undefined
// 개별로 숨길 수 있는 천구 엔진 행성(지구는 관측자라 뺀다)과, 별자리선 인스턴스 속성
const PLANET_IDS = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']
const LINE_ATTRIBUTES = ['startHigh', 'startLow', 'endHigh', 'endLow', 'aColor', 'aTimes', 'aHop']
const ignore = () => undefined

/**
 * 이름표 글자: 너무 긴 이름은 앞부분만(이름표가 천체 위로 글자 폭의 절반만큼 떠 있어서).
 *
 * @param {string} ko
 * @returns {string}
 */
export function shortName(ko) {
  return ko.length > 7 ? ko.split(/[–-]/)[0] : ko
}

/**
 * @param {object} c 만들어진 천구 엔진(지구가 불러와진 뒤)
 * @param {object} hooks
 * @param {(id: string) => void} hooks.onNeedOrbit 소천체 궤도 요소가 필요할 때
 * @returns {object} 컨트롤러
 */
export function createSkyOverlay(c, {onNeedOrbit = ignore} = {}) {
  const T = c.three
  const scene = c.scene
  const stellarFrame = scene.stellarFrame
  const earthNode = scene.objects.earth.orbitPosition
  const earthPos = new T.Vector3()
  const parentPos = new T.Vector3()
  const dirTmp = new T.Vector3()

  // 소천체: 적도 J2000 → 장면(J2000 황도 축) 방향을 세차(날짜의 황도)로 돌려서 지구에 매단다.
  const precess = new T.Group()
  precess.name = 'SkyBodies'
  earthNode.add(precess)
  const centerGroups = new Map()
  let bodies = []
  let window_ = null
  let dots = null
  let names = null
  let builtKey = ''
  let lastTime = NaN
  const orbitLines = new Map()
  let selected = null
  let selectedLine = null
  let lastReconcile = 0

  // 표시 토글. hiddenCats는 분류 전체, hiddenIds는 개별 천체(소문자 id). 둘 중 하나에 걸리면 숨긴다.
  let hiddenCats = new Set()
  let hiddenIds = new Set()
  const planetHiddenByUs = new Set()
  let constellations = null
  let constellationKey = null

  const isHidden = (category, id) => hiddenCats.has(category) || hiddenIds.has(String(id).toLowerCase())

  function applyPlanets() {
    for (const id of PLANET_IDS) {
      // 행성 본체와 이름표(planet LOD, label LOD)가 든 노드. 위성은 이 노드의 형제라 그대로 남는다.
      const node = scene.objects[id]?.orbitPosition?.getObjectByName('new planet')
      if (!node) {
        continue
      }
      if (isHidden('planet', id)) {
        node.visible = false
        planetHiddenByUs.add(id)
      } else if (planetHiddenByUs.delete(id)) {
        node.visible = true
      }
    }
  }

  /** 별자리선(한 덩어리 인스턴스)에서 별자리마다 선분 범위를 알아 둔다. 선분 수가 맞지 않으면 선은 건드리지 않는다. */
  function prepareConstellations() {
    const asterisms = scene.asterisms
    const lines = asterisms?.children.find((node) => node.name === 'AsterismLines')
    const labels = asterisms?.children.find((node) => node.name === 'AsterismLabels')
    if (!asterisms?.catalog?.byName?.size || !lines || !labels) {
      return null
    }
    const geometry = lines.geometry
    const stars = asterisms.stars.catalog
    const ranges = []
    let cursor = 0
    asterisms.catalog.byName.forEach((astr, name) => {
      let count = 0
      for (const path of astr.paths) {
        let previous = null
        for (const starName of path) {
          const star = stars.starByHip.get(stars.reifyName(starName)[2])
          if (!star) {
            continue
          }
          if (previous) {
            count++
          }
          previous = star
        }
      }
      ranges.push({name, start: cursor, count})
      cursor += count
    })
    const attributes = LINE_ATTRIBUTES.map((key) => geometry.getAttribute(key)).filter(Boolean)
    const targets = labels.userData.labelTargets ?? []
    return {
      geometry,
      attributes,
      ranges,
      sheet: labels.userData.sheet,
      labelIndex: new Map(targets.map((target, i) => [target.name, i])),
      linesMatch: cursor === geometry.instanceCount,
      originals: attributes.map((attribute) => attribute.array.slice()),
    }
  }

  function applyConstellations() {
    constellations ??= prepareConstellations()
    if (!constellations) {
      return
    }
    const {geometry, attributes, originals, ranges, sheet, labelIndex, linesMatch} = constellations
    const hidden = ranges.map((range) => isHidden('constellation', `con:${range.name}`))
    const key = hidden.map(Number).join('')
    if (key === constellationKey) {
      return
    }
    constellationKey = key
    let out = 0
    ranges.forEach((range, index) => {
      const labelAt = labelIndex.get(range.name)
      if (labelAt !== undefined) {
        sheet.setShown(labelAt, !hidden[index])
      }
      if (!linesMatch || hidden[index]) {
        return
      }
      attributes.forEach((attribute, a) => {
        const size = attribute.itemSize
        attribute.array.set(originals[a].subarray(range.start * size, (range.start + range.count) * size), out * size)
      })
      out += range.count
    })
    if (linesMatch) {
      geometry.instanceCount = out
      for (const attribute of attributes) {
        attribute.needsUpdate = true
      }
    }
  }

  function applyHidden() {
    applyPlanets()
    applyConstellations()
  }

  /**
   * 부모가 정한 숨김 상태를 받는다. 숨긴 천체가 선택돼 있으면 선택을 푼다.
   *
   * @param {{categories?: string[], ids?: string[]}} message
   */
  function setHidden(message) {
    hiddenCats = new Set(message?.categories ?? [])
    hiddenIds = new Set((message?.ids ?? []).map((id) => String(id).toLowerCase()))
    constellationKey = null
    applyHidden()
    const body = bodies.find((entry) => entry.id === selected)
    const hiddenSelection = body
      ? isHidden(body.category, body.id)
      : PLANET_IDS.includes(selected) && isHidden('planet', selected)
    if (selected && hiddenSelection) {
      select(null)
    }
  }

  // 황도선: 날짜의 황도면(장면의 XZ 평면)을 지구를 중심으로 한 바퀴 두껍게 긋는다.
  const ring = new Float32Array(ECLIPTIC_POINTS * 3)
  for (let k = 0; k < ECLIPTIC_POINTS; k++) {
    const angle = 2 * Math.PI * k / (ECLIPTIC_POINTS - 1)
    ring[3 * k] = ECLIPTIC_RADIUS_M * Math.cos(angle)
    ring[(3 * k) + 2] = -ECLIPTIC_RADIUS_M * Math.sin(angle)
  }
  const ecliptic = newWideLineStrip(ring, {
    name: 'EclipticLine',
    color: ECLIPTIC_COLOR,
    width: ECLIPTIC_WIDTH_PX,
    material: {blending: T.AdditiveBlending, depthTest: true, depthWrite: false, transparent: true},
  })
  ecliptic.layers.set(OVERLAY_LAYER)
  earthNode.add(ecliptic)
  scene._joinOverlay('o', ecliptic)

  // 태양계 화면에 없는 덧붙임을 없앤다(라그랑주점, 궤도 영역, 태양풍 선). 다시 만들어지지 않게 막는다.
  scene._syncLagrange = ignore
  scene._syncRegimes = ignore
  scene._syncPeriodic = ignore

  const originalNodes = scene._overlayNodes.bind(scene)
  scene._overlayNodes = (key) => {
    if (key === 'o') {
      return [ecliptic, selectedGroup(), selectedLine]
    }
    if (key === 'p') {
      return [...originalNodes('p'), dots, names]
    }
    return originalNodes(key)
  }

  /** @returns {?object} 선택한 천체가 천구 엔진 것이면 그 궤도선 노드 */
  function selectedGroup() {
    if (!selected || selected === 'earth' || selected === 'sun') {
      return null
    }
    return scene.objects[selected]?.orbitPosition?.orbitShape ?? null
  }

  function styleOrbit(group) {
    const line = group.line
    if (!line || line.userData.skyStyled) {
      return
    }
    line.userData.skyStyled = true
    const u = line.material.uniforms
    u.uOverride.value.set(...new T.Color(ORBIT_COLOR).toArray(), 1)
    u.uWidthFirst.value = u.uWidthLast.value = ORBIT_WIDTH_PX
  }

  /** 궤도선·덧붙임의 보임을 정책에 맞춘다: 선택한 천체의 것만, 켜져 있을 때만. */
  function reconcile() {
    for (const marks of scene._lagrange?.values() ?? []) {
      marks.removeFromParent()
      marks.syncRing?.removeFromParent()
    }
    for (const marks of scene._regimes?.values() ?? []) {
      marks.removeFromParent()
    }
    const wind = scene.objects.sun?.sunLayers?.wind
    if (wind) {
      wind.visible = false
    }
    const edGroup = scene.objects['ed138.group'] ?? scene.objects['ed138.orbitPlane']?.parent
    if (edGroup) {
      edGroup.visible = false
    }
    const shown = scene.overlayShown('o')
    const keep = selectedGroup()
    for (const group of scene._namedUnderSun('orbit')) {
      if (group === keep) {
        styleOrbit(group)
        scene._joinOverlay('o', group)
      } else {
        group.visible = false
      }
    }
    for (const [id, line] of orbitLines) {
      line.visible = shown && line === selectedLine && id === selected
    }
    ecliptic.visible = shown
    applyHidden()
  }

  function rebuildSprites(list) {
    for (const sprites of [dots, names]) {
      sprites?.removeFromParent()
      sprites?.geometry.dispose()
      sprites?.material.uniforms.map.value.dispose()
      sprites?.material.dispose()
    }
    dots = null
    names = null
    if (!list.length) {
      return
    }
    const glyphSheet = new SpriteSheet(list.length, list.map(() => '●'))
    const nameSheet = new SpriteSheet(list.length, list.map((b) => shortName(b.ko)))
    for (const b of list) {
      const color = KIND_COLORS[b.category] ?? '#ffffff'
      glyphSheet.add(0, 0, 0, '●', color)
      nameSheet.add(0, 0, 0, shortName(b.ko), color)
    }
    for (const sheet of [glyphSheet, nameSheet]) {
      const sprites = sheet.compile()
      sprites.frustumCulled = false
      sprites.raycast = noRaycast
      sprites.userData.labelTargets = list.map((b) => ({kind: 'body', name: b.id, label: b.ko, sky: true}))
      precess.add(sprites)
      scene._joinOverlay('p', sprites)
      if (sheet === glyphSheet) {
        dots = sprites
      } else {
        names = sprites
      }
    }
  }

  /**
   * 부모가 보낸 표를 받는다. 천체 목록이 처음이거나 바뀌면 이름표를 새로 만든다.
   *
   * @param {{startMs: number, stepMs: number, count: number, bodies: object[]}} message
   */
  function setEphemeris(message) {
    window_ = {startMs: message.startMs, stepMs: message.stepMs, count: message.count}
    const ids = message.bodies.map((b) => b.id).join(',')
    if (ids !== builtKey) {
      builtKey = ids
      rebuildSprites(message.bodies)
    }
    bodies = message.bodies.map((b) => ({...b, dir: [1, 0, 0], visible: true}))
    lastTime = NaN
    if (dots) {
      dots.visible = names.visible = scene.overlayShown('p')
    }
  }

  function setVisible(index, visible) {
    const body = bodies[index]
    if (body.visible === visible) {
      return
    }
    body.visible = visible
    dots.userData.sheet.setShown(index, visible)
    names.userData.sheet.setShown(index, visible)
  }

  /**
   * 매 프레임: 시각이 바뀌었으면 마커 위치를 새로 놓고, 위성은 모행성과 충분히 떨어졌을 때만 보인다.
   *
   * @param {number} timeMs 천구의 시각
   * @param {number} fovDeg 시야각
   * @param {number} nowMs 그리는 시계
   */
  function update(timeMs, fovDeg, nowMs) {
    precess.quaternion.copy(stellarFrame.quaternion)
    for (const group of centerGroups.values()) {
      group.quaternion.copy(stellarFrame.quaternion)
    }
    if (nowMs - lastReconcile > RECONCILE_MS) {
      lastReconcile = nowMs
      reconcile()
    }
    if (!window_ || !bodies.length || !dots) {
      return
    }
    if (timeMs !== lastTime) {
      lastTime = timeMs
      const positions = [dots.userData.sheet, names.userData.sheet]
      bodies.forEach((b, i) => {
        const {ra, dec} = bodyRaDecAt(b, window_, timeMs)
        b.dir = equatorialToScene(ra, dec)
        const x = b.dir[0] * SKY_RADIUS_M
        const y = b.dir[1] * SKY_RADIUS_M
        const z = b.dir[2] * SKY_RADIUS_M
        for (const sheet of positions) {
          sheet.positions[3 * i] = x
          sheet.positions[(3 * i) + 1] = y
          sheet.positions[(3 * i) + 2] = z
          sheet.positionAttribute.setXYZ(i, x, y, z)
        }
      })
      dots.userData.sheet.positionAttribute.needsUpdate = true
      names.userData.sheet.positionAttribute.needsUpdate = true
    }
    scene.objects.earth.orbitPosition.getWorldPosition(earthPos)
    bodies.forEach((b, i) => {
      if (isHidden(b.category, b.id)) {
        setVisible(i, false)
        return
      }
      if (b.category !== 'satellite') {
        setVisible(i, true)
        return
      }
      const parent = scene.objects[b.parent]
      if (!parent) {
        setVisible(i, true)
        return
      }
      parent.getWorldPosition(parentPos)
      parentPos.sub(earthPos).normalize()
      dirTmp.set(b.dir[0], b.dir[1], b.dir[2]).applyQuaternion(stellarFrame.quaternion)
      const apart = angleBetweenDeg([dirTmp.x, dirTmp.y, dirTmp.z], [parentPos.x, parentPos.y, parentPos.z])
      setVisible(i, apart >= fovDeg * SATELLITE_MIN_SEPARATION)
    })
  }

  /**
   * 소천체 궤도선(부모가 만든 타원, AU)을 받아 그린다. 지금 그 천체가 선택돼 있으면 곧바로 보인다.
   *
   * @param {{id: string, center: string, points: Float32Array|number[]}} message
   */
  function setOrbit(message) {
    if (!message?.points?.length || orbitLines.has(message.id)) {
      return
    }
    const positions = new Float32Array(message.points.length)
    // 점은 J2000 황도 좌표(x, y, z)다. 장면은 황도면이 XZ이므로 [x, z, -y]로 옮긴다.
    for (let k = 0; k + 2 < positions.length; k += 3) {
      positions[k] = message.points[k] * AU_M
      positions[k + 1] = message.points[k + 2] * AU_M
      positions[k + 2] = -message.points[k + 1] * AU_M
    }
    const line = newWideLineStrip(positions, {
      name: `SkyOrbit:${message.id}`,
      color: ORBIT_COLOR,
      width: ORBIT_WIDTH_PX,
      material: {blending: T.AdditiveBlending, depthTest: true, depthWrite: false, transparent: true},
    })
    line.layers.set(OVERLAY_LAYER)
    line.visible = false
    let parent = stellarFrame
    if (message.center !== 'sun') {
      const center = scene.objects[message.center]?.orbitPosition
      if (!center) {
        return
      }
      if (!centerGroups.has(message.center)) {
        const group = new T.Group()
        group.name = `SkyOrbitCenter:${message.center}`
        center.add(group)
        centerGroups.set(message.center, group)
      }
      parent = centerGroups.get(message.center)
    }
    parent.add(line)
    scene._joinOverlay('o', line)
    orbitLines.set(message.id, line)
    if (selected === message.id) {
      selectedLine = line
    }
    reconcile()
  }

  /**
   * 클릭한 천체를 고른다(null이면 선택을 푼다). 고른 천체의 궤도선만 보인다.
   *
   * @param {?string} name 천체 이름(천구 엔진 이름 또는 소천체 id)
   */
  function select(name) {
    selected = name
    selectedLine = null
    if (name && bodies.some((b) => b.id === name)) {
      if (orbitLines.has(name)) {
        selectedLine = orbitLines.get(name)
      } else {
        onNeedOrbit(name)
      }
    }
    reconcile()
  }

  return {setEphemeris, setOrbit, setHidden, select, update, reconcile, ecliptic}
}
