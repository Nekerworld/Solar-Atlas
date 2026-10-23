import { ADDITIONAL_SMALL_BODIES } from "./additionalBodyElements";
import { spacecraftMarker } from "./spacecraftSnapshots";

const AU = 149597870.7;
// The existing illustrative system uses nonuniform distances. Anchor new bodies
// to its actual planet/belt boundaries, AFTER configureExplorationOrbits runs.
export function illustrativeDistance(sun, distanceAU) {
  const body = name => sun.satellites.find(row => row.name === name);
  const anchors = [[0,0],[.387,body("Mercury").orbit.radius],[.723,body("Venus").orbit.radius],
    [1,body("Earth").orbit.radius],[1.524,body("Mars").orbit.radius],
    [2.1,body("AsteroidBelt").innerRadius],[3.3,body("AsteroidBelt").outerRadius],
    [5.203,body("Jupiter").orbit.radius],[9.58,body("Saturn").orbit.radius],
    [19.19,body("Uranus").orbit.radius],[30.07,body("Neptune").orbit.radius],
    [55,body("KuiperBelt").outerRadius]];
  for (let index=1; index<anchors.length; index++) {
    const [x1,y1]=anchors[index-1], [x2,y2]=anchors[index];
    if (distanceAU<=x2) return y1+(y2-y1)*(distanceAU-x1)/(x2-x1);
  }
  // Compress long-period comet aphelia while leaving the existing Oort shell intact.
  return anchors.at(-1)[1]+8000000*Math.log1p((distanceAU-55)/50);
}

function sphere(name,label,category,radius,color,orbit,extra={}) {
  return {name,displayName:label,category,radius,color,albedo:.12,rotationPeriod:0,axialTilt:0,
    orbit:{color,radius:0,rotationPeriod:0,eccentricity:0,inclination:0,
      ascendingNode:0,argumentOfPeriapsis:0,keplerian:true,...orbit},satellites:[],...extra};
}

// Haumea moon osculating elements, HJD 2454615.0, ecliptic J2000.
// Ragozzine & Brown (2009), Table 2: https://arxiv.org/html/0903.4213#S3.T2
// Fixed Kepler ellipses omit mutual perturbations and precession intentionally.
const moons = [
  {name:"Hiiaka",label:"히이아카",id:"Q141799",a:49880,e:.0513,i:126.356,node:206.766,peri:154.1,period:49.462,radius:185},
  {name:"Namaka",label:"나마카",id:"Q153893",a:25657,e:.249,i:113.013,node:205.016,peri:178.9,period:18.2783,radius:85},
];

export function appendAdditionalBodies(sun, actual) {
  const haumea=sun.satellites.find(body=>body.name==="Haumea");
  for (const row of moons) {
    const radius=actual?row.radius:row.name==="Hiiaka"?2100:1500;
    const axis=actual?row.a:Math.max(row.a*1.5,(haumea.radius*3+radius+5000)/(1-row.e));
    haumea.satellites.push(sphere(row.name,row.label,"moon",radius,0xc3d4e3,
      {radius:axis,eccentricity:row.e,inclination:row.i,ascendingNode:row.node,
        argumentOfPeriapsis:row.peri,rotationPeriod:row.period},
      {parentName:"Haumea",parentDisplayName:"하우메아",wikidataId:row.id,aliases:[row.name,row.label],
        referenceNote:"2008년 기준 궤도 요소 · 고정 케플러 도식 · 현재 위치 아님"}));
  }
  for (const [index,row] of ADDITIONAL_SMALL_BODIES.entries()) {
    const comet=row.classification==="혜성";
    const physicalQ=row.a*(1-row.e), physicalQMax=row.a*(1+row.e);
    const q=actual?physicalQ*AU:illustrativeDistance(sun,physicalQ);
    const Q=actual?physicalQMax*AU:illustrativeDistance(sun,physicalQMax);
    const axis=(q+Q)/2, eccentricity=(Q-q)/(Q+q);
    const radius=actual?row.radius:comet?4200:1800+Math.sqrt(Math.min(row.radius,650)/650)*3500;
    sun.satellites.push(sphere(row.name,row.label,comet?"comet":"dwarf",radius,
      comet?0x99cbd7:index<12?0xada396:0xbda9aa,
      {radius:actual?row.a*AU:axis,eccentricity:actual?row.e:eccentricity,
        inclination:row.i,ascendingNode:row.node,argumentOfPeriapsis:row.peri,rotationPeriod:row.period,
        initialMeanAnomaly:comet?.0001:(index*2.3999632297)%(Math.PI*2)},
      {designation:row.designation,classification:row.classification,wikidataId:row.wikidataId,
        aliases:[row.name,row.label,row.designation,...row.aliases],rotationPeriod:row.spin,
        physicalSemiMajorAxisAU:row.a,physicalEccentricity:row.e,physicalPerihelionAU:physicalQ,
        orbitSource:row.source,orbitReferenceEpoch:row.epoch,
        referenceNote:actual?"JPL 기준 궤도 · 구형 크기 근사 · 위상은 시각화용":
          "JPL 궤도 방향 · 근일점/원일점 거리 압축 · 구형 도식 · 현재 위치 아님"}));
  }
  for (const [name,label,id] of [["Pioneer10","파이오니어 10호","Q59103"],["Pioneer11","파이오니어 11호","Q59113"]]) {
    sun.satellites.push(sphere(name,label,"artifact",actual?.0015:1400,0xe6c282,{},
      {wikidataId:id,aliases:[label.replaceAll(" ",""),label.replace("파이오니어","파이어니어"),name],
        ...spacecraftMarker(name,actual),
        modelSrc:"/assets/models/pioneer/pioneer.glb",
        referenceNote:spacecraftMarker(name,actual).referenceNote +
          (name==="Pioneer11"?" · NASA 파이오니어 10호 모델을 사용한 공통 외형 도식 (11호 전용 장비 미재현)":"")}));
  }
}
