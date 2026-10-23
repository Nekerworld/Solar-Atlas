import { zoomDistance } from "./zoomScale";
import { syncBackgroundCamera } from "./backgroundCamera";
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BackSide,
  Clock,
  CubeCamera,
  HalfFloatType,
  LoadingManager,
  LinearEncoding,
  RepeatWrapping,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SphereGeometry,
  sRGBEncoding,
  TextureLoader,
  Vector2,
  WebGLCubeRenderTarget,
  WebGLRenderer,
} from "three";
import * as THREE from "three";
import { OrbitControls } from "three-stdlib";
import {
  EffectComposer,
  EffectPass,
  GodRaysEffect,
  NormalPass,
  RenderPass,
} from "postprocessing";
import Stats from "stats.js";
import { solarSystemData, store } from "../data/store";
import { focusBody } from "../data/store";
import { AstronomicalBody } from "./astronomicalBody";
import { loadSpacecraftTemplates, disposeSpacecraftTemplates,
  createSpacecraftEnvironment, applySpacecraftEnvironment } from "./spacecraftModel";
export class SolarScene {
  host;
  labels;
  onLoaded;
  scene = new Scene();
  backgroundScene = new Scene();
  backgroundCamera = new PerspectiveCamera();
  // Drei's explicit PerspectiveCamera uses Three's 50-degree default.
  camera = new PerspectiveCamera(50, 1, 50, 15000000);
  renderer;
  controls;
  clock = new Clock();
  textures = new Map();
  modelTemplates = new Map();
  spacecraftEnvironment;
  ambient = new AmbientLight(0xffffff, 0.02);
  raycaster = new Raycaster();
  pointer = new Vector2();
  stats = new Stats();
  root;
  composer;
  environment;
  disposed = false;
  frame = 0;
  width = 1;
  height = 1;
  pointerDown = new Vector2();
  observer;
  constructor(host, labels, onLoaded) {
    this.host = host;
    this.labels = labels;
    this.onLoaded = onLoaded;
    // Match Fiber 8's defaults and the original locked Three.js version.
    THREE.ColorManagement.legacyMode = false;
    this.renderer = new WebGLRenderer({
      antialias: true,
      logarithmicDepthBuffer: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.outputEncoding = sRGBEncoding;
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = false;
    this.camera.position.set(3, 1, 3);
    this.host.prepend(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.scene.add(this.ambient);
    this.stats.showPanel(0);
    this.stats.dom.dataset.testid = "debug-stats";
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.renderer.domElement.addEventListener(
      "pointerdown",
      this.onPointerDown,
    );
    this.renderer.domElement.addEventListener(
      "pointermove",
      this.onPointerMove,
    );
    this.renderer.domElement.addEventListener(
      "pointerleave",
      this.onPointerLeave,
    );
    this.renderer.domElement.addEventListener("click", this.onClick);
  }
  async load(onProgress = () => {}) {
    onProgress("textures");
    const paths = new Set(["/assets/stars.jpeg"]);
    const gather = (data) => {
      if (data.textureSrc) paths.add(data.textureSrc);
      if (data.nightTextureSrc) paths.add(data.nightTextureSrc);
      if (data.cloudTextureSrc) paths.add(data.cloudTextureSrc);
      if (data.ring?.textureSrc) paths.add(data.ring.textureSrc);
      data.satellites.forEach(gather);
    };
    gather(solarSystemData.real);
    const manager = new LoadingManager();
    const loader = new TextureLoader(manager);
    await Promise.all(
      [...paths].map(async (path) => {
        const texture = await loader.loadAsync(path);
        // Clouds carry opacity data, while day/night maps carry sRGB color.
        texture.encoding = path.endsWith("8k_earth_clouds.jpg") ? LinearEncoding : sRGBEncoding;
        if (path.includes("8k_earth_")) {
          texture.wrapS = RepeatWrapping;
          texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        }
        if (this.disposed) texture.dispose();
        else this.textures.set(path, texture);
      }),
    );
    if (this.disposed) return;
    onProgress("models");
    this.modelTemplates = await loadSpacecraftTemplates(solarSystemData.real, manager);
    if (this.disposed) {
      disposeSpacecraftTemplates(this.modelTemplates);
      return;
    }
    onProgress("scene");
    // Let the stage label paint before synchronous scene/PMREM setup.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (this.disposed) return;
    this.root = new AstronomicalBody(this.data(), this.textures, this.labels, null, this.modelTemplates);
    this.spacecraftEnvironment = createSpacecraftEnvironment(this.renderer);
    applySpacecraftEnvironment(this.root.root, this.spacecraftEnvironment.texture);
    this.scene.add(this.root.root);
    this.updateScale();
    this.updateEnvironment();
    this.resize();
    this.updateVisibility();
    onProgress("frame");
    this.animate();
    // animate() applies the initial focus and renders before revealing the app.
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (!this.disposed) this.onLoaded();
  }
  data() {
    return store.userSettings.actualScale
      ? solarSystemData.real
      : solarSystemData.toon;
  }
  updateScale() {
    const extent = this.data().satellites.reduce((maximum, body) =>
      Math.max(maximum, body.markerPosition ? Math.hypot(...body.markerPosition) : 0, body.outerRadius || body.orbit.extent || body.orbit.radius * (1 + (body.orbit.eccentricity || 0))), 0);
    const maxDistance = Math.max(store.userSettings.actualScale ? 30000000000 : 15000000, extent * 3);
    this.controls.maxDistance = maxDistance;
    this.camera.far = maxDistance * 2;
    this.camera.updateProjectionMatrix();
    this.ambient.color.set(this.data().color);
    this.root?.update(this.data());
    store.appSettings.focusingBody = true;
    this.updateEffects();
  }
  updateVisibility() {
    this.root?.updateVisibility();
    if (store.userSettings.showDebugInfo) this.host.append(this.stats.dom);
    else this.stats.dom.remove();
  }
  updateEnvironment() {
    this.environment?.dispose();
    this.environment = new WebGLCubeRenderTarget(4096);
    this.environment.texture.type = HalfFloatType;
    const virtual = new Scene();
    const mesh = new Mesh(
      new SphereGeometry(1, 64, 64),
      new MeshBasicMaterial({
        map: this.textures.get("/assets/stars.jpeg"),
        side: BackSide,
      }),
    );
    mesh.scale.setScalar(10);
    mesh.rotation.x = (60.19 * Math.PI) / 180;
    virtual.add(mesh);
    const camera = new CubeCamera(1, 100, this.environment);
    camera.update(this.renderer, virtual);
    this.backgroundScene.background = this.environment.texture;
    this.scene.environment = this.environment.texture;
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  updateEffects() {
    this.composer?.dispose();
    this.composer = undefined;
    if (!this.root) return;
    this.composer = new EffectComposer(this.renderer, {
      multisampling: this.renderer.capabilities.isWebGL2 ? 8 : 0,
      frameBufferType: HalfFloatType,
    });
    this.composer.addPass(new RenderPass(this.backgroundScene, this.backgroundCamera));
    const worldPass = new RenderPass(this.scene, this.camera);
    worldPass.clear = false;
    this.composer.addPass(worldPass);
    this.composer.addPass(new NormalPass(this.scene, this.camera));
    const effect = new GodRaysEffect(this.camera, this.root.mesh, {
      blur: 3,
      decay: 0.9,
      samples: store.userSettings.actualScale ? 30 : 120,
      density: 0.98,
    });
    const pass = new EffectPass(this.camera, effect);
    pass.renderToScreen = true;
    this.composer.addPass(pass);
    this.composer.setSize(this.width, this.height);
  }
  resize() {
    this.width = Math.max(1, this.host.clientWidth);
    this.height = Math.max(1, this.host.clientHeight);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
    this.composer?.setSize(this.width, this.height);
  }
  setZoom(position) {
    if (!this.root || this.disposed) return;
    const minimum = Math.max(this.controls.minDistance, this.camera.near * 2, .00001);
    const distance = zoomDistance(position, minimum, this.controls.maxDistance);
    // A pending focus jump wins until the selected body has established its target.
    if (store.appSettings.focusingBody) return;
    const offset = this.camera.position.clone().sub(this.controls.target);
    if (offset.lengthSq() === 0) offset.set(1, .25, 1);
    this.camera.position.copy(this.controls.target).add(offset.setLength(distance));
    this.controls.update();
  }
  animate = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    const delta = this.clock.getDelta();
    this.stats.begin();
    // Original Drei controls update at priority -1, before Scene/body callbacks.
    this.controls.update();
    const { appSettings, userSettings } = store;
    if (appSettings.timeStepModifier !== userSettings.timeSpeedModifier) {
      appSettings.timeStepModifier = userSettings.timeSpeedModifier;
      appSettings.timeStep =
        Math.exp(userSettings.timeSpeedModifier * 20) * 0.00001;
    }
    this.root?.tick(this.camera, this.controls, delta);
    // Focus tracking may move camera/target and change the near limit this frame.
    appSettings.cameraDistance = this.controls.getDistance();
    appSettings.zoomMinDistance = Math.max(this.controls.minDistance, this.camera.near * 2, .00001);
    appSettings.zoomMaxDistance = this.controls.maxDistance;
    this.scene.updateMatrixWorld();
    syncBackgroundCamera(this.backgroundCamera, this.camera);
    this.root?.updateLabels(this.camera, this.width, this.height, delta);
    if (this.composer) {
      this.renderer.autoClear = true;
      this.composer.render(delta);
    } else {
      this.renderer.autoClear = true;
      this.renderer.render(this.backgroundScene, this.backgroundCamera);
      this.renderer.autoClear = false;
      this.renderer.render(this.scene, this.camera);
      this.renderer.autoClear = true;
    }
    this.stats.end();
  };
  hit(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(
      this.root?.pickables() ?? [],
      false,
    )[0];
  }
  onPointerDown = (event) => this.pointerDown.set(event.clientX, event.clientY);
  onPointerMove = (event) => {
    document.body.style.cursor = this.hit(event) ? "pointer" : "auto";
  };
  onPointerLeave = () => {
    document.body.style.cursor = "auto";
  };
  onClick = (event) => {
    if (
      this.pointerDown.distanceTo(new Vector2(event.clientX, event.clientY)) > 2
    )
      return;
    const hit = this.hit(event);
    if (hit) focusBody(hit.object.userData.bodyName);
  };
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.controls.dispose();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerleave", this.onPointerLeave);
    canvas.removeEventListener("click", this.onClick);
    this.composer?.dispose();
    this.root?.dispose();
    disposeSpacecraftTemplates(this.modelTemplates);
    this.spacecraftEnvironment?.dispose();
    this.environment?.dispose();
    this.textures.forEach((texture) => texture.dispose());
    this.stats.dom.remove();
    this.renderer.dispose();
    canvas.remove();
    document.body.style.cursor = "auto";
  }
}
