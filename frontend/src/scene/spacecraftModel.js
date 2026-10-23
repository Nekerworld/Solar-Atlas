import { Box3, Group, Mesh, PMREMGenerator, Sphere, Vector3 } from "three";
import { DRACOLoader, GLTFLoader, RoomEnvironment, mergeBufferGeometries } from "three-stdlib";

// Procedural studio reflections for spacecraft only. No HDR download and no
// change to the star background or planetary lighting.
export function createSpacecraftEnvironment(renderer) {
  const generator = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  try { return generator.fromScene(room, .04); }
  finally {
    generator.dispose();
    const geometry = new Set(), materials = new Set();
    room.traverse(node => {
      if (node.isMesh) {
        geometry.add(node.geometry);
        for (const value of Array.isArray(node.material) ? node.material : [node.material]) materials.add(value);
      }
    });
    geometry.forEach(value=>value.dispose());
    materials.forEach(value=>value.dispose());
  }
}

export function applySpacecraftEnvironment(root, texture) {
  root.traverse(node => {
    if (!node.userData.spacecraftModel || !node.isMesh) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
        material.envMap = texture;
        material.envMapIntensity = .8;
        material.needsUpdate = true;
      }
    }
  });
}

// Hubble (B) contains 1308 untextured static meshes sharing a default material.
// Bake their transforms once and merge compatible geometry by material. This
// does not touch the original GLB, nor other spacecraft's editable part names.
export function batchStaticModel(scene) {
  scene.updateMatrixWorld(true);
  const buckets = new Map();
  let unsupported = false;
  scene.traverse(node => {
    if (!node.isMesh) return;
    if (node.isSkinnedMesh || Array.isArray(node.material) || Object.keys(node.geometry.morphAttributes).length) {
      unsupported = true;
      return;
    }
    const key = node.material.uuid + ':' + Object.keys(node.geometry.attributes).sort().join(',') + ':' + !!node.geometry.index;
    if (!buckets.has(key)) buckets.set(key, {material:node.material, nodes:[]});
    buckets.get(key).nodes.push(node);
  });
  if (unsupported || !buckets.size) return scene;
  const merged = new Group();
  for (const {material,nodes} of buckets.values()) {
    const geometries = nodes.map(node => node.geometry.clone().applyMatrix4(node.matrixWorld));
    const geometry = mergeBufferGeometries(geometries,false);
    geometries.forEach(value=>value.dispose());
    if (!geometry) {
      merged.traverse(node=>{ if(node.isMesh) node.geometry.dispose(); });
      return scene;
    }
    merged.add(new Mesh(geometry,material));
  }
  const originals = new Set();
  scene.traverse(node=>{ if(node.isMesh) originals.add(node.geometry); });
  originals.forEach(value=>value.dispose());
  return merged;
}

export async function loadSpacecraftTemplates(data, manager) {
  const paths = new Set();
  function visit(body) {
    if (body.modelSrc) paths.add(body.modelSrc);
    body.satellites.forEach(visit);
  }
  visit(data);
  const templates = new Map();
  if (!paths.size) return templates;
  const draco = new DRACOLoader(manager).setDecoderPath("/assets/models/draco/");
  draco.setWorkerLimit(1);
  const loader = new GLTFLoader(manager).setDRACOLoader(draco);
  try {
    await Promise.all([...paths].map(async path => {
      try {
        const { scene } = await loader.loadAsync(path);
        templates.set(path, scene);
      } catch (error) {
        console.warn(`3D model could not load: ${path}; keeping its marker.`, error);
      }
    }));
  } finally { draco.dispose(); }
  return templates;
}

export function disposeSpacecraftTemplates(templates) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  for (const template of templates.values()) template.traverse(node => {
    if (!node.isMesh) return;
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      materials.add(material);
      Object.values(material).forEach(value => { if (value?.isTexture) textures.add(value); });
    }
  });
  geometries.forEach(value => value.dispose());
  materials.forEach(value => value.dispose());
  textures.forEach(value => value.dispose());
  templates.clear();
}

export class SpacecraftModel {
  group = new Group();
  meshes = [];
  materials = [];
  constructor(template, bodyName, { natural = false } = {}) {
    const model = template.clone(true);
    model.updateMatrixWorld(true);
    const box = new Box3().setFromObject(model);
    const size = box.getSize(new Vector3());
    const longest = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(longest) || longest <= 0) throw new Error("Empty spacecraft model bounds");
    const center = box.getCenter(new Vector3());
    const normalized = new Group();
    model.position.sub(center);
    normalized.add(model);
    // Natural-body catalog radii are volume-equivalent; spacecraft radii
    // remain half the longest dimension. Preserve each scientific silhouette.
    const referenceRadius = natural
      ? template.userData.naturalRadius || Math.cbrt(size.x * size.y * size.z) / 2
      : longest / 2;
    if (!Number.isFinite(referenceRadius) || referenceRadius <= 0) throw new Error("Invalid model radius");
    normalized.scale.setScalar(1 / referenceRadius);
    this.group.add(normalized);
    // Focus/labels enclose the entire model in either display mode.
    this.radiusFactor = box.getBoundingSphere(new Sphere()).radius / referenceRadius;
    const materialCopies = new Map();
    model.traverse(node => {
      if (!node.isMesh) return;
      node.userData.bodyName = bodyName;
      node.userData.spacecraftModel = !natural;
      const convert = source => {
        // Preserve the complete glTF material: base color, normal/AO maps,
        // metallic/roughness maps, alpha, double-sidedness and UV transforms.
        if (materialCopies.has(source)) return materialCopies.get(source);
        const material = source.clone();
        materialCopies.set(source,material);
        this.materials.push(material);
        return material;
      };
      node.material = Array.isArray(node.material) ? node.material.map(convert) : convert(node.material);
      this.meshes.push(node);
    });
  }
  resize(radius) { this.group.scale.setScalar(radius); }
  dispose() {
    this.group.removeFromParent();
    this.materials.forEach(material => material.dispose());
    // Geometry/textures belong to the shared templates, released by SolarScene.
  }
}
