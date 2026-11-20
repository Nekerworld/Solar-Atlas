// 밝은 별을 확대하면 빛무리가 이름표를 덮는다. 글자가 그 빛무리 안에 들어갈 때만
// 이름표를 빛무리 바로 위로 올린다. 안내선은 두지 않는다.
// 은하수는 낮은 대비의 색 면으로 두고, 별 원반 바로 바깥 1픽셀에서는 걷어 별이 띠 위에 떨어지게 한다.

import {Float32BufferAttribute, Vector2, Vector3} from 'three'
import {illuminanceRatio, starSprite} from 'atlas/scene/exposure.js'

const PARSEC_M = 3.0856775814913673e16
const LABEL_GAP_PX = 6
const cam = new Vector3()
const viewSize = new Vector2()

/**
 * 프레임마다 부른다. 이름표 밀기와 은하수 보정은 준비된 뒤에만 적용한다.
 *
 * @param {object} c 천구 엔진
 */
export function placeSkyReadability(c) {
  nudgeStarLabels(c)
  gradeGalaxy(c)
}

function nudgeStarLabels(c) {
  const stars = c.scene?.stars
  const sheet = stars?.starLabelSpriteSheet
  const points = sheet?.sprites
  const list = stars?._labelStars
  const uniforms = stars?.starPoints?.material?.uniforms
  if (!points || !list || !uniforms?.uFovDegrees) {
    return
  }
  const geometry = points.geometry
  let nudge = geometry.getAttribute('nudge')
  if (!nudge || nudge.count !== list.length) {
    const data = new Float32Array(list.length * 2)
    geometry.setAttribute('nudge', new Float32BufferAttribute(data, 2))
    nudge = geometry.getAttribute('nudge')
    sheet.nudges = data
  }
  if (!points.material.userData.labelNudged) {
    patchLabelShader(points.material)
  }
  if (!points.material.userData.labelNudged) {
    return
  }
  const renderer = c.ui.renderer
  renderer.getDrawingBufferSize(viewSize)
  const scale = points.material.uniforms.uNudgeScale.value
  if (viewSize.x > 0 && viewSize.y > 0) {
    scale.set(2 / viewSize.x, 2 / viewSize.y)
  }
  const camera = c.ui.camera
  camera.getWorldPosition(cam)
  points.worldToLocal(cam)
  const fov = uniforms.uFovDegrees.value
  const height = uniforms.uViewportHeight.value
  const exposure = uniforms.uExposureRelative.value
  const starGain = uniforms.uStarGain.value
  const maxSize = uniforms.uMaxStarSizePx.value
  const data = sheet.nudges
  for (let i = 0; i < list.length; i++) {
    let lift = 0
    if (sheet.wanted?.[i]) {
      const star = list[i]
      const pc = Math.hypot(star.x - cam.x, star.y - cam.y, star.z - cam.z) / PARSEC_M
      const mag = star.absMag + (5 * Math.log10(Math.max(pc, 1e-12) / 10))
      const sprite = starSprite(illuminanceRatio(mag), exposure, {
        fovDegrees: fov, heightPx: height, starGain, maxSizePx: maxSize,
      })
      const radius = sprite.sizePx / 2
      const drawn = sheet.scales?.[i] ?? 1
      const side = (sheet.sizes?.[i * 2] ?? 0) * drawn
      const textH = (sheet.textSizes?.[(i * 2) + 1] ?? 0) * drawn
      // 글자는 정사각형 스프라이트의 위쪽에 있다. 그 아랫변이 빛무리 안에 있으면 위로 민다.
      const textBottom = (side / 2) - textH
      lift = radius + LABEL_GAP_PX - textBottom
      if (lift < 0.5) {
        lift = 0
      }
    }
    data[i * 2] = 0
    data[(i * 2) + 1] = lift
    nudge.setXY(i, 0, lift)
  }
  nudge.needsUpdate = true
}

function patchLabelShader(material) {
  if (material.userData.labelNudged) {
    return
  }
  const line = 'gl_Position = projectionMatrix * vec4(mat3(modelViewMatrix) * eyePos, 1.0);'
  if (!material.vertexShader.includes(line) || !material.vertexShader.includes('attribute float brightness;')) {
    return
  }
  material.uniforms.uNudgeScale = {value: new Vector2(0, 0)}
  material.vertexShader = material.vertexShader
      .replace('attribute float brightness;', 'attribute float brightness;\n  attribute vec2 nudge;\n  uniform vec2 uNudgeScale;')
      .replace(line, `${line}\n    gl_Position.xy += nudge * gl_Position.w * uNudgeScale;`)
  material.needsUpdate = true
  material.userData.labelNudged = true
}

// 넓은 하늘에서는 은하수가 낮고 색이 나뉜 면이고, 별을 확대하면 한 걸음 더 물러난다.
function galaxyGain(fov) {
  const t = Math.min(1, Math.max(0, (28 - fov) / 20))
  return 0.58 + ((0.32 - 0.58) * t)
}

