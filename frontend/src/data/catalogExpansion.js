// Visualization catalog only. No collector targets, API registrations or RAG writes.
// Fixed reference elements describe shape, not a shared epoch or live positions.
// Satellite a/e/i/node/peri/period: rounded JPL mean elements:
// https://ssd.jpl.nasa.gov/sats/elem/ (JUP365, SAT441/SAT415, URA182, NEP097/105, PLU060).
// Radii are spherical visual approximations, including irregular moons.
import { spacecraftMarker } from "./spacecraftSnapshots";

const AU = 149597870.7;
// name, Korean label, a[km], e, i[deg], node[deg], peri[deg], P[days], radius[km]
const moons = {
  Jupiter: [
    ['Metis','메티스',128000,0,0,0,0,.294779,21.5],
    ['Adrastea','아드라스테아',129000,0,0,0,0,.298260,8.2],
    ['Amalthea','아말테아',181400,.003,.4,282.9,180.1,.499918,83.5],
    ['Thebe','테베',221900,.018,1.1,340.4,26.6,.676105,49.3],
    ['Io','이오',421800,.004,0,0,49.1,1.762732,1821.6],
    ['Europa','유로파',671100,.009,.5,184,45,3.525463,1560.8],
    ['Ganymede','가니메데',1070400,.001,.2,58.5,198.3,7.155588,2634.1],
    ['Callisto','칼리스토',1882700,.007,.3,309.1,43.8,16.690440,2410.3],
  ],
  Saturn: [
    ['Pan','판',133600,0,0,0,0,.575051,14.1],
    ['Hyperion','히페리온',1481500,.105,.6,87.1,214,21.276658,135],
    ['Daphnis','다프니스',136500,0,0,0,0,.594080,3.8],
    ['Atlas','아틀라스',137700,.001,0,0,82.3,.604602,15.1],
    ['Prometheus','프로메테우스',139400,.002,0,0,341.9,.615878,43.1],
    ['Pandora','판도라',141700,.004,0,0,217.9,.631369,40.7],
    ['Epimetheus','에피메네우스',151400,.020,.3,189.8,96.3,.697012,58.1],
    ['Janus','야누스',151500,.007,.2,159.9,11.1,.697353,89.5],
    ['Aegaeon','아이가이온',167500,0,0,0,0,.808115,.33],
    ['Mimas','미마스',186000,.020,1.6,66.2,160.4,.942422,198.2],
    ['Enceladus','엔셀라두스',238400,.005,0,0,119.5,1.370218,252.1],
    ['Tethys','테티스',295000,.001,1.1,273,335.3,1.887802,531.1],
    ['Dione','디오네',377700,.002,0,0,116,2.736916,561.4],
    ['Rhea','레아',527200,.001,.3,133.7,44.3,4.517503,763.8],
    ['Titan','타이탄',1221900,.029,.3,78.6,78.3,15.945448,2574.7],
    ['Iapetus','이아페투스',3561700,.028,7.6,86.5,254.5,79.331002,734.5],
  ],
  Uranus: [
    ['Ariel','아리엘',190929,.001,0,0,9.6,2.520379,578.9],
    ['Miranda','미란다',129846,.001,4.4,100.9,154.8,1.413479,235.8],
    ['Oberon','오베론',583511,.002,.1,76.8,132.2,13.463237,761.4],
    ['Puck','퍽',86004,0,.3,216.1,0,.761833,81],
    ['Titania','티타니아',436298,.002,.1,29.5,184,8.705869,788.9],
    ['Umbriel','움브리엘',265986,.004,.1,174.8,183.4,4.144177,584.7],
  ],
  Neptune: [
    ['Proteus','프로테우스',117600,0,0,0,0,1.122315,210],
    ['Triton','트리톤',354800,0,157.3,178.1,0,5.876994,1353.4],
    ['Larissa','라리사',73500,.001,.2,312,247.3,.554989,97],
    ['Nereid','네레이드',5513900,.751,5.1,319.5,296.8,360.133039,170],
  ],
  Pluto: [
    ['Charon','카론',19600,0,0,0,0,6.387222,606],
    ['Nix','닉스',49300,.015,0,0,31.4,24.85,19.3],
  ],
};
const poles = { Earth:[0,90], Mars:[317.68143,52.8865],
  Jupiter:[268.1,64.5], Saturn:[40.6,83.5], Uranus:[257.31,-15.18],
  Neptune:[299.8,43.1], Pluto:[132.99,-6.16] };
