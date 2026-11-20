import { describe, expect, it } from "vitest";
import { koName } from "../../sky/koNames.js";

describe("천구 이름표 한국어 변환", () => {
  it("별자리와 천체 이름을 한국어로 바꾼다", () => {
    expect(koName("Orion")).toBe("오리온자리");
    expect(koName("Canes Venatici")).toBe("사냥개자리");
    expect(koName("Serpens Caput")).toBe("뱀자리(머리)");
    expect(koName("mars")).toBe("화성");
    expect(koName("Sol")).toBe("태양");
  });

  it("고유 이름 별과 짝별 표기를 바꾼다", () => {
    expect(koName("Sirius")).toBe("시리우스");
    expect(koName("Rigel Kentaurus A")).toBe("리겔 켄타우루스 A");
  });

  it("별자리 안의 번호 이름을 한국어 별자리 이름으로 바꾼다", () => {
    expect(koName("TAU Phe\r")).toBe("봉황자리 τ");
    expect(koName("KAP1 Scl")).toBe("조각실자리 κ1");
    expect(koName("29 Psc")).toBe("물고기자리 29번");
    expect(koName("b UMa")).toBe("큰곰자리 b");
    expect(koName("Gliese 15")).toBe("글리제 15");
  });

  it("모르는 이름은 그대로 둔다", () => {
    expect(koName("HIP 33316")).toBe("HIP 33316");
    expect(koName("")).toBe("");
  });
});
