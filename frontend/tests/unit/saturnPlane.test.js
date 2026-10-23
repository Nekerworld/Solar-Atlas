import { afterEach, describe, expect, it, vi } from "vitest";
import { Vector3 } from "three";
import { realSolarSystemData, toonSolarSystemData } from "../../src/data/astronomicalBodyData";
import { AstronomicalBody } from "../../src/scene/astronomicalBody";
import { orbitPoint, poleDirection } from "../../src/scene/orbitalMotion";

const degrees = radians => radians * 180 / Math.PI;
function planeNormal(elements) {
  const peri = orbitPoint(elements, 0, new Vector3());
  const apo = orbitPoint(elements, Math.PI, new Vector3());
  const center = peri.clone().add(apo).multiplyScalar(.5);
  return peri.sub(center).cross(orbitPoint(elements, Math.PI / 2, new Vector3()).sub(center)).normalize();
}
function planeAngle(a, b) {
  return degrees(Math.acos(Math.min(1, Math.abs(a.dot(b)))));
}
function element() {
  return { style:{}, dataset:{}, append(){}, addEventListener(){}, remove(){} };
}
afterEach(() => vi.unstubAllGlobals());

describe("Saturn's equator, rings and satellite reference frames", () => {
  for (const [mode, data] of [["actual",realSolarSystemData], ["illustrative",toonSolarSystemData]]) {
    it(`${mode}: ring and inner moons share a reference plane after mode changes`, () => {
      vi.stubGlobal("document", { createElement:element });
      const saturn = data.satellites.find(b => b.name === "Saturn");
      const view = new AstronomicalBody(saturn, new Map(), element());
      try {
        // Repeatedly switch datasets, preserving phase like the live scene.
        for (const source of [data, data===realSolarSystemData?toonSolarSystemData:realSolarSystemData, data]) {
          const body = source.satellites.find(b => b.name === "Saturn");
          view.update(body);
          view.root.updateMatrixWorld(true);
          const ringNormal = new Vector3(0,0,1).transformDirection(view.ring.matrixWorld);
          const equator = poleDirection(body.equatorialPole,new Vector3()).normalize();
          expect(planeAngle(ringNormal,equator)).toBeLessThan(.00001);
          for (const name of ["Pan","Daphnis","Atlas","Prometheus","Pandora","Rhea"]) {
            const moon = body.satellites.find(b => b.name === name);
            expect(planeAngle(ringNormal,planeNormal(moon.orbit))).toBeLessThan(.4);
          }
          const iapetus = body.satellites.find(b => b.name === "Iapetus");
          expect(planeAngle(ringNormal,planeNormal(iapetus.orbit))).toBeGreaterThan(10);
          // The orbit trail and moving satellite agree in world coordinates.
          const pan = view.children.find(child => child.data.name === "Pan");
          const trailHead = new Vector3().fromBufferAttribute(pan.path.geometry.attributes.position,0);
          pan.path.localToWorld(trailHead);
          const moving = pan.position.getWorldPosition(new Vector3());
          expect(trailHead.distanceTo(moving) / body.satellites.find(b=>b.name==="Pan").orbit.radius).toBeLessThan(1e-6);
        }
      } finally { view.dispose(); }
    });
  }
});
