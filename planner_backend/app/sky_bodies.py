"""천구에 올릴 태양계 천체의 하늘 위치(JPL Horizons)와 궤도선.

천구 엔진이 직접 그리는 천체(태양·행성·달·명왕성·갈릴레이 위성 등)는 여기에 없다. 이 목록은 태양계 화면에
있으면서 천구 엔진에는 없는 천체이며, Horizons가 천구 위치를 주는 것만 담았다.
지구 궤도를 도는 우주선(국제우주정거장·톈궁·허블)은 관측자 위치에 따라 하늘 위치가 크게 달라지고,
Horizons에 시각 범위·대상이 없는 다프니스·히이아카·나마카는 뺐다.

Horizons는 브라우저에서 바로 부를 수 없으므로(CORS 없음) 이 백엔드가 대신 부르고 메모리에 캐시한다.
"""
from __future__ import annotations

import math
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import requests

from app.config import settings
from app.tools.horizons import URL, _horizons_stamp

PROVIDER = "jpl_horizons"
MAX_SAMPLES = 800
WORKERS = 4
RETRIES = 2
ORBIT_POINTS = 241
# 위성 궤도의 중심(Horizons 천체 번호).
PARENT_COMMANDS = {"jupiter": "599", "saturn": "699", "uranus": "799", "neptune": "899", "pluto": "999"}
CATEGORY_LABELS = {"satellite": "위성", "dwarf": "왜소행성", "asteroid": "소행성", "comet": "혜성", "craft": "탐사선"}


@dataclass(frozen=True)
class SkyBody:
    body_id: str
    ko: str
    en: str
    category: str
    command: str
    parent: str | None
    wikidata_id: str


