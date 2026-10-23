import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { realSolarSystemData, toonSolarSystemData } from "../../src/data/astronomicalBodyData";
import { orbitPoint } from "../../src/scene/orbitalMotion";
describe("Juno's Jupiter-centered orbit", () => {
  for (const [label,data] of [["actual",realSolarSystemData],["display",toonSolarSystemData]]) {
    it(`orbits outside Jupiter on a visible polar ellipse in ${label} mode`, () => {
      const jupiter = data.satellites.find(body=>body.name==="Jupiter");
      const juno = jupiter.satellites.find(body=>body.name==="Juno");
      expect(juno.markerPosition).toBeUndefined();
      expect(juno.orbitVisibility).toBe("closeup");
      expect(juno.orbit.keplerian).toBe(true);
      expect(juno.orbit.rotationPeriod).toBeCloseTo(1/32.75667326832932,12);
      expect(juno.orbit.inclination).toBeCloseTo(99.14509533003448*Math.PI/180,12);
      const near = orbitPoint(juno.orbit,0,new Vector3());
      const side = orbitPoint(juno.orbit,Math.PI/2,new Vector3());
      const far = orbitPoint(juno.orbit,Math.PI,new Vector3());
      expect(near.length()).toBeGreaterThan(jupiter.radius+juno.radius);
      expect(far.length()).toBeGreaterThan(near.length()*5);
      expect(near.distanceTo(side)).toBeGreaterThan(jupiter.radius);
      const normal = new Vector3().crossVectors(near,side).normalize();
      expect(juno.orbit.referencePole).toBeUndefined();
      // Independent J2000-ecliptic normal [sin(i)sin(node),-sin(i)cos(node),cos(i)]
      // converted once to the scene's Y-up [X,Z,-Y] frame.
      const i=99.14509533003448*Math.PI/180, n=286.8010188233038*Math.PI/180;
      const expectedNormal=new Vector3(Math.sin(i)*Math.sin(n),Math.cos(i),Math.sin(i)*Math.cos(n));
      expect(normal.distanceTo(expectedNormal)).toBeLessThan(1e-8);
      expect(juno.orbit.ascendingNode).toBeCloseTo(n,12);
      expect(juno.orbit.argumentOfPeriapsis).toBeCloseTo(128.3914917403179*Math.PI/180,12);
      if (label==="actual") expect(near.length()).toBeCloseTo(72084.83977192752,4);
    });
  }
});
