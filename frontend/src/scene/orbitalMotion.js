const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

// RA/Dec in Earth's J2000 equatorial frame -> the scene's ecliptic Y-up frame.
// Shared by planetary equators/rings and satellite reference-plane transforms.
export function poleDirection(referencePole, target) {
  const [raDeg, decDeg] = referencePole;
  const ra = raDeg * DEG, dec = decDeg * DEG, eps = 23.43928 * DEG;
  const x = Math.cos(dec) * Math.cos(ra);
  const y = Math.cos(dec) * Math.sin(ra), z = Math.sin(dec);
  return target.set(x, -y * Math.sin(eps) + z * Math.cos(eps),
    -(y * Math.cos(eps) + z * Math.sin(eps)));
}

export function solveEccentricAnomaly(meanAnomaly, eccentricity) {
  if (!Number.isFinite(eccentricity) || eccentricity < 0 || eccentricity >= 1) {
    throw new RangeError("Only bound elliptical orbits (0 <= e < 1) are supported.");
  }
  const m = ((meanAnomaly + Math.PI) % TAU + TAU) % TAU - Math.PI;
  let e = eccentricity < 0.8 ? m : Math.PI * Math.sign(m || 1);
  for (let n = 0; n < 32; n++) {
    const correction = (e - eccentricity * Math.sin(e) - m) / (1 - eccentricity * Math.cos(e));
    e -= correction;
    if (Math.abs(correction) < 1e-12) break;
  }
  return e;
}

// Both the line and the moving body use this focus-centered position function.
// Angles are radians; radius is the display semi-major axis, not surface radius.
export function orbitPoint(orbit, eccentricAnomaly, target) {
  if (orbit.pathType === "halo") {
    const c = Math.cos(eccentricAnomaly), s = Math.sin(eccentricAnomaly);
    return target.set(orbit.haloDistance + orbit.radius * .2 * c,
      orbit.radius * .6 * s, orbit.radius * c);
  }
  const a = orbit.radius;
  const e = orbit.eccentricity ?? 0;
  const x = a * (Math.cos(eccentricAnomaly) - e);
  const y = a * Math.sqrt(1 - e * e) * Math.sin(eccentricAnomaly);
  const w = orbit.argumentOfPeriapsis ?? 0;
  const node = orbit.ascendingNode ?? 0;
  const i = orbit.inclination ?? 0;
  const cw = Math.cos(w), sw = Math.sin(w);
  const cn = Math.cos(node), sn = Math.sin(node);
  const ci = Math.cos(i), si = Math.sin(i);
  let px = (cw * cn - sw * sn * ci) * x + (-sw * cn - cw * sn * ci) * y;
  let py = (cw * sn + sw * cn * ci) * x + (-sw * sn + cw * cn * ci) * y;
  let pz = sw * si * x + cw * si * y;
  if (orbit.referencePole) {
    // Laplace pole RA/Dec: equatorial -> ecliptic, then rotate the local plane.
    const [raDeg, decDeg] = orbit.referencePole;
    const ra = raDeg * DEG, dec = decDeg * DEG, eps = 23.43928 * DEG;
    const nx = Math.cos(dec) * Math.cos(ra);
    const eqY = Math.cos(dec) * Math.sin(ra), eqZ = Math.sin(dec);
    const ny = eqY * Math.cos(eps) + eqZ * Math.sin(eps);
    const nz = -eqY * Math.sin(eps) + eqZ * Math.cos(eps);
    const length = Math.hypot(nx, ny);
    const ux = length > 1e-12 ? -ny / length : 1;
    const uy = length > 1e-12 ? nx / length : 0;
    const vx = -nz * uy, vy = nz * ux, vz = nx * uy - ny * ux;
    const rx = ux * px + vx * py + nx * pz;
    const ry = uy * px + vy * py + ny * pz;
    pz = vz * py + nz * pz;
    px = rx; py = ry;
  }
  // Ecliptic XYZ -> Three's right-handed Y-up world (X, Z, -Y).
  return target.set(px, pz, -py);
}


// Finite conic segment with perihelion q=radius. This is schematic motion in
// true anomaly, not a mission ephemeris or a time-of-flight solution.
export function openOrbitPoint(orbit, progress, target) {
  const e = orbit.eccentricity;
  const q = orbit.radius;
  const edge = Math.acos(Math.max(-1, Math.min(1, (q*(1+e)/orbit.extent-1)/e)));
  const v = orbit.pathType === "escape" ? edge*progress : edge*(2*progress-1);
  const r = q*(1+e)/(1+e*Math.cos(v));
  const x = r*Math.cos(v), y = r*Math.sin(v);
  const w = orbit.argumentOfPeriapsis, n = orbit.ascendingNode, i = orbit.inclination;
  const cw=Math.cos(w),sw=Math.sin(w),cn=Math.cos(n),sn=Math.sin(n),ci=Math.cos(i),si=Math.sin(i);
  return target.set((cw*cn-sw*sn*ci)*x+(-sw*cn-cw*sn*ci)*y,
    sw*si*x+cw*si*y, -((cw*sn+sw*cn*ci)*x+(-sw*sn+cw*cn*ci)*y));
}