BODIES: tuple[SkyBody, ...] = (
    SkyBody("ceres", "세레스", "Ceres", "dwarf", "1;", None, "Q596"),
    SkyBody("eris", "에리스", "Eris", "dwarf", "136199;", None, "Q611"),
    SkyBody("haumea", "하우메아", "Haumea", "dwarf", "136108;", None, "Q601"),
    SkyBody("makemake", "마케마케", "Makemake", "dwarf", "136472;", None, "Q604"),
    SkyBody("sedna", "세드나", "Sedna", "dwarf", "90377;", None, "Q15610"),
    SkyBody("quaoar", "콰오아", "Quaoar", "dwarf", "50000;", None, "Q15586"),
    SkyBody("orcus", "오르쿠스", "Orcus", "dwarf", "90482;", None, "Q15603"),
    SkyBody("gonggong", "공공", "Gonggong", "dwarf", "225088;", None, "Q6587"),
    SkyBody("salacia", "살라시아", "Salacia", "dwarf", "120347;", None, "Q136964"),
    SkyBody("varuna", "바루나", "Varuna", "dwarf", "20000;", None, "Q15609"),
    SkyBody("ixion", "익시온", "Ixion", "dwarf", "28978;", None, "Q15591"),
    SkyBody("vesta", "베스타", "Vesta", "asteroid", "4;", None, "Q3030"),
    SkyBody("pallas", "팔라스", "Pallas", "asteroid", "2;", None, "Q3002"),
    SkyBody("psyche", "프시케", "Psyche", "asteroid", "16;", None, "Q107517"),
    SkyBody("bennu", "베누", "Bennu", "asteroid", "101955;", None, "Q11558"),
    SkyBody("ryugu", "류구", "Ryugu", "asteroid", "162173;", None, "Q1385178"),
    SkyBody("eros", "에로스", "Eros", "asteroid", "433;", None, "Q16711"),
    SkyBody("itokawa", "이토카와", "Itokawa", "asteroid", "25143;", None, "Q149374"),
    SkyBody("apophis", "아포피스", "Apophis", "asteroid", "99942;", None, "Q118931"),
    SkyBody("kleopatra", "클레오파트라", "Kleopatra", "asteroid", "216;", None, "Q147891"),
    SkyBody("hygiea", "히기에이아", "Hygiea", "asteroid", "10;", None, "Q2640"),
    SkyBody("sylvia", "실비아", "Sylvia", "asteroid", "87;", None, "Q107673"),
    SkyBody("davida", "다비다", "Davida", "asteroid", "511;", None, "Q155017"),
    SkyBody("arrokoth", "아로코트", "Arrokoth", "asteroid", "486958;", None, "Q18325885"),
    SkyBody("chiron", "키론", "Chiron", "asteroid", "2060;", None, "Q15611"),
    SkyBody("chariklo", "카리클로스", "Chariklo", "asteroid", "10199;", None, "Q11559"),
    SkyBody("pholus", "폴루스", "Pholus", "asteroid", "5145;", None, "Q155042"),
    SkyBody("nessus", "네소스", "Nessus", "asteroid", "7066;", None, "Q156664"),
    SkyBody("halley", "핼리", "Halley", "comet", "DES=1P;CAP", None, "Q23054"),
    SkyBody("tempel-1", "템펠 1", "Tempel 1", "comet", "DES=9P;CAP", None, "Q334755"),
    SkyBody("herschel-rigollet", "허셜–리골렛", "Herschel-Rigollet", "comet", "DES=35P;CAP", None, "Q2447889"),
    SkyBody("churyumov-gerasimenko", "추류모프–게라시멘코", "Churyumov-Gerasimenko", "comet", "DES=67P;CAP", None, "Q844672"),
    SkyBody("encke", "엥케", "Encke", "comet", "DES=2P;CAP", None, "Q166940"),
    SkyBody("hale-bopp", "헤일-밥", "Hale-Bopp", "comet", "DES=C/1995 O1;CAP", None, "Q69854"),
    SkyBody("hyakutake", "햐쿠타케", "Hyakutake", "comet", "DES=C/1996 B2;CAP", None, "Q16741"),
    SkyBody("borrelly", "보렐리", "Borrelly", "comet", "DES=19P;CAP", None, "Q8616"),
    SkyBody("voyager-1", "보이저 1호", "Voyager 1", "craft", "-31", None, "Q48469"),
    SkyBody("voyager-2", "보이저 2호", "Voyager 2", "craft", "-32", None, "Q48475"),
    SkyBody("new-horizons", "뉴호라이즌스", "New Horizons", "craft", "-98", None, "Q48461"),
    SkyBody("juno", "주노", "Juno", "craft", "-61", None, "Q48546"),
    SkyBody("pioneer-10", "파이오니어 10호", "Pioneer 10", "craft", "-23", None, "Q59103"),
    SkyBody("pioneer-11", "파이오니어 11호", "Pioneer 11", "craft", "-24", None, "Q59113"),
    SkyBody("metis", "메티스", "Metis", "satellite", "516", "jupiter", "Q16755"),
    SkyBody("adrastea", "아드라스테아", "Adrastea", "satellite", "515", "jupiter", "Q16757"),
    SkyBody("amalthea", "아말테아", "Amalthea", "satellite", "505", "jupiter", "Q3257"),
    SkyBody("thebe", "테베", "Thebe", "satellite", "514", "jupiter", "Q16765"),
    SkyBody("pan", "판", "Pan", "satellite", "618", "saturn", "Q17705"),
    SkyBody("atlas", "아틀라스", "Atlas", "satellite", "615", "saturn", "Q17707"),
    SkyBody("prometheus", "프로메테우스", "Prometheus", "satellite", "616", "saturn", "Q17739"),
    SkyBody("pandora", "판도라", "Pandora", "satellite", "617", "saturn", "Q17746"),
    SkyBody("epimetheus", "에피메테우스", "Epimetheus", "satellite", "611", "saturn", "Q17751"),
    SkyBody("aegaeon", "아이가이온", "Aegaeon", "satellite", "653", "saturn", "Q17762"),
    SkyBody("mimas", "미마스", "Mimas", "satellite", "601", "saturn", "Q15034"),
    SkyBody("enceladus", "엔셀라두스", "Enceladus", "satellite", "602", "saturn", "Q3303"),
    SkyBody("ariel", "아리엘", "Ariel", "satellite", "701", "uranus", "Q3343"),
    SkyBody("miranda", "미란다", "Miranda", "satellite", "705", "uranus", "Q3352"),
    SkyBody("umbriel", "움브리엘", "Umbriel", "satellite", "702", "uranus", "Q3338"),
    SkyBody("puck", "퍽", "Puck", "satellite", "715", "uranus", "Q15662"),
    SkyBody("larissa", "라리사", "Larissa", "satellite", "807", "neptune", "Q19471"),
    SkyBody("nereid", "네레이드", "Nereid", "satellite", "802", "neptune", "Q16076"),
    SkyBody("nix", "닉스", "Nix", "satellite", "902", "pluto", "Q102694"),
)
_BY_ID = {item.body_id: item for item in BODIES}
_EPHEMERIS_CACHE: dict[tuple, dict] = {}
_ORBIT_CACHE: dict[tuple, dict] = {}
_LOCK = threading.Lock()


