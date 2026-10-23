import { describe, expect, it } from "vitest";
import {
  realSolarSystemData,
  toonSolarSystemData,
} from "../../src/data/astronomicalBodyData";
import getBodyNames from "../../src/utils/getBodyNames";
import { createOrbitPath } from "../../src/scene/orbitPath";
describe("original data and orbit conventions", () => {
  it("retains original entries and matching expanded hierarchies in both display modes", () => {
    const expected = [
      "Sun",
      "Mercury",
      "Venus",
      "Earth",
      "Moon",
      "Mars",
      "Phobos",
      "Deimos",
      "Jupiter",
      "Saturn",
      "Uranus",
      "Neptune",
      "Pluto",
      "Halley",
      "Ceres",
      "Eris",
      "Haumea",
      "Makemake",
      "AsteroidBelt",
    ];
    const realNames = getBodyNames(realSolarSystemData).map((b) => b.name);
    const toonNames = getBodyNames(toonSolarSystemData).map((b) => b.name);
    expect(realNames).toEqual(expect.arrayContaining(expected));
    expect(toonNames).toEqual(realNames);
    expect(new Set(realNames).size).toBe(realNames.length);
    expect(
      getBodyNames(realSolarSystemData).find((b) => b.name === "Moon")?.level,
    ).toBe(1);
  });
  it("retains real versus illustrative distances and retrograde rotation", () => {
    const earth = realSolarSystemData.satellites.find(
      (b) => b.name === "Earth",
    );
    expect(earth.orbit.radius).toBe(149600000);
    expect(earth.orbit.rotationPeriod).toBe(1 / 365.2);
    expect(earth.rotationPeriod).toBe(24 / 23.9);
    expect(earth.axialTilt).toBe((23.4 * Math.PI) / 180);
    expect(
      toonSolarSystemData.satellites.find((b) => b.name === "Earth").radius,
    ).toBe(16000);
    expect(
      realSolarSystemData.satellites.find((b) => b.name === "Venus")
        .rotationPeriod,
    ).toBeLessThan(0);
  });
  it("preserves the 200-segment circular path and fading RGBA vertex colors", () => {
    const path = createOrbitPath(0x123456, 100);
    const p = path.geometry.getAttribute("position");
    const c = path.geometry.getAttribute("color");
    expect(p.count).toBe(201);
    expect(p.getX(0)).toBe(100);
    expect(p.getZ(50)).toBeCloseTo(100);
    expect(p.getX(200)).toBe(100);
    expect(c.itemSize).toBe(4);
    expect(c.getW(0)).toBe(255);
    expect(c.normalized).toBe(true);
    expect(c.getW(200)).toBe(0);
    expect(path.material.transparent).toBe(true);
    path.geometry.dispose();
    path.material.dispose();
  });
});
