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

// 색상 문자열(#rrggbb 또는 hsl(...))을 oklch 색조(hue, 0~360도)로 변환.
// 이벤트 블록 듀오톤 스타일의 --h 값으로 사용됩니다.
// oklch의 hue는 HSL hue와 다르므로 sRGB → OKLab 변환을 거칩니다.
const hueCache = new Map<string, number>();

function parseRgb(color: string): [number, number, number] | null {
  let m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  m = /^hsl\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*\)$/i.exec(color.trim());
  if (m) {
    const h = parseFloat(m[1]) / 30;
    const s = parseFloat(m[2]) / 100;
    const l = parseFloat(m[3]) / 100;
    const f = (n: number) => {
      const k = (n + h) % 12;
      const a = s * Math.min(l, 1 - l);
      return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
    };
    return [f(0), f(8), f(4)];
  }
  return null;
}

export function oklchHue(color: string): number {
  const cached = hueCache.get(color);
  if (cached !== undefined) return cached;
  const [r, g, b] = (parseRgb(color) ?? [95, 99, 104]).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const hue = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  hueCache.set(color, hue);
  return hue;
}

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
