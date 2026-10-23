import { Mesh, MeshPhongMaterial, SphereGeometry, Vector3 } from "three";

// Three r140 shader hooks: use the scene's Sun (world origin), not camera direction.
const outgoing = "vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;";

function sunlight(material, shade) {
  const sunView = { value: new Vector3() };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.earthSunView = sunView;
    shader.fragmentShader = "uniform vec3 earthSunView;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
       float earthSunDot = dot(normalize(normal), normalize(earthSunView + vViewPosition));
       totalEmissiveRadiance *= 1.0 - smoothstep(-0.12, 0.10, earthSunDot);`,
    ).replace(outgoing, shade);
  };
  material.customProgramCacheKey = () => shade;
  return (_renderer, _scene, camera) => {
    sunView.value.set(0, 0, 0).applyMatrix4(camera.matrixWorldInverse);
  };
}

export class EarthSurface {
  elapsed = 0;
  constructor(mesh, textures) {
    this.mesh = mesh;
    mesh.material.dispose();
    mesh.material = new MeshPhongMaterial({
      map: textures.get("/assets/8k_earth_daymap.jpg"),
      emissiveMap: textures.get("/assets/8k_earth_nightmap.jpg"),
      emissive: 0xffffff,
      emissiveIntensity: 1.3,
      shininess: 8,
    });
    mesh.onBeforeRender = sunlight(mesh.material,
      `vec3 outgoingLight = diffuseColor.rgb * (0.015 + 1.2 * max(earthSunDot, 0.0)) + totalEmissiveRadiance;`);

    const material = new MeshPhongMaterial({
      color: 0xffffff,
      alphaMap: textures.get("/assets/8k_earth_clouds.jpg"),
      transparent: true, opacity: 0.88, depthWrite: false,
    });
    const updateSun = sunlight(material,
      `vec3 outgoingLight = diffuseColor.rgb * (0.012 + 1.3 * max(earthSunDot, 0.0));`);
    const compile = material.onBeforeCompile;
    this.time = { value: 0 };
    this.phase = { value: Math.random() * Math.PI * 2 };
    material.onBeforeCompile = (shader) => {
      compile(shader);
      shader.uniforms.cloudTime = this.time;
      shader.uniforms.cloudPhase = this.phase;
      shader.fragmentShader = "uniform float cloudTime;\nuniform float cloudPhase;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <alphamap_fragment>", `
        vec2 cloudUV = vUv;
        float latitude = sin(3.14159265 * cloudUV.y);
        // Periodic longitude waves avoid a seam. Fade deformation at the poles.
        cloudUV.x += latitude * (0.005 * sin(cloudUV.y * 18.0 + cloudTime * 0.09 + cloudPhase)
                    + 0.003 * sin(cloudUV.x * 18.8495559 - cloudTime * 0.06));
        cloudUV.y += latitude * 0.002 * sin(cloudUV.x * 12.5663706 + cloudTime * 0.04 + cloudPhase);
        cloudUV = vec2(fract(cloudUV.x), clamp(cloudUV.y, 0.001, 0.999));
        float cloudDensity = texture2D(alphaMap, cloudUV).g;
        diffuseColor.a *= smoothstep(0.06, 0.85, cloudDensity);
      `);
    };
    material.customProgramCacheKey = () => "earth-clouds-r140-v1";
    this.clouds = new Mesh(new SphereGeometry(1, 64, 32), material);
    this.clouds.name = "Earth clouds";
    this.clouds.onBeforeRender = updateSun;
    // Stable random motion parameters, never random jumps per animation frame.
    this.drift = 0.002 + Math.random() * 0.001;
    this.wobble = Math.random() * Math.PI * 2;
  }

  resize(radius, division) {
    this.clouds.geometry.dispose();
    this.clouds.geometry = new SphereGeometry(radius * 1.006, division * 2, division);
  }

  tick(delta, speed) {
    if (speed <= 0) return;
    // Cosmetic weather runs in seconds; bound the simulation-speed multiplier.
    const dt = Math.min(Math.max(delta, 0), 0.1) * (0.5 + Math.min(speed, 1) * 2);
    this.elapsed += dt;
    this.time.value = this.elapsed;
    this.clouds.rotation.y = this.elapsed * this.drift;
    this.clouds.rotation.z = Math.sin(this.elapsed * 0.025 + this.wobble) * 0.002;
  }

  dispose() {
    this.clouds.geometry.dispose();
    this.clouds.material.dispose();
    // Shared textures and the surface material are disposed by existing owners.
  }
}
