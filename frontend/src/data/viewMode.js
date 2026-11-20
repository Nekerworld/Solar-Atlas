import { reactive, ref } from "vue";

export const viewMode = ref("solar");
export const plannerContext = reactive({
  selectedTargetId: null,
  plan: null,
});

// 화면을 바꿀 때의 연출이 쓰는 정보: 어느 화면에서 어느 화면으로 가는지, 그 직전에 누른 자리(원형 연출이 거기서 열리고 닫힌다).
export const viewTransition = { id: 0, from: "", to: "", point: null };
let lastClick = null;
if (typeof window !== "undefined") {
  window.addEventListener("click", (event) => {
    const rect = event.target instanceof Element ? event.target.getBoundingClientRect() : null;
    // 키보드로 누르면 좌표가 0이므로 누른 요소의 가운데를 쓴다.
    const point = event.detail === 0 && rect
      ? { x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2) }
      : { x: event.clientX, y: event.clientY };
    lastClick = { ...point, at: performance.now() };
  }, true);
}

function setView(next) {
  const from = viewMode.value;
  viewTransition.id += 1;
  viewTransition.from = from === next ? "" : from;
  viewTransition.to = next;
  // 누른 직후의 전환만 그 자리를 쓴다(누르지 않고 일어난 전환은 화면 가운데에서).
  viewTransition.point = lastClick && performance.now() - lastClick.at < 1500 ? { x: lastClick.x, y: lastClick.y } : null;
  viewMode.value = next;
}

export function openPlanner(targetId) {
  if (targetId) plannerContext.selectedTargetId = targetId;
  setView("planner");
}

export function openGround(plan = null) {
  plannerContext.plan = plan;
  setView("ground");
}

export function openSolar() {
  setView("solar");
}