def clear_sky_body_cache() -> None:
    with _LOCK:
        _EPHEMERIS_CACHE.clear()
        _ORBIT_CACHE.clear()


def get_body(body_id: str) -> SkyBody | None:
    return _BY_ID.get(body_id)


def public_body(body: SkyBody) -> dict:
    return {"id": body.body_id, "ko": body.ko, "en": body.en, "category": body.category, "parent": body.parent, "wikidata_id": body.wikidata_id}


def _get(params: dict) -> str:
    """Horizons 한 번 호출. 가끔 빈 응답이 와서 몇 번 다시 시도한다."""
    last: Exception | None = None
    for attempt in range(RETRIES + 1):
        try:
            response = requests.get(URL, params={"format": "json", **params}, timeout=settings.tool_timeout_sec)
            if response.status_code >= 400:
                raise RuntimeError(f"status {response.status_code}")
            return response.json().get("result") or ""
        except (requests.RequestException, ValueError, RuntimeError) as error:
            last = error
            time.sleep(0.4 * (attempt + 1))
    raise RuntimeError("horizons unavailable") from last


def _soe_rows(text: str) -> tuple[list[str], list[list[str]]]:
    """$$SOE ~ $$EOE 사이의 CSV 행들과, 그 앞의 열 이름 줄."""
    if "$$SOE" not in text or "$$EOE" not in text:
        return [], []
    head, rest = text.split("$$SOE", 1)
    names: list[str] = []
    for line in head.splitlines():
        if "," in line and ("Date" in line or "JDTDB" in line):
            names = [part.strip() for part in line.split(",")]
    rows = [[part.strip() for part in line.split(",")] for line in rest.split("$$EOE", 1)[0].splitlines() if line.strip()]
    return names, rows


def _number(value: str) -> float | None:
    try:
        number = float(value)
    except ValueError:
        return None
    return number if math.isfinite(number) else None


def parse_observer_rows(text: str) -> dict | None:
    """OBSERVER 천문력(QUANTITIES 1,9,20, 각도는 도)에서 적경·적위·지구와의 거리·겉보기 등급을 읽는다."""
    _names, rows = _soe_rows(text)
    ra: list[float] = []
    dec: list[float] = []
    delta = None
    magnitude = None
    for row in rows:
        if len(row) < 8:
            continue
        right_ascension, declination = _number(row[3]), _number(row[4])
        if right_ascension is None or declination is None:
            return None
        ra.append(round(right_ascension, 5))
        dec.append(round(declination, 5))
        if delta is None:
            delta = _number(row[7])
            magnitude = _number(row[5])
    if not ra:
        return None
    return {"ra": ra, "dec": dec, "delta_au": delta, "magnitude": magnitude}


