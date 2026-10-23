// Screen-space zoom visibility; independent of simulated orbital time.
export function smoothVisibility(size, start, end) {
  const t = Math.max(0, Math.min(1, (size-start)/(end-start)));
  return t*t*(3-2*t);
}
export function projectedDiameterFraction(radius, distance, fovDegrees) {
  return radius / (Math.max(distance, 1e-9)*Math.tan(fovDegrees*Math.PI/360));
}
export function easeOpacity(current, target, delta) {
  const next = current + (target-current)*(1-Math.exp(-Math.max(0, Math.min(delta,.1))/.12));
  return Math.abs(next-target)<.001 ? target : next;
}
