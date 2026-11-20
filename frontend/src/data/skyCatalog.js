import { AstroTime, Equator, EquatorFromVector, Horizon, Observer, Rotation_EQJ_EQD, RotateVector, Spherical, VectorFromSphere } from "astronomy-engine";

// 지상 천구의 천체 탐색·검색 목록. 태양·달·행성(명왕성 포함)은 astronomy-engine으로 그때그때 위치를
// 구하고, 별과 별자리는 아래의 좌표(J2000, 도·시)로 시선을 돌릴 방향만 구한다.
// 시선 이동용 근사이므로 별자리는 경계 안쪽의 중심 좌표만 둔다(IAU 88개 전부).
// 위성·왜소행성·소행성·혜성·탐사선은 JPL Horizons 표에서 오는 항목(scene/skyBodies.js)이 `equatorialAt(date)`로
// 그 시각의 적도 좌표를 알려 주며, 표를 받기 전에는 목록에 나타나지 않는다.

export const SKY_CATEGORIES = [
  { key: "star", label: "태양", direct: true },
  { key: "moon", label: "달", direct: true },
  { key: "planet", label: "행성" },
  { key: "bright", label: "별" },
  { key: "constellation", label: "별자리" },
  { key: "satellite", label: "위성" },
  { key: "dwarf", label: "왜소행성" },
  { key: "asteroid", label: "소행성" },
  { key: "comet", label: "혜성" },
  { key: "craft", label: "탐사선" },
];

const body = (id, ko, en, engine, category, aliases = []) => ({ id, ko, en, engine, category, aliases });
const star = (en, ko, ra, dec, aliases = []) => ({ id: `star:${en}`, ko, en, raDeg: ra, dec, category: "bright", aliases });
const constellation = (en, ko, raHours, dec, aliases = []) =>
  ({ id: `con:${en}`, ko, en, raDeg: raHours * 15, dec, category: "constellation", aliases });

