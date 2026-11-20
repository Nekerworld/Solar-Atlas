// 천구에 그려지는 이름(별자리·고유 이름 별·별 번호·천체)을 한국어로 바꾸는 표.
// 천구 엔진의 이름표는 영어만 가지므로, 글자를 그리거나 재는 순간(entry.js)에 이 표로 바꿔 쓴다.
// 표에 없는 이름(카탈로그 번호 등)은 그대로 둔다.

// [IAU 약호, 영어 이름, 한국어 이름]
const CONSTELLATIONS = [
  ["And", "Andromeda", "안드로메다자리"], ["Ant", "Antlia", "공기펌프자리"], ["Aps", "Apus", "극락조자리"],
  ["Aqr", "Aquarius", "물병자리"], ["Aql", "Aquila", "독수리자리"], ["Ara", "Ara", "제단자리"],
  ["Ari", "Aries", "양자리"], ["Aur", "Auriga", "마차부자리"], ["Boo", "Boötes", "목동자리"],
  ["Cae", "Caelum", "조각칼자리"], ["Cam", "Camelopardalis", "기린자리"], ["Cnc", "Cancer", "게자리"],
  ["CVn", "Canes Venatici", "사냥개자리"], ["CMa", "Canis Major", "큰개자리"], ["CMi", "Canis Minor", "작은개자리"],
  ["Cap", "Capricornus", "염소자리"], ["Car", "Carina", "용골자리"], ["Cas", "Cassiopeia", "카시오페이아자리"],
  ["Cen", "Centaurus", "켄타우루스자리"], ["Cep", "Cepheus", "세페우스자리"], ["Cet", "Cetus", "고래자리"],
  ["Cha", "Chamaeleon", "카멜레온자리"], ["Cir", "Circinus", "컴퍼스자리"], ["Col", "Columba", "비둘기자리"],
  ["Com", "Coma Berenices", "머리털자리"], ["CrA", "Corona Australis", "남쪽왕관자리"],
  ["CrB", "Corona Borealis", "북쪽왕관자리"], ["Crv", "Corvus", "까마귀자리"], ["Crt", "Crater", "컵자리"],
  ["Cru", "Crux", "남십자자리"], ["Cyg", "Cygnus", "백조자리"], ["Del", "Delphinus", "돌고래자리"],
  ["Dor", "Dorado", "황새치자리"], ["Dra", "Draco", "용자리"], ["Equ", "Equuleus", "조랑말자리"],
  ["Eri", "Eridanus", "에리다누스자리"], ["For", "Fornax", "화로자리"], ["Gem", "Gemini", "쌍둥이자리"],
  ["Gru", "Grus", "두루미자리"], ["Her", "Hercules", "헤르쿨레스자리"], ["Hor", "Horologium", "시계자리"],
  ["Hya", "Hydra", "바다뱀자리"], ["Hyi", "Hydrus", "물뱀자리"], ["Ind", "Indus", "인디언자리"],
  ["Lac", "Lacerta", "도마뱀자리"], ["Leo", "Leo", "사자자리"], ["LMi", "Leo Minor", "작은사자자리"],
  ["Lep", "Lepus", "토끼자리"], ["Lib", "Libra", "천칭자리"], ["Lup", "Lupus", "이리자리"],
  ["Lyn", "Lynx", "살쾡이자리"], ["Lyr", "Lyra", "거문고자리"], ["Men", "Mensa", "테이블산자리"],
  ["Mic", "Microscopium", "현미경자리"], ["Mon", "Monoceros", "외뿔소자리"], ["Mus", "Musca", "파리자리"],
  ["Nor", "Norma", "직각자자리"], ["Oct", "Octans", "팔분의자리"], ["Oph", "Ophiuchus", "뱀주인자리"],
  ["Ori", "Orion", "오리온자리"], ["Pav", "Pavo", "공작자리"], ["Peg", "Pegasus", "페가수스자리"],
  ["Per", "Perseus", "페르세우스자리"], ["Phe", "Phoenix", "봉황자리"], ["Pic", "Pictor", "화가자리"],
  ["Psc", "Pisces", "물고기자리"], ["PsA", "Piscis Austrinus", "남쪽물고기자리"], ["Pup", "Puppis", "고물자리"],
  ["Pyx", "Pyxis", "나침반자리"], ["Ret", "Reticulum", "그물자리"], ["Sge", "Sagitta", "화살자리"],
  ["Sgr", "Sagittarius", "궁수자리"], ["Sco", "Scorpius", "전갈자리"], ["Scl", "Sculptor", "조각실자리"],
  ["Sct", "Scutum", "방패자리"], ["Ser", "Serpens", "뱀자리"], ["Sex", "Sextans", "육분의자리"],
  ["Tau", "Taurus", "황소자리"], ["Tel", "Telescopium", "망원경자리"], ["Tri", "Triangulum", "삼각형자리"],
  ["TrA", "Triangulum Australe", "남쪽삼각형자리"], ["Tuc", "Tucana", "큰부리새자리"],
  ["UMa", "Ursa Major", "큰곰자리"], ["UMi", "Ursa Minor", "작은곰자리"], ["Vel", "Vela", "돛자리"],
  ["Vir", "Virgo", "처녀자리"], ["Vol", "Volans", "날치자리"], ["Vul", "Vulpecula", "여우자리"],
];

