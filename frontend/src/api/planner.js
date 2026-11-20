import { Equator, Horizon, Observer } from "astronomy-engine";

const BODY_NAMES = {
  mercury: "Mercury", venus: "Venus", moon: "Moon", mars: "Mars",
  jupiter: "Jupiter", saturn: "Saturn", uranus: "Uranus", neptune: "Neptune",
};
const PLACES = [
  { place_id: "seoul-forest", name: "서울숲", latitude: 37.5444, longitude: 127.0374 },
  { place_id: "namsan", name: "남산", latitude: 37.5512, longitude: 126.9882 },
  { place_id: "seoul", name: "서울", latitude: 37.5665, longitude: 126.9780 },
];

async function findPlaces(query) {
  const local = PLACES.filter((place) => place.name.includes(query) || query.includes(place.name));
  if (local.length) return local;
  try {
    const params = new URLSearchParams({ q: query, format: "jsonv2", limit: "5", "accept-language": "ko" });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error();
    return (await response.json()).map((item) => ({
      place_id: String(item.place_id), name: item.display_name.split(",")[0],
      latitude: Number(item.lat), longitude: Number(item.lon),
    }));
  } catch {
    return [];
  }
}

async function getWeather(latitude, longitude, date) {
  try {
    const params = new URLSearchParams({
      latitude: String(latitude), longitude: String(longitude),
      hourly: "cloud_cover,precipitation_probability,precipitation",
      timezone: "Asia/Seoul", forecast_days: "16",
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!response.ok) throw new Error();
    const data = await response.json();
    let index = 0, nearest = Infinity;
    data.hourly.time.forEach((value, candidate) => {
      const distance = Math.abs(new Date(value).getTime() - date.getTime());
      if (distance < nearest) { nearest = distance; index = candidate; }
    });
    return {
      available: true, cloud_cover_pct: data.hourly.cloud_cover[index],
      precipitation_probability_pct: data.hourly.precipitation_probability[index],
      precipitation_mm: data.hourly.precipitation[index],
      source: "Open-Meteo",
    };
  } catch {
    return { available: false };
  }
}

export async function postSky(body) {
  if (body.purpose === "place") {
    const places = await findPlaces(body.place_query || "");
    return places.length ? { ok: true, places } : { ok: false, places: [], error: { message: "장소를 찾지 못했습니다. 위도와 경도를 직접 입력해 주세요." } };
  }
  const date = new Date(body.time);
  const latitude = Number(body.latitude), longitude = Number(body.longitude);
  if (Number.isNaN(date.getTime()) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { ok: false, error: { message: "시각과 좌표를 확인해 주세요." } };
  }
  const targetId = BODY_NAMES[body.target_id] ? body.target_id : "jupiter";
  const observer = new Observer(latitude, longitude, Number(body.elevation_m) || 0);
  const equator = Equator(BODY_NAMES[targetId], date, observer, true, true);
  const horizontal = Horizon(date, observer, equator.ra, equator.dec, "normal");
  const weather = await getWeather(latitude, longitude, date);
  return {
    ok: true, target_id: targetId,
    bodies: [{ target_id: targetId, azimuth_deg: horizontal.azimuth, altitude_deg: horizontal.altitude }],
    weather, source: "astronomy-engine",
  };
}

// JPL Horizons는 CORS를 허용하지 않는다. 주요 행성은 천구 엔진이 직접 계산하고,
// 이 목록은 최신 소천체를 제공하지 못한다는 사실을 UI가 알 수 있게 빈 성공 응답으로 둔다.
export function getSkyBodies({ start, hours = 720, stepMinutes = 120 }) {
  return Promise.resolve({
    ok: true, start, step_minutes: stepMinutes, count: Math.floor((hours * 60) / stepMinutes) + 1,
    bodies: [], unavailable: ["실시간 소천체 위치는 JPL Horizons의 브라우저 CORS 제한으로 정적 배포에서 제외됩니다."],
  });
}

export function getSkyOrbit({ body, epoch }) {
  return Promise.resolve({ ok: false, body, epoch, error: { message: "정적 배포에서는 실시간 소천체 궤도를 조회할 수 없습니다." } });
}