def _aligned(moment: datetime, step_minutes: int) -> datetime:
    """step_minutes 간격의 격자(그날 0시 기준)에 내림해서 맞춘다. 같은 격자는 캐시를 함께 쓴다."""
    utc = moment.astimezone(timezone.utc)
    day_minutes = utc.hour * 60 + utc.minute
    return utc.replace(second=0, microsecond=0) - timedelta(minutes=day_minutes % step_minutes)


def fetch_body_ephemeris(body: SkyBody, start: datetime, count: int, step_minutes: int) -> dict:
    """지구 중심에서 본 한 천체의 적경·적위(J2000, 도) 표. start부터 step_minutes 간격으로 count개."""
    key = (body.command, _horizons_stamp(start), count, step_minutes)
    with _LOCK:
        cached = _EPHEMERIS_CACHE.get(key)
    if cached:
        return cached
    stop = start + timedelta(minutes=step_minutes * (count - 1))
    text = _get({
        "COMMAND": f"'{body.command}'",
        "OBJ_DATA": "NO",
        "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "OBSERVER",
        "CENTER": "'500@399'",
        "START_TIME": f"'{_horizons_stamp(start)}'",
        "STOP_TIME": f"'{_horizons_stamp(stop)}'",
        "STEP_SIZE": f"'{step_minutes} m'",
        "QUANTITIES": "'1,9,20'",
        "CSV_FORMAT": "YES",
        "ANG_FORMAT": "DEG",
    })
    parsed = parse_observer_rows(text)
    if parsed is None or len(parsed["ra"]) != count:
        reason = next((line.strip() for line in reversed(text.strip().splitlines()) if line.strip()), "empty") if text else "empty"
        raise LookupError(reason[:160])
    with _LOCK:
        _EPHEMERIS_CACHE[key] = parsed
    return parsed


