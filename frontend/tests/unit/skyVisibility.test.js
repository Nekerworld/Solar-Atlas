import { describe, expect, it } from "vitest";
import {
  hiddenSkyList, isSkyObjectVisible, isToggleable, resetSkyVisibility, revealSkyObjects, setSkyCategory,
  skyVisibility, toggleSkyObject,
} from "../../src/scene/skyVisibility";

const planet = (id) => ({ id, category: "planet" });
const comet = (id) => ({ id, category: "comet" });
const all = [planet("mars"), planet("venus"), planet("pluto"), comet("halley"), comet("tempel"), { id: "star:Sirius", category: "bright" }];
const fresh = () => ({ categories: {}, bodies: {} });

describe("지상 천구 표시 토글", () => {
  it("별·태양·달은 토글 대상이 아니다", () => {
    expect(isToggleable("bright")).toBe(false);
    expect(isToggleable("star")).toBe(false);
    expect(isToggleable("moon")).toBe(false);
    expect(isToggleable("planet")).toBe(true);
    expect(isToggleable("constellation")).toBe(true);
  });

  it("처음에는 태양·달·행성·별·별자리만 보인다", () => {
    resetSkyVisibility();
    expect(isSkyObjectVisible(planet("mars"))).toBe(true);
    expect(isSkyObjectVisible({id: "star:Sirius", category: "bright"})).toBe(true);
    expect(isSkyObjectVisible({id: "con:Ori", category: "constellation"})).toBe(true);
    for (const category of ["satellite", "dwarf", "asteroid", "comet", "craft"]) {
      expect(isSkyObjectVisible({id: category, category})).toBe(false);
    }
    expect(hiddenSkyList(skyVisibility).categories.sort()).toEqual(["asteroid", "comet", "craft", "dwarf", "satellite"]);
  });

  it("처음에는 빈 상태가 모두 보임이고, 숨김 목록이 비어 있다", () => {
    const state = fresh();
    expect(all.every((object) => isSkyObjectVisible(object, state))).toBe(true);
    expect(hiddenSkyList(state)).toEqual({ categories: [], ids: [] });
  });

  it("천체 하나만 숨기고 다시 보이게 한다", () => {
    const state = fresh();
    toggleSkyObject(all[0], all, state);
    expect(isSkyObjectVisible(all[0], state)).toBe(false);
    expect(isSkyObjectVisible(all[1], state)).toBe(true);
    expect(hiddenSkyList(state).ids).toEqual(["mars"]);
    toggleSkyObject(all[0], all, state);
    expect(isSkyObjectVisible(all[0], state)).toBe(true);
  });

  it("분류를 끄면 그 분류 전체가 숨겨지고, 켜면 모두 보인다", () => {
    const state = fresh();
    toggleSkyObject(all[3], all, state); // 개별 숨김이 남아 있어도
    setSkyCategory("comet", false, all, state);
    expect(all.filter((object) => object.category === "comet").some((object) => isSkyObjectVisible(object, state))).toBe(false);
    expect(hiddenSkyList(state).categories).toEqual(["comet"]);
    setSkyCategory("comet", true, all, state);
    expect(all.filter((object) => object.category === "comet").every((object) => isSkyObjectVisible(object, state))).toBe(true);
  });

  it("꺼진 분류에서 천체 하나만 켜면 나머지는 계속 숨긴다", () => {
    const state = fresh();
    setSkyCategory("planet", false, all, state);
    toggleSkyObject(all[0], all, state);
    expect(isSkyObjectVisible(all[0], state)).toBe(true);
    expect(isSkyObjectVisible(all[1], state)).toBe(false);
    expect(isSkyObjectVisible(all[2], state)).toBe(false);
    expect(state.categories.planet).toBe(true);
  });

  it("숨긴 천체를 골라 이동하면 그 천체만 보이게 한다", () => {
    const state = fresh();
    setSkyCategory("comet", false, all, state);
    revealSkyObjects([all[3]], all, state);
    expect(isSkyObjectVisible(all[3], state)).toBe(true);
    expect(isSkyObjectVisible(all[4], state)).toBe(false);
  });

  it("별은 토글을 시도해도 항상 보인다", () => {
    const state = fresh();
    toggleSkyObject(all[5], all, state);
    setSkyCategory("bright", false, all, state);
    expect(isSkyObjectVisible(all[5], state)).toBe(true);
    expect(hiddenSkyList(state)).toEqual({ categories: [], ids: [] });
  });
});