function gradeGalaxy(c) {
  const fov = c.ui?.camera?.fov ?? 45
  const renderer = c.ui?.renderer
  const atm = c.ui?._atmMesh?.material
  if (atm && !atm.userData.galaxyGraded && atm.fragmentShader.includes('uniform float uGalaxyScale;')) {
    const line = 'if (uGalaxyScale > 0.0) light += texture2D(uGalaxy, vUv).rgb * uGalaxyScale;'
    if (atm.fragmentShader.includes(line)) {
      atm.uniforms.uGalaxyGain = {value: galaxyGain(fov)}
      atm.uniforms.uGalaxyTexel = {value: new Vector2(1 / 1920, 1 / 1080)}
      atm.fragmentShader = atm.fragmentShader
          .replace('uniform float uGalaxyScale;', 'uniform float uGalaxyScale;\nuniform float uGalaxyGain;\nuniform vec2 uGalaxyTexel;')
          .replace(line, 'if (uGalaxyScale > 0.0) light += gradedGalaxy(texture2D(uGalaxy, vUv).rgb * uGalaxyScale, vUv);')
          .replace('vec3 nightBeyond(float depth) {', `float sceneCore(vec2 uv) {
  vec3 s = texture2D(tDiffuse, uv).rgb;
  return max(s.r, max(s.g, s.b));
}
vec3 gradedGalaxy(vec3 g, vec2 uv) {
  float luma = max(g.r, max(g.g, g.b));
  float shaped = pow(max(luma, 0.0), 0.72);
  float warmth = clamp((g.r - g.b) / max(luma, 1.0e-5), 0.0, 1.0);
  vec3 tint = mix(vec3(0.62, 0.78, 1.0), vec3(1.0, 0.74, 0.45), warmth);
  g = tint * (shaped / max(luma, 1.0e-5)) * uGalaxyGain;
  float core = sceneCore(uv);
  float beside = max(max(sceneCore(uv + vec2(uGalaxyTexel.x, 0.0)), sceneCore(uv - vec2(uGalaxyTexel.x, 0.0))),
      max(sceneCore(uv + vec2(0.0, uGalaxyTexel.y)), sceneCore(uv - vec2(0.0, uGalaxyTexel.y))));
  float onCore = smoothstep(0.35, 1.6, core);
  float ring = smoothstep(0.35, 1.6, beside) * (1.0 - onCore);
  g *= (1.0 - onCore) * (1.0 - 0.72 * ring);
  return g;
}
vec3 nightBeyond(float depth) {`)
      atm.needsUpdate = true
      atm.userData.galaxyGraded = true
    }
  }
  if (atm?.uniforms.uGalaxyGain) {
    atm.uniforms.uGalaxyGain.value = galaxyGain(fov)
  }
  if (atm?.uniforms.uGalaxyTexel && renderer) {
    renderer.getDrawingBufferSize(viewSize)
    if (viewSize.x > 0 && viewSize.y > 0) {
      atm.uniforms.uGalaxyTexel.value.set(1 / viewSize.x, 1 / viewSize.y)
    }
  }
  gradeMilkyComposite(c, fov)
}

// HDR이 아닌 경로는 은하수를 장면 패스에서 직접 그린다. 같은 대비와 색만 적용한다.
function gradeMilkyComposite(c, fov) {
  const mesh = c.ui?.scene?.getObjectByName?.('MilkyWay')
  const material = mesh?.material
  if (!material) {
    return
  }
  // 첫 프레임에 셰이더 문자열이 원래 것으로 다시 씌워지므로, 그 다음에 보정한다.
  if (!mesh.userData.gradeWrapped && mesh.onBeforeRender) {
    const original = mesh.onBeforeRender
    mesh.onBeforeRender = function onMilkyRender(...args) {
      original.call(this, ...args)
      applyMilkyGrade(this.material)
    }
    mesh.userData.gradeWrapped = true
  }
  applyMilkyGrade(material)
  if (material.uniforms.uGalaxyGain) {
    material.uniforms.uGalaxyGain.value = galaxyGain(fov)
  }
}

function applyMilkyGrade(material) {
  const mark = 'vec3 value = light *'
  if (!material?.fragmentShader?.includes(mark) || material.fragmentShader.includes('uGalaxyGain')) {
    return
  }
  material.uniforms.uGalaxyGain ??= {value: 0.58}
  material.fragmentShader = material.fragmentShader.replace(
      mark,
      `float luma = max(light.r, max(light.g, light.b));
  float shaped = pow(max(luma, 0.0), 0.72);
  float warmth = clamp((light.r - light.b) / max(luma, 1.0e-5), 0.0, 1.0);
  light = mix(vec3(0.62, 0.78, 1.0), vec3(1.0, 0.74, 0.45), warmth) * (shaped / max(luma, 1.0e-5)) * uGalaxyGain;
  ${mark}`)
  material.needsUpdate = true
}
