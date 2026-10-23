import {
  Color, DynamicDrawUsage, Group, InstancedMesh, Matrix4, MeshPhongMaterial,
  SphereGeometry, Vector3,
} from "three";
import { focusBody, store } from "../data/store";
import { isBodyVisible } from "../data/bodyCatalog";

// Deterministic visual population, not a catalog of actual asteroid positions.
function randomGenerator(seed = 73129) {
  let state = seed;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}

export class AsteroidBelt {
  root = new Group();
  elapsed = 0;
  matrix = new Matrix4();
  anchor = new Vector3();
  projected = new Vector3();
  cameraPosition = new Vector3();
  viewDirection = new Vector3();
  constructor(data, _textures, labels) {
    const random = randomGenerator(data.seed);
    this.records = Array.from({ length: data.particleCount || 2000 }, () => ({
      radial: (random() + random()) * 0.5,
      phase: random() * Math.PI * 2,
      node: random() * Math.PI * 2,
      tilt: data.distribution === "shell" ? Math.acos(2*random()-1)-Math.PI/2 : (random() - 0.5) * (data.thickness || 0.07),
      size: data.particleRadius ? data.particleRadius*(.3+Math.pow(random(),3)) : 500 + Math.pow(random(), 3) * 5800,
      shade: 0.45 + random() * 0.45,
    }));
    this.mesh = new InstancedMesh(new SphereGeometry(1, 8, 6), new MeshPhongMaterial({
      color: 0xffffff, emissive: 0x16120f, emissiveIntensity: 0.3, shininess: 3,
    }), this.records.length);
    this.mesh.name = data.name + " population";
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    // The instance population spans an orbit; default unit-sphere bounds are wrong.
    this.mesh.frustumCulled = false;
    const color = new Color();
    this.records.forEach((record, index) => this.mesh.setColorAt(index,
      color.setRGB(record.shade, record.shade * 0.93, record.shade * 0.85)));
    this.root.add(this.mesh);
    this.label = document.createElement("div");
    this.label.className = "canvas-body-object asteroid-belt-label";
    this.label.dataset.body = data.name;
    const center = document.createElement("div");
    center.style.transform = "translate(-50%, -50%)";
    this.labelText = document.createElement("p");
    this.labelText.textContent = data.displayName;
    this.labelText.title = data.referenceNote || "";
    this.labelText.addEventListener("click", () => focusBody(this.data.name));
    center.append(this.labelText);
    this.label.append(center);
    labels.append(this.label);
    this.update(data);
  }
  update(data) {
    const previous = this.data;
    this.data = data;
    if (previous?.particleRadius && data.particleRadius) {
      this.records.forEach(record => { record.size *= data.particleRadius/previous.particleRadius; });
    }
    // Fixed location relative to the belt, never advanced by the particle clock.
    const angle = data.labelAngle ?? Math.PI * 0.72;
    const radius = data.innerRadius * 0.2 + data.outerRadius * 0.8;
    this.anchor.set(Math.cos(angle) * radius, radius * 0.045, -Math.sin(angle) * radius);
    this.updateInstances();
    this.updateVisibility();
  }
  updateInstances() {
    const data = this.data;
    this.records.forEach((record, index) => {
      const radius = data.innerRadius + (data.outerRadius - data.innerRadius) * record.radial;
      const physicalAU = 2.1 + 1.2 * record.radial;
      const angle = record.phase + this.elapsed / (365.25 * Math.pow(physicalAU, 1.5));
      if (data.distribution === "shell") {
        // Uniform direction on a sphere, with a volume-weighted shell radius.
        const shellRadius = Math.cbrt(data.innerRadius**3 + record.radial*(data.outerRadius**3-data.innerRadius**3));
        const c = Math.cos(record.tilt);
        const size = record.size * data.particleScale;
        this.matrix.makeScale(size,size,size).setPosition(shellRadius*c*Math.cos(record.phase),
          shellRadius*Math.sin(record.tilt), shellRadius*c*Math.sin(record.phase));
        this.mesh.setMatrixAt(index,this.matrix);
        return;
      }
      const localX = radius * Math.cos(angle);
      const localZ = -radius * Math.sin(angle);
      const y = -localZ * Math.sin(record.tilt);
      const z = localZ * Math.cos(record.tilt);
      const x = localX * Math.cos(record.node) + z * Math.sin(record.node);
      const worldZ = -localX * Math.sin(record.node) + z * Math.cos(record.node);
      const size = record.size * data.particleScale;
      this.matrix.makeScale(size, size, size).setPosition(x, y, worldZ);
      this.mesh.setMatrixAt(index, this.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  updateVisibility(parentVisible = true) {
    const wasVisible = this.root.visible;
    this.root.visible = parentVisible && isBodyVisible(this.data, store.userSettings.categoryVisibility, store.userSettings.bodyVisibility);
    if (!wasVisible && this.root.visible) this.updateInstances();
    if (!this.root.visible || !store.userSettings.showLabels) this.label.style.display = "none";
  }
  tick(camera, controls, delta = 1 / 60) {
    if (!this.data.staticPopulation && store.userSettings.timeSpeedModifier > 0) {
      this.elapsed += store.appSettings.timeStep * Math.min(delta, 0.1) * 60;
      if (this.root.visible) this.updateInstances();
    }
    if (store.userSettings.focusedBody === this.data.name && store.appSettings.focusingBody) {
      const center = this.root.getWorldPosition(new Vector3());
      controls.target.copy(center);
      camera.position.copy(center).add(new Vector3(this.data.outerRadius * 1.4,
        this.data.outerRadius * 1.9, this.data.outerRadius * 1.4));
      camera.near = 50;
      camera.updateProjectionMatrix();
      controls.minDistance = camera.near * 2;
      store.appSettings.focusingBody = false;
    }
  }
  updateLabels(camera, width, height) {
    const selected=store.userSettings.focusedBody===this.data.name;
    if (this.labelSelected !== selected) {
      this.label.classList.toggle("selected-label",selected);
      this.labelSelected=selected;
    }
    this.projected.copy(this.anchor);
    this.root.localToWorld(this.projected);
    camera.getWorldPosition(this.cameraPosition);
    camera.getWorldDirection(this.viewDirection);
    const distance = this.projected.distanceTo(this.cameraPosition);
    const behind = this.projected.clone().sub(this.cameraPosition).dot(this.viewDirection) <= 0;
    this.projected.project(camera);
    this.label.style.display = this.root.visible && store.userSettings.showLabels && !behind && Math.abs(this.projected.z) <= 1 ? "block" : "none";
    this.label.style.transform = `translate3d(${(this.projected.x + 1) * width / 2}px,${(1 - this.projected.y) * height / 2}px,0)`;
    const depth = Math.log1p(distance / camera.near) / Math.log1p(camera.far / camera.near);
    this.label.style.zIndex = String(Math.round(16777271 * (1 - Math.min(1, depth))));
  }
  pickables() { return []; } // Avoid raycasting 2000 background rocks on every pointer move.
  dispose() {
    this.label.remove();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
  }
}
