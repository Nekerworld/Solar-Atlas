// Fixed reference elements for shape/orientation, NOT current-date ephemerides.
// Planets: JPL J2000 coefficients, table 1 (Earth uses Earth/Moon barycenter).
// https://ssd.jpl.nasa.gov/planets/approx_pos.html
// Pluto: NASA J2000 mean elements.
// https://nssdc.gsfc.nasa.gov/planetary/factsheet/plutofact.html
// Satellites: JPL mean elements, J2000; Phobos/Deimos use their Laplace planes.
// https://ssd.jpl.nasa.gov/sats/elem/
// Columns: eccentricity, inclination(deg), ascending node(deg), argument of periapsis(deg).
const rows = {
  Mercury: [0.20563593, 7.00497902, 48.33076593, 77.45779628 - 48.33076593],
  Venus: [0.00677672, 3.39467605, 76.67984255, 131.60246718 - 76.67984255],
  Earth: [0.01671123, -0.00001531, 0, 102.93768193],
  Mars: [0.09339410, 1.84969142, 49.55953891, -23.94362959 - 49.55953891],
  Jupiter: [0.04838624, 1.30439695, 100.47390909, 14.72847983 - 100.47390909],
  Saturn: [0.05386179, 2.48599187, 113.66242448, 92.59887831 - 113.66242448],
  Uranus: [0.04725744, 0.77263783, 74.01692503, 170.95427630 - 74.01692503],
  Neptune: [0.00859048, 1.77004347, 131.78422574, 44.96476227 - 131.78422574],
  Pluto: [0.24880766, 17.14175, 110.30347, 224.06676 - 110.30347],
  Moon: [0.0554, 5.16, 125.08, 318.15],
  Phobos: [0.015, 1.1, 169.2, 216.3],
  Deimos: [0.000, 1.8, 54.3, 0],
};
const poles = { Phobos: [317.7, 52.9], Deimos: [316.6, 53.5] };

// Reference planes are physical data, not a display-scale option. In Actual
// scale these three legacy moons previously skipped all reference transforms.
export function configureSatelliteReferenceFrames(sun) {
  function visit(body) {
    if (["Moon", "Phobos", "Deimos"].includes(body.name)) {
      const [eccentricity, inclination, ascendingNode, argumentOfPeriapsis] = rows[body.name];
      Object.assign(body.orbit, { eccentricity, inclination, ascendingNode,
        argumentOfPeriapsis, referencePole:poles[body.name], keplerian:true });
    }
    body.satellites.forEach(visit);
  }
  visit(sun);
}

// Mutate only the illustrative dataset, before its usual degree normalization.
export function configureExplorationOrbits(sun) {
  const jupiterRadius = sun.satellites.find((body) => body.name === "Jupiter").orbit.radius;
  const neptuneRadius = sun.satellites.find((body) => body.name === "Neptune").orbit.radius;
  function visit(body, parent) {
    const row = rows[body.name];
    if (row) {
      const [eccentricity, inclination, ascendingNode, argumentOfPeriapsis] = row;
      Object.assign(body.orbit, {
        eccentricity, inclination, ascendingNode, argumentOfPeriapsis,
        referencePole: poles[body.name], keplerian: true,
      });
    }
    // Double heliocentric distances and their gaps; satellite distances stay local.
    if (parent === sun) {
      body.orbit.radius *= 2;
      // Reserve a broad main-belt corridor beyond Mars; move the outer system
      // together before expanding the gaps between the four giant planets.
      if (["Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "Eris", "Haumea", "Makemake"].includes(body.name)) {
        body.orbit.radius += 1200000;
        // Jupiter stays anchored. Triple the existing giant-planet gaps;
        // translate more distant dwarf planets by Neptune's displacement so
        // they retain their spacing beyond it. Satellite orbits stay local.
        const originalRadius = (body.orbit.radius - 1200000) / 2;
        body.orbit.radius += 4 * Math.max(0, Math.min(originalRadius, neptuneRadius) - jupiterRadius);
      }
    }
    body.satellites.forEach((child) => visit(child, body));
  }
  visit(sun, null);
}
