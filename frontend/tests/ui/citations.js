import {createApp,h} from "vue";
import ChatTurn from "../../src/components/ChatTurn.vue";
import {presentAnswer} from "../../src/api/answerPresentation";
const data={coverage:"partial",display_answer:"목성에 대한 첫 설명이에요.\n\n목성에 대한 두 번째 설명이에요.\n\n나머지는 더 확인이 필요해요.",
statements:[{text:"목성에 대한 첫 설명이에요.",evidence_ids:["C8"]},{text:"목성에 대한 두 번째 설명이에요.",evidence_ids:["C2","C8"]}],
sources:[{evidence_id:"C2",url:"https://ko.wikipedia.org/?curid=1",document_id:"kowiki:1",title:"목성",section:"대기",quote:"두 번째 실제 근거"},
{evidence_id:"C8",url:"https://ko.wikipedia.org/?curid=1",document_id:"kowiki:1",title:"목성",section:"질량",quote:"첫 번째 실제 근거"}]};
const row={state:"completed",question:"목성을 알려줘",interims:[{kind:"ack",message:"목성을 알아보고 있어요."}],answer:{...presentAnswer(data),warnings:[]}};
createApp({render:()=>h(ChatTurn,{row,findMentions:()=>[]})}).mount("#app");
