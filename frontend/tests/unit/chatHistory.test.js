import { describe, expect, it } from "vitest";
import { parseHistory, mergeTurns } from "../../src/api/chatHistory";
const id="11111111-1111-4111-8111-111111111111";
describe("browser conversation index",()=>{
 it("rejects corrupt storage and invalid identifiers",()=>{
   expect(parseHistory("broken")).toEqual({entries:[],active:null});
   expect(parseHistory(JSON.stringify({active:"wrong",entries:[{key:"../other",title:"bad"}]}))).toEqual({entries:[],active:null});
 });
 it("retains a first request before a server conversation ID exists",()=>{
   const pending={payload:{request_id:id,conversation_id:null,question:"목성은?",item_id:"Q319"},createdAt:"2026-01-01"};
   const data=parseHistory(JSON.stringify({active:id,entries:[{key:id,title:"목성은?",pending}]}));
   expect(data.active).toBe(id);expect(data.entries[0].pending.payload.request_id).toBe(id);
 });
 it("merges newest-first server pages without duplicate request IDs",()=>{
   const old={key:"a",requestId:"a",createdAt:"2026-01-01",state:"error"};
   const updated={...old,state:"completed"};
   const newer={key:"b",requestId:"b",createdAt:"2026-01-02"};
   expect(mergeTurns([old],[newer,updated])).toEqual([updated,newer]);
 });
 it("orders server KST and browser UTC timestamps by the same instant",()=>{
   const old={key:"a",requestId:"a",createdAt:"2026-10-22T12:00:00+09:00"};
   const recent={key:"b",requestId:"b",createdAt:"2026-10-22T04:00:00Z"};
   expect(mergeTurns([old],[recent])).toEqual([old,recent]);
 });
 it("does not let an interrupted journal overwrite a recovered server answer",()=>{
   const completed={key:"a",requestId:"a",createdAt:"2026-01-01",state:"completed"};
   expect(mergeTurns([completed],[{...completed,state:"interrupted"}])).toEqual([completed]);
 });

});
