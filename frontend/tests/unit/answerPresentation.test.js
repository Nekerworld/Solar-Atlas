import { describe, expect, it } from "vitest";
import { presentAnswer } from "../../src/api/answerPresentation";

describe("Atlas response presentation", () => {
  it("uses natural server text without rebuilding diagnostic labels", () => {
    const result = presentAnswer({coverage:"partial", display_answer:"확인한 설명이에요. 나머지는 더 확인이 필요해요.",
      statements:[{text:"확인한 설명이에요."}], missing_information:["debug gap"], sources:[]});
    expect(result.answer).toBe("확인한 설명이에요. 나머지는 더 확인이 필요해요.");
    expect(result.answer).not.toContain("부족한 정보");
  });
  it("keeps conversational answers without a display field", () => {
    expect(presentAnswer({answer:"안녕하세요, 아틀라스예요.", statements:[], sources:[]}).answer)
      .toBe("안녕하세요, 아틀라스예요.");
  });
});

const source = (id, extra={}) => ({evidence_id:id, title:"목성", url:"https://ko.wikipedia.org/?curid=1", document_id:"kowiki:1", quote:`인용 ${id}`, section:id, ...extra});
describe("Numbered citations", () => {
  it("numbers in statement order, reuses IDs and excludes unused sources", () => {
    const result=presentAnswer({coverage:"sufficient",statements:[
      {text:"첫 설명",evidence_ids:["C8","C2","C8"]},
      {text:"둘째 설명",evidence_ids:["C2"]}],sources:[source("C2"),source("C8"),source("C9")]});
    expect(result.parts.filter(p=>p.citations.length).map(p=>p.citations.map(c=>c.number))).toEqual([[1,2],[2]]);
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].evidence.map(e=>[e.number,e.quote])).toEqual([[1,"인용 C8"],[2,"인용 C2"]]);
    expect(result.evidenceCount).toBe(2);
  });
  it("preserves partial answer endings without citing them", () => {
    const result=presentAnswer({display_answer:"설명\n\n아직 확인이 어려워요.",statements:[{text:"설명",evidence_ids:["C1"]}],sources:[source("C1")]});
    expect(result.parts).toEqual([{text:"설명",citations:[{evidenceId:"C1",number:1}]},{text:"\n\n아직 확인이 어려워요.",citations:[]}]);
  });
  it("never creates citations for unknown IDs or unsafe URLs", () => {
    const result=presentAnswer({coverage:"sufficient",statements:[{text:"설명",evidence_ids:["C1","C2"]}],sources:[source("C1",{url:"javascript:alert(1)"})]});
    expect(result.parts[0].citations).toEqual([]);
    expect(result.documents).toEqual([]);
    expect(result.noSources).toBe(true);
  });
  it("restores explicit legacy markers without guessing citations", () => {
    const result=presentAnswer({answer:"설명 [C8] 다시 [C8]",sources:[source("C8")]});
    expect(result.parts.flatMap(p=>p.citations.map(c=>c.number))).toEqual([1,1]);
    const old=presentAnswer({answer:"옛 설명",sources:[source("C8")]});
    expect(old.parts[0].citations).toEqual([]);
    expect(old.documents[0].evidence).toEqual([]);
  });
  it("does not infer a mapping when display text no longer matches statements", () => {
    const result=presentAnswer({display_answer:"다른 문장",statements:[{text:"원래 문장",evidence_ids:["C1"]}],sources:[source("C1")]});
    expect(result.parts[0].citations).toEqual([]);
  });
  it("restarts numbering per answer and keeps conversation free of source warnings", () => {
    for(let i=0;i<2;i++) expect(presentAnswer({coverage:"sufficient",statements:[{text:"설명",evidence_ids:["C8"]}],sources:[source("C8")]}).parts[0].citations[0].number).toBe(1);
    expect(presentAnswer({answer:"안녕하세요",response_mode:"conversation"}).noSources).toBe(false);
    expect(presentAnswer({answer:"어떤 뜻인가요?",needs_clarification:true}).noSources).toBe(false);
  });
});

describe("Discovery card presentation",()=>{
 it("numbers only grounded card sources and rejects duplicate/invalid cards",()=>{
  const result=presentAnswer({response_mode:"discovery",answer:"찾았어요",cards:[
   {item_id:"Q193",name:"토성",reason:"고리가 있어요",evidence_ids:["D0_M1"]},
   {item_id:"Q193",name:"중복",reason:"중복",evidence_ids:["D0_M1"]},
   {item_id:"Q2",name:"지구",reason:"근거 없음",evidence_ids:["missing"]}],
   sources:[source("D0_M1"),source("unused")]});
  expect(result.cards).toHaveLength(1);
  expect(result.cards[0].citations[0].number).toBe(1);
  expect(result.documents[0].evidence[0].number).toBe(1);
  expect(result.evidenceCount).toBe(1);
 });
 it("restores serialized cards and their evidence without a model call",()=>{
  const saved=JSON.parse(JSON.stringify({response_mode:"discovery",answer:"조건 결과",cards:[{item_id:"Q193",name:"토성",reason:"짧은 이유",evidence_ids:["D0_C1"]}],sources:[source("D0_C1")]}));
  expect(presentAnswer(saved).cards[0].itemId).toBe("Q193");
 });
});