def build_sky_bodies(start: datetime, hours: float, step_minutes: int) -> dict:
    """등록된 모든 천체의 천구 위치 표. 못 구한 천체는 unavailable에 이유와 함께 둔다(값을 만들지 않는다)."""
    if start.tzinfo is None:
        return {"ok": False, "error": {"code": "INVALID_INPUT", "message": "시각에는 시간대가 필요합니다."}}
    if step_minutes < 5 or step_minutes > 24 * 60 or hours <= 0:
        return {"ok": False, "error": {"code": "INVALID_INPUT", "message": "조회 구간이 올바르지 않습니다."}}
    count = int(hours * 60 // step_minutes) + 1
    if count < 2 or count > MAX_SAMPLES:
        return {"ok": False, "error": {"code": "INVALID_INPUT", "message": f"표본은 2개 이상 {MAX_SAMPLES}개 이하여야 합니다."}}
    first = _aligned(start, step_minutes)
    found: list[dict] = []
    missing: list[dict] = []

    def one(body: SkyBody):
        try:
            return body, fetch_body_ephemeris(body, first, count, step_minutes), None
        except Exception as error:  # 한 천체가 실패해도 나머지는 돌려준다
            return body, None, str(error) or "천문력을 읽지 못했습니다."

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for body, data, error in pool.map(one, BODIES):
            if data is None:
                missing.append({"id": body.body_id, "reason": error})
            else:
                found.append({**public_body(body), **data})
    if not found:
        return {"ok": False, "error": {"code": "EPHEMERIS_UNAVAILABLE", "message": "Horizons에서 천체 위치를 받지 못했습니다."}}
    return {
        "ok": True,
        "source": PROVIDER,
        "reference": URL,
        "start": first.isoformat(),
        "step_minutes": step_minutes,
        "count": count,
        "bodies": found,
        "unavailable": missing,
    }


def kepler_polyline(eccentricity: float, semi_major_au: float, inclination_deg: float, node_deg: float, periapsis_deg: float, points: int = ORBIT_POINTS) -> list[float]:
    """궤도 요소(황도 J2000)로 닫힌 타원을 xyz(AU, 중심 천체 기준)로 이어 붙인다."""
    if not (0 <= eccentricity < 1) or semi_major_au <= 0:
        raise ValueError("closed orbit required")
    i, node, peri = (math.radians(value) for value in (inclination_deg, node_deg, periapsis_deg))
    cos_n, sin_n, cos_i, sin_i, cos_w, sin_w = math.cos(node), math.sin(node), math.cos(i), math.sin(i), math.cos(peri), math.sin(peri)
    minor = semi_major_au * math.sqrt(1 - eccentricity ** 2)
    out: list[float] = []
    for k in range(points):
        anomaly = 2 * math.pi * k / (points - 1)
        x = semi_major_au * (math.cos(anomaly) - eccentricity)
        y = minor * math.sin(anomaly)
        px = cos_w * x - sin_w * y
        py = sin_w * x + cos_w * y
        out.extend((
            round(cos_n * px - sin_n * cos_i * py, 10),
            round(sin_n * px + cos_n * cos_i * py, 10),
            round(sin_i * py, 10),
        ))
    return out


def parse_elements(text: str) -> dict | None:
    names, rows = _soe_rows(text)
    if not names or not rows:
        return None
    row = rows[0]
    values = {name: _number(row[index]) for index, name in enumerate(names) if index < len(row) and name}
    if any(values.get(key) is None for key in ("EC", "IN", "OM", "W", "A")):
        return None
    return values


def build_sky_orbit(body_id: str, epoch: datetime) -> dict:
    """한 천체의 궤도선(타원). 위성은 모행성 중심, 나머지는 태양 중심이다. 닫힌 궤도가 아니면 실패한다."""
    body = get_body(body_id)
    if body is None:
        return {"ok": False, "error": {"code": "TARGET_NOT_FOUND", "message": "등록되지 않은 천체입니다."}}
    if epoch.tzinfo is None:
        return {"ok": False, "error": {"code": "INVALID_INPUT", "message": "시각에는 시간대가 필요합니다."}}
    day = epoch.astimezone(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    # 궤도 요소는 한 달 안에서는 눈에 띄게 변하지 않아, 30일 단위로 캐시한다.
    key = (body.body_id, int(day.timestamp() // (30 * 86400)))
    with _LOCK:
        cached = _ORBIT_CACHE.get(key)
    if cached:
        return cached
    center = f"500@{PARENT_COMMANDS[body.parent]}" if body.parent else "500@10"
    try:
        text = _get({
            "COMMAND": f"'{body.command}'",
            "OBJ_DATA": "NO",
            "MAKE_EPHEM": "YES",
            "EPHEM_TYPE": "ELEMENTS",
            "CENTER": f"'{center}'",
            "START_TIME": f"'{_horizons_stamp(day)}'",
            "STOP_TIME": f"'{_horizons_stamp(day + timedelta(days=1))}'",
            "STEP_SIZE": "'1 d'",
            "OUT_UNITS": "'AU-D'",
            "REF_PLANE": "'ECLIPTIC'",
            "CSV_FORMAT": "YES",
        })
    except Exception:
        return {"ok": False, "error": {"code": "ORBIT_UNAVAILABLE", "message": "궤도 요소를 읽지 못했습니다."}}
    elements = parse_elements(text)
    if elements is None:
        return {"ok": False, "error": {"code": "ORBIT_UNAVAILABLE", "message": "궤도 요소를 읽지 못했습니다."}}
    try:
        points = kepler_polyline(elements["EC"], elements["A"], elements["IN"], elements["OM"], elements["W"])
    except ValueError:
        return {"ok": False, "error": {"code": "NO_CLOSED_ORBIT", "message": "이 천체는 닫힌 궤도가 아니어서(쌍곡선 등) 궤도선을 그리지 않습니다."}}
    result = {
        "ok": True,
        "source": PROVIDER,
        "id": body.body_id,
        "center": body.parent or "sun",
        "epoch": day.isoformat(),
        "elements": {"eccentricity": elements["EC"], "semi_major_au": elements["A"], "inclination_deg": elements["IN"]},
        "points": points,
    }
    with _LOCK:
        _ORBIT_CACHE[key] = result
    return result
