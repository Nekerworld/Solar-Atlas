// 지상 천구의 시간 속도 단계. 태양계 화면의 속도 슬라이더와 같은 모양(−/+ 버튼, 슬라이더, 상태 표시)을 쓰되,
// 실제 시각을 다루므로 "화면 1초에 흐르는 시간"으로 눈금을 둔다.
export const SKY_SPEEDS = [
  { label: "⏸", name: "일시정지", factor: 0 },
  { label: "실시간", name: "실시간", factor: 1 },
  { label: "1분/초", name: "1초에 1분", factor: 60 },
  { label: "10분/초", name: "1초에 10분", factor: 600 },
  { label: "1시간/초", name: "1초에 1시간", factor: 3600 },
  { label: "1일/초", name: "1초에 1일", factor: 86400 },
];

/** @returns {number} 단계 번호를 범위 안으로 맞춘 값 */
export function clampSpeedStep(value) {
  return Number.isInteger(value) ? Math.min(SKY_SPEEDS.length - 1, Math.max(0, value)) : 0;
}
