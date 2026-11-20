import { describe, expect, it } from "vitest";
import { compassName, skyPhase, sunAltitudeDeg, visibilityWindows, VISIBILITY_RULES } from "../../src/utils/visibility";

const SEOUL = { latitude: 37.5665, longitude: 126.978 };
const FROM = new Date("2026-11-20T09:00:00Z");

describe("visibility", () => {
  it("태양 고도로 낮과 밤을 가른다", () => {
    expect(sunAltitudeDeg(new Date("2026-11-20T03:00:00Z"), SEOUL.latitude, SEOUL.longitude)).toBeGreaterThan(20);
    expect(sunAltitudeDeg(new Date("2026-11-20T16:00:00Z"), SEOUL.latitude, SEOUL.longitude)).toBeLessThan(-20);
    expect(skyPhase(10).key).toBe("day");
    expect(skyPhase(-3).key).toBe("civil");
    expect(skyPhase(-9).key).toBe("nautical");
    expect(skyPhase(-15).key).toBe("astronomical");
    expect(skyPhase(-30).key).toBe("night");
  });

  it("방위를 8방위 이름으로 바꾼다", () => {
    expect([0, 90, 180, 270, 359].map(compassName)).toEqual(["북", "동", "남", "서", "북"]);
  });

  it("보이는 구간은 시간순이고 고도·어둡기 조건을 지킨다", () => {
    for (const bodyId of Object.keys(VISIBILITY_RULES)) {
      const rule = VISIBILITY_RULES[bodyId];
      const windows = visibilityWindows({ bodyId, ...SEOUL, from: FROM, days: 7 });
      windows.forEach((window, index) => {
        expect(window.end.getTime()).toBeGreaterThan(window.start.getTime() - 1);
        expect(window.peakAltitude).toBeGreaterThanOrEqual(rule.minAltitude);
        expect(sunAltitudeDeg(window.peak, SEOUL.latitude, SEOUL.longitude)).toBeLessThanOrEqual(rule.maxSunAltitude);
        if (index) expect(window.start.getTime()).toBeGreaterThan(windows[index - 1].end.getTime() - 1);
      });
    }
  });

  it("달은 일주일 동안 매일 밤 보이는 구간이 생기지는 않아도 최소 한 번은 보인다", () => {
    const windows = visibilityWindows({ bodyId: "moon", ...SEOUL, from: FROM, days: 14 });
    expect(windows.length).toBeGreaterThan(3);
    expect(windows.some((window) => window.recommended)).toBe(true);
    expect(windows.every((window) => window.moonFraction === null)).toBe(true);
  });

  it("알 수 없는 천체나 좌표는 빈 목록이다", () => {
    expect(visibilityWindows({ bodyId: "sun", ...SEOUL })).toEqual([]);
    expect(visibilityWindows({ bodyId: "jupiter", latitude: NaN, longitude: 0 })).toEqual([]);
  });
});
