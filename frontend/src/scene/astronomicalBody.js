import {
  AxesHelper,
  DirectionalLight,
  DoubleSide,
  Group,
  Mesh,
  MeshPhongMaterial,
  Object3D,
  PointLight,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from "three";
import { focusBody, store } from "../data/store";
import { bodyLabelDescription, isBodyVisible } from "../data/bodyCatalog";
import { createKeplerOrbitPath, createOpenOrbitPath, createOrbitPath } from "./orbitPath";
import { EarthSurface } from "./earthSurface";
import { CometTail } from "./cometTail";
import { AsteroidBelt } from "./asteroidBelt";
import { SpacecraftModel } from "./spacecraftModel";
import { openOrbitPoint, orbitPoint, poleDirection, solveEccentricAnomaly } from "./orbitalMotion";
import { easeOpacity, projectedDiameterFraction, smoothVisibility } from "./detailVisibility";
export class AstronomicalBody {
  textures;
  root = new Group();
  orbit = new Group();
  offset = new Group();
  position = new Group();
  axial = new Group();
  body = new Group();
  labelAnchor = new Object3D();
  mesh;
  children;
  label;
  labelText;
  pointLight;
  directionalLight;
  ring;
  path;
  axes;
  data;
  currentPosition = new Vector3();
  nextPosition = new Vector3();
  focusOffset = new Vector3();
  legacyOrbitAngle = 0;
  meanAnomaly = 0;
  trajectoryProgress = 0;
  radialPosition = new Vector3();
  equatorialNormal = new Vector3();
  northAxis = new Vector3(0, 1, 0);
  detailOpacity = 1;
  constructor(data, textures, labels, parentBody = null, modelTemplates = new Map()) {
    this.parentBody = parentBody;
    this.detailOpacity = data.category === "moon" || (data.category === "artifact" && parentBody && !parentBody.data.isLight) ? 0 : 1;
    this.textures = textures;
    this.data = data;
    this.root.add(this.orbit);
    this.orbit.add(this.offset);
    this.offset.add(this.position);
    this.position.add(this.labelAnchor, this.axial);
    this.axial.add(this.body);
    this.mesh = new Mesh(new SphereGeometry(), new MeshPhongMaterial());
    this.mesh.name = data.name;
    this.mesh.userData.bodyName = data.name;
    this.mesh.castShadow = !data.isLight;
    this.mesh.receiveShadow = !data.isLight;
    this.body.add(this.mesh);
    const template = modelTemplates.get(data.modelSrc);
    if (template) {
      this.spacecraftModel = new SpacecraftModel(template, data.name, { natural: data.modelKind === "natural" });
      this.body.add(this.spacecraftModel.group);
      this.mesh.visible = false;
    }
    if (data.name === "Earth") {
      this.earthSurface = new EarthSurface(this.mesh, textures);
      this.body.add(this.earthSurface.clouds);
    }
    if (data.category === "comet" && parentBody) {
      this.cometTail = new CometTail(this.position, parentBody.position);
    }
    this.axes = new AxesHelper(data.radius * 1.6);
    this.body.add(this.axes);
    this.rebuildOrbitPath();
    if (data.isLight) {
      this.pointLight = new PointLight(data.color, 2, 0);
      this.pointLight.castShadow = true;
      this.pointLight.shadow.camera.far = 1500000;
      this.directionalLight = new DirectionalLight(data.color, 2);
      this.directionalLight.castShadow = true;
      this.directionalLight.shadow.camera.far = 6000000000;
      this.position.add(this.pointLight, this.directionalLight);
    }
    this.label = document.createElement("div");
    this.label.className = "canvas-body-object";
    this.label.dataset.body = data.name;
    const center = document.createElement("div");
    center.style.position = "absolute";
    center.style.transform = "translate(-50%, -50%)";
    this.labelText = document.createElement("p");
    this.labelText.textContent = data.displayName || data.name;
    this.labelText.title = bodyLabelDescription(data);
    this.labelText.addEventListener("click", () => focusBody(this.data.name));
    center.append(this.labelText);
    this.label.append(center);
    labels.append(this.label);
    this.children = data.satellites.map((satellite) => {
      const child = ["asteroid_belt", "particle_region"].includes(satellite.kind)
        ? new AsteroidBelt(satellite, textures, labels)
        : new AstronomicalBody(satellite, textures, labels, this, modelTemplates);
      this.position.add(child.root);
      return child;
    });
    // Keep independent phases so switching display modes cannot rotate an ellipse.
    const initialAngle = Math.floor(Math.random() * Math.PI * 2);
    this.legacyOrbitAngle = initialAngle;
    this.meanAnomaly = data.orbit.initialMeanAnomaly ?? initialAngle;
    this.trajectoryProgress = data.orbit.initialProgress ?? 0.5;
    this.update(data);
    if (data.name === "Moon") this.body.rotation.y += initialAngle + Math.PI;
  }
  update(data) {
    this.data = data;
    this.label.dataset.category = data.category;
    this.label.classList.toggle("major-moon-label",data.isMajorMoon === true);
    this.labelText.title = bodyLabelDescription(data);
    const { actualScale } = store.userSettings;
    const division = 32;
    if (data.orbit.keplerian) {
      // Plane orientation is baked into line/position coordinates exactly once.
      this.root.rotation.set(0, 0, 0);
      this.orbit.rotation.set(0, 0, 0);
      this.position.rotation.set(0, 0, 0);
      this.updateKeplerPosition();
    } else {
      // Actual scale retains its original data, circular motion and transforms.
      this.root.rotation.set(0, 0, data.orbit.inclination);
      this.orbit.rotation.set(0, this.legacyOrbitAngle, 0);
      this.offset.position.set(data.orbit.radius, 0, 0);
      this.position.rotation.set(0, -this.legacyOrbitAngle, -data.orbit.inclination);
    }
    if (data.equatorialPole) {
      // position is non-spinning: orient the equator once, then spin body locally.
      // RingGeometry's local normal is +/-Y after its own X rotation below.
      this.axial.quaternion.setFromUnitVectors(this.northAxis,
        poleDirection(data.equatorialPole, this.equatorialNormal).normalize());
    } else {
      this.axial.rotation.set(0, 0, data.orbit.inclination + data.axialTilt);
    }
    this.spacecraftModel?.resize(data.radius);
    this.visualRadius = data.radius * (this.spacecraftModel?.radiusFactor || 1);
    this.labelAnchor.position.y = this.visualRadius * 1.8;
    this.focusOffset.set(this.visualRadius * 4, this.visualRadius * 1.25, this.visualRadius * 4);
    this.mesh.geometry.dispose();
    this.mesh.geometry = new SphereGeometry(
      data.radius,
      division * 2,
      division,
    );
    const material = this.mesh.material;
    material.map = data.textureSrc ? this.textures.get(data.textureSrc) : null;
    material.color.set(material.map ? 0xffffff : data.color);
    material.emissive.set(this.earthSurface ? 0xffffff : data.isLight ? data.color : 0x000000);
    this.earthSurface?.resize(data.radius, division);
    if (data.category === "artifact") material.emissive.set(0x171b24);
    material.shininess = data.albedo;
    material.needsUpdate = true;
    this.rebuildOrbitPath();
    this.body.remove(this.axes);
    this.axes.geometry.dispose();
    this.axes.material.dispose();
    this.axes = new AxesHelper(data.radius * 1.6);
    this.body.add(this.axes);
    if (data.ring) {
      if (this.ring) {
        this.body.remove(this.ring);
        this.ring.geometry.dispose();
        this.ring.material.dispose();
      }
      const geometry = new RingGeometry(
        data.ring.innerRadius * 2,
        data.ring.outerRadius * 2,
        division * 4,
      );
      const texture = data.ring.textureSrc
        ? this.textures.get(data.ring.textureSrc)
        : null;
      if (texture) {
        const uvs = geometry.attributes.uv.array;
        const { phiSegments, thetaSegments } = geometry.parameters;
        let c = 0;
        for (let j = 0; j <= phiSegments; j++) {
          for (let i = 0; i <= thetaSegments; i++) {
            uvs[c++] = j / phiSegments;
            uvs[c++] = i / thetaSegments;
          }
        }
      }
      this.ring = new Mesh(
        geometry,
        new MeshPhongMaterial({
          transparent: true,
          side: DoubleSide,
          color: texture ? 0xffffff : data.color,
          map: texture,
          shininess: data.albedo,
        }),
      );
      this.ring.rotation.x = Math.PI / 2;
      this.ring.castShadow = !data.isLight;
      this.ring.receiveShadow = !data.isLight;
      this.ring.userData.bodyName = data.name;
      this.body.add(this.ring);
    }
    if (this.pointLight) this.pointLight.visible = !actualScale;
    if (this.directionalLight) this.directionalLight.visible = actualScale;
    this.children.forEach((child, i) => child.update(data.satellites[i]));
    this.updateVisibility();
  }
  rebuildOrbitPath() {
    if (this.path) {
      this.path.removeFromParent();
      this.path.geometry.dispose();
      this.path.material.dispose();
    }
    this.path = undefined;
    // Position markers have no trajectory geometry, even with global Orbits on.
    if (this.data.orbitVisibility === "never") return;
    const elements = this.data.orbit;
    if (["flyby", "escape"].includes(elements.pathType)) {
      this.path = createOpenOrbitPath(elements, this.trajectoryProgress);
      this.root.add(this.path);
    } else if (elements.keplerian) {
      // Coordinates already include plane inclination, node and periapsis.
      // Keep this line outside the legacy phase-rotation group.
      this.path = createKeplerOrbitPath(elements,
        solveEccentricAnomaly(this.meanAnomaly, elements.eccentricity));
      this.root.add(this.path);
    } else {
      this.path = createOrbitPath(elements.color, elements.radius);
      this.orbit.add(this.path);
    }
    this.updateOrbitVisibility();
  }
  updateDetailOpacity(camera, delta) {
    const isMoon = this.data.category === "moon";
    const isLocalArtifact = this.data.category === "artifact" && this.parentBody && !this.parentBody.data.isLight;
    if (!this.parentBody || (!isMoon && !isLocalArtifact)) {
      this.detailOpacity = 1;
      return;
    }
    this.parentBody.position.getWorldPosition(this.radialPosition);
    const parentFraction = projectedDiameterFraction(this.parentBody.data.radius,
      camera.position.distanceTo(this.radialPosition),camera.fov);
    let fraction = parentFraction;
    // A selected tiny spacecraft must retain its own label when viewed close up,
    // even when its parent (e.g. Earth from Webb) is small or off screen.
    if (store.userSettings.focusedBody === this.data.name) {
      this.position.getWorldPosition(this.radialPosition);
      fraction = Math.max(fraction,projectedDiameterFraction(this.data.radius,
        camera.position.distanceTo(this.radialPosition),camera.fov));
    }
    // Moons and non-solar spacecraft share the same fade thresholds.
    // Sun-parented spacecraft have already returned above, unchanged.
    const detailRange = store.userSettings.actualScale ? 2.5 : 1;
    const target = smoothVisibility(fraction, .025 / detailRange, .10 / detailRange);
    this.detailOpacity = easeOpacity(this.detailOpacity,target,delta);
  }
  updateOrbitVisibility() {
    if (!this.path) return;
    const zoomDependent = this.data.category === "moon" || this.data.orbitVisibility === "closeup";
    const opacity = zoomDependent ? this.detailOpacity : 1;
    this.path.visible = isBodyVisible(this.data,store.userSettings.categoryVisibility,store.userSettings.bodyVisibility);
    this.path.material.opacity = opacity;
    this.path.material.visible = store.userSettings.showOrbitPaths && opacity > .001;
  }
  updateVisibility(parentVisible = true) {
    // Keep the transform/children and sunlight alive when only this body is hidden.
    this.root.visible = parentVisible && isBodyVisible(this.data, store.userSettings.categoryVisibility);
    this.body.visible = isBodyVisible(this.data,store.userSettings.categoryVisibility,store.userSettings.bodyVisibility);
    this.updateOrbitVisibility();
    this.axes.visible = store.userSettings.showDebugInfo;
    this.children.forEach((child) => child.updateVisibility(this.root.visible));
  }
  updateKeplerPosition() {
    const orbit = this.data.orbit;
    if (this.data.markerPosition) {
      this.offset.position.fromArray(this.data.markerPosition);
      if (this.data.markerFrame === "radial" && this.root.parent) {
        this.root.parent.getWorldPosition(this.radialPosition);
        this.root.rotation.y = -Math.atan2(this.radialPosition.z, this.radialPosition.x);
      }
      return;
    }
    if (["flyby", "escape"].includes(orbit.pathType)) {
      openOrbitPoint(orbit, this.trajectoryProgress, this.offset.position);
      this.path?.userData.updateTrail?.(this.trajectoryProgress);
      return;
    }
    if (orbit.pathType === "halo" && this.root.parent) {
      this.root.parent.getWorldPosition(this.radialPosition);
      this.root.rotation.y = -Math.atan2(this.radialPosition.z, this.radialPosition.x);
    }
    const eccentricAnomaly = solveEccentricAnomaly(this.meanAnomaly, orbit.eccentricity);
    orbitPoint(orbit, eccentricAnomaly, this.offset.position);
    this.path?.userData.updateTrail?.(eccentricAnomaly);
  }
  tick(camera, controls, delta = 1 / 60) {
    const { appSettings, userSettings } = store;
    if (userSettings.timeSpeedModifier > 0) {
      if (this.data.orbit.keplerian) {
        // Match the existing speed at 60 FPS; Kepler motion is frame independent.
        if (["flyby", "escape"].includes(this.data.orbit.pathType)) {
          // Open arcs never wrap from the endpoint back to launch/perihelion.
          this.trajectoryProgress = Math.min(1, this.trajectoryProgress + this.data.orbit.rotationPeriod
            * appSettings.timeStep * Math.min(delta, 0.1) * 60);
        } else {
          this.meanAnomaly = (this.meanAnomaly + this.data.orbit.rotationPeriod
            * appSettings.timeStep * Math.min(delta, 0.1) * 60) % (Math.PI * 2);
        }
        this.updateKeplerPosition();
      } else {
        // Preserve Actual scale's original per-frame circular orbit model.
        const step = this.data.orbit.rotationPeriod * appSettings.timeStep;
        this.legacyOrbitAngle += step;
        this.orbit.rotation.y = this.legacyOrbitAngle;
        this.position.rotation.y = -this.legacyOrbitAngle;
      }
      this.body.rotation.y += this.data.rotationPeriod * appSettings.timeStep;
    }
    if (userSettings.focusedBody === this.data.name) {
      this.body.getWorldPosition(this.nextPosition);
      controls.target = this.nextPosition;
      if (appSettings.focusingBody) {
        camera.near = Math.min(50, Math.max(0.00001, this.visualRadius * 0.1));
        camera.updateProjectionMatrix();
        camera.position.set(
          this.nextPosition.x - this.focusOffset.x,
          this.nextPosition.y + this.focusOffset.y,
          this.nextPosition.z + this.focusOffset.z,
        );
        controls.minDistance = this.visualRadius + camera.near;
        appSettings.focusingBody = false;
      } else {
        camera.position.x += this.nextPosition.x - this.currentPosition.x;
        camera.position.y += this.nextPosition.y - this.currentPosition.y;
        camera.position.z += this.nextPosition.z - this.currentPosition.z;
      }
      // Cache across frames so tracking also includes motion of the parent planet.
      this.currentPosition.copy(this.nextPosition);
    }
    if (
      this.data.isLight &&
      userSettings.actualScale &&
      this.directionalLight
    ) {
      this.directionalLight.position.copy(controls.target).negate();
    }
    this.earthSurface?.tick(delta, userSettings.timeSpeedModifier);
    this.children.forEach((child) => child.tick(camera, controls, delta));
  }
  updateLabels(camera, width, height, delta = 1/60) {
    // Run after world matrices and the focused camera have been updated.
    const selected=store.userSettings.focusedBody===this.data.name;
    if (this.labelSelected !== selected) {
      this.label.classList.toggle("selected-label",selected);
      this.labelSelected=selected;
    }
    this.cometTail?.update(camera, this.data, this.meanAnomaly, delta,
      store.userSettings.actualScale, store.userSettings.timeSpeedModifier > 0, this.root.visible && this.body.visible);
    this.updateDetailOpacity(camera, delta);
    this.updateOrbitVisibility();
    this.label.style.opacity = String(this.detailOpacity);
    this.label.style.pointerEvents = this.detailOpacity > .2 ? "auto" : "none";
    const world = this.labelAnchor.getWorldPosition(new Vector3());
    const cameraPosition = camera.getWorldPosition(new Vector3());
    const behind =
      world
        .clone()
        .sub(cameraPosition)
        .angleTo(camera.getWorldDirection(new Vector3())) >
      Math.PI / 2;
    this.label.style.display =
      this.root.visible && this.body.visible && store.userSettings.showLabels && !behind && this.detailOpacity > .001 ? "block" : "none";
    const distance = world.distanceTo(cameraPosition);
    world.project(camera);
    this.label.style.transform = `translate3d(${(world.x * width) / 2 + width / 2}px,${(-world.y * height) / 2 + height / 2}px,0)`;
    const depth = Math.log1p(distance / camera.near) / Math.log1p(camera.far / camera.near);
    this.label.style.zIndex = String(Math.round(16777271 * (1 - Math.min(1, depth))));
    this.children.forEach((child) => child.updateLabels(camera, width, height, delta));
  }
  pickables() {
    if (!this.root.visible) return [];
    return [
      ...(this.body.visible ? (this.spacecraftModel ? this.spacecraftModel.meshes : [this.mesh]) : []),
      ...(this.body.visible && this.ring ? [this.ring] : []),
      ...this.children.flatMap((child) => child.pickables()),
    ];
  }
  dispose() {
    this.label.remove();
    this.children.forEach((child) => child.dispose());
    this.earthSurface?.dispose();
    this.spacecraftModel?.dispose();
    this.cometTail?.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.path?.geometry.dispose();
    this.path?.material.dispose();
    this.axes.geometry.dispose();
    this.axes.material.dispose();
    this.ring?.geometry.dispose();
    this.ring?.material.dispose();
    this.pointLight?.shadow.map?.dispose();
    this.directionalLight?.shadow.map?.dispose();
  }
}
