import { describe, expect, it } from "vitest";
import { Box3, BoxGeometry, Group, Mesh, MeshPhongMaterial, MeshStandardMaterial, Texture, Vector3 } from "three";
import { SpacecraftModel, batchStaticModel, applySpacecraftEnvironment } from "../../src/scene/spacecraftModel";
import { realSolarSystemData, toonSolarSystemData } from "../../src/data/astronomicalBodyData";

describe("Spacecraft model integration", () => {
  it("centers an off-origin asset, rescales and tags all its meshes for selection", () => {
    const template = new Group();
    const geometry = new BoxGeometry(10,4,2);
    const originalMaterial = new MeshPhongMaterial({color:0xffaa00});
    const mesh = new Mesh(geometry,originalMaterial);
    mesh.position.set(25,30,-10);
    template.add(mesh);
    const view = new SpacecraftModel(template,"ISS");
    try {
      for (const radius of [900,.055,900]) {
        view.resize(radius);
        view.group.updateMatrixWorld(true);
        const box = new Box3().setFromObject(view.group);
        expect(box.getCenter(new Vector3()).length()).toBeLessThan(1e-8);
        expect(box.getSize(new Vector3()).x).toBeCloseTo(radius*2,8);
      }
      expect(view.meshes).toHaveLength(1);
      expect(view.meshes[0].userData.bodyName).toBe("ISS");
      expect(view.meshes[0].material).not.toBe(originalMaterial);
      expect(mesh.material).toBe(originalMaterial);
      expect(mesh.position.x).toBe(25);
      expect(view.radiusFactor).toBeGreaterThan(1);
    } finally {
      view.dispose(); geometry.dispose(); originalMaterial.dispose();
    }
  });
  it("preserves PBR maps and isolates each instance's material and reflection settings", () => {
    const map = new Texture();
    const environment = new Texture();
    const material = new MeshStandardMaterial({ map, normalMap:map, aoMap:map,
      roughnessMap:map, metalnessMap:map, metalness:.8, roughness:.3 });
    const geometry = new BoxGeometry();
    const template = new Group();
    template.add(new Mesh(geometry,material));
    const first = new SpacecraftModel(template,"Voyager1");
    const second = new SpacecraftModel(template,"Voyager2");
    try {
      const copy = first.meshes[0].material;
      expect(copy.isMeshStandardMaterial).toBe(true);
      for (const key of ["map","normalMap","aoMap","roughnessMap","metalnessMap"]) expect(copy[key]).toBe(map);
      expect(copy.metalness).toBe(.8);
      expect(copy.roughness).toBe(.3);
      applySpacecraftEnvironment(first.group,environment);
      expect(copy.envMap).toBe(environment);
      expect(second.meshes[0].material.envMap).toBeNull();
      expect(material.envMap).toBeNull();
      expect(second.meshes[0].userData.bodyName).toBe("Voyager2");
    } finally {
      first.dispose(); second.dispose(); geometry.dispose(); material.dispose(); map.dispose(); environment.dispose();
    }
  });
  it("applies models to all spacecraft in both modes", () => {
    for (const data of [realSolarSystemData,toonSolarSystemData]) {
      function all(body) { return [body,...body.satellites.flatMap(all)]; }
      const models = all(data).filter(body=>body.modelSrc && body.category === "artifact");
      expect(models.map(body=>body.name).sort()).toEqual(
        ["ISS","Tiangong","Hubble","JamesWebb","Juno","Voyager1","Voyager2","NewHorizons"].sort());
      expect(all(data).find(body=>body.name==="Tiangong").modelSrc).toBe("/assets/models/community/tiangong/scene.gltf");
      expect(new Set(models.map(body=>body.modelSrc)).size).toBe(7);
      expect(models.find(body=>body.name==="ISS").modelSrc).toBe("/assets/models/community/iss/scene.gltf");
    }
  });
  it("scales natural bodies by their reference radius without spacecraft reflections", () => {
    const template = new Group();
    const material = new MeshStandardMaterial();
    const geometry = new BoxGeometry(10,4,2);
    template.add(new Mesh(geometry,material));
    template.userData.naturalRadius = 2;
    const view = new SpacecraftModel(template,"Pan",{natural:true});
    const environment = new Texture();
    try {
      view.resize(3);
      const size = new Box3().setFromObject(view.group).getSize(new Vector3());
      expect(size.x).toBeCloseTo(15);
      expect(size.y).toBeCloseTo(6);
      expect(size.z).toBeCloseTo(3);
      applySpacecraftEnvironment(view.group,environment);
      expect(view.meshes[0].material.envMap).toBeNull();
      expect(view.meshes[0].userData.bodyName).toBe("Pan");
    } finally { view.dispose(); geometry.dispose(); material.dispose(); environment.dispose(); }
  });
  it("batches static parts while preserving world-space bounds", () => {
    const scene = new Group();
    const material = new MeshPhongMaterial();
    const geometry = new BoxGeometry(2,4,6);
    for (const x of [-10,10]) {
      const node = new Mesh(geometry,material); node.position.x=x; scene.add(node);
    }
    const before = new Box3().setFromObject(scene);
    const merged = batchStaticModel(scene);
    const after = new Box3().setFromObject(merged);
    expect(merged.children).toHaveLength(1);
    expect(after.min.distanceTo(before.min)).toBeLessThan(1e-8);
    expect(after.max.distanceTo(before.max)).toBeLessThan(1e-8);
    merged.children.forEach(node=>node.geometry.dispose()); material.dispose();
  });
});
