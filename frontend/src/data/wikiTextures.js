// Downloaded map overrides only. High-resolution existing maps keep their paths.
// Attribution and source classification: root README.md#document-16
export const wikiTextures = Object.freeze({
  "Metis": "/assets/planet-texture-maps/metis_2000.webp",
  "Adrastea": "/assets/planet-texture-maps/adrastea_2048.webp",
  "Amalthea": "/assets/planet-texture-maps/amalthea_2048.webp",
  "Thebe": "/assets/planet-texture-maps/thebe_2048.webp",
  "Io": "/assets/planet-texture-maps/io_2048.webp",
  "Europa": "/assets/planet-texture-maps/europa_2048.webp",
  "Ganymede": "/assets/planet-texture-maps/ganymede_2048.webp",
  "Callisto": "/assets/planet-texture-maps/callisto_2048.webp",
  "Pan": "/assets/planet-texture-maps/pan_1264.webp",
  "Hyperion": "/assets/planet-texture-maps/hyperion_2048.webp",
  "Daphnis": "/assets/planet-texture-maps/daphnis_1024.webp",
  "Atlas": "/assets/planet-texture-maps/atlas_1024.webp",
  "Prometheus": "/assets/planet-texture-maps/prometheus_1440.webp",
  "Pandora": "/assets/planet-texture-maps/pandora_1264.webp",
  "Epimetheus": "/assets/planet-texture-maps/epimetheus_2048.webp",
  "Janus": "/assets/planet-texture-maps/janus_2048.webp",
  "Mimas": "/assets/planet-texture-maps/mimas_1024.webp",
  "Enceladus": "/assets/planet-texture-maps/enceladus_2048.webp",
  "Tethys": "/assets/planet-texture-maps/tethys_1024.webp",
  "Dione": "/assets/planet-texture-maps/dione_1024.webp",
  "Rhea": "/assets/planet-texture-maps/rhea_720.webp",
  "Titan": "/assets/planet-texture-maps/titan_2000.webp",
  "Iapetus": "/assets/planet-texture-maps/iapetus_1024.webp",
  "Ariel": "/assets/planet-texture-maps/ariel_1024.webp",
  "Miranda": "/assets/planet-texture-maps/miranda_2048.webp",
  "Oberon": "/assets/planet-texture-maps/oberon_1024.webp",
  "Puck": "/assets/planet-texture-maps/puck_2048.webp",
  "Titania": "/assets/planet-texture-maps/titania_1024.webp",
  "Umbriel": "/assets/planet-texture-maps/umbriel_1024.webp",
  "Proteus": "/assets/planet-texture-maps/proteus_2048.webp",
  "Triton": "/assets/planet-texture-maps/triton_texture_map_14k.jpg",
  "Nereid": "/assets/planet-texture-maps/nereid_1024.webp",
  "Charon": "/assets/planet-texture-maps/charon_1024.webp",
  "Nix": "/assets/planet-texture-maps/nix_1264.webp",
  "Pluto": "/assets/planet-texture-maps/pluto_2048.webp",
  "Ceres": "/assets/planet-texture-maps/ceres_2048.webp",
  "Eris": "/assets/planet-texture-maps/eris_2048.webp",
  "Haumea": "/assets/planet-texture-maps/haumea_2048.webp",
  "Makemake": "/assets/planet-texture-maps/makemake_2048.webp",
  "Sedna": "/assets/planet-texture-maps/sedna_2048.webp",
  "Halley": "/assets/planet-texture-maps/halley_3674.webp",
  "Phobos": "/assets/planet-texture-maps/phobos_2048.webp",
  "Deimos": "/assets/planet-texture-maps/deimos_2048.webp"
});

export function applyWikiTextures(body) {
  const texture = wikiTextures[body.name];
  if (texture) body.textureSrc = texture;
  body.satellites.forEach(applyWikiTextures);
}
