export const BODY_CATEGORIES = [
  { key: "planet", label: "행성", toggle: false },
  { key: "moon", label: "위성", toggle: true },
  { key: "comet", label: "혜성", toggle: true },

  { key: "artifact", label: "인공물", toggle: true },
  { key: "dwarf", label: "왜소행성", toggle: true },
  { key: "region", label: "영역", toggle: true },
];
export const DEFAULT_CATEGORY_VISIBILITY = Object.fromEntries(
  BODY_CATEGORIES.filter((category) => category.toggle).map(({ key }) => [key, ["moon", "dwarf", "region"].includes(key)]),
);
// Editorial navigation emphasis, not an official astronomical classification.
// Relative size and prominence within each parent system; identical in both scales.
export const MAJOR_MOON_NAMES = Object.freeze([
  "Moon", "Phobos", "Deimos",
  "Io", "Europa", "Ganymede", "Callisto",
  "Mimas", "Enceladus", "Tethys", "Dione", "Rhea", "Titan", "Iapetus",
  "Miranda", "Ariel", "Umbriel", "Titania", "Oberon",
  "Triton", "Charon",
]);
const majorMoons = new Set(MAJOR_MOON_NAMES);
export function bodyLabelDescription(body) {
  const name=body.displayName || body.name;
  const identity=body.isMajorMoon ? `${name} · ${body.parentDisplayName || body.parentName}의 주요 위성` : name;
  return body.referenceNote ? `${identity}\n${body.referenceNote}` : identity;
}
const labels = {
  Sun: "태양", Mercury: "수성", Venus: "금성", Earth: "지구", Mars: "화성",
  Jupiter: "목성", Saturn: "토성", Uranus: "천왕성", Neptune: "해왕성",
  Pluto: "명왕성", Moon: "달", Phobos: "포보스", Deimos: "데이모스", Halley: "핼리혜성",
};
export function decorateBodyCatalog(body, parent = null) {
  body.category ??= !parent ? "star" : body.name === "Pluto" ? "dwarf" : parent.isLight ? "planet" : "moon";
  body.displayName ??= labels[body.name] || body.name;
  if (parent) {
    body.parentName ??= parent.name;
    body.parentDisplayName ??= parent.displayName;
  }
  body.isMajorMoon = body.category === "moon" && majorMoons.has(body.name);
  body.ancestorCategories = parent ? [...(parent.ancestorCategories || []), parent.category] : [];
  body.satellites.forEach((child) => decorateBodyCatalog(child, body));
}
export function flattenBodies(body) {
  return [body, ...body.satellites.flatMap(flattenBodies)];
}
// First visit: Sun, planets, moons except Haumea's pair, Pluto, and the three regions.
// Other bodies remain available in the picker and can be enabled individually.
export function createDefaultBodyVisibility(root) {
  return Object.fromEntries(flattenBodies(root).filter(body=>body.name!=="Sun").map(body=>[
    body.name, body.category==="planet" || body.name==="Pluto"
      || ["AsteroidBelt","KuiperBelt","OortCloud"].includes(body.name)
      || (body.category==="moon" && !["Hiiaka","Namaka"].includes(body.name)),
  ]));
}
export function isBodyVisible(body, visibility, individual = {}) {
  // Sun stays visible even if an older saved individual override hides it.
  if (body.name === "Sun") return true;
  // Other bodies combine category settings and individual visibility.
  return individual?.[body.name] !== false && [body.category, ...(body.ancestorCategories || [])].every(category =>
    !(category in DEFAULT_CATEGORY_VISIBILITY) || visibility?.[category] !== false);
}
