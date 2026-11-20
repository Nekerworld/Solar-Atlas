import { reactive } from "vue";

// 관측 장소를 정하지 못했을 때만 쓰는 기본값(서울). 사용자 위치가 아님을 화면에 밝힌다.
export const DEFAULT_LOCATION = { latitude: 37.5665, longitude: 126.978, name: "서울" };

const MESSAGES = {
  ok: "브라우저 위치 정보로 가져온 내 현재 위치입니다.",
  pending: "내 현재 위치를 가져오는 중입니다. 브라우저의 위치 권한 요청을 허용해 주세요.",
  denied: "위치 권한이 거부되어 서울 좌표를 기본값으로 씁니다. 브라우저 주소창의 권한 설정에서 허용하면 내 위치를 쓸 수 있습니다.",
  unavailable: "이 브라우저에서 위치를 알 수 없어 서울 좌표를 기본값으로 씁니다.",
  timeout: "위치 확인이 오래 걸려 서울 좌표를 기본값으로 씁니다. 다시 시도할 수 있습니다.",
  idle: "",
};

// status: idle | pending | ok | denied | unavailable | timeout
export const userLocation = reactive({
  status: "idle",
  latitude: null,
  longitude: null,
  accuracy: null,
  updatedAt: null,
  message: "",
});

let inflight = null;

/** @returns {{latitude: number, longitude: number, isDefault: boolean, name: string}} 쓸 수 있는 좌표(없으면 서울 기본값) */
export function effectiveLocation() {
  if (userLocation.status === "ok" && Number.isFinite(userLocation.latitude)) {
    return { latitude: userLocation.latitude, longitude: userLocation.longitude, isDefault: false, name: "내 현재 위치" };
  }
  return { ...DEFAULT_LOCATION, isDefault: true };
}

function settle(status, position) {
  userLocation.status = status;
  userLocation.message = MESSAGES[status];
  if (position) {
    userLocation.latitude = position.coords.latitude;
    userLocation.longitude = position.coords.longitude;
    userLocation.accuracy = position.coords.accuracy;
    userLocation.updatedAt = Date.now();
  }
}

/**
 * 브라우저 위치 정보로 내 현재 위치를 가져온다. 이미 가져왔으면 다시 묻지 않는다(force로 다시 가져온다).
 * 거부·실패해도 예외 없이 상태만 바뀌고, 호출한 쪽은 effectiveLocation()으로 기본값을 쓴다.
 *
 * @param {{force?: boolean}} [options]
 * @returns {Promise<typeof userLocation>}
 */
export function requestUserLocation({ force = false } = {}) {
  if (!force && userLocation.status === "ok") return Promise.resolve(userLocation);
  if (inflight) return inflight;
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    settle("unavailable");
    return Promise.resolve(userLocation);
  }
  userLocation.status = "pending";
  userLocation.message = MESSAGES.pending;
  inflight = new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => { settle("ok", position); resolve(userLocation); },
      (error) => {
        settle(error.code === error.PERMISSION_DENIED ? "denied" : error.code === error.TIMEOUT ? "timeout" : "unavailable");
        resolve(userLocation);
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 5 * 60 * 1000 },
    );
  }).finally(() => { inflight = null; });
  return inflight;
}