const GREEK = {
  ALF: "α", BET: "β", GAM: "γ", DEL: "δ", EPS: "ε", ZET: "ζ", ETA: "η", TET: "θ", IOT: "ι", KAP: "κ",
  LAM: "λ", MU: "μ", NU: "ν", XI: "ξ", OMI: "ο", PI: "π", RHO: "ρ", SIG: "σ", TAU: "τ", UPS: "υ",
  PHI: "φ", CHI: "χ", PSI: "ψ", OME: "ω", OMG: "ω",
};

// 고유 이름 별(영어 → 한국어). 아랍어·라틴어에서 온 이름은 소리 나는 대로 적는다.
const STARS = {
  Sol: "태양", "Tau Ceti": "타우 세티", Polaris: "북극성", Aldebaran: "알데바란", Rigel: "리겔",
  Bellatrix: "벨라트릭스", Betelgeuse: "베텔게우스", Canopus: "카노푸스", Sirius: "시리우스", Procyon: "프로키온",
  Regulus: "레굴루스", Denebola: "데네볼라", Spica: "스피카", Arcturus: "아크투루스",
  "Proxima Centauri": "프록시마 센타우리", Antares: "안타레스", Arrakis: "아라키스", Vega: "베가",
  Altair: "알타이르", Deneb: "데네브", Scheat: "쉐아트", Alpheratz: "알페라츠", Caph: "카프", Algenib: "알게닙",
  Schemali: "셰말리", Ankaa: "앙카", Shedir: "셰다르", Schedir: "셰다르", Diphda: "디프다", Achird: "아키르드",
  "Van Maanen's Star": "판 마넌 별", Tsih: "치", Mirach: "미라크", "Luyten 725-32": "뤼텐 725-32", Adhil: "아딜",
  Ruchbah: "루흐바", Achernar: "아케르나르", "Baten Kaitos": "바텐 카이토스", Elmuthalleth: "엘무탈레트",
  Mesarthim: "메사르팀", Segin: "세긴", Sheratan: "셰라탄", "Al Rescha": "알 레샤", Almaak: "알마크", Hamal: "하말",
  Mira: "미라", Kaffaljidhmah: "카팔지드마", Angetenar: "앙게테나르", Azha: "아자", Acamar: "아카마르",
  Menkar: "멩카르", Algol: "알골", Botein: "보테인", Mirphak: "미르파크", Rana: "라나", Atik: "아틱",
  Celaeno: "켈라이노", Electra: "엘렉트라", Taygeta: "타이게타", Maia: "마이아", Asterope: "아스테로페",
  Merope: "메로페", Alcyone: "알키오네", Atlas: "아틀라스", Pleione: "플레이오네", Zaurak: "자우라크",
  Menkib: "멩키브", Beid: "베이드", Keid: "케이드", "Primus Hyadum": "프리무스 히아둠", Ain: "아인",
  Kabdhilinan: "카브딜리난", "Hind's Crimson Star": "힌드의 진홍색 별", Maaz: "마아즈", Sadatoni: "사다토니",
  Cursa: "쿠르사", "Kapteyn's Star": "카프타인 별", Capella: "카펠라", Alnath: "알나트", Nihal: "니할",
  Thabit: "타비트", Mintaka: "민타카", Arneb: "아르네브", Heka: "헤카", "Na'ir al Saif": "나이르 알 사이프",
  Alnilam: "알닐람", Phact: "파크트", Alnitak: "알니타크", Saiph: "사이프", Wazn: "와즌", Tsze: "쯔",
  Prijipati: "프리지파티", Menkalinan: "멘칼리난", Tejat: "테자트", Furud: "푸루드", Mirzam: "미르잠",
  "Tejat posterior": "테자트 포스테리오르", Alhena: "알헤나", Mebsuta: "멥수타", Adara: "아다라",
  Muliphein: "물리페인", Mekbuda: "멕부다", Wezen: "웨젠", Wasat: "와사트", Aludra: "알루드라", Gomeisa: "고메이사",
  "Luyten's Star": "뤼텐 별", Castor: "카스토르", Pollux: "폴룩스", Asmidiske: "아스미디스케", Naos: "나오스",
  Regor: "레고르", Tegmine: "테그민", "Al Tarf": "알 타르프", Avior: "아비오르", Muscida: "무시다",
  "Minhar al Shuja": "민하르 알 슈자", "Asellus Borealis": "아셀루스 보레알리스",
  "Asellus Australis": "아셀루스 아우스트랄리스", Acubens: "아쿠벤스", "Talitha Borealis": "탈리타 보레알리스",
  "Talitha Australis": "탈리타 아우스트랄리스", Suhail: "수하일", Miaplacidus: "미아플라시두스",
  Aspidiske: "아스피디스케", Alphard: "알파르드", Ukdah: "우크다", Alterf: "알테르프", "Al Haud": "알 하우드",
  Subra: "수브라", "Ras Elased Australis": "라스 엘라세드 아우스트랄리스", Rasalas: "라살라스",
  "Tseen Ke": "첸 케", Adhafera: "아드하페라", "Tania Borealis": "타니아 보레알리스", Algieba: "알기에바",
  "Tania Australis": "타니아 아우스트랄리스", Praecipula: "프라이키풀라", Alkes: "알케스", Merak: "메라크",
  Dubhe: "두베", Zosma: "조스마", Chertan: "체르탄", "Alula Borealis": "알룰라 보레알리스",
  "Tsze Tseang": "쯔 짱", Giausar: "지아우사르", Zavijava: "자비자바", "Groombridge 1830": "그룸브리지 1830",
  Phecda: "페크다", Alchiba: "알키바", Megrez: "메그레즈", Gienah: "기에나", Zaniah: "자니아", Acrux: "아크룩스",
  Algorab: "알고라브", Gacrux: "가크룩스", Chara: "카라", Kraz: "크라즈", Muhlifain: "무흘리파인",
  Porrima: "포리마", Mimosa: "미모사", Alioth: "알리오스", Minelauva: "미넬라우바", "Cor Caroli": "코르 카롤리",
  Vindemiatrix: "빈데미아트릭스", Mizar: "미자르", Alcor: "알코르", Heze: "헤제", Alkor: "알코르",
  Benetnasch: "베네트나슈", Muphrid: "무프리드", Agena: "아게나", Thuban: "투반", Menkent: "멘켄트",
  Syrma: "시르마", Seginus: "세기누스", "Rigel Kentaurus": "리겔 켄타우루스", Men: "멘", Izar: "이자르",
  Kocab: "코카브", Zubenelgenubi: "주벤엘게누비", "Ke Kwan": "케 콴", "Zuben Elakribi": "주벤 엘아크리비",
  Nekkar: "네카르", Zubeneschamali: "주벤에스카말리", Pherkad: "페르카드", Alkalurops: "알칼루롭스",
  Edasich: "에다시크", Nusakan: "누사칸", Alphekkai: "알페카", "Zuben Elakrab": "주벤 엘아크라브",
  Zubenhakrabi: "주벤하크라비", Unuk: "우누크", Chow: "초우", Dschubba: "드슈바", Graffias: "그라피아스",
  Maasim: "마아심", Jabbah: "자바", "Yed prior": "예드 프리오르", "Yed posterior": "예드 포스테리오르",
  "Al Niyat": "알 니야트", Cujam: "쿠잠", Kornephoros: "코르네포로스", Marfik: "마르픽", Atria: "아트리아",
  Sabik: "사빅", Rasalgethi: "라스알게티", Sarin: "사린", Rastaban: "라스타반", Maasym: "마아심",
  Lesath: "레사트", Tchou: "초우", Kuma: "쿠마", Yildun: "일둔", Shaula: "샤울라", Rasalhague: "라살하게",
  Sargas: "사르가스", Dziban: "지반", Cebalrai: "세발라이", Grumium: "그루미움", Etamin: "에타민",
  "Barnard's Star": "바너드 별", Alnasl: "알나슬", "Kaus Media": "카우스 메디아",
  "Kaus Australis": "카우스 아우스트랄리스", "Al Athfar": "알 아트파르", "Kaus Borealis": "카우스 보레알리스",
  Sheliak: "셸리악", Nunki: "눈키", Alya: "알리아", Sulafat: "술라파트", Ascella: "아셀라",
  "Deneb el Okab": "데네브 엘 오카브", "Al Thalimain 1": "알 탈리마인 1", "Al Thalimain 2": "알 탈리마인 2",
  Altais: "알타이스", Aladfar: "알라드파르", Arkab: "아르카브", Rukbat: "룩바트", Albireo: "알비레오",
  Alsafi: "알사피", Sham: "샴", Tarazed: "타라제드", "Kin Yu": "킨 유", Alshain: "알샤인", Algedi: "알게디",
  Dabih: "다비", "Al Dhanab al Dulfim": "알 다납 알 둘핌", Rotanev: "로타네브", Sualocin: "수알로신",
  Albali: "알발리", Kitalpha: "키탈파", Alderamin: "알데라민", Alfirk: "알피르크", Sadalsuud: "사달수드",
  Nashira: "나시라", Azelfafage: "아젤파파게", "The Garnet Star": "석류석 별", Enif: "에니프",
  "Deneb Algedi": "데네브 알게디", "Al Dhanab": "알 다납", Kurhah: "쿠르하", Sadalmelik: "사달멜리크",
  Alnair: "알나이르", Biham: "비함", Ancha: "안카", Sadachbia: "사다크비아", Seat: "시트", Homam: "호맘",
  Matar: "마타르", Sadalbari: "사달바리", Skat: "스카트", Fomalhaut: "포말하우트", "Fum al Samakah": "품 알 사마카",
  Markab: "마르카브", Situla: "시툴라", Errai: "에라이", Omg: "ω",
};

