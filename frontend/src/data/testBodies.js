// Visualization fixture with physical orbital scale for the tail effect. Not a live ephemeris.
// JPL sample 1P/Halley, epoch MJD 49400, solution J863/77:
// https://ssd.jpl.nasa.gov/sb/elem_tables.html
const e = 0.96714291;
const aAU = 0.58597811 / (1 - e);
export function appendTestBodies(sun, actualScale) {
  sun.satellites.push({
    name: "Halley", displayName: "핼리혜성", category: "comet",
    aliases: ["할리", "1P", "Halley's comet"],
    color: 0xb8c5cc, albedo: 0.03,
    radius: actualScale ? 5.5 : 6000,
    physicalSemiMajorAxisAU: aAU,
    rotationPeriod: 52.8, axialTilt: 0,
    orbit: {
      color: 0x8edce8,
      // Exploration is distance-compressed, and later receives its usual x2 spacing.
      radius: actualScale ? aAU * 149597870.7 : 1800000,
      rotationPeriod: 76.1 * 365.25,
      eccentricity: e, inclination: 162.26269,
      argumentOfPeriapsis: 111.33249, ascendingNode: 58.42008,
      keplerian: true,
    },
    satellites: [],
  });
}
