// 로컬 타임존 기준 날짜 유틸 (구글 캘린더 주간 뷰용)

export const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Date -> "YYYY-MM-DD" (로컬)
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "YYYY-MM-DD" -> Date (로컬 자정)
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}

// 해당 주의 일요일(주 시작) 반환
export function startOfWeek(d: Date): Date {
  const nd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  nd.setDate(nd.getDate() - nd.getDay());
  return nd;
}

export function weekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

export function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

// "HH:mm" -> 분
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// 분 -> "HH:mm"
export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${pad(h)}:${pad(m)}`;
}

export function formatMonthTitle(days: Date[]): string {
  const first = days[0];
  const last = days[days.length - 1];
  if (first.getMonth() === last.getMonth()) {
    return `${first.getFullYear()}년 ${first.getMonth() + 1}월`;
  }
  if (first.getFullYear() === last.getFullYear()) {
    return `${first.getFullYear()}년 ${first.getMonth() + 1}월 – ${last.getMonth() + 1}월`;
  }
  return `${first.getFullYear()}년 ${first.getMonth() + 1}월 – ${last.getFullYear()}년 ${last.getMonth() + 1}월`;
}