// 천구 엔진의 천체 이름표(소문자 id).
const BODIES = {
  sun: "태양", mercury: "수성", venus: "금성", earth: "지구", moon: "달", webb: "제임스 웹 우주망원경",
  mars: "화성", phobos: "포보스", deimos: "데이모스", jupiter: "목성", io: "이오", europa: "유로파",
  ganymede: "가니메데", callisto: "칼리스토", saturn: "토성", titan: "타이탄", rhea: "레아", dione: "디오네",
  tethys: "테티스", iapetus: "이아페투스", hyperion: "히페리온", janus: "야누스", enceladus: "엔셀라두스",
  mimas: "미마스", uranus: "천왕성", titania: "티타니아", oberon: "오베론", umbriel: "움브리엘", ariel: "아리엘",
  miranda: "미란다", neptune: "해왕성", triton: "트리톤", proteus: "프로테우스", pluto: "명왕성", charon: "카론",
  ceres: "세레스", eris: "에리스", haumea: "하우메아", makemake: "마케마케",
};

const SERPENS_PART = { Caput: "머리", Cauda: "꼬리" };

const byAbbreviation = new Map(CONSTELLATIONS.map(([abbr, , ko]) => [abbr.toLowerCase(), ko]));
const byEnglish = new Map(CONSTELLATIONS.map(([, en, ko]) => [en, ko]));
const stars = new Map(Object.entries(STARS));
const bodies = new Map(Object.entries(BODIES));

