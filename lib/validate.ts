import { ROOM_MAP } from "./rooms";

// WeekView와 동일한 운영 시간/스냅 정책 (서버 측 검증용)
export const START_HOUR = 7;
export const END_HOUR = 22;
export const SNAP_MINUTES = 30;

export const MAX_TITLE = 100;
export const MAX_ORGANIZER = 30;
export const MAX_NOTE = 300;

export type ValidatedReservation = {
  roomId: string;
  title: string;
  organizer: string;
  date: string;
  start: string;
  end: string;
  note?: string;
};

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// "HH:mm"이 실제 존재하는 시각인지 확인 (예: 07:60, 25:00 거부)
function isRealTime(t: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(t)) return false;
  const [h, m] = t.split(":").map(Number);
  return h <= 23 && m <= 59;
}

// "YYYY-MM-DD"가 실제 존재하는 날짜인지 확인 (예: 2026-13-45 거부)
function isRealDate(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return (
    dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
  );
}

export function validateReservationBody(
  body: unknown
): { ok: true; value: ValidatedReservation } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "잘못된 요청입니다." };
  }
  const b = body as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const roomId = str(b.roomId);
  const title = str(b.title);
  const organizer = str(b.organizer);
  const date = str(b.date);
  const start = str(b.start);
  const end = str(b.end);
  const note = str(b.note);

  if (!organizer) return { ok: false, error: "예약자 이름을 입력하세요." };
  if (organizer.length > MAX_ORGANIZER)
    return { ok: false, error: `예약자 이름은 ${MAX_ORGANIZER}자 이내로 입력하세요.` };
  if (title.length > MAX_TITLE)
    return { ok: false, error: `제목은 ${MAX_TITLE}자 이내로 입력하세요.` };
  if (note.length > MAX_NOTE)
    return { ok: false, error: `메모는 ${MAX_NOTE}자 이내로 입력하세요.` };
  if (!ROOM_MAP[roomId]) return { ok: false, error: "회의실을 선택하세요." };
  if (!isRealDate(date))
    return { ok: false, error: "날짜 형식이 올바르지 않습니다." };
  if (!isRealTime(start) || !isRealTime(end))
    return { ok: false, error: "시간 형식이 올바르지 않습니다." };

  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s % SNAP_MINUTES !== 0 || e % SNAP_MINUTES !== 0)
    return { ok: false, error: `시간은 ${SNAP_MINUTES}분 단위로 선택하세요.` };
  if (s < START_HOUR * 60 || e > END_HOUR * 60)
    return {
      ok: false,
      error: `예약 가능 시간은 ${String(START_HOUR).padStart(2, "0")}:00~${END_HOUR}:00입니다.`,
    };
  if (e <= s)
    return { ok: false, error: "종료 시간은 시작 시간보다 늦어야 합니다." };

  return {
    ok: true,
    value: { roomId, title, organizer, date, start, end, note: note || undefined },
  };
}
