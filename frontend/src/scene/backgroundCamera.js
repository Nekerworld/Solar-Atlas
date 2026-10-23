// Distant sky depends on orientation, never the observer's world position.
// A separate origin camera avoids cancelling ~1e13 km translations around a
// unit-size skybox, where even double-precision matrix error becomes visible.
export function syncBackgroundCamera(background, observer) {
  background.position.set(0, 0, 0);
  background.quaternion.copy(observer.quaternion);
  background.projectionMatrix.copy(observer.projectionMatrix);
  background.projectionMatrixInverse.copy(observer.projectionMatrixInverse);
  background.updateMatrixWorld(true);
}
