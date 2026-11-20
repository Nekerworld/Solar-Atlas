import { describe, expect, it } from "vitest";
import { angleBetweenDeg, equatorialToScene, interpolateRaDec, windowCovers, windowIndex } from "../../src/utils/ephemerisInterp";

describe("천구 소천체 표 보간", () => {
  it("표본 위에서는 그 값을 그대로 돌려준다", () => {
    const ra = [10, 11, 12, 13];
    const dec = [-5, -4, -3, -2];
    expect(interpolateRaDec(ra, dec, 2)).toEqual({ ra: 12, dec: -3 });
    expect(interpolateRaDec(ra, dec, 0)).toEqual({ ra: 10, dec: -5 });
    expect(interpolateRaDec(ra, dec, 3)).toEqual({ ra: 13, dec: -2 });
  });

  it("직선으로 움직이는 천체는 표본 사이에서도 직선 위에 있다", () => {
    const ra = [10, 11, 12, 13, 14];
    const dec = [0, 2, 4, 6, 8];
    const mid = interpolateRaDec(ra, dec, 1.5);
    expect(mid.ra).toBeCloseTo(11.5, 9);
    expect(mid.dec).toBeCloseTo(3, 9);
  });

  it("적경이 360도를 넘어 감겨도 거꾸로 돌지 않는다", () => {
    const ra = [359.0, 359.5, 0.0, 0.5, 1.0];
    const dec = [0, 0, 0, 0, 0];
    const mid = interpolateRaDec(ra, dec, 1.5);
    expect(mid.ra).toBeCloseTo(359.75, 9);
    const after = interpolateRaDec(ra, dec, 2.5);
    expect(after.ra).toBeCloseTo(0.25, 9);
  });

  it("곡선(원 운동)도 선형보다 정확하게 따라간다", () => {
    const step = 30;
    const ra = [];
    const dec = [];
    for (let k = 0; k < 8; k += 1) {
      ra.push(180 + (10 * Math.cos((k * step * Math.PI) / 180)));
      dec.push(10 * Math.sin((k * step * Math.PI) / 180));
    }
    const at = interpolateRaDec(ra, dec, 3.5);
    const angle = (3.5 * step * Math.PI) / 180;
    expect(Math.abs(at.ra - (180 + (10 * Math.cos(angle))))).toBeLessThan(0.05);
    expect(Math.abs(at.dec - (10 * Math.sin(angle)))).toBeLessThan(0.05);
  });

  it("표 밖의 시각은 가장자리로 자르고, 덮는지도 알려 준다", () => {
    const window = { startMs: 1000, stepMs: 100, count: 11 };
    expect(windowIndex(window, 0)).toBe(0);
    expect(windowIndex(window, 1250)).toBeCloseTo(2.5, 12);
    expect(windowIndex(window, 99999)).toBe(10);
    expect(windowCovers(window, 1500)).toBe(true);
    expect(windowCovers(window, 900)).toBe(false);
    expect(windowCovers(window, 1100, 2)).toBe(false);
    expect(windowCovers(window, 1300, 2)).toBe(true);
    expect(windowCovers(null, 1300)).toBe(false);
  });
});

describe("적도 좌표를 천구 장면 좌표로", () => {
  it("춘분점은 +X, 천구 북극은 (0, cos ε, -sin ε)이다", () => {
    const [x, y, z] = equatorialToScene(0, 0);
    expect(x).toBeCloseTo(1, 12);
    expect(Math.abs(y) + Math.abs(z)).toBeLessThan(1e-12);
    const pole = equatorialToScene(123, 90);
    const eps = (23.4392911 * Math.PI) / 180;
    expect(pole[0]).toBeCloseTo(0, 12);
    expect(pole[1]).toBeCloseTo(Math.cos(eps), 12);
    expect(pole[2]).toBeCloseTo(-Math.sin(eps), 12);
  });

  it("황도 위의 점(적경 90°, 적위 ε)은 황경 90°, 곧 장면 -Z 쪽이다", () => {
    const eps = 23.4392911;
    const v = equatorialToScene(90, eps);
    expect(v[0]).toBeCloseTo(0, 9);
    expect(v[1]).toBeCloseTo(0, 9);
    expect(v[2]).toBeCloseTo(-1, 9);
  });

  it("단위 벡터이며 각도 계산이 맞다", () => {
    const a = equatorialToScene(30, 20);
    expect(Math.hypot(...a)).toBeCloseTo(1, 12);
    expect(angleBetweenDeg(a, a)).toBeCloseTo(0, 6);
    expect(angleBetweenDeg(equatorialToScene(0, 0), equatorialToScene(90, 0))).toBeCloseTo(90, 9);
  });
});
