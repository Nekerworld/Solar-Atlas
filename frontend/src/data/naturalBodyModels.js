// Scientific and reference shape models; per-asset licenses and surface classifications:
// root README.md#document-13
export const NATURAL_MODEL_NAMES = Object.freeze(["Haumea", "Phobos", "Deimos", "ChuryumovGerasimenko", "Pan", "Atlas", "Hyperion", "Daphnis", "Prometheus", "Pandora", "Epimetheus", "Janus", "Amalthea", "Thebe", "Proteus", "Larissa", "Halley", "Nix", "Vesta", "Bennu", "Eros", "Arrokoth", "Psyche", "Kleopatra", "Itokawa", "Pallas", "Hygiea", "Sylvia", "Davida", "Ryugu", "Apophis"]);
const names = new Set(NATURAL_MODEL_NAMES);
const embeddedModels = new Set(["Vesta", "Bennu", "Eros", "Arrokoth"]);
export function applyNaturalBodyModels(body) {
  if (names.has(body.name)) {
    body.modelSrc = `/assets/models/natural/${body.name}/scene.${embeddedModels.has(body.name) ? "glb" : "gltf"}`;
    body.modelKind = "natural";
    // Textured models retain their own UVs; shape-only models use a neutral material.
    // Do not load the old
    // spherical wiki map, whose UV layout and provenance can differ.
    delete body.textureSrc;
  }
  body.satellites.forEach(applyNaturalBodyModels);
}