const BAYER = /^(?:([A-Za-z]{2,3})|([α-ω]))(\d{0,2}) ([A-Za-z]{3})(?: ([A-Z]))?$/;
const FLAMSTEED = /^(\d{1,3}) ([A-Za-z]{3})(?: ([A-Z]))?$/;
const LATIN = /^([A-Za-z]{1,2}) ([A-Za-z]{3})(?: ([A-Z]))?$/;
const GLIESE = /^Gliese (.+)$/;
const COMPONENT = /^(.+) ([AB])$/;

function constellation(abbr) {
  return byAbbreviation.get(abbr.toLowerCase()) ?? null;
}

function derive(text) {
  if (stars.has(text)) return stars.get(text);
  if (byEnglish.has(text)) return byEnglish.get(text);
  const serpens = /^Serpens (Caput|Cauda)$/.exec(text);
  if (serpens) return `뱀자리(${SERPENS_PART[serpens[1]]})`;
  const body = bodies.get(text.toLowerCase());
  if (body) return body;
  const gliese = GLIESE.exec(text);
  if (gliese) return `글리제 ${gliese[1]}`;
  const bayer = BAYER.exec(text);
  const hasGreek = bayer && (bayer[2] || GREEK[bayer[1].toUpperCase()]);
  if (bayer && hasGreek && constellation(bayer[4])) {
    const letter = bayer[2] || GREEK[bayer[1].toUpperCase()];
    return `${constellation(bayer[4])} ${letter}${bayer[3]}${bayer[5] ? ` ${bayer[5]}` : ""}`;
  }
  const flamsteed = FLAMSTEED.exec(text);
  if (flamsteed && constellation(flamsteed[2])) {
    return `${constellation(flamsteed[2])} ${flamsteed[1]}번${flamsteed[3] ? ` ${flamsteed[3]}` : ""}`;
  }
  const latin = LATIN.exec(text);
  if (latin && constellation(latin[2])) {
    return `${constellation(latin[2])} ${latin[1]}${latin[3] ? ` ${latin[3]}` : ""}`;
  }
  const component = COMPONENT.exec(text);
  if (component) {
    const base = derive(component[1]);
    if (base) return `${base} ${component[2]}`;
  }
  return null;
}

