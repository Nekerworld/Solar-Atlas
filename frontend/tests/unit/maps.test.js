import { describe, expect, it } from "vitest";
import { embedDirectionsUrl, embedPlaceUrl, hasCoordinates, openMapsUrl, placeRef } from "../../src/planner/maps";

const plan = { place_name: "서울숲", place_id: "ChIJ-seoul", latitude: 37.5445, longitude: 127.0374 };

describe("planner maps", () => {
  it("장소 ID, 좌표, 이름 순으로 지도에서 장소를 가리킨다", () => {
    expect(placeRef(plan)).toBe("place_id:ChIJ-seoul");
    expect(placeRef({ ...plan, place_id: null })).toBe("37.5445,127.0374");
    expect(placeRef({ place_name: " 남산 " })).toBe("남산");
    expect(placeRef({})).toBe("");
  });

  it("좌표가 없을 때만 없다고 본다", () => {
    expect(hasCoordinates(plan)).toBe(true);
    expect(hasCoordinates({ latitude: null, longitude: 127 })).toBe(false);
    expect(hasCoordinates({ latitude: 0, longitude: 0 })).toBe(true);
  });

  it("키가 없으면 임베드 주소를 만들지 않는다", () => {
    expect(embedPlaceUrl(plan, "")).toBe("");
    expect(embedDirectionsUrl(plan, { latitude: 37.5, longitude: 127 }, "driving", "")).toBe("");
  });

  it("장소 임베드는 place 모드 주소다", () => {
    const url = new URL(embedPlaceUrl(plan, "KEY"));
    expect(url.pathname).toBe("/maps/embed/v1/place");
    expect(url.searchParams.get("q")).toBe("place_id:ChIJ-seoul");
    expect(url.searchParams.get("key")).toBe("KEY");
  });

  it("길찾기는 내 위치가 있어야 만들고, 없으면 기본값으로 대신하지 않는다", () => {
    expect(embedDirectionsUrl(plan, null, "driving", "KEY")).toBe("");
    expect(embedDirectionsUrl(plan, { latitude: null, longitude: null }, "driving", "KEY")).toBe("");
    const url = new URL(embedDirectionsUrl(plan, { latitude: 37.5, longitude: 127.1 }, "walking", "KEY"));
    expect(url.pathname).toBe("/maps/embed/v1/directions");
    expect(url.searchParams.get("origin")).toBe("37.5,127.1");
    expect(url.searchParams.get("destination")).toBe("place_id:ChIJ-seoul");
    expect(url.searchParams.get("mode")).toBe("walking");
  });

  it("모르는 이동 수단은 자동차로 본다", () => {
    const url = new URL(embedDirectionsUrl(plan, { latitude: 37.5, longitude: 127.1 }, "rocket", "KEY"));
    expect(url.searchParams.get("mode")).toBe("driving");
  });

  it("키 없는 구글 지도 링크를 만든다", () => {
    const url = new URL(openMapsUrl(plan));
    expect(url.searchParams.get("query")).toBe("37.5445,127.0374");
    expect(url.searchParams.get("query_place_id")).toBe("ChIJ-seoul");
    expect(openMapsUrl({})).toBe("");
  });
});
