// Display bands describe the existing slider, not physical time multipliers.
export function clampSpeed(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.25;
}
export function speedLabel(value) {
  const speed = clampSpeed(value);
  if (speed === 0) return "⏸";
  if (speed <= 0.2) return "x1";
  if (speed <= 0.4) return "x2";
  if (speed <= 0.6) return "x3";
  if (speed <= 0.8) return "x4";
  return "x5";
}
export function adjustSpeed(value, direction) {
  return clampSpeed(Math.round((clampSpeed(value) + direction * 0.05) * 1000) / 1000);
}
export function acceptsPauseShortcut(event) {
  if ((event.code !== "Space" && event.key !== " ") || event.repeat || event.defaultPrevented
      || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return false;
  const path = event.composedPath?.() || [event.target];
  return !path.some(element => element?.isContentEditable || element?.closest?.(
    'input,textarea,select,button,a[href],summary,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="slider"],[role="switch"],[role="textbox"],[role="combobox"],[role="menuitem"],[inert]'));
}