const cache = new Map();

/**
 * 영어 이름표를 한국어로. 모르는 이름이면 받은 글자를 그대로 돌려준다.
 *
 * @param {string} text 이름표의 글자
 * @returns {string}
 */
export function koName(text) {
  if (typeof text !== "string" || text.length === 0) return text;
  const cached = cache.get(text);
  if (cached !== undefined) return cached;
  const clean = text.replace(/\r/g, "").trim();
  const ko = (clean && derive(clean)) || text;
  cache.set(text, ko);
  return ko;
}

/**
 * 캔버스가 글자를 재고 그릴 때 이름을 한국어로 바꾸게 한다. 이름표(SpriteSheet)는 글자를 캔버스에 그려
 * 텍스처로 쓰므로, 여기서 바꾸면 별·별자리·천체 이름표가 모두 한국어가 된다.
 * 잴 때는 영어와 한국어 중 넓은 쪽을 돌려줘서 이름표 칸이 모자라지 않게 한다.
 */
export function koreanizeCanvasText() {
  for (const Context of [globalThis.CanvasRenderingContext2D, globalThis.OffscreenCanvasRenderingContext2D]) {
    const proto = Context?.prototype;
    if (!proto || proto.__koreanized) continue;
    proto.__koreanized = true;
    const fill = proto.fillText;
    const stroke = proto.strokeText;
    const measure = proto.measureText;
    proto.fillText = function(text, ...rest) {
      return fill.call(this, koName(text), ...rest);
    };
    proto.strokeText = function(text, ...rest) {
      return stroke.call(this, koName(text), ...rest);
    };
    proto.measureText = function(text) {
      const ko = koName(text);
      const result = measure.call(this, ko);
      if (ko === text) return result;
      const original = measure.call(this, text);
      return original.width > result.width ? original : result;
    };
  }
}