// SAT441 local Laplace poles differ for outer moons; do not flatten Iapetus
// into the ring plane. Other listed inner moons share Saturn's equatorial pole.
// https://ssd.jpl.nasa.gov/sats/elem/
const moonPoles = {
  Ganymede: [268.2, 64.6], Callisto: [268.7, 64.8],
  Titan: [36.4, 84.0], Hyperion: [40.2, 83.6], Iapetus: [288.7, 78.9],
  Proteus: [299.8, 42.6],
};
const moonColors = [0xc5b9a3,0xa6a9b0,0xbba38c,0x969a9e,0xd4c590,0xbec8cd];
function sphere(name, label, category, radius, color, orbit, extra = {}) {
  return { name, displayName:label, category, radius, color, albedo:.15,
    rotationPeriod:0, axialTilt:0, satellites:[],
    orbit:{color, radius:0, rotationPeriod:0, inclination:0, eccentricity:0,
      ascendingNode:0, argumentOfPeriapsis:0, keplerian:true, ...orbit}, ...extra };
}
function addMoons(sun, actual) {
  for (const [parentName, rows] of Object.entries(moons)) {
    const parent = sun.satellites.find(b => b.name === parentName);
    const sorted = [...rows].sort((a,b) => a[2]-b[2]);
    for (const [index,row] of rows.entries()) {
      const [name,label,a,e,i,node,peri,period,radius] = row;
      const rank = sorted.findIndex(r => r[0] === name);
      const base = Math.max(parent.radius * 1.8, (parent.ring?.outerRadius || 0)*2+16000);
      // Spread close inner moons so exaggerated spheres do not occupy one orbit.
      const displayA = base + rank*9000 + Math.log(a/sorted[0][2])*parent.radius*.7;
      const displayR = 550 + Math.sqrt(radius/2634.1)*3800;
      const safeA = Math.max(displayA, (parent.radius+displayR+12000)/(1-e));
      parent.satellites.push(sphere(name,label,'moon',actual?radius:displayR,
        moonColors[index%moonColors.length], {radius:actual?a:safeA,
          rotationPeriod:period, eccentricity:e, inclination:i, ascendingNode:node,
          argumentOfPeriapsis:peri,
          referencePole:name==='Nereid'?undefined:moonPoles[name] || poles[parentName]},
        { parentName, parentDisplayName:parent.displayName || ({Jupiter:'목성',Saturn:'토성',Uranus:'천왕성',Neptune:'해왕성',Pluto:'명왕성'})[parentName],
          referenceNote:'JPL 평균 궤도 요소 · 위상은 시각화용',
          // Synchronous spin is illustrative; Hyperion/Nix are not tidally locked.
          rotationPeriod:['Hyperion','Nix'].includes(name)?0:period*24 }));
    }
  }
}
// Rounded historical/reference shapes. Not current osculating elements.
// https://ssd.jpl.nasa.gov/sb/elem_tables.html
const comets = [
  ['Tempel1','템펠 1','9P/Tempel 1',3.12,.517,10.5,68.9,178.8,5.56,3,1000000],
  ['HerschelRigollet','허셜–리골렛','35P/Herschel-Rigollet',28.8,.974,64.2,355.9,29.3,155,5,3000000],
  ['ChuryumovGerasimenko','추류모프–게라시멘코','67P/Churyumov-Gerasimenko',3.46,.641,7.04,50.1,12.8,6.44,2,1100000],
  ['Encke','엥케','2P/Encke',2.215,.84833,11.783,334.566,186.55,3.30,2.4,900000],
];
function addComets(sun, actual) {
  for (const [name,label,designation,a,e,i,node,peri,years,radius,displayA] of comets) {
    sun.satellites.push(sphere(name,label,'comet',actual?radius:4800,0xaed2d9,
      {radius:actual?a*AU:displayA, rotationPeriod:years*365.25,
        eccentricity:e,inclination:i,ascendingNode:node,argumentOfPeriapsis:peri},
      {aliases:[designation,label.replaceAll('–',' ')], designation,physicalSemiMajorAxisAU:a,
        referenceNote:'고정 근사 궤도 · 현재 위치 아님'}));
  }
}
function addArtifacts(sun, actual) {
  const modelFiles = { ISS:'community/iss/scene.gltf', Tiangong:'community/tiangong/scene.gltf', Hubble:'community/hubble/hubble.glb', JamesWebb:'community/webb/scene.gltf',
    Juno:'community/juno/scene.gltf', Voyager1:'community/voyager/scene.gltf', Voyager2:'community/voyager/scene.gltf', NewHorizons:'new-horizons.glb' };
  const modelFor = name => modelFiles[name] ? {modelSrc:'/assets/models/'+modelFiles[name]} : {};
  const earth = sun.satellites.find(b=>b.name==='Earth');
  const jupiter = sun.satellites.find(b=>b.name==='Jupiter');
  for (const [index,[name,label,altitude,i,period,radius]] of [
    ['ISS','국제 우주 정거장',420,51.64,.0645,.055], ['Tiangong','톈궁',390,41.47,.064,.035],
    ['Hubble','허블 우주 망원경',540,28.47,.0667,.007],
  ].entries()) {
    earth.satellites.push(sphere(name,label,'artifact',actual?radius:900,0xc5dafa,
      {radius:actual?6378+altitude:earth.radius+5000+index*5000,
        rotationPeriod:period, inclination:i, ascendingNode:40+index*105},
      {parentName:'Earth',parentDisplayName:'지구',orbitVisibility:'closeup',orbitFocusRadius:earth.radius,
        aliases:name==='Tiangong'?['천궁','天宫']:name==='Hubble'?['허블','HST']:['국제우주정거장'],
        referenceNote:'대표 고도의 근사 궤도 · 현재 궤도/위상 아님',
        ...modelFor(name)}));
  }
  earth.satellites.push(sphere('JamesWebb','제임스 웹 우주 망원경','artifact',actual?.01:1100,0xe5c275,
    {}, {parentName:'Earth',parentDisplayName:'태양–지구 L2',
      aliases:['JWST','제임스웹','제입스웹'],...spacecraftMarker('JamesWebb',actual),...modelFor('JamesWebb')}));
  // NASA/JPL Horizons -61 relative to Jupiter 500@599, 2024-03-10 00:00 TDB.
  // ELEMENTS / REF_PLANE=ECLIPTIC / REF_SYSTEM=ICRF / KM-D (J2000 ecliptic).
  // All orientation angles share this frame; no Jupiter-equator rotation follows.
  // https://ssd.jpl.nasa.gov/api/horizons.api
  const junoPeriod = 32.75667326832932;
  const junoPhysicalA = 2951204.182807051;
  const junoPhysicalE = .9755744315517458;
  const junoDisplayPerijove = jupiter.radius + 1200 + 8000;
  const junoEccentricity = actual ? junoPhysicalE : .78;
  jupiter.satellites.push(sphere('Juno','주노','artifact',actual?.01:1200,0xefd7a0,
    {radius:actual?junoPhysicalA:junoDisplayPerijove/(1-junoEccentricity),
      rotationPeriod:junoPeriod, eccentricity:junoEccentricity,
      inclination:99.14509533003448, ascendingNode:286.8010188233038,
      argumentOfPeriapsis:128.3914917403179},
    {parentName:'Jupiter',parentDisplayName:'목성',aliases:['Juno'],
      orbitVisibility:'closeup',orbitFocusRadius:jupiter.radius,
      orbitReferenceEpoch:'2024-03-10 00:00 TDB',
      orbitReferenceFrame:'Ecliptic J2000',
      referenceNote:actual?'JPL Horizons 2024-03-10 황도면 기준 접촉궤도 · 위상은 시각화용 · 현재 위치 아님'
        :'JPL Horizons 2024-03-10 궤도 방향 · 크기/이심률은 시각화용 · 현재 위치 아님',
      ...modelFor('Juno')}));
  for (const [name,label] of [
    ['Voyager1','보이저 1호'], ['Voyager2','보이저 2호'], ['NewHorizons','뉴호라이즌스'],
  ]) {
    sun.satellites.push(sphere(name,label,'artifact',actual?.003:1600,0xe7ca85,
      {}, {aliases:[label.replaceAll(' ',''),name],...spacecraftMarker(name,actual),...modelFor(name)}));
  }
}
function region(name,label,shape,actual,inner,outer,displayInner,displayOuter,extra) {
  return sphere(name,label,'region',1,0x9faec6,{keplerian:false}, {
    kind:'particle_region',distribution:shape,staticPopulation:true,
    innerRadius:actual?inner*AU:displayInner, outerRadius:actual?outer*AU:displayOuter,
    particleScale:1, particleRadius:(actual?outer*AU:displayOuter)*.0009,
    particleCount:shape==='shell'?3500:2400, labelAngle:shape==='shell'?1.2:2.7,
    referenceNote:'분포 범위를 나타내는 입자 도식 · 개별 천체 크기/위치 아님', ...extra });
}
export function appendCatalogExpansion(sun, actual) {
  // Both modes share inertial equatorial poles with the satellite reference
  // frames. Individual Laplace planes may differ slightly from the equator.
  for (const [name, pole] of Object.entries(poles)) {
    sun.satellites.find(body => body.name === name).equatorialPole = [...pole];
  }
  addMoons(sun,actual); addComets(sun,actual); addArtifacts(sun,actual);
  sun.satellites.push(sphere('Sedna','세드나','dwarf',actual?500:5400,0xc27156,
    {radius:actual?506*AU:45000000,eccentricity:.85,inclination:11.93,
      ascendingNode:144.5,argumentOfPeriapsis:311.5,rotationPeriod:11400*365.25},
    {aliases:['90377 Sedna'],referenceNote:'왜소행성 후보 · 고정 근사 궤도'}));
  sun.satellites.push(region('KuiperBelt','카이퍼벨트','belt',actual,30,55,4200000,8500000,
    {aliases:['카이퍼 벨트','Kuiper belt'],thickness:.18,seed:27182}));
  sun.satellites.push(region('OortCloud','오르트구름','shell',actual,2000,100000,190000000,320000000,
    {aliases:['오르트 구름','Oort cloud'],seed:31415}));
}