export const SKY_OBJECTS = [
  body("sun", "태양", "Sun", "Sun", "star", ["sun"]),
  body("moon", "달", "Moon", "Moon", "moon", ["moon", "luna"]),
  body("mercury", "수성", "Mercury", "Mercury", "planet"),
  body("venus", "금성", "Venus", "Venus", "planet"),
  body("mars", "화성", "Mars", "Mars", "planet"),
  body("jupiter", "목성", "Jupiter", "Jupiter", "planet"),
  body("saturn", "토성", "Saturn", "Saturn", "planet"),
  body("uranus", "천왕성", "Uranus", "Uranus", "planet"),
  body("neptune", "해왕성", "Neptune", "Neptune", "planet"),
  body("pluto", "명왕성", "Pluto", "Pluto", "planet", ["왜소행성"]),

  star("Sirius", "시리우스", 101.287, -16.716, ["큰개자리 알파"]),
  star("Canopus", "카노푸스", 95.988, -52.696),
  star("Arcturus", "아르크투루스", 213.915, 19.182, ["목동자리 알파"]),
  star("Vega", "직녀성(베가)", 279.235, 38.784, ["직녀", "거문고자리 알파"]),
  star("Capella", "카펠라", 79.172, 45.998),
  star("Rigel", "리겔", 78.634, -8.202),
  star("Procyon", "프로키온", 114.825, 5.225),
  star("Betelgeuse", "베텔게우스", 88.793, 7.407),
  star("Achernar", "아케르나르", 24.429, -57.237),
  star("Hadar", "하다르", 210.956, -60.373),
  star("Altair", "견우성(알타이르)", 297.696, 8.868, ["견우", "독수리자리 알파"]),
  star("Aldebaran", "알데바란", 68.980, 16.509),
  star("Spica", "스피카", 201.298, -11.161),
  star("Antares", "안타레스", 247.352, -26.432),
  star("Pollux", "폴룩스", 116.329, 28.026),
  star("Fomalhaut", "포말하우트", 344.413, -29.622),
  star("Deneb", "데네브", 310.358, 45.280),
  star("Regulus", "레굴루스", 152.093, 11.967),
  star("Bellatrix", "벨라트릭스", 81.283, 6.350),
  star("Mintaka", "민타카", 83.002, -0.299, ["오리온 허리"]),
  star("Alnilam", "알닐람", 84.053, -1.202, ["오리온 허리"]),
  star("Alnitak", "알니타크", 85.190, -1.943, ["오리온 허리"]),
  star("Saiph", "사이프", 86.939, -9.670),
  star("Castor", "카스토르", 113.650, 31.888),
  star("Dubhe", "두베", 165.932, 61.751, ["북두칠성"]),
  star("Merak", "메라크", 165.460, 56.382, ["북두칠성"]),
  star("Phecda", "페크다", 178.458, 53.695, ["북두칠성"]),
  star("Megrez", "메그레즈", 183.857, 57.033, ["북두칠성"]),
  star("Alioth", "알리오트", 193.507, 55.960, ["북두칠성"]),
  star("Mizar", "미자르", 200.981, 54.925, ["북두칠성"]),
  star("Alkaid", "알카이드", 206.885, 49.313, ["북두칠성"]),
  star("Polaris", "북극성", 37.954, 89.264, ["북극성"]),

  // IAU 88개 별자리(뱀자리는 머리·꼬리 두 영역이라 89개). 이름은 천구 엔진의 이름과 같고(표시 토글이 이 이름으로 맞춰진다),
  // 좌표는 경계선(sky/constellationBounds.json) 안쪽의 중심이다. 가나다순.
  constellation("Lyra", "거문고자리", 18.84, 36.7, ["Lyr"]),
  constellation("Cancer", "게자리", 8.68, 19.3, ["Cnc","황도 12궁"]),
  constellation("Cetus", "고래자리", 1.63, -9.0, ["Cet"]),
  constellation("Puppis", "고물자리", 7.66, -33.2, ["Pup"]),
  constellation("Antlia", "공기펌프자리", 10.13, -34.0, ["Ant"]),
  constellation("Pavo", "공작자리", 19.58, -65.6, ["Pav"]),
  constellation("Sagittarius", "궁수자리", 19.17, -27.5, ["Sgr","황도 12궁"]),
  constellation("Reticulum", "그물자리", 3.88, -60.8, ["Ret"]),
  constellation("Apus", "극락조자리", 16.27, -76.0, ["Aps"]),
  constellation("Camelopardalis", "기린자리", 5.70, 70.8, ["Cam"]),
  constellation("Corvus", "까마귀자리", 12.43, -18.1, ["Crv"]),
  constellation("Pyxis", "나침반자리", 8.91, -28.5, ["Pyx"]),
  constellation("Volans", "날치자리", 7.80, -69.7, ["Vol"]),
  constellation("Crux", "남십자자리", 12.45, -60.0, ["Cru","남십자성"]),
  constellation("Piscis Austrinus", "남쪽물고기자리", 22.29, -30.7, ["PsA"]),
  constellation("Triangulum Australe", "남쪽삼각형자리", 16.07, -65.8, ["TrA"]),
  constellation("Corona Australis", "남쪽왕관자리", 18.65, -41.2, ["CrA"]),
  constellation("Lacerta", "도마뱀자리", 22.49, 45.2, ["Lac"]),
  constellation("Aquila", "독수리자리", 19.65, 2.1, ["Aql"]),
  constellation("Delphinus", "돌고래자리", 20.68, 12.2, ["Del"]),
  constellation("Vela", "돛자리", 9.61, -48.1, ["Vel"]),
  constellation("Grus", "두루미자리", 22.52, -45.2, ["Gru"]),
  constellation("Auriga", "마차부자리", 5.94, 41.1, ["Aur"]),
  constellation("Telescopium", "망원경자리", 19.33, -51.2, ["Tel"]),
  constellation("Coma Berenices", "머리털자리", 12.75, 22.4, ["Com"]),
  constellation("Boötes", "목동자리", 14.59, 29.3, ["Boo","Bootes"]),
  constellation("Pisces", "물고기자리", 0.64, 11.0, ["Psc","황도 12궁"]),
  constellation("Hydrus", "물뱀자리", 2.37, -71.5, ["Hyi"]),
  constellation("Aquarius", "물병자리", 22.40, -10.5, ["Aqr","황도 12궁"]),
  constellation("Hydra", "바다뱀자리", 10.43, -18.9, ["Hya"]),
  constellation("Scutum", "방패자리", 18.67, -9.9, ["Sct"]),
  constellation("Cygnus", "백조자리", 20.61, 43.1, ["Cyg","북십자성"]),
  constellation("Serpens Cauda", "뱀자리(꼬리)", 18.17, -6.3, ["Ser","뱀자리","Serpens"]),
  constellation("Serpens Caput", "뱀자리(머리)", 15.70, 9.9, ["Ser","뱀자리","Serpens"]),
  constellation("Ophiuchus", "뱀주인자리", 17.30, -5.3, ["Oph"]),
  constellation("Phoenix", "봉황자리", 0.78, -47.8, ["Phe"]),
  constellation("Corona Borealis", "북쪽왕관자리", 15.88, 32.2, ["CrB"]),
  constellation("Columba", "비둘기자리", 5.79, -35.6, ["Col"]),
  constellation("Canes Venatici", "사냥개자리", 13.16, 40.4, ["CVn"]),
  constellation("Leo", "사자자리", 10.70, 15.1, ["Leo","황도 12궁"]),
  constellation("Lynx", "살쾡이자리", 8.09, 46.8, ["Lyn"]),
  constellation("Triangulum", "삼각형자리", 2.14, 32.1, ["Tri"]),
  constellation("Cepheus", "세페우스자리", 22.33, 72.2, ["Cep"]),
  constellation("Horologium", "시계자리", 3.30, -53.3, ["Hor"]),
  constellation("Gemini", "쌍둥이자리", 7.15, 23.4, ["Gem","황도 12궁"]),
  constellation("Andromeda", "안드로메다자리", 0.67, 40.4, ["And"]),
  constellation("Aries", "양자리", 2.66, 20.1, ["Ari","황도 12궁"]),
  constellation("Eridanus", "에리다누스자리", 3.80, -21.0, ["Eri"]),
  constellation("Vulpecula", "여우자리", 20.28, 24.9, ["Vul"]),
  constellation("Capricornus", "염소자리", 21.02, -18.7, ["Cap","황도 12궁"]),
  constellation("Orion", "오리온자리", 5.59, 5.2, ["Ori","사냥꾼"]),
  constellation("Monoceros", "외뿔소자리", 7.02, -2.7, ["Mon"]),
  constellation("Carina", "용골자리", 8.77, -63.0, ["Car"]),
  constellation("Draco", "용자리", 16.96, 68.1, ["Dra"]),
  constellation("Sextans", "육분의자리", 10.27, -2.6, ["Sex"]),
  constellation("Lupus", "이리자리", 15.32, -42.4, ["Lup"]),
  constellation("Indus", "인디언자리", 21.48, -58.5, ["Ind"]),
  constellation("Canis Minor", "작은개자리", 7.63, 5.9, ["CMi"]),
  constellation("Ursa Minor", "작은곰자리", 15.04, 76.7, ["UMi","북극성"]),
  constellation("Leo Minor", "작은사자자리", 10.36, 33.5, ["LMi"]),
  constellation("Scorpius", "전갈자리", 16.76, -32.1, ["Sco","황도 12궁"]),
  constellation("Ara", "제단자리", 17.34, -54.3, ["Ara"]),
  constellation("Sculptor", "조각실자리", 0.46, -32.2, ["Scl"]),
  constellation("Caelum", "조각칼자리", 4.75, -38.1, ["Cae"]),
  constellation("Equuleus", "조랑말자리", 21.20, 7.5, ["Equ"]),
  constellation("Norma", "직각자자리", 16.08, -51.6, ["Nor"]),
  constellation("Virgo", "처녀자리", 13.29, -2.7, ["Vir","황도 12궁"]),
  constellation("Libra", "천칭자리", 15.22, -15.3, ["Lib","황도 12궁"]),
  constellation("Chamaeleon", "카멜레온자리", 10.72, -80.1, ["Cha"]),
  constellation("Cassiopeia", "카시오페이아자리", 1.02, 62.5, ["Cas"]),
  constellation("Circinus", "컴퍼스자리", 14.82, -63.1, ["Cir"]),
  constellation("Crater", "컵자리", 11.41, -15.7, ["Crt"]),
  constellation("Centaurus", "켄타우루스자리", 13.10, -46.1, ["Cen"]),
  constellation("Canis Major", "큰개자리", 6.83, -22.0, ["CMa"]),
  constellation("Ursa Major", "큰곰자리", 11.04, 54.4, ["UMa","북두칠성"]),
  constellation("Tucana", "큰부리새자리", 23.84, -64.6, ["Tuc"]),
  constellation("Mensa", "테이블산자리", 5.48, -77.5, ["Men"]),
  constellation("Lepus", "토끼자리", 5.57, -19.1, ["Lep"]),
  constellation("Musca", "파리자리", 12.57, -70.1, ["Mus"]),
  constellation("Octans", "팔분의자리", 21.26, -84.6, ["Oct"]),
  constellation("Pegasus", "페가수스자리", 22.69, 19.5, ["Peg"]),
  constellation("Perseus", "페르세우스자리", 3.54, 44.4, ["Per"]),
  constellation("Hercules", "헤르쿨레스자리", 17.30, 28.6, ["Her","헤라클레스자리"]),
  constellation("Microscopium", "현미경자리", 20.96, -36.0, ["Mic"]),
  constellation("Pictor", "화가자리", 5.57, -52.5, ["Pic"]),
  constellation("Fornax", "화로자리", 2.77, -31.6, ["For"]),
  constellation("Sagitta", "화살자리", 19.70, 18.7, ["Sge"]),
  constellation("Dorado", "황새치자리", 5.03, -61.3, ["Dor"]),
  constellation("Taurus", "황소자리", 4.41, 17.1, ["Tau","황도 12궁"]),
];

