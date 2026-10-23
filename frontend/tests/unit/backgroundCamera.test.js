import { describe, expect, it } from "vitest";
import { Matrix4, PerspectiveCamera, Vector3 } from "three";
import { syncBackgroundCamera } from "../../src/scene/backgroundCamera";

describe("sky orientation at Oort-cloud zoom distances", () => {
  it("removes the frame-dependent translation error in a camera-centred unit skybox", () => {
    const observer = new PerspectiveCamera(50, 1, 50, 9e13);
    const background = new PerspectiveCamera();
    const legacyOffsets = [], skyMatrices = [];
    // Camera and focus translate together: viewing direction stays identical.
    for (let i = 0; i < 8; i++) {
      observer.position.set(3e13 + i * 20, 1e13, 3e13);
      observer.lookAt(new Vector3(i * 20, 0, 0));
      observer.updateMatrixWorld(true);
      const legacy = new Matrix4().copyPosition(observer.matrixWorld);
      legacy.premultiply(observer.matrixWorldInverse);
      legacyOffsets.push(legacy.elements.slice(12, 15).join(","));
      syncBackgroundCamera(background, observer);
      skyMatrices.push(background.matrixWorldInverse.elements.slice());
      expect(background.position.toArray()).toEqual([0, 0, 0]);
      expect(background.projectionMatrix.elements).toEqual(observer.projectionMatrix.elements);
    }
    expect(new Set(legacyOffsets).size).toBeGreaterThan(1);
    for (const matrix of skyMatrices) {
      matrix.forEach((value, index) => expect(value).toBeCloseTo(skyMatrices[0][index], 12));
    }
  });

  it("still follows intentional rotation and projection changes", () => {
    const observer = new PerspectiveCamera(60, 1.8, .01, 9e13);
    observer.position.set(2e13, 1e13, 3e13);
    observer.rotation.set(.2, -.4, .1);
    const background = new PerspectiveCamera();
    syncBackgroundCamera(background, observer);
    expect(background.quaternion.equals(observer.quaternion)).toBe(true);
    expect(background.projectionMatrix.elements).toEqual(observer.projectionMatrix.elements);
  });
});
