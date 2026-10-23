import { describe, expect, it } from "vitest";
import { NATURAL_MODEL_NAMES } from "../../src/data/naturalBodyModels";
import { realSolarSystemData, toonSolarSystemData } from "../../src/data/astronomicalBodyData";
describe("scientific natural body models", () => {
  it("uses identical model paths in both modes with UV-compatible model textures", () => {
    const collect = body => [body,...body.satellites.flatMap(collect)];
    for (const data of [realSolarSystemData,toonSolarSystemData]) {
      const bodies=collect(data).filter(body=>body.modelKind==="natural");
      expect(bodies.map(body=>body.name).sort()).toEqual([...NATURAL_MODEL_NAMES].sort());
      for (const body of bodies) {
        expect(body.modelSrc).toBe(`/assets/models/natural/${body.name}/scene.gltf`);
        expect(body.textureSrc).toBeUndefined();
      }
      expect(collect(data).find(body=>body.name==="Makemake").modelSrc).toBeUndefined();
    }
  });
});
