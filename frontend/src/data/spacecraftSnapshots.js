// Fixed, predicted geometric vectors returned by NASA/JPL Horizons.
// Epoch: 2026-10-22 00:00 TDB. Ecliptic J2000, units AU.
// https://ssd-api.jpl.nasa.gov/doc/horizons.html
// Query: VECTORS, CENTER=500@10 (Sun), 500@399 (Webb),
// OUT_UNITS=AU-D, REF_PLANE=ECLIPTIC, VEC_CORR=NONE.
// Predictions, not live telemetry. No runtime network requests or extrapolation.
const AU = 149597870.7;
const epoch = '2026-10-22 00:00 TDB';
const snapshots = {
  Pioneer11: { id:-24, center:'Sun', xyz:[29.13597509722894, -110.890924887137, 28.25870203139554] },
  Pioneer10: { id:-23, center:'Sun', xyz:[24.08594746974757, 139.8199011166624, 7.399735029477984] },
  Voyager1: { id:-31, center:'Sun', xyz:[-32.18812646886934,-136.9896831139416,99.11447824594531] },
  Voyager2: { id:-32, center:'Sun', xyz:[39.94125326464497,-105.5776320488578,-89.84056657226317] },
  NewHorizons: { id:-98, center:'Sun', xyz:[20.91154261423575,-62.42731508160835,2.296480615952782] },
  JamesWebb: { id:-170, center:'Earth', xyz:[.005182794983926117,.008673731935254374,.00004211228870816493] },
};
const earthFromSun = [.8769326178099847,.4708818479374672,-.000034498707980278];

export function spacecraftMarker(name, actualScale) {
  const snapshot = snapshots[name];
  const [x,y,z] = snapshot.xyz;
  let position = [x,z,-y]; // Ecliptic -> Three Y-up.
  const lengthAU = Math.hypot(x,y,z);
  if (name === 'JamesWebb') {
    // Keep Webb on the anti-solar side when Earth's illustrative phase changes.
    // Parent-local X is outward from the Sun; root rotation follows that direction.
    const angle = Math.atan2(-earthFromSun[1],earthFromSun[0]);
    const c = Math.cos(angle), s = Math.sin(angle);
    position = [c*position[0]+s*position[2],position[1],-s*position[0]+c*position[2]];
  }
  const displayDistance = name === 'JamesWebb' ? 150000
    : 3800000 + Math.max(0,lengthAU-30)*110000;
  const scale = actualScale ? AU : displayDistance/lengthAU;
  return {
    markerPosition:position.map(value=>value*scale),
    markerFrame:name==='JamesWebb' ? 'radial' : 'inertial',
    orbitVisibility:'never',
    snapshotDistanceAU:lengthAU,
    snapshotEpoch:epoch,
    snapshotSource:'https://ssd.jpl.nasa.gov/horizons/',
    snapshotCenter:snapshot.center,
    referenceNote:`JPL Horizons 예측 위치 · ${epoch} 기준 · 실시간 위치 아님`,
  };
}

// Run AFTER illustrative orbital spacing is configured, before degree conversion.
// A body's compressed heliocentric distance must share the belt's boundary anchors.
export function alignOuterSpacecraftMarkers(sun) {
  const kuiper = sun.satellites.find(body=>body.name==='KuiperBelt');
  const neptune = sun.satellites.find(body=>body.name==='Neptune');
  if (!kuiper || !neptune) return;
  const neptuneEdge = neptune.orbit.radius*(1+neptune.orbit.eccentricity);
  const unitsPerAU = (kuiper.outerRadius-neptuneEdge)/(55-30);
  for (const body of sun.satellites) {
    if (!body.markerPosition || body.snapshotCenter !== 'Sun') continue;
    const source = snapshots[body.name];
    if (!source) continue;
    const [x,y,z] = source.xyz;
    const distanceAU = Math.hypot(x,y,z);
    const radial = kuiper.outerRadius + (distanceAU-55)*unitsPerAU;
    // Preserve the observed 3D direction; do not flatten Voyager's latitude.
    body.markerPosition = [x,z,-y].map(value=>value*radial/distanceAU);
  }
}
