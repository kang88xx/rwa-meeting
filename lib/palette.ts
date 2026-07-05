import { NameColor } from "./types";

// 예약자 이름별 색상 팔레트 — 서로 구분이 잘 되는 16색 (구글 캘린더 계열).
// 새 이름이 등록되면 아직 사용되지 않은 색 중에서 랜덤으로 배정되고,
// 16명을 넘어서면 골든앵글 회전으로 색을 생성합니다 (pickColor 참고).
export const PALETTE: NameColor[] = [
  { border: "#1a73e8", bg: "#e8f0fe" }, // 파랑
  { border: "#d93025", bg: "#fce8e6" }, // 빨강
  { border: "#188038", bg: "#e6f4ea" }, // 초록
  { border: "#f9ab00", bg: "#fef7e0" }, // 노랑
  { border: "#a142f4", bg: "#f3e8fd" }, // 보라
  { border: "#12b5cb", bg: "#e0f7fa" }, // 청록
  { border: "#d01884", bg: "#fce8f3" }, // 분홍
  { border: "#fa7b17", bg: "#feefe3" }, // 주황
  { border: "#3949ab", bg: "#e8eaf6" }, // 남색
  { border: "#00897b", bg: "#e0f2f1" }, // 틸
  { border: "#e52592", bg: "#fde7f3" }, // 마젠타
  { border: "#7627bb", bg: "#f0e6fa" }, // 진보라
  { border: "#137333", bg: "#dcf3e4" }, // 진초록
  { border: "#e8710a", bg: "#fff3e0" }, // 진주황
  { border: "#129eaf", bg: "#dff7f9" }, // 시안
  { border: "#6d4c41", bg: "#efebe9" }, // 갈색
];

// 사용 중인 색을 피해 새 색상을 고릅니다.
// 1) 팔레트에 남은 색이 있으면 그중 랜덤 (서로 뚜렷이 구분됨)
// 2) 팔레트 소진 시 골든앵글(137.5°)로 색상환을 회전하며 생성 —
//    연속 배정끼리 최대한 멀어지므로 인원이 많아져도 완만하게 겹칩니다.
export function pickColor(used: NameColor[]): NameColor {
  const usedBorders = new Set(used.map((c) => c.border));
  const avail = PALETTE.filter((p) => !usedBorders.has(p.border));
  if (avail.length > 0) {
    return avail[Math.floor(Math.random() * avail.length)];
  }
  const h = Math.round((used.length * 137.508) % 360);
  return { border: `hsl(${h} 65% 40%)`, bg: `hsl(${h} 75% 93%)` };
}
