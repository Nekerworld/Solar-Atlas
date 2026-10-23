import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

test("star background stays still when tracking at maximum Actual Scale distance", async ({ page }) => {
  await page.route("http://sky.test/**", async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/") return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Sky regression</title>" });
    const files = {
      "/three.js": "node_modules/three/build/three.module.js",
      "/backgroundCamera.js": "src/scene/backgroundCamera.js",
    };
    if (!files[pathname]) return route.fulfill({ status: 404 });
    return route.fulfill({ contentType: "text/javascript", body: await readFile(path.resolve(files[pathname])) });
  });
  await page.goto("http://sky.test/");
  const result = await page.evaluate(async () => {
    const THREE = await import("/three.js");
    const { syncBackgroundCamera } = await import("/backgroundCamera.js");
    const renderer = new THREE.WebGLRenderer({ logarithmicDepthBuffer: true, preserveDrawingBuffer: true });
    renderer.setSize(256, 256);
    const size = 128, data = new Uint8Array(size * size * 4);
    for (let i = 0; i < data.length; i += 4) {
      const star = ((i / 4 * 1103515245 + 12345) >>> 0) % 127 < 8 ? 255 : 0;
      data.set([star, star, star, 255], i);
    }
    const faces = Array.from({ length: 6 }, () => new THREE.DataTexture(data, size, size));
    const texture = new THREE.CubeTexture(faces);
    texture.needsUpdate = true;
    const scene = new THREE.Scene();
    scene.background = texture;
    const observer = new THREE.PerspectiveCamera(50, 1, 50, 9e13);
    const sky = new THREE.PerspectiveCamera();
    const gl = renderer.getContext();
    const snapshot = camera => {
      renderer.render(scene, camera);
      const pixels = new Uint8Array(256 * 256 * 4);
      gl.readPixels(0, 0, 256, 256, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels;
    };
    const frames = (fixed) => Array.from({ length: 8 }, (_, i) => {
      observer.position.set(3e13 + i * 20, 1e13, 3e13);
      observer.lookAt(new THREE.Vector3(i * 20, 0, 0));
      observer.updateMatrixWorld(true);
      syncBackgroundCamera(sky, observer);
      return snapshot(fixed ? sky : observer);
    });
    const variation = frames => frames.slice(1).reduce((total, frame) => total + frame.reduce((n, value, i) => n + (value !== frames[0][i] ? 1 : 0), 0), 0);
    const old = frames(false), fixed = frames(true);
    const output = { oldVariation: variation(old), fixedVariation: variation(fixed), visible: fixed[0].some(value => value > 0) };
    texture.dispose();
    faces.forEach(face => face.dispose());
    renderer.dispose();
    return output;
  });
  expect(result.visible).toBe(true);
  expect(result.oldVariation).toBeGreaterThan(0);
  expect(result.fixedVariation).toBe(0);
});
