// Modeling-only, rounded reference approximations. No crawler/RAG registration.
// These fixed visualization elements are not current-date ephemerides.
const AU = 149597870.7;
const dwarfBodies = [
  { name: "Ceres", label: "세레스", color: 0x9e9588, radius: 473, displayRadius: 5000,
    a: 2.77, displayA: 825000, e: 0.076, i: 10.59, node: 80.3, peri: 73.6, period: 1680, spin: 9.07,
    texture: "4k_ceres_fictional.jpg" },
  { name: "Eris", label: "에리스", color: 0xd6d2c7, radius: 1163, displayRadius: 6200,
    a: 67.8, displayA: 3250000, e: 0.44, i: 44.04, node: 35.95, peri: 151.6, period: 203800, spin: 25.9,
    texture: "4k_eris_fictional.jpg" },
  { name: "Haumea", label: "하우메아", color: 0xc5beb1, radius: 780, displayRadius: 5500,
    a: 43.13, displayA: 2250000, e: 0.19, i: 28.22, node: 121.8, peri: 240.7, period: 103500, spin: 3.92,
    texture: "4k_haumea_fictional.jpg" },
  { name: "Makemake", label: "마케마케", color: 0xc4a083, radius: 715, displayRadius: 5200,
    a: 45.79, displayA: 2500000, e: 0.16, i: 28.96, node: 79.6, peri: 294.8, period: 113000, spin: 22.8,
    texture: "4k_makemake_fictional.jpg" },
];

export function appendExtendedBodies(sun, actualScale) {
  for (const body of dwarfBodies) {
    sun.satellites.push({
      name: body.name, displayName: body.label, category: "dwarf",
      color: body.color, albedo: 0.15,
      radius: actualScale ? body.radius : body.displayRadius,
      rotationPeriod: body.spin, axialTilt: 0,
      textureSrc: "/assets/" + body.texture,
      orbit: { color: body.color, radius: actualScale ? body.a * AU : body.displayA,
        rotationPeriod: body.period, eccentricity: body.e, inclination: body.i,
        ascendingNode: body.node, argumentOfPeriapsis: body.peri, keplerian: true },
      satellites: [],
    });
  }
  sun.satellites.push({
    name: "AsteroidBelt", displayName: "소행성대", category: "region", kind: "asteroid_belt",
    aliases: ["asteroid belt", "main belt", "주 소행성대"],
    color: 0x9e9588, albedo: 0.1, radius: 1, rotationPeriod: 0, axialTilt: 0,
    innerRadius: actualScale ? 2.1 * AU : 1300000,
    outerRadius: actualScale ? 3.3 * AU : 2100000,
    particleScale: actualScale ? 0.002 : 1,
    orbit: { color: 0x9e9588, radius: 0, rotationPeriod: 0, inclination: 0 },
    satellites: [],
  });
}
