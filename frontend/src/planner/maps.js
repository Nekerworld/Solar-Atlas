// Google Maps Embed API 주소를 만든다. 키는 브라우저에 노출되므로 서버용 키와 따로, 리퍼러로 제한한 임베드 전용 키를 쓴다.
const EMBED = "https://www.google.com/maps/embed/v1";

export const EMBED_KEY = (import.meta.env.VITE_GOOGLE_MAPS_EMBED_KEY || "").trim();

export const TRAVEL_MODES = [
  { id: "driving", label: "자동차" },
  { id: "walking", label: "도보" },
  { id: "transit", label: "대중교통" },
];

const finite = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

/** 계획에 저장된 좌표가 있는지(0,0 같은 빈 값은 제외하지 않고 null만 거른다). */
export function hasCoordinates(plan) {
  return finite(plan?.latitude) && finite(plan?.longitude);
}

/** 지도에서 장소를 가리키는 값: 장소 ID, 없으면 좌표, 없으면 이름. 모두 없으면 빈 문자열. */
export function placeRef(plan) {
  if (plan?.place_id) return `place_id:${plan.place_id}`;
  if (hasCoordinates(plan)) return `${Number(plan.latitude)},${Number(plan.longitude)}`;
  return String(plan?.place_name || "").trim();
}

export function embedPlaceUrl(plan, key = EMBED_KEY) {
  const ref = placeRef(plan);
  if (!key || !ref) return "";
  return `${EMBED}/place?key=${encodeURIComponent(key)}&q=${encodeURIComponent(ref)}&zoom=15&language=ko`;
}

/**
 * 내 현재 위치에서 장소까지의 길찾기. 출발지는 브라우저가 알려 준 실제 위치만 받는다.
 * 위치가 없으면 서울 같은 기본값으로 대신하지 않고 빈 문자열을 돌려준다.
 */
export function embedDirectionsUrl(plan, origin, mode = "driving", key = EMBED_KEY) {
  const destination = placeRef(plan);
  if (!key || !destination || !origin || !finite(origin.latitude) || !finite(origin.longitude)) return "";
  const travel = TRAVEL_MODES.some((item) => item.id === mode) ? mode : "driving";
  const from = `${Number(origin.latitude)},${Number(origin.longitude)}`;
  return `${EMBED}/directions?key=${encodeURIComponent(key)}&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(destination)}&mode=${travel}&language=ko`;
}

/** 키 없이 열 수 있는 구글 지도 링크(새 탭). */
export function openMapsUrl(plan) {
  const ref = placeRef(plan);
  if (!ref) return "";
  const id = plan?.place_id ? `&query_place_id=${encodeURIComponent(plan.place_id)}` : "";
  const query = hasCoordinates(plan) ? `${Number(plan.latitude)},${Number(plan.longitude)}` : String(plan?.place_name || "").trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}${id}`;
}
