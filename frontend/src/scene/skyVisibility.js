// 지상 천구의 천체 표시 토글(태양계 화면의 분류·개별 표시 규칙과 같다).
//
// - categories[분류] === false 이면 그 분류 전체를 숨긴다.
// - bodies[id] === false 이면 그 천체 하나를 숨긴다(분류가 열려 있어도).
// - 분류를 다시 켜면 그 분류의 모든 천체가 보인다. 천체 하나만 켜면 분류는 열리되 다른 숨김 천체는 계속 숨긴다.
// 별(밝은 별)과 태양·달은 토글 대상이 아니라 항상 보인다. 처음에는 태양·달·행성·별·별자리만 보이고,
// 위성·왜소행성·소행성·혜성·탐사선은 숨긴다. 이 상태는 천구(iframe)로 그대로 전달된다.

import { reactive, watch } from "vue";
import { SKY_CATEGORIES, SKY_OBJECTS } from "../data/skyCatalog";
import { setAtlasVisibility } from "./atlasSky";
import { skyBodyState } from "./skyBodies";

// 토글할 수 없는 분류(별, 태양, 달)
const FIXED_CATEGORIES = new Set(SKY_CATEGORIES.filter((category) => category.direct || category.key === "bright").map((category) => category.key));

// 처음 화면에서 빼 두는 분류. 탐색에는 남고, 눈 아이콘이나 분류 스위치로 켤 수 있다.
const HIDDEN_AT_START = ["satellite", "dwarf", "asteroid", "comet", "craft"];

function startingVisibility() {
  return {
    categories: Object.fromEntries(HIDDEN_AT_START.map((key) => [key, false])),
    bodies: {},
  };
}

export const skyVisibility = reactive(startingVisibility());

/** 토글 대상 분류인가. */
export const isToggleable = (categoryKey) => !FIXED_CATEGORIES.has(categoryKey);

/**
 * @param {{id: string, category: string}} object
 * @param {{categories: object, bodies: object}} [state]
 */
export function isSkyObjectVisible(object, state = skyVisibility) {
  return state.categories[object.category] !== false && state.bodies[object.id] !== false;
}

/**
 * 고른 천체들을 보이게 한다. 열리는 분류의 나머지 숨김 천체는 개별 숨김으로 남긴다.
 *
 * @param {object[]} wanted 보이게 할 천체
 * @param {object[]} all 전체 천체 목록
 * @param {{categories: object, bodies: object}} [state]
 */
export function revealSkyObjects(wanted, all, state = skyVisibility) {
  const ids = new Set(wanted.map((object) => object.id));
  const before = { ...state.categories };
  const individual = { ...state.bodies };
  for (const object of all) {
    if (ids.has(object.id)) individual[object.id] = true;
    else if (before[object.category] === false && wanted.some((entry) => entry.category === object.category)) {
      individual[object.id] = false;
    }
  }
  // 분류를 열기 전에 개별 숨김부터 적어 둔다(중간에 전부 보이는 상태가 천구에 가지 않도록).
  state.bodies = individual;
  for (const object of wanted) {
    if (isToggleable(object.category)) state.categories[object.category] = true;
  }
}

/** 천체 하나를 보이거나 숨긴다. */
export function toggleSkyObject(object, all, state = skyVisibility) {
  if (!isToggleable(object.category)) return;
  if (isSkyObjectVisible(object, state)) state.bodies[object.id] = false;
  else revealSkyObjects([object], all, state);
}

/** 분류 전체를 보이거나 숨긴다. 켜면 그 분류의 모든 천체가 보인다. */
export function setSkyCategory(key, visible, all, state = skyVisibility) {
  if (!isToggleable(key)) return;
  if (visible) {
    const members = all.filter((object) => object.category === key);
    revealSkyObjects(members, all, state);
    for (const object of members) state.bodies[object.id] = true;
  } else {
    state.categories[key] = false;
  }
}

/** 천구로 보낼 숨김 목록(분류 키와 개별 천체 id). */
export function hiddenSkyList(state = skyVisibility) {
  return {
    categories: Object.keys(state.categories).filter((key) => state.categories[key] === false),
    ids: Object.keys(state.bodies).filter((id) => state.bodies[id] === false),
  };
}

/** 처음 표시(태양·달·행성·별·별자리만)로 되돌린다. */
export function resetSkyVisibility() {
  const next = startingVisibility();
  skyVisibility.categories = next.categories;
  skyVisibility.bodies = next.bodies;
}

/** 천구에서 고른(클릭한) 천체 id가 지금 숨겨져 있는가. */
export function isSkyIdHidden(id) {
  const object = [...SKY_OBJECTS, ...skyBodyState.objects].find((entry) => entry.id.toLowerCase() === String(id).toLowerCase());
  return object ? !isSkyObjectVisible(object) : false;
}

watch(() => hiddenSkyList(), (hidden) => setAtlasVisibility(hidden), { deep: true, immediate: true });
