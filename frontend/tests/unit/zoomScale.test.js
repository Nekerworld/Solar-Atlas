import { describe, expect, it } from "vitest";
import { zoomPosition, zoomDistance } from "../../src/scene/zoomScale";
import { DEFAULT_CATEGORY_VISIBILITY } from "../../src/data/bodyCatalog";
describe("logarithmic observation distance", () => {
  it("round-trips across satellite and solar-system distances", () => {
    for (const [minimum, maximum] of [[.001,3e10],[5000,4e10]]) {
      for (const position of [0,.01,.25,.5,.75,.99,1]) {
        expect(zoomPosition(zoomDistance(position,minimum,maximum),minimum,maximum)).toBeCloseTo(position,10);
      }
      expect(zoomDistance(.5,minimum,maximum)).toBeCloseTo(Math.sqrt(minimum*maximum),4);
    }
  });
  it("clamps wheel overshoot to the current camera limits", () => {
    expect(zoomPosition(.001,1,100)).toBe(0);
    expect(zoomPosition(1000,1,100)).toBe(1);
    expect(zoomDistance(-1,1,100)).toBe(1);
    expect(zoomDistance(2,1,100)).toBe(100);
  });
  it("starts with moons and regions enabled among toggleable categories", () => {
    expect(DEFAULT_CATEGORY_VISIBILITY).toEqual({moon:true,region:true,comet:false,artifact:false,dwarf:false});
  });
});
