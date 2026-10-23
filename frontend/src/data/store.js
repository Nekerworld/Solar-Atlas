import { reactive, watch } from "vue";
import { clampSpeed } from "../utils/simulationControls";
import {
  realSolarSystemData,
  toonSolarSystemData,
} from "./astronomicalBodyData";
import { DEFAULT_CATEGORY_VISIBILITY, createDefaultBodyVisibility, flattenBodies, isBodyVisible } from "./bodyCatalog";

const DEFAULT_USER_SETTINGS = {
  categoryVisibility: DEFAULT_CATEGORY_VISIBILITY,
  bodyVisibility: createDefaultBodyVisibility(realSolarSystemData),
  showLabels: true,
  showOrbitPaths: true,
  showDebugInfo: false,
  actualScale: false,
  timeSpeedModifier: 0.25,
  focusedBody: "Mars",
};
function load(key) {
  let value;
  try { value = JSON.parse(localStorage.getItem(key) || "null"); } catch { value = null; }
  if (key === "bodyVisibility") {
    const names=new Set(flattenBodies(realSolarSystemData).map(body=>body.name));
    return value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter(([name, visible]) => name !== "Sun" && names.has(name) && typeof visible === "boolean")) : {...DEFAULT_USER_SETTINGS.bodyVisibility};
  }
  if (key === "categoryVisibility") {
    return Object.fromEntries(Object.entries(DEFAULT_CATEGORY_VISIBILITY).map(([category, fallback]) =>
      [category, typeof value?.[category] === "boolean" ? value[category] : fallback]));
  }
  if (key === "timeSpeedModifier") return clampSpeed(value ?? DEFAULT_USER_SETTINGS[key]);
  return value ?? DEFAULT_USER_SETTINGS[key];
}
export const store = reactive({
  appSettings: {
    timeStepModifier: 0,
    timeStep: 0,
    focusingBody: false,
    cameraDistance: 1,
    zoomMinDistance: 1,
    zoomMaxDistance: 15000000,
    zoomRequest: null,
  },
  userSettings: {
    categoryVisibility: load("categoryVisibility"),
    bodyVisibility: load("bodyVisibility"),
    showLabels: load("showLabels"),
    showOrbitPaths: load("showOrbitPaths"),
    showDebugInfo: load("showDebugInfo"),
    actualScale: load("actualScale"),
    timeSpeedModifier: load("timeSpeedModifier"),
    focusedBody: load("focusedBody"),
  },
});
// Three objects and static body data stay outside Vue's deep reactive proxy.
export const solarSystemData = {
  real: realSolarSystemData,
  toon: toonSolarSystemData,
};
for (const key of Object.keys(DEFAULT_USER_SETTINGS)) {
  watch(
    () => store.userSettings[key],
    (value) => {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage unavailable: keep the current in-memory view usable. */ }
    },
    { flush: "sync", deep: ["categoryVisibility", "bodyVisibility"].includes(key), immediate: ["categoryVisibility", "bodyVisibility"].includes(key) },
  );
}
let resumeSpeed = store.userSettings.timeSpeedModifier || DEFAULT_USER_SETTINGS.timeSpeedModifier;
watch(() => store.userSettings.timeSpeedModifier, value => {
  if (value > 0) resumeSpeed = value;
}, { flush: "sync" });
export function setSimulationSpeed(value) {
  store.userSettings.timeSpeedModifier = clampSpeed(value);
}
export function toggleSimulationPause() {
  setSimulationSpeed(store.userSettings.timeSpeedModifier > 0 ? 0 : resumeSpeed);
}
export function updateUserSetting(key, value) {
  store.userSettings[key] = value;
}
export function focusBody(name) {
  const body = flattenBodies(solarSystemData.real).find((entry) => entry.name === name);
  if (!body || !isBodyVisible(body, store.userSettings.categoryVisibility, store.userSettings.bodyVisibility)) return;
  store.userSettings.focusedBody = name;
  store.appSettings.focusingBody = true;
}
function revealBodies(names) {
  const bodies=flattenBodies(solarSystemData.real);
  const wanted=new Set(names);
  const settings=store.userSettings;
  const categories={...settings.categoryVisibility};
  for (const body of bodies.filter(entry=>wanted.has(entry.name))) {
    for (const category of [body.category, ...(body.ancestorCategories || [])]) {
      if (category in categories) categories[category]=true;
    }
  }
  // Opening a category/ancestor must not reveal unrelated hidden bodies.
  // Record those overrides BEFORE opening the category so sync watchers and
  // the scene never observe an intermediate all-visible state.
  const individual={...settings.bodyVisibility};
  for (const body of bodies) {
    if (wanted.has(body.name)) individual[body.name]=true;
    else if (!isBodyVisible(body,settings.categoryVisibility,settings.bodyVisibility)
      && isBodyVisible(body,categories,settings.bodyVisibility)) individual[body.name]=false;
  }
  settings.bodyVisibility=individual;
  settings.categoryVisibility=categories;
}
export function revealBody(name) {
  if (flattenBodies(solarSystemData.real).some(body=>body.name===name)) revealBodies([name]);
}
export function setCategoryVisibility(category,visible) {
  if (!(category in store.userSettings.categoryVisibility)) return;
  if (visible) revealBodies(flattenBodies(solarSystemData.real).filter(body=>body.category===category).map(body=>body.name));
  else store.userSettings.categoryVisibility[category]=false;
}
export function toggleBodyVisibility(name) {
  if (name === "Sun") return;
  const body=flattenBodies(solarSystemData.real).find(entry=>entry.name===name);
  if (!body) return;
  if (isBodyVisible(body,store.userSettings.categoryVisibility,store.userSettings.bodyVisibility)) store.userSettings.bodyVisibility[name]=false;
  else revealBody(name);
}
function ensureVisibleFocus() {
  const body = flattenBodies(solarSystemData.real).find((entry) => entry.name === store.userSettings.focusedBody);
  if (!body || !isBodyVisible(body, store.userSettings.categoryVisibility, store.userSettings.bodyVisibility)) {
    const fallback=flattenBodies(solarSystemData.real).find(entry=>isBodyVisible(entry,store.userSettings.categoryVisibility,store.userSettings.bodyVisibility));
    if (fallback) focusBody(fallback.name);
  }
}
watch(() => [store.userSettings.categoryVisibility, store.userSettings.bodyVisibility], ensureVisibleFocus, { deep: true, flush: "sync" });
ensureVisibleFocus();
export function resetUserSettings() {
  store.appSettings.focusingBody = true;
  store.userSettings = { ...DEFAULT_USER_SETTINGS, categoryVisibility: { ...DEFAULT_CATEGORY_VISIBILITY }, bodyVisibility: {...DEFAULT_USER_SETTINGS.bodyVisibility} };
}
export default store;
