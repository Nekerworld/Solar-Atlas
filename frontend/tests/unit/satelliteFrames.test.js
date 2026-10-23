import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { realSolarSystemData, toonSolarSystemData } from "../../src/data/astronomicalBodyData";
import { orbitPoint, poleDirection } from "../../src/scene/orbitalMotion";

function normal(orbit) {
  const peri = orbitPoint(orbit, 0, new Vector3());
  const center = peri.clone().add(orbitPoint(orbit, Math.PI, new Vector3())).multiplyScalar(.5);
  return peri.sub(center).cross(orbitPoint(orbit, Math.PI / 2, new Vector3()).sub(center)).normalize();
}
const angle = (a,b) => Math.acos(Math.min(1,Math.max(-1,a.dot(b)))) * 180 / Math.PI;
const find = (data, name) => data.satellites.find(b => b.name === name);

describe("Satellite inclinations in both scale modes", () => {
  for (const [mode, data] of [["actual",realSolarSystemData],["illustrative",toonSolarSystemData]]) {
    it(`${mode}: regular satellites remain close to their planetary equators`, () => {
      for (const [parentName, limit, names] of [
        ["Mars",3,["Phobos","Deimos"]],
        ["Jupiter",2,["Metis","Adrastea","Amalthea","Thebe","Io","Europa","Ganymede","Callisto"]],
        ["Uranus",5,["Ariel","Miranda","Oberon","Puck","Titania","Umbriel"]],
        ["Neptune",1,["Proteus","Larissa"]],
        ["Pluto",.01,["Charon","Nix"]],
      ]) {
        const parent = find(data,parentName);
        const equator = poleDirection(parent.equatorialPole,new Vector3()).normalize();
        for (const name of names) {
          const moon = parent.satellites.find(b=>b.name===name);
          expect(moon.orbit.keplerian).toBe(true);
          expect(angle(equator,normal(moon.orbit))).toBeLessThan(limit);
        }
      }
    });
    it(`${mode}: Moon retains its ecliptic plane and Triton remains retrograde`, () => {
      const moon = find(data,"Earth").satellites.find(b=>b.name==="Moon");
      expect(moon.orbit.referencePole).toBeUndefined();
      expect(angle(new Vector3(0,1,0),normal(moon.orbit))).toBeCloseTo(5.16,5);
      const neptune = find(data,"Neptune");
      const triton = neptune.satellites.find(b=>b.name==="Triton");
      expect(angle(poleDirection(neptune.equatorialPole,new Vector3()),normal(triton.orbit))).toBeGreaterThan(150);
      expect(neptune.satellites.find(b=>b.name==="Nereid").orbit.referencePole).toBeUndefined();
    });
  }
  it("all natural satellites preserve plane orientation when scale mode changes", () => {
    for (const realParent of realSolarSystemData.satellites) {
      const toonParent = find(toonSolarSystemData,realParent.name);
      for (const moon of realParent.satellites.filter(b=>b.category==="moon")) {
        const other = toonParent.satellites.find(b=>b.name===moon.name);
        expect(normal(moon.orbit).distanceTo(normal(other.orbit))).toBeLessThan(1e-10);
      }
    }
  });
});
