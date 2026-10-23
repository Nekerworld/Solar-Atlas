// Logarithmic camera distance. Position 0 is close; 1 is far.
export function zoomPosition(distance, minimum, maximum) {
  if (!(minimum > 0 && maximum > minimum)) return 0;
  const value = Math.max(minimum, Math.min(maximum, distance));
  return Math.log(value / minimum) / Math.log(maximum / minimum);
}
export function zoomDistance(position, minimum, maximum) {
  if (!(minimum > 0 && maximum > minimum)) return minimum;
  const value = Math.max(0, Math.min(1, position));
  return minimum * Math.pow(maximum / minimum, value);
}
