import { describe, expect, it } from "vitest";
import { directionName, locateSkyObject, SKY_OBJECTS, searchSkyObjects } from "../../src/data/skyCatalog";
import { clampSpeedStep, SKY_SPEEDS } from "../../src/utils/skySpeed";
import { sunAltitudeDeg } from "../../src/utils/visibility";

const site = { date: new Date("2026-11-20T03:00:00Z"), latitude: 35.18, longitude: 129.08 };

describe("천구 탐색 목록", () => {
  it("모든 항목이 유한한 방위·고도를 돌려준다", () => {
    for (const object of SKY_OBJECTS) {
      const at = locateSkyObject(object, site);
      expect(Number.isFinite(at.azimuth), object.id).toBe(true);
      expect(at.azimuth).toBeGreaterThanOrEqual(0);
      expect(at.azimuth).toBeLessThan(360);
      expect(at.altitude).toBeGreaterThanOrEqual(-90);
      expect(at.altitude).toBeLessThanOrEqual(90);
    }
  });
  it("태양 고도가 플래너의 계산과 같다", () => {
    const sun = SKY_OBJECTS.find((object) => object.id === "sun");
    expect(locateSkyObject(sun, site).altitude).toBeCloseTo(sunAltitudeDeg(site.date, site.latitude, site.longitude), 3);
  });
  it("북극성의 고도는 위도와 비슷하다", () => {
    const polaris = SKY_OBJECTS.find((object) => object.id === "star:Polaris");
    expect(Math.abs(locateSkyObject(polaris, site).altitude - site.latitude)).toBeLessThan(2);
  });
  it("한국어·영어·별칭으로 검색한다", () => {
    expect(searchSkyObjects("목성").map((o) => o.id)).toContain("jupiter");
    expect(searchSkyObjects("vega").map((o) => o.id)).toContain("star:Vega");
    expect(searchSkyObjects("북두칠성").length).toBeGreaterThan(1);
    expect(searchSkyObjects("  ")).toEqual([]);
  });
  it("방위 이름과 속도 단계 범위", () => {
    expect(directionName(0)).toBe("북");
    expect(directionName(181)).toBe("남");
    expect(SKY_SPEEDS[0].factor).toBe(0);
    expect(clampSpeedStep(99)).toBe(SKY_SPEEDS.length - 1);
    expect(clampSpeedStep(-1)).toBe(0);
    expect(clampSpeedStep(1.5)).toBe(0);
  });
});
