import { describe, expect, it } from "vitest";
import { horizonCoverDeg } from "../../sky/horizon.js";

const seoul = { lat: 37.5665, lon: 126.978 };

describe("산맥이 가리는 고도", () => {
  it("평평한 지평선(0°)보다 높고, 가장 먼 산의 최대 높이보다 낮다", () => {
    const cover = horizonCoverDeg(0, seoul, 2);
    const farthest = Math.atan2(2100 - 2, 29000) * 180 / Math.PI;
    expect(cover).toBeGreaterThan(0);
    expect(cover).toBeLessThanOrEqual(farthest + 0.01);
  });

  it("같은 장소·같은 방위는 늘 같은 각이고, 0°와 360°가 같다", () => {
    expect(horizonCoverDeg(40, seoul, 2)).toBe(horizonCoverDeg(40, seoul, 2));
    expect(horizonCoverDeg(0, seoul, 2)).toBeCloseTo(horizonCoverDeg(360, seoul, 2), 6);
  });

  it("장소가 다르면 산 모양이 달라 가리는 고도도 달라진다", () => {
    const other = horizonCoverDeg(20, { lat: -33.9, lon: 18.4 }, 2);
    expect(other).not.toBe(horizonCoverDeg(20, seoul, 2));
  });
});
