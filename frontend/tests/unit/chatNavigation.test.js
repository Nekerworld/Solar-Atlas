import { describe, expect, it } from "vitest";
import { createMentionFinder } from "../../src/api/chatNavigation";
const bodies=[{name:"Jupiter",displayName:"목성"},{name:"Saturn",displayName:"토성"},
 {name:"Moon",displayName:"달"},{name:"Sun",displayName:"태양"},{name:"Io",displayName:"이오"}];
const targets=bodies.map(body=>({frontend_name:body.name,name_ko:body.displayName,aliases:body.name==="Sun"?["해"]:[]}));
const find=createMentionFinder(bodies,targets);
describe("celestial message navigation",()=>{
 it("finds Korean particles and English aliases once, in message order",()=>{
   expect(find("목성과 토성을 비교해줘. Jupiter도 궁금해요.").map(body=>body.name)).toEqual(["Jupiter","Saturn"]);
 });
 it("does not link ambiguous syllables or unknown bodies",()=>{
   expect(find("한 달 동안 알아본 바이오 자료에 대해 알려줘. 미등록천체.")).toEqual([]);
   expect(find("달은 왜 태양을 가릴까?").map(body=>body.name)).toEqual(["Moon","Sun"]);
 });
 it("only exposes catalog entries that exist in the scene",()=>{
   const missing=createMentionFinder(bodies,[...targets,{frontend_name:"Unknown",name_ko:"없는천체",aliases:[]}]);
   expect(missing("없는천체와 목성").map(body=>body.name)).toEqual(["Jupiter"]);
 });
 it("treats punctuation in aliases as literal text",()=>{
   const match=createMentionFinder([{name:"X",displayName:"천체(A)"}],[{frontend_name:"X",name_ko:"천체(A)",aliases:[]}]);
   expect(match("천체(A)를 보여줘").map(body=>body.name)).toEqual(["X"]);
 });
});