const COMPASS = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];

/** @returns {string} 방위각의 8방위 이름 */
export function directionName(azimuthDeg) {
  return COMPASS[Math.round((((azimuthDeg % 360) + 360) % 360) / 45) % 8];
}

// 별·별자리·Horizons 천체의 좌표는 J2000인데 Horizon()은 그 날짜의 적도 좌표를 받는다. 26년의 세차(약 0.38°)를 바로잡는다.
function j2000ToDate(raHours, decDeg, date) {
  const time = new AstroTime(date);
  const vector = VectorFromSphere(new Spherical(decDeg, raHours * 15, 1), time);
  const equator = EquatorFromVector(RotateVector(Rotation_EQJ_EQD(time), vector));
  return { ra: equator.ra, dec: equator.dec };
}

/**
 * 관측 지점·시각에서 천체의 지평 좌표.
 *
 * @param {object} object SKY_OBJECTS의 항목
 * @param {{date: Date, latitude: number, longitude: number, elevation?: number}} site
 * @returns {{azimuth: number, altitude: number}}
 */
export function locateSkyObject(object, { date, latitude, longitude, elevation = 0 }) {
  const observer = new Observer(latitude, longitude, elevation);
  let ra;
  let dec;
  if (object.equatorialAt) {
    const equatorial = object.equatorialAt(date);
    if (!equatorial) return null;
    ({ ra, dec } = j2000ToDate(equatorial.ra / 15, equatorial.dec, date));
  } else if (object.engine) {
    const equator = Equator(object.engine, date, observer, true, true);
    ra = equator.ra;
    dec = equator.dec;
  } else {
    ({ ra, dec } = j2000ToDate(object.raDeg / 15, object.dec, date));
  }
  const horizon = Horizon(date, observer, ra, dec, "normal");
  return { azimuth: horizon.azimuth, altitude: horizon.altitude };
}

/**
 * 한국어·영어 이름, 별칭에 검색어가 들어 있는 항목(대소문자 무시).
 *
 * @param {string} query
 * @param {object[]} [objects] 찾을 목록(기본은 고정 목록, Horizons 천체를 더하려면 합쳐서 넘긴다)
 * @returns {object[]}
 */
export function searchSkyObjects(query, objects = SKY_OBJECTS) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  return objects.filter((object) => [object.ko, object.en, ...object.aliases]
    .some((name) => name.toLocaleLowerCase().includes(needle)));
}
