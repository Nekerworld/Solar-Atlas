import {
  AdditiveBlending, BufferGeometry, Color, DataTexture, DoubleSide,
  DynamicDrawUsage, Float32BufferAttribute, Group, LinearFilter, Matrix4, Mesh,
  RGBAFormat, ShaderMaterial, Sprite, SpriteMaterial, Vector3,
} from "three";
import { orbitPoint, solveEccentricAnomaly } from "./orbitalMotion";
import { projectedDiameterFraction, smoothVisibility } from "./detailVisibility";

const AU = 149597870.7;
const SEGMENTS = 64;
// A tunable visual activity law, not a prediction of apparent magnitude.
// Physical heliocentric AU is used in BOTH real and compressed display modes.
export function cometActivity(distanceAU) {
  const irradiance = 1 / (1 + Math.pow(Math.max(.1, distanceAU), 2));
  return irradiance * (1-smoothVisibility(distanceAU, 3, 6));
}

const vertexShader = `
  varying vec2 tailUv;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    tailUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
  }
`;
const fragmentShader = `
  uniform vec3 tailColor;
  uniform float tailOpacity;
  uniform float tailTime;
  varying vec2 tailUv;
  #include <common>
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    float across = abs(tailUv.y * 2.0 - 1.0);
    float softEdge = exp(-4.5 * across * across) * (1.0-smoothstep(.72, 1.0, across));
    float along = pow(max(0.0, 1.0-tailUv.x), 1.6);
    float stream = .92 + .08*sin(tailUv.x*65.0-tailTime*1.3);
    float alpha = tailOpacity * softEdge * along * stream;
    gl_FragColor = vec4(tailColor, alpha);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;

function ribbon(color) {
  const geometry = new BufferGeometry();
  const positions = new Float32BufferAttribute(new Float32Array((SEGMENTS+1)*6),3);
  positions.setUsage(DynamicDrawUsage);
  const uv = [], indices = [];
  for (let index=0; index<=SEGMENTS; index++) {
    uv.push(index/SEGMENTS,0,index/SEGMENTS,1);
    if (index<SEGMENTS) {
      const a=index*2;
      indices.push(a,a+1,a+2,a+1,a+3,a+2);
    }
  }
  geometry.setAttribute("position",positions);
  geometry.setAttribute("uv",new Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);
  const mesh = new Mesh(geometry,new ShaderMaterial({
    uniforms:{tailColor:{value:new Color(color)},tailOpacity:{value:0},tailTime:{value:0}},
    vertexShader,fragmentShader,transparent:true,depthWrite:false,depthTest:true,
    side:DoubleSide,blending:AdditiveBlending,toneMapped:false,
  }));
  // Geometry changes shape and length; only five small effects need drawing.
  mesh.frustumCulled=false;
  return mesh;
}

function comaTexture() {
  const size=64;
  const pixels=new Uint8Array(size*size*4);
  for (let y=0; y<size; y++) for (let x=0; x<size; x++) {
    const radius=Math.hypot((x+.5)/size*2-1,(y+.5)/size*2-1);
    const offset=(y*size+x)*4;
    pixels[offset]=pixels[offset+1]=pixels[offset+2]=255;
    pixels[offset+3]=Math.round(255*Math.exp(-radius*radius*5)*(1-smoothVisibility(radius,.55,1)));
  }
  const texture=new DataTexture(pixels,size,size,RGBAFormat);
  texture.minFilter=LinearFilter;
  texture.magFilter=LinearFilter;
  texture.needsUpdate=true;
  return texture;
}

export class CometTail {
  group=new Group();
  activity=0;
  elapsed=0;
  inverse=new Matrix4();
  sunPosition=new Vector3();
  cameraLocal=new Vector3();
  cameraUp=new Vector3();
  antiSun=new Vector3();
  previousPoint=new Vector3();
  nextPoint=new Vector3();
  backward=new Vector3();
  center=new Vector3();
  pathTangent=new Vector3();
  view=new Vector3();
  side=new Vector3();
  fallback=new Vector3(1,0,0);
  constructor(host,sun) {
    this.host=host;
    this.sun=sun;
    this.group.name="Comet coma and tails";
    this.group.visible=false;
    this.ion=ribbon(0x72caff);
    this.dust=ribbon(0xffe6bd);
    this.texture=comaTexture();
    this.coma=new Sprite(new SpriteMaterial({map:this.texture,color:0xc5ecff,
      blending:AdditiveBlending,transparent:true,depthWrite:false,depthTest:true,toneMapped:false}));
    this.group.add(this.dust,this.ion,this.coma);
    // Attach before the axial/spin groups: the tail never spins with the nucleus.
    host.add(this.group);
  }
  update(camera,data,meanAnomaly,delta,actualScale,running,visible) {
    if (!visible || !data.physicalSemiMajorAxisAU) {
      this.group.visible=false;
      return;
    }
    const anomaly=solveEccentricAnomaly(meanAnomaly,data.orbit.eccentricity);
    const displayE=data.orbit.eccentricity;
    const physicalE=data.physicalEccentricity ?? displayE;
    const cosTrue=(Math.cos(anomaly)-displayE)/(1-displayE*Math.cos(anomaly));
    const physicalQ=data.physicalPerihelionAU ?? data.physicalSemiMajorAxisAU*(1-physicalE);
    const distanceAU=physicalQ*(1+physicalE)/Math.max(1e-12,1+physicalE*cosTrue);
    const target=cometActivity(distanceAU);
    const step=Math.max(0,Math.min(delta,.1));
    this.activity+=(target-this.activity)*(1-Math.exp(-step/.25));
    if (Math.abs(this.activity-target)<.0001) this.activity=target;
    if (running) this.elapsed+=step;
    this.group.visible=this.activity>.0005;
    if (!this.group.visible) return;

    // Geometry is local to the nucleus; derive sunlight/view directions in that
    // same frame. This remains correct if parent transforms later change.
    this.inverse.copy(this.host.matrixWorld).invert();
    this.sun.getWorldPosition(this.sunPosition).applyMatrix4(this.inverse);
    this.antiSun.copy(this.sunPosition).negate().normalize();
    this.cameraLocal.copy(camera.position).applyMatrix4(this.inverse);
    this.cameraUp.copy(camera.up).transformDirection(this.inverse);

    // The dust lags the tangential orbital motion, with an anti-solar component.
    // An analytical nearby sample avoids stale history after pause/mode changes.
    orbitPoint(data.orbit,anomaly-.002,this.previousPoint);
    orbitPoint(data.orbit,anomaly+.002,this.nextPoint);
    this.backward.subVectors(this.previousPoint,this.nextPoint).normalize();
    this.backward.addScaledVector(this.antiSun,-this.backward.dot(this.antiSun));
    if (this.backward.lengthSq()>1e-12) this.backward.normalize();

    const maximumLength=actualScale ? .12*AU : Math.min(450000,Math.max(data.radius*60,data.orbit.radius*.1));
    const length=maximumLength*Math.pow(this.activity,.55);
    const projected=projectedDiameterFraction(length*.5,this.cameraLocal.length(),camera.fov);
    const lod=smoothVisibility(projected,.002,.015);
    const brightness=Math.pow(this.activity,.65)*lod;
    this.group.visible=brightness>.0005;
    if (!this.group.visible) return;

    this.updateRibbon(this.ion,length,0,data.radius,brightness*.8);
    this.updateRibbon(this.dust,length*.72,length*.25,data.radius,brightness*.62);
    this.coma.scale.setScalar(data.radius*(4+8*Math.sqrt(this.activity)));
    this.coma.material.opacity=brightness*.55;
  }
  updateRibbon(mesh,length,curve,nucleusRadius,opacity) {
    const positions=mesh.geometry.getAttribute("position");
    for (let index=0; index<=SEGMENTS; index++) {
      const t=index/SEGMENTS;
      this.center.copy(this.antiSun).multiplyScalar(length*t)
        .addScaledVector(this.backward,curve*t*t);
      this.pathTangent.copy(this.antiSun).multiplyScalar(length)
        .addScaledVector(this.backward,2*curve*t);
      this.view.subVectors(this.cameraLocal,this.center);
      this.side.crossVectors(this.pathTangent,this.view);
      if (this.side.lengthSq()<1e-12) this.side.crossVectors(this.antiSun,this.cameraUp);
      if (this.side.lengthSq()<1e-12) this.side.crossVectors(this.antiSun,this.fallback);
      const spread=curve ? .09 : .023;
      const width=nucleusRadius*.65+length*spread*Math.pow(t,.75);
      this.side.normalize().multiplyScalar(width);
      const a=index*2;
      positions.setXYZ(a,this.center.x-this.side.x,this.center.y-this.side.y,this.center.z-this.side.z);
      positions.setXYZ(a+1,this.center.x+this.side.x,this.center.y+this.side.y,this.center.z+this.side.z);
    }
    positions.needsUpdate=true;
    mesh.material.uniforms.tailOpacity.value=opacity;
    mesh.material.uniforms.tailTime.value=this.elapsed;
  }
  dispose() {
    this.group.removeFromParent();
    for (const mesh of [this.ion,this.dust]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.coma.material.dispose();
    this.texture.dispose();
  }
}
