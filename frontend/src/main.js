import { createApp } from "vue";
import App from "./App.vue";
import { openSolar } from "./data/viewMode";
import "./style.css";

// 새로고침은 항상 로딩 화면을 거쳐 태양계로 들어간다. 뒤로 가기 캐시가 플래너·천구를 그대로 살리면 그 상태를 버리고 다시 연다.
openSolar();
window.addEventListener("pageshow", (event) => {
  if (event.persisted) window.location.reload();
});

createApp(App).mount("#root");
