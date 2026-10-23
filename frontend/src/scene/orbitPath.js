import {
  BufferGeometry,
  Float32BufferAttribute,
  Line,
  Sphere,
  LineBasicMaterial,
  Uint8BufferAttribute,
  Vector3,
} from "three";
import { openOrbitPoint, orbitPoint } from "./orbitalMotion";

export function createOrbitPath(color, radius) {
  const positions = [];
  const colors = [];
  const r = (color >>> 16) & 0xff;
  const g = (color >>> 8) & 0xff;
  const b = color & 0xff;
  for (let i = 0; i <= 200; i++) {
    const fraction = i / 200;
    const step = fraction * Math.PI * 2;
    positions.push(radius * Math.cos(step), 0, radius * Math.sin(step));
    colors.push(r, g, b, (1 - fraction) * 255);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Uint8BufferAttribute(colors, 4, true));
  return new Line(
    geometry,
    new LineBasicMaterial({ vertexColors: true, transparent: true }),
  );
}

// Reorder samples along the same fixed ellipse: bright head at the body,
// increasingly transparent behind it. Never rotate the ellipse itself.
export function createKeplerOrbitPath(elements, eccentricAnomaly = 0) {
  const segments = 720;
  const positions = new Float32Array((segments + 1) * 3);
  const colors = [];
  const samples = new Float64Array((segments + 1) * 2);
  const r = (elements.color >>> 16) & 0xff;
  const g = (elements.color >>> 8) & 0xff;
  const b = elements.color & 0xff;
  // Cache the ellipse basis and sampling angles, avoiding per-frame allocations.
  const periapsis = orbitPoint(elements, 0, new Vector3());
  const apoapsis = orbitPoint(elements, Math.PI, new Vector3());
  const center = periapsis.clone().add(apoapsis).multiplyScalar(0.5);
  const cosineAxis = periapsis.clone().sub(center);
  const sineAxis = orbitPoint(elements, Math.PI / 2, new Vector3()).sub(center);
  for (let index = 0; index <= segments; index++) {
    const fraction = index / segments;
    samples[index * 2] = Math.cos(fraction * Math.PI * 2);
    samples[index * 2 + 1] = Math.sin(fraction * Math.PI * 2);
    colors.push(r, g, b, Math.round((1 - fraction) * 255));
  }
  const geometry = new BufferGeometry();
  const attribute = new Float32BufferAttribute(positions, 3);
  geometry.setAttribute("position", attribute);
  geometry.setAttribute("color", new Uint8BufferAttribute(colors, 4, true));
  // Full-ellipse bounds remain valid for every moving sample phase.
  geometry.boundingSphere = new Sphere(center.clone(), Math.max(cosineAxis.length(), sineAxis.length()) * 1.001);
  const line = new Line(geometry, new LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
  }));
  line.userData.updateTrail = (head) => {
    const ch = Math.cos(head), sh = Math.sin(head);
    const values = attribute.array;
    for (let index = 0; index <= segments; index++) {
      const c = samples[index * 2], s = samples[index * 2 + 1];
      const ce = ch * c + sh * s;
      const se = sh * c - ch * s;
      const offset = index * 3;
      values[offset] = center.x + cosineAxis.x * ce + sineAxis.x * se;
      values[offset + 1] = center.y + cosineAxis.y * ce + sineAxis.y * se;
      values[offset + 2] = center.z + cosineAxis.z * ce + sineAxis.z * se;
    }
    attribute.needsUpdate = true;
  };
  line.userData.updateTrail(eccentricAnomaly);
  return line;
}


// An open conic has no artificial closing segment. The trail ends at its body.
export function createOpenOrbitPath(elements, progress) {
  const count = 320;
  const geometry = new BufferGeometry();
  const positions = new Float32BufferAttribute(new Float32Array((count+1)*3),3);
  const colors = [];
  for (let index=0; index<=count; index++) {
    colors.push((elements.color>>>16)&255,(elements.color>>>8)&255,elements.color&255,
      Math.round((1-index/count)*255));
  }
  geometry.setAttribute('position',positions);
  geometry.setAttribute('color',new Uint8BufferAttribute(colors,4,true));
  const line = new Line(geometry,new LineBasicMaterial({vertexColors:true,transparent:true,depthWrite:false}));
  const point = new Vector3();
  geometry.boundingSphere = new Sphere(new Vector3(),elements.extent*1.01);
  line.userData.updateTrail = head => {
    for (let index=0; index<=count; index++) {
      openOrbitPoint(elements,head*(1-index/count),point);
      positions.setXYZ(index,point.x,point.y,point.z);
    }
    positions.needsUpdate=true;
  };
  line.userData.updateTrail(progress);
  return line;
}
